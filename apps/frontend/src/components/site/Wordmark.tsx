import { AudioLines } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
    return (
        <Link to="/" aria-label="fitfortherole home" className={cn("group inline-flex items-center gap-2.5", className)}>
            <span className="grid size-9 place-items-center rounded-full bg-forest text-white shadow-sm shadow-forest/20 transition-transform duration-300 group-hover:-rotate-12">
                <AudioLines className="size-4.5" />
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight text-forest">
                <span className="italic">fit</span>for<span className="italic">the</span>role
            </span>
        </Link>
    );
}
