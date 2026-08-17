import { useState } from "react";

// ─── Design Tokens (matching Glow Up Sports palette) ──────────────────────────
const T = {
  // Backgrounds
  root: "#0B0D10",
  card: "#11141A",
  cardAlt: "#141820",
  elevated: "#171B22",
  surface: "#1F2430",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",

  // Brand
  lime: "#C8FF3D",       // Glow Ability, XP, positive progress
  limeSoft: "rgba(200,255,61,0.12)",
  limeBorder: "rgba(200,255,61,0.25)",

  // Purple — sessions, training, brand
  purple: "#7C3AED",
  purpleMid: "#6D28D9",
  purpleSoft: "rgba(124,58,237,0.15)",
  purpleBorder: "rgba(124,58,237,0.3)",

  // Electric Blue — play, matches, competition
  blue: "#4DA3FF",
  blueSoft: "rgba(77,163,255,0.12)",
  blueBorder: "rgba(77,163,255,0.28)",
  cyan: "#00D4FF",
  cyanSoft: "rgba(0,212,255,0.12)",
  cyanBorder: "rgba(0,212,255,0.25)",

  // Text
  textPrimary: "#FFFFFF",
  textSecondary: "#B8BCC6",
  textMuted: "#7C8290",
  textDisabled: "#4A4F5C",

  // Status
  success: "#00E676",
  warning: "#FFB020",
  error: "#FF4D4D",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function GlowRing({ score, size = 110 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const gap = circ - filled;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.surface} strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={T.lime} strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`}
        style={{ filter: `drop-shadow(0 0 6px ${T.lime})` }}
      />
    </svg>
  );
}

function Avatar({ size = 36, online = false }: { size?: number; online?: boolean }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: "linear-gradient(135deg, #7C3AED 0%, #4DA3FF 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 0 2px ${T.purple}`,
        fontSize: size * 0.38, fontWeight: 700, color: "#fff",
      }}>A</div>
      {online && (
        <div style={{
          position: "absolute", bottom: 1, right: 1,
          width: 9, height: 9, borderRadius: "50%",
          background: T.success, border: `2px solid ${T.root}`,
        }} />
      )}
    </div>
  );
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}`,
      borderRadius: 20, paddingInline: 10, paddingBlock: 3,
      fontSize: 10, fontWeight: 700, color,
      letterSpacing: "0.04em",
    }}>{label}</div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function Header({ unread }: { unread: number }) {
  return (
    <div style={{
      paddingInline: 16, paddingTop: 52, paddingBottom: 8,
      display: "flex", alignItems: "center", gap: 10,
      position: "relative",
    }}>
      {/* Left — avatar */}
      <Avatar size={38} online />

      {/* Center — logo */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.18em",
          color: T.textPrimary, textTransform: "uppercase",
          lineHeight: 1.1,
        }}>
          <span style={{ color: T.lime }}>GLOW UP</span>
          <span style={{ color: T.textSecondary }}> SPORTS</span>
        </div>
      </div>

      {/* Right — bell */}
      <div style={{ position: "relative" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: T.elevated, border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>🔔</div>
        {unread > 0 && (
          <div style={{
            position: "absolute", top: -2, right: -2,
            width: 16, height: 16, borderRadius: "50%",
            background: T.error, border: `2px solid ${T.root}`,
            fontSize: 8, fontWeight: 700, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unread > 9 ? "9+" : unread}</div>
        )}
      </div>
    </div>
  );
}

function Greeting({ name }: { name: string }) {
  return (
    <div style={{ paddingInline: 16, paddingBottom: 14 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, letterSpacing: "-0.02em" }}>
        Good morning, {name} 👋
      </div>
      <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
        Let's elevate your game today.
      </div>
    </div>
  );
}

function PlayerSummaryStrip({ level, levelTitle, credits, ballLevel }: {
  level: number; levelTitle: string; credits: number; ballLevel: string;
}) {
  const ballColors: Record<string, string> = {
    blue: "#4FC3F7", red: "#FF4D4D", orange: "#FF851B",
    green: "#C8FF3D", yellow: "#FFD700", glow: "#E040FB",
  };
  const bColor = ballColors[ballLevel] ?? T.lime;

  return (
    <div style={{
      marginInline: 16, marginBottom: 14,
      display: "flex", gap: 8,
    }}>
      {/* Level */}
      <div style={{
        flex: 1, background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: bColor, lineHeight: 1 }}>
          Level {level}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>{levelTitle}</div>
      </div>

      {/* Credits */}
      <div style={{
        flex: 1, background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary, lineHeight: 1 }}>
          {credits}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>Credits</div>
      </div>

      {/* Family */}
      <div style={{
        flex: 1, background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 2,
        cursor: "pointer",
      }}>
        <div style={{ fontSize: 16, lineHeight: 1 }}>👨‍👩‍👧</div>
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500 }}>Family</div>
      </div>
    </div>
  );
}

function NextSessionCard({ hasSession }: { hasSession: boolean }) {
  return (
    <div style={{
      flex: 1,
      background: `linear-gradient(140deg, #1A0E2E 0%, ${T.card} 100%)`,
      border: `1px solid ${T.purpleBorder}`,
      borderRadius: 16, padding: 14,
      display: "flex", flexDirection: "column", gap: 8,
      boxShadow: `0 0 20px rgba(124,58,237,0.12)`,
      minHeight: 200, overflow: "hidden", position: "relative",
    }}>
      {/* Racket artwork (decorative) */}
      <div style={{
        position: "absolute", right: -8, top: 8,
        fontSize: 48, opacity: 0.15, transform: "rotate(20deg)",
        pointerEvents: "none",
      }}>🎾</div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: T.purple }} />
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: T.purple, textTransform: "uppercase" }}>
          Next Session
        </div>
      </div>

      {hasSession ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Pill label="TODAY" color={T.purple} bg={T.purpleSoft} />
            <div style={{ fontSize: 22, fontWeight: 800, color: T.textPrimary, marginTop: 4, lineHeight: 1 }}>4:00 PM</div>
            <div style={{ fontSize: 11, color: T.textSecondary }}>60 min session</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 11 }}>👤</div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>Coach Sarah Johnson</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 11 }}>📍</div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>Court 3 – Green Courts</div>
            </div>
          </div>

          <div style={{
            marginTop: "auto", background: T.purple,
            borderRadius: 8, padding: "8px 12px",
            fontSize: 12, fontWeight: 700, color: "#fff",
            textAlign: "center", cursor: "pointer",
          }}>View Session →</div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 8 }}>
            <div style={{ fontSize: 28 }}>📅</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>No Session Today</div>
            <div style={{ fontSize: 11, color: T.textMuted, textAlign: "center" }}>Book a lesson or find someone to play.</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, background: T.purpleSoft, border: `1px solid ${T.purpleBorder}`, borderRadius: 8, padding: "7px 4px", fontSize: 10, fontWeight: 700, color: T.purple, textAlign: "center" }}>Book Session</div>
            <div style={{ flex: 1, background: T.blueSoft, border: `1px solid ${T.blueBorder}`, borderRadius: 8, padding: "7px 4px", fontSize: 10, fontWeight: 700, color: T.blue, textAlign: "center" }}>Find Match</div>
          </div>
        </>
      )}
    </div>
  );
}

function GlowAbilityCard({ score }: { score: number }) {
  return (
    <div style={{
      flex: 1,
      background: `linear-gradient(140deg, #0A1A0A 0%, ${T.card} 100%)`,
      border: `1px solid ${T.limeBorder}`,
      borderRadius: 16, padding: 14,
      display: "flex", flexDirection: "column", gap: 6,
      boxShadow: `0 0 24px rgba(200,255,61,0.10)`,
      minHeight: 200, cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: T.lime }} />
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: T.lime, textTransform: "uppercase" }}>
          Glow Ability
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", margin: "auto" }}>
        <GlowRing score={score} size={100} />
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.lime, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 9, color: T.textMuted }}>/100</div>
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>Proficient</div>
        <div style={{ fontSize: 10, color: T.lime, marginTop: 2 }}>↑ 6 pts from last week</div>
      </div>
    </div>
  );
}

function HeroArea({ hasSession }: { hasSession: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, marginInline: 16, marginBottom: 12 }}>
      <NextSessionCard hasSession={hasSession} />
      <GlowAbilityCard score={78} />
    </div>
  );
}

function QuickActions() {
  const actions = [
    { icon: "📅", label: "Book\nSession", color: T.purple, bg: T.purpleSoft, border: T.purpleBorder },
    { icon: "🎾", label: "Find\nMatch", color: T.blue, bg: T.blueSoft, border: T.blueBorder },
    { icon: "🤖", label: "AI\nCoach", color: T.cyan, bg: T.cyanSoft, border: T.cyanBorder },
    { icon: "⭐", label: "Feed-\nback", color: "#AB47BC", bg: "rgba(171,71,188,0.10)", border: "rgba(171,71,188,0.28)" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginInline: 16, marginBottom: 12 }}>
      {actions.map((a) => (
        <div key={a.label} style={{
          flex: 1, background: a.bg, border: `1px solid ${a.border}`,
          borderRadius: 12, padding: "10px 6px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          cursor: "pointer",
        }}>
          <div style={{ fontSize: 20 }}>{a.icon}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: a.color, textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.3 }}>{a.label}</div>
        </div>
      ))}
    </div>
  );
}

function WeeklyRecapBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div style={{
      marginInline: 16, marginBottom: 12,
      background: T.elevated,
      border: `1px solid ${T.limeBorder}`,
      borderRadius: 12, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>✨ Your weekly recap is ready</div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>+4 sessions · Ability +3.2 · 2 wins</div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.lime, whiteSpace: "nowrap" }}>See recap →</div>
    </div>
  );
}

function TodaysFocusCard() {
  const items = [
    { icon: "🎯", title: "Serve Consistency", sub: "Hit 70%+ first serves" },
    { icon: "🏃", title: "Footwork", sub: "Stay light & balanced" },
    { icon: "🧘", title: "Rally Patience", sub: "Build the point" },
  ];
  return (
    <div style={{
      marginInline: 16, marginBottom: 12,
      background: `linear-gradient(135deg, rgba(124,58,237,0.08) 0%, ${T.card} 100%)`,
      border: `1px solid ${T.purpleBorder}`,
      borderRadius: 14, padding: "14px 14px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: T.purple }} />
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: T.purple, textTransform: "uppercase" }}>Today's Focus</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18, width: 28, textAlign: "center" }}>{it.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary }}>{it.title}</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>{it.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BottomRow() {
  return (
    <div style={{ display: "flex", gap: 10, marginInline: 16, marginBottom: 12 }}>
      {/* Recent Coach Feedback */}
      <div style={{
        flex: 1, background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 14, padding: "12px 12px 10px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", color: T.textMuted, textTransform: "uppercase" }}>Coach Feedback</div>
          <Pill label="NEW" color={T.lime} bg={T.limeSoft} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "linear-gradient(135deg, #00897B, #004D40)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, flexShrink: 0,
          }}>C</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textPrimary, lineHeight: 1.3 }}>Great improvement in backhand depth!</div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 3, lineHeight: 1.4 }}>Focus on earlier prep on returns.</div>
            <div style={{ fontSize: 9, color: T.textDisabled, marginTop: 4 }}>2h ago</div>
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.lime, textAlign: "right", cursor: "pointer" }}>View All →</div>
      </div>

      {/* Upcoming Match */}
      <div style={{
        flex: 1, background: T.card, border: `1px solid ${T.blueBorder}`,
        borderRadius: 14, padding: "12px 12px 10px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", color: T.textMuted, textTransform: "uppercase" }}>Upcoming Match</div>
        <div>
          <div style={{ fontSize: 10, color: T.textMuted }}>Sat, May 24</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.textPrimary, lineHeight: 1.1 }}>9:00 AM</div>
          <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2 }}>vs <strong style={{ color: T.textPrimary }}>Ethan Miller</strong></div>
          <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>U18 Singles – QF</div>
          <div style={{ fontSize: 10, color: T.lime, marginTop: 4, fontWeight: 700 }}>+32 MMR on win</div>
        </div>
        <div style={{
          background: T.blue, borderRadius: 8, padding: "6px 8px",
          fontSize: 10, fontWeight: 700, color: "#fff", textAlign: "center", cursor: "pointer",
        }}>View Match →</div>
      </div>
    </div>
  );
}

function JourneyCard({ streak, xp, level, pct }: { streak: number; xp: number; level: number; pct: number }) {
  const circ = 2 * Math.PI * 22;
  const filled = (pct / 100) * circ;
  return (
    <div style={{
      marginInline: 16, marginBottom: 12,
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: "14px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: T.lime }} />
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: T.textMuted, textTransform: "uppercase" }}>Your Journey</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {/* Stats */}
        <div style={{ flex: 1, display: "flex", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 18 }}>🔥</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary, lineHeight: 1 }}>{streak}</div>
            <div style={{ fontSize: 9, color: T.textMuted }}>Day Streak</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 18 }}>⭐</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.lime, lineHeight: 1 }}>{xp.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: T.textMuted }}>XP Points</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 18 }}>🏆</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary, lineHeight: 1 }}>Lv {level}</div>
            <div style={{ fontSize: 9, color: T.textMuted }}>Rising</div>
          </div>
        </div>
        {/* Mini progress ring */}
        <div style={{ position: "relative", width: 54, height: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={54} height={54} viewBox="0 0 54 54" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
            <circle cx={27} cy={27} r={22} fill="none" stroke={T.surface} strokeWidth={5} />
            <circle cx={27} cy={27} r={22} fill="none" stroke={T.lime} strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circ - filled}`}
              style={{ filter: `drop-shadow(0 0 4px ${T.lime})` }} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.lime, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 7, color: T.textMuted, lineHeight: 1.2, textAlign: "center" }}>to Lv {level + 1}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ active }: { active: string }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "social", icon: "👥", label: "Social" },
    { id: "play", icon: "🎾", label: "Play", special: true },
    { id: "progress", icon: "📈", label: "Progress" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];
  return (
    <div style={{
      position: "sticky", bottom: 0,
      background: "rgba(11,13,16,0.96)",
      borderTop: `1px solid ${T.border}`,
      backdropFilter: "blur(20px)",
      display: "flex", alignItems: "flex-end",
      paddingBottom: 20, paddingTop: 6,
      paddingInline: 4,
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        if (tab.special) {
          return (
            <div key={tab.id} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
              position: "relative", top: -10,
            }}>
              <div style={{
                width: 54, height: 54, borderRadius: "50%",
                background: "#1A2AFF",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24,
                boxShadow: `0 0 20px rgba(77,163,255,0.6), 0 0 40px rgba(77,163,255,0.3)`,
                border: `2px solid rgba(77,163,255,0.5)`,
              }}>{tab.icon}</div>
              <div style={{ fontSize: 9, color: T.blue, fontWeight: 600, marginTop: 2 }}>{tab.label}</div>
            </div>
          );
        }
        return (
          <div key={tab.id} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            paddingBlock: 4,
          }}>
            <div style={{ fontSize: 20, opacity: isActive ? 1 : 0.5 }}>{tab.icon}</div>
            <div style={{
              fontSize: 9, fontWeight: isActive ? 700 : 500,
              color: isActive ? "#7C3AED" : T.textDisabled,
            }}>{tab.label}</div>
            {isActive && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#7C3AED" }} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function PlayerHomeV2() {
  const [hasSession, setHasSession] = useState(true);

  return (
    <div style={{
      width: 390, minHeight: 844,
      background: T.root,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      color: T.textPrimary,
    }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Header unread={3} />
        <Greeting name="Alex" />
        <PlayerSummaryStrip level={8} levelTitle="Rising Competitor" credits={13} ballLevel="green" />
        <HeroArea hasSession={hasSession} />
        <QuickActions />
        <WeeklyRecapBanner visible />
        <TodaysFocusCard />
        <BottomRow />
        <JourneyCard streak={12} xp={2450} level={8} pct={62} />

        {/* Toggle for demo */}
        <div style={{ marginInline: 16, marginBottom: 16, display: "flex", gap: 8 }}>
          <div
            onClick={() => setHasSession(!hasSession)}
            style={{
              flex: 1, background: T.surface, borderRadius: 8,
              padding: "8px 10px", fontSize: 10, color: T.textMuted,
              textAlign: "center", cursor: "pointer",
              border: `1px solid ${T.border}`,
            }}
          >
            Toggle: Session {hasSession ? "ON" : "OFF"}
          </div>
        </div>
      </div>

      <BottomNav active="home" />
    </div>
  );
}
