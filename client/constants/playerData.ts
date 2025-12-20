export interface Player {
  id: string;
  name: string;
  avatar: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  totalGlowScore: number;
  diamonds: number;
  coins: number;
  skills: SkillCategory[];
}

export interface SkillCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  score: number;
  maxScore: number;
  color: string;
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  message: string;
  timestamp: Date;
  reactions: MessageReaction[];
  isSystemMessage?: boolean;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export type ChatChannel = "academy" | "squad" | "friends" | "coaches" | "admin";

export const INITIAL_PLAYER: Player = {
  id: "player-1",
  name: "Alex Champion",
  avatar: "player",
  level: 7,
  currentXP: 2450,
  xpToNextLevel: 3000,
  totalGlowScore: 847,
  diamonds: 125,
  coins: 3250,
  skills: [
    {
      id: "tactical",
      name: "Tactical",
      description: "Court strategy and shot selection",
      icon: "target",
      score: 185,
      maxScore: 250,
      color: "#00D4FF",
    },
    {
      id: "mental",
      name: "Mental",
      description: "Focus, confidence and pressure handling",
      icon: "zap",
      score: 162,
      maxScore: 250,
      color: "#FF851B",
    },
    {
      id: "technical",
      name: "Technical",
      description: "Stroke mechanics and ball control",
      icon: "tool",
      score: 198,
      maxScore: 250,
      color: "#2ECC40",
    },
    {
      id: "physical",
      name: "Physical",
      description: "Speed, stamina and strength",
      icon: "activity",
      score: 175,
      maxScore: 250,
      color: "#FFD700",
    },
    {
      id: "social",
      name: "Social",
      description: "Teamwork and sportsmanship",
      icon: "users",
      score: 127,
      maxScore: 250,
      color: "#39FF14",
    },
  ],
};

export const CHAT_CHANNELS: { id: ChatChannel; name: string; icon: string }[] = [
  { id: "academy", name: "Academy", icon: "home" },
  { id: "squad", name: "Squad", icon: "users" },
  { id: "friends", name: "Friends", icon: "heart" },
  { id: "coaches", name: "Coaches", icon: "award" },
  { id: "admin", name: "Admin", icon: "shield" },
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    channel: "academy",
    senderId: "coach-1",
    senderName: "Coach Maria",
    senderAvatar: "coach",
    message: "Great session today! Your backhand is really improving.",
    timestamp: new Date(Date.now() - 3600000),
    reactions: [{ emoji: "fire", count: 3, userReacted: true }],
  },
  {
    id: "msg-2",
    channel: "academy",
    senderId: "system",
    senderName: "System",
    senderAvatar: "system",
    message: "Jake leveled up to Level 12!",
    timestamp: new Date(Date.now() - 1800000),
    reactions: [],
    isSystemMessage: true,
  },
  {
    id: "msg-3",
    channel: "squad",
    senderId: "player-2",
    senderName: "Sarah Tennis",
    senderAvatar: "player",
    message: "Anyone up for doubles practice tomorrow?",
    timestamp: new Date(Date.now() - 900000),
    reactions: [{ emoji: "thumbsup", count: 2, userReacted: false }],
  },
  {
    id: "msg-4",
    channel: "friends",
    senderId: "player-3",
    senderName: "Mike Ace",
    senderAvatar: "player",
    message: "Nice win at the tournament!",
    timestamp: new Date(Date.now() - 600000),
    reactions: [{ emoji: "trophy", count: 1, userReacted: false }],
  },
];

export const DRAWER_ITEMS = [
  { id: "lessons", name: "Lessons", icon: "book-open" },
  { id: "quest", name: "Quest", icon: "compass" },
  { id: "match", name: "Match", icon: "play-circle" },
  { id: "ranking", name: "Ranking", icon: "bar-chart-2" },
  { id: "friends", name: "Friends", icon: "users" },
  { id: "gameLobby", name: "Game Lobby", icon: "grid" },
  { id: "events", name: "Events Calendar", icon: "calendar" },
  { id: "payments", name: "Payments", icon: "credit-card" },
  { id: "settings", name: "Settings", icon: "settings" },
];

export const AVATAR_PRESETS = [
  "player",
  "racket",
  "ball",
  "trophy",
  "star",
  "crown",
  "flame",
  "lightning",
];

export const REACTION_EMOJIS = ["thumbsup", "heart", "fire", "trophy", "star", "zap"];
