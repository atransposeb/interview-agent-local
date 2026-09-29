import "@/../styles/globals.css";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { createInterview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const MAX_PDF_BYTES = 4 * 1024 * 1024;

const fieldClassName =
  "rounded-2xl border border-stone bg-white/70 px-5 text-foreground placeholder:text-muted-foreground/60 shadow-sm backdrop-blur-sm focus-visible:border-sage focus-visible:ring-sage/20";

type ResumeMode = "pdf" | "text";

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Form() {

  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobDescription, setJobDescription] = useState("");
  const [resumeMode, setResumeMode] = useState<ResumeMode>("pdf");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);

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

  async function onSubmit() {
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
        githubUrl: githubUrl.trim() || undefined,
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
    <>
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
      <div className="min-h-screen w-full flex justify-center items-center px-6 py-12">
        <div className="w-full max-w-lg mx-auto flex flex-col items-center text-center gap-10">
          <div className="space-y-3">
            <h1 className="font-heading text-5xl md:text-6xl font-semibold text-foreground leading-tight">
              <span className="italic">fit</span>for
              <span className="italic">the</span>role
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-xs mx-auto">
              Practice a live voice interview with AI. Get a scored feedback report. Land your next role.
            </p>
          </div>

          <div className="w-full space-y-6 text-left">

            <div className="space-y-2">
              <Label htmlFor="job-description" className="px-1">Job description</Label>
              <Textarea
                id="job-description"
                placeholder="Paste the job description, or at least the role title"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className={cn(fieldClassName, "min-h-32 max-h-64 overflow-y-auto py-4")}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <Label htmlFor={resumeMode === "pdf" ? "resume-file" : "resume-text"}>Resume</Label>
                <div className="inline-flex rounded-full border border-stone bg-white/60 p-0.5 text-xs">
                  {(["pdf", "text"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={resumeMode === mode}
                      onClick={() => setResumeMode(mode)}
                      className={cn(
                        "rounded-full px-3 py-1 transition-colors",
                        resumeMode === mode ? "bg-forest text-white" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {mode === "pdf" ? "Upload PDF" : "Paste text"}
                    </button>
                  ))}
                </div>
              </div>

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
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      selectFile(e.dataTransfer.files[0]);
                    }}
                    className="w-full rounded-2xl border border-dashed border-sage/60 bg-white/50 px-5 py-6 text-sm text-muted-foreground shadow-sm transition-colors hover:border-sage hover:bg-white/80"
                  >
                    {resumeFile ? (
                      <span className="font-medium text-foreground">{resumeFile.name}</span>
                    ) : (
                      "Drop your resume PDF here, or click to choose (4 MB max)"
                    )}
                  </button>
                  {resumeFile && (
                    <button
                      type="button"
                      onClick={() => setResumeFile(null)}
                      className="px-1 text-xs text-muted-foreground underline-offset-4 hover:text-terracotta hover:underline"
                    >
                      Remove file
                    </button>
                  )}
                </>
              ) : (
                <Textarea
                  id="resume-text"
                  placeholder="Paste resume text"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  className={cn(fieldClassName, "min-h-40 max-h-72 overflow-y-auto py-4")}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="github-url" className="px-1">
                GitHub profile <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="github-url"
                placeholder="https://github.com/username"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className={cn(fieldClassName, "h-12 rounded-full")}
              />
            </div>

          </div>

          <Button  className="h-12 px-10 rounded-full bg-forest text-white text-sm uppercase tracking-widest font-semibold shadow-md hover:bg-terracotta hover:shadow-lg transition-all duration-300" onClick={onSubmit} disabled={loading}>
            {loading ? "Reading your resume..." : "Start Interview"}

          </Button>

          <p className="text-xs text-muted-foreground/50">Free · No account required · 5 min practice sessions</p>
        </div>
      </div>
    </>
  );
}

export default Form;
