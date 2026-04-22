import React from "react";
import {
  GraduationCap,
  Swords,
  Flame,
  ChevronRight,
  Search,
  Inbox,
  Users,
  Settings2,
} from "lucide-react";
import {
  C,
  Phone,
  TabBar,
  FilterChip,
  SAMPLE_SESSIONS,
  SessionCard,
  BottomTabBar,
  ScreenHeader,
} from "./_shared";

export default function VariantHubTabs() {
  return (
    <Phone label="VARIANT 2 · HUB + TABS">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <ScreenHeader
          right={
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: C.chipStrong,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Search size={14} color={C.textMuted} />
            </div>
          }
        />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Three large feature cards */}
          <FeatureCard
            icon={GraduationCap}
            title="Take a lesson"
            subtitle="12 lessons this week at your level"
            accent={C.neon}
            highlighted
          />
          <FeatureCard
            icon={Swords}
            title="Find a Match"
            subtitle="Create your own · 8 nearby players"
            accent={C.neon}
          />
          <FeatureCard
            icon={Flame}
            title="Open Matches"
            subtitle="3 open now · join in one tap"
            accent={C.glow}
            badge="3"
          />

          {/* Secondary chips kept inline so nothing is lost */}
          <div style={{ display: "flex", gap: 6, padding: "4px 0 2px" }}>
            <SmallPill icon={Inbox} label="Invites" badge={2} />
            <SmallPill icon={Users} label="My Games" />
            <SmallPill icon={Settings2} label="Preferences" />
          </div>

          {/* Tabs */}
          <div style={{ margin: "6px -16px 0" }}>
            <TabBar
              tabs={["Group Lessons", "Players", "Leaderboard"]}
              active="Group Lessons"
            />
          </div>

          {/* Full filter rows preserved */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0 4px" }}>
            <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
              <FilterChip label="My Level" active small />
              <FilterChip label="All" small />
              <FilterChip label="Blue" color={C.blue} small />
              <FilterChip label="Red" color={C.red} small />
              <FilterChip label="Orange" color={C.orange} small />
              <FilterChip label="Green" color={C.green} small />
              <FilterChip label="Yellow" color={C.yellow} small />
              <FilterChip label="Glow" color={C.glow} small />
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <FilterChip label="All Days" active small />
              <FilterChip label="Today" small />
              <FilterChip label="Tomorrow" small />
              <FilterChip label="Weekend" small />
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <FilterChip label="My Academy" active small />
              <FilterChip label="All Academies" small />
            </div>
          </div>

          {/* Sessions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SAMPLE_SESSIONS.slice(0, 2).map((s, i) => (
              <SessionCard key={i} s={s} />
            ))}
          </div>
        </div>

        <BottomTabBar active="Play" />
      </div>
    </Phone>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  subtitle,
  accent,
  highlighted = false,
  badge,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  accent: string;
  highlighted?: boolean;
  badge?: string;
}) {
  return (
    <div
      style={{
        background: highlighted ? `${accent}10` : C.cardStrong,
        border: `1px solid ${highlighted ? `${accent}50` : C.border}`,
        borderRadius: 16,
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -30,
          top: -30,
          width: 110,
          height: 110,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}25, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
          border: `1px solid ${accent}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={22} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{subtitle}</div>
      </div>
      {badge ? (
        <div
          style={{
            background: accent,
            color: "#000",
            fontSize: 11,
            fontWeight: 800,
            borderRadius: 999,
            minWidth: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 7px",
            marginRight: 4,
          }}
        >
          {badge}
        </div>
      ) : null}
      <ChevronRight size={18} color={highlighted ? accent : C.textMuted} />
    </div>
  );
}

function SmallPill({
  icon: Icon,
  label,
  badge,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  badge?: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 9px",
        background: C.chip,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
      }}
    >
      <Icon size={12} color={C.textMuted} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>{label}</span>
      {badge ? (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: "#E040FB",
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
