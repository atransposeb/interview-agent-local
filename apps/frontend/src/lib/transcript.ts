export type Speaker = "user" | "assistant";

export interface TranscriptEntry {
    /** Position in the interview; the backend stores entries by (interview, seq). */
    seq: number;
    role: Speaker;
    text: string;
    /** Closed entries are complete and ready to save. */
    final: boolean;
}

export interface Transcript {
    entries: TranscriptEntry[];
    nextSeq: number;
}

export interface TranscriptUpdate {
    transcript: Transcript;
    /** Entries this update closed. */
    closed: TranscriptEntry[];
}

export function createTranscript(nextSeq = 0): Transcript {
    return { entries: [], nextSeq };
}

/**
 * Closes the open entry, at the end of a turn, an interruption, or the end of
 * the interview. Pass `role` to close it only if that speaker has it open.
 * An entry that is only whitespace is dropped and its seq reused.
 */
export function closeOpenEntry(transcript: Transcript, role?: Speaker): TranscriptUpdate {
    const last = transcript.entries.at(-1);
    if (!last || last.final || (role && last.role !== role)) return { transcript, closed: [] };

    const earlier = transcript.entries.slice(0, -1);
    const text = last.text.trim();
    if (!text) {
        return { transcript: { entries: earlier, nextSeq: last.seq }, closed: [] };
    }

    const closed = { ...last, text, final: true };
    return { transcript: { ...transcript, entries: [...earlier, closed] }, closed: [closed] };
}

/**
 * Adds a streamed transcription chunk. Chunks from the same speaker extend the
 * open entry; a chunk from the other speaker closes it and starts a new one.
 */
export function appendChunk(transcript: Transcript, role: Speaker, chunk: string): TranscriptUpdate {
    if (!chunk) return { transcript, closed: [] };

    const last = transcript.entries.at(-1);
    if (last && !last.final && last.role === role) {
        const extended = { ...last, text: last.text + chunk };
        return { transcript: { ...transcript, entries: [...transcript.entries.slice(0, -1), extended] }, closed: [] };
    }

    const { transcript: current, closed } = closeOpenEntry(transcript);
    const entry: TranscriptEntry = { seq: current.nextSeq, role, text: chunk, final: false };
    return {
        transcript: { entries: [...current.entries, entry], nextSeq: current.nextSeq + 1 },
        closed,
    };
}
