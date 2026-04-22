import React from "react";
import {
  Trophy,
  GraduationCap,
  Swords,
  Flame,
  MapPin,
  Sparkles,
  ChevronRight,
  Clock,
  Sliders,
  Inbox,
  Users,
  Settings2,
} from "lucide-react";
import {
  C,
  Phone,
  TabBar,
  FilterChip,
  BottomTabBar,
} from "./_shared";

export default function VariantSmartFeed() {
  return (
    <Phone label="VARIANT 3 · SMART FEED">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header — slim, with leaderboard demoted to icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px 10px",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: 1 }}>
              MORNING
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 2 }}>
              Hey, ready to play?
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <HeaderIcon icon={Trophy} highlighted />
            <HeaderIcon icon={Inbox} badge={2} />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Today for you */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={13} color={C.neon} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: C.neon,
                    letterSpacing: 1.4,
                  }}
                >
                  TODAY FOR YOU
                </span>
              </div>
              <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>4 picks</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <FeedCard
                icon={GraduationCap}
                accent={C.neon}
                tag="LESSON"
                title="Power Drills & Match Play"
                meta="18:00 · Glow Court 3 · Coach Marco"
                cta="1 spot left"
              />
              <FeedCard
                icon={Flame}
                accent={C.glow}
                tag="OPEN MATCH"
                title="Doubles · 9 min from you"
                meta="Tonight 20:00 · 2 of 4 confirmed"
                cta="Join"
              />
              <FeedCard
                icon={Swords}
                accent={C.yellow}
                tag="CHALLENGE"
                title="Sara K. · YELLOW 3"
                meta="Same level · 78% win rate"
                cta="Challenge"
              />
              <FeedCard
                icon={MapPin}
                accent={C.blue}
                tag="COURT"
                title="Al Barsha Center Court"
                meta="2.1 km · open slots 18:00 – 22:00"
                cta="Book"
              />
            </div>
          </div>

          {/* Browse — same tabs + filters preserved, condensed */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: C.textMuted,
                letterSpacing: 1.4,
                marginBottom: 6,
              }}
            >
              OR BROWSE
            </div>
            <div style={{ margin: "0 -16px" }}>
              <TabBar
                tabs={["Group Lessons", "Players", "Leaderboard"]}
                active="Group Lessons"
              />
            </div>

            {/* Filters consolidated behind one Adjust button + active summary */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 0 4px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 11px",
                  background: C.accentSoft,
                  border: `1px solid ${C.accentBorder}`,
                  borderRadius: 999,
                }}
              >
                <Sliders size={12} color={C.neon} />
                <span style={{ fontSize: 11, fontWeight: 800, color: C.neon }}>Adjust</span>
              </div>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  color: C.textMuted,
                  overflow: "hidden",
                }}
              >
                <FilterChip label="My Level" small />
                <FilterChip label="This Week" small />
                <span style={{ whiteSpace: "nowrap" }}>+4 more</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <BrowseRow
                title="Footwork Foundations"
                meta="Tomorrow 07:30 · Coach Lina"
                ballColor={C.yellow}
                level="YEL 2"
                slots="3/8"
              />
              <BrowseRow
                title="Saturday Squad Session"
                meta="Sat 26 · 09:00 · Coach Marco"
                ballColor={C.glow}
                level="GLW 4"
                slots="6/6"
                full
              />
            </div>

            {/* Secondary actions still reachable */}
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 10,
              }}
            >
              <SmallGhost icon={Users} label="My Games" />
              <SmallGhost icon={Settings2} label="Preferences" />
            </div>
          </div>
        </div>

        <BottomTabBar active="Play" />
      </div>
    </Phone>
  );
}

function HeaderIcon({
  icon: Icon,
  highlighted,
  badge,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  highlighted?: boolean;
  badge?: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: 32,
        height: 32,
        borderRadius: 16,
        background: highlighted ? C.accentSoft : C.chipStrong,
        border: `1px solid ${highlighted ? C.accentBorder : "transparent"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={15} color={highlighted ? C.neon : C.text} />
      {badge ? (
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -3,
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

function FeedCard({
  icon: Icon,
  accent,
  tag,
  title,
  meta,
  cta,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
  tag: string;
  title: string;
  meta: string;
  cta: string;
}) {
  return (
    <div
      style={{
        background: C.cardStrong,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 11,
        display: "flex",
        alignItems: "center",
        gap: 11,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
          border: `1px solid ${accent}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: accent,
            letterSpacing: 1,
            marginBottom: 2,
          }}
        >
          {tag}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.text,
            lineHeight: 1.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta}
        </div>
      </div>
      <div
        style={{
          padding: "5px 10px",
          background: `${accent}18`,
          border: `1px solid ${accent}55`,
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 800,
          color: accent,
          whiteSpace: "nowrap",
        }}
      >
        {cta}
      </div>
    </div>
  );
}

function BrowseRow({
  title,
  meta,
  ballColor,
  level,
  slots,
  full,
}: {
  title: string;
  meta: string;
  ballColor: string;
  level: string;
  slots: string;
  full?: boolean;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 11px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: `${ballColor}20`,
          border: `1px solid ${ballColor}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 8, fontWeight: 800, color: ballColor }}>{level}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{meta}</div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: full ? C.red : C.neon,
          background: full ? "rgba(239,68,68,0.15)" : C.accentSoft,
          border: `1px solid ${full ? "rgba(239,68,68,0.4)" : C.accentBorder}`,
          padding: "3px 7px",
          borderRadius: 999,
        }}
      >
        {full ? "FULL" : slots}
      </span>
    </div>
  );
}

function SmallGhost({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 9px",
        background: "transparent",
        border: `1px solid ${C.border}`,
        borderRadius: 999,
      }}
    >
      <Icon size={11} color={C.textMuted} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted }}>{label}</span>
    </div>
  );
}
