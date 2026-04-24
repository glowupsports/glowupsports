import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Sentry from "@sentry/react-native";
import { Image } from "expo-image";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius, Typography, Backgrounds, GlowColors } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { apiRequest, getApiUrl, buildPhotoUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { MapLocationPickerModal, type MapLocationResult } from "@/components/MapLocationPickerModal";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
type ProfileData = {
  player: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    ballLevel?: string | null;
    dominantHand?: string | null;
    backhandType?: string | null;
    tshirtSize?: string | null;
    height?: number | null;
    bio?: string | null;
    medicalNotes?: string | null;
    parentEmail?: string | null;
    parentName?: string | null;
    parentPhone?: string | null;
    homeAddress?: string | null;
    homeLat?: number | null;
    homeLng?: number | null;
    isAdult?: boolean;
    displayName?: string | null;
    nickname?: string | null;
    tennisIdol?: string | null;
    playStyle?: string | null;
    favoriteShot?: string | null;
    shortTermGoal?: string | null;
    longTermDream?: string | null;
    weeklyCommitment?: string | null;
    openToPlay?: boolean | null;
    typicalPlayTimes?: string[] | null;
    preferredCities?: string[] | null;
    matchPreference?: string | null;
    preferredPlayType?: string | null;
  } | null;
};

const BALL_LEVELS = [
  { value: "blue", label: "Blue", color: "#4FC3F7" },
  { value: "red", label: "Red", color: "#FF4D4D" },
  { value: "orange", label: "Orange", color: "#FF851B" },
  { value: "green", label: "Green", color: Colors.dark.accentText },
  { value: "yellow", label: "Yellow", color: "#FFD700" },
  { value: "glow", label: "Glow", color: "#00E5FF" },
];

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const PLAY_STYLES = [
  { value: "baseline_warrior", label: "Baseline Warrior" },
  { value: "net_ninja", label: "Net Ninja" },
  { value: "serve_machine", label: "Serve Machine" },
  { value: "all_court_ace", label: "All-Court Ace" },
  { value: "counter_puncher", label: "Counter Puncher" },
  { value: "tactical_mastermind", label: "Tactical Mastermind" },
];

const FAVORITE_SHOTS = [
  { value: "forehand", label: "Forehand" },
  { value: "backhand", label: "Backhand" },
  { value: "serve", label: "Serve" },
  { value: "volley", label: "Volley" },
  { value: "dropshot", label: "Dropshot" },
];

const WEEKLY_COMMITMENTS = [
  { value: "1x", label: "1x" },
  { value: "2x", label: "2x" },
  { value: "3x", label: "3x" },
  { value: "4x+", label: "4x+" },
];

const PLAY_TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "weekend", label: "Weekend" },
];

const MATCH_PREFERENCES = [
  { value: "casual", label: "Casual" },
  { value: "training", label: "Training" },
  { value: "competitive", label: "Competitive" },
];

const PLAY_TYPES = [
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
  { value: "both", label: "Both" },
];

function PillChips({
  options,
  selected,
  onSelect,
  getColor,
}: {
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (val: string) => void;
  getColor?: (val: string) => string;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const isSelected = selected === opt.value;
        const accentColor = getColor ? getColor(opt.value) : Colors.dark.primary;
        const isLightAccent = accentColor === "#00E5FF" || accentColor === GlowColors.primary || accentColor === "#FFD700";
        return (
          <Pressable
            key={opt.value}
            style={[
              styles.pill,
              isSelected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            onPress={() => onSelect(opt.value)}
          >
            <Text
              style={[
                styles.pillText,
                isSelected && { color: isLightAccent ? Colors.dark.buttonText : (accentColor === Colors.dark.primary ? Colors.dark.buttonText : "#fff") },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiPillChips({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            style={[
              styles.pill,
              isSelected && { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
            ]}
            onPress={() => onToggle(opt.value)}
          >
            <Text
              style={[
                styles.pillText,
                isSelected && { color: Colors.dark.buttonText },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PlayerEditProfileScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data: profileData } = useQuery<ProfileData>({
    queryKey: ["/api/player/me/profile"],
  });

  const player = profileData?.player;

  // Photo
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to change your profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (): Promise<void> => {
    if (!photoUri) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      try {
        const { appendImageToFormData } = await import("@/lib/uploads");
        await appendImageToFormData(formData, "photo", photoUri);
      } catch (err) {
        Sentry.captureException(err, {
          tags: { area: "profile_photo_upload", phase: "form_data" },
          extra: { uri: photoUri },
        });
        throw new Error("Could not read selected photo");
      }
      const token = getAuthToken();
      const response = await fetch(`${getApiUrl()}/api/player/me/photo`, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const { parseUploadErrorResponse } = await import("@/lib/uploads");
        const { message } = await parseUploadErrorResponse(
          response,
          "Could not upload your photo. Please try again.",
        );
        throw new Error(message);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
    } finally {
      setPhotoUploading(false);
    }
  };

  // Personal Info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [height, setHeight] = useState("");
  const [tshirtSize, setTshirtSize] = useState<string | null>(null);
  const [homeAddress, setHomeAddress] = useState("");
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Game Profile
  const [ballLevel, setBallLevel] = useState<string | null>(null);
  const [dominantHand, setDominantHand] = useState<string | null>(null);
  const [backhandType, setBackhandType] = useState<string | null>(null);

  // About
  const [bio, setBio] = useState("");
  const [nickname, setNickname] = useState("");
  const [tennisIdol, setTennisIdol] = useState("");
  const [playStyle, setPlayStyle] = useState<string | null>(null);
  const [favoriteShot, setFavoriteShot] = useState<string | null>(null);

  // Goals & Motivation
  const [shortTermGoal, setShortTermGoal] = useState("");
  const [longTermDream, setLongTermDream] = useState("");
  const [weeklyCommitment, setWeeklyCommitment] = useState<string | null>(null);

  // Play Preferences
  const [openToPlay, setOpenToPlay] = useState(false);
  const [typicalPlayTimes, setTypicalPlayTimes] = useState<string[]>([]);
  const [matchPreference, setMatchPreference] = useState<string | null>(null);
  const [preferredPlayType, setPreferredPlayType] = useState<string | null>(null);
  const [preferredCities, setPreferredCities] = useState("");

  // Medical
  const [medicalNotes, setMedicalNotes] = useState("");
  const [showMedical, setShowMedical] = useState(false);

  // Parent / Guardian (minors only)
  const [parentEmail, setParentEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (player) {
      setName(player.name || "");
      setPhone(player.phone || "");
      setDateOfBirth(player.dateOfBirth || "");
      setHeight(player.height != null ? String(player.height) : "");
      setTshirtSize(player.tshirtSize || null);
      setHomeAddress(player.homeAddress || "");
      setHomeLat(player.homeLat ?? null);
      setHomeLng(player.homeLng ?? null);
      setBallLevel(player.ballLevel || null);
      setDominantHand(player.dominantHand || null);
      setBackhandType(player.backhandType || null);
      setBio(player.bio || "");
      setNickname(player.nickname || player.displayName || "");
      setTennisIdol(player.tennisIdol || "");
      setPlayStyle(player.playStyle || null);
      setFavoriteShot(player.favoriteShot || null);
      setShortTermGoal(player.shortTermGoal || "");
      setLongTermDream(player.longTermDream || "");
      setWeeklyCommitment(player.weeklyCommitment || null);
      setOpenToPlay(player.openToPlay ?? false);
      setTypicalPlayTimes(player.typicalPlayTimes || []);
      setMatchPreference(player.matchPreference || null);
      setPreferredPlayType(player.preferredPlayType || null);
      setPreferredCities((player.preferredCities || []).join(", "));
      setMedicalNotes(player.medicalNotes || "");
      if (player.medicalNotes) setShowMedical(true);
      setParentEmail(player.parentEmail || "");
      setParentName(player.parentName || "");
      setParentPhone(player.parentPhone || "");
    }
  }, [player]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const citiesArray = preferredCities
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        ballLevel: ballLevel || undefined,
        dominantHand: dominantHand || undefined,
        backhandType: backhandType || undefined,
        tshirtSize: tshirtSize || undefined,
        height: height ? parseInt(height, 10) : undefined,
        bio: bio.trim() || undefined,
        medicalNotes: medicalNotes.trim() || undefined,
        homeAddress: homeAddress.trim() || undefined,
        homeLat: homeLat ?? undefined,
        homeLng: homeLng ?? undefined,
        nickname: nickname.trim() || undefined,
        displayName: nickname.trim() || undefined,
        tennisIdol: tennisIdol.trim() || undefined,
        playStyle: playStyle || undefined,
        favoriteShot: favoriteShot || undefined,
        shortTermGoal: shortTermGoal.trim() || undefined,
        longTermDream: longTermDream.trim() || undefined,
        weeklyCommitment: weeklyCommitment || undefined,
        openToPlay,
        typicalPlayTimes: typicalPlayTimes.length > 0 ? typicalPlayTimes : undefined,
        matchPreference: matchPreference || undefined,
        preferredPlayType: preferredPlayType || undefined,
        preferredCities: citiesArray.length > 0 ? citiesArray : undefined,
      };

      const isMinor = player ? player.isAdult === false : false;
      if (isMinor) {
        body.parentEmail = parentEmail.trim() || undefined;
        body.parentName = parentName.trim() || undefined;
        body.parentPhone = parentPhone.trim() || undefined;
      }

      return apiRequest("PATCH", "/api/player/me/info", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: (err: Error) => {
      const msg = err.message || "";
      if (msg.startsWith("409") && msg.includes("nickname_taken")) {
        Alert.alert("Nickname Taken", "This nickname is already in use. Please choose a different one.");
      } else {
        Alert.alert("Error", "Failed to save profile. Please try again.");
      }
    },
  });

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    if (photoUri) {
      try {
        await uploadPhoto();
      } catch (err) {
        Sentry.captureException(err, {
          tags: { area: "profile_photo_upload", phase: "save" },
          extra: {
            uri: photoUri,
            uriScheme: photoUri.split(":")[0] || "unknown",
            message: err instanceof Error ? err.message : String(err),
          },
        });
        Alert.alert("Photo Error", "Failed to upload photo. Your other changes will still be saved.");
      }
    }
    updateMutation.mutate();
  };

  const togglePlayTime = (val: string) => {
    setTypicalPlayTimes((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]
    );
  };

  const selectedDate = dateOfBirth ? new Date(dateOfBirth) : new Date();

  const handleDateChange = (_event: unknown, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (date) {
      setDateOfBirth(date.toISOString().split("T")[0]);
    }
  };

  const formattedDob = dateOfBirth
    ? new Date(dateOfBirth + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Select date";

  const isMinor = player ? player.isAdult === false : false;

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      {/* Inline Header */}
      <View style={styles.inlineHeader}>
        <Pressable onPress={() => navigation.goBack()} style={styles.inlineHeaderBtn}>
          <Text style={styles.inlineHeaderCancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.inlineHeaderTitle}>Edit Profile</Text>
        <Pressable
          onPress={handleSave}
          disabled={updateMutation.isPending}
          style={[styles.inlineHeaderBtn, updateMutation.isPending && styles.disabledBtn]}
        >
          <Text style={styles.inlineHeaderSave}>
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        {/* Profile Photo */}
        <View style={styles.photoSection}>
          <Pressable onPress={pickPhoto} style={styles.photoContainer}>
            {(photoUri || buildPhotoUrl(player?.profilePhotoUrl)) ? (
              <Image
                source={{ uri: photoUri || buildPhotoUrl(player?.profilePhotoUrl)! }}
                style={styles.photoAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="person" size={40} color={Colors.dark.textMuted} />
              </View>
            )}
            <View style={styles.photoBadge}>
              {photoUploading ? (
                <ActivityIndicator size="small" color={Colors.dark.buttonText} />
              ) : (
                <Ionicons name="camera" size={15} color={Colors.dark.buttonText} />
              )}
            </View>
          </Pressable>
          <Text style={styles.photoHint}>Tap to change photo</Text>
        </View>

        {/* Personal Info */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="person-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.sectionTitle}>Personal Info</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={[styles.input, styles.readOnly]}>
              <Text style={styles.readOnlyText}>{player?.email || ""}</Text>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+971 50 123 4567"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <Pressable
              style={[styles.input, styles.dateInput]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: dateOfBirth ? Colors.dark.text : Colors.dark.textMuted }}>
                {formattedDob}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                onChange={handleDateChange}
              />
            )}
            {showDatePicker && Platform.OS === "ios" && (
              <Pressable
                onPress={() => setShowDatePicker(false)}
                style={styles.doneBtn}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={height}
              onChangeText={setHeight}
              placeholder="175"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>T-Shirt Size</Text>
            <PillChips
              options={TSHIRT_SIZES.map((s) => ({ value: s, label: s }))}
              selected={tshirtSize}
              onSelect={setTshirtSize}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Home Address</Text>
            <AddressAutocomplete
              initialValue={homeAddress}
              placeholder="Search for your home address..."
              onSelect={(result) => {
                setHomeAddress(result.address);
                setHomeLat(result.lat);
                setHomeLng(result.lng);
              }}
            />
            <Pressable
              style={styles.mapPickerBtn}
              onPress={() => setShowMapPicker(true)}
            >
              <Ionicons name="map-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.mapPickerText}>Pick on map</Text>
            </Pressable>
          </View>
        </View>

        {/* Game Profile */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="tennisball-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.sectionTitle}>Game Profile</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Ball Level</Text>
            <PillChips
              options={BALL_LEVELS}
              selected={ballLevel}
              onSelect={setBallLevel}
              getColor={(val) => BALL_LEVELS.find((b) => b.value === val)?.color ?? Colors.dark.primary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Dominant Hand</Text>
            <PillChips
              options={[
                { value: "right", label: "Right" },
                { value: "left", label: "Left" },
              ]}
              selected={dominantHand}
              onSelect={setDominantHand}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Backhand</Text>
            <PillChips
              options={[
                { value: "single", label: "Single" },
                { value: "double", label: "Double" },
              ]}
              selected={backhandType}
              onSelect={setBackhandType}
            />
          </View>
        </View>

        {/* About You */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="happy-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.sectionTitle}>About You</Text>
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Bio</Text>
              <Text style={styles.charCount}>{bio.length}/500</Text>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, 500))}
              placeholder="Tell others about yourself..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Nickname</Text>
              <Text style={styles.charCount}>{nickname.length}/50</Text>
            </View>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={(t) => setNickname(t.slice(0, 50))}
              placeholder="Your fun nickname in the app"
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Tennis Idol</Text>
            <TextInput
              style={styles.input}
              value={tennisIdol}
              onChangeText={(t) => setTennisIdol(t.slice(0, 100))}
              placeholder="Federer, Nadal, Alcaraz..."
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Play Style</Text>
            <PillChips
              options={PLAY_STYLES}
              selected={playStyle}
              onSelect={setPlayStyle}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Favorite Shot</Text>
            <PillChips
              options={FAVORITE_SHOTS}
              selected={favoriteShot}
              onSelect={setFavoriteShot}
            />
          </View>
        </View>

        {/* Goals & Motivation */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="rocket-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.sectionTitle}>Goals & Motivation</Text>
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>3-Month Goal</Text>
              <Text style={styles.charCount}>{shortTermGoal.length}/500</Text>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={shortTermGoal}
              onChangeText={(t) => setShortTermGoal(t.slice(0, 500))}
              placeholder="What do you want to achieve in the next 3 months?"
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Long-Term Dream</Text>
              <Text style={styles.charCount}>{longTermDream.length}/500</Text>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={longTermDream}
              onChangeText={(t) => setLongTermDream(t.slice(0, 500))}
              placeholder="Your biggest tennis dream..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Weekly Sessions</Text>
            <PillChips
              options={WEEKLY_COMMITMENTS}
              selected={weeklyCommitment}
              onSelect={setWeeklyCommitment}
            />
          </View>
        </View>

        {/* Play Preferences */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="people-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.sectionTitle}>Play Preferences</Text>
          </View>

          <View style={[styles.formGroup, styles.toggleRow]}>
            <View style={styles.toggleTextGroup}>
              <Text style={styles.label}>Open to Play</Text>
              <Text style={styles.toggleHint}>Others can find you for matches</Text>
            </View>
            <Switch
              value={openToPlay}
              onValueChange={setOpenToPlay}
              trackColor={{ false: Colors.dark.border, true: Colors.dark.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Preferred Play Type</Text>
            <PillChips
              options={PLAY_TYPES}
              selected={preferredPlayType}
              onSelect={setPreferredPlayType}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Match Preference</Text>
            <PillChips
              options={MATCH_PREFERENCES}
              selected={matchPreference}
              onSelect={setMatchPreference}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Typical Play Times</Text>
            <MultiPillChips
              options={PLAY_TIMES}
              selected={typicalPlayTimes}
              onToggle={togglePlayTime}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Preferred Cities</Text>
            <TextInput
              style={styles.input}
              value={preferredCities}
              onChangeText={setPreferredCities}
              placeholder="Dubai, Abu Dhabi, Sharjah..."
              placeholderTextColor={Colors.dark.textMuted}
            />
            <Text style={styles.fieldHint}>Separate multiple cities with commas</Text>
          </View>
        </View>

        {/* Medical */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="medkit-outline" size={12} color={Colors.dark.textMuted} />
            <Text style={styles.sectionTitle}>Medical (Optional)</Text>
          </View>

          {!showMedical && !medicalNotes ? (
            <Pressable
              style={styles.addMedicalBtn}
              onPress={() => setShowMedical(true)}
            >
              <Text style={styles.addMedicalText}>Add medical notes</Text>
            </Pressable>
          ) : (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Medical Notes</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={medicalNotes}
                onChangeText={setMedicalNotes}
                placeholder="Any relevant medical information..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}
        </View>

        {/* Parent / Guardian (minors only) */}
        {isMinor ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="shield-outline" size={12} color={Colors.dark.textMuted} />
              <Text style={styles.sectionTitle}>Parent / Guardian</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Name</Text>
              <TextInput
                style={styles.input}
                value={parentName}
                onChangeText={setParentName}
                placeholder="Parent or guardian name"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Phone</Text>
              <TextInput
                style={styles.input}
                value={parentPhone}
                onChangeText={setParentPhone}
                placeholder="+971 50 123 4567"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Email</Text>
              <TextInput
                style={styles.input}
                value={parentEmail}
                onChangeText={setParentEmail}
                placeholder="parent@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <MapLocationPickerModal
        visible={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onConfirm={(result: MapLocationResult) => {
          setHomeAddress(result.address);
          setHomeLat(result.lat);
          setHomeLng(result.lng);
          setShowMapPicker(false);
        }}
        initialLat={homeLat}
        initialLng={homeLng}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  inlineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Backgrounds.card,
  },
  inlineHeaderBtn: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
  },
  inlineHeaderTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  inlineHeaderCancel: {
    ...Typography.body,
    color: Colors.dark.textSecondary,
  },
  inlineHeaderSave: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  sectionCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  charCount: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    color: Colors.dark.text,
    ...Typography.body,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  multilineInput: {
    minHeight: 90,
    paddingTop: Spacing.sm + 2,
  },
  readOnly: {
    opacity: 0.6,
    justifyContent: "center",
  },
  readOnlyText: {
    color: Colors.dark.textSecondary,
    ...Typography.body,
  },
  dateInput: {
    justifyContent: "center",
  },
  doneBtn: {
    alignItems: "flex-end",
    paddingVertical: Spacing.xs,
  },
  doneBtnText: {
    color: Colors.dark.primary,
    ...Typography.body,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full ?? 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: Colors.dark.chipBackground,
  },
  pillText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  addMedicalBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addMedicalText: {
    color: Colors.dark.primary,
    ...Typography.body,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  toggleTextGroup: {
    flex: 1,
    marginRight: Spacing.md,
  },
  toggleHint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  fieldHint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  mapPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  mapPickerText: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  photoContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    position: "relative",
  },
  photoAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  photoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.dark.chipBackgroundStrong,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  photoBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  photoHint: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
}));
