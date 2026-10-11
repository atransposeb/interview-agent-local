import { Wordmark } from "@/components/site/Wordmark";
import { API_KEY_HELP_URL } from "@/lib/apiKey";

export function SiteFooter() {
    return (
        <footer className="border-t border-stone/80 bg-white/40 print:hidden">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
                <div className="space-y-3">
                    <Wordmark />
                    <p className="max-w-xs text-sm leading-relaxed text-moss">
                        Practice a live voice interview for the role you want, then read exactly what to sharpen.
                    </p>
                </div>
                <div className="space-y-3 text-sm">
                    <p className="font-semibold text-forest">Practice</p>
                    <ul className="space-y-2 text-moss">
                        <li>
                            <a href="/#how" className="hover:text-forest">How it works</a>
                        </li>
                        <li>
                            <a href="/#setup" className="hover:text-forest">Start an interview</a>
                        </li>
                        <li>
                            <a href="/#report" className="hover:text-forest">Sample report</a>
                        </li>
                    </ul>
                </div>
                <div className="space-y-3 text-sm">
                    <p className="font-semibold text-forest">Help</p>
                    <ul className="space-y-2 text-moss">
                        <li>
                            <a href="/#faq" className="hover:text-forest">FAQ</a>
                        </li>
                        <li>
                            <a href={API_KEY_HELP_URL} target="_blank" rel="noreferrer" className="hover:text-forest">
                                Get a Gemini API key
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-stone/70">
                <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-moss sm:px-6">
                    Voice interviews and scoring run on Google Gemini.
                </p>
            </div>
        </footer>
    );
}
