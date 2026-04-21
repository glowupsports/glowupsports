import React from "react";
import {
  Wallet,
  Flame,
  Globe,
  Palette,
  HelpCircle,
  Bell,
  Users,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

export const C = {
  bg: "#0B0D10",
  card: "#11141A",
  neon: "#C8FF3D",
  neonSoft: "#A6E92A",
  text: "#FFFFFF",
  muted: "#7C8290",
  chip: "rgba(255,255,255,0.04)",
  chipStrong: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.08)",
  accentSoft: "rgba(200,255,61,0.10)",
  accentBorder: "rgba(200,255,61,0.25)",
  danger: "#FF4D4D",
  dangerSoft: "rgba(255,77,77,0.12)",
};

export const PLAYER = {
  name: "The Law",
  level: 1,
  xp: 15,
  xpNeeded: 55,
  academy: "Glow Up Tennis Academy",
  credits: 0,
  streak: 4,
};

export function StateLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.6,
        color: C.muted,
        textTransform: "uppercase",
        marginBottom: 6,
        marginLeft: 2,
      }}
    >
      {children}
    </div>
  );
}

export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: C.bg,
        padding: "20px 16px 40px",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: C.text,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.neon,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>{children}</div>
    </div>
  );
}

export function GlowCardFrame({
  children,
  thin = false,
}: {
  children: React.ReactNode;
  thin?: boolean;
}) {
  return (
    <div style={{ position: "relative", margin: "0 4px" }}>
      <div
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: 14,
          border: `2px solid ${C.neon}`,
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          borderRadius: 12,
          border: `1px solid ${C.accentBorder}`,
          backgroundColor: C.bg,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${C.neon}, ${C.neonSoft}, ${C.neon})`,
          }}
        />
        {children}
      </div>
    </div>
  );
}

export function Avatar({
  size = 48,
  level = 1,
  showLevel = true,
}: {
  size?: number;
  level?: number;
  showLevel?: boolean;
}) {
  const inner = size - 5;
  const badge = Math.max(14, Math.round(size * 0.36));
  return (
    <div style={{ position: "relative", width: size + 8, height: size + 8 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: size + 8,
          height: size + 8,
          borderRadius: "50%",
          background: `linear-gradient(135deg, rgba(200,255,61,0.4), rgba(166,233,42,0.25), rgba(200,255,61,0.4))`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 4,
          width: size,
          height: size,
          borderRadius: "50%",
          padding: 2,
          background: `linear-gradient(135deg, ${C.neon}, ${C.neonSoft})`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: inner - 1,
            height: inner - 1,
            borderRadius: "50%",
            backgroundColor: C.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.neon,
            fontWeight: 800,
            fontSize: Math.round(size * 0.36),
          }}
        >
          T
        </div>
      </div>
      {showLevel ? (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: badge,
            height: badge,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.neon}, ${C.neonSoft})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#000",
            fontWeight: 800,
            fontSize: Math.max(8, Math.round(badge * 0.55)),
            border: `1.5px solid ${C.bg}`,
            boxSizing: "border-box",
          }}
        >
          {level}
        </div>
      ) : null}
    </div>
  );
}

export function XPBar({
  height = 3,
  showLabels = true,
  compact = false,
}: {
  height?: number;
  showLabels?: boolean;
  compact?: boolean;
}) {
  const pct = (PLAYER.xp / PLAYER.xpNeeded) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
      <div
        style={{
          height,
          backgroundColor: C.chipStrong,
          borderRadius: height / 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: height / 2,
            background: `linear-gradient(90deg, ${C.neon}, ${C.neonSoft})`,
          }}
        />
      </div>
      {showLabels ? (
        <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
          <span style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: C.neon }}>
            {PLAYER.xp} XP
          </span>
          <span style={{ fontSize: compact ? 9 : 10, fontWeight: 500, color: C.muted }}>
            / {PLAYER.xpNeeded}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ChipRow() {
  const zeroCredits = PLAYER.credits <= 0;
  const iconBtn = (Icon: LucideIcon) => (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: C.chipStrong,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={14} color="rgba(255,255,255,0.5)" />
    </div>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px 10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 8,
          backgroundColor: zeroCredits ? C.dangerSoft : C.chip,
        }}
      >
        {zeroCredits ? <AlertCircle size={13} color={C.danger} /> : null}
        <Wallet size={13} color={zeroCredits ? C.danger : C.neon} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: zeroCredits ? C.danger : C.neon,
          }}
        >
          {PLAYER.credits} credits
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          padding: "4px 8px",
          borderRadius: 8,
          backgroundColor: C.chip,
        }}
      >
        <Flame size={13} color={C.neon} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.neon }}>{PLAYER.streak}</span>
      </div>
      <div style={{ flex: 1 }} />
      {iconBtn(Globe)}
      {iconBtn(Palette)}
      {iconBtn(HelpCircle)}
      {iconBtn(Bell)}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 8,
          backgroundColor: C.accentSoft,
          border: `1px solid ${C.accentBorder}`,
        }}
      >
        <Users size={13} color={C.neon} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.neon,
            letterSpacing: 0.5,
          }}
        >
          Family
        </span>
      </div>
    </div>
  );
}

export function FullCardOpenContent() {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px 10px",
        }}
      >
        <Avatar size={48} level={PLAYER.level} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.neon,
              letterSpacing: 1.4,
            }}
          >
            PLAYER
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: C.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {PLAYER.name}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: C.chipStrong,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                color: C.neon,
              }}
            >
              ●
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: C.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {PLAYER.academy}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <XPBar />
          </div>
        </div>
      </div>
      <div style={{ height: 1, backgroundColor: C.divider, margin: "0 12px" }} />
      <ChipRow />
    </>
  );
}
