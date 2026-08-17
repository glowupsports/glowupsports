import { useState } from "react";

// ─── Asset imports (Vite resolves these correctly regardless of base path) ────
import _racket      from "@/assets/home/racket.png";
import _ballLimeOrb from "@/assets/home/ball_lime_orb.png";
import _ballBlue    from "@/assets/home/ball_blue.png";
import _playerHero  from "@/assets/home/player_hero.png";
import _flame       from "@/assets/home/icon_flame.png";
import _star        from "@/assets/home/icon_star.png";
import _trophy      from "@/assets/home/icon_trophy.png";
import _ballLime    from "@/assets/home/icon_ball_lime.png";
import _shoe        from "@/assets/home/icon_shoe.png";
import _target      from "@/assets/home/icon_target.png";
import _calendar    from "@/assets/home/icon_calendar.png";
import _group       from "@/assets/home/icon_group.png";
import _ai          from "@/assets/home/icon_ai.png";
import _chat        from "@/assets/home/icon_chat.png";

const A = {
  racket:      _racket,
  ballLimeOrb: _ballLimeOrb,
  ballBlue:    _ballBlue,
  playerHero:  _playerHero,
  flame:       _flame,
  star:        _star,
  trophy:      _trophy,
  ballLime:    _ballLime,
  shoe:        _shoe,
  target:      _target,
  calendar:    _calendar,
  group:       _group,
  ai:          _ai,
  chat:        _chat,
};

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  // Backgrounds
  bg: "linear-gradient(175deg, #02050C 0%, #041224 100%)",
  cardSession: "linear-gradient(155deg, #1C0840 0%, #100620 55%, #080B1E 100%)",
  cardAbility: "linear-gradient(155deg, #030B04 0%, #060E07 50%, #060B18 100%)",
  cardDark: "#07101D",

  // Borders
  borderPurple: "rgba(140,60,255,0.38)",
  borderLime:   "rgba(200,255,50,0.28)",
  borderBlue:   "rgba(33,150,255,0.30)",
  borderMuted:  "rgba(255,255,255,0.07)",

  // Brand
  purple:      "#9B5CFF",
  purpleDark:  "#5B21B6",
  purpleGlow:  "rgba(155,92,255,0.28)",
  lime:        "#CFFF00",
  limeGlow:    "rgba(207,255,0,0.32)",
  blue:        "#2196FF",
  blueDark:    "#1565C0",
  blueGlow:    "rgba(33,150,255,0.40)",
  cyan:        "#18E3FF",

  // Text
  textPrimary:   "#F6F7FB",
  textSecondary: "#A8ADBD",
  textMuted:     "#747B8D",

  success: "#00E676",
};

// ─── Img helper — mix-blend-mode:screen hides black BG ───────────────────────
function Img({
  src, size, style = {},
}: { src: string; size: number; style?: React.CSSProperties }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      style={{
        objectFit: "contain",
        mixBlendMode: "screen",
        display: "block",
        ...style,
      }}
    />
  );
}

// ─── Glow Ring ────────────────────────────────────────────────────────────────
function GlowRing({ score, diameter = 170 }: { score: number; diameter?: number }) {
  const stroke = 12;
  const r = (diameter - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div style={{
      position: "relative", width: diameter, height: diameter,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={diameter} height={diameter}
        style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <defs>
          <filter id="limeGlow">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={diameter / 2} cy={diameter / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <circle cx={diameter / 2} cy={diameter / 2} r={r}
          fill="none" stroke={C.lime} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          filter="url(#limeGlow)" />
      </svg>
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <div style={{
          fontSize: 52, fontWeight: 800, color: C.lime, lineHeight: 1,
          letterSpacing: "-0.03em",
          textShadow: `0 0 30px ${C.limeGlow}`,
        }}>{score}</div>
        <div style={{ fontSize: 16, color: C.textMuted, fontWeight: 500 }}>/100</div>
      </div>
    </div>
  );
}

// ─── 1. HEADER ────────────────────────────────────────────────────────────────
function Header() {
  return (
    <div style={{
      position: "relative",
      minHeight: 250,
      paddingTop: 52, paddingBottom: 0, paddingInline: 22,
      overflow: "hidden",
      background: "linear-gradient(180deg, rgba(80,20,180,0.08) 0%, transparent 100%)",
    }}>
      {/* Tennis player hero — absolute right, blended */}
      <img
        src={A.playerHero}
        style={{
          position: "absolute",
          right: -10, top: -10,
          height: 240, width: "auto",
          mixBlendMode: "screen",
          opacity: 0.75,
          pointerEvents: "none",
          objectFit: "contain",
        }}
      />

      {/* Notification bell */}
      <div style={{ position: "absolute", top: 52, right: 20, zIndex: 5 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${C.borderMuted}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
              stroke={C.textSecondary} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0"
              stroke={C.textSecondary} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{
            position: "absolute", top: 6, right: 6,
            width: 9, height: 9, borderRadius: "50%",
            background: C.lime, border: `2px solid #02050C`,
          }} />
        </div>
      </div>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 24, position: "relative", zIndex: 2 }}>
        <div style={{
          fontSize: 32, fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1,
          background: "linear-gradient(90deg, #C084FC 0%, #9B5CFF 40%, #CFFF00 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>GLOW UP</div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.textSecondary,
          letterSpacing: "0.30em", marginTop: 2,
        }}>SPORTS</div>
      </div>

      {/* Avatar + greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 2 }}>
        {/* Avatar */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 78, height: 78, borderRadius: "50%",
            background: "linear-gradient(145deg, #9B5CFF 0%, #4DA3FF 100%)",
            boxShadow: `0 0 0 3px ${C.purple}, 0 0 22px ${C.purpleGlow}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, fontWeight: 800, color: "#fff",
          }}>T</div>
          <div style={{
            position: "absolute", bottom: 3, right: 3,
            width: 14, height: 14, borderRadius: "50%",
            background: C.success, border: `2.5px solid #02050C`,
          }} />
        </div>
        {/* Greeting */}
        <div>
          <div style={{
            fontSize: 22, fontWeight: 700, color: C.textPrimary,
            lineHeight: 1.25, letterSpacing: "-0.02em",
          }}>Good morning, The Law 👋</div>
          <div style={{ fontSize: 15, color: C.textMuted, marginTop: 4 }}>
            Let's elevate your game today.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. PLAYER SUMMARY STRIP ─────────────────────────────────────────────────
function PlayerSummaryStrip() {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      paddingInline: 22, paddingBlock: 16,
      borderTop: `1px solid ${C.borderMuted}`,
      borderBottom: `1px solid ${C.borderMuted}`,
    }}>
      {[
        { icon: "🛡️", main: "Level 8", sub: "Rising Competitor" },
        { icon: "⚡", main: "13 Credits" },
        { icon: "👨‍👩‍👧", main: "Family" },
      ].map((item, i) => (
        <div key={i} style={{
          flex: 1,
          display: "flex", alignItems: "center", gap: 10,
          paddingLeft: i === 0 ? 0 : 16,
          borderLeft: i > 0 ? `1px solid ${C.borderMuted}` : "none",
        }}>
          <span style={{ fontSize: 18 }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, lineHeight: 1.3 }}>
              {item.main}
            </div>
            {item.sub && (
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.2 }}>{item.sub}</div>
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
      flex: "0 0 55%",
      background: C.cardSession,
      border: `1.5px solid ${C.borderPurple}`,
      borderRadius: 24,
      padding: "20px 18px",
      display: "flex", flexDirection: "column",
      boxShadow: `0 6px 40px rgba(155,92,255,0.18), inset 0 1px 0 rgba(255,255,255,0.07)`,
      position: "relative", overflow: "hidden",
      minHeight: 390,
    }}>
      {/* Racket asset — right half of card, blended */}
      <img
        src={A.racket}
        style={{
          position: "absolute",
          right: -18, top: -10,
          width: "62%", height: "auto",
          mixBlendMode: "screen",
          opacity: 0.90,
          pointerEvents: "none",
          objectFit: "contain",
        }}
      />

      {/* Card content */}
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "0.15em",
        color: C.purple, textTransform: "uppercase", marginBottom: 14,
      }}>NEXT SESSION</div>

      {hasSession ? (
        <>
          {/* "Today" heading */}
          <div style={{
            fontSize: 46, fontWeight: 800, color: C.textPrimary,
            lineHeight: 1, letterSpacing: "-0.03em", marginBottom: 6,
          }}>Today</div>

          {/* Time */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke={C.purple} strokeWidth="1.8" />
              <path d="M12 6v6l4 2" stroke={C.purple} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span style={{
              fontSize: 32, fontWeight: 800, color: C.purple,
              lineHeight: 1, letterSpacing: "-0.02em",
            }}>4:00 PM</span>
          </div>

          <div style={{ fontSize: 15, color: C.textSecondary, marginBottom: 18 }}>
            60 min session
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(155,92,255,0.15)", marginBottom: 14 }} />

          {/* Coach */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #00897B, #26C6DA)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff",
            }}>S</div>
            <span style={{ fontSize: 14, color: C.textSecondary }}>Coach Sarah Johnson</span>
          </div>

          {/* Court */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                stroke={C.purple} strokeWidth="1.8" />
              <circle cx="12" cy="10" r="3" stroke={C.purple} strokeWidth="1.8" />
            </svg>
            <span style={{ fontSize: 14, color: C.textSecondary }}>Court 3 – Green Courts</span>
          </div>

          {/* CTA */}
          <div style={{ marginTop: "auto" }}>
            <div style={{
              background: `linear-gradient(90deg, ${C.purpleDark} 0%, ${C.purple} 100%)`,
              borderRadius: 16, padding: "14px 0",
              fontSize: 16, fontWeight: 700, color: "#fff",
              textAlign: "center", cursor: "pointer",
              boxShadow: `0 6px 24px ${C.purpleGlow}`,
            }}>View Session →</div>
          </div>
        </>
      ) : (
        <>
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12, paddingBlock: 16,
          }}>
            <div style={{ fontSize: 48 }}>📅</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>
              No Session Today
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 1.6 }}>
              Book a lesson or find someone to play with.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{
              flex: 1, background: "rgba(155,92,255,0.10)",
              border: `1px solid ${C.borderPurple}`, borderRadius: 12,
              padding: "12px 6px", fontSize: 13, fontWeight: 700,
              color: C.purple, textAlign: "center", cursor: "pointer",
            }}>Book Session</div>
            <div style={{
              flex: 1, background: "rgba(33,150,255,0.10)",
              border: `1px solid ${C.borderBlue}`, borderRadius: 12,
              padding: "12px 6px", fontSize: 13, fontWeight: 700,
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
      background: C.cardAbility,
      border: `1.5px solid ${C.borderLime}`,
      borderRadius: 24, padding: "20px 16px",
      display: "flex", flexDirection: "column", alignItems: "center",
      boxShadow: `0 6px 40px rgba(207,255,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
      minHeight: 390,
    }}>
      <div style={{ width: "100%", display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.15em",
          color: C.lime, textTransform: "uppercase" }}>GLOW ABILITY</div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke={C.textMuted} strokeWidth="1.6" />
          <path d="M12 8v4m0 4h.01" stroke={C.textMuted} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GlowRing score={78} diameter={170} />
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.textPrimary }}>Proficient</div>
        <div style={{
          fontSize: 14, fontWeight: 600, color: C.lime, marginTop: 6,
          textShadow: `0 0 12px ${C.limeGlow}`,
        }}>↑ 6 pts from last week</div>
      </div>
    </div>
  );
}

// ─── 5. QUICK ACTIONS ─────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Book\nSession", icon: A.calendar, color: "#9B5CFF",
    bg: "rgba(155,92,255,0.08)", border: "rgba(155,92,255,0.30)" },
  { label: "Find\nMatch", icon: A.group, color: "#2196FF",
    bg: "rgba(33,150,255,0.08)", border: "rgba(33,150,255,0.28)" },
  { label: "AI\nCoach", icon: A.ai, color: "#18E3FF",
    bg: "rgba(24,227,255,0.07)", border: "rgba(24,227,255,0.25)" },
  { label: "Feedback", icon: A.chat, color: "#4DA3FF",
    bg: "rgba(77,163,255,0.08)", border: "rgba(77,163,255,0.26)" },
];

function QuickActions() {
  return (
    <div style={{ display: "flex", gap: 10, paddingInline: 22 }}>
      {QUICK_ACTIONS.map((a) => (
        <div key={a.label} style={{
          flex: 1,
          background: a.bg, border: `1px solid ${a.border}`,
          borderRadius: 20, padding: "18px 6px 14px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          cursor: "pointer", minHeight: 128,
          boxShadow: "0 2px 16px rgba(0,0,0,0.35)",
        }}>
          <Img src={a.icon} size={44} />
          <div style={{
            fontSize: 12, fontWeight: 700, color: a.color,
            textAlign: "center", lineHeight: 1.35, whiteSpace: "pre-line",
          }}>{a.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 6. WEEKLY RECAP BANNER ───────────────────────────────────────────────────
function WeeklyRecapBanner() {
  return (
    <div style={{
      marginInline: 22,
      background: "linear-gradient(90deg, rgba(155,92,255,0.07) 0%, rgba(207,255,0,0.04) 100%)",
      border: `1px solid ${C.borderLime}`,
      borderRadius: 20, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 12,
      minHeight: 72,
    }}>
      <span style={{ fontSize: 20 }}>✦</span>
      <span style={{ fontSize: 20 }}>✨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
          Your weekly recap is ready
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>
          +4 sessions · Ability +3.2 · 2 wins
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.lime, whiteSpace: "nowrap" }}>
        See recap →
      </div>
    </div>
  );
}

// ─── 7. TODAY'S FOCUS ─────────────────────────────────────────────────────────
const FOCUS_ITEMS = [
  { icon: A.ballLime, label: "Serve Consistency", sub: "Hit 70%+\nfirst serves" },
  { icon: A.shoe,    label: "Footwork",           sub: "Stay light\n& balanced" },
  { icon: A.target,  label: "Rally Patience",     sub: "Build\nthe point" },
];

function TodaysFocus() {
  return (
    <div style={{ paddingInline: 22 }}>
      <div style={{
        background: C.cardDark,
        border: `1.5px solid ${C.borderPurple}`,
        borderRadius: 22, overflow: "hidden",
        minHeight: 160,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px",
          borderBottom: `1px solid ${C.borderMuted}`,
          background: "linear-gradient(90deg, rgba(155,92,255,0.08) 0%, transparent 100%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Img src={A.target} size={28} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary,
              letterSpacing: "0.08em", textTransform: "uppercase" }}>
              TODAY'S FOCUS
            </span>
          </div>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        {/* Focus items */}
        <div style={{ display: "flex" }}>
          {FOCUS_ITEMS.map((it, i) => (
            <div key={it.label} style={{
              flex: 1, padding: "16px 12px",
              borderRight: i < FOCUS_ITEMS.length - 1 ? `1px solid ${C.borderMuted}` : "none",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              <Img src={it.icon} size={52} />
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary,
                textAlign: "center", lineHeight: 1.3 }}>{it.label}</div>
              <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center",
                lineHeight: 1.45, whiteSpace: "pre-line" }}>{it.sub}</div>
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
      background: C.cardDark,
      border: `1.5px solid ${C.borderPurple}`,
      borderRadius: 22, padding: "18px 16px",
      display: "flex", flexDirection: "column", gap: 12,
      minHeight: 270,
    }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em",
          color: C.textMuted, textTransform: "uppercase" }}>
          RECENT COACH FEEDBACK
        </div>
        <div style={{
          background: "rgba(207,255,0,0.10)", border: `1px solid ${C.borderLime}`,
          borderRadius: 20, paddingInline: 9, paddingBlock: 4,
          fontSize: 9, fontWeight: 800, color: C.lime, letterSpacing: "0.06em",
        }}>NEW</div>
      </div>

      {/* Feedback */}
      <div style={{ display: "flex", gap: 10, flex: 1 }}>
        <div style={{
          width: 50, height: 50, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #00897B, #26A69A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700, color: "#fff",
          boxShadow: "0 0 0 2px rgba(0,230,118,0.20)",
        }}>S</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary,
            lineHeight: 1.45, marginBottom: 8 }}>
            Great improvement in your backhand depth!
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.55 }}>
            Focus on earlier preparation on returns. Keep it up!
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>2h ago</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.lime, cursor: "pointer" }}>
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
      background: C.cardDark,
      border: `1.5px solid ${C.borderBlue}`,
      borderRadius: 22, padding: "18px 16px",
      display: "flex", flexDirection: "column", gap: 10,
      position: "relative", overflow: "hidden",
      minHeight: 270,
      boxShadow: `0 4px 28px rgba(33,150,255,0.09)`,
    }}>
      {/* Neon lime tennis ball — decorative, bottom right */}
      <img
        src={A.ballLimeOrb}
        style={{
          position: "absolute", right: -10, bottom: 60,
          width: 85, height: 85,
          mixBlendMode: "screen", opacity: 0.50,
          pointerEvents: "none", objectFit: "contain",
        }}
      />

      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
        color: C.blue, textTransform: "uppercase" }}>UPCOMING MATCH</div>

      {/* Date + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="3" stroke={C.textMuted} strokeWidth="1.8" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke={C.textMuted} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 12, color: C.textMuted }}>Sat, May 24</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 800, color: C.blue }}>9:00 AM</span>
      </div>

      <div>
        <div style={{ fontSize: 14, color: C.textSecondary }}>
          vs <span style={{ color: C.textPrimary, fontWeight: 700 }}>Ethan Miller</span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
          U18 Singles – Quarterfinals
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
              stroke={C.textMuted} strokeWidth="1.8" />
            <circle cx="12" cy="10" r="3" stroke={C.textMuted} strokeWidth="1.8" />
          </svg>
          <span style={{ fontSize: 11, color: C.textMuted }}>Club Championship</span>
        </div>
      </div>

      {/* MMR pill */}
      <div style={{
        alignSelf: "center",
        background: "rgba(207,255,0,0.08)", border: `1px solid ${C.borderLime}`,
        borderRadius: 20, paddingInline: 14, paddingBlock: 7,
        fontSize: 13, fontWeight: 700, color: C.lime, textAlign: "center",
      }}>+32 MMR on win</div>

      {/* CTA */}
      <div style={{
        marginTop: "auto",
        background: "rgba(33,150,255,0.10)", border: `1px solid ${C.borderBlue}`,
        borderRadius: 12, padding: "11px 0",
        fontSize: 13, fontWeight: 700, color: C.blue,
        textAlign: "center", cursor: "pointer",
      }}>View Match →</div>
    </div>
  );
}

// ─── 10. YOUR JOURNEY ─────────────────────────────────────────────────────────
function JourneyCard() {
  const pct = 62;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  return (
    <div style={{ paddingInline: 22 }}>
      <div style={{
        background: C.cardDark,
        border: `1.5px solid ${C.borderPurple}`,
        borderRadius: 24, padding: "20px 18px",
        minHeight: 170,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
          color: C.purple, textTransform: "uppercase", marginBottom: 18 }}>
          YOUR JOURNEY
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Streak */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 6,
            paddingRight: 12, borderRight: `1px solid ${C.borderMuted}` }}>
            <Img src={A.flame} size={50} />
            <div style={{ fontSize: 26, fontWeight: 900, color: C.textPrimary, lineHeight: 1 }}>12</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Day Streak</div>
          </div>

          {/* XP */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 6,
            paddingInline: 12, borderRight: `1px solid ${C.borderMuted}` }}>
            <Img src={A.star} size={50} />
            <div style={{ fontSize: 22, fontWeight: 900, color: C.lime, lineHeight: 1 }}>2,450</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>XP Points</div>
          </div>

          {/* Level */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 6,
            paddingInline: 12, borderRight: `1px solid ${C.borderMuted}` }}>
            <Img src={A.trophy} size={50} />
            <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>
              Level 8
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, textAlign: "center" }}>
              Rising Competitor
            </div>
          </div>

          {/* Progress ring */}
          <div style={{ flex: "0 0 76px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", width: 76, height: 76,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="76" height="76"
                style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                <circle cx="38" cy="38" r={r} fill="none"
                  stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                <circle cx="38" cy="38" r={r} fill="none"
                  stroke={C.lime} strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${filled} ${circ - filled}`}
                  style={{ filter: `drop-shadow(0 0 6px ${C.lime})` }}
                />
              </svg>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.lime, lineHeight: 1 }}>
                  {pct}%
                </div>
                <div style={{ fontSize: 8, color: C.textMuted, textAlign: "center",
                  lineHeight: 1.4 }}>to<br />Level 9</div>
              </div>
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
      background: "rgba(4,8,20,0.97)",
      borderTop: `1px solid ${C.borderMuted}`,
      backdropFilter: "blur(24px)",
      display: "flex", alignItems: "flex-end",
      paddingInline: 8, paddingBottom: 28, paddingTop: 10,
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

      {/* Play — elevated central button */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", position: "relative", top: -22,
      }}>
        <div style={{
          width: 76, height: 76, borderRadius: "50%",
          background: "radial-gradient(circle at 38% 32%, #3A6BFF, #1565C0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 0 3px rgba(33,150,255,0.35), 0 0 32px ${C.blueGlow}, 0 8px 24px rgba(21,101,192,0.65)`,
          border: "2px solid rgba(255,255,255,0.18)",
          cursor: "pointer",
        }}>
          <img
            src={A.ballBlue}
            style={{ width: 46, height: 46, objectFit: "contain", mixBlendMode: "screen" }}
          />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginTop: 6 }}>Play</div>
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
  label: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", gap: 4, paddingBlock: 4, cursor: "pointer",
    }}>
      <div style={{ color: active ? C.purple : C.textMuted }}>{children}</div>
      <div style={{
        fontSize: 11, fontWeight: active ? 700 : 500,
        color: active ? C.purple : C.textMuted,
      }}>{label}</div>
      {active && (
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.purple }} />
      )}
    </div>
  );
}

// ─── ROOT EXPORT ─────────────────────────────────────────────────────────────
export function PlayerHomeV2() {
  const [hasSession, setHasSession] = useState(true);

  return (
    <div style={{
      width: 390,
      background: C.bg,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', sans-serif",
      color: C.textPrimary,
      display: "flex", flexDirection: "column",
      minHeight: "100vh",
    }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        {/* 1. Header */}
        <Header />

        {/* 2. Player summary */}
        <PlayerSummaryStrip />

        {/* 3 + 4. Hero cards */}
        <div style={{ display: "flex", gap: 12, paddingInline: 22,
          paddingTop: 20, paddingBottom: 20 }}>
          <NextSessionCard hasSession={hasSession} />
          <GlowAbilityCard />
        </div>

        {/* 5. Quick actions */}
        <QuickActions />

        {/* 6. Weekly recap */}
        <div style={{ paddingTop: 16, paddingBottom: 4 }}>
          <WeeklyRecapBanner />
        </div>

        {/* 7. Today's focus */}
        <div style={{ paddingTop: 16, paddingBottom: 4 }}>
          <TodaysFocus />
        </div>

        {/* 8 + 9. Feedback + match */}
        <div style={{ display: "flex", gap: 12, paddingInline: 22,
          paddingTop: 16, paddingBottom: 4 }}>
          <CoachFeedbackCard />
          <UpcomingMatchCard />
        </div>

        {/* 10. Journey */}
        <div style={{ paddingTop: 16, paddingBottom: 24 }}>
          <JourneyCard />
        </div>

        {/* Demo toggle */}
        <div style={{ paddingInline: 22, paddingBottom: 24 }}>
          <div onClick={() => setHasSession(s => !s)} style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.borderMuted}`,
            borderRadius: 12, padding: "12px 16px",
            fontSize: 12, color: C.textMuted, textAlign: "center", cursor: "pointer",
          }}>
            Demo: Session {hasSession ? "ON → tap to turn OFF" : "OFF → tap to turn ON"}
          </div>
        </div>
      </div>

      {/* 11. Bottom nav — fixed */}
      <BottomNav />
    </div>
  );
}
