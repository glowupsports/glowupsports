import React from "react";
import { ArrowRight } from "lucide-react";

export default function LandingBoldAthletic() {
  return (
    <div className="bg-black min-h-[2000px] font-sans text-white selection:bg-[#FFD700] selection:text-black overflow-x-hidden">
      {/* Sticky Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black flex items-center justify-between px-6 py-4 md:px-12 border-b border-[#111]">
        <div className="text-[#FFD700] font-black tracking-tighter text-xl uppercase">
          GLOW UP
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-sm font-bold tracking-wide">Features</a>
          <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-sm font-bold tracking-wide">Method</a>
          <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-sm font-bold tracking-wide">Coaches</a>
        </div>
        <div className="flex items-center gap-6">
          <button className="text-[#FFD700] hover:text-white transition-colors uppercase text-sm font-bold tracking-wide">
            Login
          </button>
          <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-sm font-bold tracking-wide">
            Download
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center bg-black pt-20">
        {/* Yellow Diagonal Stripe */}
        <div 
          className="absolute top-0 left-0 h-full w-[30%] bg-[#FFD700] z-0"
          style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
        />
        
        <div className="container mx-auto px-6 md:px-12 relative z-10 flex justify-end w-full">
          <div className="max-w-2xl text-right">
            <h1 className="text-[80px] md:text-[100px] font-black leading-[0.85] tracking-[-0.04em] text-white uppercase mb-8">
              TENNIS.<br />
              TRACKED.<br />
              PERFECTED.
            </h1>
            <p className="text-[#888] text-xl md:text-2xl font-medium mb-10 max-w-lg ml-auto">
              The ultimate performance OS for Dubai's elite academies.
            </p>
            <button className="bg-[#FFD700] hover:bg-white text-black px-10 py-5 uppercase font-black tracking-widest text-lg transition-colors inline-flex items-center gap-3">
              Start Dominating <ArrowRight size={24} strokeWidth={3} />
            </button>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="bg-[#111111] py-20 border-y border-[#222]">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left divide-y md:divide-y-0 md:divide-x divide-[#333]">
            <div className="md:px-8 first:pl-0 last:pr-0 pt-8 md:pt-0 first:pt-0">
              <div className="text-[#FFD700] text-6xl md:text-8xl font-black tracking-tighter leading-none mb-2">500+</div>
              <div className="text-[#888] uppercase font-bold tracking-widest text-sm">Active Players</div>
            </div>
            <div className="md:px-8 pt-8 md:pt-0">
              <div className="text-[#FFD700] text-6xl md:text-8xl font-black tracking-tighter leading-none mb-2">12</div>
              <div className="text-[#888] uppercase font-bold tracking-widest text-sm">Skill Levels</div>
            </div>
            <div className="md:px-8 pt-8 md:pt-0">
              <div className="text-[#FFD700] text-6xl md:text-8xl font-black tracking-tighter leading-none mb-2">#1</div>
              <div className="text-[#888] uppercase font-bold tracking-widest text-sm">In Dubai</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-32 bg-[#0D0D0D]">
        <div className="container mx-auto px-6 md:px-12 max-w-5xl">
          <div className="space-y-24">
            <div className="grid md:grid-cols-[100px_1fr] gap-6 md:gap-12 items-start group">
              <div className="text-[#FFD700] text-[48px] font-black leading-none group-hover:scale-110 transition-transform origin-left">01</div>
              <div>
                <h3 className="text-white text-[24px] font-bold uppercase tracking-tight mb-4">Flawless Match Tracking</h3>
                <p className="text-[#888] text-lg leading-relaxed max-w-2xl">
                  Log every set, game, and point with brutal efficiency. Zero friction data entry designed for the court, not the office.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-[100px_1fr] gap-6 md:gap-12 items-start group">
              <div className="text-[#FFD700] text-[48px] font-black leading-none group-hover:scale-110 transition-transform origin-left">02</div>
              <div>
                <h3 className="text-white text-[24px] font-bold uppercase tracking-tight mb-4">Academy Intelligence</h3>
                <p className="text-[#888] text-lg leading-relaxed max-w-2xl">
                  See the matrix of your entire academy. Player progression, coach utilization, and court metrics visualized in real-time.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-[100px_1fr] gap-6 md:gap-12 items-start group">
              <div className="text-[#FFD700] text-[48px] font-black leading-none group-hover:scale-110 transition-transform origin-left">03</div>
              <div>
                <h3 className="text-white text-[24px] font-bold uppercase tracking-tight mb-4">Elite Progression Framework</h3>
                <p className="text-[#888] text-lg leading-relaxed max-w-2xl">
                  A ruthlessly structured 12-tier methodology. Players know exactly where they stand and exactly what it takes to level up.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="py-32 bg-black px-6 md:px-12 flex items-center justify-center min-h-[50vh]">
        <div className="max-w-4xl text-center">
          <h2 className="text-4xl md:text-6xl font-light italic text-white leading-tight mb-12 tracking-tight">
            "We replaced spreadsheets with Glow Up. The speed, the clarity, the sheer aggression of the platform—it transformed how we train."
          </h2>
          <div className="text-[#FFD700] uppercase font-bold tracking-widest">— Head Coach, Elite Tennis Dubai</div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 bg-[#0D0D0D] border-t border-[#222]">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-12">
            Ready to Evolve?
          </h2>
          <button className="bg-[#FFD700] hover:bg-white text-black px-12 py-6 uppercase font-black tracking-widest text-xl transition-colors inline-flex items-center gap-4">
            Get The App <ArrowRight size={28} strokeWidth={3} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-12 border-t border-[#111] px-6 md:px-12">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-[#FFD700] font-black tracking-tighter text-2xl uppercase">
            GLOW UP TENNIS
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-xs font-bold tracking-widest">Instagram</a>
            <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-xs font-bold tracking-widest">Twitter</a>
            <a href="#" className="text-[#888] hover:text-white transition-colors uppercase text-xs font-bold tracking-widest">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
