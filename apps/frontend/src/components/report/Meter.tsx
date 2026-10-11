import { ACCENTS, type Accent } from "@/lib/accents";
import { cn } from "@/lib/utils";

// Single-series meter: the fill and its track are two steps of one hue (forest
// by default), and the value is always written beside it, never color alone.
export function Meter({
    value,
    max,
    accent,
    className,
    inverted = false,
}: {
    value: number;
    max: number;
    accent?: Accent;
    className?: string;
    /** For dark surfaces. */
    inverted?: boolean;
}) {
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    const track = inverted ? "bg-white/15" : accent ? ACCENTS[accent].tint : "bg-forest/12";
    const fill = inverted ? "bg-sage-light" : accent ? ACCENTS[accent].solid : "bg-forest";
    return (
        <div aria-hidden="true" className={cn("h-2 w-full overflow-hidden rounded-full", track, className)}>
            <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${percent}%` }} />
        </div>
    );
}

/** A 1-10 score as ten pips, for compact per-question rows. */
export function Pips({ value, className }: { value: number; className?: string }) {
    return (
        <div aria-hidden="true" className={cn("flex gap-1", className)}>
            {Array.from({ length: 10 }, (_, index) => (
                <span key={index} className={cn("h-1.5 w-3 rounded-full", index < value ? "bg-forest" : "bg-forest/12")} />
            ))}
        </div>
    );
}

// Each dimension keeps its hue everywhere it appears. The four marks were
// validated together as a categorical set (lightness, chroma, CVD separation,
// contrast on white), and every meter is labeled, so color is never alone.
export const DIMENSIONS = [
    { key: "relevance", label: "Relevance", hint: "Did your answers address the question asked?", accent: "lake" },
    { key: "clarity", label: "Clarity", hint: "Were your answers structured and easy to follow?", accent: "ochre" },
    { key: "depth", label: "Depth", hint: "Specifics, trade-offs, and measurable results", accent: "heather" },
    { key: "roleFit", label: "Role fit", hint: "How well your answers show what the role needs", accent: "pine" },
] as const satisfies readonly { key: string; label: string; hint: string; accent: Accent }[];

export type DimensionKey = (typeof DIMENSIONS)[number]["key"];

/** Plain-language reading of an overall score out of 100. */
export function scoreBand(score: number) {
    if (score >= 85) return { label: "Excellent", headline: "Interview-ready. Keep this edge sharp." };
    if (score >= 70) return { label: "Strong", headline: "A strong showing with a few edges to polish." };
    if (score >= 50) return { label: "Developing", headline: "A solid base. Now make your answers land." };
    return { label: "Needs practice", headline: "Every rep counts. Here's where to start." };
}
