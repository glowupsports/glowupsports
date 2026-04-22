import React from "react";
import {
  Trophy,
  Users,
  Search,
  Calendar,
  MapPin,
  Clock,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

export const C = {
  bg: "#0B0D10",
  bgElevated: "#11141A",
  card: "rgba(255,255,255,0.06)",
  cardStrong: "rgba(255,255,255,0.08)",
  chip: "rgba(255,255,255,0.04)",
  chipStrong: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  textMuted: "#7C8290",
  textDim: "#5A6068",
  neon: "#C8FF3D",
  neonSoft: "#A6E92A",
  accentSoft: "rgba(200,255,61,0.10)",
  accentBorder: "rgba(200,255,61,0.30)",
  glow: "#E040FB",
  yellow: "#EAB308",
  orange: "#F97316",
  red: "#EF4444",
  green: "#22C55E",
  blue: "#3B82F6",
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
          <span style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1.5, fontWeight: 700 }}>
            {label}
          </span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 16, height: 10, background: C.text, borderRadius: 2, opacity: 0.9 }} />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PrimaryActionChip({
  icon: Icon,
  label,
  count,
  highlighted = false,
}: {
  icon: LucideIcon;
  label: string;
  count?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: highlighted ? C.accentSoft : C.cardStrong,
        border: `1px solid ${highlighted ? C.accentBorder : C.border}`,
        borderRadius: 14,
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
      }}
    >
      <Icon size={18} color={highlighted ? C.neon : C.text} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.text,
          textAlign: "center",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      {count ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: highlighted ? C.neon : C.textMuted,
            letterSpacing: 0.4,
          }}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function SecondaryChip({
  icon: Icon,
  label,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        background: C.chip,
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        position: "relative",
      }}
    >
      <Icon size={12} color={C.textMuted} />
      <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{label}</span>
      {badge ? (
        <span
          style={{
            background: C.glow,
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            borderRadius: 999,
            minWidth: 14,
            height: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

export function TabBar({
  tabs,
  active,
  prominent = false,
}: {
  tabs: string[];
  active: string;
  prominent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: prominent ? 18 : 14,
        padding: "0 16px",
        borderBottom: `1px solid ${C.divider}`,
      }}
    >
      {tabs.map((t) => {
        const isActive = t === active;
        return (
          <div
            key={t}
            style={{
              padding: prominent ? "12px 0 14px" : "10px 0",
              borderBottom: `2px solid ${isActive ? C.neon : "transparent"}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: prominent ? 15 : 13,
                fontWeight: isActive ? 800 : 600,
                color: isActive ? C.text : C.textMuted,
                letterSpacing: prominent ? 0.2 : 0,
              }}
            >
              {t}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FilterChip({
  label,
  color,
  active = false,
  small = false,
}: {
  label: string;
  color?: string;
  active?: boolean;
  small?: boolean;
}) {
  return (
    <div
      style={{
        padding: small ? "4px 8px" : "5px 10px",
        background: active ? (color ? `${color}25` : C.accentSoft) : C.chip,
        border: `1px solid ${active ? (color || C.accentBorder) : C.border}`,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {color ? (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
          }}
        />
      ) : null}
      <span
        style={{
          fontSize: small ? 10 : 11,
          fontWeight: 700,
          color: active ? C.text : C.textMuted,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export type SampleSession = {
  title: string;
  coach: string;
  time: string;
  location: string;
  ballLevel: string;
  ballColor: string;
  enrolled: number;
  max: number;
  xp: number;
  squad?: string;
};

export const SAMPLE_SESSIONS: SampleSession[] = [
  {
    title: "Power Drills & Match Play",
    coach: "Coach Marco",
    time: "Today · 18:00",
    location: "Glow Court 3 · Dubai Marina",
    ballLevel: "GLOW 4",
    ballColor: C.glow,
    enrolled: 5,
    max: 6,
    xp: 60,
    squad: "Night Hawks",
  },
  {
    title: "Footwork Foundations",
    coach: "Coach Lina",
    time: "Tomorrow · 07:30",
    location: "Center Court · Al Barsha",
    ballLevel: "YELLOW 2",
    ballColor: C.yellow,
    enrolled: 3,
    max: 8,
    xp: 45,
  },
  {
    title: "Saturday Squad Session",
    coach: "Coach Marco",
    time: "Sat 26 · 09:00",
    location: "Glow Court 1",
    ballLevel: "GLOW 4",
    ballColor: C.glow,
    enrolled: 6,
    max: 6,
    xp: 80,
    squad: "Glow Squad",
  },
];

export function SessionCard({ s }: { s: SampleSession }) {
  const full = s.enrolled >= s.max;
  return (
    <div
      style={{
        background: C.cardStrong,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${s.ballColor}40, ${s.ballColor}15)`,
            border: `1px solid ${s.ballColor}55`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 800, color: s.ballColor, letterSpacing: 0.5 }}>
            {s.ballLevel.split(" ")[0].slice(0, 3)}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
            {s.title}
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {s.coach} · +{s.xp} XP
          </div>
        </div>
        <div
          style={{
            background: full ? "rgba(239,68,68,0.18)" : C.accentSoft,
            border: `1px solid ${full ? "rgba(239,68,68,0.4)" : C.accentBorder}`,
            borderRadius: 999,
            padding: "3px 8px",
            fontSize: 9,
            fontWeight: 800,
            color: full ? C.red : C.neon,
            letterSpacing: 0.4,
            whiteSpace: "nowrap",
          }}
        >
          {full ? "FULL" : `${s.enrolled}/${s.max}`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 10, color: C.textMuted, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <Clock size={10} /> {s.time}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <MapPin size={10} /> {s.location}
        </span>
      </div>
      {s.squad ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: C.glow,
              background: "rgba(224,64,251,0.12)",
              border: "1px solid rgba(224,64,251,0.35)",
              borderRadius: 999,
              padding: "2px 7px",
              letterSpacing: 0.4,
            }}
          >
            SQUAD · {s.squad}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function BottomTabBar({ active = "Play" }: { active?: string }) {
  const items = ["Home", "Community", "Play", "Growth", "Profile"];
  return (
    <div
      style={{
        display: "flex",
        borderTop: `1px solid ${C.divider}`,
        background: "rgba(11,13,16,0.95)",
        padding: "8px 0 12px",
        flexShrink: 0,
      }}
    >
      {items.map((it) => {
        const isActive = it === active;
        return (
          <div
            key={it}
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
                width: 18,
                height: 18,
                borderRadius: 4,
                background: isActive ? C.neon : C.chipStrong,
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: isActive ? C.neon : C.textMuted,
              }}
            >
              {it}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ScreenHeader({
  right,
}: {
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${C.neon}, ${C.neonSoft})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#000",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          T
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1 }}>Play</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            Glow Up Tennis Academy
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
    </div>
  );
}
