import Ticker from "@/components/sections/Ticker";
import Header from "@/components/sections/Header";
import Hero from "@/components/sections/Hero";
import Statement from "@/components/sections/Statement";
import HowItWorks from "@/components/sections/HowItWorks";
import EarnMode from "@/components/sections/EarnMode";
import Calculator from "@/components/sections/Calculator";
import Network from "@/components/sections/Network";
import Sandbox from "@/components/sections/Sandbox";
import Faq from "@/components/sections/Faq";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Ticker />
      <Header />
      <main>
        <Hero />
        <Statement />
        <HowItWorks />
        <EarnMode />
        <Calculator />
        <Network />
        <Sandbox />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
