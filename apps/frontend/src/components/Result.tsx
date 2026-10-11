import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
    ArrowRight,
    AudioLines,
    Check,
    CircleCheck,
    Clock,
    Link2,
    LoaderCircle,
    MessageSquareText,
    MicOff,
    Plus,
    Printer,
    RotateCcw,
    Target,
    TrendingUp,
    TriangleAlert,
    Trophy,
    UserRound,
} from "lucide-react";
import { ApiKeyField } from "@/components/ApiKeyField";
import { DIMENSIONS, Meter, Pips, scoreBand, type DimensionKey } from "@/components/report/Meter";
import { ACCENTS, type Accent } from "@/lib/accents";
import { Backdrop } from "@/components/site/Backdrop";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { ApiError, completeInterview, type DimensionScore, type InterviewResult, type JobFit } from "@/lib/api";
import { cn } from "@/lib/utils";

const SCORING_STAGES = ["Reading your transcript", "Scoring each answer", "Comparing against the role", "Writing your feedback"];
const SCORING_STAGE_MS = 2_500;

function formatDuration(startedAt: string | null, endedAt: string | null) {
    if (!startedAt || !endedAt) return null;
    const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function formatDate(value: string | null) {
    if (!value) return null;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Shell({ children }: { children: ReactNode }) {
    return (
        <div className="relative isolate min-h-screen w-full overflow-x-clip">
            <Backdrop />
            <SiteHeader
                actions={
                    <Button asChild className="h-10 rounded-full bg-forest px-5 text-white hover:bg-forest-deep">
                        <a href="/#setup">
                            <RotateCcw /> New interview
                        </a>
                    </Button>
                }
            />
            <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
            <SiteFooter />
        </div>
    );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <div className={cn("rounded-[1.75rem] border border-stone bg-white/90 p-6 shadow-sm sm:p-8 print:break-inside-avoid print:shadow-none", className)}>
            {children}
        </div>
    );
}

function SectionTitle({
    icon,
    accent,
    children,
    aside,
}: {
    icon?: ReactNode;
    accent?: Accent;
    children: ReactNode;
    aside?: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-3 font-heading text-2xl font-semibold text-forest">
                {icon && (
                    <span
                        aria-hidden="true"
                        className={cn("grid size-9 place-items-center rounded-xl", accent ? cn(ACCENTS[accent].tint, ACCENTS[accent].ink) : "bg-sand text-forest")}
                    >
                        {icon}
                    </span>
                )}
                {children}
            </h2>
            {aside}
        </div>
    );
}

export function Result() {
    const { interviewId } = useParams<{ interviewId: string }>();
    const [result, setResult] = useState<InterviewResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [needsKey, setNeedsKey] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!interviewId) return;
        let cancelled = false;
        setError(null);
        setNeedsKey(false);

        // Finishing the interview and scoring it are one idempotent call, so a
        // refresh or a retry never scores twice.
        completeInterview(interviewId)
            .then((data) => {
                if (!cancelled) setResult(data);
            })
            .catch((err) => {
                if (cancelled) return;
                setNeedsKey(err instanceof ApiError && err.status === 401);
                setError(err instanceof Error ? err.message : "Couldn't load your report.");
            });

        return () => {
            cancelled = true;
        };
    }, [interviewId, attempt]);

    if (error) {
        return (
            <Shell>
                <div className="mx-auto max-w-lg py-10">
                    <Card className="text-center shadow-xl shadow-forest/5">
                        <span className="mx-auto grid size-14 place-items-center rounded-full bg-terracotta/12 text-terracotta-ink">
                            <TriangleAlert className="size-6" aria-hidden="true" />
                        </span>
                        <h1 className="mt-5 font-heading text-3xl font-semibold text-forest">We couldn't load your report</h1>
                        <p className="mt-3 leading-relaxed text-moss">{error}</p>
                        {needsKey ? (
                            <div className="mt-6 text-left">
                                <ApiKeyField onKeyChange={(hasKey) => hasKey && setAttempt((n) => n + 1)} />
                            </div>
                        ) : (
                            <div className="mt-6 flex justify-center gap-3">
                                <Button onClick={() => setAttempt((n) => n + 1)} className="rounded-full bg-forest px-6 text-white hover:bg-forest-deep">
                                    <RotateCcw /> Try again
                                </Button>
                                <Button asChild variant="outline" className="rounded-full px-6">
                                    <a href="/">Home</a>
                                </Button>
                            </div>
                        )}
                    </Card>
                </div>
            </Shell>
        );
    }

    if (!result?.evaluation) {
        return (
            <Shell>
                <Scoring />
            </Shell>
        );
    }

    const { evaluation, jobFit, messages } = result;
    // Only the no-answers report has a zero overall; model scores start at 1 per dimension.
    const answered = evaluation.overallScore > 0;
    const duration = formatDuration(result.startedAt, result.endedAt);
    const date = formatDate(result.endedAt);

    return (
        <Shell>
            <div className="space-y-6">
                <ReportHeader answered={answered} score={evaluation.overallScore} date={date} />

                {answered ? (
                    <>
                        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
                            <ScoreCard score={evaluation.overallScore} />
                            <Card className="flex flex-col justify-between gap-6">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-moss">Summary</p>
                                    <p className="mt-3 text-lg leading-relaxed text-forest">{evaluation.summary}</p>
                                </div>
                                <ul className="flex flex-wrap gap-2 text-sm">
                                    {duration && <MetaChip icon={<Clock className="size-3.5" />}>{duration}</MetaChip>}
                                    <MetaChip icon={<MessageSquareText className="size-3.5" />}>
                                        {evaluation.questions.length} {evaluation.questions.length === 1 ? "question" : "questions"}
                                    </MetaChip>
                                </ul>
                            </Card>
                        </div>

                        <Highlights dimensions={evaluation.dimensions} jobFit={jobFit} />

                        <Card>
                            <SectionTitle icon={<Target className="size-4" />} accent="lake">
                                How you did
                            </SectionTitle>
                            <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
                                {DIMENSIONS.map(({ key, label, hint, accent }) => (
                                    <DimensionMeter key={key} label={label} hint={hint} accent={accent} dimension={evaluation.dimensions[key]} />
                                ))}
                            </div>
                        </Card>

                        <div className="grid gap-6 md:grid-cols-2">
                            <Card className="border-pine/20 bg-leaf/60">
                                <SectionTitle icon={<CircleCheck className="size-4" />} accent="pine">
                                    What went well
                                </SectionTitle>
                                <ul className="mt-6 space-y-4">
                                    {evaluation.strengths.map((item) => (
                                        <li key={item} className="flex gap-3 leading-relaxed text-forest">
                                            <Check className="mt-1 size-4 shrink-0 text-pine-ink" aria-hidden="true" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                            <Card className="border-terracotta/25 bg-blush/60">
                                <SectionTitle icon={<TrendingUp className="size-4" />} accent="terracotta">
                                    What to work on
                                </SectionTitle>
                                <ul className="mt-6 space-y-4">
                                    {evaluation.improvements.map((item) => (
                                        <li key={item} className="flex gap-3 leading-relaxed text-forest">
                                            <ArrowRight className="mt-1 size-4 shrink-0 text-terracotta-ink" aria-hidden="true" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        </div>

                        {evaluation.questions.length > 0 && (
                            <Card>
                                <SectionTitle icon={<MessageSquareText className="size-4" />} accent="ochre">
                                    Question by question
                                </SectionTitle>
                                <ol className="mt-6 divide-y divide-stone">
                                    {evaluation.questions.map((item, index) => (
                                        <li key={index} className="grid gap-4 py-6 first:pt-2 last:pb-0 sm:grid-cols-[2.5rem_1fr_auto]">
                                            <span className="grid size-10 place-items-center rounded-xl bg-butter text-sm font-semibold text-ochre-ink">
                                                {index + 1}
                                            </span>
                                            <div className="min-w-0 space-y-2">
                                                <p className="font-semibold leading-snug text-forest">{item.question}</p>
                                                <p className="leading-relaxed text-moss">{item.feedback}</p>
                                            </div>
                                            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                                                <p className="font-semibold tabular-nums text-forest">{item.score}/10</p>
                                                <Pips value={item.score} />
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </Card>
                        )}
                    </>
                ) : (
                    <NoAnswers summary={evaluation.summary} />
                )}

                {jobFit && <ResumeMatch jobFit={jobFit} />}

                {answered && <NextSteps result={result} />}

                {messages.length > 0 && (
                    <details className="group rounded-[1.75rem] border border-stone bg-white/90 shadow-sm print:hidden">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 sm:px-8 [&::-webkit-details-marker]:hidden">
                            <span className="flex items-center gap-3 font-heading text-2xl font-semibold text-forest">
                                <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-mist text-lake-ink">
                                    <AudioLines className="size-4" />
                                </span>
                                Transcript
                            </span>
                            <span className="rounded-full bg-sand px-3 py-1.5 text-sm font-medium text-moss group-open:hidden">
                                Show {messages.length} {messages.length === 1 ? "turn" : "turns"}
                            </span>
                            <span className="hidden rounded-full bg-sand px-3 py-1.5 text-sm font-medium text-moss group-open:inline">Hide</span>
                        </summary>
                        <ol className="space-y-5 border-t border-stone px-4 py-6 sm:px-8">
                            {messages.map((message) => {
                                const isUser = message.role === "user";
                                return (
                                    <li key={message.seq} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                "mt-5 grid size-8 shrink-0 place-items-center rounded-full",
                                                isUser ? "bg-butter text-ochre-ink" : "bg-lake-ink text-white",
                                            )}
                                        >
                                            {isUser ? <UserRound className="size-4" /> : <AudioLines className="size-4" />}
                                        </span>
                                        <div className={cn("flex max-w-[80%] flex-col gap-1", isUser && "items-end")}>
                                            <p className="px-1 text-xs font-semibold text-moss">{isUser ? "You" : "Interviewer"}</p>
                                            <div
                                                className={cn(
                                                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                                                    isUser ? "rounded-tr-md bg-forest text-white" : "rounded-tl-md bg-mist text-forest",
                                                )}
                                            >
                                                {message.text}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </details>
                )}

                <div className="flex flex-col items-center gap-3 pt-6 text-center print:hidden">
                    <p className="font-heading text-2xl font-semibold text-forest">Ready for another round?</p>
                    <Button
                        asChild
                        className="mt-3 h-13 rounded-full bg-forest px-8 text-base text-white shadow-lg shadow-forest/20 hover:bg-terracotta-deep"
                    >
                        <a href="/#setup">
                            Practice again <ArrowRight />
                        </a>
                    </Button>
                </div>
            </div>
        </Shell>
    );
}

function ReportHeader({ answered, score, date }: { answered: boolean; score: number; date: string | null }) {
    function copyLink() {
        navigator.clipboard
            ?.writeText(window.location.href)
            .then(() => toast("Report link copied"))
            .catch(() => toast("Couldn't copy the link. Copy it from the address bar instead."));
    }

    return (
        <div className="flex flex-col justify-between gap-6 pb-4 md:flex-row md:items-end">
            <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-moss">
                    Interview report{date && <span className="font-normal normal-case tracking-normal"> · {date}</span>}
                </p>
                <h1 className="max-w-2xl font-heading text-4xl font-semibold leading-tight tracking-tight text-forest sm:text-5xl">
                    {answered ? scoreBand(score).headline : "We didn't hear any answers this time."}
                </h1>
            </div>
            <div className="flex gap-2 print:hidden">
                <Button variant="outline" onClick={copyLink} className="rounded-full bg-white/70">
                    <Link2 /> Copy link
                </Button>
                <Button variant="outline" onClick={() => window.print()} className="rounded-full bg-white/70">
                    <Printer /> Print
                </Button>
            </div>
        </div>
    );
}

function ScoreCard({ score }: { score: number }) {
    const band = scoreBand(score);
    return (
        <div className="relative overflow-hidden rounded-[1.75rem] bg-forest p-6 text-white shadow-xl shadow-forest/20 sm:p-8 print:break-inside-avoid">
            <div aria-hidden="true" className="absolute -right-12 -top-12 size-44 rounded-full bg-lake/40 blur-3xl print:hidden" />
            <div aria-hidden="true" className="absolute -bottom-16 -left-10 size-40 rounded-full bg-ochre/25 blur-3xl print:hidden" />
            <div className="relative">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-sage-light">Overall score</p>
                    <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold">{band.label}</span>
                </div>
                <p className="mt-4">
                    <span className="text-7xl font-semibold tracking-tight">{score}</span>
                    <span className="ml-2 text-xl text-sage-light">/ 100</span>
                </p>
                <Meter value={score} max={100} inverted className="mt-5" />
                <p className="mt-4 text-sm leading-relaxed text-sage-light">The average of your four dimension scores, out of 100.</p>
            </div>
        </div>
    );
}

function MetaChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <li className="inline-flex items-center gap-2 rounded-full border border-stone bg-white px-3 py-1.5 text-moss">
            <span aria-hidden="true">{icon}</span>
            {children}
        </li>
    );
}

function Highlights({ dimensions, jobFit }: { dimensions: Record<DimensionKey, DimensionScore>; jobFit: JobFit | null }) {
    const ranked = [...DIMENSIONS].sort((a, b) => dimensions[b.key].score - dimensions[a.key].score);
    const strongest = ranked[0]!;
    const focus = ranked.at(-1)!;
    const even = dimensions[strongest.key].score === dimensions[focus.key].score;

    const tiles: { label: string; value: string; detail: string; dot: string }[] = [
        {
            label: "Strongest area",
            value: even ? "Even" : strongest.label,
            detail: even ? "Balanced across all four" : `${dimensions[strongest.key].score}/10`,
            dot: even ? "bg-forest" : ACCENTS[strongest.accent].solid,
        },
        {
            label: "Focus area",
            value: even ? "Even" : focus.label,
            detail: even ? "No single weak spot" : `${dimensions[focus.key].score}/10`,
            dot: even ? "bg-forest" : ACCENTS[focus.accent].solid,
        },
        ...(jobFit ? [{ label: "Resume match", value: `${jobFit.score}`, detail: "out of 100", dot: "bg-forest" }] : []),
    ];

    return (
        <dl className={cn("grid gap-4", jobFit ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {tiles.map((tile) => (
                <div key={tile.label} className="rounded-[1.5rem] border border-stone bg-white/90 px-6 py-5 shadow-sm print:break-inside-avoid">
                    <dt className="flex items-center gap-2 text-sm text-moss">
                        <span aria-hidden="true" className={cn("size-2 rounded-full", tile.dot)} />
                        {tile.label}
                    </dt>
                    <dd className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-semibold tracking-tight text-forest">{tile.value}</span>
                        <span className="text-sm text-moss">{tile.detail}</span>
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function DimensionMeter({ label, hint, accent, dimension }: { label: string; hint: string; accent: Accent; dimension: DimensionScore }) {
    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <div>
                    <p className="flex items-center gap-2 text-lg font-semibold text-forest">
                        <span aria-hidden="true" className={cn("size-2.5 rounded-full", ACCENTS[accent].solid)} />
                        {label}
                    </p>
                    <p className="text-sm text-moss">{hint}</p>
                </div>
                <p className="shrink-0 text-2xl font-semibold text-forest">
                    {dimension.score}
                    <span className="text-base font-normal text-moss">/10</span>
                </p>
            </div>
            <Meter value={dimension.score} max={10} accent={accent} />
            <p className="leading-relaxed text-forest/85">{dimension.comment}</p>
        </div>
    );
}

function ResumeMatch({ jobFit }: { jobFit: JobFit }) {
    return (
        <Card>
            <SectionTitle
                icon={<Trophy className="size-4" />}
                aside={
                    <p className="shrink-0 text-forest">
                        <span className="text-3xl font-semibold">{jobFit.score}</span>
                        <span className="ml-1 text-moss">/ 100</span>
                    </p>
                }
            >
                Resume match
            </SectionTitle>
            <Meter value={jobFit.score} max={100} className="mt-5" />
            <p className="mt-5 leading-relaxed text-forest/85">{jobFit.summary}</p>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
                {jobFit.matchedSignals.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-forest">Evidence in your profile</p>
                        <ul className="flex flex-wrap gap-2">
                            {jobFit.matchedSignals.map((signal) => (
                                <li key={signal} className="inline-flex items-center gap-1.5 rounded-full bg-leaf px-3 py-1.5 text-sm text-forest">
                                    <Check className="size-3.5 text-pine-ink" aria-hidden="true" />
                                    {signal}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {jobFit.missingSignals.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-forest">Not shown yet</p>
                        <ul className="flex flex-wrap gap-2">
                            {jobFit.missingSignals.map((signal) => (
                                <li
                                    key={signal}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ochre/60 bg-butter/50 px-3 py-1.5 text-sm text-forest"
                                >
                                    <Plus className="size-3.5 text-ochre-ink" aria-hidden="true" />
                                    {signal}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Card>
    );
}

function NextSteps({ result }: { result: InterviewResult }) {
    const evaluation = result.evaluation!;
    const focus = [...DIMENSIONS].sort((a, b) => evaluation.dimensions[a.key].score - evaluation.dimensions[b.key].score)[0]!;
    const gap = result.jobFit?.missingSignals[0];
    const steps = [
        { title: `Sharpen your ${focus.label.toLowerCase()}`, body: `${focus.hint}. ${evaluation.dimensions[focus.key].comment}` },
        ...(evaluation.improvements[0] ? [{ title: "Fix this first", body: evaluation.improvements[0] }] : []),
        ...(gap
            ? [{ title: "Close a resume gap", body: `The role asks for “${gap}”, and your profile doesn't show it yet. Add it to your resume, or bring it up in your answers.` }]
            : []),
    ];

    return (
        <div className="relative overflow-hidden rounded-[1.75rem] bg-forest p-6 text-white shadow-xl shadow-forest/20 sm:p-8 print:break-inside-avoid">
            <div aria-hidden="true" className="absolute -bottom-16 -left-10 size-56 rounded-full bg-heather/30 blur-3xl print:hidden" />
            <div aria-hidden="true" className="absolute -right-10 -top-16 size-48 rounded-full bg-lake/30 blur-3xl print:hidden" />
            <div className="relative">
                <h2 className="font-heading text-2xl font-semibold">Your next steps</h2>
                <p className="mt-1 text-sage-light">Pick one, practice it, and run another interview.</p>
                <ol className="mt-6 grid gap-4 md:grid-cols-3">
                    {steps.map((step, index) => (
                        <li key={step.title} className="rounded-2xl bg-white/8 p-5 ring-1 ring-white/10">
                            <span
                                className={cn(
                                    "grid size-8 place-items-center rounded-lg text-sm font-semibold",
                                    ["bg-butter text-ochre-ink", "bg-mist text-lake-ink", "bg-lilac text-heather-ink"][index],
                                )}
                            >
                                {index + 1}
                            </span>
                            <p className="mt-4 font-semibold">{step.title}</p>
                            <p className="mt-2 text-sm leading-relaxed text-sage-light">{step.body}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}

function NoAnswers({ summary }: { summary: string }) {
    return (
        <Card className="grid gap-8 md:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
                <span className="grid size-14 place-items-center rounded-2xl bg-terracotta/12 text-terracotta-ink">
                    <MicOff className="size-6" aria-hidden="true" />
                </span>
                <p className="text-lg leading-relaxed text-forest">{summary}</p>
            </div>
            <div className="rounded-2xl bg-sand/70 p-6">
                <p className="font-semibold text-forest">Before your next try</p>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-moss">
                    {[
                        "Switch on your mic once the interviewer greets you, or press M.",
                        "Allow microphone access when your browser asks.",
                        "Use Chrome or Edge, and wear headphones if you can.",
                        "Answer out loud. Your report needs a few full answers to score.",
                    ].map((tip) => (
                        <li key={tip} className="flex gap-3">
                            <Check className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden="true" />
                            {tip}
                        </li>
                    ))}
                </ul>
            </div>
        </Card>
    );
}

function Scoring() {
    const [stage, setStage] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setStage((current) => Math.min(current + 1, SCORING_STAGES.length - 1)), SCORING_STAGE_MS);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="grid items-start gap-10 py-6 lg:grid-cols-[1fr_1.2fr]">
            <div role="status" className="space-y-6">
                <span className="relative grid size-20 place-items-center">
                    <span aria-hidden="true" className="absolute inset-0 animate-ripple rounded-full bg-sage/50" />
                    <span className="relative grid size-20 place-items-center rounded-full bg-forest text-white shadow-xl shadow-forest/20">
                        <LoaderCircle className="size-8 animate-spin" aria-hidden="true" />
                    </span>
                </span>
                <div>
                    <h1 className="font-heading text-4xl font-semibold tracking-tight text-forest sm:text-5xl">Scoring your interview</h1>
                    <p className="mt-3 text-lg text-moss">This usually takes a few seconds.</p>
                </div>
                <ol className="space-y-3">
                    {SCORING_STAGES.map((label, index) => (
                        <li key={label} className="flex items-center gap-3">
                            {index < stage ? (
                                <CircleCheck className="size-5 text-forest" aria-hidden="true" />
                            ) : index === stage ? (
                                <LoaderCircle className="size-5 animate-spin text-forest" aria-hidden="true" />
                            ) : (
                                <span aria-hidden="true" className="mx-0.5 size-4 rounded-full border-2 border-stone" />
                            )}
                            <span className={index > stage ? "text-moss/70" : "font-medium text-forest"}>{label}</span>
                        </li>
                    ))}
                </ol>
            </div>

            <div aria-hidden="true" className="space-y-4">
                <div className="rounded-[1.75rem] border border-stone bg-white/80 p-8">
                    <div className="skeleton h-3 w-24" />
                    <div className="skeleton mt-5 h-14 w-40" />
                    <div className="skeleton mt-6 h-2 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {[0, 1, 2, 3].map((index) => (
                        <div key={index} className="rounded-[1.5rem] border border-stone bg-white/80 p-6">
                            <div className="skeleton h-3 w-20" />
                            <div className="skeleton mt-4 h-2 w-full" />
                            <div className="skeleton mt-3 h-2 w-3/4" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Result;
