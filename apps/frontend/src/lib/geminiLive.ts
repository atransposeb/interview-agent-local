type ResponseType = "TEXT" | "AUDIO" | "SETUP_COMPLETE" | "TURN_COMPLETE" | "INTERRUPTED" | "TOOL_CALL" | "INPUT_TRANSCRIPTION" | "OUTPUT_TRANSCRIPTION";

interface GeminiResponse {
    type: ResponseType;
    data: any;
    endOfTurn: boolean;
}

interface GeminiLiveAPIOptions {
    token: string;
    model?: string;
    systemInstruction?: string;
    voiceName?: string;
    responseModalities?: string[];
    temperature?: number;
    outputAudioTranscription?: Record<string, unknown>;
    inputAudioTranscription?: Record<string, unknown>;
    historyConfig?: Record<string, unknown>;
}

export class GeminiLiveAPI {
    private token: string;
    private model: string;
    private modelUri: string;
    private systemInstruction: string;
    private voiceName: string;
    private responseModalities: string[];
    private temperature: number;
    private serviceUrl: string;
    private outputAudioTranscription: Record<string, unknown> | null;
    private inputAudioTranscription: Record<string, unknown> | null;
    private historyConfig: Record<string, unknown> | null;
    private ws: WebSocket | null = null;
    private setupComplete = false;

    connected = false;

    onReceiveResponse: (message: GeminiResponse) => void = () => {};
    onOpen: () => void = () => {};
    onClose: () => void = () => {};
    onError: (message: string) => void = () => {};

    constructor(options: GeminiLiveAPIOptions) {
        this.token = options.token;
        this.model = options.model ?? "gemini-3.1-flash-live-preview";
        this.modelUri = `models/${this.model}`;
        this.systemInstruction = options.systemInstruction ?? "You are a friendly interview coach. Keep responses brief and conversational.";
        this.voiceName = options.voiceName ?? "Puck";
        this.responseModalities = options.responseModalities ?? ["AUDIO"];
        this.temperature = options.temperature ?? 1.0;
        this.outputAudioTranscription = options.outputAudioTranscription ?? null;
        this.inputAudioTranscription = options.inputAudioTranscription ?? null;
        this.historyConfig = options.historyConfig ?? null;

        this.serviceUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${this.token}`;
    }

    connect() {
        this.ws = new WebSocket(this.serviceUrl);

        this.ws.onopen = () => {
            this.sendSetupMessage();
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

    /** Send text via clientContent — use for the first turn only when
     *  historyConfig.initialHistoryInClientContent is enabled. */
    sendTextMessage(text: string) {
        this.send({
            clientContent: {
                turns: [{ role: "user", parts: [{ text }] }],
            },
        });
    }

    /** Send text via realtimeInput — use for all turns after the first. */
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

    private send(message: object) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    private sendSetupMessage() {
        const setup: Record<string, any> = {
            model: this.modelUri,
            generationConfig: {
                responseModalities: this.responseModalities,
                temperature: this.temperature,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: this.voiceName,
                        },
                    },
                },
            },
            systemInstruction: {
                parts: [{ text: this.systemInstruction }],
            },
            realtimeInputConfig: {
                automaticActivityDetection: {},
                activityHandling: "ACTIVITY_HANDLING_UNSPECIFIED",
                turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
            },
        };

        if (this.outputAudioTranscription) {
            setup.outputAudioTranscription = this.outputAudioTranscription;
        }
        if (this.inputAudioTranscription) {
            setup.inputAudioTranscription = this.inputAudioTranscription;
        }
        if (this.historyConfig) {
            setup.historyConfig = this.historyConfig;
        }

        this.send({ setup });
    }

    private parseResponse(data: any): GeminiResponse[] {
        const responses: GeminiResponse[] = [];

        if (data?.setupComplete) {
            responses.push({ type: "SETUP_COMPLETE", data: "", endOfTurn: false });
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
