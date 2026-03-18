import Ionicons from "@expo/vector-icons/Ionicons";

export const PROVIDER_SPECIALIZATIONS = {
  stringing: {
    icon: "construct" as keyof typeof Ionicons.glyphMap,
    label: "Stringer",
    color: "#FF8C00",
    description: "Racket stringing & customization",
    greetingSuffix: "Ready to string some rackets?",
    emptySchedule: "No rackets to string today",
  },
  physio: {
    icon: "medical" as keyof typeof Ionicons.glyphMap,
    label: "Physiotherapist",
    color: "#4A90D9",
    description: "Injury treatment & recovery",
    greetingSuffix: "Ready to get your players moving?",
    emptySchedule: "No physio sessions today",
  },
  massage: {
    icon: "hand-left" as keyof typeof Ionicons.glyphMap,
    label: "Massage Therapist",
    color: "#9B59B6",
    description: "Sports massage & relaxation",
    greetingSuffix: "Ready to help your players recover?",
    emptySchedule: "No massage sessions today",
  },
  fitness: {
    icon: "barbell" as keyof typeof Ionicons.glyphMap,
    label: "S&C Trainer",
    color: "#E74C3C",
    description: "Strength & conditioning",
    greetingSuffix: "Ready to push your players today?",
    emptySchedule: "No training sessions today",
  },
  nutrition: {
    icon: "nutrition" as keyof typeof Ionicons.glyphMap,
    label: "Nutritionist",
    color: "#27AE60",
    description: "Performance nutrition",
    greetingSuffix: "Ready to fuel your players today?",
    emptySchedule: "No nutrition sessions today",
  },
  video_analysis: {
    icon: "videocam" as keyof typeof Ionicons.glyphMap,
    label: "Video Analyst",
    color: "#00BCD4",
    description: "Technique & match analysis",
    greetingSuffix: "Ready to break down some footage?",
    emptySchedule: "No analysis sessions today",
  },
  mental_coach: {
    icon: "bulb" as keyof typeof Ionicons.glyphMap,
    label: "Mental Coach",
    color: "#3F51B5",
    description: "Sports psychology & mindset",
    greetingSuffix: "Ready to sharpen some minds today?",
    emptySchedule: "No mental coaching sessions today",
  },
  biomechanics: {
    icon: "body" as keyof typeof Ionicons.glyphMap,
    label: "Biomechanics Specialist",
    color: "#009688",
    description: "Movement efficiency & injury prevention",
    greetingSuffix: "Ready to optimise some movement today?",
    emptySchedule: "No biomechanics sessions today",
  },
  photography: {
    icon: "camera" as keyof typeof Ionicons.glyphMap,
    label: "Sports Photographer",
    color: "#E91E63",
    description: "Action shots & tournament media",
    greetingSuffix: "Ready to capture some great moments?",
    emptySchedule: "No photography sessions today",
  },
  tournament: {
    icon: "trophy" as keyof typeof Ionicons.glyphMap,
    label: "Tournament Coordinator",
    color: "#FFD700",
    description: "Tournament entries & management",
    greetingSuffix: "Ready to coordinate some great tennis?",
    emptySchedule: "No tournament work today",
  },
  travel: {
    icon: "airplane" as keyof typeof Ionicons.glyphMap,
    label: "Travel Manager",
    color: "#2196F3",
    description: "Logistics & accommodation",
    greetingSuffix: "Ready to plan some great trips?",
    emptySchedule: "No travel work today",
  },
  equipment: {
    icon: "settings" as keyof typeof Ionicons.glyphMap,
    label: "Equipment Specialist",
    color: "#607D8B",
    description: "Demos & customization",
    greetingSuffix: "Ready to help players find their perfect gear?",
    emptySchedule: "No equipment sessions today",
  },
  content: {
    icon: "phone-portrait" as keyof typeof Ionicons.glyphMap,
    label: "Content Creator",
    color: "#8E24AA",
    description: "Reels, highlights & social media",
    greetingSuffix: "Ready to create some amazing content?",
    emptySchedule: "No content creation sessions today",
  },
  recovery: {
    icon: "fitness" as keyof typeof Ionicons.glyphMap,
    label: "Recovery Specialist",
    color: "#00ACC1",
    description: "Ice baths, compression & therapy",
    greetingSuffix: "Ready to supercharge some recovery today?",
    emptySchedule: "No recovery sessions today",
  },
} as const;

export type ProviderSpecialization = keyof typeof PROVIDER_SPECIALIZATIONS;

export function getPrimarySpecialization(specializations: string[]) {
  if (!specializations?.length) return PROVIDER_SPECIALIZATIONS.stringing;
  return (
    PROVIDER_SPECIALIZATIONS[specializations[0] as ProviderSpecialization] ??
    PROVIDER_SPECIALIZATIONS.stringing
  );
}

export const SPECIALIZATION_KEYS = Object.keys(
  PROVIDER_SPECIALIZATIONS
) as ProviderSpecialization[];
