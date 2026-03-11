import React from "react";
import { 
  Bell, 
  Calendar, 
  Users, 
  MessageSquare, 
  Settings, 
  Play,
  TrendingUp,
  Wallet,
  Star,
  Clock,
  AlertCircle,
  Gift,
  CheckCircle2
} from "lucide-react";

export function CoachCockpit() {
  return (
    <div className="min-h-screen bg-[#0B0D10] text-white font-sans overflow-x-hidden pb-24 selection:bg-[#C8FF3D] selection:text-black">
      {/* HEADER */}
      <header className="px-5 pt-12 pb-4 flex items-center justify-between bg-gradient-to-b from-[#11141A] to-transparent sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&h=150" 
              alt="Coach Marcus" 
              className="w-10 h-10 rounded-full border-2 border-[#171B22] object-cover"
            />
            <div className="absolute -bottom-1 -right-1 bg-[#C8FF3D] text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
              LVL 12
            </div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white uppercase">Coach Marcus</h1>
            <span className="text-[10px] text-[#7C8290] uppercase tracking-wider font-medium">Glow Up Academy</span>
          </div>
        </div>
        <button className="relative p-2 rounded-full bg-[#11141A] border border-[#171B22] text-[#B8BCC6] hover:text-white transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-0 right-0 w-3 h-3 bg-[#C8FF3D] text-black text-[8px] font-bold flex items-center justify-center rounded-full border border-[#11141A]">
            3
          </span>
        </button>
      </header>

      {/* STAT RIBBON */}
      <div className="px-5 mt-2 mb-8">
        <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar snap-x">
          <div className="snap-start shrink-0 min-w-[110px] bg-[#11141A] border border-[#171B22] rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[#7C8290]">
              <Calendar className="w-3 h-3" />
              <span className="text-[9px] uppercase tracking-widest font-semibold">Today</span>
            </div>
            <div className="text-xl font-black text-white">3 <span className="text-xs text-[#7C8290] font-medium tracking-normal">Sess</span></div>
          </div>
          
          <div className="snap-start shrink-0 min-w-[110px] bg-[#11141A] border border-[#171B22] rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[#7C8290]">
              <Users className="w-3 h-3" />
              <span className="text-[9px] uppercase tracking-widest font-semibold">Players</span>
            </div>
            <div className="text-xl font-black text-white">15</div>
          </div>

          <div className="snap-start shrink-0 min-w-[130px] bg-[#11141A] border border-[#171B22] rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[#7C8290]">
              <Wallet className="w-3 h-3" />
              <span className="text-[9px] uppercase tracking-widest font-semibold">Earnings</span>
            </div>
            <div className="text-xl font-black text-[#C8FF3D]">12.4<span className="text-xs text-[#7C8290] font-medium tracking-normal ml-0.5">k AED</span></div>
          </div>

          <div className="snap-start shrink-0 min-w-[130px] bg-[#11141A] border border-[#171B22] rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[#7C8290]">
              <Star className="w-3 h-3" />
              <span className="text-[9px] uppercase tracking-widest font-semibold">XP</span>
            </div>
            <div className="text-xl font-black text-white">2.4<span className="text-xs text-[#7C8290] font-medium tracking-normal ml-0.5">k / 3k</span></div>
            <div className="w-full h-1 bg-[#171B22] rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-[#00D4FF] rounded-full" style={{ width: '81%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* TIMELINE */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[11px] text-[#7C8290] font-bold uppercase tracking-widest">Performance Schedule</h2>
          <div className="flex items-center gap-1 text-[#C8FF3D] bg-[#C8FF3D]/10 px-2 py-1 rounded-sm">
            <Clock className="w-3 h-3" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Next in 2h 15m</span>
          </div>
        </div>

        <div className="relative pl-14 flex flex-col gap-6">
          {/* Vertical Line */}
          <div className="absolute left-[38px] top-2 bottom-4 w-px bg-[#171B22] -z-10"></div>

          {/* Alert Chip: Birthday */}
          <div className="relative -ml-10">
            <div className="flex items-center gap-2 bg-[#11141A] border border-[#00D4FF]/20 px-3 py-2 rounded-lg self-start w-fit">
              <Gift className="w-3.5 h-3.5 text-[#00D4FF]" />
              <span className="text-xs font-medium text-white">Amelia Chen turns 9 today!</span>
            </div>
          </div>

          {/* Session 1 (Past/Completed) */}
          <div className="relative">
            <div className="absolute -left-14 top-1 text-right w-10">
              <span className="text-xs font-bold text-[#7C8290]">09:00</span>
              <span className="block text-[9px] text-[#7C8290] font-medium">AM</span>
            </div>
            {/* Timeline node */}
            <div className="absolute -left-[23px] top-2 w-3 h-3 rounded-full bg-[#0B0D10] border-2 border-[#171B22] flex items-center justify-center">
              <CheckCircle2 className="w-2.5 h-2.5 text-[#7C8290]" />
            </div>

            <div className="bg-[#11141A] border border-[#171B22] rounded-xl p-4 opacity-60 grayscale-[50%]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FFB020]"></div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Group Session</span>
                </div>
                <span className="text-[10px] text-[#7C8290] font-medium bg-[#171B22] px-2 py-0.5 rounded-sm">60 MIN</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-[#B8BCC6]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500 border border-black"></div>
                  <span className="font-medium text-white">Blue Ball</span>
                </div>
                <div className="w-px h-3 bg-[#171B22]"></div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#7C8290]" />
                  <span className="font-medium">6 Players</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Alert */}
          <div className="relative -ml-10">
            <div className="flex items-center gap-2 bg-[#11141A] border border-[#FFB020]/20 px-3 py-2 rounded-lg self-start w-fit">
              <AlertCircle className="w-3.5 h-3.5 text-[#FFB020]" />
              <span className="text-xs font-medium text-[#FFB020]">2 sessions need feedback</span>
            </div>
          </div>

          {/* Session 2 (Next/Live) */}
          <div className="relative">
            <div className="absolute -left-14 top-1 text-right w-10">
              <span className="text-xs font-black text-white">11:00</span>
              <span className="block text-[9px] text-[#C8FF3D] font-bold">AM</span>
            </div>
            {/* Timeline node */}
            <div className="absolute -left-[23px] top-2 w-3 h-3 rounded-full bg-[#C8FF3D] border-2 border-[#0B0D10] shadow-[0_0_8px_rgba(200,255,61,0.5)]"></div>

            <div className="bg-[#11141A] border-l-2 border-l-[#C8FF3D] border-y border-r border-y-[#171B22] border-r-[#171B22] rounded-xl rounded-l-sm p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#C8FF3D]/5 blur-2xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>
              
              <div className="flex items-start justify-between mb-3 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#C8FF3D]"></div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Private Session</span>
                </div>
                <span className="text-[10px] text-black font-bold bg-[#C8FF3D] px-2 py-0.5 rounded-sm">UP NEXT</span>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-[#B8BCC6] mb-4 relative z-10">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500 border border-black"></div>
                  <span className="font-medium text-white">Green Ball</span>
                </div>
                <div className="w-px h-3 bg-[#171B22]"></div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#7C8290]" />
                  <span className="font-medium">1 Player</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2 pt-3 border-t border-[#171B22] relative z-10">
                 <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=50&h=50" className="w-6 h-6 rounded-full object-cover" />
                 <span className="text-xs font-medium text-white">Sarah Jenkins</span>
              </div>
            </div>
          </div>

          {/* Session 3 */}
          <div className="relative">
            <div className="absolute -left-14 top-1 text-right w-10">
              <span className="text-xs font-bold text-[#7C8290]">03:00</span>
              <span className="block text-[9px] text-[#7C8290] font-medium">PM</span>
            </div>
            {/* Timeline node */}
            <div className="absolute -left-[23px] top-2 w-3 h-3 rounded-full bg-[#11141A] border-2 border-[#171B22]"></div>

            <div className="bg-[#11141A] border border-[#171B22] rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FFB020]"></div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Group Session</span>
                </div>
                <span className="text-[10px] text-[#7C8290] font-medium bg-[#171B22] px-2 py-0.5 rounded-sm">90 MIN</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-[#B8BCC6]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-black"></div>
                  <span className="font-medium text-white">Red Ball</span>
                </div>
                <div className="w-px h-3 bg-[#171B22]"></div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#7C8290]" />
                  <span className="font-medium">8 Players</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0B0D10] via-[#0B0D10] to-transparent z-50">
        <div className="flex items-center justify-between bg-[#11141A]/90 backdrop-blur-md border border-[#171B22] rounded-full p-2 max-w-sm mx-auto shadow-2xl">
          <button className="p-3 text-[#7C8290] hover:text-white transition-colors rounded-full">
            <Calendar className="w-5 h-5" />
          </button>
          <button className="p-3 text-[#7C8290] hover:text-white transition-colors rounded-full">
            <Users className="w-5 h-5" />
          </button>
          
          <button className="flex items-center justify-center gap-2 bg-[#C8FF3D] text-black px-6 py-3 rounded-full font-bold shadow-[0_0_15px_rgba(200,255,61,0.3)] hover:scale-105 transition-transform">
            <Play className="w-4 h-4 fill-black" />
            <span className="text-xs uppercase tracking-wider">Start</span>
          </button>
          
          <button className="p-3 text-[#7C8290] hover:text-white transition-colors rounded-full relative">
            <MessageSquare className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#FFB020] rounded-full"></span>
          </button>
          <button className="p-3 text-[#7C8290] hover:text-white transition-colors rounded-full">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

    </div>
  );
}
