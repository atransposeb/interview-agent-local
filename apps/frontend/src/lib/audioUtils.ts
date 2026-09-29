import type { GeminiLiveAPI } from "./geminiLive";

const CAPTURE_WORKLET_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 512;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channel = input[0];
            for (let i = 0; i < channel.length; i++) {
                this.buffer[this.bufferIndex++] = channel[i];
                if (this.bufferIndex >= this.bufferSize) {
                    this.port.postMessage({ type: "audio", data: this.buffer.slice() });
                    this.bufferIndex = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
`;

const PLAYBACK_WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.audioQueue = [];
        this.currentOffset = 0;

        this.port.onmessage = (event) => {
            if (event.data === "interrupt") {
                this.audioQueue = [];
                this.currentOffset = 0;
            } else if (event.data instanceof Float32Array) {
                this.audioQueue.push(event.data);
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (output.length === 0) return true;
        const channel = output[0];
        let outputIndex = 0;

        while (outputIndex < channel.length && this.audioQueue.length > 0) {
            const currentBuffer = this.audioQueue[0];
            if (!currentBuffer || currentBuffer.length === 0) {
                this.audioQueue.shift();
                this.currentOffset = 0;
                continue;
            }
            const remaining = Math.min(channel.length - outputIndex, currentBuffer.length - this.currentOffset);
            for (let i = 0; i < remaining; i++) {
                channel[outputIndex++] = currentBuffer[this.currentOffset++];
            }
            if (this.currentOffset >= currentBuffer.length) {
                this.audioQueue.shift();
                this.currentOffset = 0;
            }
        }

        while (outputIndex < channel.length) {
            channel[outputIndex++] = 0;
        }
        return true;
    }
}

registerProcessor("pcm-processor", PCMProcessor);
`;

function createWorkletBlobUrl(code: string): string {
    const blob = new Blob([code], { type: "application/javascript" });
    return URL.createObjectURL(blob);
}

export class AudioStreamer {
    private client: GeminiLiveAPI;
    private audioContext: AudioContext | null = null;
    private audioSource: MediaStreamAudioSourceNode | null = null;
    private audioWorklet: AudioWorkletNode | null = null;
    private mediaStream: MediaStream | null = null;
    private sampleRate = 16000;
    isStreaming = false;

    constructor(client: GeminiLiveAPI) {
        this.client = client;
    }

    async start(deviceId?: string): Promise<void> {
        if (this.isStreaming) return;

        const constraints: MediaStreamConstraints = {
            audio: {
                sampleRate: this.sampleRate,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            },
        };

        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }

        const workletUrl = createWorkletBlobUrl(CAPTURE_WORKLET_CODE);
        await this.audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        this.audioWorklet = new AudioWorkletNode(this.audioContext, "audio-capture-processor");

        this.audioWorklet.port.onmessage = (event) => {
            if (!this.isStreaming) return;
            if (event.data.type === "audio") {
                const pcmData = this.convertToPCM16(event.data.data);
                const base64 = this.arrayBufferToBase64(pcmData);
                if (this.client.connected) {
                    this.client.sendAudioMessage(base64);
                }
            }
        };

        this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.audioSource.connect(this.audioWorklet);

        this.isStreaming = true;
    }

    stop() {
        this.isStreaming = false;

        if (this.audioSource) {
            this.audioSource.disconnect();
            this.audioSource = null;
        }

        if (this.audioContext && this.audioContext.state === "running") {
            this.audioContext.suspend();
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((t) => t.stop());
            this.mediaStream = null;
        }
    }

    destroy() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    private convertToPCM16(float32: Float32Array): ArrayBuffer {
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i] ?? 0));
            int16[i] = s * 0x7fff;
        }
        return int16.buffer;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i] ?? 0);
        }
        return btoa(binary);
    }
}

export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private gainNode: GainNode | null = null;
    private sampleRate = 24000;
    private initialized = false;
    private initPromise: Promise<void> | null = null;
    // AudioContext time at which the queued audio finishes playing.
    private queuedUntil = 0;

    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });

            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }

            const workletUrl = createWorkletBlobUrl(PLAYBACK_WORKLET_CODE);
            await this.audioContext.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);

            this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor");
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 1.0;

            this.workletNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            this.initialized = true;
        })();

        return this.initPromise;
    }

    async play(base64Audio: string): Promise<void> {
        if (!this.initialized) await this.init();

        if (this.audioContext!.state === "suspended") {
            await this.audioContext!.resume();
        }

        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = (int16[i] ?? 0) / 32768;
        }

        this.workletNode!.port.postMessage(float32);
        const now = this.audioContext!.currentTime;
        this.queuedUntil = Math.max(this.queuedUntil, now) + float32.length / this.sampleRate;
    }

    interrupt() {
        if (this.workletNode) {
            this.workletNode.port.postMessage("interrupt");
        }
        this.queuedUntil = 0;
    }

    /** Resolves when queued audio has finished playing, or after `maxMs`. */
    async drain(maxMs = 10_000): Promise<void> {
        if (!this.audioContext) return;
        const remainingMs = (this.queuedUntil - this.audioContext.currentTime) * 1000;
        if (remainingMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(remainingMs, maxMs)));
        }
    }

    destroy() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.initialized = false;
        this.initPromise = null;
    }
}
