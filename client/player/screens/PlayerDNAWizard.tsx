import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, GlowColors, BorderRadius, FontSizes, Backgrounds } from "@/constants/theme";
import { TshirtSize } from "@shared/schema";
import { useNavigation } from "@react-navigation/native";

const DNA_CARDS = [
  { id: "hand",  title: "Dominant Hand",   subtitle: "Which hand do you play with?",           icon: "hand-left-outline" },
  { id: "body",  title: "Your Stats",       subtitle: "Help us get the right sizes for you",     icon: "body-outline" },
  { id: "style", title: "Play Style",       subtitle: "How would you describe your game?",       icon: "tennisball-outline" },
  { id: "idol",  title: "Tennis Idol",      subtitle: "Who inspires your game the most?",        icon: "star-outline" },
  { id: "love",  title: "What You Love",    subtitle: "Pick up to 3 things you love about tennis", icon: "heart-outline" },
  { id: "goals", title: "Your Goals",       subtitle: "Where do you want your game to go?",      icon: "flag-outline" },
  { id: "times", title: "When You Play",    subtitle: "When do you usually hit the courts?",     icon: "time-outline" },
  { id: "photo", title: "Profile Photo",    subtitle: "Let coaches recognize you on court",      icon: "camera-outline" },
];

const PLAY_STYLES = [
  { id: "baseline_warrior",     label: "Baseline Warrior",      desc: "Strong & consistent from the back",    icon: "shield-outline" },
  { id: "net_ninja",            label: "Net Ninja",             desc: "Quick and deadly at the net",          icon: "flash-outline" },
  { id: "serve_machine",        label: "Serve Machine",         desc: "Big serve is your greatest weapon",    icon: "arrow-up-circle-outline" },
  { id: "all_court_ace",        label: "All-Court Ace",         desc: "Adapt to any situation on court",      icon: "grid-outline" },
  { id: "counter_puncher",      label: "Counter Puncher",       desc: "Patient, waiting for opponent errors", icon: "repeat-outline" },
  { id: "tactical_mastermind",  label: "Tactical Mastermind",   desc: "Smart placement wins you points",      icon: "analytics-outline" },
];

const TENNIS_IDOLS = [
  "Roger Federer", "Rafael Nadal", "Novak Djokovic", "Carlos Alcaraz",
  "Jannik Sinner", "Serena Williams", "Iga Swiatek", "Naomi Osaka",
  "Aryna Sabalenka", "Coco Gauff", "Andy Murray", "Stan Wawrinka",
];

const ENJOYMENT_TAGS = [
  "Competing", "Fitness", "Meeting people", "Mental challenge",
  "Learning skills", "Team spirit", "Fun & social", "Match play",
  "Drills", "Tournaments", "Casual rallies", "Improving technique",
];

const PLAY_TIMES = [
  "Early morning (6-8am)", "Morning (8-11am)", "Midday (11am-2pm)",
  "Afternoon (2-5pm)", "Evening (5-8pm)", "Night (8pm+)",
  "Weekdays", "Weekends only",
];

const TSHIRT_OPTIONS: TshirtSize[] = ["XS", "S", "M", "L", "XL", "XXL"];

interface DNAState {
  dominantHand: string | null;
  backhandType: string | null;
  height: string;
  tshirtSize: TshirtSize | null;
  playStyle: string | null;
  tennisIdol: string | null;
  customIdol: string;
  enjoymentTags: string[];
  shortTermGoal: string;
  longTermDream: string;
  typicalPlayTimes: string[];
  profilePhotoUri: string | null;
}

interface PlayerProfileResponse {
  player: {
    id: string;
    dominantHand?: string | null;
    backhandType?: string | null;
    height?: number | null;
    tshirtSize?: string | null;
    playStyle?: string | null;
    tennisIdol?: string | null;
    enjoymentTags?: string[] | null;
    shortTermGoal?: string | null;
    longTermDream?: string | null;
    typicalPlayTimes?: string[] | null;
    profilePhotoUrl?: string | null;
  } | null;
}

interface Props {
  onComplete?: () => void;
}

export default function PlayerDNAWizardScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [currentCard, setCurrentCard] = useState(0);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showIdolInput, setShowIdolInput] = useState(false);

  const [dna, setDNA] = useState<DNAState>({
    dominantHand: null,
    backhandType: null,
    height: "",
    tshirtSize: null,
    playStyle: null,
    tennisIdol: null,
    customIdol: "",
    enjoymentTags: [],
    shortTermGoal: "",
    longTermDream: "",
    typicalPlayTimes: [],
    profilePhotoUri: null,
  });

  const { data: profileData, isLoading: profileLoading } = useQuery<PlayerProfileResponse>({
    queryKey: ["/api/player/me/profile"],
    staleTime: 60000,
  });

  useEffect(() => {
    const p = profileData?.player;
    if (!p) return;
    setDNA(prev => ({
      ...prev,
      dominantHand: p.dominantHand ?? null,
      backhandType: p.backhandType ?? null,
      height: p.height ? String(p.height) : "",
      tshirtSize: (p.tshirtSize as TshirtSize) ?? null,
      playStyle: p.playStyle ?? null,
      tennisIdol: TENNIS_IDOLS.includes(p.tennisIdol ?? "") ? (p.tennisIdol ?? null) : p.tennisIdol ? null : null,
      customIdol: TENNIS_IDOLS.includes(p.tennisIdol ?? "") ? "" : (p.tennisIdol ?? ""),
      enjoymentTags: p.enjoymentTags ?? [],
      shortTermGoal: p.shortTermGoal ?? "",
      longTermDream: p.longTermDream ?? "",
      typicalPlayTimes: p.typicalPlayTimes ?? [],
      profilePhotoUri: p.profilePhotoUrl ?? null,
    }));
    if (p.tennisIdol && !TENNIS_IDOLS.includes(p.tennisIdol)) {
      setShowIdolInput(true);
    }
  }, [profileData]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", "/api/player/me/info", payload);
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    },
  });

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      dominantHand: dna.dominantHand || null,
      backhandType: dna.backhandType || null,
      height: dna.height ? parseInt(dna.height, 10) : null,
      tshirtSize: dna.tshirtSize || null,
      playStyle: dna.playStyle || null,
      tennisIdol: showIdolInput
        ? (dna.customIdol.trim() || null)
        : (dna.tennisIdol || null),
      enjoymentTags: dna.enjoymentTags.length > 0 ? dna.enjoymentTags : null,
      shortTermGoal: dna.shortTermGoal.trim() || null,
      longTermDream: dna.longTermDream.trim() || null,
      typicalPlayTimes: dna.typicalPlayTimes.length > 0 ? dna.typicalPlayTimes : null,
    };
    return payload;
  };

  const handleSaveAndClose = async () => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync(buildPayload());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      Alert.alert("Oops", "Could not save your DNA profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentCard < DNA_CARDS.length - 1) {
      setCurrentCard(prev => prev + 1);
    } else {
      handleSaveAndClose();
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentCard > 0) setCurrentCard(prev => prev - 1);
  };

  const pickPhoto = async (useCamera: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const permFn = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await permFn();
    if (status !== "granted") return;
    const launchFn = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launchFn({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setDNA(prev => ({ ...prev, profilePhotoUri: uri }));
      setPhotoUploading(true);
      try {
        const formData = new FormData();
        if (Platform.OS === "web") {
          const blobRes = await fetch(uri);
          const blob = await blobRes.blob();
          const ext = blob.type.split("/")[1] || "png";
          const webFile = new window.File([blob], `photo.${ext}`, { type: blob.type });
          formData.append("photo", webFile);
        } else {
          const filename = uri.split("/").pop() || "photo.jpg";
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1].toLowerCase().replace("jpg", "jpeg")}` : "image/jpeg";
          (formData as any).append("photo", { uri, name: filename, type });
        }
        const authToken = await import("@/lib/auth").then(m => m.getAuthToken());
        const uploadRes = await fetch(
          new URL("/api/player/me/photo", await import("@/lib/query-client").then(m => m.getApiUrl())).toString(),
          { method: "POST", headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }, body: formData }
        );
        if (uploadRes.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (err) {
        console.warn("[DNA Wizard] Photo upload error:", err);
      } finally {
        setPhotoUploading(false);
      }
    }
  };

  const toggleEnjoymentTag = (tag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDNA(prev => {
      const tags = prev.enjoymentTags;
      if (tags.includes(tag)) return { ...prev, enjoymentTags: tags.filter(t => t !== tag) };
      if (tags.length >= 3) return prev;
      return { ...prev, enjoymentTags: [...tags, tag] };
    });
  };

  const togglePlayTime = (time: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDNA(prev => {
      const times = prev.typicalPlayTimes;
      if (times.includes(time)) return { ...prev, typicalPlayTimes: times.filter(t => t !== time) };
      return { ...prev, typicalPlayTimes: [...times, time] };
    });
  };

  const progress = ((currentCard + 1) / DNA_CARDS.length) * 100;
  const card = DNA_CARDS[currentCard];
  const isLastCard = currentCard === DNA_CARDS.length - 1;

  const renderCardContent = () => {
    switch (card.id) {
      case "hand":
        return (
          <Animated.View key={`hand-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <View style={styles.choiceRow}>
              {[
                { id: "right", label: "Right Hand", icon: "hand-right-outline" },
                { id: "left",  label: "Left Hand",  icon: "hand-left-outline" },
              ].map(opt => (
                <Pressable
                  key={opt.id}
                  style={[styles.choiceCard, dna.dominantHand === opt.id && styles.choiceCardActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDNA(prev => ({ ...prev, dominantHand: opt.id })); }}
                >
                  <Ionicons name={opt.icon as any} size={36} color={dna.dominantHand === opt.id ? "#000" : Colors.dark.textMuted} />
                  <Text style={[styles.choiceLabel, dna.dominantHand === opt.id && styles.choiceLabelActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            {dna.dominantHand ? (
              <Animated.View entering={FadeInDown.duration(300)} style={styles.subSection}>
                <Text style={styles.subSectionLabel}>Backhand style</Text>
                <View style={styles.choiceRow}>
                  {[
                    { id: "single", label: "One-Handed", icon: "hand-right-outline" },
                    { id: "double", label: "Two-Handed", icon: "people-outline" },
                  ].map(opt => (
                    <Pressable
                      key={opt.id}
                      style={[styles.choiceCard, dna.backhandType === opt.id && styles.choiceCardActive]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDNA(prev => ({ ...prev, backhandType: opt.id })); }}
                    >
                      <Ionicons name={opt.icon as any} size={28} color={dna.backhandType === opt.id ? "#000" : Colors.dark.textMuted} />
                      <Text style={[styles.choiceLabel, dna.backhandType === opt.id && styles.choiceLabelActive]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        );

      case "body":
        return (
          <Animated.View key={`body-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <View style={styles.subSection}>
              <Text style={styles.subSectionLabel}>Height (cm)</Text>
              <View style={styles.heightRow}>
                <Pressable
                  style={styles.heightBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDNA(prev => ({ ...prev, height: String(Math.max(50, (parseInt(prev.height || "0") || 0) - 1) ) })); }}
                >
                  <Ionicons name="remove" size={22} color={Colors.dark.text} />
                </Pressable>
                <TextInput
                  style={styles.heightInput}
                  value={dna.height}
                  onChangeText={v => setDNA(prev => ({ ...prev, height: v.replace(/[^0-9]/g, "") }))}
                  keyboardType="number-pad"
                  placeholder="170"
                  placeholderTextColor={Colors.dark.textMuted}
                  maxLength={3}
                />
                <Pressable
                  style={styles.heightBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDNA(prev => ({ ...prev, height: String(Math.min(250, (parseInt(prev.height || "0") || 0) + 1)) })); }}
                >
                  <Ionicons name="add" size={22} color={Colors.dark.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionLabel}>T-shirt size</Text>
              <View style={styles.chipWrap}>
                {TSHIRT_OPTIONS.map(size => (
                  <Pressable
                    key={size}
                    style={[styles.chip, dna.tshirtSize === size && styles.chipActive]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDNA(prev => ({ ...prev, tshirtSize: size })); }}
                  >
                    <Text style={[styles.chipText, dna.tshirtSize === size && styles.chipTextActive]}>{size}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>
        );

      case "style":
        return (
          <Animated.View key={`style-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            {PLAY_STYLES.map(style => (
              <Pressable
                key={style.id}
                style={[styles.styleCard, dna.playStyle === style.id && styles.styleCardActive]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDNA(prev => ({ ...prev, playStyle: style.id })); }}
              >
                <View style={[styles.styleIcon, dna.playStyle === style.id && styles.styleIconActive]}>
                  <Ionicons name={style.icon as any} size={22} color={dna.playStyle === style.id ? "#000" : Colors.dark.textMuted} />
                </View>
                <View style={styles.styleTextWrap}>
                  <Text style={[styles.styleLabel, dna.playStyle === style.id && styles.styleLabelActive]}>{style.label}</Text>
                  <Text style={styles.styleDesc}>{style.desc}</Text>
                </View>
                {dna.playStyle === style.id ? <Ionicons name="checkmark-circle" size={22} color={GlowColors.primary} /> : null}
              </Pressable>
            ))}
          </Animated.View>
        );

      case "idol":
        return (
          <Animated.View key={`idol-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <View style={styles.chipWrap}>
              {TENNIS_IDOLS.map(idol => (
                <Pressable
                  key={idol}
                  style={[styles.chip, !showIdolInput && dna.tennisIdol === idol && styles.chipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowIdolInput(false);
                    setDNA(prev => ({ ...prev, tennisIdol: idol }));
                  }}
                >
                  <Text style={[styles.chipText, !showIdolInput && dna.tennisIdol === idol && styles.chipTextActive]}>{idol}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.chip, showIdolInput && styles.chipActive]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowIdolInput(true); setDNA(prev => ({ ...prev, tennisIdol: null })); }}
              >
                <Text style={[styles.chipText, showIdolInput && styles.chipTextActive]}>Other</Text>
              </Pressable>
            </View>
            {showIdolInput ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.subSection}>
                <TextInput
                  style={styles.textInput}
                  value={dna.customIdol}
                  onChangeText={v => setDNA(prev => ({ ...prev, customIdol: v }))}
                  placeholder="Who's your tennis idol?"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoFocus
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        );

      case "love":
        return (
          <Animated.View key={`love-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <Text style={styles.countHint}>{dna.enjoymentTags.length}/3 selected</Text>
            <View style={styles.chipWrap}>
              {ENJOYMENT_TAGS.map(tag => {
                const selected = dna.enjoymentTags.includes(tag);
                const disabled = !selected && dna.enjoymentTags.length >= 3;
                return (
                  <Pressable
                    key={tag}
                    style={[styles.chip, selected && styles.chipActive, disabled && styles.chipDisabled]}
                    onPress={() => { if (!disabled) toggleEnjoymentTag(tag); }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        );

      case "goals":
        return (
          <Animated.View key={`goals-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <View style={styles.subSection}>
              <Text style={styles.subSectionLabel}>3-month goal</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMulti]}
                value={dna.shortTermGoal}
                onChangeText={v => setDNA(prev => ({ ...prev, shortTermGoal: v }))}
                placeholder="e.g. Improve my serve, win my first match..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={styles.subSection}>
              <Text style={styles.subSectionLabel}>Long-term tennis dream (optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textInputMulti]}
                value={dna.longTermDream}
                onChangeText={v => setDNA(prev => ({ ...prev, longTermDream: v }))}
                placeholder="e.g. Reach club champion level, play tournaments..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>
          </Animated.View>
        );

      case "times":
        return (
          <Animated.View key={`times-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <View style={styles.chipWrap}>
              {PLAY_TIMES.map(time => {
                const selected = dna.typicalPlayTimes.includes(time);
                return (
                  <Pressable
                    key={time}
                    style={[styles.chip, styles.chipWide, selected && styles.chipActive]}
                    onPress={() => togglePlayTime(time)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{time}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        );

      case "photo":
        return (
          <Animated.View key={`photo-${currentCard}`} entering={FadeInDown.duration(300)} style={styles.cardContent}>
            <View style={styles.avatarWrap}>
              {dna.profilePhotoUri ? (
                <Image source={{ uri: dna.profilePhotoUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={60} color={Colors.dark.textMuted} />
                </View>
              )}
              {photoUploading ? (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="small" color={GlowColors.primary} />
                </View>
              ) : null}
            </View>
            <View style={styles.photoButtons}>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto(true)}>
                <Ionicons name="camera-outline" size={22} color={GlowColors.primary} />
                <Text style={styles.photoBtnText}>Take Photo</Text>
              </Pressable>
              <Pressable style={styles.photoBtn} onPress={() => pickPhoto(false)}>
                <Ionicons name="images-outline" size={22} color={GlowColors.primary} />
                <Text style={styles.photoBtnText}>Choose from Gallery</Text>
              </Pressable>
            </View>
          </Animated.View>
        );

      default:
        return null;
    }
  };

  if (profileLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={GlowColors.primary} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.goBack();
        }}>
          <Ionicons name="close" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Player DNA</Text>
          <Text style={styles.headerSub}>{currentCard + 1} of {DNA_CARDS.length}</Text>
        </View>
        <Pressable style={styles.saveTextBtn} onPress={handleSaveAndClose} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color={GlowColors.primary} /> : <Text style={styles.saveText}>Save</Text>}
        </Pressable>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name={card.icon as any} size={28} color={GlowColors.primary} />
          </View>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
        </Animated.View>

        {renderCardContent()}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {currentCard > 0 ? (
          <Pressable style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={20} color={Colors.dark.textMuted} />
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        ) : <View style={{ flex: 1 }} />}

        <Pressable style={styles.nextBtn} onPress={handleNext} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>{isLastCard ? "Finish" : "Next"}</Text>
              <Ionicons name={isLastCard ? "checkmark" : "chevron-forward"} size={20} color="#000" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  saveTextBtn: {
    width: 56,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  saveText: {
    fontSize: FontSizes.sm,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  progressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  progressFill: {
    height: "100%",
    backgroundColor: GlowColors.primary,
    borderRadius: 2,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  cardHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  cardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(200,255,61,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSizes.xl,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  cardContent: {
    gap: Spacing.md,
  },
  choiceRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  choiceCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  choiceCardActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  choiceLabel: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textAlign: "center",
  },
  choiceLabelActive: {
    color: "#000",
  },
  subSection: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  subSectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textSecondary || Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  heightBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  heightInput: {
    flex: 1,
    height: 52,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipWide: {
    paddingHorizontal: Spacing.lg,
  },
  chipActive: {
    backgroundColor: GlowColors.primary,
    borderColor: GlowColors.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#000",
    fontWeight: "700",
  },
  countHint: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  styleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  styleCardActive: {
    borderColor: GlowColors.primary,
    backgroundColor: "rgba(200,255,61,0.08)",
  },
  styleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  styleIconActive: {
    backgroundColor: GlowColors.primary,
  },
  styleTextWrap: {
    flex: 1,
  },
  styleLabel: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  styleLabelActive: {
    color: GlowColors.primary,
  },
  styleDesc: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: Colors.dark.text,
    fontSize: FontSizes.md,
    padding: Spacing.md,
  },
  textInputMulti: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  avatarWrap: {
    alignSelf: "center",
    marginBottom: Spacing.xl,
    position: "relative",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: GlowColors.primary,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoButtons: {
    gap: Spacing.md,
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: Spacing.lg,
  },
  photoBtnText: {
    fontSize: FontSizes.md,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: Spacing.md,
  },
  backBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  backBtnText: {
    fontSize: FontSizes.md,
    color: Colors.dark.textMuted,
  },
  nextBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  nextBtnText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: "#000",
  },
});
