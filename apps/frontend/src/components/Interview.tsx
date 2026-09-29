import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GeminiLiveAPI, type FunctionCall } from "@/lib/geminiLive";
import { AudioStreamer, AudioPlayer } from "@/lib/audioUtils";
import { ApiError, createSession } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface ChatMessage {
    role: "user" | "gemini";
    text: string;
}

// The prompt and the end_interview tool are locked into the session token by
// the backend; the browser only starts the conversation.
const KICKOFF_TEXT = "Hello, I'm ready to begin the interview.";
const END_INTERVIEW_TOOL = "end_interview";
// After end_interview the model usually speaks its goodbye in one more turn.
const GOODBYE_TIMEOUT_MS = 8_000;

export function Interview() {
    const navigate = useNavigate();
    const { interviewId } = useParams<{ interviewId: string }>();
    const [status, setStatus] = useState("Connecting...");
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [micActive, setMicActive] = useState(false);

    const clientRef = useRef<GeminiLiveAPI | null>(null);
    const audioStreamerRef = useRef<AudioStreamer | null>(null);
    const audioPlayerRef = useRef<AudioPlayer | null>(null);
    const endRequestedRef = useRef(false);
    const endedRef = useRef(false);

    // Live copies of text being streamed in, so we can append transcript
    // chunks onto the same bubble instead of creating a new one per chunk.
    const partialGeminiRef = useRef<string>("");
    const partialUserRef = useRef<string>("");

    function stopMicStream() {
        // .stop() alone doesn't reliably release the mic track / AudioContext
        // node on repeated toggles — always fully tear it down and drop the ref.
        audioStreamerRef.current?.stop();
        audioStreamerRef.current?.destroy();
        audioStreamerRef.current = null;
        setMicActive(false);
    }

    // Let the interviewer's last words finish playing before hanging up.
    async function endSession() {
        if (endedRef.current) return;
        endedRef.current = true;
        stopMicStream();
        await audioPlayerRef.current?.drain();
        clientRef.current?.disconnect();
        setConnected(false);
        setStatus("Interview complete");
    }

    function handleToolCall(client: GeminiLiveAPI, calls: FunctionCall[]) {
        const endCalls = calls.filter((call) => call.name === END_INTERVIEW_TOOL);
        const otherCalls = calls.filter((call) => call.name !== END_INTERVIEW_TOOL);
        if (otherCalls.length) {
            client.sendToolResponse(otherCalls, { error: "Unknown tool" });
        }
        if (endCalls.length && !endRequestedRef.current) {
            client.sendToolResponse(endCalls, { result: "ok" });
            endRequestedRef.current = true;
            setTimeout(endSession, GOODBYE_TIMEOUT_MS);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                if (!interviewId) {
                    navigate("/");
                    return;
                }

                const session = await createSession(interviewId);

                if (cancelled) return;

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
                };

                client.onReceiveResponse = (message) => {
                    switch (message.type) {
                        // Transcript of what Gemini is saying (from
                        // outputAudioTranscription). Chunks stream in, so we
                        // accumulate onto the last "gemini" bubble.
                        case "OUTPUT_TRANSCRIPTION":
                            partialGeminiRef.current += message.data;
                            setMessages((prev) => {
                                const next = [...prev];
                                const last = next[next.length - 1];
                                if (last?.role === "gemini") {
                                    next[next.length - 1] = { ...last, text: partialGeminiRef.current };
                                } else {
                                    next.push({ role: "gemini", text: partialGeminiRef.current });
                                }
                                return next;
                            });
                            break;

                        // Transcript of what the user said (from
                        // inputAudioTranscription).
                        case "INPUT_TRANSCRIPTION":
                            partialUserRef.current += message.data;
                            setMessages((prev) => {
                                const next = [...prev];
                                const last = next[next.length - 1];
                                if (last?.role === "user") {
                                    next[next.length - 1] = { ...last, text: partialUserRef.current };
                                } else {
                                    next.push({ role: "user", text: partialUserRef.current });
                                }
                                return next;
                            });
                            break;

                        // Kept for compatibility in case the wrapper ever
                        // surfaces a plain TEXT modality response, but with
                        // responseModalities: ["AUDIO"] this should not fire.
                        case "TEXT":
                            setMessages((prev) => [...prev, { role: "gemini", text: message.data }]);
                            break;

                        case "AUDIO":
                            player.play(message.data);
                            break;

                        case "INTERRUPTED":
                            player.interrupt();
                            break;

                        case "TOOL_CALL":
                            handleToolCall(client, message.data);
                            break;

                        case "TURN_COMPLETE":
                            // A turn finished — the next transcript chunk
                            // (either role) should start a fresh bubble.
                            partialGeminiRef.current = "";
                            partialUserRef.current = "";
                            if (endRequestedRef.current) endSession();
                            break;

                        case "SETUP_COMPLETE":
                            break;
                    }
                };

                client.onClose = () => {
                    setConnected(false);
                    if (!endedRef.current) setStatus("Disconnected");
                    stopMicStream();
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
                    setStatus("This interview has already finished");
                    return;
                }
                setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        init();

        return () => {
            cancelled = true;
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

    function disconnect() {
        stopMicStream();
        audioPlayerRef.current?.destroy();
        clientRef.current?.disconnect();
        navigate("/");
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-background p-6">
            <div className="max-w-2xl mx-auto w-full flex flex-col h-full gap-4">
                <div className="flex items-center justify-between">
                    <h1 className="font-heading text-2xl font-semibold text-foreground">Interview</h1>
                    <span className="text-sm text-muted-foreground">{status}</span>
                </div>

                <div className="flex-1 overflow-y-auto border border-border rounded-lg p-4 space-y-3 bg-card">
                    {messages.length === 0 && (
                        <p className="text-muted-foreground text-sm text-center mt-10">
                            Waiting for Gemini to respond...
                        </p>
                    )}
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                                    msg.role === "user"
                                        ? "bg-forest text-white"
                                        : "bg-secondary text-foreground"
                                }`}
                            >
                                {msg.text}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3 justify-center pb-4">
                    <Button
                        onClick={toggleMic}
                        disabled={!connected}
                        className={`rounded-full px-8 ${
                            micActive
                                ? "bg-terracotta hover:bg-terracotta/80"
                                : "bg-forest hover:bg-forest/80"
                        } text-white`}
                    >
                        {micActive ? "Stop Mic" : "Start Mic"}
                    </Button>
                    <Button
                        onClick={disconnect}
                        variant="outline"
                        className="rounded-full px-8"
                    >
                        Disconnect
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default Interview;
