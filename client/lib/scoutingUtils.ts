/**
 * Maps opponent skill tags (from PLAYSTYLE_SKILL_TAGS) to counter-drill search terms.
 * When an opponent's strength is identified, the counter term points the player
 * toward drills that neutralise or exploit weaknesses against that strength.
 *
 * Covers every tag produced by each play-style archetype:
 *   baseline_warrior   → Deep Groundstrokes | Consistency | Endurance
 *   net_ninja          → Net Play | Volleys | Approach Shots
 *   serve_machine      → Strong Serve | First Strike | Power
 *   all_court_ace      → Versatility | All-Court | Adaptability
 *   counter_puncher    → Defense | Counter Punching | Speed
 *   tactical_mastermind→ Placement | Strategy | Spin Variation
 */
const COUNTER_DRILL_MAP: Record<string, string> = {
  "Deep Groundstrokes": "approach",
  Consistency: "approach",
  Endurance: "short ball",
  "Net Play": "passing",
  Volleys: "lob",
  "Approach Shots": "passing",
  "Strong Serve": "return",
  "First Strike": "return",
  Power: "return",
  Versatility: "defense",
  "All-Court": "defense",
  Adaptability: "baseline",
  Defense: "aggressive",
  "Counter Punching": "aggressive",
  Speed: "net",
  Placement: "movement",
  Strategy: "consistency",
  "Spin Variation": "flat",
};

/**
 * Returns the best counter-drill search term for the given opponent skill tags.
 * Iterates through the tags in priority order and returns the first match.
 * Falls back to the first raw tag if none of the tags are in the map.
 * Returns an empty string when no tags are provided.
 */
export function getCounterDrillSearch(skillTags: string[]): string {
  for (const tag of skillTags) {
    const counter = COUNTER_DRILL_MAP[tag];
    if (counter) return counter;
  }
  return skillTags[0] ?? "";
}
