import AnnouncementBar from "@/components/sections/AnnouncementBar";
import Header from "@/components/sections/Header";
import Hero from "@/components/sections/Hero";
import EarningsCalculator from "@/components/sections/EarningsCalculator";
import Features from "@/components/sections/Features";
import JobDemo from "@/components/sections/JobDemo";
import LiveDemand from "@/components/sections/LiveDemand";
import PayoutFeed from "@/components/sections/PayoutFeed";
import HardwareCatalogue from "@/components/sections/HardwareCatalogue";
import DashboardPreview from "@/components/sections/DashboardPreview";
import Setup from "@/components/sections/Setup";
import Faq from "@/components/sections/Faq";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
        <EarningsCalculator />
        <Features />
        <JobDemo />
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-20 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
            <LiveDemand />
            <PayoutFeed />
          </div>
        </section>
        <HardwareCatalogue />
        <DashboardPreview />
        <Setup />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
