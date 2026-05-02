import React from "react";
import {
  C,
  Phone,
  BottomTabBar,
  ScreenHeader,
  GlowLevelBadge,
} from "./_shared";

// ─── Simulated home feed rows ─────────────────────────────────────────────────

function NextSessionCard() {
  return (
    <div
      style={{
        background: C.cardStrong,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `linear-gradient(135deg, rgba(200,255,61,0.2), rgba(200,255,61,0.06))`,
          border: `1px solid ${C.accentBorder}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 8, fontWeight: 800, color: C.neon, letterSpacing: 0.5 }}>
          MON
        </span>
        <span style={{ fontSize: 15, fontWeight: 900, color: C.neon, lineHeight: 1 }}>
          05
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Power Drills &amp; Match Play
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
          Coach Marco · 18:00 · Glow Court 3
        </div>
      </div>
      <div
        style={{
          background: C.accentSoft,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: 8,
          padding: "4px 8px",
          fontSize: 10,
          fontWeight: 700,
          color: C.neon,
          flexShrink: 0,
        }}
      >
        Today
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.6,
        color: C.textMuted,
        textTransform: "uppercase",
        padding: "0 2px",
      }}
    >
      {children}
    </div>
  );
}

// ─── The Glow Assessment Card — the main subject of this mockup ───────────────

function GlowAssessmentCard({ dismissed = false }: { dismissed?: boolean }) {
  if (dismissed) return null;

  return (
    <div style={{ position: "relative" }}>
      {/* Outer glow ring */}
      <div
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: 18,
          background: `linear-gradient(135deg, rgba(0,229,255,0.45), rgba(224,64,251,0.35), rgba(200,255,61,0.25))`,
          filter: "blur(2px)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          borderRadius: 16,
          background: `linear-gradient(160deg, #0E1520 0%, #0B0D10 100%)`,
          border: `1.5px solid rgba(0,229,255,0.35)`,
          overflow: "hidden",
        }}
      >
        {/* Top accent stripe */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, #00E5FF, #E040FB, #C8FF3D)`,
          }}
        />

        <div style={{ padding: "16px 16px 14px" }}>
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GlowLevelBadge rank={7} size="md" />
              <div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#00E5FF",
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                  }}
                >
                  New Feature
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 900,
                    color: C.text,
                    lineHeight: 1.15,
                    marginTop: 1,
                  }}
                >
                  Discover Your
                  <br />
                  Glow Level
                </div>
              </div>
            </div>

            {/* Dismiss */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.textMuted,
                cursor: "pointer",
                padding: "4px 6px",
                alignSelf: "flex-start",
              }}
            >
              Later
            </div>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.65)",
              marginBottom: 16,
            }}
          >
            Answer 6 quick questions and we'll place you in the right Glow Level — so
            you always play with people at your level.
          </div>

          {/* Category pills row */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Beginner", range: "9–8", color: C.neon },
              { label: "Intermediate", range: "7–6", color: "#3B82F6" },
              { label: "Advanced", range: "5–4", color: "#F97316" },
              { label: "Elite", range: "3–1", color: "#E040FB" },
            ].map((cat) => (
              <div
                key={cat.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: `${cat.color}14`,
                  border: `1px solid ${cat.color}40`,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: cat.color,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: cat.color,
                  }}
                >
                  {cat.label}
                </span>
                <span style={{ fontSize: 9, color: C.textMuted }}>
                  {cat.range}
                </span>
              </div>
            ))}
          </div>

          {/* CTA row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                flex: 1,
                background: `linear-gradient(135deg, #00E5FF, #0099CC)`,
                borderRadius: 12,
                padding: "13px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#000",
                }}
              >
                Find My Level
              </span>
              <span style={{ fontSize: 14, color: "#000" }}>→</span>
            </div>

            <div
              style={{
                fontSize: 10,
                color: C.textMuted,
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              Takes about
              <br />
              <span style={{ fontWeight: 700, color: C.text }}>2 min</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Full home screen mockup ──────────────────────────────────────────────────

export default function HomeCardMockup() {
  return (
    <Phone label="HOME CARD">
      <ScreenHeader />

      {/* scrollable content area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Assessment Card — prominent, top of feed */}
        <GlowAssessmentCard />

        {/* Rest of the home feed is faded / contextual */}
        <SectionLabel>Upcoming</SectionLabel>
        <NextSessionCard />

        {/* Faded secondary feed rows */}
        <SectionLabel>Your Progress</SectionLabel>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "12px 14px",
            opacity: 0.55,
          }}
        >
          <div
            style={{
              height: 14,
              background: C.chipStrong,
              borderRadius: 4,
              width: "60%",
              marginBottom: 8,
            }}
          />
          <div
            style={{
              height: 8,
              background: C.chipStrong,
              borderRadius: 4,
              width: "85%",
            }}
          />
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "12px 14px",
            opacity: 0.35,
          }}
        >
          <div
            style={{
              height: 14,
              background: C.chipStrong,
              borderRadius: 4,
              width: "45%",
              marginBottom: 8,
            }}
          />
          <div
            style={{
              height: 8,
              background: C.chipStrong,
              borderRadius: 4,
              width: "70%",
            }}
          />
        </div>
      </div>

      <BottomTabBar active="Home" />
    </Phone>
  );
}
