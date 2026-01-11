export type BallStage = "RED" | "ORANGE" | "GREEN" | "YELLOW";
export type ViewRole = "player" | "coach" | "parent";

interface LanguageConfig {
  stage: BallStage;
  role: ViewRole;
}

const RED_PLAYER_LANGUAGE = {
  skillName: {
    "Forehand Grip": "Holding the racket the right way",
    "Ready Position": "Getting ready to hit",
    "Ball Tracking": "Watching the ball",
    "Side Shuffle": "Moving side to side",
    "Bounce Prediction": "Guessing where the ball goes",
    "Partner Awareness": "Playing nice with friends",
    "Focus Duration": "Staying focused",
    "Error Recovery": "Trying again after a mistake",
    "Toss Accuracy": "Throwing the ball up for serving",
    "Rally Consistency": "Hitting back and forth",
  } as Record<string, string>,
  pillarName: {
    TECHNIQUE: "How I Hit",
    TACTICAL: "Smart Play",
    PHYSICAL: "Moving Around",
    MENTAL: "Brain Power",
    SOCIAL: "Playing With Others",
    MATCH: "Game Time",
  } as Record<string, string>,
  progressLabel: {
    improving: "Getting Better!",
    stable: "Doing Great!",
    declining: "Keep Practicing!",
  } as Record<string, string>,
  levelLabel: {
    RED_3: "Red Ball Starter",
    RED_2: "Red Ball Explorer",
    RED_1: "Red Ball Champion",
  } as Record<string, string>,
};

const ORANGE_PLAYER_LANGUAGE = {
  skillName: {
    "Topspin Forehand": "Spinning the ball forward",
    "Two-Hand Backhand": "Hitting with two hands",
    "Continental Grip": "Special grip for volleys",
    "Recovery Steps": "Getting back to position",
    "Point Construction": "Building up points",
    "Doubles Communication": "Talking with partner",
    "Pressure Management": "Staying calm in tough moments",
    "Match Momentum": "When things are going well",
  } as Record<string, string>,
  pillarName: {
    TECHNIQUE: "Technique",
    TACTICAL: "Tactics",
    PHYSICAL: "Fitness",
    MENTAL: "Mental Game",
    SOCIAL: "Teamwork",
    MATCH: "Match Play",
  } as Record<string, string>,
  progressLabel: {
    improving: "Improving!",
    stable: "Consistent",
    declining: "Needs Work",
  } as Record<string, string>,
  levelLabel: {
    ORANGE_3: "Orange Ball 3",
    ORANGE_2: "Orange Ball 2",
    ORANGE_1: "Orange Ball 1",
  } as Record<string, string>,
};

const GREEN_PLAYER_LANGUAGE = {
  skillName: {} as Record<string, string>,
  pillarName: {
    TECHNIQUE: "Technical Skills",
    TACTICAL: "Tactical Awareness",
    PHYSICAL: "Physical Conditioning",
    MENTAL: "Mental Strength",
    SOCIAL: "Social Skills",
    MATCH: "Competition",
  } as Record<string, string>,
  progressLabel: {
    improving: "Improving",
    stable: "Stable",
    declining: "Declining",
  } as Record<string, string>,
  levelLabel: {
    GREEN_3: "Green Ball 3",
    GREEN_2: "Green Ball 2",
    GREEN_1: "Green Ball Graduate",
  } as Record<string, string>,
};

const YELLOW_PLAYER_LANGUAGE = {
  skillName: {} as Record<string, string>,
  pillarName: {
    TECHNIQUE: "Technical Proficiency",
    TACTICAL: "Tactical Intelligence",
    PHYSICAL: "Athletic Performance",
    MENTAL: "Mental Toughness",
    SOCIAL: "Sportsmanship",
    MATCH: "Match Performance",
  } as Record<string, string>,
  progressLabel: {
    improving: "Trending Up",
    stable: "Maintaining",
    declining: "Trending Down",
  } as Record<string, string>,
  levelLabel: {
    YELLOW_3: "Yellow Ball 3",
    YELLOW_2: "Yellow Ball 2",
    YELLOW_1: "Yellow Ball Elite",
  } as Record<string, string>,
};

const COACH_LANGUAGE = {
  skillName: {} as Record<string, string>,
  pillarName: {
    TECHNIQUE: "Technical",
    TACTICAL: "Tactical",
    PHYSICAL: "Physical",
    MENTAL: "Mental",
    SOCIAL: "Social",
    MATCH: "Match Play",
  } as Record<string, string>,
  progressLabel: {
    improving: "Positive Trend",
    stable: "Consistent Performance",
    declining: "Regression Observed",
  } as Record<string, string>,
  levelLabel: {
    RED_3: "Red 3",
    RED_2: "Red 2",
    RED_1: "Red 1",
    ORANGE_3: "Orange 3",
    ORANGE_2: "Orange 2",
    ORANGE_1: "Orange 1",
    GREEN_3: "Green 3",
    GREEN_2: "Green 2",
    GREEN_1: "Green 1",
    YELLOW_3: "Yellow 3",
    YELLOW_2: "Yellow 2",
    YELLOW_1: "Yellow 1",
  } as Record<string, string>,
};

const PARENT_LANGUAGE = {
  skillName: {} as Record<string, string>,
  pillarName: {
    TECHNIQUE: "How They Hit",
    TACTICAL: "Game Smarts",
    PHYSICAL: "Fitness & Movement",
    MENTAL: "Focus & Confidence",
    SOCIAL: "Playing Well With Others",
    MATCH: "Competition Skills",
  } as Record<string, string>,
  progressLabel: {
    improving: "Making Progress!",
    stable: "Doing Well",
    declining: "May Need Extra Practice",
  } as Record<string, string>,
  levelLabel: {
    RED_3: "Red Ball Beginner",
    RED_2: "Red Ball Intermediate",
    RED_1: "Red Ball Advanced",
    ORANGE_3: "Orange Ball Beginner",
    ORANGE_2: "Orange Ball Intermediate",
    ORANGE_1: "Orange Ball Advanced",
    GREEN_3: "Green Ball Beginner",
    GREEN_2: "Green Ball Intermediate",
    GREEN_1: "Green Ball Graduate",
    YELLOW_3: "Yellow Ball Beginner",
    YELLOW_2: "Yellow Ball Intermediate",
    YELLOW_1: "Yellow Ball Elite",
  } as Record<string, string>,
};

function getPlayerLanguageByStage(stage: BallStage) {
  switch (stage) {
    case "RED":
      return RED_PLAYER_LANGUAGE;
    case "ORANGE":
      return ORANGE_PLAYER_LANGUAGE;
    case "GREEN":
      return GREEN_PLAYER_LANGUAGE;
    case "YELLOW":
      return YELLOW_PLAYER_LANGUAGE;
    default:
      return GREEN_PLAYER_LANGUAGE;
  }
}

function getLanguageConfig(config: LanguageConfig) {
  if (config.role === "coach") {
    return COACH_LANGUAGE;
  }
  if (config.role === "parent") {
    return PARENT_LANGUAGE;
  }
  return getPlayerLanguageByStage(config.stage);
}

export function translateSkillName(
  skillName: string,
  config: LanguageConfig
): string {
  const lang = getLanguageConfig(config);
  return lang.skillName[skillName] || skillName;
}

export function translatePillarName(
  pillar: string,
  config: LanguageConfig
): string {
  const lang = getLanguageConfig(config);
  return lang.pillarName[pillar] || pillar;
}

export function translateProgressLabel(
  progress: "improving" | "stable" | "declining",
  config: LanguageConfig
): string {
  const lang = getLanguageConfig(config);
  return lang.progressLabel[progress] || progress;
}

export function translateLevelLabel(
  levelId: string,
  config: LanguageConfig
): string {
  const lang = getLanguageConfig(config);
  return lang.levelLabel[levelId] || levelId;
}

export function getStageFromLevel(levelId: string): BallStage {
  if (levelId.startsWith("RED")) return "RED";
  if (levelId.startsWith("ORANGE")) return "ORANGE";
  if (levelId.startsWith("GREEN")) return "GREEN";
  if (levelId.startsWith("YELLOW")) return "YELLOW";
  return "GREEN";
}

export function getStageEmoji(stage: BallStage): string {
  switch (stage) {
    case "RED":
      return "";
    case "ORANGE":
      return "";
    case "GREEN":
      return "";
    case "YELLOW":
      return "";
    default:
      return "";
  }
}

export function getStageColor(stage: BallStage): string {
  switch (stage) {
    case "RED":
      return "#EF4444";
    case "ORANGE":
      return "#F97316";
    case "GREEN":
      return "#22C55E";
    case "YELLOW":
      return "#EAB308";
    default:
      return "#22C55E";
  }
}

export function getRankWithinStage(levelId: string): number {
  const parts = levelId.split("_");
  if (parts.length === 2) {
    return parseInt(parts[1], 10) || 1;
  }
  return 1;
}

export function getProgressionPercentage(levelId: string): number {
  const order = [
    "RED_3", "RED_2", "RED_1",
    "ORANGE_3", "ORANGE_2", "ORANGE_1",
    "GREEN_3", "GREEN_2", "GREEN_1",
    "YELLOW_3", "YELLOW_2", "YELLOW_1",
  ];
  const index = order.indexOf(levelId);
  if (index === -1) return 0;
  return Math.round(((index + 1) / order.length) * 100);
}

export const LANGUAGE_TIPS = {
  RED: {
    encouragement: [
      "Great effort today!",
      "You're learning so fast!",
      "Keep having fun!",
      "Amazing practice!",
    ],
    improvement: [
      "Let's try again together!",
      "Practice makes perfect!",
      "You'll get it next time!",
    ],
  },
  ORANGE: {
    encouragement: [
      "Excellent work today!",
      "You're improving fast!",
      "Great focus!",
      "Keep it up!",
    ],
    improvement: [
      "Let's work on this together",
      "Keep practicing, you're getting better",
      "Focus on this in your next session",
    ],
  },
  GREEN: {
    encouragement: [
      "Strong performance!",
      "Good technical development",
      "Solid progress!",
    ],
    improvement: [
      "Continue working on this area",
      "This needs more attention",
      "Focus on consistency here",
    ],
  },
  YELLOW: {
    encouragement: [
      "Excellent execution",
      "High-level performance",
      "Competition ready",
    ],
    improvement: [
      "Fine-tune this aspect",
      "Room for optimization",
      "Elevate this to the next level",
    ],
  },
};
