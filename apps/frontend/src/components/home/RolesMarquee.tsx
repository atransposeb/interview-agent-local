import { cn } from "@/lib/utils";

const ROLES = [
    "Frontend Engineer",
    "Product Manager",
    "Data Analyst",
    "UX Designer",
    "Backend Engineer",
    "Marketing Manager",
    "Customer Success Lead",
    "DevOps Engineer",
    "Sales Development Rep",
    "Data Scientist",
    "Engineering Manager",
    "Content Strategist",
];

const TINTS = ["bg-mist", "bg-butter", "bg-lilac", "bg-leaf", "bg-blush"];

export function RolesMarquee() {
    return (
        <section className="py-8">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-moss">
                Tailored to whatever role you paste in
            </p>
            <div className="mask-fade-x mt-5 overflow-hidden">
                <ul className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
                    {[...ROLES, ...ROLES].map((role, index) => (
                        <li
                            key={index}
                            aria-hidden={index >= ROLES.length ? true : undefined}
                            className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-forest", TINTS[(index % ROLES.length) % TINTS.length])}
                        >
                            {role}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
