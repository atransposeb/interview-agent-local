import { CircleCheck, FileText, ListChecks, MessageSquareText, Target, TrendingUp } from "lucide-react";
import { DIMENSIONS, Meter, type DimensionKey } from "@/components/report/Meter";
import { SectionHeading } from "@/components/site/SectionHeading";
import { ACCENTS, type Accent } from "@/lib/accents";
import { cn } from "@/lib/utils";

const FEATURES: { icon: typeof Target; title: string; body: string; accent: Accent }[] = [
    { icon: Target, title: "An overall score out of 100", body: "Built from four dimensions, each scored 1 to 10 with a comment.", accent: "lake" },
    { icon: ListChecks, title: "Question-by-question feedback", body: "What each answer did well, and what would have scored higher.", accent: "ochre" },
    { icon: FileText, title: "A resume match", body: "Evidence of fit the role asks for, and the gaps to close.", accent: "heather" },
    { icon: MessageSquareText, title: "The full transcript", body: "Reread exactly what you said.", accent: "pine" },
];

const SAMPLE_SCORES: Record<DimensionKey, number> = { relevance: 8, clarity: 8, depth: 6, roleFit: 9 };

export function ReportPreview() {
    return (
        <section id="report" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6">
            <div className="grid items-center gap-14 lg:grid-cols-2">
                <div>
                    <SectionHeading
                        align="left"
                        eyebrow="Your report"
                        accent="heather"
                        title={
                            <>
                                Feedback you can <span className="italic">act on</span>, not just a number
                            </>
                        }
                        description="The moment you hang up, your interview is scored against the job description and your own background."
                    />
                    <ul className="mt-10 space-y-6">
                        {FEATURES.map(({ icon: Icon, title, body, accent }) => (
                            <li key={title} className="flex gap-4">
                                <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", ACCENTS[accent].tint, ACCENTS[accent].ink)}>
                                    <Icon className="size-5" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="font-semibold text-forest">{title}</p>
                                    <p className="mt-1 leading-relaxed text-moss">{body}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <figure className="relative">
                    <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-tr from-lilac via-mist to-leaf blur-2xl" />
                    <div className="rounded-[2rem] border border-stone bg-white p-6 shadow-2xl shadow-forest/10 sm:p-8">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-moss">Interview report</p>
                            <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-moss">Sample</span>
                        </div>
                        <div className="mt-6 flex items-end justify-between gap-6">
                            <div>
                                <p className="text-sm text-moss">Overall score</p>
                                <p className="text-forest">
                                    <span className="text-6xl font-semibold tracking-tight">78</span>
                                    <span className="ml-2 text-lg text-moss">/ 100</span>
                                </p>
                            </div>
                            <span className="mb-2 rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white">Strong</span>
                        </div>
                        <Meter value={78} max={100} className="mt-4" />

                        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
                            {DIMENSIONS.map(({ key, label, accent }) => (
                                <div key={key}>
                                    <div className="flex items-baseline justify-between">
                                        <dt className="text-sm font-semibold text-forest">{label}</dt>
                                        <dd className="text-sm font-semibold tabular-nums text-forest">{SAMPLE_SCORES[key]}/10</dd>
                                    </div>
                                    <Meter value={SAMPLE_SCORES[key]} max={10} accent={accent} className="mt-2" />
                                </div>
                            ))}
                        </dl>

                        <div className="mt-8 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-leaf/80 p-4">
                                <p className="flex items-center gap-2 text-sm font-semibold text-forest">
                                    <CircleCheck className="size-4 text-pine-ink" aria-hidden="true" /> What went well
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-moss">
                                    You framed the checkout trade-off with a clear decision and a measurable result.
                                </p>
                            </div>
                            <div className="rounded-2xl bg-blush/80 p-4">
                                <p className="flex items-center gap-2 text-sm font-semibold text-forest">
                                    <TrendingUp className="size-4 text-terracotta-ink" aria-hidden="true" /> What to work on
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-moss">
                                    Go deeper on testing strategy: name the tools and what each one caught.
                                </p>
                            </div>
                        </div>
                    </div>
                    <figcaption className="mt-4 text-center text-sm text-moss">An example report. Yours is written from your answers.</figcaption>
                </figure>
            </div>
        </section>
    );
}
