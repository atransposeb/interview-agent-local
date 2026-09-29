import { describe, expect, test } from "bun:test";
import { appendChunk, closeOpenEntry, createTranscript, type Transcript } from "./transcript";

function append(transcript: Transcript, ...chunks: [role: "user" | "assistant", text: string][]) {
    return chunks.reduce((current, [role, text]) => appendChunk(current, role, text).transcript, transcript);
}

describe("appendChunk", () => {
    test("merges consecutive chunks from the same speaker", () => {
        const transcript = append(createTranscript(), ["assistant", "Hi Priya, "], ["assistant", "tell me about yourself."]);
        expect(transcript.entries).toEqual([
            { seq: 0, role: "assistant", text: "Hi Priya, tell me about yourself.", final: false },
        ]);
        expect(transcript.nextSeq).toBe(1);
    });

    test("closes the open entry when the other speaker starts", () => {
        const started = append(createTranscript(), ["assistant", " Tell me about yourself. "]);
        const { transcript, closed } = appendChunk(started, "user", "I build");

        expect(closed).toEqual([{ seq: 0, role: "assistant", text: "Tell me about yourself.", final: true }]);
        expect(transcript.entries.at(-1)).toEqual({ seq: 1, role: "user", text: "I build", final: false });
    });

    test("starts a new entry after a turn is closed, even for the same speaker", () => {
        const first = closeOpenEntry(append(createTranscript(), ["assistant", "Question one?"])).transcript;
        const transcript = append(first, ["assistant", "Question two?"]);
        expect(transcript.entries.map((entry) => entry.seq)).toEqual([0, 1]);
    });

    test("continues numbering from a resumed interview", () => {
        const transcript = append(createTranscript(7), ["assistant", "Welcome back."]);
        expect(transcript.entries[0]?.seq).toBe(7);
    });

    test("ignores empty chunks", () => {
        const { transcript, closed } = appendChunk(createTranscript(), "user", "");
        expect(transcript.entries).toEqual([]);
        expect(closed).toEqual([]);
    });
});

describe("closeOpenEntry", () => {
    test("drops whitespace-only entries and reuses their seq", () => {
        const { transcript, closed } = closeOpenEntry(append(createTranscript(), ["user", "  "]));
        expect(closed).toEqual([]);
        expect(transcript).toEqual({ entries: [], nextSeq: 0 });
    });

    test("can close only a given speaker's entry", () => {
        // The model's turn-complete arrived after the candidate started talking.
        const transcript = append(createTranscript(), ["assistant", "Next question?"], ["user", "So I"]);
        const update = closeOpenEntry(transcript, "assistant");
        expect(update.closed).toEqual([]);
        expect(update.transcript.entries.at(-1)).toEqual({ seq: 1, role: "user", text: "So I", final: false });
    });

    test("does nothing when there is no open entry", () => {
        const transcript = createTranscript();
        expect(closeOpenEntry(transcript)).toEqual({ transcript, closed: [] });
    });
});
