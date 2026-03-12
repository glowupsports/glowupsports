import React from "react";
import { Trophy, TrendingUp, Zap, BarChart3, ChevronRight, Star } from "lucide-react";

export default function LandingDarkElite() {
  return (
    <div className="w-full min-h-[2000px] font-sans text-gray-300" style={{ backgroundColor: '#0A0A14' }}>
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 w-full backdrop-blur-md border-b border-white/10" style={{ backgroundColor: 'rgba(10, 10, 20, 0.8)' }}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎾</span>
            <span className="text-white font-bold text-xl tracking-tight">Glow Up Tennis</span>
            <span className="px-2 py-1 text-[10px] font-bold tracking-wider rounded bg-white/10 text-white">DUBAI</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#" className="hover:text-white transition-colors">Features</a>
            <a href="#" className="hover:text-white transition-colors">Academies</a>
            <a href="#" className="hover:text-white transition-colors">Leaderboard</a>
          </div>
          <div className="flex items-center gap-4">
            <button className="px-5 py-2 rounded-full text-sm font-bold border border-[#C8FF3D] text-[#C8FF3D] hover:bg-[#C8FF3D]/10 transition-colors">
              Login
            </button>
            <button className="px-5 py-2 rounded-full text-sm font-bold bg-[#C8FF3D] text-black hover:bg-[#b0eb20] transition-colors">
              Download App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A14] to-[#0F1A0A] -z-10" />
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#C8FF3D]/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm">
              <Zap className="w-4 h-4 text-[#C8FF3D]" />
              <span className="text-white">Level up your game</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-extrabold text-white leading-[1.1] tracking-tight">
              The World's First <br />
              <span className="text-[#C8FF3D]">RPG Tennis</span> Platform
            </h1>
            <p className="text-xl text-gray-400 max-w-lg leading-relaxed">
              Transform your training into an epic quest. Track stats, earn XP, and climb the Dubai ranks to become an Elite Player.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-4">
              <button className="px-8 py-4 rounded-full text-lg font-bold bg-[#C8FF3D] text-black hover:bg-[#b0eb20] transition-transform hover:scale-105 flex items-center gap-2">
                Start Your Journey
                <ChevronRight className="w-5 h-5" />
              </button>
              <button className="px-8 py-4 rounded-full text-lg font-bold border border-white/20 text-white hover:bg-white/5 transition-colors">
                View Leaderboard
              </button>
            </div>
          </div>

          <div className="relative">
            {/* Stats Card */}
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#C8FF3D] to-transparent opacity-50" />
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-white text-2xl font-bold mb-1">Player Card</h3>
                  <p className="text-gray-400 text-sm">Lv. 42 • Striker Class</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[#C8FF3D] font-black text-4xl">891</span>
                  <span className="text-xs uppercase tracking-wider font-bold text-gray-500">Glow Score</span>
                </div>
              </div>

              <div className="inline-block px-3 py-1 bg-gradient-to-r from-[#C8FF3D]/20 to-transparent border border-[#C8FF3D]/30 rounded text-[#C8FF3D] text-xs font-bold uppercase tracking-widest mb-8">
                Elite Player
              </div>

              <div className="space-y-5">
                {[
                  { label: "Forehand", score: 92 },
                  { label: "Backhand", score: 88 },
                  { label: "Serve", score: 85 },
                  { label: "Volley", score: 94 },
                  { label: "Movement", score: 87 },
                  { label: "Game IQ", score: 91 },
                ].map(skill => (
                  <div key={skill.label}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-300 font-medium">{skill.label}</span>
                      <span className="text-white font-bold">{skill.score}</span>
                    </div>
                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#8bd61c] to-[#C8FF3D] rounded-full" 
                        style={{ width: `${skill.score}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-white/10 text-center">
            <div className="px-4">
              <div className="text-5xl font-black text-[#C8FF3D] mb-2">500+</div>
              <div className="text-gray-400 uppercase tracking-widest text-sm font-bold">Active Players</div>
            </div>
            <div className="px-4 py-8 md:py-0">
              <div className="text-5xl font-black text-[#C8FF3D] mb-2">12</div>
              <div className="text-gray-400 uppercase tracking-widest text-sm font-bold">Prestige Levels</div>
            </div>
            <div className="px-4">
              <div className="text-5xl font-black text-[#C8FF3D] mb-2">6</div>
              <div className="text-gray-400 uppercase tracking-widest text-sm font-bold">Skill Pillars</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Train Like a Champion. <br/>Play Like a Legend.</h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">We've gamified every aspect of your tennis journey to help you reach your maximum potential.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors group">
              <div className="w-14 h-14 bg-[#C8FF3D]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-[#C8FF3D]" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">AI Skill Analysis</h3>
              <p className="text-gray-400 leading-relaxed">
                Record your matches and get instant feedback on your technique, positioning, and shot selection.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-[#C8FF3D]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-14 h-14 bg-[#C8FF3D]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative z-10">
                <Trophy className="w-7 h-7 text-[#C8FF3D]" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 relative z-10">RPG Progression System</h3>
              <p className="text-gray-400 leading-relaxed relative z-10">
                Earn XP for every practice session, match played, and drill completed. Level up your player avatar.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors group">
              <div className="w-14 h-14 bg-[#C8FF3D]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-[#C8FF3D]" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Live Analytics Dashboard</h3>
              <p className="text-gray-400 leading-relaxed">
                Monitor your win/loss ratios, head-to-head stats against academy rivals, and track your global ranking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6 bg-black/40 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-16">Trusted by Dubai's Elite Academies</h2>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl relative">
              <Star className="absolute top-8 right-8 w-6 h-6 text-[#C8FF3D]/20" />
              <div className="flex gap-1 mb-6">
                {[...Array(5)].map((_,i) => <Star key={i} className="w-5 h-5 text-[#C8FF3D] fill-[#C8FF3D]" />)}
              </div>
              <p className="text-lg text-gray-300 italic mb-8">"Since integrating Glow Up Tennis, my students are 3x more motivated to complete their drills. The RPG elements completely changed how they approach training."</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-white font-bold text-xl">
                  JD
                </div>
                <div>
                  <div className="text-white font-bold">James Davis</div>
                  <div className="text-[#C8FF3D] text-sm">Head Coach, Elite Tennis DXB</div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl relative">
              <Star className="absolute top-8 right-8 w-6 h-6 text-[#C8FF3D]/20" />
              <div className="flex gap-1 mb-6">
                {[...Array(5)].map((_,i) => <Star key={i} className="w-5 h-5 text-[#C8FF3D] fill-[#C8FF3D]" />)}
              </div>
              <p className="text-lg text-gray-300 italic mb-8">"The player cards and stats tracking give our academy a professional feel. Players love seeing their 'Glow Score' go up after tournament weekends."</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-white font-bold text-xl">
                  MK
                </div>
                <div>
                  <div className="text-white font-bold">Maria K.</div>
                  <div className="text-[#C8FF3D] text-sm">Director, Ace Academy</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto bg-[#C8FF3D] rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
          {/* subtle pattern */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 2px, transparent 2px)', backgroundSize: '24px 24px' }} />
          
          <h2 className="text-4xl md:text-6xl font-black text-black mb-6 relative z-10 tracking-tight">Ready to Step Onto the Court?</h2>
          <p className="text-xl text-black/70 font-medium mb-10 max-w-2xl mx-auto relative z-10">
            Join hundreds of players in Dubai already leveling up their game.
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4 relative z-10">
            <button className="px-8 py-4 rounded-full text-lg font-bold bg-black text-white hover:bg-gray-900 transition-transform hover:scale-105">
              Download the App
            </button>
            <button className="px-8 py-4 rounded-full text-lg font-bold border-2 border-black text-black hover:bg-black/5 transition-colors">
              Academy Signup
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🎾</span>
              <span className="text-white font-bold text-xl tracking-tight">Glow Up Tennis</span>
            </div>
            <p className="text-gray-500 max-w-sm">The world's first RPG tennis platform. Elevating the game for players and academies in Dubai and beyond.</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Platform</h4>
            <ul className="space-y-3 text-gray-500 text-sm">
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Leaderboard</a></li>
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">For Academies</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Legal</h4>
            <ul className="space-y-3 text-gray-500 text-sm">
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Cookie Policy</a></li>
              <li><a href="#" className="hover:text-[#C8FF3D] transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-white/10 text-center text-gray-600 text-sm">
          © {new Date().getFullYear()} Glow Up Tennis. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
