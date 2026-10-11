import type { ReactNode } from "react";
import { ChartNoAxesColumn, FileText, Mic } from "lucide-react";
import { SectionHeading } from "@/components/site/SectionHeading";
import { ACCENTS, type Accent } from "@/lib/accents";
import { cn } from "@/lib/utils";

const STEPS: { icon: typeof FileText; title: string; body: string; art: ReactNode; accent: Accent }[] = [
    {
        accent: "ochre",
        icon: FileText,
        title: "Share the role",
        body: "Paste the job description and add your resume as a PDF or text. Add your GitHub, and your projects can come up too.",
        art: <DocumentArt />,
    },
    {
        accent: "lake",
        icon: Mic,
        title: "Talk it through",
        body: "A five-minute voice interview, tailored to the role and your background. Answer out loud, interrupt, or ask for clarification, as you would in the real thing.",
        art: <WaveArt />,
    },
    {
        accent: "heather",
        icon: ChartNoAxesColumn,
        title: "Read your report",
        body: "Every answer is scored on relevance, clarity, depth, and role fit, with question-by-question feedback and a resume match.",
        art: <BarsArt />,
    },
];

export function HowItWorks() {
    return (
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6">
            <SectionHeading
                eyebrow="How it works"
                accent="lake"
                title={
                    <>
                        From job post to feedback in <span className="italic">three</span> steps
                    </>
                }
                description="No scheduling, no awkward mock-interview favors. Just you, a microphone, and an interviewer who has done the reading."
            />
            <ol className="mt-16 grid gap-6 md:grid-cols-3">
                {STEPS.map(({ icon: Icon, title, body, art, accent }, index) => (
                    <li
                        key={title}
                        className="group relative flex flex-col rounded-[1.75rem] border border-stone bg-white/80 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-forest/5"
                    >
                        <div className={cn("relative h-36 overflow-hidden rounded-2xl", ACCENTS[accent].tint)}>{art}</div>
                        <div className="mt-6 flex items-center gap-3">
                            <span className={cn("grid size-10 place-items-center rounded-xl text-white", ACCENTS[accent].inkBg)}>
                                <Icon className="size-4.5" aria-hidden="true" />
                            </span>
                            <span className={cn("text-xs font-semibold uppercase tracking-[0.16em]", ACCENTS[accent].ink)}>Step {index + 1}</span>
                        </div>
                        <h3 className="mt-4 font-heading text-2xl font-semibold text-forest">{title}</h3>
                        <p className="mt-2 leading-relaxed text-moss">{body}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}

function ArtFrame({ children }: { children: ReactNode }) {
    return (
        <div aria-hidden="true" className="bg-dots absolute inset-0 grid place-items-center">
            {children}
        </div>
    );
}

function DocumentArt() {
    return (
        <ArtFrame>
            <div className="w-40 rotate-[-4deg] space-y-2 rounded-xl border border-stone bg-white p-4 shadow-md transition-transform duration-500 group-hover:rotate-0">
                <div className="h-2 w-16 rounded-full bg-forest/70" />
                <div className="h-1.5 w-full rounded-full bg-stone" />
                <div className="h-1.5 w-5/6 rounded-full bg-stone" />
                <div className="h-1.5 w-4/6 rounded-full bg-stone" />
                <div className="flex gap-1.5 pt-1">
                    <span className="h-3 w-8 rounded-full bg-mist" />
                    <span className="h-3 w-10 rounded-full bg-butter" />
                    <span className="h-3 w-6 rounded-full bg-lilac" />
                </div>
            </div>
        </ArtFrame>
    );
}

function WaveArt() {
    const heights = [0.3, 0.55, 0.85, 0.5, 1, 0.65, 0.4, 0.8, 0.55, 0.9, 0.45, 0.7, 0.35];
    return (
        <ArtFrame>
            <div className="flex h-16 items-center gap-1.5">
                {heights.map((height, index) => (
                    <span
                        key={index}
                        className="w-2 origin-center animate-wave rounded-full bg-lake"
                        style={{ height: `${height * 100}%`, animationDelay: `${index * 90}ms`, opacity: 0.45 + height * 0.5 }}
                    />
                ))}
            </div>
        </ArtFrame>
    );
}

function BarsArt() {
    const bars = [
        { label: "Rel", value: 8, color: "bg-lake" },
        { label: "Cla", value: 7, color: "bg-ochre" },
        { label: "Dep", value: 5, color: "bg-heather" },
        { label: "Fit", value: 9, color: "bg-pine" },
    ];
    return (
        <ArtFrame>
            <div className="flex h-24 items-end gap-3 rounded-xl border border-stone bg-white px-5 pb-3 pt-4 shadow-md">
                {bars.map((bar) => (
                    <div key={bar.label} className="flex flex-col items-center gap-1.5">
                        <span
                            className={cn("w-5 rounded-t-[4px] transition-all duration-500 group-hover:opacity-90", bar.color)}
                            style={{ height: `${bar.value * 6}px` }}
                        />
                        <span className="text-[10px] font-semibold text-moss">{bar.label}</span>
                    </div>
                ))}
            </div>
        </ArtFrame>
    );
}
