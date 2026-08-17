import { useState } from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  root: "#080A0F",
  card: "#0D1018",
  cardSession: "#120830",

  border: "rgba(255,255,255,0.07)",
  borderPurple: "rgba(149,76,255,0.40)",
  borderLime: "rgba(200,255,61,0.30)",
  borderBlue: "rgba(77,163,255,0.28)",

  purple: "#9B5CFF",
  purpleMid: "#7C3AED",
  purpleDark: "#5B21B6",
  purpleSoft: "rgba(155,92,255,0.10)",
  purpleGlow: "rgba(155,92,255,0.30)",

  lime: "#C8FF3D",
  limeSoft: "rgba(200,255,61,0.10)",
  limeGlow: "rgba(200,255,61,0.35)",

  blue: "#4DA3FF",
  blueDark: "#1E3AFF",
  blueSoft: "rgba(77,163,255,0.10)",
  blueGlow: "rgba(77,163,255,0.45)",

  cyan: "#00D4FF",
  cyanSoft: "rgba(0,212,255,0.10)",

  textPrimary: "#FFFFFF",
  textSecondary: "#9BA3B8",
  textMuted: "#5C6270",

  success: "#00E676",
};

// ─── Neon Racket (precise, prominent) ─────────────────────────────────────────
function NeonRacket() {
  return (
    <svg
      width="130" height="160"
      viewBox="0 0 130 160"
      fill="none"
      style={{
        position: "absolute", right: -10, top: 0,
        opacity: 1, pointerEvents: "none",
        filter: "drop-shadow(0 0 12px rgba(149,76,255,0.8))",
      }}
    >
      <defs>
        <filter id="racketGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="ballGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Outer halo */}
      <ellipse cx="58" cy="68" rx="46" ry="52" stroke="#9B5CFF" strokeWidth="1"
        opacity="0.25" filter="url(#racketGlow)" />
      {/* Frame outer */}
      <ellipse cx="58" cy="68" rx="40" ry="45" stroke="#B87BFF" strokeWidth="2.5"
        filter="url(#racketGlow)" />
      {/* Frame inner */}
      <ellipse cx="58" cy="68" rx="34" ry="38" stroke="rgba(184,123,255,0.45)" strokeWidth="1" />
      {/* Strings horizontal */}
      {[38, 46, 54, 62, 70, 78, 86, 94].map(y => (
        <line key={y} x1="22" y1={y} x2="94" y2={y}
          stroke="#C49EFF" strokeWidth="0.8" opacity="0.5" />
      ))}
      {/* Strings vertical */}
      {[30, 37, 44, 51, 58, 65, 72, 79, 86].map(x => (
        <line key={x} x1={x} y1="26" x2={x} y2="110"
          stroke="#C49EFF" strokeWidth="0.8" opacity="0.5" />
      ))}
      {/* Handle */}
      <rect x="53" y="112" width="10" height="36" rx="5"
        fill="url(#handleGrad)" />
      <defs>
        <linearGradient id="handleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4B1099" />
        </linearGradient>
      </defs>
      {/* Grip lines */}
      {[118, 125, 132, 139].map(y => (
        <rect key={y} x="53" y={y} width="10" height="2" rx="1"
          fill="rgba(255,255,255,0.15)" />
      ))}
      {/* Center sweet spot */}
      <ellipse cx="58" cy="68" rx="10" ry="11" fill="#9B5CFF" opacity="0.10" />
      {/* Tennis ball */}
      <circle cx="104" cy="22" r="13" fill="#C8FF3D" filter="url(#ballGlow)" opacity="0.95" />
      <path d="M96 14 Q104 22 96 30" stroke="white" strokeWidth="1.8"
        strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M112 14 Q104 22 112 30" stroke="white" strokeWidth="1.8"
        strokeLinecap="round" fill="none" opacity="0.75" />
    </svg>
  );
}

// ─── Tennis Player (header right, decorative) ─────────────────────────────────
function PlayerArtwork() {
  return (
    <svg width="160" height="190" viewBox="0 0 160 190" fill="none"
      style={{ position: "absolute", right: -10, top: -10, pointerEvents: "none", opacity: 0.28 }}>
      {/* Glow aura */}
      <ellipse cx="95" cy="90" rx="50" ry="80" fill="#8A50FF" opacity="0.06" />
      {/* Head */}
      <ellipse cx="95" cy="30" rx="15" ry="17" fill="#9B5CFF" />
      {/* Body */}
      <path d="M80 46 Q72 75 74 115 Q85 122 95 116 Q105 122 116 115 Q118 75 110 46Z"
        fill="#7C3AED" />
      {/* Arm + racket swing */}
      <path d="M110 58 Q130 42 142 28" stroke="#9B5CFF" strokeWidth="5" strokeLinecap="round" />
      {/* Racket head on arm */}
      <ellipse cx="148" cy="22" rx="14" ry="16" stroke="#C8FF3D" strokeWidth="2"
        opacity="0.85" />
      {/* Legs */}
      <path d="M84 113 Q78 148 74 182" stroke="#6D28D9" strokeWidth="6" strokeLinecap="round" />
      <path d="M106 113 Q112 148 116 182" stroke="#6D28D9" strokeWidth="6" strokeLinecap="round" />
      {/* Glow rings */}
      <circle cx="95" cy="90" r="64" stroke="#8A50FF" strokeWidth="0.5" opacity="0.25" />
      <circle cx="95" cy="90" r="80" stroke="#8A50FF" strokeWidth="0.3" opacity="0.12" />
      {/* Tennis ball near racket */}
      <circle cx="128" cy="52" r="9" fill="#C8FF3D" opacity="0.7" />
    </svg>
  );
}

// ─── Glow Ring ────────────────────────────────────────────────────────────────
function GlowRing({ score, size = 148 }: { score: number; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)", position: "absolute", top: 0, left: 0 }}>
        <defs>
          <filter id="limeGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={C.lime} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          filter="url(#limeGlow)"
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: C.lime, lineHeight: 1,
          letterSpacing: "-0.03em", textShadow: `0 0 24px ${C.limeGlow}` }}>
          {score}
        </div>
        <div style={{ fontSize: 14, color: C.textMuted, fontWeight: 500 }}>/100</div>
      </div>
    </div>
  );
}

// ─── Section Label ─────────────────────────────────────────────────────────────
function Label({ text, color = C.textMuted }: { text: string; color?: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em",
      color, textTransform: "uppercase",
      display: "flex", alignItems: "center", gap: 5, marginBottom: 12 }}>
      {text}
    </div>
  );
}

// ─── 1. HEADER ────────────────────────────────────────────────────────────────
function Header() {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      paddingTop: 50, paddingBottom: 16, paddingInline: 20,
      minHeight: 176,
    }}>
      {/* Decorative tennis player artwork */}
      <PlayerArtwork />

      {/* Notification bell — top right */}
      <div style={{ position: "absolute", top: 50, right: 20, zIndex: 3 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <svg width="19" height="19" fill="none" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
              stroke={C.textSecondary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0"
              stroke={C.textSecondary} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{
            position: "absolute", top: 5, right: 5, width: 8, height: 8,
            borderRadius: "50%", background: C.lime, border: `1.5px solid ${C.root}`,
          }} />
        </div>
      </div>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 22, position: "relative", zIndex: 2 }}>
        <div style={{
          fontSize: 30, fontWeight: 900, letterSpacing: "0.04em",
          background: "linear-gradient(90deg, #C084FC 0%, #9B5CFF 45%, #D4FF5C 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          lineHeight: 1,
        }}>GLOW UP</div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.textSecondary,
          letterSpacing: "0.28em", marginTop: 1,
        }}>SPORTS</div>
      </div>

      {/* Avatar + greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 2 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(145deg, #9B5CFF 0%, #4DA3FF 100%)",
            boxShadow: `0 0 0 2.5px ${C.purple}, 0 0 18px ${C.purpleGlow}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700, color: "#fff",
          }}>T</div>
          <div style={{
            position: "absolute", bottom: 2, right: 2,
            width: 13, height: 13, borderRadius: "50%",
            background: C.success, border: `2px solid ${C.root}`,
          }} />
        </div>
        <div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: C.textPrimary,
            lineHeight: 1.2, letterSpacing: "-0.02em",
          }}>
            Good morning, The Law 👋
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>
            Let's elevate your game today.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. PLAYER SUMMARY ────────────────────────────────────────────────────────
function PlayerSummary() {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      paddingInline: 20, paddingBlock: 14,
      borderTop: `1px solid ${C.border}`,
      borderBottom: `1px solid ${C.border}`,
      gap: 0,
    }}>
      {[
        { emoji: "🛡️", main: "Level 8", sub: "Rising Competitor" },
        { emoji: "⚡", main: "13 Credits", sub: null },
        { emoji: "👨‍👩‍👧", main: "Family", sub: null },
      ].map((item, i) => (
        <div key={i} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          paddingLeft: i === 0 ? 0 : 14,
          borderLeft: i > 0 ? `1px solid ${C.border}` : "none",
        }}>
          <span style={{ fontSize: 16 }}>{item.emoji}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>
              {item.main}
            </div>
            {item.sub && (
              <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.2 }}>{item.sub}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 3. NEXT SESSION CARD ─────────────────────────────────────────────────────
function NextSessionCard({ hasSession }: { hasSession: boolean }) {
  return (
    <div style={{
      flex: 1,
      background: "linear-gradient(155deg, #1E0840 0%, #120626 50%, #0C0A1E 100%)",
      border: `1px solid ${C.borderPurple}`,
      borderRadius: 18,
      padding: "18px 16px",
      display: "flex", flexDirection: "column",
      boxShadow: `0 4px 36px rgba(155,92,255,0.18), inset 0 1px 0 rgba(255,255,255,0.07)`,
      position: "relative", overflow: "hidden",
      minHeight: 256,
    }}>
      {/* Neon Racket overlay */}
      <NeonRacket />

      {/* Section label */}
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
        color: C.purple, textTransform: "uppercase", marginBottom: 10,
      }}>NEXT SESSION</div>

      {hasSession ? (
        <>
          {/* "Today" as large white heading */}
          <div style={{
            fontSize: 30, fontWeight: 800, color: C.textPrimary,
            letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4,
          }}>Today</div>

          {/* Time */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke={C.purple} strokeWidth="1.8" />
              <path d="M12 6v6l4 2" stroke={C.purple} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span style={{
              fontSize: 28, fontWeight: 800, color: C.purple,
              letterSpacing: "-0.02em", lineHeight: 1,
            }}>4:00 PM</span>
          </div>

          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 14 }}>
            60 min session
          </div>

          {/* Coach row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "linear-gradient(135deg, #00897B, #26C6DA)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>S</div>
            <span style={{ fontSize: 12, color: C.textSecondary }}>Coach Sarah Johnson</span>
          </div>

          {/* Court row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                stroke="#9B5CFF" strokeWidth="1.8" />
              <circle cx="12" cy="10" r="3" stroke="#9B5CFF" strokeWidth="1.8" />
            </svg>
            <span style={{ fontSize: 12, color: C.textSecondary }}>Court 3 – Green Courts</span>
          </div>

          {/* CTA */}
          <div style={{
            marginTop: "auto",
            background: `linear-gradient(90deg, ${C.purpleDark} 0%, ${C.purple} 100%)`,
            borderRadius: 11, padding: "12px 0",
            fontSize: 14, fontWeight: 700, color: "#fff",
            textAlign: "center", cursor: "pointer",
            boxShadow: `0 4px 20px ${C.purpleGlow}`,
          }}>View Session →</div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 10, paddingBlock: 12 }}>
            <div style={{ fontSize: 40 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary }}>No Session Today</div>
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", lineHeight: 1.5 }}>
              Book a lesson or find someone to play with.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              flex: 1, background: C.purpleSoft, border: `1px solid ${C.borderPurple}`,
              borderRadius: 10, padding: "11px 6px", fontSize: 12, fontWeight: 700,
              color: C.purple, textAlign: "center", cursor: "pointer",
            }}>Book Session</div>
            <div style={{
              flex: 1, background: C.blueSoft, border: `1px solid ${C.borderBlue}`,
              borderRadius: 10, padding: "11px 6px", fontSize: 12, fontWeight: 700,
              color: C.blue, textAlign: "center", cursor: "pointer",
            }}>Find Match</div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 4. GLOW ABILITY CARD ─────────────────────────────────────────────────────
function GlowAbilityCard() {
  return (
    <div style={{
      flex: 1,
      background: "linear-gradient(155deg, #060E0A 0%, #090E08 50%, #0A0D18 100%)",
      border: `1px solid ${C.borderLime}`,
      borderRadius: 18, padding: "18px 14px",
      display: "flex", flexDirection: "column", alignItems: "center",
      boxShadow: `0 4px 36px rgba(200,255,61,0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
      minHeight: 256,
    }}>
      {/* Top row */}
      <div style={{ width: "100%", display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em",
          color: C.lime, textTransform: "uppercase" }}>GLOW ABILITY</div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke={C.textMuted} strokeWidth="1.6" />
          <path d="M12 8v4m0 4h.01" stroke={C.textMuted} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>

      {/* Ring */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GlowRing score={78} size={148} />
      </div>

      {/* Label */}
      <div style={{ textAlign: "center", marginTop: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Proficient</div>
        <div style={{ fontSize: 12, color: C.lime, marginTop: 5, fontWeight: 600 }}>
          ↑ 6 pts from last week
        </div>
      </div>
    </div>
  );
}

// ─── 5. QUICK ACTIONS ─────────────────────────────────────────────────────────
const ACTIONS = [
  {
    label: "Book Session", color: "#9B5CFF", bg: "rgba(155,92,255,0.08)",
    border: "rgba(155,92,255,0.32)",
    icon: (c: string) => (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="3" stroke={c} strokeWidth="1.7" />
        <path d="M16 2v4M8 2v4M3 10h18" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
        <path d="M12 14v4m-2-2h4" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Find Match", color: "#4DA3FF", bg: "rgba(77,163,255,0.08)",
    border: "rgba(77,163,255,0.30)",
    icon: (c: string) => (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="9" cy="7" r="4" stroke={c} strokeWidth="1.7" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "AI Coach", color: "#00D4FF", bg: "rgba(0,212,255,0.08)",
    border: "rgba(0,212,255,0.26)",
    icon: (c: string) => (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Feedback", color: "#B57BFF", bg: "rgba(181,123,255,0.08)",
    border: "rgba(181,123,255,0.28)",
    icon: (c: string) => (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function QuickActions() {
  return (
    <div style={{ display: "flex", gap: 10, paddingInline: 20 }}>
      {ACTIONS.map((a) => (
        <div key={a.label} style={{
          flex: 1,
          background: a.bg, border: `1px solid ${a.border}`,
          borderRadius: 16, padding: "18px 6px 14px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          cursor: "pointer",
          boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        }}>
          <div style={{ color: a.color }}>{a.icon(a.color)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: a.color,
            textAlign: "center", lineHeight: 1.3 }}>{a.label}</div>
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
      background: "linear-gradient(90deg, rgba(155,92,255,0.07) 0%, rgba(200,255,61,0.04) 100%)",
      border: `1px solid ${C.borderLime}`,
      borderRadius: 14, padding: "13px 16px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>✦</span>
      <span style={{ fontSize: 18 }}>✨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
          †Your weekly recap is ready
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
          +4 sessions · Ability +3.2 · 2 wins
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.lime, whiteSpace: "nowrap" }}>
        See recap →
      </div>
    </div>
  );
}

// ─── 7. TODAY'S FOCUS ─────────────────────────────────────────────────────────
function TodaysFocus() {
  const items = [
    { emoji: "🎯", title: "Serve Consistency", sub: "Hit 70%+ first serves", color: "#9B5CFF" },
    { emoji: "👟", title: "Footwork", sub: "Stay light & balanced", color: "#4DA3FF" },
    { emoji: "🎯", title: "Rally Patience", sub: "Build the point", color: "#00D4FF" },
  ];
  return (
    <div style={{ paddingInline: 20 }}>
      <div style={{
        background: "linear-gradient(145deg, rgba(155,92,255,0.08) 0%, rgba(13,16,24,0.98) 60%)",
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        overflow: "hidden",
      }}>
        {/* Section header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "rgba(155,92,255,0.15)",
              border: `1px solid rgba(155,92,255,0.30)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15,
            }}>🎯</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.textPrimary,
              letterSpacing: "0.06em", textTransform: "uppercase" }}>
              TODAY'S FOCUS
            </div>
          </div>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Focus items */}
        <div style={{ display: "flex" }}>
          {items.map((it, i) => (
            <div key={it.title} style={{
              flex: 1, padding: "14px 12px",
              borderRight: i < items.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{it.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary,
                marginBottom: 5, lineHeight: 1.3 }}>{it.title}</div>
              <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>{it.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 8. COACH FEEDBACK CARD ───────────────────────────────────────────────────
function CoachFeedbackCard() {
  return (
    <div style={{
      flex: 1,
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 18, padding: "16px 14px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
          color: C.textMuted, textTransform: "uppercase" }}>
          RECENT COACH FEEDBACK
        </div>
        <div style={{
          background: "rgba(200,255,61,0.10)", border: `1px solid ${C.borderLime}`,
          borderRadius: 20, paddingInline: 8, paddingBlock: 3,
          fontSize: 9, fontWeight: 800, color: C.lime, letterSpacing: "0.06em",
        }}>NEW</div>
      </div>

      {/* Feedback body */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #00897B, #26A69A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 700, color: "#fff",
          boxShadow: "0 0 0 2px rgba(0,230,118,0.20)",
        }}>S</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary,
            lineHeight: 1.4, marginBottom: 6 }}>
            Great improvement in your backhand depth!
          </div>
          <div style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.55 }}>
            Focus on earlier preparation on returns. Keep it up!
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: 10, color: C.textMuted }}>2h ago</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.lime, cursor: "pointer" }}>
          View All →
        </div>
      </div>
    </div>
  );
}

// ─── 9. UPCOMING MATCH CARD ───────────────────────────────────────────────────
function UpcomingMatchCard() {
  return (
    <div style={{
      flex: 1,
      background: C.card, border: `1px solid ${C.borderBlue}`,
      borderRadius: 18, padding: "16px 14px",
      display: "flex", flexDirection: "column", gap: 9,
      boxShadow: `0 2px 24px rgba(77,163,255,0.09)`,
      position: "relative", overflow: "hidden",
    }}>
      {/* Decorative tennis ball (right side) */}
      <div style={{ position: "absolute", right: 8, top: 36, opacity: 0.20 }}>
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="33" fill={C.lime} />
          <path d="M9 22 Q36 36 9 50" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M63 22 Q36 36 63 50" stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>

      {/* Label */}
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.10em",
        color: C.blue, textTransform: "uppercase" }}>UPCOMING MATCH</div>

      {/* Date + Time row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="3" stroke={C.textMuted} strokeWidth="1.8" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke={C.textMuted} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 11, color: C.textMuted }}>Sat, May 24</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.blue }}>9:00 AM</span>
      </div>

      {/* vs */}
      <div>
        <div style={{ fontSize: 13, color: C.textSecondary }}>
          vs <span style={{ color: C.textPrimary, fontWeight: 700 }}>Ethan Miller</span>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
          U18 Singles – Quarterfinals
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
              stroke={C.textMuted} strokeWidth="1.8" />
            <circle cx="12" cy="10" r="3" stroke={C.textMuted} strokeWidth="1.8" />
          </svg>
          <span style={{ fontSize: 10, color: C.textMuted }}>Club Championship</span>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.lime, textAlign: "center" }}>
        +32 MMR on win
      </div>

      <div style={{
        background: C.blueSoft, border: `1px solid ${C.borderBlue}`,
        borderRadius: 10, padding: "10px 0",
        fontSize: 12, fontWeight: 700, color: C.blue,
        textAlign: "center", cursor: "pointer",
      }}>View Match →</div>
    </div>
  );
}

// ─── 10. YOUR JOURNEY ─────────────────────────────────────────────────────────
function JourneyCard() {
  const pct = 62;
  const r = 30;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  return (
    <div style={{ paddingInline: 20 }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 18, padding: "18px 16px",
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.13em",
          color: C.textMuted, textTransform: "uppercase", marginBottom: 16 }}>YOUR JOURNEY</div>

        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Streak */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 5 }}>
            <div style={{ fontSize: 28 }}>🔥</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.textPrimary, lineHeight: 1 }}>12</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Day Streak</div>
          </div>
          {/* XP */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 5 }}>
            <div style={{ fontSize: 28 }}>⭐</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.lime, lineHeight: 1 }}>2,450</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>XP Points</div>
          </div>
          {/* Level */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 5 }}>
            <div style={{ fontSize: 28 }}>🏆</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>Level 8</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Rising Competitor</div>
          </div>
          {/* Progress ring */}
          <div style={{ flex: "0 0 72px", position: "relative",
            width: 72, height: 72,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="72" height="72"
              style={{ transform: "rotate(-90deg)", position: "absolute", top: 0, left: 0 }}>
              <circle cx="36" cy="36" r={r} fill="none"
                stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
              <circle cx="36" cy="36" r={r} fill="none"
                stroke={C.lime} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${filled} ${circ - filled}`}
                style={{ filter: `drop-shadow(0 0 5px ${C.lime})` }}
              />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.lime, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 8, color: C.textMuted, textAlign: "center",
                lineHeight: 1.4 }}>to Level 9</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 11. BOTTOM NAV ───────────────────────────────────────────────────────────
function BottomNav() {
  return (
    <div style={{
      background: "rgba(7,9,14,0.97)",
      borderTop: `1px solid ${C.border}`,
      display: "flex", alignItems: "flex-end",
      paddingInline: 6, paddingBottom: 28, paddingTop: 10,
    }}>
      {/* Home */}
      <NavTab label="Home" active>
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </NavTab>
      {/* Social */}
      <NavTab label="Social">
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </NavTab>
      {/* Play — elevated */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", position: "relative", top: -18 }}>
        <div style={{
          width: 62, height: 62, borderRadius: "50%",
          background: "radial-gradient(circle at 38% 32%, #4A6EFF, #1A2AFF)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 0 3px rgba(77,110,255,0.35), 0 0 28px ${C.blueGlow}, 0 6px 20px rgba(26,42,255,0.55)`,
          border: "2px solid rgba(255,255,255,0.18)",
          cursor: "pointer",
        }}>
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <circle cx="15" cy="15" r="13" fill="#E0FF4A" />
            <path d="M4 10 Q15 15 4 20" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" fill="none" />
            <path d="M26 10 Q15 15 26 20" stroke="white" strokeWidth="2.5"
              strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.blue, marginTop: 6 }}>Play</div>
      </div>
      {/* Progress */}
      <NavTab label="Progress">
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </NavTab>
      {/* Profile */}
      <NavTab label="Profile">
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </NavTab>
    </div>
  );
}

function NavTab({ label, active, children }: {
  label: string; active?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", gap: 4, paddingBlock: 4, cursor: "pointer",
    }}>
      <div style={{ color: active ? C.purple : C.textMuted }}>{children}</div>
      <div style={{
        fontSize: 10,
        fontWeight: active ? 700 : 500,
        color: active ? C.purple : C.textMuted,
      }}>{label}</div>
      {active && (
        <div style={{
          width: 4, height: 4, borderRadius: "50%", background: C.purple, marginTop: 1,
        }} />
      )}
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────
export function PlayerHomeV2() {
  const [hasSession, setHasSession] = useState(true);

  return (
    <div style={{
      width: 390,
      background: C.root,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif",
      color: C.textPrimary,
      display: "flex", flexDirection: "column",
      minHeight: "100vh",
    }}>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        <Header />
        <PlayerSummary />

        {/* Hero cards */}
        <div style={{ display: "flex", gap: 12, paddingInline: 20, paddingTop: 18, paddingBottom: 18 }}>
          <NextSessionCard hasSession={hasSession} />
          <GlowAbilityCard />
        </div>

        {/* Quick actions */}
        <QuickActions />

        {/* Weekly recap */}
        <div style={{ paddingTop: 16, paddingBottom: 4 }}>
          <WeeklyRecapBanner />
        </div>

        {/* Today's focus */}
        <div style={{ paddingTop: 16, paddingBottom: 4 }}>
          <TodaysFocus />
        </div>

        {/* Lower cards */}
        <div style={{ display: "flex", gap: 12, paddingInline: 20, paddingTop: 16, paddingBottom: 4 }}>
          <CoachFeedbackCard />
          <UpcomingMatchCard />
        </div>

        {/* Journey */}
        <div style={{ paddingTop: 16, paddingBottom: 20 }}>
          <JourneyCard />
        </div>

        {/* Demo toggle */}
        <div style={{ paddingInline: 20, paddingBottom: 20 }}>
          <div onClick={() => setHasSession(s => !s)} style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "10px 16px", fontSize: 11, color: C.textMuted,
            textAlign: "center", cursor: "pointer",
          }}>
            Demo: Next Session {hasSession ? "ON → tap to turn OFF" : "OFF → tap to turn ON"}
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}
