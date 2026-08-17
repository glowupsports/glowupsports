import { useState } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  root: "#080A0F",
  card: "#0E1119",
  cardAlt: "#111520",
  elevated: "#13182000",
  border: "rgba(255,255,255,0.07)",
  borderPurple: "rgba(138,80,255,0.35)",
  borderLime: "rgba(200,255,61,0.32)",
  borderBlue: "rgba(77,163,255,0.30)",

  purple: "#8A50FF",
  purpleMid: "#7C3AED",
  purpleDark: "#5B21B6",
  purpleSoft: "rgba(138,80,255,0.12)",
  purpleGlow: "rgba(138,80,255,0.25)",

  lime: "#C8FF3D",
  limeDim: "#A6E92A",
  limeSoft: "rgba(200,255,61,0.10)",
  limeGlow: "rgba(200,255,61,0.30)",

  blue: "#4DA3FF",
  blueDark: "#1A2AFF",
  blueSoft: "rgba(77,163,255,0.12)",
  blueGlow: "rgba(77,163,255,0.40)",

  cyan: "#00D4FF",
  cyanSoft: "rgba(0,212,255,0.12)",

  textPrimary: "#FFFFFF",
  textSecondary: "#A8ACBA",
  textMuted: "#636878",
  textDisabled: "#3A3D48",

  success: "#00E676",
  error: "#FF4D4D",
  warning: "#FFB020",
};

// ─── Neon Racket SVG (decorative, inside Next Session card) ──────────────────
function NeonRacket() {
  return (
    <svg width="110" height="120" viewBox="0 0 110 120" fill="none"
      style={{ position: "absolute", right: -8, top: 8, opacity: 0.85, pointerEvents: "none" }}>
      {/* Outer glow */}
      <ellipse cx="52" cy="55" rx="36" ry="40" stroke="#8A50FF" strokeWidth="1.5"
        filter="url(#rGlow)" opacity="0.6" />
      {/* Frame */}
      <ellipse cx="52" cy="55" rx="30" ry="33" stroke="#B87BFF" strokeWidth="2"
        filter="url(#rGlow)" />
      {/* Strings horizontal */}
      {[42, 48, 54, 60, 66].map(y => (
        <line key={y} x1="25" y1={y} x2="79" y2={y} stroke="#C49EFF" strokeWidth="0.8" opacity="0.5" />
      ))}
      {/* Strings vertical */}
      {[34, 41, 48, 55, 62, 69, 76].map(x => (
        <line key={x} x1={x} y1="24" x2={x} y2="86" stroke="#C49EFF" strokeWidth="0.8" opacity="0.5" />
      ))}
      {/* Handle */}
      <rect x="48" y="86" width="8" height="26" rx="4" fill="#7C3AED" opacity="0.9" />
      {/* Grip tape */}
      <rect x="48" y="92" width="8" height="4" rx="1" fill="#5B21B6" opacity="0.7" />
      {/* Center sweet spot glow */}
      <ellipse cx="52" cy="55" rx="8" ry="9" fill="#8A50FF" opacity="0.15" />
      {/* Tennis ball */}
      <circle cx="88" cy="28" r="10" fill="#C8FF3D" opacity="0.9" filter="url(#bGlow)" />
      <path d="M82 22 Q88 28 82 34" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7" />
      <path d="M94 22 Q88 28 94 34" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.7" />
      <defs>
        <filter id="rGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="bGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}

// ─── Tennis Player silhouette (decorative, header right) ─────────────────────
function PlayerSilhouette() {
  return (
    <svg width="130" height="160" viewBox="0 0 130 160" fill="none"
      style={{ position: "absolute", right: 0, top: 0, opacity: 0.22, pointerEvents: "none" }}>
      {/* Body silhouette */}
      <ellipse cx="72" cy="38" rx="14" ry="16" fill="#8A50FF" />
      <path d="M58 52 Q50 80 52 110 Q62 115 72 110 Q82 115 92 110 Q94 80 86 52Z" fill="#7C3AED" />
      {/* Arm + racket */}
      <path d="M86 58 Q105 45 115 35" stroke="#8A50FF" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="118" cy="30" rx="12" ry="14" stroke="#C8FF3D" strokeWidth="2" opacity="0.8" />
      {/* Legs */}
      <path d="M62 108 Q56 135 54 155" stroke="#6D28D9" strokeWidth="5" strokeLinecap="round" />
      <path d="M82 108 Q88 135 90 155" stroke="#6D28D9" strokeWidth="5" strokeLinecap="round" />
      {/* Glow rays */}
      <circle cx="72" cy="80" r="50" stroke="#8A50FF" strokeWidth="0.5" opacity="0.3" />
      <circle cx="72" cy="80" r="65" stroke="#8A50FF" strokeWidth="0.3" opacity="0.15" />
    </svg>
  );
}

// ─── Circular Glow Ring ───────────────────────────────────────────────────────
function GlowRing({ score, size = 140 }: { score: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", position: "absolute", top: 0, left: 0 }}>
        <defs>
          <filter id="limeGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {/* Fill */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={C.lime} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          filter="url(#limeGlow)"
        />
      </svg>
      {/* Center content */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: C.lime, lineHeight: 1, letterSpacing: "-0.02em",
          textShadow: `0 0 20px ${C.limeGlow}` }}>
          {score}
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 500 }}>/100</div>
      </div>
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ text, color = C.textMuted }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
      color, textTransform: "uppercase", marginBottom: 10,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <div style={{ width: 3, height: 12, borderRadius: 2, background: color, opacity: 0.8 }} />
      {text}
    </div>
  );
}

// ─── 1. HEADER ────────────────────────────────────────────────────────────────
function Header({ unread }: { unread: number }) {
  return (
    <div style={{
      position: "relative",
      paddingTop: 52, paddingBottom: 0,
      paddingInline: 20,
      overflow: "hidden",
      minHeight: 170,
    }}>
      {/* Decorative tennis player silhouette top-right */}
      <PlayerSilhouette />

      {/* Logo centered */}
      <div style={{ textAlign: "center", marginBottom: 20, position: "relative", zIndex: 2 }}>
        <div style={{
          fontSize: 26, fontWeight: 900, letterSpacing: "0.06em",
          background: "linear-gradient(90deg, #B87BFF 0%, #8A50FF 50%, #C8FF3D 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1,
        }}>GLOW UP</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, letterSpacing: "0.22em" }}>SPORTS</div>
      </div>

      {/* Notification bell */}
      <div style={{ position: "absolute", top: 52, right: 20, zIndex: 3 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          {/* Bell icon */}
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={C.textSecondary} strokeWidth="2" strokeLinecap="round" />
          </svg>
          {unread > 0 && (
            <div style={{
              position: "absolute", top: 4, right: 4, width: 8, height: 8,
              borderRadius: "50%", background: C.lime, border: `1.5px solid ${C.root}`,
            }} />
          )}
        </div>
      </div>

      {/* Avatar + Greeting row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 2 }}>
        {/* Avatar */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 62, height: 62, borderRadius: "50%",
            background: "linear-gradient(135deg, #8A50FF 0%, #4DA3FF 100%)",
            boxShadow: `0 0 0 2.5px ${C.purple}, 0 0 16px ${C.purpleGlow}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "#fff",
          }}>T</div>
          <div style={{
            position: "absolute", bottom: 2, right: 2, width: 12, height: 12,
            borderRadius: "50%", background: C.success, border: `2px solid ${C.root}`,
          }} />
        </div>
        {/* Greeting */}
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            Good morning, The Law 👋
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>Let's elevate your game today.</div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. PLAYER SUMMARY STRIP ──────────────────────────────────────────────────
function PlayerSummaryStrip() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 0,
      paddingInline: 20, paddingBlock: 16,
      borderBottom: `1px solid ${C.border}`,
    }}>
      {[
        { icon: "🛡️", value: "Level 8", sub: "Rising Competitor" },
        { icon: "⚡", value: "13 Credits", sub: null },
        { icon: "👨‍👩‍👧", value: "Family", sub: null },
      ].map((item, i) => (
        <div key={i} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          paddingInline: i === 0 ? 0 : 12,
          borderLeft: i > 0 ? `1px solid ${C.border}` : "none",
        }}>
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>{item.value}</div>
            {item.sub && <div style={{ fontSize: 10, color: C.textMuted }}>{item.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 3 + 4. HERO CARDS ───────────────────────────────────────────────────────
function NextSessionCard({ hasSession }: { hasSession: boolean }) {
  return (
    <div style={{
      flex: 1,
      background: "linear-gradient(160deg, #1C0A38 0%, #0E1025 60%, #0A0E1A 100%)",
      border: `1px solid ${C.borderPurple}`,
      borderRadius: 18,
      padding: 18,
      display: "flex", flexDirection: "column", gap: 10,
      boxShadow: `0 4px 32px rgba(138,80,255,0.15), inset 0 1px 0 rgba(255,255,255,0.06)`,
      position: "relative", overflow: "hidden",
      minHeight: 240,
    }}>
      <NeonRacket />
      <SectionLabel text="Next Session" color={C.purple} />

      {hasSession ? (
        <>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: C.purpleSoft, borderRadius: 20, paddingInline: 10, paddingBlock: 4,
            border: `1px solid ${C.borderPurple}`, alignSelf: "flex-start",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.purple }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.purple }}>TODAY</span>
          </div>

          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.textPrimary, lineHeight: 1, letterSpacing: "-0.03em" }}>
              4:00 PM
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>60 min session</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 2 }}>
            {[
              { icon: "👤", text: "Coach Sarah Johnson" },
              { icon: "📍", text: "Court 3 – Green Courts" },
            ].map((row) => (
              <div key={row.text} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>{row.icon}</span>
                <span style={{ fontSize: 12, color: C.textSecondary }}>{row.text}</span>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: "auto",
            background: `linear-gradient(90deg, ${C.purpleDark} 0%, ${C.purple} 100%)`,
            borderRadius: 10, padding: "11px 0",
            fontSize: 13, fontWeight: 700, color: "#fff",
            textAlign: "center", cursor: "pointer",
            boxShadow: `0 4px 16px ${C.purpleGlow}`,
          }}>View Session →</div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ fontSize: 36 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>No Session Today</div>
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", lineHeight: 1.5 }}>Book a lesson or find someone to play.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: C.purpleSoft, border: `1px solid ${C.borderPurple}`, borderRadius: 10, padding: "10px 6px", fontSize: 11, fontWeight: 700, color: C.purple, textAlign: "center" }}>Book Session</div>
            <div style={{ flex: 1, background: C.blueSoft, border: `1px solid ${C.borderBlue}`, borderRadius: 10, padding: "10px 6px", fontSize: 11, fontWeight: 700, color: C.blue, textAlign: "center" }}>Find Match</div>
          </div>
        </>
      )}
    </div>
  );
}

function GlowAbilityCard() {
  return (
    <div style={{
      flex: 1,
      background: "linear-gradient(160deg, #080F08 0%, #0A100E 50%, #0A0E1A 100%)",
      border: `1px solid ${C.borderLime}`,
      borderRadius: 18, padding: 18,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      boxShadow: `0 4px 32px rgba(200,255,61,0.10), inset 0 1px 0 rgba(255,255,255,0.04)`,
      minHeight: 240, cursor: "pointer",
    }}>
      <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <SectionLabel text="Glow Ability" color={C.lime} />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke={C.textMuted} strokeWidth="1.5" />
          <path d="M12 8v4m0 4h.01" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      <GlowRing score={78} size={140} />

      <div style={{ textAlign: "center", marginTop: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary }}>Proficient</div>
        <div style={{ fontSize: 12, color: C.lime, marginTop: 4, fontWeight: 600 }}>↑ 6 pts from last week</div>
      </div>
    </div>
  );
}

// ─── 5. QUICK ACTIONS ────────────────────────────────────────────────────────
function QuickActions({ onBook }: { onBook: () => void }) {
  const actions = [
    {
      label: "Book Session", color: C.purple, bg: C.purpleSoft, border: C.borderPurple,
      icon: (
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 14v4m-2-2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Find Match", color: C.blue, bg: C.blueSoft, border: C.borderBlue,
      icon: (
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "AI Coach", color: C.cyan, bg: C.cyanSoft, border: "rgba(0,212,255,0.28)",
      icon: (
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: "Feedback", color: "#AB47BC", bg: "rgba(171,71,188,0.10)", border: "rgba(171,71,188,0.30)",
      icon: (
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", gap: 10, paddingInline: 20 }}>
      {actions.map((a) => (
        <div key={a.label}
          onClick={a.label === "Book Session" ? onBook : undefined}
          style={{
            flex: 1, background: a.bg, border: `1px solid ${a.border}`,
            borderRadius: 14, padding: "16px 8px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            cursor: "pointer",
            boxShadow: `0 2px 12px rgba(0,0,0,0.3)`,
          }}>
          <div style={{ color: a.color }}>{a.icon}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: a.color, textAlign: "center", lineHeight: 1.3 }}>{a.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 6. WEEKLY RECAP BANNER ───────────────────────────────────────────────────
function WeeklyRecapBanner() {
  return (
    <div style={{
      marginInline: 20,
      background: "linear-gradient(90deg, rgba(138,80,255,0.08) 0%, rgba(200,255,61,0.05) 100%)",
      border: `1px solid ${C.borderLime}`,
      borderRadius: 14, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ display: "flex", gap: 4 }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ fontSize: 16 }}>✦</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>Your weekly recap is ready</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>+4 sessions · Ability +3.2 · 2 wins</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.lime, whiteSpace: "nowrap" }}>See recap →</div>
    </div>
  );
}

// ─── 7. TODAY'S FOCUS ────────────────────────────────────────────────────────
function TodaysFocusCard() {
  const items = [
    { icon: "🎯", title: "Serve Consistency", sub: "Hit 70%+ first serves", color: C.purple },
    { icon: "👟", title: "Footwork", sub: "Stay light & balanced", color: C.blue },
    { icon: "🧘", title: "Rally Patience", sub: "Build the point", color: C.lime },
  ];
  return (
    <div style={{ paddingInline: 20 }}>
      <div style={{
        background: "linear-gradient(135deg, rgba(138,80,255,0.07) 0%, rgba(14,16,25,0.95) 100%)",
        border: `1px solid ${C.border}`,
        borderRadius: 18, padding: "18px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <SectionLabel text="Today's Focus" color={C.purple} />
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
          {items.map((it) => (
            <div key={it.title} style={{
              flex: "0 0 calc(33.33% - 7px)",
              background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "12px 10px",
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{it.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, marginBottom: 4, lineHeight: 1.3 }}>{it.title}</div>
              <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.4 }}>{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 8 + 9. COACH FEEDBACK + UPCOMING MATCH ──────────────────────────────────
function CoachFeedbackCard() {
  return (
    <div style={{
      flex: 1,
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 18, padding: "16px 14px",
      display: "flex", flexDirection: "column", gap: 12,
      boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionLabel text="Recent Coach Feedback" color={C.textMuted} />
        <div style={{
          background: C.limeSoft, border: `1px solid ${C.borderLime}`,
          borderRadius: 20, paddingInline: 8, paddingBlock: 3,
          fontSize: 9, fontWeight: 800, color: C.lime, letterSpacing: "0.08em",
        }}>NEW</div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {/* Coach avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #00897B, #004D40)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 700, color: "#fff",
          boxShadow: "0 0 0 2px rgba(0,230,118,0.25)",
        }}>S</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, lineHeight: 1.4 }}>
            Great improvement in your backhand depth!
          </div>
          <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 5, lineHeight: 1.5 }}>
            Focus on earlier preparation on returns. Keep it up!
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>2h ago</div>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.lime, textAlign: "right", cursor: "pointer" }}>
        View All →
      </div>
    </div>
  );
}

function UpcomingMatchCard() {
  return (
    <div style={{
      flex: 1,
      background: C.card, border: `1px solid ${C.borderBlue}`,
      borderRadius: 18, padding: "16px 14px",
      display: "flex", flexDirection: "column", gap: 10,
      boxShadow: `0 2px 20px rgba(77,163,255,0.10)`,
      position: "relative", overflow: "hidden",
    }}>
      {/* Tennis ball decoration */}
      <div style={{ position: "absolute", right: 10, top: 40, opacity: 0.18 }}>
        <svg width="70" height="70" viewBox="0 0 70 70" fill="none">
          <circle cx="35" cy="35" r="32" fill={C.lime} />
          <path d="M10 20 Q35 35 10 50" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M60 20 Q35 35 60 50" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      </div>

      <SectionLabel text="Upcoming Match" color={C.blue} />

      <div>
        <div style={{ fontSize: 11, color: C.textMuted }}>Sat, May 24</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.03em" }}>9:00 AM</div>
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>
          vs <span style={{ color: C.textPrimary, fontWeight: 700 }}>Ethan Miller</span>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>U18 Singles – Quarterfinals</div>
        <div style={{ fontSize: 10, color: C.textMuted }}>Club Championship</div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.lime }}>+32 MMR on win</div>

      <div style={{
        background: C.blueSoft, border: `1px solid ${C.borderBlue}`,
        borderRadius: 10, padding: "10px 0",
        fontSize: 12, fontWeight: 700, color: C.blue, textAlign: "center", cursor: "pointer",
      }}>View Match →</div>
    </div>
  );
}

// ─── 10. YOUR JOURNEY ────────────────────────────────────────────────────────
function JourneyCard() {
  const pct = 62;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  return (
    <div style={{ paddingInline: 20 }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 18, padding: "18px 16px",
        boxShadow: "0 2px 20px rgba(0,0,0,0.4)",
      }}>
        <SectionLabel text="Your Journey" color={C.textMuted} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Streak */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 26 }}>🔥</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>12</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Day Streak</div>
          </div>
          {/* XP */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 26 }}>⭐</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.lime, lineHeight: 1 }}>2,450</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>XP Points</div>
          </div>
          {/* Level */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 26 }}>🏆</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>Level 8</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Rising Competitor</div>
          </div>
          {/* Progress ring */}
          <div style={{ flex: "0 0 70px", position: "relative", width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="70" height="70" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
              <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle cx="35" cy="35" r={r} fill="none" stroke={C.lime} strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circ - filled}`}
                style={{ filter: `drop-shadow(0 0 4px ${C.lime})` }}
              />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.lime, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 8, color: C.textMuted, lineHeight: 1.3, textAlign: "center" }}>to Level 9</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 11. BOTTOM NAV ───────────────────────────────────────────────────────────
function BottomNav() {
  const tabs = [
    {
      id: "home", label: "Home",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
    },
    {
      id: "social", label: "Social",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
    },
    { id: "play", label: "Play", special: true },
    {
      id: "progress", label: "Progress",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
    },
    {
      id: "profile", label: "Profile",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" /></svg>,
    },
  ];

  return (
    <div style={{
      background: "rgba(8,10,15,0.97)",
      borderTop: `1px solid ${C.border}`,
      backdropFilter: "blur(24px)",
      display: "flex", alignItems: "flex-end",
      paddingBottom: 28, paddingTop: 10,
      paddingInline: 8,
      gap: 0,
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === "home";
        if (tab.special) {
          return (
            <div key={tab.id} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              position: "relative", top: -16,
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: `radial-gradient(circle at 35% 35%, #3A6BFF, #1A2AFF)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 0 3px rgba(77,103,255,0.4), 0 0 24px ${C.blueGlow}, 0 4px 16px rgba(26,42,255,0.6)`,
                border: "2px solid rgba(255,255,255,0.15)",
              }}>
                {/* Tennis ball icon */}
                <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                  <circle cx="15" cy="15" r="13" fill="#E8FF50" />
                  <path d="M4 10 Q15 15 4 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <path d="M26 10 Q15 15 26 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </svg>
              </div>
              <div style={{ fontSize: 10, color: C.blue, fontWeight: 700, marginTop: 5 }}>Play</div>
            </div>
          );
        }
        return (
          <div key={tab.id} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            paddingBlock: 4,
          }}>
            <div style={{ color: isActive ? C.purple : C.textMuted }}>{tab.icon}</div>
            <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? C.purple : C.textMuted }}>
              {tab.label}
            </div>
            {isActive && (
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.purple, marginTop: 1 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ROOT EXPORT ──────────────────────────────────────────────────────────────
export function PlayerHomeV2() {
  const [hasSession, setHasSession] = useState(true);

  return (
    <div style={{
      width: 390,
      background: C.root,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif",
      color: C.textPrimary,
      display: "flex", flexDirection: "column",
      minHeight: "100vh",
    }}>
      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        {/* 1. Header */}
        <Header unread={3} />

        {/* 2. Player Summary Strip */}
        <PlayerSummaryStrip />

        {/* 3 + 4. Hero Cards */}
        <div style={{ display: "flex", gap: 12, paddingInline: 20, paddingTop: 20, paddingBottom: 20 }}>
          <NextSessionCard hasSession={hasSession} />
          <GlowAbilityCard />
        </div>

        {/* 5. Quick Actions */}
        <QuickActions onBook={() => setHasSession(!hasSession)} />

        {/* 6. Weekly Recap */}
        <div style={{ paddingTop: 16, paddingBottom: 4 }}>
          <WeeklyRecapBanner />
        </div>

        {/* 7. Today's Focus */}
        <div style={{ paddingTop: 16, paddingBottom: 4 }}>
          <TodaysFocusCard />
        </div>

        {/* 8 + 9. Coach Feedback + Upcoming Match */}
        <div style={{ display: "flex", gap: 12, paddingInline: 20, paddingTop: 16, paddingBottom: 4 }}>
          <CoachFeedbackCard />
          <UpcomingMatchCard />
        </div>

        {/* 10. Your Journey */}
        <div style={{ paddingTop: 16, paddingBottom: 20 }}>
          <JourneyCard />
        </div>

        {/* Demo toggle */}
        <div style={{ paddingInline: 20, paddingBottom: 16 }}>
          <div onClick={() => setHasSession(!hasSession)} style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "10px 16px", fontSize: 11, color: C.textMuted,
            textAlign: "center", cursor: "pointer",
          }}>
            Demo: Toggle session {hasSession ? "ON → OFF" : "OFF → ON"}
          </div>
        </div>

      </div>

      {/* 11. Bottom Nav */}
      <BottomNav />
    </div>
  );
}
