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
