import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL;
const LOGO_URL = `${BASE}promo/glow_up_logo.png`;
const PHOTOS: Record<string, string> = {
  thelaw: `${BASE}promo/thelaw.png`,
  marco:  `${BASE}promo/marco.png`,
  maya:   `${BASE}promo/maya.png`,
  rafael: `${BASE}promo/rafael.png`,
  lucas:  `${BASE}promo/jake.png`,
  sam:    `${BASE}promo/sam.png`,
};

const C = {
  bg: "#0B0D10",
  card: "#11141A",
  elevated: "#171B22",
  surface: "#1F2430",
  primary: "#C8FF3D",
  cyan: "#00D9FF",
  gold: "#FFD700",
  white: "#FFFFFF",
  textSecondary: "#B8BCC6",
  textMuted: "#7C8290",
  error: "#FF4444",
  purple: "#E040FB",
  orange: "#FF851B",
  indigo: "#6366F1",
  green: "#00E676",
};

// Scene durations in ms
const SCENE_DURATIONS = [4000, 6000, 7000, 13000, 7000, 7000, 10000, 3000, 3000];
const TOTAL = SCENE_DURATIONS.reduce((a, b) => a + b, 0); // 60000ms

function easeOut(t: number) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3); }
function easeInOut(t: number) { const c = Math.max(0, Math.min(1, t)); return c < 0.5 ? 4*c*c*c : 1-Math.pow(-2*c+2,3)/2; }
function easeIn(t: number) { return Math.pow(Math.max(0, Math.min(1, t)), 3); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function cl(v: number, mn = 0, mx = 1) { return Math.max(mn, Math.min(mx, v)); }
function slideIn(p: number, delay: number, dur: number) { return easeOut(cl((p - delay) / dur)); }

function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const play = () => { startRef.current = performance.now() - elapsed; setPlaying(true); setStarted(true); };
  const pause = () => setPlaying(false);
  const reset = () => { setElapsed(0); setPlaying(false); setStarted(false); };

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const e = now - startRef.current;
      if (e >= TOTAL) { setElapsed(TOTAL); setPlaying(false); }
      else { setElapsed(e); rafRef.current = requestAnimationFrame(tick); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  let scene = 0, sceneElapsed = elapsed;
  for (let i = 0; i < SCENE_DURATIONS.length; i++) {
    if (sceneElapsed < SCENE_DURATIONS[i]) { scene = i; break; }
    sceneElapsed -= SCENE_DURATIONS[i];
    if (i === SCENE_DURATIONS.length - 1) { scene = i; sceneElapsed = SCENE_DURATIONS[i]; }
  }
  const sp = SCENE_DURATIONS[scene] > 0 ? cl(sceneElapsed / SCENE_DURATIONS[scene]) : 1;

  return { elapsed, scene, sceneElapsed, sp, playing, started, play, pause, reset };
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function XPBar({ fill, color = C.primary }: { fill: number; color?: string }) {
  return (
    <div style={{ height: 5, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${cl(fill) * 100}%`, height: "100%", background: color, boxShadow: `0 0 6px ${color}`, borderRadius: 3 }} />
    </div>
  );
}

function Avatar({ initials, color, size = 48, fontSize = 18 }: { initials: string; color: string; size?: number; fontSize?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${color}50, ${color}20)`,
      border: `2px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 800, color, fontFamily: "'Space Grotesk', sans-serif",
      boxShadow: `0 0 12px ${color}40`,
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function PhotoAvatar({ photo, initials, color, size = 48 }: { photo?: string; initials: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${color}`,
      boxShadow: `0 0 10px ${color}50`,
      overflow: "hidden", flexShrink: 0,
      background: `linear-gradient(135deg, ${color}40, ${color}20)`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {photo ? (
        <img src={photo} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
      ) : (
        <span style={{ fontSize: size * 0.38, fontWeight: 800, color, fontFamily: "'Space Grotesk', sans-serif" }}>{initials}</span>
      )}
    </div>
  );
}

function GlowBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 6,
      background: `${color}18`, border: `1px solid ${color}50`,
      color, fontSize: 9, fontWeight: 700, letterSpacing: 1,
      fontFamily: "'Space Grotesk', sans-serif"
    }}>{label}</span>
  );
}

function ChatBubble({ text, align = "left", color = C.indigo, opacity = 1, partial = 1 }: { text: string; align?: "left" | "right"; color?: string; opacity?: number; partial?: number }) {
  const shown = text.slice(0, Math.floor(text.length * partial));
  return (
    <div style={{ display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start", opacity }}>
      <div style={{
        background: align === "right" ? `${C.primary}18` : `${color}18`,
        border: `1px solid ${align === "right" ? C.primary : color}40`,
        borderRadius: align === "right" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        padding: "8px 12px", maxWidth: "85%",
        color: C.textSecondary, fontSize: 11, lineHeight: 1.5,
        fontFamily: "'Space Grotesk', sans-serif",
        boxShadow: `0 0 12px ${align === "right" ? C.primary : color}15`,
      }}>
        {shown}{partial < 1 ? "▌" : ""}
      </div>
    </div>
  );
}

// ─── SCENE 1: INTRO ───────────────────────────────────────────────────────────

function Scene1({ sp }: { sp: number }) {
  const logoScale = 0.4 + easeOut(cl(sp / 0.4)) * 0.6;
  const logoOp = easeOut(cl(sp / 0.35));
  const lineW = easeOut(cl((sp - 0.1) / 0.5));
  const tagOp = slideIn(sp, 0.45, 0.35);
  const flash = sp < 0.45 ? easeOut(cl((sp - 0.2) / 0.1)) * (1 - easeOut(cl((sp - 0.3) / 0.15))) : 0;
  const ballX = lerp(-10, 115, easeIn(cl((sp - 0.65) / 0.3)));
  const ballVisible = sp > 0.65 && sp < 0.98;
  const pulse = 0.5 + 0.5 * Math.sin(sp * 20);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, overflow: "hidden" }}>
      {/* Grid lines */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.12 }}>
        <svg width="100%" height="100%" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice">
          {[...Array(7)].map((_, i) => <line key={i} x1={i * 65} y1={0} x2={i * 65} y2={700} stroke={C.primary} strokeWidth={0.5} />)}
          {[...Array(12)].map((_, i) => <line key={i} x1={0} y1={i * 60} x2={390} y2={i * 60} stroke={C.primary} strokeWidth={0.5} />)}
        </svg>
      </div>

      {/* Court line sweep */}
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)", zIndex: 2 }}>
        <div style={{ width: `${lineW * 100}%`, height: 2, background: `linear-gradient(to right, transparent, ${C.primary}, ${C.cyan}, transparent)`, boxShadow: `0 0 16px ${C.primary}`, margin: "0 auto" }} />
      </div>

      {/* Flash burst */}
      {flash > 0.01 && (
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle, ${C.primary}${Math.round(flash * 60).toString(16).padStart(2,"0")}, transparent 70%)`, pointerEvents: "none", zIndex: 3 }} />
      )}

      {/* Logo */}
      <div style={{ opacity: logoOp, transform: `scale(${logoScale})`, textAlign: "center", zIndex: 10, position: "relative" }}>
        <img
          src={LOGO_URL}
          alt="Glow Up Sports"
          style={{ width: 160, height: "auto", filter: `drop-shadow(0 0 ${20 + pulse * 15}px ${C.primary}90)`, display: "block", margin: "0 auto" }}
        />
        <div style={{ marginTop: 8, fontSize: 10, letterSpacing: 4, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>PLAYER APP</div>
      </div>

      {/* Tagline */}
      <div style={{ opacity: tagOp, marginTop: 32, zIndex: 10, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', 'Space Grotesk', sans-serif", textShadow: `0 0 24px ${C.primary}50` }}>
          Your tennis.
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.primary, fontFamily: "'Oxanium', 'Space Grotesk', sans-serif", textShadow: `0 0 24px ${C.primary}` }}>
          Leveled up.
        </div>
      </div>

      {/* Ball arc */}
      {ballVisible && (
        <div style={{ position: "absolute", top: "42%", left: `${ballX}%`, transform: "translate(-50%, -50%)", zIndex: 20, pointerEvents: "none" }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: C.primary, boxShadow: `0 0 16px ${C.primary}, 0 0 32px ${C.cyan}` }} />
          <div style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", width: 50, height: 3, background: `linear-gradient(to left, ${C.cyan}90, transparent)`, filter: "blur(1px)" }} />
        </div>
      )}
    </div>
  );
}

// ─── SCENE 2: PLAYER PROFILE ──────────────────────────────────────────────────

function Scene2({ sp }: { sp: number }) {
  const cardOp = easeOut(cl(sp / 0.3));
  const cardY = lerp(100, 0, easeOut(cl(sp / 0.3)));
  const flipScale = sp < 0.15 ? lerp(0.3, 1, easeOut(cl(sp / 0.15))) : 1;
  const namOp = slideIn(sp, 0.2, 0.25);
  const levelFill = easeOut(cl((sp - 0.3) / 0.35));
  const glowScore = Math.round(lerp(0, 847, easeOut(cl((sp - 0.25) / 0.5))));
  const badgeOp = slideIn(sp, 0.5, 0.25);
  const streakOp = slideIn(sp, 0.6, 0.25);
  const xpBurst = easeOut(cl((sp - 0.75) / 0.2));
  const pulse = 0.5 + 0.5 * Math.sin(sp * 10);
  const headlineOp = slideIn(sp, 0.7, 0.25);

  const particles = [
    { x: -30, y: -40, c: C.primary }, { x: 30, y: -50, c: C.gold },
    { x: -45, y: -20, c: C.cyan }, { x: 50, y: -25, c: C.primary },
    { x: -20, y: -60, c: C.gold }, { x: 40, y: -55, c: C.cyan },
  ];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 340, opacity: cardOp, transform: `translateY(${cardY}px) scaleX(${flipScale})` }}>
        <div style={{
          background: C.card, borderRadius: 20,
          border: `1.5px solid ${C.primary}${Math.round(30 + pulse * 50).toString(16).padStart(2, "0")}`,
          boxShadow: `0 0 ${20 + pulse * 20}px ${C.primary}20, 0 8px 40px #00000060`,
          overflow: "hidden",
        }}>
          {/* Top accent bar */}
          <div style={{ height: 3, background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`, boxShadow: `0 0 10px ${C.primary}` }} />

          <div style={{ padding: "18px 20px 20px" }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ position: "relative" }}>
                <div style={{
                  width: 60, height: 60, borderRadius: "50%",
                  border: `2px solid ${C.primary}`,
                  boxShadow: `0 0 ${12 + pulse * 12}px ${C.primary}60`,
                  overflow: "hidden",
                }}>
                  <img src={PHOTOS.thelaw} alt="Thelaw" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
                </div>
                <div style={{
                  position: "absolute", bottom: -4, right: -4,
                  width: 24, height: 24, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primary}90)`,
                  border: `2px solid ${C.bg}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 900, color: C.bg,
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: `0 0 8px ${C.primary}`,
                }}>12</div>
              </div>
              <div style={{ flex: 1, opacity: namOp }}>
                <div style={{ fontSize: 8, color: C.primary, letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif" }}>PLAYER</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>Thelaw</div>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Glow Academy</div>
              </div>
              <div style={{ textAlign: "right", opacity: namOp }}>
                <div style={{ fontSize: 8, color: C.textMuted, letterSpacing: 1, fontFamily: "'Space Grotesk', sans-serif" }}>GLOW SCORE</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.gold, textShadow: `0 0 12px ${C.gold}80`, fontFamily: "'Oxanium', sans-serif" }}>{glowScore}</div>
              </div>
            </div>

            {/* Level bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>LEVEL 12 XP</span>
                <span style={{ fontSize: 9, color: C.primary, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{Math.round(levelFill * 340)}/500 XP</span>
              </div>
              <XPBar fill={levelFill} />
            </div>

            {/* Badges row */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, opacity: badgeOp, flexWrap: "wrap" }}>
              <GlowBadge label="BASELINE WARRIOR" color={C.primary} />
              <GlowBadge label="SINGLES" color={C.cyan} />
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 8, opacity: streakOp }}>
              {[
                { label: "STREAK", value: "14", sub: "days", color: C.orange },
                { label: "LEVEL", value: "12", sub: "elite", color: C.primary },
                { label: "RANK", value: "#3", sub: "academy", color: C.gold },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, background: C.elevated, borderRadius: 10, padding: "10px 4px", textAlign: "center", border: `1px solid ${C.surface}` }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: s.color, fontFamily: "'Space Grotesk', sans-serif", textShadow: `0 0 8px ${s.color}60` }}>{s.value}</div>
                  <div style={{ fontSize: 7, color: C.textMuted, letterSpacing: 1, fontFamily: "'Space Grotesk', sans-serif" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* XP burst particles */}
      {xpBurst > 0.05 && particles.map((p, i) => (
        <div key={i} style={{
          position: "absolute", top: "38%", left: "50%",
          transform: `translate(calc(-50% + ${p.x * xpBurst}px), calc(-50% + ${p.y * xpBurst}px))`,
          width: 6, height: 6, borderRadius: "50%", background: p.c,
          boxShadow: `0 0 8px ${p.c}`, opacity: 1 - xpBurst * 0.8,
          pointerEvents: "none", zIndex: 20,
        }} />
      ))}
      {xpBurst > 0.1 && (
        <div style={{
          position: "absolute", top: "calc(38% - 60px)", left: "50%", transform: "translateX(-50%)",
          fontSize: 18, fontWeight: 900, color: C.primary, opacity: xpBurst * (1 - xpBurst),
          textShadow: `0 0 12px ${C.primary}`, fontFamily: "'Oxanium', sans-serif",
          pointerEvents: "none", zIndex: 21,
        }}>+150 XP</div>
      )}

      <div style={{ marginTop: 20, opacity: headlineOp, fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.primary}40` }}>
        Know your game.
      </div>
    </div>
  );
}

// ─── SCENE 3: BOOK A LESSON ───────────────────────────────────────────────────

function Scene3({ sp }: { sp: number }) {
  const headerOp = easeOut(cl(sp / 0.2));
  const cardOp = easeOut(cl((sp - 0.1) / 0.3));
  const cardY = lerp(-60, 0, easeOut(cl((sp - 0.1) / 0.3)));
  const slotsOp = easeOut(cl((sp - 0.3) / 0.3));
  const selectedSlot = sp > 0.6 ? 3 : -1;
  const coachCardOp = easeOut(cl((sp - 0.6) / 0.2));
  const coachCardX = lerp(100, 0, easeOut(cl((sp - 0.6) / 0.25)));
  const checkOp = easeOut(cl((sp - 0.8) / 0.15));
  const checkScale = 0.6 + easeOut(cl((sp - 0.8) / 0.15)) * 0.5;
  const headlineOp = slideIn(sp, 0.6, 0.3);
  const pulse = sp > 0.4 && sp < 0.62 ? 0.5 + 0.5 * Math.sin(sp * 16) : 0;

  const slots = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

  // Confetti dots
  const confetti = [...Array(12)].map((_, i) => ({
    x: lerp(-80, 80, i / 11) + Math.sin(i * 1.7) * 20,
    y: lerp(-30, -100, easeOut((i % 6) / 5)),
    c: [C.primary, C.gold, C.cyan, C.orange, C.purple][i % 5],
  }));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        {/* Header chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, opacity: headerOp }}>
          {["Tennis", "Padel", "Pickleball"].map((s, i) => (
            <div key={s} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: i === 0 ? `${C.primary}20` : C.elevated,
              border: `1px solid ${i === 0 ? C.primary : C.surface}`,
              color: i === 0 ? C.primary : C.textMuted,
              boxShadow: i === 0 ? `0 0 10px ${C.primary}30` : "none",
              fontFamily: "'Space Grotesk', sans-serif"
            }}>{s}</div>
          ))}
        </div>

        {/* Coach card */}
        <div style={{
          transform: `translateY(${cardY}px)`, opacity: cardOp,
          background: C.card, borderRadius: 16, border: `1px solid ${C.surface}`, padding: 16, marginBottom: 10,
          boxShadow: "0 8px 32px #00000050"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <PhotoAvatar photo={PHOTOS.marco} initials="M" color={C.cyan} size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>Coach Marco</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>4.9 ★ · 230 sessions</div>
            </div>
            <div style={{ padding: "4px 10px", borderRadius: 10, background: `${C.primary}20`, border: `1px solid ${C.primary}40`, fontSize: 10, color: C.primary, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>Available</div>
          </div>

          {/* Slots */}
          <div style={{ opacity: slotsOp }}>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1.5, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>SELECT TIME SLOT</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {slots.map((slot, i) => {
                const isSel = i === selectedSlot;
                const isPulse = i === 3 && pulse > 0;
                return (
                  <div key={slot} style={{
                    padding: "8px 0", textAlign: "center", borderRadius: 10,
                    background: isSel ? `${C.primary}25` : C.elevated,
                    border: `1.5px solid ${isSel ? C.primary : isPulse ? `${C.primary}${Math.round(pulse * 99).toString(16).padStart(2,"0")}` : C.surface}`,
                    color: isSel ? C.primary : C.textSecondary,
                    fontSize: 12, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
                    transform: `scale(${isSel ? 1.05 : 1})`,
                    boxShadow: isSel ? `0 0 10px ${C.primary}40` : "none",
                    transition: "all 0.1s ease"
                  }}>{slot}</div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Flipped coach confirmation card */}
        {coachCardOp > 0.1 && (
          <div style={{
            transform: `translateX(${coachCardX}px)`, opacity: coachCardOp,
            background: `linear-gradient(135deg, ${C.primary}15, ${C.cyan}08)`,
            borderRadius: 14, border: `1px solid ${C.primary}40`,
            padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: `0 0 20px ${C.primary}20`
          }}>
            <div style={{ fontSize: 20 }}>✓</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.primary, fontFamily: "'Space Grotesk', sans-serif" }}>Booked — 14:00 with Coach Marco</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Tuesday · Court 3 · 60 min</div>
            </div>
          </div>
        )}
      </div>

      {/* Confetti burst */}
      {checkOp > 0.05 && confetti.map((p, i) => (
        <div key={i} style={{
          position: "absolute", top: "55%", left: "50%",
          transform: `translate(calc(-50% + ${p.x * checkOp}px), calc(-50% + ${p.y * checkOp}px))`,
          width: 6, height: 6, borderRadius: 2, background: p.c,
          opacity: 1 - checkOp * 0.85, pointerEvents: "none", zIndex: 30,
        }} />
      ))}

      {/* Checkmark */}
      {checkOp > 0.1 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: `translate(-50%, -50%) scale(${checkScale})`,
          width: 72, height: 72, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.primary}50, ${C.primary}10)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: checkOp * (1 - cl((sp - 0.92) / 0.08)),
          boxShadow: `0 0 ${40 * checkOp}px ${C.primary}`,
          pointerEvents: "none", zIndex: 31,
        }}>
          <div style={{ fontSize: 32, color: C.bg, fontWeight: 900 }}>✓</div>
        </div>
      )}

      <div style={{ marginTop: 20, opacity: headlineOp, fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.primary}40` }}>
        Book any lesson in seconds.
      </div>
    </div>
  );
}

// ─── SCENE 4: AI COACH (13s centrepiece) ──────────────────────────────────────

function RadarChart({ sp, size = 200 }: { sp: number; size?: number }) {
  const cx = size / 2;
  const r = size * 0.33;
  const domains = [
    { name: "Serve", color: C.primary, base: 0.78 },
    { name: "BH", color: C.cyan, base: 0.55 },
    { name: "Fitness", color: C.orange, base: 0.72 },
    { name: "Tactics", color: C.gold, base: 0.80 },
    { name: "Mental", color: C.purple, base: 0.68 },
  ];
  const n = domains.length;
  // BH grows during this scene
  const bhGrowth = easeOut(cl((sp - 0.7) / 0.25));
  const values = domains.map((d, i) => {
    const v = i === 1 ? d.base + bhGrowth * 0.25 : d.base;
    return v * easeOut(cl((sp - i * 0.06) / 0.4));
  });
  const getP = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + v * r * Math.cos(a), y: cx + v * r * Math.sin(a) };
  };
  const outerP = domains.map((_, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cx + r * Math.sin(a) };
  });
  const dataP = values.map((v, i) => getP(i, v));
  const poly = dataP.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.33, 0.66, 1].map((lv, li) => {
        const pts = domains.map((_, i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          return `${cx + lv * r * Math.cos(a)},${cx + lv * r * Math.sin(a)}`;
        }).join(" ");
        return <polygon key={li} points={pts} fill="none" stroke={lv === 1 ? `${C.primary}40` : C.surface} strokeWidth={lv === 1 ? 1.5 : 0.8} strokeDasharray={lv < 1 ? "3,3" : undefined} />;
      })}
      {outerP.map((p, i) => <line key={i} x1={cx} y1={cx} x2={p.x} y2={p.y} stroke={`${domains[i].color}25`} strokeWidth={1} />)}
      <polygon points={poly} fill={`${C.primary}18`} stroke={C.primary} strokeWidth={2} strokeLinejoin="round" />
      {dataP.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill={`${domains[i].color}30`} />
          <circle cx={p.x} cy={p.y} r={3.5} fill={domains[i].color} filter={`drop-shadow(0 0 4px ${domains[i].color})`} />
        </g>
      ))}
      {outerP.map((p, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        return (
          <text key={i} x={cx + (r + 20) * Math.cos(a)} y={cx + (r + 20) * Math.sin(a) + 4}
            textAnchor="middle" fill={domains[i].color} fontSize={9} fontWeight="bold" fontFamily="'Space Grotesk', sans-serif">
            {domains[i].name}
          </text>
        );
      })}
      {/* BH highlight glow when growing */}
      {bhGrowth > 0.05 && (
        <circle cx={dataP[1].x} cy={dataP[1].y} r={8 + bhGrowth * 6} fill="none" stroke={C.cyan} strokeWidth={1.5} opacity={bhGrowth * 0.7} />
      )}
    </svg>
  );
}

const AI_MSG = "Tough match yesterday, Thelaw. I noticed your backhand broke down in the second set. Let's fix that today.";
const AI_MSG2 = "Coach added a note: \"Work on cross-court backhand consistency.\" I've integrated it into your plan.";
const DRILL_MSG = "Today's focus: Cross-Court Backhand Drills →";

function Scene4({ sp }: { sp: number }) {
  // Sub-moment timings (relative to scene, 0–1 over 13s)
  // 0–0.25: match result card + AI typewriter (0-3.25s)
  // 0.25–0.45: coach note notification (3.25-5.85s)
  // 0.45–0.70: drill recommendation (5.85-9.1s)
  // 0.70–1.0: radar chart growth (9.1-13s)

  const matchOp = easeOut(cl(sp / 0.15));
  const matchY = lerp(-50, 0, easeOut(cl(sp / 0.15)));

  // Typewriter for AI msg 1
  const tw1Progress = cl((sp - 0.08) / 0.18);
  const tw1 = AI_MSG.slice(0, Math.floor(AI_MSG.length * tw1Progress));
  const msg1Op = easeOut(cl((sp - 0.06) / 0.1));

  // Coach note
  const coachNoteOp = easeOut(cl((sp - 0.28) / 0.12));
  const coachNoteX = lerp(60, 0, easeOut(cl((sp - 0.28) / 0.15)));

  // AI acknowledges (typewriter 2)
  const tw2Progress = cl((sp - 0.38) / 0.1);
  const tw2 = AI_MSG2.slice(0, Math.floor(AI_MSG2.length * tw2Progress));
  const msg2Op = easeOut(cl((sp - 0.36) / 0.1));

  // Drill card
  const drillOp = easeOut(cl((sp - 0.5) / 0.15));
  const drillY = lerp(30, 0, easeOut(cl((sp - 0.5) / 0.15)));
  const drillPulse = 0.5 + 0.5 * Math.sin(sp * 12);

  // Radar
  const radarOp = easeOut(cl((sp - 0.68) / 0.15));
  const radarScale = 0.6 + easeOut(cl((sp - 0.68) / 0.2)) * 0.4;

  // Fade out phase 1 content as phase 2 begins
  const phase1Fade = cl((sp - 0.63) / 0.1);
  const phase2Fade = cl((sp - 0.65) / 0.1);

  const headlineOp = slideIn(sp, 0.82, 0.15);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", background: C.bg, overflow: "hidden" }}>
      {/* AI glow bg */}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${C.indigo}08, transparent 70%)`, pointerEvents: "none" }} />

      {/* Phase 1: Match result + AI chat */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", gap: 10, opacity: 1 - phase1Fade, pointerEvents: phase1Fade > 0.5 ? "none" : "auto" }}>
        {/* Match result card */}
        <div style={{
          transform: `translateY(${matchY}px)`, opacity: matchOp,
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.error}40`, padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: `0 0 16px ${C.error}15`,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${C.error}18`, border: `1px solid ${C.error}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>L</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>Match Result — Lost</div>
            <div style={{ fontSize: 11, color: C.error, fontFamily: "'Oxanium', sans-serif", fontWeight: 700 }}>4–6, 3–6</div>
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Yesterday</div>
        </div>

        {/* AI chat area */}
        <div style={{
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.indigo}40`, padding: 12,
          boxShadow: `0 0 20px ${C.indigo}15`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: `linear-gradient(135deg, ${C.indigo}, ${C.cyan}80)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, boxShadow: `0 0 8px ${C.indigo}60`,
            }}>✨</div>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#818CF8", letterSpacing: 1.5, fontFamily: "'Space Grotesk', sans-serif" }}>GLOW AI COACH</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: msg1Op }}>
            <ChatBubble text={AI_MSG} color={C.indigo} opacity={1} partial={tw1Progress < 1 ? tw1Progress + 0.01 : 1} />
          </div>
        </div>
      </div>

      {/* Phase 2: Coach note + drill + radar */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", gap: 10, opacity: phase2Fade, pointerEvents: phase2Fade < 0.5 ? "none" : "auto" }}>
        {/* Coach note notification */}
        <div style={{
          transform: `translateX(${coachNoteX}%)`, opacity: coachNoteOp,
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.gold}40`, padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: `0 0 16px ${C.gold}20`,
        }}>
          <PhotoAvatar photo={PHOTOS.marco} initials="M" color={C.gold} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, letterSpacing: 1, fontFamily: "'Space Grotesk', sans-serif" }}>COACH NOTE</div>
            <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>"Work on cross-court backhand consistency"</div>
          </div>
        </div>

        {/* AI response to coach note */}
        <div style={{
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.indigo}40`, padding: 12,
          opacity: msg2Op,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: `linear-gradient(135deg, ${C.indigo}, ${C.cyan}80)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✨</div>
            <span style={{ fontSize: 8, fontWeight: 800, color: "#818CF8", letterSpacing: 1.5, fontFamily: "'Space Grotesk', sans-serif" }}>GLOW AI</span>
          </div>
          <ChatBubble text={tw2} color={C.indigo} partial={1} />
        </div>

        {/* Drill recommendation */}
        <div style={{
          transform: `translateY(${drillY}px)`, opacity: drillOp,
          background: `linear-gradient(135deg, ${C.primary}18, ${C.cyan}08)`,
          borderRadius: 14, border: `1.5px solid ${C.primary}${Math.round(40 + drillPulse * 40).toString(16).padStart(2,"0")}`,
          padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: `0 0 ${10 + drillPulse * 10}px ${C.primary}20`,
        }}>
          <div>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 2 }}>TODAY'S FOCUS</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.primary, fontFamily: "'Space Grotesk', sans-serif" }}>{DRILL_MSG}</div>
          </div>
          <div style={{ fontSize: 20 }}>🎾</div>
        </div>

        {/* Radar chart */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: radarOp, transform: `scale(${radarScale})` }}>
          <RadarChart sp={sp} size={160} />
          <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginTop: -4, textShadow: `0 0 8px ${C.cyan}` }}>
            Backhand improving
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: headlineOp }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.indigo}60` }}>
          Your AI coach learns you.
        </div>
      </div>
    </div>
  );
}

// ─── SCENE 5: MATCH FINDER & SCOUTING ─────────────────────────────────────────

function Scene5({ sp }: { sp: number }) {
  const listOp = easeOut(cl(sp / 0.25));
  const tapped = sp > 0.45;
  const scoutOp = easeOut(cl((sp - 0.45) / 0.2));
  const scoutY = lerp(60, 0, easeOut(cl((sp - 0.45) / 0.25)));
  const challengePulse = tapped ? 0.5 + 0.5 * Math.sin(sp * 18) : 0;
  const headlineOp = slideIn(sp, 0.6, 0.3);

  const opponents = [
    { name: "Rafael M.", level: "Elite", score: "4.2", wl: "18-6", color: C.gold, tags: ["Big Serve", "Net Player"] },
    { name: "Lucas V.", level: "Advanced", score: "3.8", wl: "14-9", color: C.orange, tags: ["Baseline", "Pusher"] },
    { name: "Sam P.", level: "Inter.", score: "3.2", wl: "9-12", color: C.cyan, tags: ["All-Round"] },
  ];

  const featured = opponents[0];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, marginBottom: 10, fontFamily: "'Space Grotesk', sans-serif", opacity: listOp }}>OPEN MATCHES NEAR YOU</div>

        {/* Match feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: listOp }}>
          {opponents.map((opp, i) => {
            const entryOp = easeOut(cl((sp - i * 0.06) / 0.25));
            const entryY = lerp(30, 0, easeOut(cl((sp - i * 0.06) / 0.25)));
            const isSelected = i === 0 && tapped;
            return (
              <div key={opp.name} style={{
                background: C.card, borderRadius: 14, padding: "12px 14px",
                border: `1px solid ${isSelected ? opp.color : C.surface}`,
                display: "flex", alignItems: "center", gap: 10,
                opacity: entryOp, transform: `translateY(${entryY}px)`,
                boxShadow: isSelected ? `0 0 16px ${opp.color}25` : "0 4px 12px #00000030",
                transition: "border 0.1s, box-shadow 0.1s"
              }}>
                <PhotoAvatar photo={PHOTOS[opp.name.split(" ")[0].toLowerCase()]} initials={opp.name[0]} color={opp.color} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>{opp.name}</div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <GlowBadge label={opp.level} color={opp.color} />
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{opp.wl} W/L</span>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: opp.color, fontFamily: "'Oxanium', sans-serif" }}>{opp.score}</div>
              </div>
            );
          })}
        </div>

        {/* Scouting card */}
        {scoutOp > 0.05 && (
          <div style={{
            marginTop: 10, transform: `translateY(${scoutY}px)`, opacity: scoutOp,
            background: `linear-gradient(135deg, ${featured.color}12, ${C.card})`,
            borderRadius: 16, border: `1.5px solid ${featured.color}50`,
            padding: 14, boxShadow: `0 0 24px ${featured.color}20`,
          }}>
            <div style={{ fontSize: 9, color: featured.color, letterSpacing: 2, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }}>SCOUTING REPORT</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
              <PhotoAvatar photo={PHOTOS.rafael} initials={featured.name[0]} color={featured.color} size={44} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>{featured.name}</div>
                <div style={{ display: "flex", gap: 5 }}>
                  {featured.tags.map(t => <GlowBadge key={t} label={t} color={featured.color} />)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ k: "W/L", v: featured.wl }, { k: "UTR", v: featured.score }, { k: "RANK", v: "#8" }].map(s => (
                <div key={s.k} style={{ flex: 1, background: C.elevated, borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: featured.color, fontFamily: "'Oxanium', sans-serif" }}>{s.v}</div>
                  <div style={{ fontSize: 8, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{s.k}</div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 10, padding: "10px 0", borderRadius: 10, textAlign: "center",
              background: challengePulse > 0 ? featured.color : `${featured.color}20`,
              border: `1.5px solid ${featured.color}`,
              color: challengePulse > 0 ? C.bg : featured.color,
              fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
              boxShadow: `0 0 ${8 + challengePulse * 16}px ${featured.color}60`,
              transition: "background 0.1s, color 0.1s"
            }}>
              ⚔ Challenge Rafael
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, opacity: headlineOp, fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.gold}40` }}>
        Know your opponent.
      </div>
    </div>
  );
}

// ─── SCENE 6: COMMUNITY & FRIENDS ─────────────────────────────────────────────

function Scene6({ sp }: { sp: number }) {
  const friendOp = easeOut(cl(sp / 0.25));
  const friendX = lerp(-60, 0, easeOut(cl(sp / 0.25)));

  const chatBubbles = [
    { text: "Anyone up for doubles tonight? 🎾", from: "Maya", time: "7:23 PM", color: C.purple, side: "left" as const },
    { text: "I'm in! Court 4 at 7?", from: "Thelaw", time: "7:24 PM", color: C.primary, side: "right" as const },
    { text: "Let's go! Rafael is joining too", from: "Maya", time: "7:24 PM", color: C.purple, side: "left" as const },
  ];

  const rsvpOp = easeOut(cl((sp - 0.45) / 0.2));
  const reactionOps = [
    easeOut(cl((sp - 0.6) / 0.15)),
    easeOut(cl((sp - 0.65) / 0.15)),
    easeOut(cl((sp - 0.7) / 0.15)),
  ];

  const headlineOp = slideIn(sp, 0.7, 0.25);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Friend request */}
        <div style={{
          transform: `translateX(${friendX}px)`, opacity: friendOp,
          background: C.card, borderRadius: 14, border: `1px solid ${C.purple}40`,
          padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
          boxShadow: `0 0 16px ${C.purple}15`,
        }}>
          <PhotoAvatar photo={PHOTOS.maya} initials="M" color={C.purple} size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>Maya S. wants to be friends</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Elite · 4.2 UTR</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ padding: "5px 12px", borderRadius: 10, background: C.primary, color: C.bg, fontSize: 10, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif" }}>Accept</div>
          </div>
        </div>

        {/* Group chat */}
        <div style={{
          background: C.card, borderRadius: 14, border: `1px solid ${C.surface}`, overflow: "hidden",
          opacity: easeOut(cl((sp - 0.18) / 0.2)),
        }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.surface}`, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", marginRight: 4 }}>
              {[C.purple, C.gold, C.cyan].map((c, i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: `${c}40`, border: `1.5px solid ${c}`, marginLeft: i > 0 ? -8 : 0 }} />
              ))}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>Tuesday Doubles Squad</span>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            {chatBubbles.map((b, i) => {
              const bubOp = easeOut(cl((sp - 0.2 - i * 0.08) / 0.2));
              return (
                <div key={i} style={{ opacity: bubOp }}>
                  {b.side === "left" && <div style={{ fontSize: 8, color: b.color, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 2, fontWeight: 700 }}>{b.from}</div>}
                  <div style={{ display: "flex", justifyContent: b.side === "right" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      background: b.side === "right" ? `${b.color}18` : C.elevated,
                      border: `1px solid ${b.color}30`,
                      borderRadius: b.side === "right" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      padding: "7px 10px", maxWidth: "80%",
                      fontSize: 11, color: C.textSecondary, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.4,
                    }}>{b.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RSVP event */}
        <div style={{
          opacity: rsvpOp, transform: `translateY(${lerp(20, 0, easeOut(cl((sp - 0.45) / 0.2)))}px)`,
          background: `linear-gradient(135deg, ${C.primary}12, ${C.cyan}08)`,
          borderRadius: 14, border: `1px solid ${C.primary}30`, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.primary}20`, border: `1px solid ${C.primary}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎾</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>Academy Tournament — Saturday</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>14 going · Open to all levels</div>
          </div>
          <div style={{ padding: "5px 10px", borderRadius: 8, background: C.primary, color: C.bg, fontSize: 10, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif" }}>RSVP</div>
        </div>

        {/* Reactions flying */}
        <div style={{ display: "flex", gap: 6, opacity: easeOut(cl((sp - 0.58) / 0.15)) }}>
          {[{ e: "🔥", c: C.orange, op: reactionOps[0] }, { e: "⚡", c: C.primary, op: reactionOps[1] }, { e: "🏆", c: C.gold, op: reactionOps[2] }].map((r, i) => (
            <div key={i} style={{
              padding: "5px 10px", borderRadius: 20, background: `${r.c}18`, border: `1px solid ${r.c}40`,
              fontSize: 12, color: r.c, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
              opacity: r.op, transform: `translateY(${lerp(10, 0, r.op)}px)`,
            }}>{r.e} {[12, 8, 5][i]}</div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, opacity: headlineOp, fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.purple}40` }}>
        Find your people on the court.
      </div>
    </div>
  );
}

// ─── SCENE 7: QUESTS + POST-SESSION CHECK-IN ───────────────────────────────────

function Scene7({ sp }: { sp: number }) {
  // 0–0.35: Quest bar fills → complete + XP rain
  // 0.35–1.0: Post-session check-in (3 steps, more breathing room)

  const questOp = easeOut(cl(sp / 0.15));
  const questFill = easeOut(cl(sp / 0.28));
  const questDone = sp > 0.28;
  const xpRain = questDone ? easeOut(cl((sp - 0.28) / 0.15)) : 0;

  // Check-in modal (3 steps — now starts earlier, more time)
  const checkInOp = easeOut(cl((sp - 0.35) / 0.12));
  const checkInY = lerp(80, 0, easeOut(cl((sp - 0.35) / 0.15)));

  // Step timing
  const step1Op = easeOut(cl((sp - 0.37) / 0.1));
  const step2Op = easeOut(cl((sp - 0.53) / 0.12));
  const step3Op = easeOut(cl((sp - 0.67) / 0.12));
  const energySlider = easeOut(cl((sp - 0.39) / 0.14)); // 0-1
  const moodActive = sp > 0.55 ? Math.min(3, Math.floor((sp - 0.55) / 0.07)) : -1;
  const xpBurst = easeOut(cl((sp - 0.75) / 0.14));

  const moods = ["😴", "😐", "😊", "🔥"];

  const xpParticles = [...Array(10)].map((_, i) => ({
    x: (i / 9 - 0.5) * 160 + Math.sin(i * 2.1) * 30,
    y: -(30 + (i % 5) * 20) * xpBurst,
    c: [C.primary, C.gold, C.cyan][i % 3],
  }));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Quest bar */}
        <div style={{ opacity: questOp * (1 - easeOut(cl((sp - 0.33) / 0.08))) }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>DAILY QUEST — Backhand Focus</span>
            <span style={{ fontSize: 10, color: C.primary, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{Math.round(questFill * 100)}%</span>
          </div>
          <div style={{ height: 10, background: C.surface, borderRadius: 5, overflow: "hidden", position: "relative" }}>
            <div style={{
              width: `${questFill * 100}%`, height: "100%",
              background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`,
              boxShadow: `0 0 8px ${C.primary}`,
              borderRadius: 5,
            }} />
          </div>
          {questDone && (
            <div style={{ marginTop: 6, textAlign: "center", color: C.primary, fontSize: 14, fontWeight: 900, fontFamily: "'Oxanium', sans-serif", textShadow: `0 0 12px ${C.primary}` }}>
              QUEST COMPLETE!
            </div>
          )}
        </div>

        {/* XP rain */}
        {xpRain > 0.05 && (
          <div style={{ position: "relative", height: 30, overflow: "visible" }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{
                position: "absolute", top: 0, left: `${10 + i * 11}%`,
                transform: `translateY(${-xpRain * (20 + i * 8)}px)`,
                fontSize: 10, fontWeight: 900, color: [C.primary, C.gold, C.cyan][i % 3],
                fontFamily: "'Oxanium', sans-serif", opacity: 1 - xpRain * 0.7,
              }}>+XP</div>
            ))}
          </div>
        )}

        {/* Post-session check-in modal */}
        <div style={{
          opacity: checkInOp, transform: `translateY(${checkInY}px)`,
          background: C.elevated, borderRadius: 20,
          border: `1.5px solid ${C.primary}40`,
          padding: "16px 18px",
          boxShadow: `0 0 30px ${C.primary}20, 0 20px 40px #00000050`,
        }}>
          <div style={{ fontSize: 10, color: C.primary, fontWeight: 700, letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 12, textAlign: "center" }}>POST-SESSION CHECK-IN</div>

          {/* Step 1: Energy slider */}
          <div style={{ opacity: step1Op, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 6 }}>How's your energy level?</div>
            <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, height: 6, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${energySlider * 80}%`, height: "100%", background: `linear-gradient(to right, ${C.orange}, ${C.primary})`, boxShadow: `0 0 6px ${C.primary}`, borderRadius: 3 }} />
              </div>
              <div style={{
                position: "absolute", left: `calc(${energySlider * 80}% - 8px)`,
                width: 16, height: 16, borderRadius: "50%",
                background: C.primary, boxShadow: `0 0 8px ${C.primary}`, border: `2px solid ${C.bg}`,
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Exhausted</span>
              <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Energized</span>
            </div>
          </div>

          {/* Step 2: Mood faces */}
          <div style={{ opacity: step2Op, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 8 }}>How do you feel about the session?</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {moods.map((m, i) => (
                <div key={m} style={{
                  width: 40, height: 40, borderRadius: 12, fontSize: 22,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: i === moodActive ? `${C.primary}25` : C.surface,
                  border: `2px solid ${i === moodActive ? C.primary : C.surface}`,
                  boxShadow: i === moodActive ? `0 0 12px ${C.primary}40` : "none",
                  transform: `scale(${i === moodActive ? 1.15 : 1})`,
                  transition: "all 0.15s ease",
                }}>{m}</div>
              ))}
            </div>
          </div>

          {/* Step 3: XP reward */}
          <div style={{ opacity: step3Op, textAlign: "center", position: "relative" }}>
            <div style={{
              padding: "10px", borderRadius: 12,
              background: `linear-gradient(135deg, ${C.primary}20, ${C.gold}10)`,
              border: `1px solid ${C.primary}40`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.primary, fontFamily: "'Oxanium', sans-serif", textShadow: `0 0 16px ${C.primary}` }}>+200 XP</div>
              <div style={{ fontSize: 10, color: C.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>Session complete · Glow Score +12</div>
            </div>
            {xpBurst > 0.05 && xpParticles.map((p, i) => (
              <div key={i} style={{
                position: "absolute", top: "50%", left: "50%",
                transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`,
                width: 6, height: 6, borderRadius: "50%", background: p.c,
                boxShadow: `0 0 6px ${p.c}`, opacity: 1 - xpBurst * 0.8,
                pointerEvents: "none",
              }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: easeOut(cl((sp - 0.88) / 0.1)) }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.primary}40` }}>Train. Complete. Glow up.</div>
      </div>
    </div>
  );
}

// ─── SCENE 8: LEADERBOARD ─────────────────────────────────────────────────────

function Scene8({ sp }: { sp: number }) {
  const listOp = easeOut(cl(sp / 0.3));
  const riseProgress = easeOut(cl((sp - 0.3) / 0.5));
  const crownOp = easeOut(cl((sp - 0.75) / 0.2));
  const goldenGlow = cl((sp - 0.75) / 0.2);
  const headlineOp = slideIn(sp, 0.7, 0.25);

  const board = [
    { name: "Rafael M.", score: 3210, pos: 1, color: C.gold },
    { name: "Maya S.", score: 2940, pos: 2, color: "#C0C0C0" },
    { name: "Thelaw", score: 2847, pos: 3, color: C.primary, isMe: true },
    { name: "Lucas V.", score: 2630, pos: 4, color: C.orange },
    { name: "Sam P.", score: 2410, pos: 5, color: C.cyan },
  ];

  // Thelaw rises to #1 during animation
  const theLawCurrentPos = lerp(3, 1, riseProgress);
  const theLawScore = Math.round(lerp(2847, 3301, easeOut(cl((sp - 0.35) / 0.45))));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", background: C.bg }}>
      {/* Golden glow bg */}
      {goldenGlow > 0 && (
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 40%, ${C.gold}${Math.round(goldenGlow * 20).toString(16).padStart(2,"0")}, transparent 70%)`, pointerEvents: "none" }} />
      )}

      <div style={{ width: "100%", maxWidth: 340, opacity: listOp }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif" }}>ACADEMY LEADERBOARD</div>
          <GlowBadge label="THIS MONTH" color={C.primary} />
        </div>

        {/* Top 3 podium-style */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-end", justifyContent: "center" }}>
          {[{ p: 2, name: "Maya S.", score: 2940, color: "#C0C0C0", h: 70 }, { p: 1, name: riseProgress > 0.8 ? "Thelaw" : "Rafael M.", score: riseProgress > 0.8 ? theLawScore : 3210, color: riseProgress > 0.8 ? C.primary : C.gold, h: 90 }, { p: 3, name: riseProgress > 0.8 ? "Rafael M." : "Thelaw", score: riseProgress > 0.8 ? 3210 : theLawScore, color: riseProgress > 0.8 ? C.gold : C.primary, h: 60 }].map((item, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              {item.p === 1 && crownOp > 0.1 && (
                <div style={{ fontSize: 20, marginBottom: 4, opacity: crownOp, transform: `scale(${0.5 + crownOp * 0.5})` }}>👑</div>
              )}
              <div style={{
                width: "100%", background: item.p === 1 ? `${item.color}20` : C.elevated,
                borderRadius: "10px 10px 0 0", height: item.h,
                border: `1px solid ${item.color}${item.p === 1 ? "60" : "30"}`,
                display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8,
                boxShadow: item.p === 1 ? `0 0 ${10 + goldenGlow * 20}px ${item.color}40` : "none",
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: item.color, fontFamily: "'Oxanium', sans-serif" }}>#{item.p}</span>
              </div>
              <div style={{ textAlign: "center", marginTop: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: item.p === 1 ? item.color : C.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>{item.name}</div>
                <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{item.score.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Lower entries */}
        {[4, 5].map((pos) => {
          const p = board[pos - 1];
          return (
            <div key={pos} style={{
              background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 6,
              display: "flex", alignItems: "center", gap: 10,
              border: `1px solid ${C.surface}`,
              opacity: easeOut(cl((sp - (pos - 3) * 0.05) / 0.25)),
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, width: 16, fontFamily: "'Oxanium', sans-serif" }}>#{pos}</span>
              <PhotoAvatar photo={PHOTOS[p.name.split(" ")[0].toLowerCase()]} initials={p.name[0]} color={p.color} size={28} />
              <span style={{ flex: 1, fontSize: 12, color: C.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>{p.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: p.color, fontFamily: "'Oxanium', sans-serif" }}>{p.score.toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, opacity: headlineOp, fontSize: 20, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center", textShadow: `0 0 20px ${C.gold}50` }}>
        Rise to the top.
      </div>
    </div>
  );
}

// ─── SCENE 9: OUTRO ───────────────────────────────────────────────────────────

function Scene9({ sp }: { sp: number }) {
  const bgOp = easeOut(cl(sp / 0.2));
  const logoOp = easeOut(cl((sp - 0.05) / 0.3));
  const logoScale = 0.7 + easeOut(cl((sp - 0.05) / 0.3)) * 0.3;
  const taglineOp = slideIn(sp, 0.3, 0.25);
  const badgesOp = easeOut(cl((sp - 0.5) / 0.25));
  const badgesY = lerp(30, 0, easeOut(cl((sp - 0.5) / 0.25)));
  const ballX = lerp(-10, 115, easeInOut(cl((sp - 0.15) / 0.6)));
  const ballY = 45 + Math.sin(cl((sp - 0.15) / 0.6) * Math.PI) * -15;
  const ballVisible = sp > 0.15 && sp < 0.82;
  const pulse = 0.5 + 0.5 * Math.sin(sp * 8);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, overflow: "hidden" }}>
      {/* Court grid bg */}
      <div style={{ position: "absolute", inset: 0, opacity: bgOp * 0.15 }}>
        <svg width="100%" height="100%" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice">
          <rect x={60} y={100} width={270} height={500} fill="none" stroke={C.primary} strokeWidth={1.5} />
          <line x1={60} y1={350} x2={330} y2={350} stroke={C.primary} strokeWidth={1.5} />
          <line x1={195} y1={100} x2={195} y2={600} stroke={C.primary} strokeWidth={0.8} />
          <ellipse cx={195} cy={350} rx={28} ry={28} fill="none" stroke={C.primary} strokeWidth={1} />
        </svg>
      </div>

      {/* Glow radial */}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 45%, ${C.primary}${Math.round(pulse * 15).toString(16).padStart(2,"0")}, transparent 65%)`, pointerEvents: "none" }} />

      {/* Logo */}
      <div style={{ opacity: logoOp, transform: `scale(${logoScale})`, textAlign: "center", zIndex: 10 }}>
        <img
          src={LOGO_URL}
          alt="Glow Up Sports"
          style={{ width: 150, height: "auto", filter: `drop-shadow(0 0 ${18 + pulse * 20}px ${C.primary}90)`, display: "block", margin: "0 auto" }}
        />
      </div>

      {/* Tagline */}
      <div style={{ opacity: taglineOp, marginTop: 16, textAlign: "center", zIndex: 10 }}>
        <div style={{ fontSize: 16, letterSpacing: 5, color: C.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>TRAIN · MATCH · GLOW</div>
      </div>

      {/* App Store badges */}
      <div style={{ opacity: badgesOp, transform: `translateY(${badgesY}px)`, marginTop: 28, display: "flex", gap: 12, zIndex: 10 }}>
        {[{ label: "App Store", sub: "iOS" }, { label: "Play Store", sub: "Android" }].map((b) => (
          <div key={b.label} style={{
            padding: "9px 18px", borderRadius: 12,
            background: C.card, border: `1px solid ${C.primary}40`,
            textAlign: "center",
            boxShadow: `0 0 12px ${C.primary}15`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.white, fontFamily: "'Space Grotesk', sans-serif" }}>{b.label}</div>
            <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{b.sub}</div>
          </div>
        ))}
      </div>

      {/* Neon ball arc */}
      {ballVisible && (
        <div style={{ position: "absolute", left: `${ballX}%`, top: `${ballY}%`, transform: "translate(-50%, -50%)", zIndex: 20, pointerEvents: "none" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: C.primary, boxShadow: `0 0 20px ${C.primary}, 0 0 40px ${C.cyan}60` }} />
          <div style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", width: 70, height: 3, background: `linear-gradient(to left, ${C.primary}90, transparent)`, filter: "blur(1.5px)" }} />
        </div>
      )}
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

const SCENE_LABELS = ["Intro", "Profile", "Booking", "AI Coach", "Match", "Community", "Quests", "Rankings", "Outro"];

function ProgressBar({ elapsed }: { elapsed: number }) {
  const pct = cl(elapsed / TOTAL);
  let accum = 0;
  const markers = SCENE_DURATIONS.map((d) => { accum += d; return cl(accum / TOTAL) * 100; });

  return (
    <div style={{ padding: "0 16px 10px" }}>
      <div style={{ height: 3, background: C.surface, borderRadius: 2, position: "relative", overflow: "visible" }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`, boxShadow: `0 0 6px ${C.primary}`, borderRadius: 2 }} />
        {markers.slice(0, -1).map((m, i) => (
          <div key={i} style={{ position: "absolute", left: `${m}%`, top: -2, width: 1, height: 7, background: C.surface }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{(elapsed / 1000).toFixed(1)}s</span>
        <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>60s</span>
      </div>
    </div>
  );
}

function SceneLabel({ scene, sp }: { scene: number; sp: number }) {
  const opacity = Math.min(sp * 8, 1) * (sp > 0.88 ? Math.max(0, 1 - (sp - 0.88) * 8) : 1);
  return (
    <div style={{ position: "absolute", top: 52, left: 16, right: 16, opacity, pointerEvents: "none", zIndex: 40 }}>
      <div style={{
        display: "inline-block",
        background: "rgba(11,13,16,0.85)", backdropFilter: "blur(8px)",
        border: `1px solid ${C.surface}`,
        padding: "3px 10px", borderRadius: 20,
        fontSize: 8, letterSpacing: 1.5, color: C.textMuted,
        fontFamily: "'Space Grotesk', sans-serif"
      }}>
        {`S${scene + 1} — ${SCENE_LABELS[scene]}`.toUpperCase()}
      </div>
    </div>
  );
}

// ─── TRANSITION OVERLAY ────────────────────────────────────────────────────────

function Transition({ sp }: { sp: number }) {
  const opacity = sp < 0.07 ? 1 - easeOut(sp / 0.07) : 0;
  if (opacity <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, background: C.bg, opacity, pointerEvents: "none", zIndex: 50 }} />;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function GlowUpPromoVideoV2() {
  const timer = useTimer();
  const isDone = timer.elapsed >= TOTAL;
  const bgPulse = 0.5 + 0.5 * Math.sin(timer.elapsed * 0.001);

  const scenes = [
    <Scene1 sp={timer.sp} />,
    <Scene2 sp={timer.sp} />,
    <Scene3 sp={timer.sp} />,
    <Scene4 sp={timer.sp} />,
    <Scene5 sp={timer.sp} />,
    <Scene6 sp={timer.sp} />,
    <Scene7 sp={timer.sp} />,
    <Scene8 sp={timer.sp} />,
    <Scene9 sp={timer.sp} />,
  ];

  return (
    <div style={{
      width: "100%", height: "100vh",
      background: "#06080B",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Space Grotesk', 'Oxanium', sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 390,
        height: "100%", maxHeight: 844,
        background: C.bg, borderRadius: 40,
        border: `1px solid ${C.surface}`,
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 60px ${C.primary}${Math.round(bgPulse * 25).toString(16).padStart(2,"0")}, 0 40px 80px #00000090`,
        position: "relative",
      }}>
        {/* Top status bar */}
        <div style={{
          height: 40, flexShrink: 0, background: C.card,
          borderBottom: `1px solid ${C.surface}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.primary, boxShadow: `0 0 8px ${C.primary}` }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: 2.5, fontFamily: "'Oxanium', sans-serif" }}>
              GLOW UP SPORTS
            </span>
            <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>· Player App v2</span>
          </div>
        </div>

        {/* Main scene area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {/* Ambient top glow */}
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% -10%, ${C.primary}06, transparent 55%)`, pointerEvents: "none", zIndex: 1 }} />

          {timer.started && !isDone ? (
            <>
              <div style={{ position: "absolute", inset: 0 }}>{scenes[timer.scene]}</div>
              <Transition sp={timer.sp} />
              <SceneLabel scene={timer.scene} sp={timer.sp} />
            </>
          ) : isDone ? (
            /* End screen */
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(11,13,16,0.95)" }}>
              <img src={LOGO_URL} alt="Glow Up Sports" style={{ width: 120, filter: `drop-shadow(0 0 20px ${C.primary}80)` }} />
              <div style={{ fontSize: 22, fontWeight: 900, color: C.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center" }}>TRAIN. MATCH. GLOW.</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>Glow Up Sports — Player App</div>
              <button
                onClick={timer.reset}
                style={{
                  background: "transparent", color: C.primary,
                  border: `1.5px solid ${C.primary}`, borderRadius: 24, padding: "10px 28px",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: `0 0 14px ${C.primary}30`,
                }}
              >
                ↺ REPLAY
              </button>
            </div>
          ) : (
            /* Start screen */
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <div style={{ textAlign: "center" }}>
                <img src={LOGO_URL} alt="Glow Up Sports" style={{ width: 140, filter: `drop-shadow(0 0 24px ${C.primary}80)`, marginBottom: 16 }} />
                <div style={{ fontSize: 11, letterSpacing: 2, color: C.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>PLAYER APP · 60-SECOND SHOWCASE</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 260 }}>
                {["Thelaw's Profile", "AI Coach", "Match Finder", "Quests + Check-in", "Leaderboard"].map((f, i) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7 + i * 0.06 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: C.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={timer.play}
                style={{
                  background: C.primary, color: C.bg,
                  border: "none", borderRadius: 28, padding: "13px 40px",
                  fontSize: 14, fontWeight: 900, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: `0 0 24px ${C.primary}60`,
                  letterSpacing: 1,
                }}
              >
                ▶ PLAY PROMO
              </button>
            </div>
          )}
        </div>

        {/* Progress bar (shown while playing) */}
        {timer.started && !isDone && (
          <div style={{ background: C.card, borderTop: `1px solid ${C.surface}`, flexShrink: 0, paddingTop: 6 }}>
            <ProgressBar elapsed={timer.elapsed} />
          </div>
        )}
      </div>
    </div>
  );
}
