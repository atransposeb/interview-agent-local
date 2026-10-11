import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Check, CircleCheck, Clock, FileText, FileUp, FolderGit2, Globe, Headphones, LoaderCircle, Lock, Mic, X } from "lucide-react";
import { ApiKeyField } from "@/components/ApiKeyField";
import { CharCount, FieldFooter, FieldFrame, fieldInput, fieldTextarea } from "@/components/form/Field";
import { Meter } from "@/components/report/Meter";
import { SectionHeading } from "@/components/site/SectionHeading";
import { Button } from "@/components/ui/button";
import { createInterview, getConfig } from "@/lib/api";
import { ACCENTS, type Accent } from "@/lib/accents";
import { getApiKey } from "@/lib/apiKey";
import { cn } from "@/lib/utils";

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_JOB_DESCRIPTION_CHARS = 20_000;
const MAX_RESUME_CHARS = 50_000;
// How long each progress message shows while the server prepares the interview.
const STAGE_MS = 3_500;

const EXAMPLE_ROLES = ["Senior Frontend Engineer", "Product Manager", "Data Analyst"];

type ResumeMode = "pdf" | "text";

function readFileAsBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function formatBytes(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The field shows a github.com/ prefix, so a pasted profile URL keeps only what follows it. */
function stripGithubPrefix(value: string) {
    return value.replace(/^\s*(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/^@/, "");
}

export function SetupForm() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const keyStepRef = useRef<HTMLDivElement>(null);

    // Assume a key is needed until the server says otherwise.
    const [apiKeyRequired, setApiKeyRequired] = useState(true);
    const [hasKey, setHasKey] = useState(() => Boolean(getApiKey()));
    const [showOwnKey, setShowOwnKey] = useState(false);
    const [jobDescription, setJobDescription] = useState("");
    const [resumeMode, setResumeMode] = useState<ResumeMode>("pdf");
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [resumeText, setResumeText] = useState("");
    const [githubUser, setGithubUser] = useState("");
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState(0);

    useEffect(() => {
        let cancelled = false;
        getConfig()
            .then((config) => {
                if (!cancelled) setApiKeyRequired(config.apiKeyRequired);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const githubUrl = githubUser.trim() ? `https://github.com/${githubUser.trim()}` : "";
    const stages = [
        "Reading your resume",
        ...(githubUrl ? ["Looking through your GitHub repositories"] : []),
        "Matching your experience to the role",
        "Getting your interviewer ready",
    ];

    useEffect(() => {
        if (!loading) return;
        setStage(0);
        const timer = setInterval(() => setStage((current) => Math.min(current + 1, stages.length - 1)), STAGE_MS);
        return () => clearInterval(timer);
    }, [loading, stages.length]);

    const hasResume = resumeMode === "pdf" ? Boolean(resumeFile) : Boolean(resumeText.trim());
    const checks: { label: string; done: boolean; accent: Accent; optional?: boolean }[] = [
        ...(apiKeyRequired ? [{ label: "Gemini API key", done: hasKey, accent: "ochre" as const }] : []),
        { label: "Job description", done: Boolean(jobDescription.trim()), accent: "lake" },
        { label: "Resume", done: hasResume, accent: "terracotta" },
    ];
    const doneCount = checks.filter((check) => check.done).length;

    function selectFile(file: File | undefined) {
        if (!file) return;
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
            toast("Please choose a PDF file");
            return;
        }
        if (file.size > MAX_PDF_BYTES) {
            toast("Resume PDFs must be 4 MB or smaller");
            return;
        }
        setResumeFile(file);
    }

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (apiKeyRequired && !getApiKey()) {
            toast("Add and verify your Gemini API key first");
            keyStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        if (!jobDescription.trim()) {
            toast("Paste the job description, or at least the role title");
            return;
        }
        if (resumeMode === "pdf" && !resumeFile) {
            toast("Choose your resume PDF");
            return;
        }
        if (resumeMode === "text" && !resumeText.trim()) {
            toast("Paste your resume text");
            return;
        }
        setLoading(true);
        try {
            const resume =
                resumeMode === "pdf" && resumeFile
                    ? { resumePdfBase64: await readFileAsBase64(resumeFile) }
                    : { resumeText };
            const { interviewId, warnings } = await createInterview({
                jobDescription,
                githubUrl: githubUrl || undefined,
                ...resume,
            });
            warnings.forEach((warning) => toast(warning));
            navigate(`/interview/${interviewId}`);
        } catch (error) {
            toast(error instanceof Error ? error.message : "Could not prepare the interview. Please try again.");
            setLoading(false);
        }
    }

    return (
        <section id="setup" className="scroll-mt-16 bg-gradient-to-b from-transparent via-sand/60 to-transparent py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <SectionHeading
                    eyebrow="Get started"
                    accent="ochre"
                    title={
                        <>
                            Set up your <span className="italic">interview</span>
                        </>
                    }
                    description="The interviewer reads everything here before it says hello. The more specific the job description, the sharper the questions."
                />

                <div className="mt-14 grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
                    <form
                        onSubmit={onSubmit}
                        noValidate
                        className="rounded-[2rem] border border-stone bg-white/90 p-6 shadow-xl shadow-forest/5 backdrop-blur sm:p-10"
                    >
                        <fieldset disabled={loading} className="space-y-9 disabled:opacity-60">
                            <legend className="sr-only">Interview details</legend>

                            <div ref={keyStepRef} className="scroll-mt-28">
                                <Step
                                    number={1}
                                    accent="ochre"
                                    title="Connect Gemini"
                                    badge={apiKeyRequired ? "Required" : "Optional"}
                                    done={hasKey}
                                    description={
                                        apiKeyRequired
                                            ? "Your interview and report run on your own Gemini API key."
                                            : "This server has its own key. Add yours to use your own quota."
                                    }
                                >
                                    {apiKeyRequired || hasKey || showOwnKey ? (
                                        <ApiKeyField onKeyChange={setHasKey} autoFocus={showOwnKey} />
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="rounded-xl bg-white/70"
                                            onClick={() => setShowOwnKey(true)}
                                        >
                                            Use my own key
                                        </Button>
                                    )}
                                </Step>
                            </div>

                            <Step number={2} accent="lake" title="The role" labelFor="job-description" done={Boolean(jobDescription.trim())}>
                                <FieldFrame accent="lake" stacked>
                                    <textarea
                                        id="job-description"
                                        placeholder="Paste the job description, or at least the role title"
                                        value={jobDescription}
                                        onChange={(e) => setJobDescription(e.target.value)}
                                        className={cn(fieldTextarea, "min-h-36")}
                                    />
                                    <FieldFooter>
                                        {jobDescription ? (
                                            <span className="text-moss">Responsibilities and requirements make the sharpest questions.</span>
                                        ) : (
                                            <>
                                                <span className="text-moss">Try</span>
                                                {EXAMPLE_ROLES.map((role) => (
                                                    <button
                                                        key={role}
                                                        type="button"
                                                        onClick={() => setJobDescription(role)}
                                                        className="rounded-full bg-white px-2.5 py-1 font-medium text-forest ring-1 ring-stone transition-colors hover:bg-mist hover:text-lake-ink hover:ring-lake/40"
                                                    >
                                                        {role}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        <CharCount length={jobDescription.length} max={MAX_JOB_DESCRIPTION_CHARS} />
                                    </FieldFooter>
                                </FieldFrame>
                            </Step>

                            <Step
                                number={3}
                                accent="terracotta"
                                title="Your resume"
                                labelFor={resumeMode === "pdf" ? "resume-file" : "resume-text"}
                                done={hasResume}
                                aside={
                                    <div className="inline-flex rounded-xl bg-sand/80 p-1 text-sm ring-1 ring-stone">
                                        {(["pdf", "text"] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                aria-pressed={resumeMode === mode}
                                                onClick={() => setResumeMode(mode)}
                                                className={cn(
                                                    "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                                                    resumeMode === mode ? "bg-white text-forest shadow-sm" : "text-moss hover:text-forest",
                                                )}
                                            >
                                                {mode === "pdf" ? "Upload PDF" : "Paste text"}
                                            </button>
                                        ))}
                                    </div>
                                }
                            >
                                {resumeMode === "pdf" ? (
                                    <>
                                        <input
                                            ref={fileInputRef}
                                            id="resume-file"
                                            type="file"
                                            accept="application/pdf,.pdf"
                                            className="sr-only"
                                            onChange={(e) => {
                                                selectFile(e.target.files?.[0]);
                                                e.target.value = "";
                                            }}
                                        />
                                        {resumeFile ? (
                                            <div className="flex items-center gap-3 rounded-2xl bg-blush/60 py-2 pl-2 pr-3 ring-1 ring-terracotta/25">
                                                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-terracotta-deep text-white">
                                                    <FileText className="size-5" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-semibold text-forest">{resumeFile.name}</p>
                                                    <p className="text-sm text-terracotta-ink">PDF · {formatBytes(resumeFile.size)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setResumeFile(null)}
                                                    aria-label="Remove file"
                                                    className="grid size-9 place-items-center rounded-xl text-moss transition-colors hover:bg-white hover:text-terracotta-ink"
                                                >
                                                    <X className="size-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDragEnter={() => setDragging(true)}
                                                onDragLeave={() => setDragging(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setDragging(false);
                                                    selectFile(e.dataTransfer.files[0]);
                                                }}
                                                className={cn(
                                                    "group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed p-3 pr-4 text-left transition-colors",
                                                    dragging ? "border-terracotta bg-blush" : "border-clay bg-sand/50 hover:border-terracotta/50 hover:bg-blush/50",
                                                )}
                                            >
                                                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blush text-terracotta-ink transition-transform group-hover:-translate-y-0.5">
                                                    <FileUp className="size-5" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block font-semibold text-forest">
                                                        {dragging ? "Drop it here" : "Drop your resume PDF here"}
                                                    </span>
                                                    <span className="block text-sm text-moss">PDF up to 4 MB</span>
                                                </span>
                                                <span className="hidden rounded-xl bg-white px-4 py-2 text-sm font-semibold text-forest shadow-xs ring-1 ring-stone sm:block">
                                                    Browse
                                                </span>
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <FieldFrame accent="terracotta" stacked>
                                        <textarea
                                            id="resume-text"
                                            placeholder="Paste your resume: experience, projects, skills..."
                                            value={resumeText}
                                            onChange={(e) => setResumeText(e.target.value)}
                                            className={cn(fieldTextarea, "min-h-44")}
                                        />
                                        <FieldFooter>
                                            <CharCount length={resumeText.length} max={MAX_RESUME_CHARS} />
                                        </FieldFooter>
                                    </FieldFrame>
                                )}
                            </Step>

                            <Step
                                number={4}
                                accent="heather"
                                title="GitHub profile"
                                labelFor="github-url"
                                badge="Optional"
                                done={Boolean(githubUser.trim())}
                                description="Your public repositories can come up in the interview."
                            >
                                <FieldFrame accent="heather" icon={<FolderGit2 className="size-4.5" />}>
                                    <span aria-hidden="true" className="-mr-1 select-none pl-2 text-[15px] text-moss">
                                        github.com/
                                    </span>
                                    <input
                                        id="github-url"
                                        placeholder="username"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={githubUser}
                                        onChange={(e) => setGithubUser(stripGithubPrefix(e.target.value))}
                                        className={cn(fieldInput, "pl-0")}
                                    />
                                </FieldFrame>
                            </Step>
                        </fieldset>

                        <div className="mt-10 border-t border-stone pt-8">
                            {loading ? (
                                <div role="status" aria-live="polite" className="rounded-2xl bg-sand/70 p-5 sm:p-6">
                                    <p className="font-heading text-xl font-semibold text-forest">Preparing your interview</p>
                                    <ol className="mt-4 space-y-3">
                                        {stages.map((label, index) => (
                                            <li key={label} className="flex items-center gap-3 text-sm">
                                                {index < stage ? (
                                                    <CircleCheck className="size-5 text-pine-ink" aria-hidden="true" />
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
                            ) : (
                                <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-between">
                                    <p className="flex items-center gap-2 text-sm text-moss">
                                        <Mic className="size-4 text-terracotta" aria-hidden="true" />
                                        You'll switch on your mic on the next screen.
                                    </p>
                                    <Button
                                        type="submit"
                                        className="h-13 w-full rounded-full bg-forest px-8 text-base text-white shadow-lg shadow-forest/20 transition-all hover:bg-terracotta-deep sm:w-auto"
                                    >
                                        Start my interview <ArrowRight />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </form>

                    <aside className="space-y-5 lg:sticky lg:top-24">
                        <div className="rounded-[1.75rem] border border-stone bg-white/90 p-6 shadow-sm">
                            <div className="flex items-baseline justify-between">
                                <p className="font-semibold text-forest">Ready check</p>
                                <p className="text-sm text-moss">
                                    {doneCount} of {checks.length}
                                </p>
                            </div>
                            <Meter value={doneCount} max={checks.length} className="mt-3" />
                            <ul className="mt-5 space-y-3 text-sm">
                                {checks.map((check) => (
                                    <ReadyItem key={check.label} {...check} />
                                ))}
                                <ReadyItem label="GitHub profile" done={Boolean(githubUser.trim())} accent="heather" optional />
                            </ul>
                        </div>

                        <div className="relative overflow-hidden rounded-[1.75rem] bg-forest p-6 text-white shadow-lg shadow-forest/20">
                            <div aria-hidden="true" className="absolute -right-10 -top-10 size-36 rounded-full bg-lake/30 blur-2xl" />
                            <div aria-hidden="true" className="absolute -bottom-12 -left-8 size-32 rounded-full bg-ochre/25 blur-2xl" />
                            <p className="relative font-heading text-xl font-semibold">Before you start</p>
                            <ul className="relative mt-4 space-y-3.5 text-sm text-sage-light">
                                <Tip icon={<Headphones className="size-4 text-butter" />}>Wear headphones if you can.</Tip>
                                <Tip icon={<Globe className="size-4 text-mist" />}>Use Chrome or Edge on a computer.</Tip>
                                <Tip icon={<Mic className="size-4 text-blush" />}>Find a quiet room and allow mic access.</Tip>
                                <Tip icon={<Clock className="size-4 text-lilac" />}>Set aside five uninterrupted minutes.</Tip>
                            </ul>
                        </div>

                        <p className="flex gap-2.5 px-2 text-xs leading-relaxed text-moss">
                            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            <span>
                                Your key stays in this browser and is never saved on the server.{" "}
                                <a href="#faq" className="font-semibold text-forest underline-offset-4 hover:underline">
                                    More in the FAQ
                                </a>
                            </span>
                        </p>
                    </aside>
                </div>
            </div>
        </section>
    );
}

function Step({
    number,
    accent,
    title,
    badge,
    description,
    done,
    labelFor,
    aside,
    children,
}: {
    number: number;
    accent: Accent;
    title: string;
    badge?: string;
    description?: string;
    done?: boolean;
    /** Makes the title the label of this field. */
    labelFor?: string;
    aside?: ReactNode;
    children: ReactNode;
}) {
    const Title = labelFor ? "label" : "h3";
    const colors = ACCENTS[accent];
    const badgeClass = cn(
        "place-items-center rounded-2xl text-sm font-semibold transition-colors duration-300",
        done ? cn(colors.inkBg, "text-white") : cn(colors.tint, colors.ink),
    );
    const badgeContent = done ? <Check className="size-4.5" /> : String(number).padStart(2, "0");
    return (
        <div className="grid gap-4 sm:grid-cols-[2.75rem_1fr] sm:gap-5">
            <span aria-hidden="true" className={cn("hidden size-11 sm:grid", badgeClass)}>
                {badgeContent}
            </span>
            <div className="min-w-0 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 sm:min-h-11">
                    <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span aria-hidden="true" className={cn(badgeClass, "grid size-8 rounded-xl text-xs sm:hidden")}>
                                {badgeContent}
                            </span>
                            <Title htmlFor={labelFor} className="text-lg font-semibold text-forest">
                                {title}
                            </Title>
                            {badge && (
                                <span
                                    className={cn(
                                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                        badge === "Required" ? "bg-blush text-terracotta-ink" : "bg-sand text-moss",
                                    )}
                                >
                                    {badge}
                                </span>
                            )}
                        </div>
                        {description && <p className="text-sm text-moss">{description}</p>}
                    </div>
                    {aside}
                </div>
                {children}
            </div>
        </div>
    );
}

function ReadyItem({ label, done, accent, optional = false }: { label: string; done: boolean; accent: Accent; optional?: boolean }) {
    const colors = ACCENTS[accent];
    return (
        <li className="flex items-center gap-3">
            <span
                className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-lg transition-colors",
                    done ? cn(colors.inkBg, "text-white") : cn(colors.tint),
                )}
            >
                {done && <Check className="size-3.5" aria-hidden="true" />}
            </span>
            <span className={done ? "font-medium text-forest" : "text-moss"}>{label}</span>
            <span className="ml-auto text-xs text-moss">{done ? "Done" : optional ? "Optional" : "To do"}</span>
        </li>
    );
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <li className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/10">
                {icon}
            </span>
            <span className="leading-snug">{children}</span>
        </li>
    );
}
