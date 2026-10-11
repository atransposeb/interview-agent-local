import { ArrowRight, AudioLines, ChartNoAxesColumn, Clock, Mic, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Meter } from "@/components/report/Meter";
import { cn } from "@/lib/utils";

const PROMISES = [
    { icon: Clock, label: "5-minute voice sessions", color: "text-lake" },
    { icon: UserRound, label: "No account needed", color: "text-heather" },
    { icon: ChartNoAxesColumn, label: "Scored report in seconds", color: "text-ochre" },
];

// Bar heights for the decorative waveform, so it doesn't reshuffle on render.
const WAVE = [0.35, 0.6, 0.9, 0.55, 0.8, 1, 0.7, 0.45, 0.85, 0.6, 0.95, 0.5, 0.75, 0.4, 0.65, 0.9, 0.55, 0.8, 0.45, 0.7, 0.35, 0.6];

export function Hero() {
    return (
        <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
            <div className="text-center lg:text-left">
                <p className="inline-flex items-center gap-2 rounded-full border border-stone bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-moss shadow-sm backdrop-blur">
                    <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-terracotta opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-terracotta" />
                    </span>
                    Live AI voice interviews
                </p>
                <h1 className="mt-6 font-heading text-5xl font-semibold leading-[1.04] tracking-tight text-forest sm:text-6xl lg:text-7xl">
                    Rehearse the interview <span className="italic text-terracotta-ink">before</span> it counts.
                </h1>
                <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-moss lg:mx-0">
                    Paste a job description and your resume. An AI interviewer that has read both runs a five-minute voice
                    interview, then scores every answer so you know exactly what to sharpen.
                </p>
                <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                    <Button
                        asChild
                        className="h-13 rounded-full bg-forest px-8 text-base text-white shadow-lg shadow-forest/20 hover:bg-forest-deep"
                    >
                        <a href="#setup">
                            Set up my interview <ArrowRight />
                        </a>
                    </Button>
                    <Button asChild variant="ghost" className="h-13 rounded-full px-6 text-base text-forest hover:bg-sand">
                        <a href="#report">See a sample report</a>
                    </Button>
                </div>
                <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-moss lg:justify-start">
                    {PROMISES.map(({ icon: Icon, label, color }) => (
                        <li key={label} className="inline-flex items-center gap-2">
                            <Icon className={cn("size-4", color)} aria-hidden="true" />
                            {label}
                        </li>
                    ))}
                </ul>
            </div>

            <HeroPreview />
        </section>
    );
}

/** An illustration of the live interview screen. Decorative, so hidden from assistive tech. */
function HeroPreview() {
    return (
        <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none sm:mb-16 lg:max-w-none">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-mist via-butter to-blush blur-2xl" />

            <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-2xl shadow-forest/10 backdrop-blur-md sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-full bg-lake-ink text-white">
                            <AudioLines className="size-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-forest">Your interviewer</p>
                            <p className="text-xs text-moss">Senior Frontend Engineer</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-terracotta/12 px-2.5 py-1 text-xs font-semibold text-terracotta-ink">
                            <span className="size-1.5 rounded-full bg-terracotta" /> Live
                        </span>
                        <span className="rounded-full border border-stone px-2.5 py-1 text-xs font-semibold text-forest">3:42</span>
                    </div>
                </div>

                <div className="mt-6 flex h-14 items-center justify-center gap-1 rounded-2xl bg-mist/70 px-4">
                    {WAVE.map((height, index) => (
                        <span
                            key={index}
                            className="w-1.5 origin-center animate-wave rounded-full bg-lake/80"
                            style={{ height: `${height * 100}%`, animationDelay: `${index * 70}ms` }}
                        />
                    ))}
                </div>

                <div className="mt-6 space-y-3 text-sm leading-relaxed">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-mist px-4 py-3 text-forest">
                        Tell me about a time you had to trade speed for quality. How did you decide?
                    </div>
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-forest px-4 py-3 text-white">
                        On our checkout rewrite, we shipped behind a flag so we could measure conversion before
                        <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-blink bg-white" />
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-stone pt-5">
                    <div className="flex items-center gap-3">
                        <span className="relative grid size-11 place-items-center rounded-full bg-terracotta-deep text-white">
                            <span className="absolute inset-0 animate-ripple rounded-full bg-terracotta" />
                            <Mic className="relative size-5" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-forest">You're live</p>
                            <p className="text-xs text-moss">The interviewer is listening</p>
                        </div>
                    </div>
                    <span className="rounded-full border border-stone px-3 py-1.5 text-xs font-semibold text-moss">End</span>
                </div>
            </div>

            <div className="absolute -bottom-24 -left-4 hidden w-56 animate-float rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl shadow-forest/10 sm:block lg:-left-10">
                <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold text-moss">Clarity</p>
                    <p className="text-sm font-semibold text-forest">8/10</p>
                </div>
                <Meter value={8} max={10} accent="ochre" className="mt-2" />
                <p className="mt-2 text-xs leading-snug text-moss">Clear structure: context, decision, result.</p>
            </div>
        </div>
    );
}
