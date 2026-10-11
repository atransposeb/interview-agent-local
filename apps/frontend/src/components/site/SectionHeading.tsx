import type { ReactNode } from "react";
import { ACCENTS, type Accent } from "@/lib/accents";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, accent, className }: { children: ReactNode; accent?: Accent; className?: string }) {
    return (
        <p
            className={cn(
                "inline-flex items-center gap-2 rounded-full border border-stone bg-white/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-moss shadow-sm",
                className,
            )}
        >
            {accent && <span aria-hidden="true" className={cn("size-1.5 rounded-full", ACCENTS[accent].solid)} />}
            {children}
        </p>
    );
}

export function SectionHeading({
    eyebrow,
    accent,
    title,
    description,
    align = "center",
}: {
    eyebrow: string;
    accent?: Accent;
    title: ReactNode;
    description?: ReactNode;
    align?: "center" | "left";
}) {
    return (
        <div className={cn("space-y-4", align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl")}>
            <Eyebrow accent={accent}>{eyebrow}</Eyebrow>
            <h2 className="font-heading text-4xl font-semibold leading-tight tracking-tight text-forest sm:text-5xl">{title}</h2>
            {description && <p className="text-lg leading-relaxed text-moss">{description}</p>}
        </div>
    );
}
