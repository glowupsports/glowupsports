import React from "react";
import {
  GraduationCap,
  Swords,
  Flame,
  Inbox,
  Users,
  Settings2,
  MoreHorizontal,
  Sliders,
  ChevronDown,
  Search,
} from "lucide-react";
import {
  C,
  Phone,
  PrimaryActionChip,
  TabBar,
  FilterChip,
  SAMPLE_SESSIONS,
  SessionCard,
  BottomTabBar,
  ScreenHeader,
} from "./_shared";

export default function VariantCleanup() {
  return (
    <Phone label="VARIANT 1 · CLEANUP">
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

        {/* Primary actions — same 3 chips as today, calmer styling */}
        <div style={{ display: "flex", gap: 8, padding: "0 16px 8px" }}>
          <PrimaryActionChip
            icon={GraduationCap}
            label="Take a lesson"
            count="12 this week"
            highlighted
          />
          <PrimaryActionChip icon={Swords} label="Find a Match" />
          <PrimaryActionChip icon={Flame} label="Open Matches" count="3 open" />
        </div>

        {/* Secondary chips collapsed into compact icon row + More */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 16px 10px",
          }}
        >
          <CompactIconChip icon={Inbox} label="Invites" badge={2} />
          <CompactIconChip icon={Users} label="My Games" />
          <CompactIconChip icon={Settings2} label="Prefs" />
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 9px",
              background: C.chip,
              border: `1px solid ${C.border}`,
              borderRadius: 999,
            }}
          >
            <MoreHorizontal size={12} color={C.textMuted} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>More</span>
          </div>
        </div>

        {/* Prominent tabs */}
        <TabBar
          tabs={["Group Lessons", "Players", "Leaderboard"]}
          active="Group Lessons"
          prominent
        />

        {/* Single softer filter row + filter button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              background: C.accentSoft,
              border: `1px solid ${C.accentBorder}`,
              borderRadius: 999,
            }}
          >
            <Sliders size={11} color={C.neon} />
            <span style={{ fontSize: 10, fontWeight: 800, color: C.neon }}>Filter</span>
          </div>
          <div style={{ flex: 1, display: "flex", gap: 5, overflow: "hidden" }}>
            <FilterChip label="My Level" active small />
            <FilterChip label="This Week" small />
            <FilterChip label="Mine" small />
            <span
              style={{
                fontSize: 10,
                color: C.textDim,
                alignSelf: "center",
                whiteSpace: "nowrap",
              }}
            >
              · 6 active
            </span>
          </div>
        </div>

        {/* Content first */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {SAMPLE_SESSIONS.map((s, i) => (
            <SessionCard key={i} s={s} />
          ))}

          {/* Inline empty-state hint */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 8px",
              fontSize: 11,
              color: C.textMuted,
            }}
          >
            <span>That's everything matching your filters.</span>
            <span style={{ color: C.neon, fontWeight: 700 }}>Browse all</span>
          </div>
        </div>

        <BottomTabBar active="Play" />
      </div>
    </Phone>
  );
}

function CompactIconChip({
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
