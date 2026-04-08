import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes, getPlayerLevelColor, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { PostActionModal } from "@/components/PostActionModal";
import { AnimatedCheck } from "@/components/AnimatedCheck";

interface Player {
  id: string;
  name: string;
  age?: number | null;
  dateOfBirth?: string | null;
  ballLevel?: string | null;
}

interface QuickBaselineDrawerProps {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
  onComplete: () => void;
}

type PillarRating = 0 | 1 | 2 | 3;
type TennisExperience = "0-6m" | "6-18m" | "18m+";
type PlaysCompetition = "never" | "sometimes" | "often";
type ServeAbility = "none" | "basic" | "consistent";

interface LevelSuggestion {
  suggestedLevelId: string;
  suggestedStage: string;
  suggestedRank: number;
  confidenceScore: number;
  age: number;
  isAdult: boolean;
}

const PILLAR_RATING_LABELS: Record<PillarRating, { label: string; color: string }> = {
  0: { label: "Not Yet", color: Colors.dark.textMuted },
  1: { label: "Developing", color: Colors.dark.orange },
  2: { label: "Meets", color: Colors.dark.primary },
  3: { label: "Above", color: Colors.dark.xpCyan },
};

const PILLARS = [
  { id: "technique", name: "Technique", icon: "construct" as keyof typeof Ionicons.glyphMap, color: "#10B981" },
  { id: "tactical", name: "Tactical", icon: "bulb" as keyof typeof Ionicons.glyphMap, color: "#F59E0B" },
  { id: "physical", name: "Physical", icon: "barbell" as keyof typeof Ionicons.glyphMap, color: "#EF4444" },
  { id: "mental", name: "Mental", icon: "brain" as keyof typeof Ionicons.glyphMap, color: "#8B5CF6" },
  { id: "social", name: "Social", icon: "people" as keyof typeof Ionicons.glyphMap, color: "#EC4899" },
  { id: "match", name: "Match", icon: "trophy" as keyof typeof Ionicons.glyphMap, color: "#3B82F6" },
];

const CHILD_BALL_STAGES = ["BLUE", "RED", "ORANGE", "GREEN", "YELLOW"];
const ADULT_BALL_STAGES = ["GLOW"];
const CHILD_LEVEL_RANKS = [3, 2, 1];
const ADULT_LEVEL_RANKS = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const getStagesForPlayer = (isAdult: boolean) => isAdult ? ADULT_BALL_STAGES : CHILD_BALL_STAGES;
const getRanksForStage = (stage: string) => stage === "GLOW" ? ADULT_LEVEL_RANKS : CHILD_LEVEL_RANKS;

const OVERRIDE_REASONS = [
  { value: "player_clearly_advanced", label: "Player clearly advanced" },
  { value: "late_starter_athletic", label: "Late starter, athletic" },
  { value: "other_academy", label: "Came from another academy" },
  { value: "competition_experience", label: "Competition experience" },
  { value: "age_mismatch", label: "Age doesn't match ability" },
];

// Deep Baseline Skill Definitions
// minLevel: minimum ball stage where this skill appears (BLUE=0, RED=1, ORANGE=2, GREEN=3, YELLOW=4, GLOW=5)
const STAGE_ORDER = ["BLUE", "RED", "ORANGE", "GREEN", "YELLOW", "GLOW"];
const getStageIndex = (stage: string | undefined | null) => {
  if (!stage) return 1; // Default to RED level if no stage
  return STAGE_ORDER.indexOf(stage.toUpperCase());
};

interface SkillDef {
  id: string;
  name: string;
  minLevel: number; // 0=BLUE, 1=RED, 2=ORANGE, 3=GREEN, 4=YELLOW, 5=GLOW
}

interface SkillCategory {
  id: string;
  name: string;
  skills: SkillDef[];
}

interface PillarSection {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  categories: SkillCategory[];
}

const DEEP_BASELINE_STRUCTURE: PillarSection[] = [
  {
    id: "technique",
    name: "Technique",
    icon: "tennisball",
    color: "#10B981",
    categories: [
      {
        id: "forehand",
        name: "Forehand",
        skills: [
          { id: "fh_contact", name: "Contact consistency", minLevel: 0 },
          { id: "fh_direction", name: "Direction control", minLevel: 1 },
          { id: "fh_height", name: "Height / net clearance", minLevel: 1 },
          { id: "fh_topspin", name: "Topspin ability", minLevel: 2 },
          { id: "fh_power", name: "Power generation", minLevel: 2 },
          { id: "fh_slice", name: "Slice forehand", minLevel: 3 },
          { id: "fh_inside_out", name: "Inside-out forehand", minLevel: 3 },
          { id: "fh_recovery", name: "Recovery after shot", minLevel: 2 },
          { id: "fh_depth", name: "Depth control", minLevel: 3 },
          { id: "fh_angles", name: "Angle creation", minLevel: 4 },
        ],
      },
      {
        id: "backhand",
        name: "Backhand",
        skills: [
          { id: "bh_type", name: "Type (1HBH / 2HBH)", minLevel: 1 },
          { id: "bh_timing", name: "Contact timing", minLevel: 1 },
          { id: "bh_direction", name: "Direction control", minLevel: 2 },
          { id: "bh_topspin", name: "Topspin ability", minLevel: 2 },
          { id: "bh_power", name: "Power generation", minLevel: 3 },
          { id: "bh_slice", name: "Slice backhand", minLevel: 2 },
          { id: "bh_rally", name: "Rally tolerance", minLevel: 2 },
          { id: "bh_depth", name: "Depth control", minLevel: 3 },
          { id: "bh_down_line", name: "Down the line", minLevel: 3 },
          { id: "bh_angles", name: "Angle creation", minLevel: 4 },
        ],
      },
      {
        id: "serve",
        name: "Serve",
        skills: [
          { id: "sv_toss", name: "Toss consistency", minLevel: 1 },
          { id: "sv_contact", name: "Contact point", minLevel: 1 },
          { id: "sv_first", name: "1st serve in %", minLevel: 2 },
          { id: "sv_power", name: "Power / pace", minLevel: 2 },
          { id: "sv_flat", name: "Flat serve", minLevel: 2 },
          { id: "sv_slice", name: "Slice serve", minLevel: 3 },
          { id: "sv_kick", name: "Kick/topspin serve", minLevel: 4 },
          { id: "sv_second", name: "2nd serve safety", minLevel: 3 },
          { id: "sv_second_spin", name: "2nd serve spin", minLevel: 4 },
          { id: "sv_targets_wide", name: "Target: Wide", minLevel: 3 },
          { id: "sv_targets_body", name: "Target: Body", minLevel: 3 },
          { id: "sv_targets_t", name: "Target: T", minLevel: 3 },
          { id: "sv_plus_one", name: "Serve +1 pattern", minLevel: 4 },
        ],
      },
      {
        id: "return",
        name: "Return",
        skills: [
          { id: "rt_ready", name: "Ready position", minLevel: 2 },
          { id: "rt_split", name: "Split step timing", minLevel: 2 },
          { id: "rt_block", name: "Block return", minLevel: 2 },
          { id: "rt_drive", name: "Drive return", minLevel: 3 },
          { id: "rt_slice", name: "Slice return", minLevel: 3 },
          { id: "rt_aggressive", name: "Aggressive return", minLevel: 4 },
          { id: "rt_rally", name: "Can start rally", minLevel: 3 },
          { id: "rt_depth", name: "Return depth", minLevel: 4 },
        ],
      },
      {
        id: "volley",
        name: "Volley",
        skills: [
          { id: "vl_split", name: "Split step timing", minLevel: 2 },
          { id: "vl_punch_fh", name: "FH volley punch", minLevel: 2 },
          { id: "vl_punch_bh", name: "BH volley punch", minLevel: 2 },
          { id: "vl_low", name: "Low volley", minLevel: 3 },
          { id: "vl_high", name: "High volley", minLevel: 3 },
          { id: "vl_swing", name: "Swing volley", minLevel: 4 },
          { id: "vl_drop", name: "Drop volley / touch", minLevel: 4 },
          { id: "vl_position", name: "Net positioning", minLevel: 3 },
          { id: "vl_reflexes", name: "Reflex volleys", minLevel: 4 },
        ],
      },
      {
        id: "overhead",
        name: "Overhead / Smash",
        skills: [
          { id: "oh_footwork", name: "Footwork to ball", minLevel: 3 },
          { id: "oh_contact", name: "Contact above head", minLevel: 3 },
          { id: "oh_power", name: "Smash power", minLevel: 3 },
          { id: "oh_placement", name: "Smash placement", minLevel: 4 },
          { id: "oh_jumping", name: "Jumping smash", minLevel: 4 },
          { id: "oh_backhand", name: "Backhand overhead", minLevel: 5 },
        ],
      },
      {
        id: "specialty",
        name: "Specialty Shots",
        skills: [
          { id: "sp_drop_fh", name: "Drop shot (FH)", minLevel: 3 },
          { id: "sp_drop_bh", name: "Drop shot (BH)", minLevel: 3 },
          { id: "sp_lob_def", name: "Defensive lob", minLevel: 2 },
          { id: "sp_lob_off", name: "Offensive lob", minLevel: 4 },
          { id: "sp_approach", name: "Approach shot", minLevel: 3 },
          { id: "sp_passing", name: "Passing shot", minLevel: 3 },
          { id: "sp_half_volley", name: "Half volley", minLevel: 4 },
          { id: "sp_tweener", name: "Tweener / trick shots", minLevel: 5 },
        ],
      },
    ],
  },
  {
    id: "movement",
    name: "Movement",
    icon: "footsteps",
    color: "#EF4444",
    categories: [
      {
        id: "footwork",
        name: "Footwork Basics",
        skills: [
          { id: "mv_split", name: "Split step habit", minLevel: 1 },
          { id: "mv_first", name: "First step explosiveness", minLevel: 1 },
          { id: "mv_shuffle", name: "Side shuffle technique", minLevel: 1 },
          { id: "mv_crossover", name: "Crossover steps", minLevel: 2 },
          { id: "mv_adjust", name: "Adjustment steps", minLevel: 2 },
          { id: "mv_wide_ball", name: "Wide ball recovery", minLevel: 2 },
        ],
      },
      {
        id: "court_movement",
        name: "Court Movement",
        skills: [
          { id: "mv_recovery", name: "Recovery to center", minLevel: 2 },
          { id: "mv_anticipation", name: "Anticipation / reading", minLevel: 3 },
          { id: "mv_forward", name: "Forward movement", minLevel: 2 },
          { id: "mv_backward", name: "Backward movement", minLevel: 2 },
          { id: "mv_transition", name: "Baseline to net transition", minLevel: 3 },
          { id: "mv_defense", name: "Defensive scrambling", minLevel: 3 },
        ],
      },
      {
        id: "physical",
        name: "Physical Attributes",
        skills: [
          { id: "mv_balance", name: "Balance / stability", minLevel: 1 },
          { id: "mv_agility", name: "Agility / change of direction", minLevel: 2 },
          { id: "mv_speed", name: "Court speed", minLevel: 2 },
          { id: "mv_endurance", name: "Endurance / stamina", minLevel: 2 },
          { id: "mv_strength", name: "Strength for level", minLevel: 3 },
          { id: "mv_flexibility", name: "Flexibility / mobility", minLevel: 2 },
        ],
      },
    ],
  },
  {
    id: "tactical",
    name: "Tactical",
    icon: "bulb",
    color: "#F59E0B",
    categories: [
      {
        id: "basic_tactics",
        name: "Basic Tactics",
        skills: [
          { id: "tc_rally", name: "Understands rally vs point", minLevel: 1 },
          { id: "tc_cross", name: "Cross-court consistency", minLevel: 2 },
          { id: "tc_down_line", name: "Down the line timing", minLevel: 3 },
          { id: "tc_depth", name: "Uses depth", minLevel: 2 },
          { id: "tc_height", name: "Uses height variation", minLevel: 3 },
          { id: "tc_pace", name: "Pace variation", minLevel: 3 },
        ],
      },
      {
        id: "pattern_play",
        name: "Pattern Play",
        skills: [
          { id: "tc_short", name: "Recognizes short ball", minLevel: 3 },
          { id: "tc_approach", name: "Approach patterns", minLevel: 3 },
          { id: "tc_build", name: "Point construction", minLevel: 4 },
          { id: "tc_serve_pattern", name: "Serve patterns", minLevel: 4 },
          { id: "tc_return_pattern", name: "Return patterns", minLevel: 4 },
          { id: "tc_finish", name: "Point finishing", minLevel: 4 },
        ],
      },
      {
        id: "game_awareness",
        name: "Game Awareness",
        skills: [
          { id: "tc_opponent", name: "Reading opponent", minLevel: 3 },
          { id: "tc_weakness", name: "Exploiting weaknesses", minLevel: 4 },
          { id: "tc_adjustment", name: "In-match adjustments", minLevel: 4 },
          { id: "tc_score", name: "Score awareness", minLevel: 3 },
          { id: "tc_big_points", name: "Big point play", minLevel: 4 },
          { id: "tc_gameplan", name: "Follows game plan", minLevel: 4 },
        ],
      },
    ],
  },
  {
    id: "mental",
    name: "Mental",
    icon: "fitness",
    color: "#8B5CF6",
    categories: [
      {
        id: "focus",
        name: "Focus & Concentration",
        skills: [
          { id: "mn_focus", name: "Focus duration", minLevel: 0 },
          { id: "mn_distraction", name: "Handling distractions", minLevel: 2 },
          { id: "mn_present", name: "Staying present", minLevel: 3 },
          { id: "mn_routine", name: "Between-point routine", minLevel: 3 },
          { id: "mn_reset", name: "Reset ability", minLevel: 3 },
        ],
      },
      {
        id: "emotions",
        name: "Emotional Control",
        skills: [
          { id: "mn_mistakes", name: "Response to mistakes", minLevel: 1 },
          { id: "mn_frustration", name: "Frustration management", minLevel: 2 },
          { id: "mn_anger", name: "Anger control", minLevel: 2 },
          { id: "mn_pressure", name: "Pressure handling", minLevel: 3 },
          { id: "mn_nerves", name: "Nerve control", minLevel: 3 },
          { id: "mn_composure", name: "Composure under adversity", minLevel: 4 },
        ],
      },
      {
        id: "mindset",
        name: "Mindset & Attitude",
        skills: [
          { id: "mn_coach", name: "Coachability", minLevel: 0 },
          { id: "mn_confidence", name: "Self-confidence", minLevel: 2 },
          { id: "mn_effort", name: "Effort / fight", minLevel: 1 },
          { id: "mn_body", name: "Body language", minLevel: 2 },
          { id: "mn_compete", name: "Competitive drive", minLevel: 2 },
          { id: "mn_growth", name: "Growth mindset", minLevel: 2 },
          { id: "mn_risk", name: "Risk tolerance", minLevel: 3 },
        ],
      },
    ],
  },
  {
    id: "social",
    name: "Social",
    icon: "people",
    color: "#EC4899",
    categories: [
      {
        id: "behavior",
        name: "Court Behavior",
        skills: [
          { id: "sc_turn", name: "Waits turn patiently", minLevel: 0 },
          { id: "sc_respect", name: "Respects coach/others", minLevel: 0 },
          { id: "sc_equipment", name: "Equipment responsibility", minLevel: 0 },
          { id: "sc_sportsmanship", name: "Sportsmanship", minLevel: 1 },
          { id: "sc_line_calls", name: "Honest line calls", minLevel: 2 },
        ],
      },
      {
        id: "interaction",
        name: "Social Interaction",
        skills: [
          { id: "sc_group", name: "Works well in group", minLevel: 0 },
          { id: "sc_comm", name: "Communication skills", minLevel: 1 },
          { id: "sc_partner", name: "Doubles partner skills", minLevel: 3 },
          { id: "sc_encourages", name: "Encourages others", minLevel: 2 },
          { id: "sc_conflict", name: "Conflict resolution", minLevel: 2 },
        ],
      },
      {
        id: "relationships",
        name: "Relationships",
        skills: [
          { id: "sc_coach_rel", name: "Coach relationship", minLevel: 0 },
          { id: "sc_peer_rel", name: "Peer relationships", minLevel: 1 },
          { id: "sc_parent", name: "Parent interaction (if minor)", minLevel: 0 },
          { id: "sc_independence", name: "Age-appropriate independence", minLevel: 2 },
        ],
      },
    ],
  },
  {
    id: "match",
    name: "Match",
    icon: "trophy",
    color: "#3B82F6",
    categories: [
      {
        id: "match_basics",
        name: "Match Basics",
        skills: [
          { id: "mt_rules", name: "Knows rules / scoring", minLevel: 1 },
          { id: "mt_serve_receive", name: "Serve/receive sides", minLevel: 1 },
          { id: "mt_changeover", name: "Changeover routine", minLevel: 2 },
          { id: "mt_warmup", name: "Match warmup", minLevel: 2 },
        ],
      },
      {
        id: "match_performance",
        name: "Match Performance",
        skills: [
          { id: "mt_start", name: "Can start points correctly", minLevel: 1 },
          { id: "mt_rally", name: "Rally under pressure", minLevel: 2 },
          { id: "mt_apply", name: "Applies training in matches", minLevel: 3 },
          { id: "mt_serve_hold", name: "Service game strength", minLevel: 3 },
          { id: "mt_break", name: "Break point conversion", minLevel: 4 },
          { id: "mt_close", name: "Closing out sets/matches", minLevel: 4 },
        ],
      },
      {
        id: "competition",
        name: "Competition Readiness",
        skills: [
          { id: "mt_ready", name: "Tournament ready", minLevel: 2 },
          { id: "mt_experience", name: "Match experience level", minLevel: 2 },
          { id: "mt_recovery", name: "Between-match recovery", minLevel: 3 },
          { id: "mt_consistency", name: "Performance consistency", minLevel: 3 },
          { id: "mt_big_match", name: "Big match performance", minLevel: 4 },
        ],
      },
    ],
  },
];

interface DeepSkillScore {
  rating: number | null; // 0-3, null = not observed
  notObserved: boolean;
  notes: string;
}

export default function QuickBaselineDrawer({
  visible,
  player,
  onClose,
  onComplete,
}: QuickBaselineDrawerProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();
  const [step, setStep] = useState<"intake" | "pillars" | "deep" | "confirm">("intake");
  
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showPostActionModal, setShowPostActionModal] = useState(false);
  
  const [tennisExperience, setTennisExperience] = useState<TennisExperience>("0-6m");
  const [playsCompetition, setPlaysCompetition] = useState<PlaysCompetition>("never");
  const [canRallyFive, setCanRallyFive] = useState(false);
  const [serveAbility, setServeAbility] = useState<ServeAbility>("none");
  
  const [pillarRatings, setPillarRatings] = useState<Record<string, PillarRating>>({
    technique: 1,
    tactical: 1,
    physical: 1,
    mental: 1,
    social: 1,
    match: 0,
  });
  
  const [suggestion, setSuggestion] = useState<LevelSuggestion | null>(null);
  const [confirmedLevel, setConfirmedLevel] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  
  // Deep Baseline state
  const [deepSkillScores, setDeepSkillScores] = useState<Record<string, DeepSkillScore>>({});
  const [expandedPillars, setExpandedPillars] = useState<Record<string, boolean>>({
    technique: true, // Start with technique expanded
  });
  
  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (!player) throw new Error("No player");
      return apiRequest("POST", `/api/players/${player.id}/baseline/suggest-level`, {
        tennisExperience,
        playsCompetition,
        canRallyFive,
        serveAbility,
      });
    },
    onSuccess: (data) => {
      setSuggestion(data);
      setConfirmedLevel(data.suggestedLevelId);
    },
  });
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!player || !suggestion) throw new Error("Missing data");
      return apiRequest("POST", `/api/players/${player.id}/baseline`, {
        suggestedLevelId: suggestion.suggestedLevelId,
        confirmedLevelId: confirmedLevel,
        confidenceScore: suggestion.confidenceScore,
        tennisExperience,
        playsCompetition,
        canRallyFive,
        serveAbility,
        techniqueRating: pillarRatings.technique,
        tacticalRating: pillarRatings.tactical,
        physicalRating: pillarRatings.physical,
        mentalRating: pillarRatings.mental,
        socialRating: pillarRatings.social,
        matchRating: pillarRatings.match,
        overrideReason: confirmedLevel !== suggestion.suggestedLevelId ? overrideReason : null,
        overrideNote: confirmedLevel !== suggestion.suggestedLevelId ? overrideNote : null,
        deepSkillScores, // Send deep baseline skill scores
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/baseline-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players", player?.id, "baseline"] });
      
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setShowPostActionModal(true);
      }, 300);
    },
  });
  
  useEffect(() => {
    if (visible && player) {
      setStep("intake");
      setTennisExperience("0-6m");
      setPlaysCompetition("never");
      setCanRallyFive(false);
      setServeAbility("none");
      setPillarRatings({
        technique: 1,
        tactical: 1,
        physical: 1,
        mental: 1,
        social: 1,
        match: 0,
      });
      setSuggestion(null);
      setConfirmedLevel(null);
      setOverrideReason(null);
      setOverrideNote("");
      setDeepSkillScores({});
      setExpandedPillars({ technique: true });
      setShowSuccessAnimation(false);
      setShowPostActionModal(false);
    }
  }, [visible, player?.id]);
  
  // Initialize smart defaults when suggestion is received
  useEffect(() => {
    if (suggestion?.suggestedStage) {
      const stageIndex = getStageIndex(suggestion.suggestedStage);
      const defaults: Record<string, DeepSkillScore> = {};
      
      DEEP_BASELINE_STRUCTURE.forEach(pillar => {
        pillar.categories.forEach(category => {
          category.skills.forEach(skill => {
            if (skill.minLevel <= stageIndex) {
              // Smart default: if skill is expected for this level, default to "Developing" (1)
              // If skill is below their level, default to "Meets" (2)
              const defaultRating = skill.minLevel < stageIndex ? 2 : 1;
              defaults[skill.id] = { rating: defaultRating, notObserved: false, notes: "" };
            }
          });
        });
      });
      
      setDeepSkillScores(defaults);
    }
  }, [suggestion?.suggestedStage]);
  
  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === "intake") {
      suggestMutation.mutate();
      setStep("pillars");
    } else if (step === "pillars") {
      setStep("deep");
    } else if (step === "deep") {
      setStep("confirm");
    }
  };
  
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === "pillars") {
      setStep("intake");
    } else if (step === "deep") {
      setStep("pillars");
    } else if (step === "confirm") {
      setStep("deep");
    }
  };
  
  const togglePillarExpanded = (pillarId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedPillars(prev => ({ ...prev, [pillarId]: !prev[pillarId] }));
  };
  
  const setSkillRating = (skillId: string, rating: number | null) => {
    Haptics.selectionAsync();
    setDeepSkillScores(prev => ({
      ...prev,
      [skillId]: { ...prev[skillId], rating, notObserved: rating === null },
    }));
  };
  
  const setSkillNote = (skillId: string, notes: string) => {
    setDeepSkillScores(prev => ({
      ...prev,
      [skillId]: { ...prev[skillId], notes },
    }));
  };
  
  const toggleNotObserved = (skillId: string) => {
    Haptics.selectionAsync();
    setDeepSkillScores(prev => {
      const current = prev[skillId] || { rating: null, notObserved: false, notes: "" };
      return {
        ...prev,
        [skillId]: { ...current, notObserved: !current.notObserved, rating: !current.notObserved ? null : current.rating },
      };
    });
  };
  
  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    saveMutation.mutate();
  };
  
  const renderIntakeStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Quick Intake Questions</Text>
      <Text style={styles.stepSubtitle}>
        Answer a few questions to help suggest the right starting level
      </Text>
      
      <View style={styles.questionGroup}>
        <Text style={styles.questionLabel}>Tennis Experience</Text>
        <View style={styles.optionRow}>
          {(["0-6m", "6-18m", "18m+"] as TennisExperience[]).map((opt) => (
            <Pressable
              key={opt}
              style={[
                styles.optionButton,
                tennisExperience === opt && styles.optionButtonActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setTennisExperience(opt);
              }}
            >
              <Text style={[
                styles.optionText,
                tennisExperience === opt && styles.optionTextActive,
              ]}>
                {opt === "0-6m" ? "< 6 months" : opt === "6-18m" ? "6-18 months" : "18+ months"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      
      <View style={styles.questionGroup}>
        <Text style={styles.questionLabel}>Plays Competition</Text>
        <View style={styles.optionRow}>
          {(["never", "sometimes", "often"] as PlaysCompetition[]).map((opt) => (
            <Pressable
              key={opt}
              style={[
                styles.optionButton,
                playsCompetition === opt && styles.optionButtonActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPlaysCompetition(opt);
              }}
            >
              <Text style={[
                styles.optionText,
                playsCompetition === opt && styles.optionTextActive,
              ]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      
      <View style={styles.questionGroup}>
        <Text style={styles.questionLabel}>Can Rally 5+ Balls</Text>
        <View style={styles.optionRow}>
          <Pressable
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              canRallyFive && styles.optionButtonActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setCanRallyFive(true);
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={canRallyFive ? Colors.dark.primary : Colors.dark.textMuted}
            />
            <Text style={[
              styles.optionText,
              canRallyFive && styles.optionTextActive,
            ]}>
              Yes
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.optionButton,
              styles.optionButtonWide,
              !canRallyFive && styles.optionButtonActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setCanRallyFive(false);
            }}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={!canRallyFive ? Colors.dark.error : Colors.dark.textMuted}
            />
            <Text style={[
              styles.optionText,
              !canRallyFive && styles.optionTextActive,
            ]}>
              Not Yet
            </Text>
          </Pressable>
        </View>
      </View>
      
      <View style={styles.questionGroup}>
        <Text style={styles.questionLabel}>Serve Ability</Text>
        <View style={styles.optionRow}>
          {(["none", "basic", "consistent"] as ServeAbility[]).map((opt) => (
            <Pressable
              key={opt}
              style={[
                styles.optionButton,
                serveAbility === opt && styles.optionButtonActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setServeAbility(opt);
              }}
            >
              <Text style={[
                styles.optionText,
                serveAbility === opt && styles.optionTextActive,
              ]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
  
  const renderPillarsStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Quick Pillar Assessment</Text>
      <Text style={styles.stepSubtitle}>
        Rate each pillar based on your first impression
      </Text>
      
      {PILLARS.map((pillar) => (
        <View key={pillar.id} style={styles.pillarRow}>
          <View style={styles.pillarHeader}>
            <View style={[styles.pillarIcon, { backgroundColor: pillar.color + "20" }]}>
              <Ionicons name={pillar.icon} size={18} color={pillar.color} />
            </View>
            <Text style={styles.pillarName}>{pillar.name}</Text>
          </View>
          <View style={styles.ratingButtons}>
            {([0, 1, 2, 3] as PillarRating[]).map((rating) => (
              <Pressable
                key={rating}
                style={[
                  styles.ratingButton,
                  pillarRatings[pillar.id] === rating && {
                    backgroundColor: PILLAR_RATING_LABELS[rating].color + "30",
                    borderColor: PILLAR_RATING_LABELS[rating].color,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPillarRatings((prev) => ({ ...prev, [pillar.id]: rating }));
                }}
              >
                <Text style={[
                  styles.ratingButtonText,
                  pillarRatings[pillar.id] === rating && {
                    color: PILLAR_RATING_LABELS[rating].color,
                  },
                ]}>
                  {rating}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      
      <View style={styles.legendContainer}>
        {([0, 1, 2, 3] as PillarRating[]).map((rating) => (
          <View key={rating} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PILLAR_RATING_LABELS[rating].color }]} />
            <Text style={styles.legendText}>
              {rating} = {PILLAR_RATING_LABELS[rating].label}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
  
  const renderDeepBaselineStep = () => {
    const stageIndex = suggestion ? getStageIndex(suggestion.suggestedStage) : 1;
    
    // Count skills assessed vs total
    const getAssessmentProgress = () => {
      let total = 0;
      let assessed = 0;
      DEEP_BASELINE_STRUCTURE.forEach(pillar => {
        pillar.categories.forEach(category => {
          category.skills.forEach(skill => {
            if (skill.minLevel <= stageIndex) {
              total++;
              const score = deepSkillScores[skill.id];
              if (score?.rating !== undefined || score?.notObserved) {
                assessed++;
              }
            }
          });
        });
      });
      return { total, assessed };
    };
    
    const progress = getAssessmentProgress();
    
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Deep Skill Assessment</Text>
        <Text style={styles.stepSubtitle}>
          Rate each skill - skills are pre-filled based on suggested level
        </Text>
        
        <View style={styles.deepProgressRow}>
          <View style={styles.deepProgressBar}>
            <View style={[styles.deepProgressFill, { width: `${(progress.assessed / progress.total) * 100}%` }]} />
          </View>
          <Text style={styles.deepProgressText}>{progress.assessed}/{progress.total} skills</Text>
        </View>
        
        {DEEP_BASELINE_STRUCTURE.map((pillar) => {
          const isExpanded = expandedPillars[pillar.id] || false;
          const visibleCategories = pillar.categories.filter(cat => 
            cat.skills.some(skill => skill.minLevel <= stageIndex)
          );
          
          if (visibleCategories.length === 0) return null;
          
          // Count pillar progress
          let pillarTotal = 0;
          let pillarAssessed = 0;
          visibleCategories.forEach(cat => {
            cat.skills.forEach(skill => {
              if (skill.minLevel <= stageIndex) {
                pillarTotal++;
                const score = deepSkillScores[skill.id];
                if (score?.rating !== undefined || score?.notObserved) {
                  pillarAssessed++;
                }
              }
            });
          });
          
          return (
            <View key={pillar.id} style={styles.deepPillarSection}>
              <Pressable 
                style={styles.deepPillarHeader}
                onPress={() => togglePillarExpanded(pillar.id)}
              >
                <View style={[styles.deepPillarIcon, { backgroundColor: pillar.color + "20" }]}>
                  <Ionicons name={pillar.icon} size={20} color={pillar.color} />
                </View>
                <View style={styles.deepPillarInfo}>
                  <Text style={styles.deepPillarName}>{pillar.name}</Text>
                  <Text style={styles.deepPillarCount}>{pillarAssessed}/{pillarTotal} assessed</Text>
                </View>
                <Ionicons 
                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color={Colors.dark.textMuted} 
                />
              </Pressable>
              
              {isExpanded && (
                <View style={styles.deepPillarContent}>
                  {visibleCategories.map((category) => (
                    <View key={category.id} style={styles.deepCategory}>
                      <Text style={styles.deepCategoryName}>{category.name}</Text>
                      
                      {category.skills
                        .filter(skill => skill.minLevel <= stageIndex)
                        .map((skill) => {
                          const score = deepSkillScores[skill.id] || { rating: null, notObserved: false, notes: "" };
                          
                          return (
                            <View key={skill.id} style={styles.deepSkillRow}>
                              <View style={styles.deepSkillInfo}>
                                <Text style={[
                                  styles.deepSkillName,
                                  score.notObserved && styles.deepSkillNameMuted,
                                ]}>
                                  {skill.name}
                                </Text>
                              </View>
                              
                              <View style={styles.deepSkillActions}>
                                {/* Rating buttons */}
                                {!score.notObserved && (
                                  <View style={styles.deepRatingRow}>
                                    {([0, 1, 2, 3] as const).map((rating) => (
                                      <Pressable
                                        key={rating}
                                        style={[
                                          styles.deepRatingBtn,
                                          score.rating === rating && {
                                            backgroundColor: PILLAR_RATING_LABELS[rating].color + "30",
                                            borderColor: PILLAR_RATING_LABELS[rating].color,
                                          },
                                        ]}
                                        onPress={() => setSkillRating(skill.id, rating)}
                                      >
                                        <Text style={[
                                          styles.deepRatingText,
                                          score.rating === rating && { color: PILLAR_RATING_LABELS[rating].color },
                                        ]}>
                                          {rating}
                                        </Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                )}
                                
                                {/* Not Observed toggle */}
                                <Pressable
                                  style={[
                                    styles.notObservedBtn,
                                    score.notObserved && styles.notObservedBtnActive,
                                  ]}
                                  onPress={() => toggleNotObserved(skill.id)}
                                >
                                  <Ionicons 
                                    name={score.notObserved ? "eye-off" : "eye-off-outline"} 
                                    size={14} 
                                    color={score.notObserved ? Colors.dark.textMuted : Colors.dark.textMuted + "80"} 
                                  />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        
        <View style={styles.deepLegend}>
          <Text style={styles.deepLegendTitle}>Rating Legend</Text>
          <View style={styles.deepLegendRow}>
            {([0, 1, 2, 3] as const).map((rating) => (
              <View key={rating} style={styles.deepLegendItem}>
                <View style={[styles.deepLegendDot, { backgroundColor: PILLAR_RATING_LABELS[rating].color }]} />
                <Text style={styles.deepLegendText}>{PILLAR_RATING_LABELS[rating].label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  };
  
  const renderConfirmStep = () => {
    const isOverride = confirmedLevel && suggestion && confirmedLevel !== suggestion.suggestedLevelId;
    
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>Confirm Starting Level</Text>
        
        {suggestion && (
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="sparkles" size={20} color={Colors.dark.xpCyan} />
              <Text style={styles.suggestionLabel}>AI Suggested Level</Text>
            </View>
            <View style={styles.suggestionLevel}>
              <Text style={[
                styles.suggestionLevelText,
                { color: getPlayerLevelColor((suggestion.suggestedStage || "red").toLowerCase()) },
              ]}>
                {suggestion.suggestedStage || "RED"} {suggestion.suggestedRank || 3}
              </Text>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceText}>
                  {suggestion.confidenceScore}% confidence
                </Text>
              </View>
            </View>
            <Text style={styles.ageNote}>
              Based on age {suggestion.age} and intake answers
            </Text>
          </View>
        )}
        
        <Text style={styles.selectLabel}>Select Starting Level</Text>
        <View style={styles.levelGrid}>
          {getStagesForPlayer(suggestion?.isAdult || false).map((stage) => (
            <View key={stage} style={styles.stageColumn}>
              <View style={[
                styles.stageBadge,
                { backgroundColor: getPlayerLevelColor(stage.toLowerCase()) + "20" },
              ]}>
                <Text style={[
                  styles.stageBadgeText,
                  { color: getPlayerLevelColor(stage.toLowerCase()) },
                ]}>
                  {stage}
                </Text>
              </View>
              {getRanksForStage(stage).map((rank) => {
                const levelId = `${stage}_${rank}`;
                const isSelected = confirmedLevel === levelId;
                const isSuggested = suggestion?.suggestedLevelId === levelId;
                return (
                  <Pressable
                    key={levelId}
                    style={[
                      styles.levelButton,
                      isSelected && {
                        backgroundColor: getPlayerLevelColor(stage.toLowerCase()) + "30",
                        borderColor: getPlayerLevelColor(stage.toLowerCase()),
                      },
                      isSuggested && !isSelected && styles.levelButtonSuggested,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setConfirmedLevel(levelId);
                    }}
                  >
                    <Text style={[
                      styles.levelButtonText,
                      isSelected && { color: getPlayerLevelColor(stage.toLowerCase()) },
                    ]}>
                      {stage.charAt(0)}{rank}
                    </Text>
                    {isSuggested && (
                      <Ionicons
                        name="sparkles"
                        size={12}
                        color={Colors.dark.xpCyan}
                        style={styles.suggestedIcon}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        
        {isOverride && (
          <View style={styles.overrideSection}>
            <Text style={styles.overrideLabel}>Override Reason</Text>
            <View style={styles.overrideOptions}>
              {OVERRIDE_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[
                    styles.overrideOption,
                    overrideReason === reason.value && styles.overrideOptionActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setOverrideReason(reason.value);
                  }}
                >
                  <Text style={[
                    styles.overrideOptionText,
                    overrideReason === reason.value && styles.overrideOptionTextActive,
                  ]}>
                    {reason.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.overrideNoteInput}
              placeholder="Additional notes (optional)"
              placeholderTextColor={Colors.dark.textMuted}
              value={overrideNote}
              onChangeText={setOverrideNote}
              multiline
            />
          </View>
        )}
      </ScrollView>
    );
  };
  
  if (!player) return null;
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient
          colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Start Baseline</Text>
            <Text style={styles.headerSubtitle}>{player.name}</Text>
          </View>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>
              {step === "intake" ? "1" : step === "pillars" ? "2" : step === "deep" ? "3" : "4"} / 4
            </Text>
          </View>
        </View>
        
        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            { width: step === "intake" ? "25%" : step === "pillars" ? "50%" : step === "deep" ? "75%" : "100%" },
          ]} />
        </View>
        
        {step === "intake" && renderIntakeStep()}
        {step === "pillars" && renderPillarsStep()}
        {step === "deep" && renderDeepBaselineStep()}
        {step === "confirm" && renderConfirmStep()}
        
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {step !== "intake" && (
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}
          
          {step !== "confirm" ? (
            <Pressable
              style={[styles.nextButton, suggestMutation.isPending && styles.buttonDisabled]}
              onPress={handleNext}
              disabled={suggestMutation.isPending}
            >
              {suggestMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Next</Text>
                  <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.saveButton,
                (saveMutation.isPending || (!confirmedLevel)) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={saveMutation.isPending || !confirmedLevel}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
                  <Text style={styles.saveButtonText}>Confirm Baseline</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
        
        {showSuccessAnimation && (
          <View style={styles.successOverlay}>
            <AnimatedCheck size={80} variant="glow" />
          </View>
        )}
      </View>
      
      <PostActionModal
        visible={showPostActionModal}
        onClose={() => {
          setShowPostActionModal(false);
          onComplete();
        }}
        icon="checkmark-circle"
        title="Baseline Saved"
        subtitle={player?.name}
        message="Starting level has been set successfully."
        actions={[
          {
            id: "view-profile",
            label: "View Player Profile",
            icon: "person",
            variant: "primary",
            onPress: () => {
              setShowPostActionModal(false);
              onClose();
              if (player?.id) {
                navigation.navigate("PlayerProfile", { playerId: player.id });
              }
            },
          },
          {
            id: "another-baseline",
            label: "Start Another Baseline",
            icon: "add-circle",
            variant: "secondary",
            onPress: () => {
              setShowPostActionModal(false);
              onComplete();
            },
          },
          {
            id: "back-dashboard",
            label: "Back to Dashboard",
            icon: "home",
            variant: "ghost",
            onPress: () => {
              setShowPostActionModal(false);
              onClose();
            },
          },
        ]}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  stepIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.primary,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  stepTitle: {
    fontSize: FontSizes.xl,
    fontWeight: 700,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  stepSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xl,
  },
  questionGroup: {
    marginBottom: Spacing.xl,
  },
  questionLabel: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  optionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  optionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  optionButtonWide: {
    flex: 1,
  },
  optionButtonActive: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  optionText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  optionTextActive: {
    color: Colors.dark.primary,
    fontWeight: 600,
  },
  pillarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pillarIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pillarName: {
    fontSize: FontSizes.md,
    fontWeight: 500,
    color: Colors.dark.text,
  },
  ratingButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  ratingButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 700,
    color: Colors.dark.textMuted,
  },
  legendContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  suggestionCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "40",
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  suggestionLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.xpCyan,
    fontWeight: 500,
  },
  suggestionLevel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  suggestionLevelText: {
    fontSize: FontSizes["2xl"],
    fontWeight: 700,
  },
  confidenceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.xpCyan + "20",
    borderRadius: BorderRadius.sm,
  },
  confidenceText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.xpCyan,
    fontWeight: 500,
  },
  ageNote: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  selectLabel: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  levelGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  stageColumn: {
    flex: 1,
    gap: Spacing.sm,
  },
  stageBadge: {
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  stageBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: 700,
  },
  levelButton: {
    position: "relative",
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  levelButtonSuggested: {
    borderColor: Colors.dark.xpCyan + "50",
    borderStyle: "dashed",
  },
  levelButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.textMuted,
  },
  suggestedIcon: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  overrideSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.orange + "40",
  },
  overrideLabel: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.orange,
    marginBottom: Spacing.md,
  },
  overrideOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  overrideOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  overrideOptionActive: {
    backgroundColor: Colors.dark.orange + "20",
    borderColor: Colors.dark.orange,
  },
  overrideOptionText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  overrideOptionTextActive: {
    color: Colors.dark.orange,
    fontWeight: 500,
  },
  overrideNoteInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: FontSizes.sm,
    minHeight: 60,
    textAlignVertical: "top",
  },
  // Deep Baseline Styles
  deepProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  deepProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  deepProgressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 3,
  },
  deepProgressText: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.primary,
  },
  deepPillarSection: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  deepPillarHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  deepPillarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  deepPillarInfo: {
    flex: 1,
  },
  deepPillarName: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  deepPillarCount: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  deepPillarContent: {
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.md,
  },
  deepCategory: {
    gap: Spacing.sm,
  },
  deepCategoryName: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  deepSkillRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  deepSkillInfo: {
    flex: 1,
    minWidth: 0,
  },
  deepSkillName: {
    fontSize: FontSizes.sm,
    color: Colors.dark.text,
  },
  deepSkillNameMuted: {
    color: Colors.dark.textMuted,
    textDecorationLine: "line-through",
  },
  deepSkillActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  deepRatingRow: {
    flexDirection: "row",
    gap: 4,
  },
  deepRatingBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  deepRatingText: {
    fontSize: FontSizes.xs,
    fontWeight: 600,
    color: Colors.dark.textMuted,
  },
  notObservedBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  notObservedBtnActive: {
    backgroundColor: Colors.dark.textMuted + "20",
    borderColor: Colors.dark.textMuted,
  },
  deepLegend: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  deepLegendTitle: {
    fontSize: FontSizes.sm,
    fontWeight: 600,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  deepLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  deepLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  deepLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  deepLegendText: {
    fontSize: FontSizes.xs,
    color: Colors.dark.text,
  },
  footer: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  backButtonText: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
  },
  nextButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
  },
  nextButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.buttonText,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
  },
  saveButtonText: {
    fontSize: FontSizes.md,
    fontWeight: 600,
    color: Colors.dark.buttonText,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot + "F0",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
});
