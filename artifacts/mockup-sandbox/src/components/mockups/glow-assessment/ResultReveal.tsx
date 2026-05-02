import React, { useState } from "react";
import {
  C,
  Phone,
  GlowLevelBadge,
  getCategoryLabel,
  getCategoryColor,
} from "./_shared";

// ─── Rank descriptions ────────────────────────────────────────────────────────

const RANK_DESCRIPTIONS: Record<number, { short: string; detail: string }> = {
  9: {
    short: "Just starting out",
    detail:
      "You're learning the fundamentals — controlling the ball, basic rallying, and getting comfortable on the court. The perfect place to build a solid foundation.",
  },
  8: {
    short: "Getting comfortable",
    detail:
      "You can rally consistently and understand the basic rules. You're developing your strokes and enjoying the game.",
  },
  7: {
    short: "Developing player",
    detail:
      "You have solid fundamentals and can sustain rallies. You're starting to add tactics — spin, angles, and consistency under pressure.",
  },
  6: {
    short: "Club-level player",
    detail:
      "You play regularly, understand match tactics, and compete at a social or club level. Your technique is reliable and improving.",
  },
  5: {
    short: "Competitive club player",
    detail:
      "You compete seriously, have a consistent game, and can adapt your tactics mid-match. You're working on all-court consistency.",
  },
  4: {
    short: "Advanced competitor",
    detail:
      "You play in leagues and tournaments. Your game is well-rounded — powerful serve, reliable strokes, and strong tactical awareness.",
  },
  3: {
    short: "High-level player",
    detail:
      "You compete at a high level — regional or national tournaments. Your game has few weaknesses and every shot is intentional.",
  },
  2: {
    short: "Elite player",
    detail:
      "Near-professional level. You have exceptional technique, fitness, and mental strength. You've competed at the highest amateur levels.",
  },
  1: {
    short: "Professional",
    detail:
      "You play or have played at professional or near-professional level. Your game is a model of consistency, power, and precision.",
  },
};

// ─── Adjustment arrows ────────────────────────────────────────────────────────

function AdjustmentControl({
  rank,
  onAdjust,
}: {
  rank: number;
  onAdjust: (delta: -1 | 1) => void;
}) {
  const canDown = rank < 9;
  const canUp = rank > 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 0 4px",
        justifyContent: "center",
      }}
    >
      <div
        onClick={canDown ? () => onAdjust(1) : undefined}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          background: canDown ? C.chipStrong : "rgba(255,255,255,0.03)",
          border: `1.5px solid ${canDown ? C.border : "rgba(255,255,255,0.05)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: canDown ? C.text : C.textDim,
          cursor: canDown ? "pointer" : "default",
        }}
      >
        −
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted }}>
          Adjust level
        </div>
        <div
          style={{
            fontSize: 9,
            color: C.textDim,
            textAlign: "center",
            maxWidth: 130,
            lineHeight: 1.4,
          }}
        >
          Real matches will calibrate it automatically
        </div>
      </div>

      <div
        onClick={canUp ? () => onAdjust(-1) : undefined}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          background: canUp ? C.chipStrong : "rgba(255,255,255,0.03)",
          border: `1.5px solid ${canUp ? C.border : "rgba(255,255,255,0.05)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: canUp ? C.text : C.textDim,
          cursor: canUp ? "pointer" : "default",
        }}
      >
        ＋
      </div>
    </div>
  );
}

// ─── MMR range indicator ──────────────────────────────────────────────────────

const MMR_RANGES: Record<number, { min: number; max: number }> = {
  9: { min: 0, max: 300 },
  8: { min: 301, max: 600 },
  7: { min: 601, max: 900 },
  6: { min: 901, max: 1100 },
  5: { min: 1101, max: 1400 },
  4: { min: 1401, max: 1700 },
  3: { min: 1701, max: 2000 },
  2: { min: 2001, max: 2500 },
  1: { min: 2501, max: 3000 },
};

function MmrSeedInfo({ rank }: { rank: number }) {
  const range = MMR_RANGES[rank] || { min: 600, max: 900 };
  const midpoint = Math.round((range.min + range.max) / 2);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        background: C.chip,
        border: `1px solid ${C.divider}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "rgba(234,179,8,0.12)",
          border: "1px solid rgba(234,179,8,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        ⚡
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
          Starting MMR: {midpoint}
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
          Range for Glow {rank}: {range.min}–{range.max} · Adjusts with every match
        </div>
      </div>
    </div>
  );
}

// ─── Result reveal screen ─────────────────────────────────────────────────────

export default function ResultRevealMockup() {
  const [rank, setRank] = useState(7);
  const [confirmed, setConfirmed] = useState(false);

  const category = getCategoryLabel(rank);
  const catColor = getCategoryColor(rank);
  const desc = RANK_DESCRIPTIONS[rank] || RANK_DESCRIPTIONS[7];

  const handleAdjust = (delta: -1 | 1) => {
    setRank((r) => Math.max(1, Math.min(9, r + delta)));
  };

  if (confirmed) {
    return (
      <Phone label="CONFIRMED">
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            gap: 20,
          }}
        >
          {/* Success ring */}
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              background: `linear-gradient(135deg, rgba(0,229,255,0.2), rgba(0,229,255,0.06))`,
              border: `2px solid rgba(0,229,255,0.5)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
            }}
          >
            ✓
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>
              You're set!
            </div>
            <div
              style={{
                fontSize: 14,
                color: C.textMuted,
                marginTop: 6,
                lineHeight: 1.6,
              }}
            >
              Glow {rank} — {category} has been saved.
              {"\n"}You'll see your level badge on your profile.
            </div>
          </div>
          <div
            style={{
              padding: "13px 40px",
              borderRadius: 12,
              background: `linear-gradient(135deg, #00E5FF, #0099CC)`,
              fontSize: 14,
              fontWeight: 800,
              color: "#000",
              cursor: "pointer",
            }}
            onClick={() => setConfirmed(false)}
          >
            Go to Home
          </div>
        </div>
      </Phone>
    );
  }

  return (
    <Phone label="RESULT">
      {/* Accent stripe */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, #00E5FF, #E040FB, #C8FF3D)`,
          flexShrink: 0,
        }}
      />

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Hero reveal section */}
        <div
          style={{
            padding: "24px 20px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            background: `linear-gradient(180deg, rgba(0,229,255,0.05) 0%, transparent 100%)`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.cyan,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Your Glow Level
          </div>

          {/* Large badge */}
          <GlowLevelBadge rank={rank} size="lg" />

          {/* Category label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 999,
              background: `${catColor}18`,
              border: `1px solid ${catColor}50`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: catColor,
              }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: catColor,
              }}
            >
              {category}
            </span>
          </div>

          {/* Short headline */}
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: C.text,
              textAlign: "center",
              lineHeight: 1.25,
            }}
          >
            {desc.short}
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.6)",
              textAlign: "center",
              lineHeight: 1.65,
              maxWidth: 310,
            }}
          >
            {desc.detail}
          </div>
        </div>

        {/* Adjustment + MMR section */}
        <div
          style={{
            padding: "4px 20px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <AdjustmentControl rank={rank} onAdjust={handleAdjust} />
          <MmrSeedInfo rank={rank} />
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: C.divider,
            margin: "0 20px",
          }}
        />

        {/* Footer CTA */}
        <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            onClick={() => setConfirmed(true)}
            style={{
              height: 52,
              borderRadius: 14,
              background: `linear-gradient(135deg, #00E5FF, #0099CC)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 800, color: "#000" }}>
              Confirm Glow {rank}
            </span>
            <span style={{ fontSize: 16, color: "#000" }}>→</span>
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: C.textMuted,
              lineHeight: 1.5,
            }}
          >
            You can adjust this later on your profile.
            <br />
            Every ranked match will refine your level automatically.
          </div>
        </div>
      </div>
    </Phone>
  );
}
