import React, { useState } from 'react';
import { 
  Users, 
  BarChart2, 
  Calendar, 
  Shield, 
  Award, 
  TrendingUp, 
  Check, 
  Star, 
  Menu, 
  X, 
  ArrowRight, 
  Play, 
  Trophy, 
  Target,
  ChevronRight
} from 'lucide-react';

export default function LandingBrightAcademy() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const colors = {
    greenDark: '#1B5E20',
    green: '#2E7D32',
    orange: '#FF6B35',
    bgLight: '#F8FAF8',
    textDark: '#1A1A1A'
  };

  return (
    <div className="min-h-[2000px] font-sans" style={{ backgroundColor: colors.bgLight, color: colors.textDark }}>
      
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-50 w-full bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center gap-2 cursor-pointer">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xl"
                style={{ backgroundColor: colors.greenDark }}
              >
                G
              </div>
              <span className="font-bold text-2xl tracking-tight" style={{ color: colors.greenDark }}>
                Glow Up Tennis
              </span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 font-medium transition-colors">Features</a>
              <a href="#testimonials" className="text-gray-600 hover:text-gray-900 font-medium transition-colors">Clubs</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 font-medium transition-colors">Pricing</a>
              
              <div className="flex items-center space-x-4 ml-4">
                <button 
                  className="px-5 py-2.5 rounded-full font-semibold transition-colors"
                  style={{ 
                    color: colors.greenDark,
                    border: `2px solid ${colors.greenDark}`
                  }}
                >
                  Log in
                </button>
                <button 
                  className="px-6 py-2.5 rounded-full font-semibold text-white shadow-lg shadow-green-900/20 transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: colors.greenDark }}
                >
                  Get Started
                </button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-xl absolute w-full">
            <div className="px-4 pt-2 pb-6 space-y-2">
              <a href="#features" className="block px-3 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Features</a>
              <a href="#testimonials" className="block px-3 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Clubs</a>
              <a href="#pricing" className="block px-3 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Pricing</a>
              <div className="pt-4 flex flex-col space-y-3">
                <button 
                  className="w-full px-5 py-3 rounded-xl font-semibold"
                  style={{ color: colors.greenDark, border: `2px solid ${colors.greenDark}` }}
                >
                  Log in
                </button>
                <button 
                  className="w-full px-5 py-3 rounded-xl font-semibold text-white"
                  style={{ backgroundColor: colors.greenDark }}
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 lg:pt-28 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
            
            {/* Hero Left Content */}
            <div className="lg:col-span-6 text-center lg:text-left mb-16 lg:mb-0">
              <div 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 font-semibold text-sm shadow-sm"
                style={{ backgroundColor: 'rgba(46, 125, 50, 0.1)', color: colors.green }}
              >
                <Award size={16} />
                <span>The #1 Tennis Academy Platform</span>
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
                Grow Every Player. <br/>
                <span style={{ color: colors.greenDark }}>Track Every Win.</span>
              </h1>
              
              <p className="text-xl sm:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                The all-in-one platform built for premium tennis clubs in Dubai & Indonesia. Manage courts, track player progress, and elevate your academy's brand.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <button 
                  className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-white text-lg shadow-xl shadow-green-900/20 flex items-center justify-center gap-2 transition-transform hover:-translate-y-1"
                  style={{ backgroundColor: colors.greenDark }}
                >
                  Start Your Academy
                  <ArrowRight size={20} />
                </button>
                <button 
                  className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-gray-700 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 flex items-center justify-center gap-2 transition-transform hover:-translate-y-1"
                >
                  <Play size={20} style={{ color: colors.orange }} fill={colors.orange} />
                  See it in action
                </button>
              </div>
              
              <div className="mt-10 flex items-center justify-center lg:justify-start gap-6 text-sm text-gray-500 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: colors.orange }} /> No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: colors.orange }} /> 14-day free trial
                </div>
              </div>
            </div>

            {/* Hero Right Mockup */}
            <div className="lg:col-span-6 relative">
              {/* Decorative blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] rounded-full blur-3xl opacity-20 pointer-events-none" style={{ backgroundColor: colors.green }}></div>
              
              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transform lg:rotate-2 hover:rotate-0 transition-transform duration-500">
                {/* Mockup Top Bar */}
                <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  </div>
                  <div className="text-sm font-semibold text-gray-500">Coach Dashboard</div>
                </div>
                
                {/* Mockup Content */}
                <div className="p-6">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h3 className="text-2xl font-bold mb-1">Today's Overview</h3>
                      <p className="text-gray-500 text-sm">Tuesday, Oct 24</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden">
                      <div className="w-full h-full bg-gray-300"></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-4 rounded-xl" style={{ backgroundColor: colors.bgLight }}>
                      <div className="flex items-center gap-2 text-gray-600 mb-2">
                        <Users size={16} /> <span className="text-sm font-medium">Active Players</span>
                      </div>
                      <div className="text-3xl font-bold" style={{ color: colors.greenDark }}>142</div>
                      <div className="text-xs font-medium mt-1" style={{ color: colors.green }}>+12 this month</div>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(255, 107, 53, 0.05)' }}>
                      <div className="flex items-center gap-2 text-gray-600 mb-2">
                        <TrendingUp size={16} /> <span className="text-sm font-medium">Win Rate</span>
                      </div>
                      <div className="text-3xl font-bold" style={{ color: colors.orange }}>68%</div>
                      <div className="text-xs font-medium mt-1 text-gray-500">Across all divisions</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-800 mb-4">Upcoming Matches</h4>
                    <div className="space-y-3">
                      {[
                        { time: '10:00 AM', court: 'Court 1', p1: 'Alex R.', p2: 'David M.' },
                        { time: '11:30 AM', court: 'Center Court', p1: 'Sarah K.', p2: 'Emma W.' },
                        { time: '02:00 PM', court: 'Clay Court 3', p1: 'Juniors U14', p2: 'Practice' },
                      ].map((match, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-green-200 transition-colors cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className="w-12 text-center text-sm font-bold" style={{ color: colors.green }}>{match.time}</div>
                            <div className="w-px h-8 bg-gray-200"></div>
                            <div>
                              <div className="font-bold text-sm text-gray-800">{match.p1} vs {match.p2}</div>
                              <div className="text-xs text-gray-500">{match.court}</div>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-gray-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Strip */}
      <section className="border-y border-gray-100 bg-white py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-bold text-gray-400 tracking-wider uppercase mb-8">
            TRUSTED BY ELITE ACADEMIES ACROSS ASIA & MIDDLE EAST
          </p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-80">
            <div className="flex items-center gap-2 font-bold text-xl" style={{ color: colors.orange }}>
              <Trophy size={28} /> Dubai Tennis Club
            </div>
            <div className="flex items-center gap-2 font-bold text-xl" style={{ color: colors.greenDark }}>
              <Shield size={28} /> Jakarta Elite
            </div>
            <div className="flex items-center gap-2 font-bold text-xl" style={{ color: colors.textDark }}>
              <Target size={28} /> Bali Pro Academy
            </div>
            <div className="flex items-center gap-2 font-bold text-xl text-gray-600">
              <Award size={28} /> Ace Tennis UAE
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24" style={{ backgroundColor: colors.bgLight }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-extrabold mb-6" style={{ color: colors.greenDark }}>
              Everything you need to run a world-class academy
            </h2>
            <p className="text-xl text-gray-600">
              Replace chaotic WhatsApp groups and scattered spreadsheets with one unified platform designed specifically for tennis.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Player Progress Tracking",
                desc: "Log match results, track skill improvements, and generate beautiful progress reports for parents.",
                icon: TrendingUp
              },
              {
                title: "Smart Court Scheduling",
                desc: "Drag-and-drop calendar that prevents double bookings and maximizes your court utilization.",
                icon: Calendar
              },
              {
                title: "Match Analytics",
                desc: "Deep dive into win/loss ratios, unforced errors, and player performance metrics over time.",
                icon: BarChart2
              },
              {
                title: "Coach Management",
                desc: "Assign coaches to sessions, track their hours, and manage their availability in one place.",
                icon: Users
              },
              {
                title: "Tournament Organizer",
                desc: "Create brackets, manage registrations, and run seamless weekend tournaments with live updates.",
                icon: Trophy
              },
              {
                title: "Automated Billing",
                desc: "Handle memberships, court fees, and private lesson payments automatically without chasing invoices.",
                icon: Shield
              }
            ].map((feature, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: 'rgba(46, 125, 50, 0.1)', color: colors.green }}
                >
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Try Free Banner */}
      <section className="w-full py-16" style={{ backgroundColor: colors.green }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to organize your academy?
          </h2>
          <p className="text-green-100 text-lg md:text-xl mb-8">
            Start free today. No credit card needed. Setup takes less than 5 minutes.
          </p>
          <button className="px-8 py-4 rounded-full font-bold text-lg bg-white text-gray-900 hover:bg-gray-50 shadow-lg transition-transform hover:-translate-y-1">
            Claim Your Free Trial
          </button>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold mb-4" style={{ color: colors.textDark }}>
              Loved by coaches and directors
            </h2>
            <p className="text-xl text-gray-600">
              See what top academies are saying about Glow Up Tennis.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "Sarah Jenkins",
                role: "Director, Dubai Creek Tennis",
                quote: "This platform completely transformed how we manage our 300+ junior players. The parents love the progress reports, and our coaches save hours every week.",
                initials: "SJ",
                color: colors.green
              },
              {
                name: "Ahmed Al-Farsi",
                role: "Head Coach, Elite Tennis",
                quote: "Before Glow Up, we used 4 different apps for scheduling, payments, and communication. Having everything in one place is a game-changer for our academy.",
                initials: "AA",
                color: colors.orange
              },
              {
                name: "Budi Santoso",
                role: "Manager, Jakarta Tennis Center",
                quote: "The court scheduling feature alone is worth it. We've increased our court utilization by 25% just by having a clear, visual system that everyone can access.",
                initials: "BS",
                color: colors.greenDark
              }
            ].map((test, idx) => (
              <div key={idx} className="bg-gray-50 rounded-2xl p-8 relative">
                <div className="flex text-amber-400 mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} size={20} fill="currentColor" />)}
                </div>
                <p className="text-gray-700 text-lg italic mb-8 relative z-10">"{test.quote}"</p>
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: test.color }}
                  >
                    {test.initials}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{test.name}</div>
                    <div className="text-sm text-gray-500">{test.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24" style={{ backgroundColor: colors.greenDark }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-8 leading-tight">
            Elevate your tennis academy to the next level.
          </h2>
          <p className="text-xl text-green-100 mb-10 max-w-2xl mx-auto">
            Join hundreds of coaches who are spending less time on admin work and more time on the court.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              className="w-full sm:w-auto px-10 py-4 rounded-full font-bold text-white text-lg shadow-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: colors.orange }}
            >
              Start Your Academy Today
            </button>
            <button 
              className="w-full sm:w-auto px-10 py-4 rounded-full font-bold text-white text-lg border border-green-400 hover:bg-green-800 transition-colors"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 pt-16 pb-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: colors.greenDark }}
                >
                  G
                </div>
                <span className="font-bold text-xl" style={{ color: colors.greenDark }}>
                  Glow Up Tennis
                </span>
              </div>
              <p className="text-gray-500 mb-6 max-w-sm">
                The modern operating system for premium tennis academies, clubs, and independent coaches.
              </p>
              <div className="flex gap-4">
                {/* Social icons placeholders */}
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 cursor-pointer transition-colors">
                  <span className="font-bold">in</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 cursor-pointer transition-colors">
                  <span className="font-bold">ig</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 cursor-pointer transition-colors">
                  <span className="font-bold">fb</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Features</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Pricing</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Clubs</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Coaches</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Resources</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Help Center</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Blog</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Tennis Drills</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Case Studies</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-500 hover:text-gray-900">About Us</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Careers</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Contact</a></li>
                <li><a href="#" className="text-gray-500 hover:text-gray-900">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} Glow Up Tennis. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-gray-600">Terms of Service</a>
              <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
