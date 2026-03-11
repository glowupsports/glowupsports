import React from 'react';
import { 
  Bell, 
  Settings, 
  Clock, 
  User, 
  Users, 
  AlertCircle,
  Gift,
  ChevronRight
} from 'lucide-react';

export function CleanCommand() {
  return (
    <div className="w-full max-w-[390px] mx-auto min-h-screen bg-[#0B0D10] text-white font-sans overflow-x-hidden pb-10">
      {/* Header */}
      <header className="px-6 pt-12 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-white">Coach Marcus</h1>
          <p className="text-[#7C8290] text-sm mt-1">Glow Up Tennis Academy</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative cursor-pointer">
            <Bell className="w-5 h-5 text-[#B8BCC6]" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#C8FF3D]"></span>
          </div>
          <button className="cursor-pointer">
            <Settings className="w-5 h-5 text-[#B8BCC6]" />
          </button>
        </div>
      </header>

      {/* Top Quick Stats Pill Row */}
      <div className="px-6 mb-8 flex items-center space-x-3 overflow-x-auto hide-scrollbar">
        <div className="flex-shrink-0 bg-[#11141A] border border-white/5 rounded-full px-4 py-2 flex items-center space-x-2">
          <span className="text-[#7C8290] text-xs font-medium">Level 12</span>
          <div className="w-16 h-1 bg-[#171B22] rounded-full overflow-hidden">
            <div className="h-full bg-[#C8FF3D] w-[81%]"></div>
          </div>
          <span className="text-white text-[10px]">2450 XP</span>
        </div>
        <div className="flex-shrink-0 bg-[#11141A] border border-white/5 rounded-full px-4 py-2 flex items-center space-x-2">
          <span className="text-[#7C8290] text-xs font-medium">Earned</span>
          <span className="text-white text-xs">AED 12.4k</span>
        </div>
        <div className="flex-shrink-0 bg-[#11141A] border border-white/5 rounded-full px-4 py-2 flex items-center space-x-2">
          <span className="text-[#7C8290] text-xs font-medium">Today</span>
          <span className="text-white text-xs">3 Sessions</span>
        </div>
      </div>

      {/* Up Next & Alerts */}
      <div className="px-6 mb-8 space-y-3">
        {/* Next Session Countdown */}
        <div className="bg-[#11141A] border border-white/5 rounded-2xl p-5 relative overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.4)] cursor-pointer hover:bg-[#171B22] transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#C8FF3D]"></div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#7C8290] text-xs font-medium tracking-wide uppercase mb-1">Up Next</p>
              <h2 className="text-4xl font-light mb-2 tracking-tight">2h 15m</h2>
              <div className="flex items-center space-x-2 text-sm text-[#B8BCC6]">
                <Clock className="w-4 h-4 text-[#C8FF3D]" />
                <span className="font-medium">11:00 AM Private</span>
              </div>
            </div>
            <div className="w-14 h-14 rounded-full bg-[#171B22] border border-white/5 flex items-center justify-center">
              <User className="w-6 h-6 text-[#C8FF3D]" />
            </div>
          </div>
        </div>

        {/* Action Needed */}
        <div className="bg-[#11141A] border border-white/5 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#171B22] transition-colors">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-[#FFB020]/10 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-[#FFB020]" />
            </div>
            <p className="text-sm font-medium text-white">2 sessions need feedback</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#7C8290]" />
        </div>

        {/* Birthday Alert */}
        <div className="bg-[#11141A] border border-white/5 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#171B22] transition-colors">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-[#00D4FF]/10 flex items-center justify-center">
              <Gift className="w-4 h-4 text-[#00D4FF]" />
            </div>
            <p className="text-sm text-[#B8BCC6]"><span className="text-white font-medium">Amelia Chen</span> turns 9</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#7C8290]" />
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="px-6">
        <h3 className="text-lg font-medium tracking-tight text-white mb-5">Today's Schedule</h3>
        
        <div className="space-y-4">
          {/* Session 1 */}
          <div className="flex relative">
            <div className="w-16 flex-shrink-0 pt-1">
              <span className="text-xs font-medium text-[#7C8290]">9:00 AM</span>
            </div>
            <div className="w-px bg-white/5 mx-4 relative">
              <div className="absolute top-2 -left-[3.5px] w-2 h-2 rounded-full bg-[#171B22] border border-[#7C8290]"></div>
            </div>
            <div className="flex-grow bg-[#11141A] border border-white/5 rounded-2xl p-4 opacity-60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[#FFB020] uppercase tracking-widest bg-[#FFB020]/10 px-2 py-0.5 rounded-full">Group</span>
                <span className="text-xs font-medium text-[#7C8290]">Completed</span>
              </div>
              <h4 className="text-base font-medium text-white mb-1">Blue Ball</h4>
              <div className="flex items-center space-x-2 text-sm text-[#7C8290]">
                <Users className="w-4 h-4" />
                <span>6 players</span>
              </div>
            </div>
          </div>

          {/* Session 2 */}
          <div className="flex relative">
            <div className="w-16 flex-shrink-0 pt-1">
              <span className="text-xs font-medium text-white">11:00 AM</span>
            </div>
            <div className="w-px bg-white/5 mx-4 relative">
              <div className="absolute top-2 -left-[3.5px] w-2 h-2 rounded-full bg-[#C8FF3D] shadow-[0_0_10px_rgba(200,255,61,0.5)]"></div>
              <div className="absolute top-0 bottom-0 -left-[1px] w-[2px] bg-gradient-to-b from-transparent via-[#C8FF3D]/50 to-transparent"></div>
            </div>
            <div className="flex-grow bg-[#171B22] border border-white/10 rounded-2xl p-4 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[#C8FF3D] uppercase tracking-widest bg-[#C8FF3D]/10 px-2 py-0.5 rounded-full">Private</span>
              </div>
              <h4 className="text-base font-medium text-white mb-1">Green Ball</h4>
              <div className="flex items-center space-x-2 text-sm text-[#B8BCC6]">
                <User className="w-4 h-4 text-[#C8FF3D]" />
                <span>1 player</span>
              </div>
            </div>
          </div>

          {/* Session 3 */}
          <div className="flex relative">
            <div className="w-16 flex-shrink-0 pt-1">
              <span className="text-xs font-medium text-[#7C8290]">3:00 PM</span>
            </div>
            <div className="w-px bg-white/5 mx-4 relative">
              <div className="absolute top-2 -left-[3.5px] w-2 h-2 rounded-full bg-[#171B22] border border-white/20"></div>
            </div>
            <div className="flex-grow bg-[#11141A] border border-white/5 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[#FFB020] uppercase tracking-widest bg-[#FFB020]/10 px-2 py-0.5 rounded-full">Group</span>
              </div>
              <h4 className="text-base font-medium text-white mb-1">Red Ball</h4>
              <div className="flex items-center space-x-2 text-sm text-[#7C8290]">
                <Users className="w-4 h-4" />
                <span>8 players</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
