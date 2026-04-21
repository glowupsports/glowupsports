import React from "react";
import { ChevronDown, GripHorizontal } from "lucide-react";
import {
  C,
  PLAYER,
  StateLabel,
  PageShell,
  Avatar,
  ChipRow,
} from "./_shared";

function StickyStrip({ withHandle = true }: { withHandle?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px 9px",
          backgroundColor: "rgba(17,20,26,0.92)",
          backdropFilter: "blur(12px)",
          borderRadius: 14,
          border: `1px solid ${C.accentBorder}`,
          boxShadow: `0 0 0 2px rgba(200,255,61,0.15)`,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <Avatar size={28} level={PLAYER.level} />
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
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
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
        {withHandle ? <GripHorizontal size={14} color={C.muted} /> : null}
      </div>
    </div>
  );
}

function RichLayer() {
  return (
    <div style={{ position: "relative", margin: "0 4px" }}>
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
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px 8px",
          }}
        >
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
          <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>
            {PLAYER.academy}
          </span>
        </div>
        <div style={{ height: 1, backgroundColor: C.divider, margin: "0 12px" }} />
        <ChipRow />
      </div>
    </div>
  );
}

function TwoLayerOpen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "0 4px" }}>
      <StickyStrip withHandle={false} />
      <RichLayer />
    </div>
  );
}

function TwoLayerCollapsed() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 4px" }}>
      <StickyStrip withHandle={true} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          opacity: 0.55,
          marginTop: 2,
        }}
      >
        <ChevronDown size={12} color={C.muted} />
        <span style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>
          drag down for details
        </span>
      </div>
    </div>
  );
}

export default function VariantC() {
  return (
    <PageShell title="Variant C — Two-layer (sticky strip + rich layer)">
      <div>
        <StateLabel>Open (sticky strip + rich layer)</StateLabel>
        <TwoLayerOpen />
      </div>
      <div>
        <StateLabel>Collapsed (only sticky strip)</StateLabel>
        <TwoLayerCollapsed />
      </div>
    </PageShell>
  );
}
