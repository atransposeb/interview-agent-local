import { Faq } from "@/components/home/Faq";
import { FinalCta } from "@/components/home/FinalCta";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ReportPreview } from "@/components/home/ReportPreview";
import { RolesMarquee } from "@/components/home/RolesMarquee";
import { SetupForm } from "@/components/home/SetupForm";
import { Backdrop } from "@/components/site/Backdrop";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export function Home() {
    return (
        <div className="relative isolate min-h-screen w-full overflow-x-clip">
            <Backdrop />
            <SiteHeader home />
            <main>
                <Hero />
                <RolesMarquee />
                <HowItWorks />
                <SetupForm />
                <ReportPreview />
                <Faq />
                <FinalCta />
            </main>
            <SiteFooter />
        </div>
    );
}

export default Home;
