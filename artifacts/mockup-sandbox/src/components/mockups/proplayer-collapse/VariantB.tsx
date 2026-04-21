import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  C,
  PLAYER,
  StateLabel,
  PageShell,
  GlowCardFrame,
  Avatar,
  XPBar,
  FullCardOpenContent,
} from "./_shared";

function ChevronBtn({ dir }: { dir: "up" | "down" }) {
  const Icon = dir === "up" ? ChevronUp : ChevronDown;
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: C.chipStrong,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={14} color={C.neon} />
    </div>
  );
}

function OpenWithChevron() {
  return (
    <GlowCardFrame>
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            zIndex: 2,
          }}
        >
          <ChevronBtn dir="up" />
        </div>
        <FullCardOpenContent />
      </div>
    </GlowCardFrame>
  );
}

function CollapsedCard() {
  return (
    <GlowCardFrame>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
        }}
      >
        <Avatar size={40} level={PLAYER.level} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: C.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {PLAYER.name}
          </span>
          <XPBar height={3} compact />
        </div>
        <ChevronBtn dir="down" />
      </div>
    </GlowCardFrame>
  );
}

export default function VariantB() {
  return (
    <PageShell title="Variant B — Tap chevron (persistent)">
      <div>
        <StateLabel>Open (chevron up to collapse)</StateLabel>
        <OpenWithChevron />
      </div>
      <div>
        <StateLabel>Collapsed (chevron down to expand)</StateLabel>
        <CollapsedCard />
      </div>
    </PageShell>
  );
}
