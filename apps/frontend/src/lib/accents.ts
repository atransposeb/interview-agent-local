// Static class names per accent hue, so Tailwind sees every one at build time.
export type Accent = "lake" | "ochre" | "heather" | "pine" | "terracotta";

export const ACCENTS: Record<
    Accent,
    {
        /** The hue as a fill: meter bars, dots. */
        solid: string;
        /** Pale tint background: tiles, chips, meter tracks. */
        tint: string;
        /** Text in the hue, readable on white and on the tint. */
        ink: string;
        /** Solid fill dark enough for white text. */
        inkBg: string;
        /** Focus ring and halo for form fields. */
        focus: string;
    }
> = {
    lake: {
        solid: "bg-lake",
        tint: "bg-mist",
        ink: "text-lake-ink",
        inkBg: "bg-lake-ink",
        focus: "focus-within:ring-lake/70 focus-within:shadow-[0_0_0_5px_var(--color-mist)]",
    },
    ochre: {
        solid: "bg-ochre",
        tint: "bg-butter",
        ink: "text-ochre-ink",
        inkBg: "bg-ochre-ink",
        focus: "focus-within:ring-ochre/70 focus-within:shadow-[0_0_0_5px_var(--color-butter)]",
    },
    heather: {
        solid: "bg-heather",
        tint: "bg-lilac",
        ink: "text-heather-ink",
        inkBg: "bg-heather-ink",
        focus: "focus-within:ring-heather/60 focus-within:shadow-[0_0_0_5px_var(--color-lilac)]",
    },
    pine: {
        solid: "bg-pine",
        tint: "bg-leaf",
        ink: "text-pine-ink",
        inkBg: "bg-pine-ink",
        focus: "focus-within:ring-pine/60 focus-within:shadow-[0_0_0_5px_var(--color-leaf)]",
    },
    terracotta: {
        solid: "bg-terracotta",
        tint: "bg-blush",
        ink: "text-terracotta-ink",
        inkBg: "bg-terracotta-deep",
        focus: "focus-within:ring-terracotta/70 focus-within:shadow-[0_0_0_5px_var(--color-blush)]",
    },
};
