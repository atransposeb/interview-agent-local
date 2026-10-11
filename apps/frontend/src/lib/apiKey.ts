// The user's Gemini API key lives only in this browser: in sessionStorage for
// this tab, or in localStorage when they ask to be remembered. Storage can be
// unavailable (private windows, blocked site data), so every access is guarded.
const STORAGE_KEY = "fitfortherole.geminiApiKey";

export const API_KEY_HELP_URL = "https://aistudio.google.com/apikey";

function read(storage: () => Storage) {
    try {
        return storage().getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function write(storage: () => Storage, value: string | null) {
    try {
        if (value === null) storage().removeItem(STORAGE_KEY);
        else storage().setItem(STORAGE_KEY, value);
    } catch {
        // Not persisted; the key still works for requests made from this page.
    }
}

let inMemoryKey: string | null = null;

export function getApiKey() {
    return inMemoryKey ?? read(() => sessionStorage) ?? read(() => localStorage);
}

export function isApiKeyRemembered() {
    return read(() => localStorage) !== null;
}

export function saveApiKey(key: string, remember: boolean) {
    inMemoryKey = key;
    write(() => sessionStorage, key);
    write(() => localStorage, remember ? key : null);
}

export function clearApiKey() {
    inMemoryKey = null;
    write(() => sessionStorage, null);
    write(() => localStorage, null);
}

/** Shows the start and end of a key so people can tell which one is saved. */
export function maskApiKey(key: string) {
    return key.length <= 10 ? "•".repeat(key.length) : `${key.slice(0, 4)}…${key.slice(-4)}`;
}
