import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, Dimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getStaticAssetsUrl } from "@/lib/query-client";
import { Colors, Backgrounds, Spacing, BorderRadius, FontSizes, GlowColors } from "@/constants/theme";
import { BaselineFlowCard } from "./BaselineFlowCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FlowStep = "intro" | "basic-info" | "player-type" | "ball-level" | "glow-level" | "sublevel" | "parent-info" | "summary" | "complete";

interface PremiumAddPlayerFlowProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (player: any) => void;
}

const BALL_LEVELS = [
  { id: "blue", label: "Blue", color: "#3B82F6", description: "Starter (3-5 yrs)", image: "blue_tennis_ball_icon.png" },
  { id: "red", label: "Red", color: Colors.dark.ballRed, description: "Beginners (5-8 yrs)", image: "red_tennis_ball_icon.png" },
  { id: "orange", label: "Orange", color: Colors.dark.ballOrange, description: "Developing (8-10 yrs)", image: "orange_tennis_ball_icon.png" },
  { id: "green", label: "Green", color: Colors.dark.ballGreen, description: "Intermediate (9-12 yrs)", image: "green_tennis_ball_icon.png" },
  { id: "yellow", label: "Yellow", color: Colors.dark.ballYellow, description: "Advanced (10+ yrs)", image: "yellow_tennis_ball_icon.png" },
];

const GLOW_LEVELS = [
  { rank: 9, name: "Absolute Beginner", description: "Just starting tennis journey" },
  { rank: 8, name: "Beginner", description: "Can rally, learning basics" },
  { rank: 7, name: "Low Intermediate", description: "Consistent strokes, plays sets" },
  { rank: 6, name: "Intermediate", description: "Shot variety, tactical awareness" },
  { rank: 5, name: "Advanced Intermediate", description: "Weapon developed, net play" },
  { rank: 4, name: "Performance", description: "All-round reliable, match ready" },
  { rank: 3, name: "High Performance", description: "Elite consistency, competition" },
  { rank: 2, name: "National Top", description: "Near-pro intensity" },
  { rank: 1, name: "Elite / Semi-Pro", description: "ITF / College level" },
];

export function PremiumAddPlayerFlow({ visible, onClose, onComplete }: PremiumAddPlayerFlowProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<FlowStep>("intro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [playerType, setPlayerType] = useState<"kid" | "adult" | null>(null);
  const [selectedBallLevel, setSelectedBallLevel] = useState<string | null>(null);
  const [selectedGlowLevel, setSelectedGlowLevel] = useState<number | null>(null);
  const [selectedSublevel, setSelectedSublevel] = useState<number | null>(null);
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [createdPlayer, setCreatedPlayer] = useState<any>(null);
  const [skipIntroNextTime, setSkipIntroNextTime] = useState(false);
  
  const successScale = useSharedValue(0);
  
  // Check if user has opted to skip intro
  useEffect(() => {
    const checkSkipIntro = async () => {
      try {
        const skipPref = await AsyncStorage.getItem("skipAddPlayerIntro");
        if (skipPref === "true" && visible) {
          setStep("basic-info");
        }
      } catch (e) {
        // Ignore errors
      }
    };
    if (visible) {
      checkSkipIntro();
    }
  }, [visible]);
  
  const handleSkipIntroChange = async (value: boolean) => {
    setSkipIntroNextTime(value);
    try {
      await AsyncStorage.setItem("skipAddPlayerIntro", value ? "true" : "false");
    } catch (e) {
      // Ignore errors
    }
  };
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      const ballLevel = playerType === "adult" 
        ? "glow" 
        : selectedBallLevel;
      const skillLevel = playerType === "adult"
        ? selectedGlowLevel
        : selectedSublevel;
      
      return apiRequest("POST", "/api/players", {
        name,
        email: email || undefined,
        phone: phone || undefined,
        ballLevel,
        skillLevel,
        parentName: playerType === "kid" ? parentName : undefined,
        parentPhone: playerType === "kid" ? parentPhone : undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/academy/players-without-baseline"] });
      setCreatedPlayer(data);
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
      setName("");
      setEmail("");
      setPhone("");
      setPlayerType(null);
      setSelectedBallLevel(null);
      setSelectedGlowLevel(null);
      setSelectedSublevel(null);
      setParentName("");
      setParentPhone("");
      setShowSuccessAnimation(false);
      setCreatedPlayer(null);
    }
  }, [visible]);
  
  const getTotalSteps = () => {
    let steps = 4; // intro + basic-info + player-type + level
    if (playerType === "kid") {
      steps += 2; // sublevel + parent-info
    }
    steps += 1; // summary
    return steps;
  };
  
  const getCurrentStepNumber = () => {
    switch (step) {
      case "intro": return 1;
      case "basic-info": return 2;
      case "player-type": return 3;
      case "ball-level": return 4;
      case "glow-level": return 4;
      case "sublevel": return 5;
      case "parent-info": return 6;
      case "summary": return getTotalSteps();
      default: return 1;
    }
  };
  
  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switch (step) {
      case "intro":
        setStep("basic-info");
        break;
      case "basic-info":
        setStep("player-type");
        break;
      case "player-type":
        if (playerType === "kid") {
          setStep("ball-level");
        } else {
          setStep("glow-level");
        }
        break;
      case "ball-level":
        setStep("sublevel");
        break;
      case "glow-level":
        setStep("summary");
        break;
      case "sublevel":
        setStep("parent-info");
        break;
      case "parent-info":
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
      case "basic-info":
        setStep("intro");
        break;
      case "player-type":
        setStep("basic-info");
        break;
      case "ball-level":
      case "glow-level":
        setStep("player-type");
        break;
      case "sublevel":
        setStep("ball-level");
        break;
      case "parent-info":
        setStep("sublevel");
        break;
      case "summary":
        if (playerType === "kid") {
          setStep("parent-info");
        } else {
          setStep("glow-level");
        }
        break;
    }
  };
  
  const canProceed = () => {
    switch (step) {
      case "intro": return true;
      case "basic-info": return name.trim().length > 0;
      case "player-type": return playerType !== null;
      case "ball-level": return selectedBallLevel !== null;
      case "glow-level": return selectedGlowLevel !== null;
      case "sublevel": return selectedSublevel !== null;
      case "parent-info": return true;
      case "summary": return true;
      default: return false;
    }
  };
  
  const handleClose = () => {
    if (step === "complete" && createdPlayer) {
      onComplete(createdPlayer);
    }
    onClose();
  };

  const successAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const renderIntroCard = () => (
    <BaselineFlowCard
      title="Add New Player"
      subtitle="Quick & Easy Setup"
      icon="person-add"
      iconColor={GlowColors.primary}
      step={1}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      showBack={false}
      nextLabel="Let's Go"
      glowColor={GlowColors.primary}
    >
      <View style={styles.introContent}>
        <View style={styles.introIconWrapper}>
          <LinearGradient
            colors={[GlowColors.primary + "30", GlowColors.primary + "10"]}
            style={styles.introIconGradient}
          >
            <Ionicons name="person-add" size={64} color={GlowColors.primary} />
          </LinearGradient>
        </View>
        <Text style={styles.introTitle}>Welcome!</Text>
        <Text style={styles.introDescription}>
          Add a new player to your academy in just a few simple steps. We'll guide you through setting up their profile and level.
        </Text>
        <View style={styles.introFeatures}>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
            <Text style={styles.introFeatureText}>Basic info in seconds</Text>
          </View>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
            <Text style={styles.introFeatureText}>Set their skill level</Text>
          </View>
          <View style={styles.introFeature}>
            <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
            <Text style={styles.introFeatureText}>Parent info for kids</Text>
          </View>
        </View>
        
        <Pressable 
          style={styles.skipCheckboxRow}
          onPress={() => handleSkipIntroChange(!skipIntroNextTime)}
        >
          <View style={[styles.skipCheckbox, skipIntroNextTime && styles.skipCheckboxActive]}>
            {skipIntroNextTime ? (
              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            ) : null}
          </View>
          <Text style={styles.skipCheckboxText}>Skip this screen next time</Text>
        </Pressable>
      </View>
    </BaselineFlowCard>
  );

  const renderBasicInfoCard = () => (
    <BaselineFlowCard
      title="Basic Information"
      subtitle="Player Details"
      icon="person"
      iconColor="#3B82F6"
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!canProceed()}
      glowColor="#3B82F6"
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Player Name *</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter player name"
              placeholderTextColor={Colors.dark.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email (Optional)</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="player@email.com"
              placeholderTextColor={Colors.dark.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone (Optional)</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="+31 6 12345678"
              placeholderTextColor={Colors.dark.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderPlayerTypeCard = () => (
    <BaselineFlowCard
      title="Player Type"
      subtitle="Select age category"
      icon="people"
      iconColor="#8B5CF6"
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!canProceed()}
      glowColor="#8B5CF6"
    >
      <View style={styles.typeSelection}>
        <Text style={styles.typeQuestion}>Is this player an adult or a child?</Text>
        
        <Pressable
          style={[
            styles.typeCard,
            playerType === "kid" && styles.typeCardSelected,
            playerType === "kid" && { borderColor: Colors.dark.ballOrange },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPlayerType("kid");
            setSelectedGlowLevel(null);
          }}
        >
          <View style={[styles.typeIconWrapper, { backgroundColor: Colors.dark.ballOrange + "20" }]}>
            <Ionicons name="happy" size={40} color={Colors.dark.ballOrange} />
          </View>
          <View style={styles.typeInfo}>
            <Text style={styles.typeTitle}>Child / Junior</Text>
            <Text style={styles.typeDescription}>Under 18 years old</Text>
            <Text style={styles.typeSubtext}>Uses ball levels: Red, Orange, Green, Yellow</Text>
          </View>
          {playerType === "kid" && (
            <View style={[styles.typeCheck, { backgroundColor: Colors.dark.ballOrange }]}>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        
        <Pressable
          style={[
            styles.typeCard,
            playerType === "adult" && styles.typeCardSelected,
            playerType === "adult" && { borderColor: Colors.dark.gold },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPlayerType("adult");
            setSelectedBallLevel(null);
            setSelectedSublevel(null);
          }}
        >
          <View style={[styles.typeIconWrapper, { backgroundColor: Colors.dark.gold + "20" }]}>
            <Ionicons name="person" size={40} color={Colors.dark.gold} />
          </View>
          <View style={styles.typeInfo}>
            <Text style={styles.typeTitle}>Adult</Text>
            <Text style={styles.typeDescription}>18 years or older</Text>
            <Text style={styles.typeSubtext}>Uses Glow levels: 9 (beginner) to 1 (elite)</Text>
          </View>
          {playerType === "adult" && (
            <View style={[styles.typeCheck, { backgroundColor: Colors.dark.gold }]}>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
      </View>
    </BaselineFlowCard>
  );

  const renderBallLevelCard = () => (
    <BaselineFlowCard
      title="Ball Level"
      subtitle="Select skill stage"
      icon="tennisball"
      iconColor={selectedBallLevel ? BALL_LEVELS.find(b => b.id === selectedBallLevel)?.color : GlowColors.primary}
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!canProceed()}
      glowColor={selectedBallLevel ? BALL_LEVELS.find(b => b.id === selectedBallLevel)?.color : GlowColors.primary}
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.levelQuestion}>What ball level is {name || "this player"} playing?</Text>
        
        <View style={styles.ballLevelGrid}>
          {BALL_LEVELS.map((level) => (
            <Pressable
              key={level.id}
              style={[
                styles.ballLevelCard,
                selectedBallLevel === level.id && styles.ballLevelCardSelected,
                selectedBallLevel === level.id && { borderColor: level.color },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedBallLevel(level.id);
              }}
            >
              <Image
                source={{ uri: `${getStaticAssetsUrl()}/images/${level.image}` }}
                style={styles.ballImage}
                contentFit="contain"
              />
              <Text style={[styles.ballLevelLabel, selectedBallLevel === level.id && { color: level.color }]}>
                {level.label}
              </Text>
              <Text style={styles.ballLevelDesc}>{level.description}</Text>
              {selectedBallLevel === level.id ? (
                <View style={[styles.ballCheck, { backgroundColor: level.color }]}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderSublevelCard = () => {
    const levelColor = selectedBallLevel ? BALL_LEVELS.find(b => b.id === selectedBallLevel)?.color : GlowColors.primary;
    
    return (
      <BaselineFlowCard
        title="Skill Level"
        subtitle={`${selectedBallLevel?.toUpperCase()} sublevel`}
        icon="trophy"
        iconColor={levelColor}
        step={getCurrentStepNumber()}
        totalSteps={getTotalSteps()}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel="Next"
        nextDisabled={!canProceed()}
        glowColor={levelColor}
      >
        <View style={styles.sublevelContent}>
          <Text style={styles.levelQuestion}>
            Select {name || "player"}'s level within {selectedBallLevel?.toUpperCase()} ball:
          </Text>
          
          <View style={styles.sublevelGrid}>
            {[3, 2, 1].map((level) => (
              <Pressable
                key={level}
                style={[
                  styles.sublevelCard,
                  selectedSublevel === level && styles.sublevelCardSelected,
                  selectedSublevel === level && { borderColor: levelColor },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedSublevel(level);
                }}
              >
                <Text style={[
                  styles.sublevelNumber,
                  selectedSublevel === level && { color: (selectedBallLevel === "yellow" || selectedBallLevel === "green") ? Colors.dark.buttonText : levelColor }
                ]}>
                  {level}
                </Text>
                <Text style={styles.sublevelLabel}>
                  {level === 3 ? "Entry" : level === 2 ? "Developing" : "Ready"}
                </Text>
                {selectedSublevel === level && (
                  <View style={[styles.sublevelCheck, { backgroundColor: levelColor }]}>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
          
          <View style={styles.sublevelInfo}>
            <View style={[styles.sublevelInfoDot, { backgroundColor: levelColor }]} />
            <Text style={styles.sublevelInfoText}>
              {selectedBallLevel?.toUpperCase()}_{selectedSublevel || "?"} - {selectedSublevel === 3 ? "Entry" : selectedSublevel === 2 ? "Developing" : selectedSublevel === 1 ? "Ready" : "?"} level within {selectedBallLevel} ball
            </Text>
          </View>
        </View>
      </BaselineFlowCard>
    );
  };

  const renderGlowLevelCard = () => (
    <BaselineFlowCard
      title="Glow Level"
      subtitle="Adult skill ranking"
      icon="star"
      iconColor={Colors.dark.gold}
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      nextDisabled={!canProceed()}
      glowColor={Colors.dark.gold}
    >
      <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.levelQuestion}>Select {name || "player"}'s Glow level:</Text>
        
        <View style={styles.glowLevelList}>
          {GLOW_LEVELS.map((level) => (
            <Pressable
              key={level.rank}
              style={[
                styles.glowLevelCard,
                selectedGlowLevel === level.rank && styles.glowLevelCardSelected,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedGlowLevel(level.rank);
              }}
            >
              <View style={[
                styles.glowRankBadge,
                selectedGlowLevel === level.rank && styles.glowRankBadgeSelected,
              ]}>
                <Text style={[
                  styles.glowRankText,
                  selectedGlowLevel === level.rank && styles.glowRankTextSelected,
                ]}>
                  {level.rank}
                </Text>
              </View>
              <View style={styles.glowLevelInfo}>
                <Text style={[
                  styles.glowLevelName,
                  selectedGlowLevel === level.rank && styles.glowLevelNameSelected,
                ]}>
                  {level.name}
                </Text>
                <Text style={styles.glowLevelDesc}>{level.description}</Text>
              </View>
              {selectedGlowLevel === level.rank && (
                <View style={styles.glowCheck}>
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </BaselineFlowCard>
  );

  const renderParentInfoCard = () => (
    <BaselineFlowCard
      title="Parent / Guardian"
      subtitle="Contact information"
      icon="people"
      iconColor="#EC4899"
      step={getCurrentStepNumber()}
      totalSteps={getTotalSteps()}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel="Next"
      glowColor="#EC4899"
    >
      <View style={styles.parentContent}>
        <Text style={styles.parentNote}>
          Add parent/guardian contact info for communication about {name || "this player"}.
        </Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Parent Name (Optional)</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Parent or guardian name"
              placeholderTextColor={Colors.dark.textMuted}
              value={parentName}
              onChangeText={setParentName}
              autoCapitalize="words"
            />
          </View>
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Parent Phone (Optional)</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="+31 6 12345678"
              placeholderTextColor={Colors.dark.textMuted}
              value={parentPhone}
              onChangeText={setParentPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>
        
        <View style={styles.skipNote}>
          <Ionicons name="information-circle" size={18} color={Colors.dark.textMuted} />
          <Text style={styles.skipNoteText}>You can skip this and add parent info later</Text>
        </View>
      </View>
    </BaselineFlowCard>
  );

  const renderSummaryCard = () => {
    const levelDisplay = playerType === "adult"
      ? `Glow ${selectedGlowLevel}`
      : `${selectedBallLevel?.toUpperCase()}_${selectedSublevel}`;
    const levelColor = playerType === "adult"
      ? Colors.dark.xpCyan // Glow levels use cyan, not gold
      : BALL_LEVELS.find(b => b.id === selectedBallLevel)?.color || GlowColors.primary;
    
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
        nextLabel={saveMutation.isPending ? "Saving..." : "Add Player"}
        nextDisabled={saveMutation.isPending}
        glowColor={GlowColors.primary}
      >
        <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={[styles.summaryAvatar, { backgroundColor: levelColor + "30" }]}>
                <Text style={[styles.summaryInitial, { color: (selectedBallLevel === "yellow" || selectedBallLevel === "green") && playerType !== "adult" ? Colors.dark.buttonText : levelColor }]}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.summaryHeaderInfo}>
                <Text style={styles.summaryName}>{name}</Text>
                <View style={[styles.summaryLevelBadge, { backgroundColor: levelColor + "20", borderColor: levelColor }]}>
                  <View style={[styles.summaryLevelDot, { backgroundColor: levelColor }]} />
                  <Text style={[styles.summaryLevelText, { color: (selectedBallLevel === "yellow" || selectedBallLevel === "green") && playerType !== "adult" ? Colors.dark.buttonText : levelColor }]}>{levelDisplay}</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.summaryDivider} />
            
            <View style={styles.summaryDetails}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Type</Text>
                <Text style={styles.summaryValue}>
                  {playerType === "adult" ? "Adult" : "Junior"}
                </Text>
              </View>
              {email ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Email</Text>
                  <Text style={styles.summaryValue}>{email}</Text>
                </View>
              ) : null}
              {phone ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Phone</Text>
                  <Text style={styles.summaryValue}>{phone}</Text>
                </View>
              ) : null}
              {playerType === "kid" && parentName ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Parent</Text>
                  <Text style={styles.summaryValue}>{parentName}</Text>
                </View>
              ) : null}
              {playerType === "kid" && parentPhone ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Parent Phone</Text>
                  <Text style={styles.summaryValue}>{parentPhone}</Text>
                </View>
              ) : null}
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
        <Text style={styles.completeTitle}>Player Added!</Text>
        <Text style={styles.completeSubtitle}>
          {name} has been added to your academy
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
            <Text style={styles.successText}>Player Added!</Text>
          </View>
        </Animated.View>
      );
    }

    switch (step) {
      case "intro": return renderIntroCard();
      case "basic-info": return renderBasicInfoCard();
      case "player-type": return renderPlayerTypeCard();
      case "ball-level": return renderBallLevelCard();
      case "glow-level": return renderGlowLevelCard();
      case "sublevel": return renderSublevelCard();
      case "parent-info": return renderParentInfoCard();
      case "summary": return renderSummaryCard();
      case "complete": return renderCompleteCard();
      default: return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Add Player</Text>
            {name && step !== "intro" && step !== "complete" && (
              <Text style={styles.headerSubtitle}>{name}</Text>
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
    color: GlowColors.primary,
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
    flex: 1,
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
  skipCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  skipCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipCheckboxActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  skipCheckboxText: {
    fontSize: FontSizes.sm,
    color: "rgba(255, 255, 255, 0.7)",
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: FontSizes.md,
    color: "#FFFFFF",
  },
  typeSelection: {
    paddingVertical: Spacing.md,
  },
  typeQuestion: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.lg,
    fontWeight: "500",
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  typeCardSelected: {
    borderWidth: 2,
    backgroundColor: Backgrounds.card,
  },
  typeIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  typeInfo: {
    flex: 1,
  },
  typeTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  typeDescription: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  typeSubtext: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  typeCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.lg * 2 - Spacing.sm) / 2 - 4,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    padding: Spacing.md,
    alignItems: "center",
  },
  ballLevelCardSelected: {
    backgroundColor: Backgrounds.elevated,
  },
  ballDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: Spacing.sm,
  },
  ballImage: {
    width: 56,
    height: 56,
    marginBottom: Spacing.sm,
  },
  ballLevelLabel: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  ballLevelDesc: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    textAlign: "center",
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
  sublevelContent: {
    paddingVertical: Spacing.md,
  },
  sublevelGrid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sublevelCard: {
    width: 90,
    height: 100,
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sublevelCardSelected: {
    backgroundColor: Backgrounds.card,
  },
  sublevelNumber: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  sublevelLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  sublevelCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sublevelInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  sublevelInfoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sublevelInfoText: {
    fontSize: FontSizes.sm,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  glowLevelList: {
    gap: Spacing.sm,
  },
  glowLevelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: Spacing.md,
  },
  glowLevelCardSelected: {
    borderColor: Colors.dark.gold,
    backgroundColor: Colors.dark.gold + "10",
  },
  glowRankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  glowRankBadgeSelected: {
    backgroundColor: Colors.dark.gold,
  },
  glowRankText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  glowRankTextSelected: {
    color: "#000000",
  },
  glowLevelInfo: {
    flex: 1,
  },
  glowLevelName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  glowLevelNameSelected: {
    color: Colors.dark.gold,
  },
  glowLevelDesc: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  glowCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  parentContent: {
    paddingVertical: Spacing.md,
  },
  parentNote: {
    fontSize: FontSizes.md,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  skipNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  skipNoteText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
  },
  summaryCard: {
    backgroundColor: "#1A1F2A",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: GlowColors.primary + "40",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  summaryAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  summaryInitial: {
    fontSize: 24,
    fontWeight: "700",
  },
  summaryHeaderInfo: {
    flex: 1,
  },
  summaryName: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.xs,
  },
  summaryLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  summaryLevelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryLevelText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: Spacing.lg,
  },
  summaryDetails: {
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
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
