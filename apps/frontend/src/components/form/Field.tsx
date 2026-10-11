import type { ReactNode } from "react";
import { ACCENTS, type Accent } from "@/lib/accents";
import { cn } from "@/lib/utils";

/** Classes for a borderless input that sits inside a FieldFrame. */
export const fieldInput =
    "h-14 min-w-0 flex-1 bg-transparent px-2 text-[15px] text-forest outline-none placeholder:text-moss/60 disabled:cursor-not-allowed";

/** Classes for a borderless textarea that grows with its content inside a stacked FieldFrame. */
export const fieldTextarea =
    "field-sizing-content max-h-80 w-full resize-none bg-transparent px-5 pb-3 pt-4 text-[15px] leading-relaxed text-forest outline-none placeholder:text-moss/60";

/**
 * A filled field: tinted at rest, white with an accent ring and halo while
 * anything inside it has focus. Holds a borderless input or textarea, an
 * optional icon tile, and any adornments.
 */
export function FieldFrame({
    accent,
    icon,
    invalid = false,
    stacked = false,
    className,
    children,
}: {
    accent: Accent;
    icon?: ReactNode;
    invalid?: boolean;
    /** Column layout, for a textarea with a footer bar. */
    stacked?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const colors = ACCENTS[accent];
    return (
        <div
            className={cn(
                "rounded-2xl bg-sand/60 ring-1 ring-stone transition-[background-color,box-shadow] duration-200 hover:bg-sand focus-within:bg-white focus-within:ring-2",
                colors.focus,
                stacked ? "flex flex-col" : "flex items-center gap-1 px-2",
                invalid && "ring-2 ring-terracotta-deep/70",
                className,
            )}
        >
            {icon && (
                <span aria-hidden="true" className={cn("ml-0.5 hidden size-10 shrink-0 place-items-center rounded-xl sm:grid", colors.tint, colors.ink)}>
                    {icon}
                </span>
            )}
            {children}
        </div>
    );
}

/** Footer bar inside a stacked FieldFrame, for hints and counters. */
export function FieldFooter({ children }: { children: ReactNode }) {
    return <div className="flex flex-wrap items-center gap-2 border-t border-stone/70 px-4 py-2.5 text-xs">{children}</div>;
}

/** Character count that turns terracotta past the limit. */
export function CharCount({ length, max }: { length: number; max: number }) {
    return (
        <span className={cn("ml-auto tabular-nums", length > max ? "font-semibold text-terracotta-ink" : "text-moss/80")}>
            {length.toLocaleString()} / {max.toLocaleString()}
        </span>
    );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-moss">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    "relative h-6 w-10 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-forest/40 focus-visible:ring-offset-2",
                    checked ? "bg-forest" : "bg-stone",
                )}
            >
                <span
                    className={cn(
                        "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                        checked && "translate-x-4",
                    )}
                />
            </button>
            {label}
        </label>
    );
}
