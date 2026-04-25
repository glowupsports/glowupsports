import React, { useState } from "react";
import { CloudDownload } from "lucide-react";

const COLORS = {
  backdrop: "rgba(0,0,0,0.55)",
  card: "#0F141B",
  elevated: "#1A2230",
  border: "#22303D",
  text: "#F5F8FB",
  textMuted: "#8FA0B5",
  primary: "#C8FF3D",
  accent: "#FFD93D",
  primaryText: "#0A0F14",
};

const RADIUS = { lg: 16, xl: 24 };
const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export default function OtaUpdateSheetPreview() {
  const [restarting, setRestarting] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(circle at 30% 20%, #1a2436 0%, #0a0f14 60%)",
        position: "relative",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* fake app content underneath */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 24,
          color: "#2c3a4d",
          fontSize: 12,
          opacity: 0.4,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          Glow Up Sports
        </div>
        <div>Today · Coach dashboard</div>
      </div>

      {/* dark backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: COLORS.backdrop,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {/* sheet */}
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            background: COLORS.card,
            borderTopLeftRadius: RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            paddingLeft: SPACING.xl,
            paddingRight: SPACING.xl,
            paddingTop: SPACING.md,
            paddingBottom: SPACING.xl + SPACING.lg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            boxShadow: "0 -10px 40px rgba(200, 255, 61, 0.08)",
          }}
        >
          {/* drag handle */}
          <div
            style={{
              width: 44,
              height: 4,
              borderRadius: 2,
              background: COLORS.border,
              marginBottom: SPACING.lg,
            }}
          />
          {/* glow icon-circle */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: COLORS.elevated,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: SPACING.lg,
            }}
          >
            <CloudDownload size={28} color={COLORS.primary} strokeWidth={2} />
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.text,
              textAlign: "center",
              marginBottom: SPACING.sm,
            }}
          >
            Update ready
          </div>
          <div
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: COLORS.textMuted,
              textAlign: "center",
              marginBottom: SPACING.lg,
            }}
          >
            A new version is ready. Restart now or apply automatically next time
            you open the app.
          </div>

          {/* primary button — gradient Neon Green → Yellow */}
          <button
            onClick={() => setRestarting((r) => !r)}
            disabled={restarting}
            style={{
              width: "100%",
              border: "none",
              cursor: restarting ? "default" : "pointer",
              borderRadius: RADIUS.lg,
              overflow: "hidden",
              padding: 0,
              opacity: restarting ? 0.85 : 1,
            }}
          >
            <div
              style={{
                background: `linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.accent} 100%)`,
                paddingTop: SPACING.md,
                paddingBottom: SPACING.md,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: COLORS.primaryText,
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {restarting ? "Restarting…" : "Restart now"}
              </span>
            </div>
          </button>

          {/* secondary text-only */}
          <button
            onClick={() => alert("Later — sheet would dismiss here")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              paddingTop: SPACING.md,
              paddingBottom: SPACING.md,
              paddingLeft: SPACING.lg,
              paddingRight: SPACING.lg,
              marginTop: SPACING.sm,
              color: COLORS.textMuted,
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
