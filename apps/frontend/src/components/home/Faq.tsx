import { ChevronDown } from "lucide-react";
import { SectionHeading } from "@/components/site/SectionHeading";
import { API_KEY_HELP_URL } from "@/lib/apiKey";

const QUESTIONS = [
    {
        question: "Why do I need a Gemini API key?",
        answer: (
            <>
                The voice interview, resume reading, and scoring all run on Google's Gemini models, and your key pays for your
                own usage under Google's terms. You can create one in{" "}
                <a href={API_KEY_HELP_URL} target="_blank" rel="noreferrer" className="font-semibold text-forest underline underline-offset-4">
                    Google AI Studio
                </a>
                ; check there for current free-tier limits and pricing.
            </>
        ),
    },
    {
        question: "Is my API key safe?",
        answer: "Your key stays in your browser, kept for the current tab unless you choose to remember it on this device. It's sent to this app's server with each request, which uses it to call Gemini for you and never saves it. You can remove it at any time.",
    },
    {
        question: "How long is an interview?",
        answer: "Five minutes on the clock. When time is up, the interviewer wraps up and your report is generated straight away. You can end early at any point.",
    },
    {
        question: "What does the interviewer know about me?",
        answer: "It reads the job description, your resume, and, if you add it, your public GitHub repositories. That's what lets it ask about your actual projects instead of generic questions.",
    },
    {
        question: "How am I scored?",
        answer: "Your answers are scored from 1 to 10 on relevance, clarity, depth, and role fit. The overall score out of 100 is their average, scaled up. Each question also gets its own score and feedback.",
    },
    {
        question: "Which browsers work?",
        answer: "Chrome or Edge on a computer works best. You'll be asked to allow microphone access when you switch on your mic.",
    },
    {
        question: "Who can see my report?",
        answer: "There are no accounts. Each report lives at its own link, and anyone with that link can open it, so share it only with people you trust.",
    },
];

export function Faq() {
    return (
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-24 sm:px-6">
            <SectionHeading eyebrow="FAQ" accent="pine" title="Questions, answered" />
            <div className="mt-12 space-y-3">
                {QUESTIONS.map(({ question, answer }) => (
                    <details
                        key={question}
                        className="group rounded-3xl border border-stone bg-white/80 px-6 shadow-xs transition-shadow open:bg-white open:shadow-md"
                    >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold text-forest [&::-webkit-details-marker]:hidden">
                            {question}
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sand transition-transform duration-300 group-open:rotate-180">
                                <ChevronDown className="size-4" aria-hidden="true" />
                            </span>
                        </summary>
                        <p className="pb-6 leading-relaxed text-moss">{answer}</p>
                    </details>
                ))}
            </div>
        </section>
    );
}
