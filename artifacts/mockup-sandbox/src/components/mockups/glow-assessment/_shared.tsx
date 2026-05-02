import React from "react";

export const C = {
  bg: "#0B0D10",
  bgElevated: "#11141A",
  card: "rgba(255,255,255,0.05)",
  cardStrong: "rgba(255,255,255,0.08)",
  chip: "rgba(255,255,255,0.04)",
  chipStrong: "rgba(255,255,255,0.10)",
  divider: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textMuted: "#7C8290",
  textDim: "#4A5060",
  neon: "#C8FF3D",
  neonSoft: "#A6E92A",
  accentSoft: "rgba(200,255,61,0.10)",
  accentBorder: "rgba(200,255,61,0.30)",
  accentBorderStrong: "rgba(200,255,61,0.55)",
  glow: "#E040FB",
  glowSoft: "rgba(224,64,251,0.12)",
  glowBorder: "rgba(224,64,251,0.35)",
  gold: "#EAB308",
  goldSoft: "rgba(234,179,8,0.12)",
  orange: "#F97316",
  red: "#EF4444",
  blue: "#3B82F6",
  cyan: "#00E5FF",
  cyanSoft: "rgba(0,229,255,0.10)",
  cyanBorder: "rgba(0,229,255,0.30)",
};

export const FONT =
  "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const PHONE_W = 402;
export const PHONE_H = 874;

export function Phone({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#06070A",
        padding: 0,
        fontFamily: FONT,
        color: C.text,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: PHONE_W,
          height: PHONE_H,
          background: C.bg,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* status bar */}
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 22px",
            fontSize: 14,
            fontWeight: 600,
            color: C.text,
            flexShrink: 0,
          }}
        >
          <span>9:41</span>
          <span
            style={{
              fontSize: 11,
              color: C.textMuted,
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            {label}
          </span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span
              style={{
                width: 16,
                height: 10,
                background: C.text,
                borderRadius: 2,
                opacity: 0.9,
              }}
            />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BottomTabBar({ active = "Home" }: { active?: string }) {
  const items = [
    { label: "Home", icon: "⌂" },
    { label: "Community", icon: "◉" },
    { label: "Play", icon: "▷" },
    { label: "Growth", icon: "↑" },
    { label: "Profile", icon: "◎" },
  ];
  return (
    <div
      style={{
        display: "flex",
        borderTop: `1px solid ${C.divider}`,
        background: "rgba(11,13,16,0.97)",
        padding: "8px 0 14px",
        flexShrink: 0,
      }}
    >
      {items.map((it) => {
        const isActive = it.label === active;
        return (
          <div
            key={it.label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: isActive ? C.accentSoft : "transparent",
                border: isActive ? `1px solid ${C.accentBorder}` : "1px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: isActive ? C.neon : C.textMuted,
              }}
            >
              {it.icon}
            </div>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: isActive ? C.neon : C.textMuted,
              }}
            >
              {it.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ScreenHeader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px 10px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: `linear-gradient(135deg, ${C.neon}, ${C.neonSoft})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#000",
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          A
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1 }}>
            Home
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            Glow Up Tennis Academy
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: C.chipStrong,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: C.textMuted,
          }}
        >
          🔔
        </div>
      </div>
    </div>
  );
}

export function ProgressBar({
  step,
  total,
}: {
  step: number;
  total: number;
}) {
  const pct = (step / total) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          height: 4,
          background: C.chipStrong,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${C.neon}, ${C.neonSoft})`,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.textMuted,
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        {step} / {total}
      </div>
    </div>
  );
}

export type AnswerOption = {
  label: string;
  sub?: string;
  icon?: string;
};

export function AnswerTile({
  opt,
  selected,
}: {
  opt: AnswerOption;
  selected?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 14px",
        borderRadius: 14,
        border: `1.5px solid ${selected ? C.accentBorderStrong : C.border}`,
        background: selected ? C.accentSoft : C.card,
        cursor: "pointer",
      }}
    >
      {opt.icon ? (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: selected ? "rgba(200,255,61,0.15)" : C.chipStrong,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {opt.icon}
        </div>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: selected ? C.neon : C.text,
            lineHeight: 1.2,
          }}
        >
          {opt.label}
        </div>
        {opt.sub ? (
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            {opt.sub}
          </div>
        ) : null}
      </div>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          border: `2px solid ${selected ? C.neon : C.border}`,
          background: selected ? C.neon : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {selected ? (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "#000",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function GlowLevelBadge({
  rank,
  size = "md",
}: {
  rank: number;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? 72 : size === "md" ? 52 : 36;
  const fontSize = size === "lg" ? 28 : size === "md" ? 20 : 14;
  const labelSize = size === "lg" ? 10 : 8;

  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        background: `linear-gradient(135deg, ${C.cyanSoft}, rgba(0,229,255,0.06))`,
        border: `2px solid ${C.cyanBorder}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: labelSize,
          fontWeight: 800,
          color: C.cyan,
          letterSpacing: 0.5,
          lineHeight: 1,
        }}
      >
        GLOW
      </span>
      <span
        style={{
          fontSize,
          fontWeight: 900,
          color: C.cyan,
          lineHeight: 1,
        }}
      >
        {rank}
      </span>
    </div>
  );
}

export function getCategoryLabel(rank: number): string {
  if (rank >= 8) return "Beginner";
  if (rank >= 6) return "Intermediate";
  if (rank >= 4) return "Advanced";
  return "Elite";
}

export function getCategoryColor(rank: number): string {
  if (rank >= 8) return C.neon;
  if (rank >= 6) return C.blue;
  if (rank >= 4) return C.orange;
  return C.glow;
}
