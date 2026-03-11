import React from "react";
import { 
  Bell, 
  Settings, 
  ChevronRight, 
  Play, 
  Clock, 
  AlertCircle, 
  Gift, 
  Users, 
  User, 
  TrendingUp, 
  Wallet,
  Calendar,
  CheckCircle2,
  Activity
} from "lucide-react";

export function LiveCourt() {
  return (
    <div className="min-h-screen bg-[#0B0D10] text-white font-sans w-full max-w-[390px] mx-auto relative overflow-hidden flex flex-col pb-10 shadow-2xl">
      {/* Top Navigation */}
      <div className="px-5 pt-12 pb-4 flex justify-between items-center z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#171B22] border border-[#2A2E37] flex items-center justify-center overflow-hidden">
            {/* Avatar placeholder */}
            <img src="https://i.pravatar.cc/150?u=coach" alt="Coach Marcus" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight">Coach Marcus</h1>
              <span className="bg-[#171B22] text-[#C8FF3D] text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">LVL 12</span>
            </div>
            <p className="text-[#7C8290] text-xs">Glow Up Tennis Academy</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="relative w-10 h-10 rounded-full bg-[#11141A] flex items-center justify-center border border-white/5">
            <Bell size={18} className="text-[#B8BCC6]" />
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-[#C8FF3D] rounded-full ring-2 ring-[#11141A]"></span>
          </button>
          <button className="w-10 h-10 rounded-full bg-[#11141A] flex items-center justify-center border border-white/5">
            <Settings size={18} className="text-[#B8BCC6]" />
          </button>
        </div>
      </div>

      {/* HERO: Live Session / Immersive Court */}
      <div className="px-4 mt-2 mb-6">
        <div className="relative rounded-3xl overflow-hidden bg-[#11141A] border border-[#C8FF3D]/20 shadow-[0_0_40px_rgba(200,255,61,0.05)]">
          {/* Subtle gradient effect for Private session (green) */}
          <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-[#C8FF3D]/10 to-transparent"></div>
          
          <div className="p-6 relative z-10 flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-1.5 bg-[#C8FF3D]/10 text-[#C8FF3D] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-[#C8FF3D]/20">
              <span className="w-2 h-2 rounded-full bg-[#C8FF3D] animate-pulse"></span>
              Up Next • Private
            </div>
            
            <h2 className="text-3xl font-black tracking-tight mb-1 text-white">11:00 AM</h2>
            <p className="text-[#7C8290] text-sm font-medium mb-5">Advanced Technique</p>
            
            <div className="flex flex-col items-center mb-6">
              <div className="text-5xl font-black text-[#C8FF3D] tracking-tighter tabular-nums mb-1 font-mono">
                02:15:00
              </div>
              <p className="text-[#B8BCC6] text-xs uppercase tracking-widest font-bold">Until Session</p>
            </div>
            
            <div className="w-full bg-[#0B0D10] rounded-2xl p-4 flex items-center justify-between border border-white/5">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 rounded-full border-2 border-[#0B0D10] bg-[#171B22] overflow-hidden">
                     <img src="https://i.pravatar.cc/150?u=player1" alt="Player" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">Leo Vance</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-[#7C8290] text-[10px] font-bold uppercase">Green Ball</span>
                  </div>
                </div>
              </div>
              <button className="w-10 h-10 rounded-full bg-[#C8FF3D] flex items-center justify-center text-black shadow-[0_0_15px_rgba(200,255,61,0.3)]">
                <Play size={18} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Day Timeline */}
      <div className="mb-8">
        <div className="px-5 mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#B8BCC6] tracking-wide uppercase">Today's Schedule</h3>
          <span className="text-[#7C8290] text-xs font-medium">3 Sessions</span>
        </div>
        
        <div className="flex overflow-x-auto gap-4 px-5 pb-2 scrollbar-hide snap-x" style={{ scrollbarWidth: 'none' }}>
          {/* Past Session */}
          <div className="flex-shrink-0 w-[240px] snap-center rounded-2xl bg-[#11141A] border border-white/5 p-4 opacity-60">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xs font-bold text-[#7C8290] mb-0.5">09:00 - 10:30 AM</div>
                <div className="text-sm font-bold text-white">Morning Squad</div>
              </div>
              <div className="bg-white/5 text-white/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Done</div>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-1.5">
                <Users size={14} className="text-[#7C8290]" />
                <span className="text-xs font-medium text-[#7C8290]">6 Players</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-[#7C8290] text-[10px] font-bold uppercase">Blue</span>
              </div>
            </div>
          </div>

          {/* Current/Next Session (Highlighted) */}
          <div className="flex-shrink-0 w-[240px] snap-center rounded-2xl bg-[#171B22] border border-[#C8FF3D]/30 p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#C8FF3D]"></div>
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xs font-bold text-[#C8FF3D] mb-0.5">11:00 - 12:00 PM</div>
                <div className="text-sm font-bold text-white">Private Lesson</div>
              </div>
              <div className="bg-[#C8FF3D]/10 text-[#C8FF3D] px-2 py-0.5 rounded text-[10px] font-bold uppercase">Next</div>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-1.5">
                <User size={14} className="text-[#B8BCC6]" />
                <span className="text-xs font-medium text-[#B8BCC6]">1 Player</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-[#B8BCC6] text-[10px] font-bold uppercase">Green</span>
              </div>
            </div>
          </div>

          {/* Future Session */}
          <div className="flex-shrink-0 w-[240px] snap-center rounded-2xl bg-[#11141A] border border-[#FFB020]/20 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="text-xs font-bold text-[#FFB020] mb-0.5">03:00 - 04:30 PM</div>
                <div className="text-sm font-bold text-white">Junior Academy</div>
              </div>
              <div className="bg-[#FFB020]/10 text-[#FFB020] px-2 py-0.5 rounded text-[10px] font-bold uppercase">Group</div>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-1.5">
                <Users size={14} className="text-[#B8BCC6]" />
                <span className="text-xs font-medium text-[#B8BCC6]">8 Players</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="text-[#B8BCC6] text-[10px] font-bold uppercase">Red</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Alerts Area */}
      <div className="px-5 mb-8 flex flex-col gap-3">
        {/* Action Needed */}
        <div className="bg-gradient-to-r from-[#FFB020]/20 to-[#11141A] border border-[#FFB020]/30 rounded-2xl p-4 flex items-start gap-4">
          <div className="bg-[#FFB020]/20 p-2 rounded-full text-[#FFB020] mt-0.5">
            <AlertCircle size={18} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-white mb-1">Action Required</h4>
            <p className="text-xs text-[#B8BCC6] mb-3">2 sessions from yesterday need player feedback evaluations.</p>
            <button className="text-xs font-bold text-[#FFB020] flex items-center gap-1 hover:underline">
              Complete Now <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Birthday Alert */}
        <div className="bg-[#11141A] border border-[#00D4FF]/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="bg-[#00D4FF]/10 p-2 rounded-full text-[#00D4FF]">
            <Gift size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">
              <span className="font-bold text-[#00D4FF]">Amelia Chen</span> turns 9 today!
            </p>
          </div>
          <button className="w-8 h-8 rounded-full bg-[#171B22] border border-white/5 flex items-center justify-center">
            <ChevronRight size={16} className="text-[#7C8290]" />
          </button>
        </div>
      </div>

      {/* Stats 2x2 Grid */}
      <div className="px-5 mb-8">
        <h3 className="text-sm font-bold text-[#B8BCC6] tracking-wide uppercase mb-4">Coach Overview</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Earnings */}
          <div className="bg-[#11141A] rounded-2xl p-4 border border-white/5 flex flex-col justify-between h-[110px]">
            <div className="flex justify-between items-start">
              <div className="bg-[#171B22] p-1.5 rounded-lg text-[#B8BCC6]">
                <Wallet size={16} />
              </div>
              <span className="text-[10px] font-bold text-[#C8FF3D] flex items-center gap-0.5">
                <TrendingUp size={10} /> +12%
              </span>
            </div>
            <div>
              <div className="text-xs font-medium text-[#7C8290] mb-0.5">This Month</div>
              <div className="text-lg font-black text-white">AED 12,400</div>
            </div>
          </div>

          {/* XP Progress */}
          <div className="bg-[#11141A] rounded-2xl p-4 border border-white/5 flex flex-col justify-between h-[110px]">
            <div className="flex justify-between items-start">
              <div className="bg-[#171B22] p-1.5 rounded-lg text-[#C8FF3D]">
                <Activity size={16} />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-end mb-1.5">
                <div className="text-xs font-medium text-[#7C8290]">XP to Lvl 13</div>
                <div className="text-xs font-bold text-white">2,450<span className="text-[#7C8290]">/3k</span></div>
              </div>
              <div className="h-1.5 w-full bg-[#171B22] rounded-full overflow-hidden">
                <div className="h-full bg-[#C8FF3D] rounded-full" style={{ width: '81%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Padding for safety */}
      <div className="h-10"></div>
    </div>
  );
}
