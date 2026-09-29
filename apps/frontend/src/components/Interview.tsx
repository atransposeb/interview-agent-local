import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { GeminiLiveAPI, type FunctionCall } from "@/lib/geminiLive";
import { AudioStreamer, AudioPlayer } from "@/lib/audioUtils";
import { ApiError, createSession, saveMessages } from "@/lib/api";
import { appendChunk, closeOpenEntry, createTranscript, type TranscriptEntry, type TranscriptUpdate } from "@/lib/transcript";
import { Button } from "@/components/ui/button";

// The prompt and the end_interview tool are locked into the session token by
// the backend; the browser starts the conversation and keeps time.
const KICKOFF_TEXT = "Hello, I'm ready to begin the interview.";
const TIME_UP_TEXT = "The time is up.";
const END_INTERVIEW_TOOL = "end_interview";
// After end_interview the model usually speaks its goodbye in one more turn.
const GOODBYE_TIMEOUT_MS = 8_000;
// How long the interviewer gets to wrap up once the clock hits zero.
const WRAP_UP_GRACE_MS = 30_000;

function formatClock(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toMessages(entries: TranscriptEntry[]) {
    return entries.filter((entry) => entry.final).map(({ seq, role, text }) => ({ seq, role, text }));
}

export function Interview() {
    const navigate = useNavigate();
    const { interviewId } = useParams<{ interviewId: string }>();
    const [status, setStatus] = useState("Connecting...");
    const [connected, setConnected] = useState(false);
    const [entries, setEntries] = useState<TranscriptEntry[]>([]);
    const [micActive, setMicActive] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [finishing, setFinishing] = useState(false);

    const clientRef = useRef<GeminiLiveAPI | null>(null);
    const audioStreamerRef = useRef<AudioStreamer | null>(null);
    const audioPlayerRef = useRef<AudioPlayer | null>(null);
    const transcriptRef = useRef(createTranscript());
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const endRequestedRef = useRef(false);
    // First transcript seq after the clock ran out: the wrap-up turn.
    const wrapUpFromSeqRef = useRef<number | null>(null);
    const finishingRef = useRef(false);
    // False once the page unmounts, so pending timers can't navigate away later.
    const activeRef = useRef(false);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [entries]);

    function stopMicStream() {
        // .stop() alone doesn't reliably release the mic track / AudioContext
        // node on repeated toggles — always fully tear it down and drop the ref.
        audioStreamerRef.current?.stop();
        audioStreamerRef.current?.destroy();
        audioStreamerRef.current = null;
        setMicActive(false);
    }

    function stopTimer() {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
    }

    function applyTranscript(update: TranscriptUpdate) {
        transcriptRef.current = update.transcript;
        setEntries(update.transcript.entries);
        if (interviewId && update.closed.length) {
            // Saved turn by turn so a closed tab keeps what was said. A failed
            // save is fine: finishInterview re-sends the whole transcript.
            saveMessages(interviewId, toMessages(update.closed)).catch(() => {});
        }
    }

    async function finishInterview({ waitForAudio }: { waitForAudio: boolean }) {
        if (!activeRef.current || finishingRef.current || !interviewId) return;
        finishingRef.current = true;
        setFinishing(true);
        setStatus("Saving your interview...");
        stopTimer();
        stopMicStream();

        if (waitForAudio) {
            await audioPlayerRef.current?.drain();
        } else {
            audioPlayerRef.current?.interrupt();
        }
        clientRef.current?.disconnect();

        const { transcript } = closeOpenEntry(transcriptRef.current);
        transcriptRef.current = transcript;
        setEntries(transcript.entries);

        const messages = toMessages(transcript.entries);
        if (messages.length) {
            try {
                await saveMessages(interviewId, messages);
            } catch {
                toast("Part of the transcript couldn't be saved, so your report may be incomplete.");
            }
        }
        navigate(`/result/${interviewId}`);
    }

    function startTimer(client: GeminiLiveAPI, durationSeconds: number) {
        const deadline = Date.now() + durationSeconds * 1000;
        setSecondsLeft(durationSeconds);
        timerRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setSecondsLeft(remaining);
            if (remaining === 0) {
                stopTimer();
                // The interviewer's next turn is the wrap-up; TURN_COMPLETE ends
                // the interview after it. The timeout is the backstop.
                wrapUpFromSeqRef.current = transcriptRef.current.nextSeq;
                client.sendRealtimeText(TIME_UP_TEXT);
                setTimeout(() => finishInterview({ waitForAudio: false }), WRAP_UP_GRACE_MS);
            }
        }, 1000);
    }

    function handleToolCall(client: GeminiLiveAPI, calls: FunctionCall[]) {
        const endCalls = calls.filter((call) => call.name === END_INTERVIEW_TOOL);
        const otherCalls = calls.filter((call) => call.name !== END_INTERVIEW_TOOL);
        if (otherCalls.length) {
            client.sendToolResponse(otherCalls, { error: "Unknown tool" });
        }
        if (endCalls.length && !endRequestedRef.current) {
            client.sendToolResponse(endCalls, { result: "ok" });
            // The goodbye turn follows; TURN_COMPLETE finishes, or this timeout does.
            endRequestedRef.current = true;
            setTimeout(() => finishInterview({ waitForAudio: true }), GOODBYE_TIMEOUT_MS);
        }
    }

    useEffect(() => {
        let cancelled = false;
        activeRef.current = true;

        async function init() {
            try {
                if (!interviewId) {
                    navigate("/");
                    return;
                }

                const session = await createSession(interviewId);

                if (cancelled) return;

                transcriptRef.current = createTranscript(session.nextSeq);
                const client = new GeminiLiveAPI({ token: session.token, model: session.model });

                const player = new AudioPlayer();
                await player.init();

                if (cancelled) {
                    client.disconnect();
                    player.destroy();
                    return;
                }

                client.onOpen = () => {
                    setConnected(true);
                    setStatus("Connected");
                    client.sendRealtimeText(KICKOFF_TEXT);
                    startTimer(client, session.durationSeconds);
                };

                client.onReceiveResponse = (message) => {
                    switch (message.type) {
                        // Transcript of what Gemini is saying (from
                        // outputAudioTranscription). Chunks stream in and
                        // accumulate onto the open interviewer entry.
                        case "OUTPUT_TRANSCRIPTION":
                            applyTranscript(appendChunk(transcriptRef.current, "assistant", message.data));
                            break;

                        // Transcript of what the user said (from
                        // inputAudioTranscription).
                        case "INPUT_TRANSCRIPTION":
                            applyTranscript(appendChunk(transcriptRef.current, "user", message.data));
                            break;

                        case "AUDIO":
                            player.play(message.data);
                            break;

                        case "INTERRUPTED":
                            player.interrupt();
                            applyTranscript(closeOpenEntry(transcriptRef.current, "assistant"));
                            break;

                        case "TOOL_CALL":
                            handleToolCall(client, message.data);
                            break;

                        case "TURN_COMPLETE": {
                            // The interviewer's turn is done; the candidate's
                            // entry closes when the interviewer next speaks.
                            const update = closeOpenEntry(transcriptRef.current, "assistant");
                            applyTranscript(update);
                            // The model doesn't always call end_interview after
                            // its goodbye, so a turn started after time ran out
                            // also ends the interview.
                            const wrapUpFrom = wrapUpFromSeqRef.current;
                            const wrappedUp = wrapUpFrom !== null && update.closed.some((entry) => entry.seq >= wrapUpFrom);
                            if (endRequestedRef.current || wrappedUp) finishInterview({ waitForAudio: true });
                            break;
                        }

                        // TEXT can't arrive with responseModalities: ["AUDIO"],
                        // and SETUP_COMPLETE is handled by onOpen.
                    }
                };

                client.onClose = () => {
                    setConnected(false);
                    stopMicStream();
                    if (!finishingRef.current) setStatus("Disconnected");
                };

                client.onError = (err) => {
                    setConnected(false);
                    setStatus(`Error: ${err}`);
                    stopMicStream();
                };

                client.connect();

                clientRef.current = client;
                audioPlayerRef.current = player;
            } catch (err) {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 409) {
                    navigate(`/result/${interviewId}`, { replace: true });
                    return;
                }
                setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        init();

        return () => {
            cancelled = true;
            activeRef.current = false;
            stopTimer();
            stopMicStream();
            audioPlayerRef.current?.destroy();
            clientRef.current?.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId, navigate]);

    async function toggleMic() {
        if (micActive) {
            stopMicStream();
            return;
        }
        if (!clientRef.current) return;

        const streamer = new AudioStreamer(clientRef.current);
        await streamer.start();
        audioStreamerRef.current = streamer;
        setMicActive(true);
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-background p-6">
            <div className="max-w-2xl mx-auto w-full flex flex-col h-full gap-4">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="font-heading text-2xl font-semibold text-foreground">Interview</h1>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{status}</span>
                        {secondsLeft !== null && (
                            <span
                                aria-label="Time remaining"
                                className={`rounded-full border px-3 py-1 text-sm font-semibold tabular-nums ${
                                    secondsLeft <= 30 ? "border-terracotta text-terracotta" : "border-stone text-foreground"
                                }`}
                            >
                                {formatClock(secondsLeft)}
                            </span>
                        )}
                    </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto border border-border rounded-lg p-4 space-y-3 bg-card">
                    {entries.length === 0 && (
                        <p className="text-muted-foreground text-sm text-center mt-10">
                            The interviewer will greet you in a moment...
                        </p>
                    )}
                    {entries.map((entry) => (
                        <div
                            key={entry.seq}
                            className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                                    entry.role === "user"
                                        ? "bg-forest text-white"
                                        : "bg-secondary text-foreground"
                                }`}
                            >
                                {entry.text}
                            </div>
                        </div>
                    ))}
                </div>

                {connected && !micActive && !finishing && (
                    <p className="text-center text-xs text-muted-foreground">Turn on your mic to answer out loud.</p>
                )}

                <div className="flex gap-3 justify-center pb-4">
                    <Button
                        onClick={toggleMic}
                        disabled={!connected || finishing}
                        className={`rounded-full px-8 ${
                            micActive
                                ? "bg-terracotta hover:bg-terracotta/80"
                                : "bg-forest hover:bg-forest/80"
                        } text-white`}
                    >
                        {micActive ? "Stop Mic" : "Start Mic"}
                    </Button>
                    <Button
                        onClick={() => finishInterview({ waitForAudio: false })}
                        disabled={finishing}
                        variant="outline"
                        className="rounded-full px-8"
                    >
                        {finishing ? "Saving..." : "End interview"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default Interview;
