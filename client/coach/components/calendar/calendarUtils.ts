// ─── Session-type fallback gradient ──────────────────────────────────────────
export function getSessionTypeGradient(type: string): [string, string] {
  switch (type) {
    case "private":
    case "private_adjusted":
      return ["#00D4FF", "#0097B8"];
    case "semi_private":
      return ["#FF6B35", "#CC4A1A"];
    case "group":
      return ["#FFD700", "#CC9900"];
    case "physical":
      return ["#9B59B6", "#6C3483"];
    case "activity":
      return ["#00E5A0", "#00B37D"];
    default:
      return ["#00D4FF", "#0097B8"];
  }
}

// ─── Ball-level stage → gradient ─────────────────────────────────────────────
// ballLevel values look like "RED_3", "ORANGE_1", "GREEN_2", "YELLOW_1".
// We extract the stage prefix and map it to a colour pair.
function stageFromBallLevel(ballLevel: string | null | undefined): string | null {
  if (!ballLevel) return null;
  const upper = ballLevel.toUpperCase();
  if (upper.startsWith("RED"))    return "RED";
  if (upper.startsWith("ORANGE")) return "ORANGE";
  if (upper.startsWith("GREEN"))  return "GREEN";
  if (upper.startsWith("YELLOW")) return "YELLOW";
  return null;
}

function gradientForStage(stage: string): [string, string] | null {
  switch (stage) {
    case "RED":    return ["#EF4444", "#B91C1C"];
    case "ORANGE": return ["#F97316", "#C2410C"];
    case "GREEN":  return ["#22C55E", "#15803D"];
    case "YELLOW": return ["#EAB308", "#A16207"];
    default:       return null;
  }
}

/**
 * Returns the gradient color pair for a calendar session block.
 *
 * Priority:
 *  1. session.ballLevel (set on the session/series itself in the DB)
 *  2. First player's ballLevel (covers private/semi-private with a single player)
 *  3. Fall back to session-type colour
 */
export function getSessionGradient(session: {
  sessionType?: string;
  ballLevel?: string | null;
  players?: Array<{ ballLevel?: string | null }>;
}): [string, string] {
  // Try session-level ball level first
  const sessionLevel = session.ballLevel;
  const stage = stageFromBallLevel(sessionLevel)
    ?? stageFromBallLevel(session.players?.[0]?.ballLevel);

  if (stage) {
    const g = gradientForStage(stage);
    if (g) return g;
  }

  return getSessionTypeGradient(session.sessionType ?? "");
}
