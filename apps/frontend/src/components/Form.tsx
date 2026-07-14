import "@/../styles/globals.css";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/config";
import { useNavigate } from "react-router-dom";

export function Form() {

  const navigate = useNavigate();


  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    console.log("Clicked");
    console.log({
      githubUrl,
    });
    if (!githubUrl) {
      toast("Please enter both LinkedIn and GitHub URLs");
      return;
    }
    console.log("Sending request...");
    const response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {

      githubUrl,
    });
    navigate(`/interview/${response.data.id}`);
    console.log("Done");
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
      <div className="h-screen w-screen flex justify-center items-center p-6">
        <div className="w-full max-w-md mx-auto flex flex-col items-center text-center gap-10">
          <div className="space-y-3">
            <h1 className="font-heading text-5xl md:text-6xl font-semibold text-foreground leading-tight">
              <span className="italic">fit</span>for
              <span className="italic">the</span>role
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-xs mx-auto">
              Practice interviewing with AI. Get real-time feedback. Land your next role.
            </p>
          </div>

          <div className="w-full space-y-4">

            <Input
              placeholder="GitHub profile URL"
              value={githubUrl}
              onChange={(e) => {
                console.log(e.target.value);
                setGithubUrl(e.target.value);
              }}
              className="h-12 rounded-full border border-stone bg-white/70 px-5 text-foreground placeholder:text-muted-foreground/60 shadow-sm backdrop-blur-sm focus-visible:border-sage focus-visible:ring-sage/20"
            />


          </div>

          <Button  className="h-12 px-10 rounded-full bg-forest text-white text-sm uppercase tracking-widest font-semibold shadow-md hover:bg-terracotta hover:shadow-lg transition-all duration-300" onClick={onSubmit} disabled={loading}>
            {loading ? "Starting..." : "Start Interview"}

          </Button>

          <p className="text-xs text-muted-foreground/50">Free · No account required · 5 min practice sessions</p>
        </div>
      </div>
    </>
  );
}

export default Form;
