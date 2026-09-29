type ResponseType = "TEXT" | "AUDIO" | "SETUP_COMPLETE" | "TURN_COMPLETE" | "INTERRUPTED" | "TOOL_CALL" | "INPUT_TRANSCRIPTION" | "OUTPUT_TRANSCRIPTION";

export interface FunctionCall {
    id: string;
    name: string;
    args?: Record<string, unknown>;
}

interface GeminiResponse {
    type: ResponseType;
    data: any;
    endOfTurn: boolean;
}

interface GeminiLiveAPIOptions {
    token: string;
    /** e.g. "models/gemini-3.1-flash-live-preview" */
    model: string;
}

/**
 * Thin wrapper around the Gemini Live WebSocket. The session config (prompt,
 * voice, tools, transcription) is locked into the ephemeral token by the
 * backend, so the setup message here only names the model.
 */
export class GeminiLiveAPI {
    private model: string;
    private serviceUrl: string;
    private ws: WebSocket | null = null;
    private setupComplete = false;

    connected = false;

    onReceiveResponse: (message: GeminiResponse) => void = () => {};
    onOpen: () => void = () => {};
    onClose: () => void = () => {};
    onError: (message: string) => void = () => {};

    constructor(options: GeminiLiveAPIOptions) {
        this.model = options.model;
        this.serviceUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${options.token}`;
    }

    connect() {
        this.ws = new WebSocket(this.serviceUrl);

        this.ws.onopen = () => {
            this.send({ setup: { model: this.model } });
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.setupComplete = false;
            this.onClose();
        };

        this.ws.onerror = () => {
            this.connected = false;
            this.setupComplete = false;
            this.onError("WebSocket connection error");
        };

        this.ws.onmessage = async (event) => {
            let raw: string;
            if (event.data instanceof Blob) {
                raw = await event.data.text();
            } else if (event.data instanceof ArrayBuffer) {
                raw = new TextDecoder().decode(event.data);
            } else {
                raw = event.data;
            }

            try {
                const data = JSON.parse(raw);
                const responses = this.parseResponse(data);
                for (const response of responses) {
                    if (response.type === "SETUP_COMPLETE" && !this.setupComplete) {
                        this.setupComplete = true;
                        this.connected = true;
                        this.onOpen();
                    }
                    this.onReceiveResponse(response);
                }
            } catch {
                // ignore parse errors
            }
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.connected = false;
            this.setupComplete = false;
        }
    }

    /**
     * Send text as if the candidate said it. The model answers straight away.
     * (clientContent turns are only accepted as initial history on this model,
     * and the model waits silently after them.)
     */
    sendRealtimeText(text: string) {
        this.send({ realtimeInput: { text } });
    }

    sendAudioMessage(base64PCM: string) {
        this.send({
            realtimeInput: {
                audio: { mimeType: "audio/pcm;rate=16000", data: base64PCM },
            },
        });
    }

    /** The model pauses after a function call until it gets a response. */
    sendToolResponse(calls: FunctionCall[], response: Record<string, unknown>) {
        this.send({
            toolResponse: {
                functionResponses: calls.map((call) => ({ id: call.id, name: call.name, response })),
            },
        });
    }

    private send(message: object) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    private parseResponse(data: any): GeminiResponse[] {
        const responses: GeminiResponse[] = [];

        if (data?.setupComplete) {
            responses.push({ type: "SETUP_COMPLETE", data: "", endOfTurn: false });
            return responses;
        }

        if (data?.toolCall?.functionCalls?.length) {
            responses.push({ type: "TOOL_CALL", data: data.toolCall.functionCalls as FunctionCall[], endOfTurn: false });
            return responses;
        }

        const serverContent = data?.serverContent;
        const parts = serverContent?.modelTurn?.parts;

        if (parts?.length) {
            for (const part of parts) {
                if (part.inlineData) {
                    responses.push({ type: "AUDIO", data: part.inlineData.data, endOfTurn: false });
                } else if (part.text) {
                    responses.push({ type: "TEXT", data: part.text, endOfTurn: false });
                }
            }
        }

        if (serverContent?.inputTranscription) {
            responses.push({
                type: "INPUT_TRANSCRIPTION",
                data: serverContent.inputTranscription.text ?? "",
                endOfTurn: false,
            });
        }

        if (serverContent?.outputTranscription) {
            responses.push({
                type: "OUTPUT_TRANSCRIPTION",
                data: serverContent.outputTranscription.text ?? "",
                endOfTurn: false,
            });
        }

        if (serverContent?.interrupted) {
            responses.push({ type: "INTERRUPTED", data: "", endOfTurn: false });
        }

        if (serverContent?.turnComplete) {
            responses.push({ type: "TURN_COMPLETE", data: "", endOfTurn: true });
        }

        return responses;
    }
}
