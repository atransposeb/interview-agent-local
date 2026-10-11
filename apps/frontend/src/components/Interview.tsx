import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AudioLines, LoaderCircle, MessageSquareText, Mic, MicOff, PhoneOff, RotateCcw, UserRound } from "lucide-react";
import { GeminiLiveAPI, type FunctionCall } from "@/lib/geminiLive";
import { AudioStreamer, AudioPlayer } from "@/lib/audioUtils";
import { ApiError, createSession, saveMessages } from "@/lib/api";
import { appendChunk, closeOpenEntry, createTranscript, type TranscriptEntry, type TranscriptUpdate } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import { ApiKeyField } from "@/components/ApiKeyField";
import { Backdrop } from "@/components/site/Backdrop";
import { Wordmark } from "@/components/site/Wordmark";
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
// The clock turns terracotta for the final stretch.
const LOW_TIME_SECONDS = 30;
// How long "End interview" waits for its confirming second click.
const CONFIRM_END_MS = 4_000;

type Phase = "connecting" | "live" | "disconnected" | "error" | "finishing";

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
    const [phase, setPhase] = useState<Phase>("connecting");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [needsKey, setNeedsKey] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [entries, setEntries] = useState<TranscriptEntry[]>([]);
    const [micActive, setMicActive] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
    const [confirmEnd, setConfirmEnd] = useState(false);

    const clientRef = useRef<GeminiLiveAPI | null>(null);
    const audioStreamerRef = useRef<AudioStreamer | null>(null);
    const audioPlayerRef = useRef<AudioPlayer | null>(null);
    const transcriptRef = useRef(createTranscript());
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const levelRef = useRef<HTMLButtonElement | null>(null);
    const endRequestedRef = useRef(false);
    // First transcript seq after the clock ran out: the wrap-up turn.
    const wrapUpFromSeqRef = useRef<number | null>(null);
    const finishingRef = useRef(false);
    const startingMicRef = useRef(false);
    // False once the page unmounts, so pending timers can't navigate away later.
    const activeRef = useRef(false);

    const connected = phase === "live";
    const finishing = phase === "finishing";
    const lastEntry = entries.at(-1);
    // The speaker whose turn is still streaming in, if any.
    const speaker = lastEntry && !lastEntry.final ? lastEntry.role : null;

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [entries]);

    useEffect(() => {
        if (!confirmEnd) return;
        const timeout = setTimeout(() => setConfirmEnd(false), CONFIRM_END_MS);
        return () => clearTimeout(timeout);
    }, [confirmEnd]);

    function stopMicStream() {
        // .stop() alone doesn't reliably release the mic track / AudioContext
        // node on repeated toggles — always fully tear it down and drop the ref.
        audioStreamerRef.current?.stop();
        audioStreamerRef.current?.destroy();
        audioStreamerRef.current = null;
        levelRef.current?.style.setProperty("--level", "0");
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
        setPhase("finishing");
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
        setTotalSeconds(durationSeconds);
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

    function fail(message: string) {
        if (finishingRef.current) return;
        setPhase("error");
        setErrorMessage(message);
    }

    useEffect(() => {
        let cancelled = false;
        activeRef.current = true;
        endRequestedRef.current = false;
        wrapUpFromSeqRef.current = null;

        async function init() {
            try {
                if (!interviewId) {
                    navigate("/");
                    return;
                }

                const session = await createSession(interviewId);

                if (cancelled) return;

                // A reconnect keeps what was already said, on screen and in the
                // final save, and numbers new turns after both copies.
                const previous = closeOpenEntry(transcriptRef.current).transcript;
                transcriptRef.current = {
                    entries: previous.entries,
                    nextSeq: Math.max(session.nextSeq, previous.nextSeq),
                };
                setEntries(previous.entries);
                const client = new GeminiLiveAPI({ token: session.token, model: session.model });

                const player = new AudioPlayer();
                await player.init();

                if (cancelled) {
                    client.disconnect();
                    player.destroy();
                    return;
                }

                client.onOpen = () => {
                    setPhase("live");
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
                    stopMicStream();
                    stopTimer();
                    // An error usually closes the socket too; keep the error on screen.
                    if (!finishingRef.current) setPhase((current) => (current === "error" ? current : "disconnected"));
                };

                client.onError = (err) => {
                    stopMicStream();
                    fail(String(err));
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
                setNeedsKey(err instanceof ApiError && err.status === 401);
                fail(err instanceof Error ? err.message : String(err));
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
    }, [interviewId, navigate, attempt]);

    function retry() {
        setPhase("connecting");
        setErrorMessage(null);
        setNeedsKey(false);
        setSecondsLeft(null);
        setAttempt((n) => n + 1);
    }

    async function toggleMic() {
        if (micActive) {
            stopMicStream();
            return;
        }
        if (!clientRef.current || !connected || startingMicRef.current) return;

        const streamer = new AudioStreamer(clientRef.current);
        // Drives the ring around the mic button without re-rendering.
        streamer.onLevel = (level) => levelRef.current?.style.setProperty("--level", Math.min(1, level * 6).toFixed(3));
        startingMicRef.current = true;
        try {
            await streamer.start();
            audioStreamerRef.current = streamer;
            setMicActive(true);
        } catch {
            streamer.destroy();
            toast("Couldn't use your microphone. Allow access in your browser's address bar, then try again.");
        } finally {
            startingMicRef.current = false;
        }
    }

    // M toggles the mic from anywhere on the page.
    const toggleMicRef = useRef(toggleMic);
    toggleMicRef.current = toggleMic;
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key.toLowerCase() !== "m" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")) return;
            toggleMicRef.current();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    function onEndClick() {
        if (!confirmEnd) {
            setConfirmEnd(true);
            return;
        }
        setConfirmEnd(false);
        finishInterview({ waitForAudio: false });
    }

    const lowTime = secondsLeft !== null && secondsLeft <= LOW_TIME_SECONDS;
    const remainingPercent = secondsLeft !== null && totalSeconds ? (secondsLeft / totalSeconds) * 100 : 100;
    const stage = needsKey
        ? { title: "Add your Gemini key", detail: "The interview runs on your own Gemini API key." }
        : describeStage(phase, speaker, micActive);

    return (
        <div className="relative isolate flex h-dvh w-full flex-col overflow-hidden">
            <Backdrop />

            <header className="border-b border-stone/70 bg-warm/80 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
                    <div className="flex items-center gap-4">
                        <Wordmark className="hidden sm:inline-flex" />
                        <StatusPill phase={phase} />
                    </div>
                    <div className="flex items-center gap-2">
                        {secondsLeft !== null && (
                            <span
                                aria-label={`Time remaining ${formatClock(secondsLeft)}`}
                                className={cn(
                                    "rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums",
                                    lowTime ? "border-terracotta bg-terracotta/10 text-terracotta-ink" : "border-stone bg-white/70 text-forest",
                                )}
                            >
                                {formatClock(secondsLeft)}
                            </span>
                        )}
                        <Button
                            onClick={onEndClick}
                            disabled={finishing}
                            variant="outline"
                            className={cn(
                                "h-9 rounded-full px-4",
                                confirmEnd
                                    ? "border-terracotta-deep bg-terracotta-deep text-white hover:bg-terracotta-ink hover:text-white"
                                    : "bg-white/70",
                            )}
                        >
                            <PhoneOff />
                            {confirmEnd ? "Tap again to end" : "End interview"}
                        </Button>
                    </div>
                </div>
            </header>

            <main className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-1">
                <section
                    aria-label="Interview controls"
                    className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-[2rem] bg-forest px-6 pb-8 pt-11 text-center text-white shadow-2xl shadow-forest/20 lg:gap-8"
                >
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(58,123,191,0.28),transparent_60%)]"
                    />
                    {secondsLeft !== null && (
                        <div aria-hidden="true" className="absolute inset-x-8 top-5 h-1 overflow-hidden rounded-full bg-white/10">
                            <div
                                className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", lowTime ? "bg-terracotta" : "bg-butter")}
                                style={{ width: `${remainingPercent}%` }}
                            />
                        </div>
                    )}

                    <Orb phase={phase} speaking={speaker === "assistant"} />

                    <div className="relative" aria-live="polite">
                        <p className="font-heading text-2xl font-semibold sm:text-3xl">{stage.title}</p>
                        <p className="mt-1.5 text-sm text-sage-light">{stage.detail}</p>
                    </div>

                    {phase === "error" || phase === "disconnected" ? (
                        <div className="relative w-full max-w-md space-y-4">
                            {phase === "error" && errorMessage && !needsKey && (
                                <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-sage-light">{errorMessage}</p>
                            )}
                            {needsKey ? (
                                <div className="rounded-2xl bg-white p-4 text-left text-forest">
                                    <ApiKeyField onKeyChange={(hasKey) => hasKey && retry()} />
                                </div>
                            ) : (
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button onClick={retry} className="h-11 rounded-full bg-white px-5 text-forest hover:bg-warm">
                                        <RotateCcw /> Reconnect
                                    </Button>
                                    {entries.length > 0 ? (
                                        <Button
                                            onClick={() => finishInterview({ waitForAudio: false })}
                                            variant="outline"
                                            className="h-11 rounded-full border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"
                                        >
                                            Finish and see report
                                        </Button>
                                    ) : (
                                        <Button
                                            asChild
                                            variant="outline"
                                            className="h-11 rounded-full border-white/30 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"
                                        >
                                            <Link to="/">Back to setup</Link>
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            ref={levelRef}
                            type="button"
                            onClick={toggleMic}
                            disabled={!connected}
                            title="Shortcut: M"
                            aria-keyshortcuts="M"
                            className={cn(
                                "relative inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-sm font-semibold outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-4 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40",
                                micActive ? "bg-terracotta-deep text-white" : "bg-white text-forest hover:bg-warm",
                            )}
                            // The ring grows with the microphone level while it's on.
                            style={micActive ? { boxShadow: "0 0 0 calc(var(--level, 0) * 14px) rgba(194, 123, 102, 0.4)" } : undefined}
                        >
                            {micActive ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
                            {micActive ? "Mute" : "Turn on mic"}
                        </button>
                    )}
                </section>

                <section
                    aria-label="Transcript"
                    className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-stone bg-white/90 shadow-xl shadow-forest/5 backdrop-blur"
                >
                    <div className="flex items-center justify-between border-b border-stone px-5 py-4 sm:px-6">
                        <p className="flex items-center gap-2 font-semibold text-forest">
                            <MessageSquareText className="size-4 text-moss" aria-hidden="true" /> Live transcript
                        </p>
                        <p className="text-xs text-moss">
                            {entries.length} {entries.length === 1 ? "turn" : "turns"} · saved as you go
                        </p>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                        {entries.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                <span className="grid size-14 place-items-center rounded-2xl bg-mist text-lake-ink">
                                    {phase === "connecting" ? (
                                        <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <MessageSquareText className="size-6" aria-hidden="true" />
                                    )}
                                </span>
                                <p className="font-heading text-xl font-semibold text-forest">
                                    {phase === "connecting"
                                        ? "Connecting to your interviewer"
                                        : phase === "live"
                                          ? "The interviewer will greet you in a moment"
                                          : "No conversation yet"}
                                </p>
                                <p className="max-w-xs text-sm leading-relaxed text-moss">
                                    Everything you and the interviewer say appears here as you talk, and is saved for your report.
                                </p>
                            </div>
                        ) : (
                            <ol className="space-y-5">
                                {entries.map((entry) => (
                                    <TranscriptBubble key={entry.seq} entry={entry} />
                                ))}
                            </ol>
                        )}
                    </div>

                </section>
            </main>

            {finishing && (
                <div role="status" className="fixed inset-0 z-40 grid place-items-center bg-warm/85 backdrop-blur-md animate-in fade-in">
                    <div className="flex flex-col items-center gap-4 px-6 text-center">
                        <span className="grid size-16 place-items-center rounded-full bg-forest text-white shadow-xl shadow-forest/20">
                            <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
                        </span>
                        <p className="font-heading text-3xl font-semibold text-forest">Saving your interview</p>
                        <p className="text-moss">Your report is next.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function describeStage(phase: Phase, speaker: TranscriptEntry["role"] | null, micActive: boolean) {
    switch (phase) {
        case "connecting":
            return { title: "Connecting", detail: "Getting your interviewer ready." };
        case "finishing":
            return { title: "Wrapping up", detail: "Saving your interview." };
        case "disconnected":
            return { title: "Disconnected", detail: "Your answers so far are saved." };
        case "error":
            return { title: "Something went wrong", detail: "The interview couldn't continue." };
    }
    if (speaker === "assistant") return { title: "Interviewer speaking", detail: "Listen, then answer out loud." };
    if (micActive) return { title: "Listening", detail: "Answer out loud. Take your time." };
    return { title: "Your mic is off", detail: "Turn it on when you're ready to answer." };
}

function StatusPill({ phase }: { phase: Phase }) {
    const styles: Record<Phase, { label: string; className: string; dot: string }> = {
        connecting: { label: "Connecting", className: "bg-sand text-moss", dot: "bg-sage animate-pulse" },
        live: { label: "Live", className: "bg-terracotta/12 text-terracotta-ink", dot: "bg-terracotta animate-pulse" },
        finishing: { label: "Saving", className: "bg-sand text-moss", dot: "bg-sage animate-pulse" },
        disconnected: { label: "Disconnected", className: "bg-sand text-moss", dot: "bg-moss" },
        error: { label: "Error", className: "bg-terracotta/12 text-terracotta-ink", dot: "bg-terracotta-deep" },
    };
    const { label, className, dot } = styles[phase];
    return (
        <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", className)}>
            <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
            {label}
        </span>
    );
}

function Orb({ phase, speaking }: { phase: Phase; speaking: boolean }) {
    const bars = [0.45, 0.8, 1, 0.7, 0.5];
    return (
        <div aria-hidden="true" className="relative grid size-20 shrink-0 place-items-center sm:size-24 lg:size-28">
            {speaking && (
                <>
                    <span className="absolute inset-0 animate-ripple rounded-full bg-lake/40" />
                    <span className="absolute inset-0 animate-ripple rounded-full bg-sage/40 [animation-delay:1.2s]" />
                </>
            )}
            <span
                className={cn(
                    "relative grid size-full place-items-center rounded-full bg-gradient-to-br from-sage to-lake shadow-[0_12px_40px_-12px_rgba(58,123,191,0.7)] transition-transform duration-500",
                    speaking && "scale-105",
                    (phase === "error" || phase === "disconnected") && "opacity-40 grayscale",
                )}
            >
                {phase === "connecting" ? (
                    <LoaderCircle className="size-7 animate-spin" />
                ) : speaking ? (
                    <span className="flex h-7 items-center gap-1">
                        {bars.map((height, index) => (
                            <span
                                key={index}
                                className="w-1 origin-center animate-wave rounded-full bg-white"
                                style={{ height: `${height * 100}%`, animationDelay: `${index * 110}ms` }}
                            />
                        ))}
                    </span>
                ) : (
                    <AudioLines className="size-7" />
                )}
            </span>
        </div>
    );
}

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
    const isUser = entry.role === "user";
    return (
        <li className={cn("flex gap-3 animate-in fade-in slide-in-from-bottom-1", isUser && "flex-row-reverse")}>
            <span
                aria-hidden="true"
                className={cn(
                    "mt-5 grid size-8 shrink-0 place-items-center rounded-full",
                    isUser ? "bg-butter text-ochre-ink" : "bg-lake-ink text-white",
                )}
            >
                {isUser ? <UserRound className="size-4" /> : <AudioLines className="size-4" />}
            </span>
            <div className={cn("flex max-w-[80%] flex-col gap-1", isUser && "items-end")}>
                <p className="px-1 text-xs font-semibold text-moss">{isUser ? "You" : "Interviewer"}</p>
                <div
                    className={cn(
                        "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                        isUser ? "rounded-tr-md bg-forest text-white" : "rounded-tl-md bg-mist text-forest",
                    )}
                >
                    {entry.text}
                    {!entry.final && (
                        <span
                            aria-hidden="true"
                            className={cn("ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-blink", isUser ? "bg-white" : "bg-forest")}
                        />
                    )}
                </div>
            </div>
        </li>
    );
}

export default Interview;
