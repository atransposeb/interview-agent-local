import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { completeInterview, type DimensionScore, type InterviewResult } from "@/lib/api";

const DIMENSIONS = [
    { key: "relevance", label: "Relevance", hint: "Did your answers address the question asked?" },
    { key: "clarity", label: "Clarity", hint: "Were your answers structured and easy to follow?" },
    { key: "depth", label: "Depth", hint: "Specifics, trade-offs, and measurable results" },
    { key: "roleFit", label: "Role fit", hint: "How well your answers show what the role needs" },
] as const;

function formatDuration(startedAt: string | null, endedAt: string | null) {
    if (!startedAt || !endedAt) return null;
    const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function Page({ children }: { children: ReactNode }) {
    return (
        <main className="min-h-screen w-full px-6 py-12">
            <div className="mx-auto w-full max-w-3xl space-y-10">{children}</div>
        </main>
    );
}

function SectionTitle({ children }: { children: ReactNode }) {
    return <h2 className="font-heading text-2xl font-semibold text-foreground">{children}</h2>;
}

// Single-series meter: the fill and its track are two steps of the forest
// token, and the value is always written beside it, never color alone.
function DimensionMeter({ label, hint, dimension }: { label: string; hint: string; dimension: DimensionScore }) {
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
                <div>
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-foreground">{dimension.score}/10</p>
            </div>
            <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-forest/15">
                <div className="h-full rounded-full bg-forest" style={{ width: `${dimension.score * 10}%` }} />
            </div>
            <p className="text-sm leading-relaxed text-foreground/80">{dimension.comment}</p>
        </div>
    );
}

export function Result() {
    const { interviewId } = useParams<{ interviewId: string }>();
    const [result, setResult] = useState<InterviewResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!interviewId) return;
        let cancelled = false;
        setError(null);

        // Finishing the interview and scoring it are one idempotent call, so a
        // refresh or a retry never scores twice.
        completeInterview(interviewId)
            .then((data) => {
                if (!cancelled) setResult(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load your report.");
            });

        return () => {
            cancelled = true;
        };
    }, [interviewId, attempt]);

    if (error) {
        return (
            <Page>
                <div className="space-y-4 pt-16 text-center">
                    <h1 className="font-heading text-3xl font-semibold text-foreground">We couldn't load your report</h1>
                    <p className="text-muted-foreground">{error}</p>
                    <div className="flex justify-center gap-3">
                        <Button onClick={() => setAttempt((n) => n + 1)} className="rounded-full bg-forest px-8 text-white hover:bg-forest/80">
                            Try again
                        </Button>
                        <Button asChild variant="outline" className="rounded-full px-8">
                            <Link to="/">Home</Link>
                        </Button>
                    </div>
                </div>
            </Page>
        );
    }

    if (!result?.evaluation) {
        return (
            <Page>
                <div role="status" className="space-y-3 pt-24 text-center">
                    <h1 className="font-heading text-3xl font-semibold text-foreground animate-pulse">Scoring your interview...</h1>
                    <p className="text-muted-foreground">This usually takes a few seconds.</p>
                </div>
            </Page>
        );
    }

    const { evaluation, jobFit, messages } = result;
    // Only the no-answers report has a zero overall; model scores start at 1 per dimension.
    const answered = evaluation.overallScore > 0;
    const duration = formatDuration(result.startedAt, result.endedAt);

    return (
        <Page>
            <header className="space-y-5">
                <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Interview report</p>
                {answered && (
                    <div>
                        <p className="text-sm text-muted-foreground">Overall score</p>
                        <p className="text-foreground">
                            <span className="text-6xl font-semibold">{evaluation.overallScore}</span>
                            <span className="ml-2 text-lg text-muted-foreground">/ 100</span>
                        </p>
                    </div>
                )}
                <p className="text-lg leading-relaxed text-foreground">{evaluation.summary}</p>
                {duration && <p className="text-sm text-muted-foreground">Interview length: {duration}</p>}
            </header>

            {answered && (
                <>
                    <section className="space-y-6 rounded-3xl border border-stone bg-card p-6 shadow-sm">
                        <SectionTitle>How you did</SectionTitle>
                        {DIMENSIONS.map(({ key, label, hint }) => (
                            <DimensionMeter key={key} label={label} hint={hint} dimension={evaluation.dimensions[key]} />
                        ))}
                    </section>

                    <section className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 rounded-3xl border border-stone bg-card p-6 shadow-sm">
                            <SectionTitle>What went well</SectionTitle>
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
                                {evaluation.strengths.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="space-y-3 rounded-3xl border border-stone bg-card p-6 shadow-sm">
                            <SectionTitle>What to work on</SectionTitle>
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
                                {evaluation.improvements.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    {evaluation.questions.length > 0 && (
                        <section className="space-y-4">
                            <SectionTitle>Question by question</SectionTitle>
                            <ol className="space-y-3">
                                {evaluation.questions.map((item, index) => (
                                    <li key={index} className="space-y-2 rounded-2xl border border-stone bg-card p-5">
                                        <div className="flex items-baseline justify-between gap-4">
                                            <p className="font-semibold text-foreground">
                                                {index + 1}. {item.question}
                                            </p>
                                            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{item.score}/10</p>
                                        </div>
                                        <p className="text-sm leading-relaxed text-foreground/80">{item.feedback}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}
                </>
            )}

            {jobFit && (
                <section className="space-y-4 rounded-3xl border border-stone bg-card p-6 shadow-sm">
                    <div className="flex items-baseline justify-between gap-4">
                        <SectionTitle>Resume match</SectionTitle>
                        <p className="shrink-0 font-semibold tabular-nums text-foreground">{jobFit.score}/100</p>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/80">{jobFit.summary}</p>
                    {jobFit.matchedSignals.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-foreground">Evidence in your profile</p>
                            <ul className="flex flex-wrap gap-2">
                                {jobFit.matchedSignals.map((signal) => (
                                    <li key={signal} className="rounded-full bg-sage/15 px-3 py-1 text-xs text-foreground">
                                        {signal}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {jobFit.missingSignals.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-foreground">Not shown yet</p>
                            <ul className="flex flex-wrap gap-2">
                                {jobFit.missingSignals.map((signal) => (
                                    <li key={signal} className="rounded-full border border-dashed border-sage px-3 py-1 text-xs text-foreground">
                                        {signal}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            {messages.length > 0 && (
                <details className="rounded-3xl border border-stone bg-card p-6 shadow-sm">
                    <summary className="cursor-pointer font-heading text-xl font-semibold text-foreground">
                        Transcript ({messages.length} turns)
                    </summary>
                    <div className="mt-4 space-y-3">
                        {messages.map((message) => (
                            <div key={message.seq} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div
                                    className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                                        message.role === "user" ? "bg-forest text-white" : "bg-secondary text-foreground"
                                    }`}
                                >
                                    {message.text}
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            <div className="flex justify-center pb-6">
                <Button
                    asChild
                    className="h-12 rounded-full bg-forest px-10 text-sm font-semibold uppercase tracking-widest text-white shadow-md transition-all duration-300 hover:bg-terracotta hover:shadow-lg"
                >
                    <Link to="/">Practice again</Link>
                </Button>
            </div>
        </Page>
    );
}

export default Result;
