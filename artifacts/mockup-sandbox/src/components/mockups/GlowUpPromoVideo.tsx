import { useEffect, useRef, useState } from "react";

const COLORS = {
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
};

const SCENE_DURATIONS = [2000, 4000, 4000, 4000, 4000, 4000, 3000];
const TOTAL_DURATION = SCENE_DURATIONS.reduce((a, b) => a + b, 0);

function useSceneTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const play = () => {
    startTimeRef.current = performance.now() - elapsed;
    setPlaying(true);
    setStarted(true);
  };

  const reset = () => {
    setElapsed(0);
    setPlaying(false);
    setStarted(false);
  };

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const e = now - startTimeRef.current;
      if (e >= TOTAL_DURATION) {
        setElapsed(TOTAL_DURATION);
        setPlaying(false);
      } else {
        setElapsed(e);
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  let scene = 0;
  let sceneElapsed = elapsed;
  for (let i = 0; i < SCENE_DURATIONS.length; i++) {
    if (sceneElapsed < SCENE_DURATIONS[i]) { scene = i; break; }
    sceneElapsed -= SCENE_DURATIONS[i];
    if (i === SCENE_DURATIONS.length - 1) { scene = i; sceneElapsed = SCENE_DURATIONS[i]; }
  }
  const sceneProgress = SCENE_DURATIONS[scene] > 0 ? Math.min(sceneElapsed / SCENE_DURATIONS[scene], 1) : 1;

  return { elapsed, scene, sceneElapsed, sceneProgress, playing, started, play, reset, totalDuration: TOTAL_DURATION };
}

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeIn(t: number) { return t * t * t; }

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function clamp(v: number, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }

function slideIn(progress: number, delay = 0, duration = 0.5) {
  const t = clamp((progress - delay) / duration);
  return easeOut(t);
}

function CourtLines({ progress }: { progress: number }) {
  const width = slideIn(progress, 0, 0.6) * 100;
  return (
    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)" }}>
      <div style={{
        width: `${width}%`,
        height: 2,
        background: `linear-gradient(to right, transparent, ${COLORS.primary}, ${COLORS.cyan}, transparent)`,
        boxShadow: `0 0 12px ${COLORS.primary}, 0 0 24px ${COLORS.primary}60`,
        transition: "none"
      }} />
    </div>
  );
}

function Scene1Intro({ progress }: { progress: number }) {
  const logoScale = 0.6 + slideIn(progress, 0.2, 0.5) * 0.4;
  const logoOpacity = slideIn(progress, 0.2, 0.5);
  const taglineOpacity = slideIn(progress, 0.5, 0.4);
  const ballX = lerp(-20, 110, easeIn(clamp((progress - 0.6) / 0.35)));
  const trailOpacity = clamp((progress - 0.6) / 0.2);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url(/promo/court_aerial.png)",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: easeOut(clamp(progress / 0.6)) * 0.35,
      }} />
      <CourtLines progress={progress} />

      <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})`, textAlign: "center", zIndex: 10 }}>
        <div style={{
          fontSize: 36, fontWeight: 900, letterSpacing: 3,
          color: COLORS.white,
          textShadow: `0 0 30px ${COLORS.primary}80`,
          fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
          lineHeight: 1.1
        }}>
          GLOW UP
        </div>
        <div style={{
          fontSize: 22, fontWeight: 700, letterSpacing: 8,
          color: COLORS.primary,
          textShadow: `0 0 20px ${COLORS.primary}`,
          fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
        }}>
          SPORTS
        </div>
      </div>

      <div style={{ opacity: taglineOpacity, marginTop: 16, zIndex: 10, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
          PLAYER APP
        </div>
      </div>

      {trailOpacity > 0 && (
        <div style={{
          position: "absolute",
          top: "44%",
          left: `${ballX}%`,
          transform: "translate(-50%, -50%)",
          opacity: trailOpacity,
          zIndex: 20,
        }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              background: COLORS.primary,
              boxShadow: `0 0 20px ${COLORS.primary}, 0 0 40px ${COLORS.cyan}`,
            }} />
            <div style={{
              position: "absolute", right: "100%", top: "50%",
              transform: "translateY(-50%)",
              width: 60, height: 3,
              background: `linear-gradient(to left, ${COLORS.cyan}80, transparent)`,
              filter: "blur(1px)"
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function XPBar({ progress, color = COLORS.primary }: { progress: number; color?: string }) {
  return (
    <div style={{ height: 6, background: COLORS.surface, borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        width: `${progress * 100}%`,
        height: "100%",
        background: `linear-gradient(to right, ${color}, ${color}cc)`,
        boxShadow: `0 0 8px ${color}`,
        borderRadius: 3,
        transition: "width 0.1s linear"
      }} />
    </div>
  );
}

function LevelBadge({ level, glow }: { level: number; glow: number }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: `radial-gradient(circle, ${COLORS.primary}40, ${COLORS.primary}10)`,
      border: `2px solid ${COLORS.primary}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 ${8 + glow * 16}px ${COLORS.primary}`,
      fontWeight: 900, fontSize: 13, color: COLORS.primary,
      fontFamily: "'Space Grotesk', sans-serif"
    }}>
      {level}
    </div>
  );
}

function Scene2PlayerCard({ progress }: { progress: number }) {
  const cardY = lerp(80, 0, easeOut(clamp(progress / 0.35)));
  const cardOpacity = easeOut(clamp(progress / 0.35));
  const xpFill = easeOut(clamp((progress - 0.3) / 0.5));
  const glowPulse = 0.5 + 0.5 * Math.sin(progress * 12);
  const glowScore = Math.round(lerp(0, 2847, easeOut(clamp((progress - 0.2) / 0.6))));
  const headlineOpacity = slideIn(progress, 0.5, 0.35);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{
        transform: `translateY(${cardY}px)`,
        opacity: cardOpacity,
        width: "100%",
        maxWidth: 340,
      }}>
        <div style={{
          background: COLORS.card,
          borderRadius: 20,
          border: `1px solid ${COLORS.primary}${Math.round(glowPulse * 80).toString(16).padStart(2, "0")}`,
          boxShadow: `0 0 ${20 + glowPulse * 20}px ${COLORS.primary}20, 0 8px 32px #00000060`,
          overflow: "hidden",
        }}>
          <div style={{
            height: 3,
            background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.primary}80, ${COLORS.primary})`,
            boxShadow: `0 0 8px ${COLORS.primary}`,
          }} />

          <div style={{ padding: "20px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{ position: "relative" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${COLORS.primary}60, ${COLORS.cyan}40)`,
                  border: `2px solid ${COLORS.primary}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 ${12 + glowPulse * 8}px ${COLORS.primary}60`,
                  fontSize: 22, color: COLORS.white, fontWeight: 800,
                  fontFamily: "'Space Grotesk', sans-serif"
                }}>
                  A
                </div>
                <div style={{ position: "absolute", bottom: -4, right: -4 }}>
                  <LevelBadge level={12} glow={glowPulse} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.primary, letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif" }}>PLAYER</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>Alex Chen</div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>Glow Academy</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, fontFamily: "'Space Grotesk', sans-serif" }}>GLOW SCORE</div>
                <div style={{
                  fontSize: 24, fontWeight: 900, color: COLORS.gold,
                  textShadow: `0 0 12px ${COLORS.gold}80`,
                  fontFamily: "'Oxanium', 'Space Grotesk', sans-serif"
                }}>
                  {glowScore.toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>XP PROGRESS</span>
                <span style={{ fontSize: 10, color: COLORS.primary, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {Math.round(xpFill * 340)}/500 XP
                </span>
              </div>
              <XPBar progress={xpFill} />
            </div>

            <div style={{ display: "flex", gap: 8, paddingBottom: 20, marginTop: 4 }}>
              {[
                { label: "STREAK", value: "7", icon: "🔥" },
                { label: "LEVEL", value: "12", icon: "⚡" },
                { label: "RANK", value: "#4", icon: "🏆" },
              ].map((stat) => (
                <div key={stat.label} style={{
                  flex: 1, background: COLORS.elevated, borderRadius: 10, padding: "10px 6px",
                  textAlign: "center", border: `1px solid ${COLORS.surface}`,
                }}>
                  <div style={{ fontSize: 14, marginBottom: 2 }}>{stat.icon}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</div>
                  <div style={{ fontSize: 8, color: COLORS.textMuted, letterSpacing: 1, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 24, opacity: headlineOpacity,
        fontSize: 22, fontWeight: 900, color: COLORS.white,
        fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
        textAlign: "center",
        textShadow: `0 0 20px ${COLORS.primary}40`
      }}>
        Know your game.
      </div>
    </div>
  );
}

function Scene3Booking({ progress }: { progress: number }) {
  const chipActive = progress > 0.1;
  const chipGlow = chipActive ? 0.5 + 0.5 * Math.sin(progress * 8) : 0;
  const cardY = lerp(-60, 0, easeOut(clamp((progress - 0.15) / 0.35)));
  const cardOpacity = easeOut(clamp((progress - 0.15) / 0.35));
  const slotsOpacity = easeOut(clamp((progress - 0.4) / 0.3));
  const selectedSlot = clamp((progress - 0.55) / 0.2) > 0.5 ? 2 : -1;
  const pulseSlot = Math.floor(2 + Math.sin(progress * 10) * 0.5);
  const checkOpacity = easeOut(clamp((progress - 0.72) / 0.2));
  const checkScale = 0.5 + easeOut(clamp((progress - 0.72) / 0.2)) * 0.5;
  const headlineOpacity = slideIn(progress, 0.5, 0.35);
  const burstSize = 1 + easeOut(clamp((progress - 0.72) / 0.15)) * 0.4;

  const slots = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, opacity: easeOut(clamp(progress / 0.2)) }}>
          {["Tennis", "Padel", "Pickleball"].map((sport, i) => (
            <div key={sport} style={{
              padding: "6px 14px", borderRadius: 20,
              background: i === 0 && chipActive ? `${COLORS.primary}22` : COLORS.elevated,
              border: `1px solid ${i === 0 && chipActive ? COLORS.primary : COLORS.surface}`,
              color: i === 0 && chipActive ? COLORS.primary : COLORS.textMuted,
              fontSize: 12, fontWeight: 700,
              boxShadow: i === 0 && chipActive ? `0 0 ${8 + chipGlow * 8}px ${COLORS.primary}40` : "none",
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              {sport}
            </div>
          ))}
        </div>

        <div style={{
          transform: `translateY(${cardY}px)`, opacity: cardOpacity,
          background: COLORS.card, borderRadius: 16,
          border: `1px solid ${COLORS.surface}`,
          padding: 16, marginBottom: 12,
          boxShadow: "0 8px 32px #00000040"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.primary}40, ${COLORS.cyan}30)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18
            }}>C</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>Coach Marco</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>4.9 ★ · 230 sessions</div>
            </div>
            <div style={{
              marginLeft: "auto", padding: "4px 10px", borderRadius: 12,
              background: `${COLORS.primary}20`, border: `1px solid ${COLORS.primary}40`,
              fontSize: 11, color: COLORS.primary, fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif"
            }}>Available</div>
          </div>

          <div style={{ opacity: slotsOpacity }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>SELECT TIME SLOT</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {slots.map((slot, i) => {
                const isSelected = i === 2 && selectedSlot === 2;
                const isPulsing = i === pulseSlot && selectedSlot < 0;
                return (
                  <div key={slot} style={{
                    padding: "8px 0", textAlign: "center", borderRadius: 10,
                    background: isSelected ? `${COLORS.primary}30` : COLORS.elevated,
                    border: `1.5px solid ${isSelected ? COLORS.primary : isPulsing ? `${COLORS.primary}60` : COLORS.surface}`,
                    color: isSelected ? COLORS.primary : COLORS.textSecondary,
                    fontSize: 12, fontWeight: 700,
                    boxShadow: isSelected ? `0 0 12px ${COLORS.primary}40` : "none",
                    transform: `scale(${isSelected ? 1.05 : 1})`,
                    transition: "all 0.15s ease",
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}>
                    {slot}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {checkOpacity > 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none"
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: `radial-gradient(circle, ${COLORS.primary}60, ${COLORS.primary}10)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: checkOpacity,
              transform: `scale(${burstSize})`,
              boxShadow: `0 0 ${40 * checkOpacity}px ${COLORS.primary}, 0 0 80px ${COLORS.primary}40`,
            }}>
              <div style={{ fontSize: 36, color: COLORS.bg }}>✓</div>
            </div>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 20, opacity: headlineOpacity,
        fontSize: 22, fontWeight: 900, color: COLORS.white,
        fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
        textAlign: "center",
        textShadow: `0 0 20px ${COLORS.primary}40`
      }}>
        Book in seconds.
      </div>
    </div>
  );
}

function Scene4MatchFinder({ progress }: { progress: number }) {
  const listOpacity = easeOut(clamp(progress / 0.3));
  const challengeTap = clamp((progress - 0.6) / 0.25) > 0.5;
  const challengeGlow = challengeTap ? 0.5 + 0.5 * Math.sin(progress * 15) : 0;
  const headlineOpacity = slideIn(progress, 0.5, 0.35);

  const levels = [
    { label: "Beginner", color: "#22C55E" },
    { label: "Intermediate", color: "#3B82F6" },
    { label: "Advanced", color: COLORS.orange },
    { label: "Elite", color: COLORS.gold },
  ];

  const players = [
    { name: "Maya S.", level: "Elite", score: 3210, color: COLORS.gold },
    { name: "Tom R.", level: "Advanced", score: 2840, color: COLORS.orange },
    { name: "Priya M.", level: "Intermediate", score: 1920, color: "#3B82F6" },
  ];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 340, opacity: listOpacity }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {levels.map(({ label, color }) => (
            <div key={label} style={{
              padding: "5px 12px", borderRadius: 16,
              background: `${color}18`, border: `1px solid ${color}50`,
              color: color, fontSize: 11, fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif"
            }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 5 }} />
              {label}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {players.map((player, i) => {
            const isChallengable = i === 0;
            const delay = i * 0.08;
            const entryOpacity = easeOut(clamp((progress - delay) / 0.3));
            const entryY = lerp(30, 0, easeOut(clamp((progress - delay) / 0.3)));
            return (
              <div key={player.name} style={{
                background: COLORS.card, borderRadius: 14,
                border: `1px solid ${isChallengable && challengeTap ? player.color : COLORS.surface}`,
                padding: "12px 14px",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: isChallengable && challengeTap ? `0 0 ${12 + challengeGlow * 8}px ${player.color}30` : "0 4px 12px #00000030",
                opacity: entryOpacity,
                transform: `translateY(${entryY}px)`,
                transition: "border 0.1s ease, box-shadow 0.1s ease"
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: `linear-gradient(135deg, ${player.color}40, ${player.color}20)`,
                  border: `2px solid ${player.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800, color: player.color,
                  fontFamily: "'Space Grotesk', sans-serif"
                }}>
                  {player.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>{player.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 9, color: player.color, fontWeight: 700,
                      background: `${player.color}18`, padding: "2px 7px", borderRadius: 6,
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}>{player.level}</span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{player.score.toLocaleString()} pts</span>
                  </div>
                </div>
                {isChallengable && (
                  <div style={{
                    padding: "8px 14px", borderRadius: 10,
                    background: challengeTap ? `${player.color}` : `${player.color}20`,
                    border: `1.5px solid ${player.color}`,
                    color: challengeTap ? COLORS.bg : player.color,
                    fontSize: 11, fontWeight: 800,
                    boxShadow: `0 0 ${6 + challengeGlow * 12}px ${player.color}60`,
                    fontFamily: "'Space Grotesk', sans-serif",
                    display: "flex", alignItems: "center", gap: 4
                  }}>
                    ⚔ Challenge
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        marginTop: 20, opacity: headlineOpacity,
        fontSize: 22, fontWeight: 900, color: COLORS.white,
        fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
        textAlign: "center",
        textShadow: `0 0 20px ${COLORS.cyan}40`
      }}>
        Challenge anyone.
      </div>
    </div>
  );
}

function RadarChart({ progress, size = 220 }: { progress: number; size?: number }) {
  const center = size / 2;
  const r = size * 0.32;
  const domains = [
    { name: "Technical", color: COLORS.primary },
    { name: "Mental", color: COLORS.purple },
    { name: "Physical", color: COLORS.orange },
    { name: "Tactical", color: COLORS.gold },
    { name: "Social", color: COLORS.cyan },
  ];
  const n = domains.length;

  const values = domains.map((_, i) => {
    const targetVal = [0.85, 0.70, 0.75, 0.80, 0.65][i];
    return targetVal * easeOut(clamp((progress - i * 0.08) / 0.5));
  });

  const getPoint = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: center + val * r * Math.cos(angle),
      y: center + val * r * Math.sin(angle),
    };
  };

  const outerPoints = domains.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  });

  const dataPoints = values.map((v, i) => getPoint(i, v));
  const polygonPoints = dataPoints.map(p => `${p.x},${p.y}`).join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level, li) => {
        const pts = domains.map((_, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          return { x: center + level * r * Math.cos(angle), y: center + level * r * Math.sin(angle) };
        });
        return (
          <polygon
            key={li}
            points={pts.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={level === 1 ? `${COLORS.primary}40` : `${COLORS.surface}`}
            strokeWidth={level === 1 ? 1.5 : 0.8}
            strokeDasharray={level < 1 ? "3,3" : undefined}
          />
        );
      })}

      {outerPoints.map((p, i) => (
        <line key={i} x1={center} y1={center} x2={p.x} y2={p.y}
          stroke={`${domains[i].color}30`} strokeWidth={1} />
      ))}

      <polygon
        points={polygonPoints}
        fill={`${COLORS.primary}20`}
        stroke={COLORS.primary}
        strokeWidth={2}
      />

      {dataPoints.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={6} fill={`${domains[i].color}30`} />
          <circle cx={p.x} cy={p.y} r={4} fill={domains[i].color}
            filter={`drop-shadow(0 0 4px ${domains[i].color})`} />
        </g>
      ))}

      {outerPoints.map((p, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = center + (r + 22) * Math.cos(angle);
        const ly = center + (r + 22) * Math.sin(angle);
        return (
          <text key={i} x={lx} y={ly + 4} textAnchor="middle"
            fill={domains[i].color} fontSize={9} fontWeight="bold"
            fontFamily="'Space Grotesk', sans-serif">
            {domains[i].name.slice(0, 3).toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

function Scene5Progress({ progress }: { progress: number }) {
  const radarOpacity = easeOut(clamp(progress / 0.3));
  const radarScale = 0.7 + easeOut(clamp(progress / 0.3)) * 0.3;
  const glowScore = Math.round(lerp(2600, 2847, easeOut(clamp((progress - 0.3) / 0.5))));
  const headlineOpacity = slideIn(progress, 0.5, 0.35);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url(/promo/radar_bg.png)",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: radarOpacity * 0.25,
      }} />
      <div style={{
        opacity: radarOpacity, transform: `scale(${radarScale})`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8
      }}>
        <RadarChart progress={progress} size={220} />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif" }}>GLOW SCORE</div>
          <div style={{
            fontSize: 36, fontWeight: 900, color: COLORS.gold,
            textShadow: `0 0 20px ${COLORS.gold}80`,
            fontFamily: "'Oxanium', 'Space Grotesk', sans-serif"
          }}>
            {glowScore.toLocaleString()}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 4 }}>
            {[COLORS.primary, COLORS.purple, COLORS.orange, COLORS.gold, COLORS.cyan].map((color, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: "50%", background: color,
                boxShadow: `0 0 6px ${color}`, opacity: easeOut(clamp((progress - i * 0.08) / 0.3))
              }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 16, opacity: headlineOpacity,
        fontSize: 22, fontWeight: 900, color: COLORS.white,
        fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
        textAlign: "center",
        textShadow: `0 0 20px ${COLORS.purple}40`
      }}>
        Watch yourself grow.
      </div>
    </div>
  );
}

function Scene6QuestsAI({ progress }: { progress: number }) {
  const leftOpacity = easeOut(clamp(progress / 0.35));
  const rightOpacity = easeOut(clamp((progress - 0.15) / 0.35));
  const questComplete = progress > 0.6;
  const xpPop = easeOut(clamp((progress - 0.62) / 0.2));
  const headlineOpacity = slideIn(progress, 0.55, 0.35);
  const bgOpacity = easeOut(clamp(progress / 0.4)) * 0.2;

  const quests = [
    { name: "Complete a lesson", cat: "training", color: "#00FF88", icon: "🎾", done: questComplete },
    { name: "Win a match", cat: "performance", color: COLORS.error, icon: "🏆", done: false },
    { name: "7-day streak", cat: "consistency", color: COLORS.gold, icon: "📅", done: false },
  ];

  const aiBubbleProgress = easeOut(clamp((progress - 0.3) / 0.4));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url(/promo/ai_bg.png)",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: bgOpacity,
      }} />
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 340, alignItems: "flex-start", position: "relative", zIndex: 1 }}>
        <div style={{ flex: 1, opacity: leftOpacity }}>
          <div style={{ fontSize: 8, color: COLORS.textMuted, letterSpacing: 2, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>DAILY QUESTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {quests.map((q, i) => (
              <div key={i} style={{
                background: COLORS.card, borderRadius: 11,
                border: `1px solid ${q.done ? q.color : COLORS.surface}`,
                padding: "9px 10px",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: q.done ? `0 0 10px ${q.color}30` : "none",
                transition: "all 0.15s ease",
                opacity: easeOut(clamp((progress - i * 0.06) / 0.25))
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, fontSize: 14,
                  background: `${q.color}18`, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${q.color}40`
                }}>{q.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>{q.name}</div>
                  <div style={{
                    height: 3, background: COLORS.surface, borderRadius: 2, marginTop: 4, overflow: "hidden"
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 2, background: q.color,
                      width: q.done ? "100%" : "40%",
                      boxShadow: q.done ? `0 0 6px ${q.color}` : "none",
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                </div>
                {q.done && (
                  <div style={{ color: q.color, fontSize: 14, fontWeight: 900 }}>✓</div>
                )}
              </div>
            ))}
          </div>

          {xpPop > 0 && (
            <div style={{
              marginTop: 6, textAlign: "center",
              fontSize: 14, fontWeight: 900, color: COLORS.primary,
              opacity: xpPop, transform: `translateY(${lerp(10, 0, xpPop)}px)`,
              textShadow: `0 0 10px ${COLORS.primary}`,
              fontFamily: "'Oxanium', 'Space Grotesk', sans-serif"
            }}>
              +50 XP
            </div>
          )}
        </div>

        <div style={{ flex: 1, opacity: rightOpacity }}>
          <div style={{ fontSize: 8, color: "#818CF8", letterSpacing: 2, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>AI COACH</div>
          <div style={{
            background: COLORS.card, borderRadius: 12,
            border: "1px solid rgba(99,102,241,0.35)",
            padding: 12,
            boxShadow: "0 0 20px rgba(99,102,241,0.15)",
            overflow: "hidden", position: "relative"
          }}>
            <div style={{
              position: "absolute", inset: 0, opacity: 0.05,
              backgroundImage: `radial-gradient(${COLORS.cyan}60 1px, transparent 1px)`,
              backgroundSize: "8px 8px"
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7,
                background: "linear-gradient(135deg, #6366F1, #3B82F6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11
              }}>✨</div>
              <span style={{ fontSize: 9, fontWeight: 800, color: "#818CF8", letterSpacing: 1.5, fontFamily: "'Space Grotesk', sans-serif" }}>GLOW AI</span>
            </div>
            <div style={{
              fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5,
              fontFamily: "'Space Grotesk', sans-serif",
              clipPath: `inset(0 ${lerp(100, 0, aiBubbleProgress)}% 0 0)`
            }}>
              "Focus on your second serve consistency — your 65% rate can improve to 80% with targeted drills."
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{
                padding: "7px 10px", borderRadius: 8,
                background: "linear-gradient(to right, #6366F1, #3B82F6, #00D4FF)",
                fontSize: 10, fontWeight: 800, color: COLORS.white, textAlign: "center",
                fontFamily: "'Space Grotesk', sans-serif"
              }}>
                Ask your coach
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 16, opacity: headlineOpacity,
        fontSize: 18, fontWeight: 900, color: COLORS.white,
        fontFamily: "'Oxanium', 'Space Grotesk', sans-serif",
        textAlign: "center",
        textShadow: `0 0 20px #818CF840`,
        position: "relative", zIndex: 1
      }}>
        Your personal coach. Every day.
      </div>
    </div>
  );
}

function Scene7Outro({ progress }: { progress: number }) {
  const courtOpacity = easeOut(clamp(progress / 0.25));
  const ballTrailProgress = clamp((progress - 0.1) / 0.45);
  const ballX = lerp(-10, 110, easeInOut(ballTrailProgress));
  const ballY = 50 + Math.sin(ballTrailProgress * Math.PI) * -20;
  const logoOpacity = easeOut(clamp((progress - 0.4) / 0.35));
  const taglineOpacity = easeOut(clamp((progress - 0.55) / 0.3));
  const fadeOut = progress > 0.82 ? easeIn(clamp((progress - 0.82) / 0.18)) : 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url(/promo/court_aerial.png)",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: courtOpacity * 0.45,
      }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        backgroundImage: "url(/promo/ball_trail.png)",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: clamp((progress - 0.1) / 0.4) * 0.3,
      }} />
      <div style={{ position: "absolute", inset: 0, opacity: courtOpacity * 0.35, zIndex: 1 }}>
        <svg width="100%" height="100%" viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice">
          {[...Array(12)].map((_, i) => (
            <line key={i} x1={0} y1={i * 60} x2={400} y2={i * 60}
              stroke={`${COLORS.primary}20`} strokeWidth={0.5} />
          ))}
          {[...Array(8)].map((_, i) => (
            <line key={i} x1={i * 60} y1={0} x2={i * 60} y2={700}
              stroke={`${COLORS.primary}20`} strokeWidth={0.5} />
          ))}
          <rect x={60} y={120} width={280} height={460}
            fill="none" stroke={`${COLORS.primary}60`} strokeWidth={2} />
          <line x1={60} y1={350} x2={340} y2={350}
            stroke={`${COLORS.primary}60`} strokeWidth={2} />
          <line x1={200} y1={120} x2={200} y2={580}
            stroke={`${COLORS.primary}30`} strokeWidth={1} />
          <ellipse cx={200} cy={350} rx={30} ry={30}
            fill="none" stroke={`${COLORS.primary}40`} strokeWidth={1.5} />
        </svg>
      </div>

      {ballTrailProgress > 0 && ballTrailProgress < 1.05 && (
        <div style={{
          position: "absolute",
          left: `${ballX}%`,
          top: `${ballY}%`,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none"
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            background: COLORS.primary,
            boxShadow: `0 0 20px ${COLORS.primary}, 0 0 40px ${COLORS.primary}60`,
          }} />
          <div style={{
            position: "absolute", right: "90%", top: "50%",
            transform: "translateY(-50%)",
            width: 80, height: 4, borderRadius: 2,
            background: `linear-gradient(to left, ${COLORS.primary}90, transparent)`,
            filter: "blur(2px)"
          }} />
        </div>
      )}

      <div style={{ textAlign: "center", zIndex: 10, position: "relative" }}>
        <div style={{
          opacity: logoOpacity, transform: `scale(${0.8 + logoOpacity * 0.2})`,
          marginBottom: 12
        }}>
          <div style={{
            fontSize: 40, fontWeight: 900, letterSpacing: 3, color: COLORS.white,
            textShadow: `0 0 30px ${COLORS.primary}80`,
            fontFamily: "'Oxanium', 'Space Grotesk', sans-serif"
          }}>GLOW UP</div>
          <div style={{
            fontSize: 24, fontWeight: 700, letterSpacing: 8, color: COLORS.primary,
            textShadow: `0 0 20px ${COLORS.primary}`,
            fontFamily: "'Oxanium', 'Space Grotesk', sans-serif"
          }}>SPORTS</div>
        </div>

        <div style={{ opacity: taglineOpacity }}>
          <div style={{
            fontSize: 14, letterSpacing: 5, color: COLORS.textSecondary,
            fontFamily: "'Space Grotesk', sans-serif"
          }}>
            TRAIN · MATCH · GLOW
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", inset: 0, background: COLORS.bg,
        opacity: fadeOut, pointerEvents: "none"
      }} />
    </div>
  );
}

function TransitionOverlay({ scene, sceneProgress }: { scene: number; sceneProgress: number }) {
  const transitionTypes: Record<number, string> = {
    1: "wipe",
    2: "slide",
    3: "swipe",
    4: "morph",
    5: "split",
    6: "fade",
  };

  const type = transitionTypes[scene] || "fade";
  const isEarlyScene = sceneProgress < 0.08;
  const opacity = isEarlyScene ? easeOut(clamp(sceneProgress / 0.08)) : 1;

  if (opacity >= 1) return null;

  let style: React.CSSProperties = {
    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50,
  };

  if (type === "wipe") {
    style = { ...style, background: `linear-gradient(to right, ${COLORS.bg} ${(1 - opacity) * 100}%, transparent)` };
  } else if (type === "slide" || type === "swipe") {
    style = { ...style, background: `${COLORS.bg}`, opacity: 1 - opacity, transform: `translateX(${(1 - opacity) * 100}%)` };
  } else {
    style = { ...style, background: COLORS.bg, opacity: 1 - opacity };
  }

  return <div style={style} />;
}

function ProgressBar({ elapsed, total }: { elapsed: number; total: number }) {
  const progress = elapsed / total;
  let accum = 0;
  const markers = SCENE_DURATIONS.map((d, i) => {
    accum += d;
    return { pct: accum / total * 100, label: `S${i + 1}` };
  });

  return (
    <div style={{ padding: "0 16px 12px", position: "relative" }}>
      <div style={{ height: 3, background: COLORS.surface, borderRadius: 2, overflow: "visible", position: "relative" }}>
        <div style={{
          width: `${progress * 100}%`, height: "100%",
          background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.cyan})`,
          boxShadow: `0 0 6px ${COLORS.primary}`,
          borderRadius: 2,
          transition: "width 0.05s linear"
        }} />
        {markers.slice(0, -1).map((m, i) => (
          <div key={i} style={{
            position: "absolute", left: `${m.pct}%`, top: -3,
            width: 1, height: 9, background: COLORS.surface
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
          {(elapsed / 1000).toFixed(1)}s
        </span>
        <span style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
          {(total / 1000).toFixed(0)}s
        </span>
      </div>
    </div>
  );
}

function SceneLabel({ scene, sceneProgress }: { scene: number; sceneProgress: number }) {
  const labels = [
    "Scene 1 — Intro",
    "Scene 2 — Player Card",
    "Scene 3 — Book a Lesson",
    "Scene 4 — Find Your Match",
    "Scene 5 — Glow Score",
    "Scene 6 — Quests + AI Coach",
    "Scene 7 — Outro",
  ];
  const opacity = Math.min(sceneProgress * 8, 1) * (sceneProgress > 0.85 ? Math.max(0, 1 - (sceneProgress - 0.85) * 6) : 1);
  return (
    <div style={{
      position: "absolute", top: 56, left: 16, right: 16,
      opacity, transition: "opacity 0.1s ease", zIndex: 40, pointerEvents: "none"
    }}>
      <div style={{
        display: "inline-block",
        background: "rgba(11,13,16,0.8)", backdropFilter: "blur(8px)",
        border: `1px solid ${COLORS.surface}`,
        padding: "4px 10px", borderRadius: 20,
        fontSize: 9, letterSpacing: 1.5, color: COLORS.textMuted,
        fontFamily: "'Space Grotesk', sans-serif"
      }}>
        {labels[scene]?.toUpperCase()}
      </div>
    </div>
  );
}

function VideoClipPlayer() {
  const clips = [
    { file: "/promo/clip1_intro.mp4", label: "Scene 1–2", desc: "Intro + Player Card", duration: "8s", color: COLORS.primary },
    { file: "/promo/clip2_player.mp4", label: "Scene 2", desc: "Player Card", duration: "8s", color: COLORS.gold },
    { file: "/promo/clip3_booking.mp4", label: "Scene 3–4", desc: "Booking + Match Finder", duration: "8s", color: COLORS.cyan },
    { file: "/promo/clip4_skills.mp4", label: "Scene 5–6", desc: "Glow Score + Quests/AI", duration: "8s", color: COLORS.purple },
    { file: "/promo/clip5_outro.mp4", label: "Scene 7", desc: "Outro", duration: "6s", color: COLORS.orange },
  ];

  return (
    <div style={{
      width: "100%", height: "100%", overflowY: "auto",
      padding: "16px", boxSizing: "border-box",
      display: "flex", flexDirection: "column", gap: 12
    }}>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
          FULL PROMO · ~25 SECONDS · 9:16
        </div>
      </div>

      <div style={{
        background: COLORS.card, borderRadius: 16,
        border: `1px solid ${COLORS.primary}40`,
        overflow: "hidden",
        boxShadow: `0 0 20px ${COLORS.primary}15`
      }}>
        <video
          src="/promo/glow_up_sports_promo_25s.mp4"
          controls
          style={{ width: "100%", display: "block", borderRadius: "16px 16px 0 0" }}
          playsInline
        />
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>
              Glow Up Sports — Full Promo
            </div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
              7 scenes · ~25s · 1080p
            </div>
          </div>
          <a
            href="/promo/glow_up_sports_promo_25s.mp4"
            download="glow_up_sports_promo.mp4"
            style={{
              padding: "6px 12px", borderRadius: 10,
              background: `${COLORS.primary}22`, border: `1px solid ${COLORS.primary}60`,
              color: COLORS.primary, fontSize: 10, fontWeight: 700,
              textDecoration: "none", fontFamily: "'Space Grotesk', sans-serif"
            }}
          >
            Download
          </a>
        </div>
      </div>

      <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif", marginTop: 4 }}>
        INDIVIDUAL SCENE CLIPS
      </div>

      {clips.map((clip, i) => (
        <div key={i} style={{
          background: COLORS.card, borderRadius: 12,
          border: `1px solid ${clip.color}25`,
          overflow: "hidden"
        }}>
          <video
            src={clip.file}
            controls
            style={{ width: "100%", display: "block" }}
            playsInline
          />
          <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: clip.color, boxShadow: `0 0 6px ${clip.color}`
              }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.white, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {clip.desc}
                </div>
                <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {clip.duration}
                </div>
              </div>
            </div>
            <a
              href={clip.file}
              download
              style={{
                padding: "4px 10px", borderRadius: 8,
                background: `${clip.color}18`, border: `1px solid ${clip.color}40`,
                color: clip.color, fontSize: 9, fontWeight: 700,
                textDecoration: "none", fontFamily: "'Space Grotesk', sans-serif"
              }}
            >
              DL
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GlowUpPromoVideo() {
  const timer = useSceneTimer();
  const isDone = timer.elapsed >= TOTAL_DURATION;
  const bgGlow = 0.5 + 0.5 * Math.sin(timer.elapsed * 0.001);
  const [activeTab, setActiveTab] = useState<"animation" | "video">("animation");

  const sceneComponents = [
    <Scene1Intro progress={timer.sceneProgress} />,
    <Scene2PlayerCard progress={timer.sceneProgress} />,
    <Scene3Booking progress={timer.sceneProgress} />,
    <Scene4MatchFinder progress={timer.sceneProgress} />,
    <Scene5Progress progress={timer.sceneProgress} />,
    <Scene6QuestsAI progress={timer.sceneProgress} />,
    <Scene7Outro progress={timer.sceneProgress} />,
  ];

  return (
    <div style={{
      width: "100%", height: "100vh",
      background: COLORS.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Space Grotesk', 'Oxanium', sans-serif",
      overflow: "hidden"
    }}>
      <div style={{
        width: "100%", maxWidth: 390,
        height: "100%", maxHeight: 844,
        background: COLORS.bg,
        borderRadius: 40,
        border: `1px solid ${COLORS.surface}`,
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 60px ${COLORS.primary}${Math.round(bgGlow * 30).toString(16).padStart(2,"0")}, 0 40px 80px #00000080`,
        position: "relative"
      }}>
        <div style={{
          background: COLORS.card, flexShrink: 0,
          borderBottom: `1px solid ${COLORS.surface}`
        }}>
          <div style={{
            height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: COLORS.primary, boxShadow: `0 0 8px ${COLORS.primary}`
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.primary, letterSpacing: 2, fontFamily: "'Oxanium', sans-serif" }}>
                GLOW UP SPORTS
              </span>
            </div>
          </div>

          <div style={{ display: "flex", padding: "0 16px 10px", gap: 8 }}>
            {(["animation", "video"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: "7px 0",
                  borderRadius: 10,
                  background: activeTab === tab ? `${COLORS.primary}18` : "transparent",
                  border: `1px solid ${activeTab === tab ? COLORS.primary : COLORS.surface}`,
                  color: activeTab === tab ? COLORS.primary : COLORS.textMuted,
                  fontSize: 10, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif", letterSpacing: 1,
                  textTransform: "uppercase",
                  transition: "all 0.15s ease",
                  boxShadow: activeTab === tab ? `0 0 10px ${COLORS.primary}20` : "none"
                }}
              >
                {tab === "animation" ? "Interactive" : "Video Clips"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(ellipse at 50% 0%, ${COLORS.primary}08, transparent 60%)`,
            pointerEvents: "none", zIndex: 1
          }} />

          {activeTab === "video" ? (
            <VideoClipPlayer />
          ) : timer.started ? (
            <>
              <div style={{ position: "absolute", inset: 0 }}>
                {sceneComponents[timer.scene]}
              </div>
              <TransitionOverlay scene={timer.scene} sceneProgress={timer.sceneProgress} />
              <SceneLabel scene={timer.scene} sceneProgress={timer.sceneProgress} />
            </>
          ) : (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 16
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 32, fontWeight: 900, color: COLORS.white,
                  fontFamily: "'Oxanium', sans-serif", lineHeight: 1.1
                }}>GLOW UP</div>
                <div style={{
                  fontSize: 18, fontWeight: 700, letterSpacing: 6, color: COLORS.primary,
                  textShadow: `0 0 16px ${COLORS.primary}`,
                  fontFamily: "'Oxanium', sans-serif"
                }}>SPORTS</div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif", textAlign: "center" }}>
                Player App Promo · ~25 seconds
              </div>
              <button
                onClick={timer.play}
                style={{
                  background: COLORS.primary, color: COLORS.bg,
                  border: "none", borderRadius: 24, padding: "12px 32px",
                  fontSize: 14, fontWeight: 800, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: `0 0 20px ${COLORS.primary}60`,
                  letterSpacing: 1
                }}
              >
                ▶ PLAY PROMO
              </button>
            </div>
          )}

          {activeTab === "animation" && isDone && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(11,13,16,0.92)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 16, zIndex: 60
            }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.white, fontFamily: "'Oxanium', sans-serif", textAlign: "center" }}>
                TRAIN. MATCH. GLOW.
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
                Glow Up Sports — Player App
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={timer.reset}
                  style={{
                    background: "transparent", color: COLORS.primary,
                    border: `1.5px solid ${COLORS.primary}`, borderRadius: 20, padding: "10px 24px",
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                    boxShadow: `0 0 12px ${COLORS.primary}30`
                  }}
                >
                  ↺ REPLAY
                </button>
                <button
                  onClick={() => setActiveTab("video")}
                  style={{
                    background: `${COLORS.cyan}18`, color: COLORS.cyan,
                    border: `1.5px solid ${COLORS.cyan}`, borderRadius: 20, padding: "10px 24px",
                    fontSize: 13, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}
                >
                  View Clips
                </button>
              </div>
            </div>
          )}
        </div>

        {activeTab === "animation" && timer.started && !isDone && (
          <div style={{ background: COLORS.card, borderTop: `1px solid ${COLORS.surface}`, flexShrink: 0, paddingTop: 8 }}>
            <ProgressBar elapsed={timer.elapsed} total={TOTAL_DURATION} />
          </div>
        )}
      </div>
    </div>
  );
}
