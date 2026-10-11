import { useId, useState } from "react";
import { ArrowUpRight, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldFrame, Switch, fieldInput } from "@/components/form/Field";
import { ApiError, verifyApiKey } from "@/lib/api";
import { API_KEY_HELP_URL, clearApiKey, getApiKey, isApiKeyRemembered, maskApiKey, saveApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";

/**
 * Collects the user's Gemini API key, checks it with Google through the
 * backend, and keeps it in this browser. Reports whether a key is saved.
 */
export function ApiKeyField({
    onKeyChange,
    autoFocus = false,
}: {
    onKeyChange?: (hasKey: boolean) => void;
    autoFocus?: boolean;
}) {
    const inputId = useId();
    const errorId = useId();
    const [savedKey, setSavedKey] = useState(getApiKey);
    const [draft, setDraft] = useState("");
    const [remember, setRemember] = useState(() => isApiKeyRemembered());
    const [revealed, setRevealed] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function verify() {
        const key = draft.trim();
        if (!key) {
            setError("Paste your Gemini API key first.");
            return;
        }
        setChecking(true);
        setError(null);
        try {
            await verifyApiKey(key);
            saveApiKey(key, remember);
            setSavedKey(key);
            setDraft("");
            onKeyChange?.(true);
            toast("Gemini key connected");
        } catch (err) {
            setError(
                err instanceof ApiError && err.status === 401
                    ? "Google didn't accept that key. Copy it again from Google AI Studio and make sure it's enabled for the Gemini API."
                    : err instanceof Error
                      ? err.message
                      : "Couldn't check the key. Try again.",
            );
        } finally {
            setChecking(false);
        }
    }

    function remove() {
        clearApiKey();
        setSavedKey(null);
        setError(null);
        onKeyChange?.(false);
    }

    if (savedKey) {
        return (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-leaf/70 py-2 pl-2 pr-3 ring-1 ring-pine/20">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-pine-ink text-white">
                    <ShieldCheck className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-forest">Gemini key connected</p>
                    <p className="truncate text-sm text-pine-ink">
                        <span className="font-mono">{maskApiKey(savedKey)}</span>
                        {" · "}
                        {isApiKeyRemembered() ? "Remembered on this device" : "Kept for this tab only"}
                    </p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="rounded-xl text-forest hover:bg-white/80" onClick={remove}>
                    Remove
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <FieldFrame accent="ochre" icon={<KeyRound className="size-4.5" />} invalid={Boolean(error)}>
                <label htmlFor={inputId} className="sr-only">
                    Gemini API key
                </label>
                <input
                    id={inputId}
                    type={revealed ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus={autoFocus}
                    placeholder="Gemini API key"
                    value={draft}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        setError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            verify();
                        }
                    }}
                    className={cn(fieldInput, "font-mono text-sm placeholder:font-body placeholder:text-[15px]")}
                />
                <button
                    type="button"
                    onClick={() => setRevealed((value) => !value)}
                    aria-label={revealed ? "Hide key" : "Show key"}
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-moss transition-colors hover:bg-white hover:text-forest"
                >
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <Button
                    type="button"
                    onClick={verify}
                    disabled={checking}
                    className="h-10 shrink-0 rounded-xl bg-forest px-4 text-white hover:bg-forest-deep"
                >
                    {checking ? <LoaderCircle className="animate-spin" aria-label="Checking" /> : "Verify"}
                </Button>
            </FieldFrame>

            {error && (
                <p id={errorId} role="alert" className="px-1 text-sm text-terracotta-ink">
                    {error}
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1">
                <Switch checked={remember} onChange={setRemember} label="Remember on this device" />
                <a
                    href={API_KEY_HELP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-ochre-ink underline-offset-4 hover:underline"
                >
                    Get a key from Google AI Studio <ArrowUpRight className="size-3.5" />
                </a>
            </div>
        </div>
    );
}
