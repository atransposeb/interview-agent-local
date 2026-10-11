import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinalCta() {
    return (
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
            <div className="relative overflow-hidden rounded-[2.5rem] bg-forest px-6 py-16 text-center text-white shadow-2xl shadow-forest/20 sm:px-12 sm:py-20">
                <div aria-hidden="true" className="absolute -left-20 -top-20 size-72 rounded-full bg-lake/35 blur-3xl" />
                <div aria-hidden="true" className="absolute -bottom-24 -right-16 size-80 rounded-full bg-ochre/30 blur-3xl" />
                <div aria-hidden="true" className="absolute -bottom-32 left-1/4 size-64 rounded-full bg-heather/25 blur-3xl" />
                <div aria-hidden="true" className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:22px_22px]" />
                <div className="relative mx-auto max-w-2xl">
                    <h2 className="font-heading text-4xl font-semibold leading-tight sm:text-5xl">
                        Your next interview starts with <span className="italic">this one</span>.
                    </h2>
                    <p className="mt-5 text-lg leading-relaxed text-sage-light">
                        Five minutes of practice today means fewer surprises when it matters.
                    </p>
                    <Button asChild className="mt-9 h-13 rounded-full bg-warm px-8 text-base text-forest hover:bg-white">
                        <a href="#setup">
                            Set up my interview <ArrowRight />
                        </a>
                    </Button>
                </div>
            </div>
        </section>
    );
}
