import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/site/Wordmark";
import { Button } from "@/components/ui/button";

const HOME_LINKS = [
    { href: "#how", label: "How it works" },
    { href: "#report", label: "Your report" },
    { href: "#faq", label: "FAQ" },
];

/**
 * Sticky top bar. The home page shows section links and a call to action;
 * other pages pass their own actions.
 */
export function SiteHeader({ home = false, actions }: { home?: boolean; actions?: ReactNode }) {
    return (
        <header className="sticky top-0 z-40 border-b border-stone/70 bg-warm/80 backdrop-blur-md print:hidden">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                <Wordmark />
                {home && (
                    <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
                        {HOME_LINKS.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className="rounded-full px-3.5 py-2 text-sm font-medium text-moss transition-colors hover:bg-sand hover:text-forest"
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>
                )}
                <div className="flex items-center gap-2">
                    {actions ??
                        (home && (
                            <Button asChild className="h-10 rounded-full bg-forest px-5 text-white hover:bg-forest-deep">
                                <a href="#setup">
                                    Start practicing <ArrowRight />
                                </a>
                            </Button>
                        ))}
                </div>
            </div>
        </header>
    );
}
