import React from "react";
import { ChevronUp } from "lucide-react";
import {
  C,
  PLAYER,
  StateLabel,
  PageShell,
  GlowCardFrame,
  Avatar,
  FullCardOpenContent,
} from "./_shared";

function CollapsedStrip() {
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
            height: 2,
            background: `linear-gradient(90deg, ${C.neon}, ${C.neonSoft}, ${C.neon})`,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            height: 52,
            boxSizing: "border-box",
          }}
        >
          <Avatar size={32} level={PLAYER.level} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: C.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 110,
            }}
          >
            {PLAYER.name}
          </span>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <div
              style={{
                flex: 1,
                height: 3,
                backgroundColor: C.chipStrong,
                borderRadius: 1.5,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(PLAYER.xp / PLAYER.xpNeeded) * 100}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.neon}, ${C.neonSoft})`,
                }}
              />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.neon }}>
              {PLAYER.xp}/{PLAYER.xpNeeded}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              opacity: 0.7,
            }}
          >
            <ChevronUp size={12} color={C.muted} />
            <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>
              scroll up
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VariantA() {
  return (
    <PageShell title="Variant A — Scroll-driven collapse">
      <div>
        <StateLabel>Open</StateLabel>
        <GlowCardFrame>
          <FullCardOpenContent />
        </GlowCardFrame>
      </div>
      <div>
        <StateLabel>Collapsed (after scrolling down)</StateLabel>
        <CollapsedStrip />
      </div>
    </PageShell>
  );
}
