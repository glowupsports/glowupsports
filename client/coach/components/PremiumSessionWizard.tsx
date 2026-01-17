import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Dimensions, Platform } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getStaticAssetsUrl } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { BaselineFlowCard } from "./BaselineFlowCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FlowStep = 
  | "intro" 
  | "session-type" 
  | "group-level" 
  | "players" 
  | "date-time" 
  | "court" 
  | "summary" 
  | "complete";

type SessionType = "private" | "semi_private" | "group" | "physical" | "activity";
type BallLevel = "red" | "orange" | "green" | "yellow" | "glow";

interface Player {
  id: string;
  name: string;
  email?: string;
  ballLevel?: string | null;
  skillLevel?: number | null;
  profilePhotoUrl?: string | null;
}

interface Court {
  id: string;
  name: string;
}

interface PremiumSessionWizardProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: (session: any) => void;
  initialDate?: Date;
}

const SESSION_TYPES = [
  { 
    id: "private" as SessionType, 
    label: "Private", 
    subtitle: "1 player · 1 coach",
    icon: "person" as const,
    color: GlowColors.primary,
  },
  { 
    id: "group" as SessionType, 
    label: "Group", 
    subtitle: "Multiple players · Same level",
    icon: "people" as const,
    color: Colors.dark.orange,
  },
  { 
    id: "semi_private" as SessionType, 
    label: "Semi-Private", 
    subtitle: "2-3 players",
    icon: "people-outline" as const,
    color: Colors.dark.xpCyan,
  },
  { 
    id: "physical" as SessionType, 
    label: "Physical", 
    subtitle: "Conditioning · Fitness",
    icon: "fitness" as const,
    color: Colors.dark.gold,
  },
  { 
    id: "activity" as SessionType, 
    label: "Activity", 
    subtitle: "Events · Games · Fun",
    icon: "game-controller" as const,
    color: "#FF6B9D",
  },
];

const BALL_LEVELS = [
  { id: "red" as BallLevel, label: "Red", color: Colors.dark.ballRed, description: "Beginners" },
  { id: "orange" as BallLevel, label: "Orange", color: Colors.dark.ballOrange, description: "Developing" },
  { id: "green" as BallLevel, label: "Green", color: Colors.dark.ballGreen, description: "Intermediate" },
  { id: "yellow" as BallLevel, label: "Yellow", color: Colors.dark.ballYellow, description: "Advanced" },
  { id: "glow" as BallLevel, label: "Glow", color: Colors.dark.xpCyan, description: "Adults" },
];

const DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00",
];

export function PremiumSessionWizard({ visible, onClose, onComplete, initialDate }: PremiumSessionWizardProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach, refetchCalendar } = useCoach();
  
  const [step, setStep] = useState<FlowStep>("intro");
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [groupLevel, setGroupLevel] = useState<BallLevel | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [createdSession, setCreatedSession] = useState<any>(null);
  
  const successScale = useSharedValue(0);

  const { data: playersData = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: visible,
  });

  const { data: courtsData = [] } = useQuery<Court[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });

  const players = Array.isArray(playersData) ? playersData : [];
  const courts = Array.isArray(courtsData) ? courtsData : [];

  const filteredPlayers = useMemo(() => {
    let result = players;
    
    if (sessionType === "group" && groupLevel) {
      result = result.filter(p => p.ballLevel?.toLowerCase() === groupLevel);
    }
    
    if (playerSearch) {
      const query = playerSearch.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(query));
    }
    
    return result;
  }, [players, sessionType, groupLevel, playerSearch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
      
      return apiRequest("POST", "/api/sessions", {
        sessionType,
        date: dateStr,
        startTime: selectedTime,
        duration,
        courtId: selectedCourtId,
        playerIds: selectedPlayers.map(p => p.id),
        ballLevel: groupLevel || (selectedPlayers[0]?.ballLevel || "green"),
        coachId: coach?.id,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      refetchCalendar?.();
      setCreatedSession(data);
      setShowSuccessAnimation(true);
      successScale.value = withSequence(
        withSpring(1.2, { damping: 8 }),
        withSpring(1, { damping: 12 })
      );
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setStep("complete");
      }, 1500);
    },
  });

  useEffect(() => {
    if (visible) {
      setStep("intro");
      setSessionType(null);
      setGroupLevel(null);
      setSelectedPlayers([]);
      setPlayerSearch("");
      setSelectedDate(initialDate || new Date());
      setSelectedTime(null);
      setDuration(60);
      setSelectedCourtId(null);
      setShowSuccessAnimation(false);
      setCreatedSession(null);
    }
  }, [visible, initialDate]);

  const getTotalSteps = () => {
    let steps = 5; // intro + type + players + datetime + court + summary
    if (sessionType === "group") {
      steps += 1; // group level step
    }
    return steps;
  };

  const getCurrentStepNumber = () => {
    const hasGroupLevel = sessionType === "group";
    switch (step) {
      case "intro": return 1;
      case "session-type": return 2;
      case "group-level": return 3;
      case "players": return hasGroupLevel ? 4 : 3;
      case "date-time": return hasGroupLevel ? 5 : 4;
      case "court": return hasGroupLevel ? 6 : 5;
      case "summary": return getTotalSteps();
      default: return 1;
    }
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switch (step) {
      case "intro":
        setStep("session-type");
        break;
      case "session-type":
        if (sessionType === "group") {
          setStep("group-level");
        } else {
          setStep("players");
        }
        break;
      case "group-level":
        setStep("players");
        break;
      case "players":
        setStep("date-time");
        break;
      case "date-time":
        setStep("court");
        break;
      case "court":
        setStep("summary");
        break;
      case "summary":
        saveMutation.mutate();
        break;
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (step) {
      case "session-type":
        setStep("intro");
        break;
      case "group-level":
        setStep("session-type");
        break;
      case "players":
        if (sessionType === "group") {
          setStep("group-level");
        } else {
          setStep("session-type");
        }
        break;
      case "date-time":
        setStep("players");
        break;
      case "court":
        setStep("date-time");
        break;
      case "summary":
        setStep("court");
        break;
    }
  };

  const canProceed = () => {
    switch (step) {
      case "intro": return true;
      case "session-type": return sessionType !== null;
      case "group-level": return groupLevel !== null;
      case "players": 
        if (sessionType === "private") return selectedPlayers.length === 1;
        if (sessionType === "semi_private") return selectedPlayers.length >= 1 && selectedPlayers.length <= 3;
        return selectedPlayers.length > 0;
      case "date-time": return selectedTime !== null;
      case "court": return true;
      case "summary": return true;
      default: return false;
    }
  };

  const handleClose = () => {
    if (step === "complete" && createdSession) {
      onComplete?.(createdSession);
    }
    onClose();
  };

  const togglePlayer = (player: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isSelected = selectedPlayers.some(p => p.id === player.id);
    if (isSelected) {
      setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
    } else {
      if (sessionType === "private" && selectedPlayers.length >= 1) {
        setSelectedPlayers([player]);
      } else if (sessionType === "semi_private" && selectedPlayers.length >= 3) {
        return;
      } else {
        setSelectedPlayers(prev => [...prev, player]);
      }
    }
  };

  const getLevelColor = (level: string | null | undefined) => {
    const levelColors: Record<string, string> = {
      red: Colors.dark.ballRed,
      orange: Colors.dark.ballOrange,
      green: Colors.dark.ballGreen,
      yellow: Colors.dark.ballYellow,
      glow: Colors.dark.xpCyan,
    };
    return levelColors[level?.toLowerCase() || ""] || Colors.dark.tabIconDefault;
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const successAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const renderIntroCard = () => (
    <BaselineFlowCard
      title="New Session"
      subtitle="Quick & Easy Setup"
      icon="calendar"
      iconColor={Colors.dark.xpCyan}
      step={1}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      showBack={false}
      nextLabel="Let's Go"
      glowColor={Colors.dark.xpCyan}
    >
      <View style={styles.introContent}>
        <View style={styles.introIconWrapper}>
          <LinearGradient
            colors={[Colors.dark.xpCyan + "30", Colors.dark.xpCyan + "10"]}
            style={styles.introIconGradient}
          >
            <Ionicons name="calendar" size={64} color={Colors.dark.xpCyan} />
          </LinearGradient>
        </View>
        <Text style={styles.introTitle}>Schedule a Session</Text>
        <Text style={styles.introDescription}>
          Create a new training session in just a few simple steps. We'll guide you through the setup.
        </Text>
        <View style={styles.introFeatures}>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.introFeatureText}>Choose session type</Text>
          </View>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.introFeatureText}>Select players</Text>
          </View>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.introFeatureText}>Pick date & time</Text>
          </View>
        </View>
      </View>
    </BaselineFlowCard>
  );

  const renderSessionTypeCard = () => {
    const selectedTypeData = SESSION_TYPES.find(t => t.id === sessionType);
    
    return (
      <BaselineFlowCard
        title="Session Type"
        subtitle="What kind of session?"
        icon="apps"
        iconColor={selectedTypeData?.color || Colors.dark.xpCyan}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={selectedTypeData?.color || Colors.dark.xpCyan}
      >
        <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.sessionTypeList}>
            {SESSION_TYPES.map((type) => (
              <Pressable
                key={type.id}
                style={[
                  styles.sessionTypeCard,
                  sessionType === type.id && styles.sessionTypeCardSelected,
                  sessionType === type.id && { borderColor: type.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSessionType(type.id);
                  if (type.id !== "group") {
                    setGroupLevel(null);
                  }
                }}
              >
                <View style={[styles.sessionTypeIcon, { backgroundColor: type.color + "20" }]}>
                  <Ionicons name={type.icon} size={24} color={type.color} />
                </View>
                <View style={styles.sessionTypeInfo}>
                  <Text style={[
                    styles.sessionTypeLabel,
                    sessionType === type.id && { color: type.color }
                  ]}>
                    {type.label}
                  </Text>
                  <Text style={styles.sessionTypeSubtitle}>{type.subtitle}</Text>
                </View>
                {sessionType === type.id && (
                  <View style={[styles.sessionTypeCheck, { backgroundColor: type.color }]}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </BaselineFlowCard>
    );
  };

  const renderGroupLevelCard = () => {
    const selectedLevelData = BALL_LEVELS.find(l => l.id === groupLevel);
    
    return (
      <BaselineFlowCard
        title="Group Level"
        subtitle="Filter players by level"
        icon="star"
        iconColor={selectedLevelData?.color || Colors.dark.orange}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={selectedLevelData?.color || Colors.dark.orange}
      >
        <View style={styles.groupLevelContent}>
          <Text style={styles.levelQuestion}>
            What level is this group session?
          </Text>
          
          <View style={styles.ballLevelGrid}>
            {BALL_LEVELS.map((level) => {
              const playerCount = players.filter(p => p.ballLevel?.toLowerCase() === level.id).length;
              
              return (
                <Pressable
                  key={level.id}
                  style={[
                    styles.ballLevelCard,
                    groupLevel === level.id && styles.ballLevelCardSelected,
                    groupLevel === level.id && { borderColor: level.color },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGroupLevel(level.id);
                    setSelectedPlayers([]);
                  }}
                >
                  <View style={[styles.ballDot, { backgroundColor: level.color }]} />
                  <Text style={[
                    styles.ballLevelLabel,
                    groupLevel === level.id && { color: level.color }
                  ]}>
                    {level.label}
                  </Text>
                  <Text style={styles.ballLevelDesc}>{level.description}</Text>
                  <Text style={styles.playerCountBadge}>{playerCount} players</Text>
                  {groupLevel === level.id && (
                    <View style={[styles.ballCheck, { backgroundColor: level.color }]}>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          
          {groupLevel && (
            <View style={styles.levelInfo}>
              <Ionicons name="information-circle" size={18} color={Colors.dark.textMuted} />
              <Text style={styles.levelInfoText}>
                Only {groupLevel.toUpperCase()} players will be shown in the next step
              </Text>
            </View>
          )}
        </View>
      </BaselineFlowCard>
    );
  };

  const renderPlayersCard = () => {
    const typeData = SESSION_TYPES.find(t => t.id === sessionType);
    const maxPlayers = sessionType === "private" ? 1 : sessionType === "semi_private" ? 3 : 12;
    
    return (
      <BaselineFlowCard
        title="Select Players"
        subtitle={`${selectedPlayers.length}/${maxPlayers} selected`}
        icon="people"
        iconColor={typeData?.color || GlowColors.primary}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={typeData?.color || GlowColors.primary}
      >
        <View style={styles.playersContent}>
          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.textMuted}
              value={playerSearch}
              onChangeText={setPlayerSearch}
            />
            {playerSearch ? (
              <Pressable onPress={() => setPlayerSearch("")}>
                <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>
          
          {sessionType === "group" && groupLevel && (
            <View style={[styles.filterBadge, { backgroundColor: getLevelColor(groupLevel) + "20" }]}>
              <View style={[styles.filterDot, { backgroundColor: getLevelColor(groupLevel) }]} />
              <Text style={[styles.filterText, { color: getLevelColor(groupLevel) }]}>
                Showing {groupLevel.toUpperCase()} players only
              </Text>
            </View>
          )}
          
          <ScrollView style={styles.playersList} showsVerticalScrollIndicator={false}>
            {filteredPlayers.length === 0 ? (
              <View style={styles.emptyPlayers}>
                <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyPlayersText}>No players found</Text>
              </View>
            ) : (
              filteredPlayers.map((player) => {
                const isSelected = selectedPlayers.some(p => p.id === player.id);
                const levelColor = getLevelColor(player.ballLevel);
                
                return (
                  <Pressable
                    key={player.id}
                    style={[
                      styles.playerCard,
                      isSelected && styles.playerCardSelected,
                      isSelected && { borderColor: levelColor },
                    ]}
                    onPress={() => togglePlayer(player)}
                  >
                    {player.profilePhotoUrl ? (
                      <Image
                        source={{ uri: `${getStaticAssetsUrl()}${player.profilePhotoUrl}` }}
                        style={styles.playerAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.playerAvatarPlaceholder, { backgroundColor: levelColor + "30" }]}>
                        <Text style={[styles.playerInitial, { color: levelColor }]}>
                          {player.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.name}</Text>
                      <View style={styles.playerMeta}>
                        <View style={[styles.playerLevelBadge, { backgroundColor: levelColor + "20" }]}>
                          <View style={[styles.playerLevelDot, { backgroundColor: levelColor }]} />
                          <Text style={[styles.playerLevelText, { color: levelColor }]}>
                            {(player.ballLevel || "").toUpperCase()}
                            {player.skillLevel ? `_${player.skillLevel}` : ""}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[
                      styles.playerCheckbox,
                      isSelected && { backgroundColor: levelColor, borderColor: levelColor },
                    ]}>
                      {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </BaselineFlowCard>
    );
  };

  const renderDateTimeCard = () => (
    <BaselineFlowCard
      title="Date & Time"
      subtitle={selectedDate ? formatDate(selectedDate) : "Select when"}
      icon="time"
      iconColor="#8B5CF6"
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!canProceed()}
      glowColor="#8B5CF6"
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Duration</Text>
        <View style={styles.durationGrid}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d.value}
              style={[
                styles.durationCard,
                duration === d.value && styles.durationCardSelected,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDuration(d.value);
              }}
            >
              <Text style={[
                styles.durationText,
                duration === d.value && styles.durationTextSelected,
              ]}>
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>
        
        <Text style={styles.sectionLabel}>Start Time</Text>
        <View style={styles.timeGrid}>
          {TIME_SLOTS.map((time) => (
            <Pressable
              key={time}
              style={[
                styles.timeSlot,
                selectedTime === time && styles.timeSlotSelected,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTime(time);
              }}
            >
              <Text style={[
                styles.timeSlotText,
                selectedTime === time && styles.timeSlotTextSelected,
              ]}>
                {time}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderCourtCard = () => (
    <BaselineFlowCard
      title="Court"
      subtitle="Where is the session?"
      icon="location"
      iconColor={Colors.dark.gold}
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      glowColor={Colors.dark.gold}
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <Pressable
          style={[
            styles.courtCard,
            selectedCourtId === null && styles.courtCardSelected,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedCourtId(null);
          }}
        >
          <Ionicons name="help-circle-outline" size={24} color={Colors.dark.textMuted} />
          <Text style={styles.courtName}>No specific court</Text>
          {selectedCourtId === null && (
            <View style={[styles.courtCheck, { backgroundColor: Colors.dark.gold }]}>
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        
        {courts.map((court) => (
          <Pressable
            key={court.id}
            style={[
              styles.courtCard,
              selectedCourtId === court.id && styles.courtCardSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCourtId(court.id);
            }}
          >
            <Ionicons name="tennisball" size={24} color={Colors.dark.gold} />
            <Text style={styles.courtName}>{court.name}</Text>
            {selectedCourtId === court.id && (
              <View style={[styles.courtCheck, { backgroundColor: Colors.dark.gold }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            )}
          </Pressable>
        ))}
        
        {courts.length === 0 && (
          <View style={styles.noCourts}>
            <Text style={styles.noCourtsText}>No courts available</Text>
          </View>
        )}
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderSummaryCard = () => {
    const typeData = SESSION_TYPES.find(t => t.id === sessionType);
    const levelColor = groupLevel ? getLevelColor(groupLevel) : (typeData?.color || GlowColors.primary);
    const courtName = selectedCourtId ? courts.find(c => c.id === selectedCourtId)?.name : "No specific court";
    
    return (
      <BaselineFlowCard
        title="Summary"
        subtitle="Review & confirm"
        icon="checkmark-circle"
        iconColor={GlowColors.primary}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={saveMutation.isPending ? "Creating..." : "Create Session"}
        nextDisabled={saveMutation.isPending}
        glowColor={GlowColors.primary}
      >
        <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: typeData?.color + "20" }]}>
                <Ionicons name={typeData?.icon || "calendar"} size={20} color={typeData?.color} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Session Type</Text>
                <Text style={styles.summaryValue}>{typeData?.label}</Text>
              </View>
            </View>
            
            {sessionType === "group" && groupLevel && (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIcon, { backgroundColor: levelColor + "20" }]}>
                  <View style={[styles.summaryDot, { backgroundColor: levelColor }]} />
                </View>
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryLabel}>Group Level</Text>
                  <Text style={[styles.summaryValue, { color: levelColor }]}>
                    {groupLevel.toUpperCase()}
                  </Text>
                </View>
              </View>
            )}
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: "#3B82F620" }]}>
                <Ionicons name="people" size={20} color="#3B82F6" />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Players</Text>
                <Text style={styles.summaryValue}>
                  {selectedPlayers.map(p => p.name).join(", ") || "None selected"}
                </Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: "#8B5CF620" }]}>
                <Ionicons name="calendar" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Date & Time</Text>
                <Text style={styles.summaryValue}>
                  {formatDate(selectedDate)} at {selectedTime || "Not set"}
                </Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: "#EC489920" }]}>
                <Ionicons name="time" size={20} color="#EC4899" />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>{duration} minutes</Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
                <Ionicons name="location" size={20} color={Colors.dark.gold} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryLabel}>Court</Text>
                <Text style={styles.summaryValue}>{courtName}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </BaselineFlowCard>
    );
  };

  const renderCompleteCard = () => (
    <View style={styles.completeContainer}>
      <View style={styles.completeCard}>
        <LinearGradient
          colors={[GlowColors.primary + "30", "transparent"]}
          style={styles.completeGlow}
        />
        <View style={styles.completeIconWrapper}>
          <Ionicons name="checkmark-circle" size={80} color={GlowColors.primary} />
        </View>
        <Text style={styles.completeTitle}>Session Created!</Text>
        <Text style={styles.completeSubtitle}>
          Your session has been scheduled
        </Text>
        <Pressable style={styles.completeDoneButton} onPress={handleClose}>
          <Text style={styles.completeDoneText}>Done</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );

  const renderCurrentStep = () => {
    if (showSuccessAnimation) {
      return (
        <Animated.View style={[styles.successOverlay, successAnimatedStyle]}>
          <View style={styles.successContent}>
            <Ionicons name="checkmark-circle" size={100} color={GlowColors.primary} />
            <Text style={styles.successText}>Session Created!</Text>
          </View>
        </Animated.View>
      );
    }

    switch (step) {
      case "intro": return renderIntroCard();
      case "session-type": return renderSessionTypeCard();
      case "group-level": return renderGroupLevelCard();
      case "players": return renderPlayersCard();
      case "date-time": return renderDateTimeCard();
      case "court": return renderCourtCard();
      case "summary": return renderSummaryCard();
      case "complete": return renderCompleteCard();
      default: return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>New Session</Text>
            {sessionType && step !== "intro" && step !== "complete" && (
              <Text style={styles.headerSubtitle}>
                {SESSION_TYPES.find(t => t.id === sessionType)?.label}
              </Text>
            )}
          </View>
          <View style={styles.headerRight} />
        </View>
        
        <View style={styles.content}>
          {renderCurrentStep()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D10",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.xpCyan,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: Spacing.xxl,
  },
  cardScroll: {
    maxHeight: 350,
  },
  introContent: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  introIconWrapper: {
    marginBottom: Spacing.lg,
  },
  introIconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
  },
  introDescription: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  introFeatures: {
    gap: Spacing.sm,
  },
  introFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  introFeatureText: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  sessionTypeList: {
    gap: Spacing.sm,
  },
  sessionTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
  },
  sessionTypeCardSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  sessionTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  sessionTypeInfo: {
    flex: 1,
  },
  sessionTypeLabel: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  sessionTypeSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  sessionTypeCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  groupLevelContent: {
    paddingVertical: Spacing.md,
  },
  levelQuestion: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.lg,
    fontWeight: "500",
  },
  ballLevelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  ballLevelCard: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - Spacing.sm * 2) / 2 - 4,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
    alignItems: "center",
  },
  ballLevelCardSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  ballDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: Spacing.sm,
  },
  ballLevelLabel: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  ballLevelDesc: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  playerCountBadge: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
  ballCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  levelInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  levelInfoText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  playersContent: {
    flex: 1,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    marginLeft: Spacing.sm,
  },
  filterBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  playersList: {
    maxHeight: 250,
  },
  emptyPlayers: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
  },
  emptyPlayersText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  playerCardSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: Spacing.md,
  },
  playerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  playerInitial: {
    fontSize: 18,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  playerLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  playerLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  playerLevelText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  playerCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  durationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  durationCard: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  durationCardSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#8B5CF620",
  },
  durationText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  durationTextSelected: {
    color: "#8B5CF6",
    fontWeight: "700",
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  timeSlot: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  timeSlotSelected: {
    borderColor: "#8B5CF6",
    backgroundColor: "#8B5CF620",
  },
  timeSlotText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  timeSlotTextSelected: {
    color: "#8B5CF6",
    fontWeight: "600",
  },
  courtCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  courtCardSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: Colors.dark.gold + "10",
  },
  courtName: {
    flex: 1,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  courtCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  noCourts: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  noCourtsText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  summaryDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  completeContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  completeCard: {
    width: "100%",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: "center",
    borderWidth: 2,
    borderColor: GlowColors.primary + "50",
    overflow: "hidden",
  },
  completeGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  completeIconWrapper: {
    marginBottom: Spacing.lg,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
  },
  completeSubtitle: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  completeDoneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#1A1F2A",
    borderWidth: 1.5,
    borderColor: GlowColors.primary + "60",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  completeDoneText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  successOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  successContent: {
    alignItems: "center",
  },
  successText: {
    fontSize: 24,
    fontWeight: "700",
    color: GlowColors.primary,
    marginTop: Spacing.lg,
  },
});
