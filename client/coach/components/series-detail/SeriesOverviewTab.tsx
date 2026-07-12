import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Switch, Platform, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { openDirections } from "@/lib/maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing } from "@/constants/theme";
import { formatCredits } from "@/lib/dateUtils";
import { styles } from "./seriesDetailStyles";
import { DAY_NAMES, getBallLevelColor } from "./utils";
import type { SeriesDetail, Player, CourtOption } from "./types";
import { TennisBallSpinner } from "@/components/TennisBallSpinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, buildPhotoUrl, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120];

export interface ScheduleDraft {
  dayOfWeek: number;
  startTime: string;
  duration: number;
}

interface SeriesOverviewTabProps {
  series: SeriesDetail;
  accentColor: string;
  tz: string;
  formatDate: (dateStr: string) => string;
  formatTime: (timeStr: string) => string;
  courtsData: CourtOption[] | undefined;
  showSeriesCourtPicker: boolean;
  setShowSeriesCourtPicker: (v: boolean) => void;
  changeSeriesCourtMutation: { isPending: boolean; mutate: (courtId: string) => void };
  playerActionMenuId: string | null;
  setPlayerActionMenuId: (id: string | null) => void;
  editingMaxPlayers: boolean;
  setEditingMaxPlayers: (v: boolean) => void;
  newMaxPlayers: string;
  setNewMaxPlayers: (v: string) => void;
  handleSaveMaxPlayers: () => void;
  handleAddPlayerPress: () => void;
  handlePlayerTap: (playerId: string) => void;
  pausingPlayerId: string | null;
  removingPlayerId: string | null;
  handleEditJoinDate: (player: Player) => void;
  handleRestoreIdentity: (player: Player) => void;
  handlePausePlayer: (playerId: string) => void;
  handleRemovePlayer: (playerId: string) => void;
  handleReactivatePlayer: (playerId: string) => void;
  setShowSmartFill: (v: boolean) => void;
  extendingSeries: boolean;
  handleExtendSeries: () => void;
  addingExtraLesson: boolean;
  setShowExtraLessonModal: (v: boolean) => void;
  completingSeries: boolean;
  handleCompleteSeries: () => void;
  deletingSeries: boolean;
  handleDeleteSeries: () => void;
  handleTogglePublic: (value: boolean) => void;
  handleSaveDropInPrice: (price: string) => boolean;
  updatingVisibility: boolean;
  onRequestScheduleChange: (draft: ScheduleDraft) => void;
  scheduleSaving: boolean;
  onSendReminder?: () => void;
}

export function SeriesOverviewTab({
  series,
  accentColor,
  tz,
  formatDate,
  formatTime,
  courtsData,
  showSeriesCourtPicker,
  setShowSeriesCourtPicker,
  changeSeriesCourtMutation,
  playerActionMenuId,
  setPlayerActionMenuId,
  editingMaxPlayers,
  setEditingMaxPlayers,
  newMaxPlayers,
  setNewMaxPlayers,
  handleSaveMaxPlayers,
  handleAddPlayerPress,
  handlePlayerTap,
  pausingPlayerId,
  removingPlayerId,
  handleEditJoinDate,
  handleRestoreIdentity,
  handlePausePlayer,
  handleRemovePlayer,
  handleReactivatePlayer,
  setShowSmartFill,
  extendingSeries,
  handleExtendSeries,
  addingExtraLesson,
  setShowExtraLessonModal,
  completingSeries,
  handleCompleteSeries,
  deletingSeries,
  handleDeleteSeries,
  handleTogglePublic,
  handleSaveDropInPrice,
  updatingVisibility,
  onRequestScheduleChange,
  scheduleSaving,
  onSendReminder,
}: SeriesOverviewTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingDropInPrice, setEditingDropInPrice] = useState(false);
  const [dropInPriceInput, setDropInPriceInput] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  const resolvedCurrentPhoto = series.imageUrl
    ? buildPhotoUrl(series.imageUrl)
    : null;
  const displayPhotoUri = localPhotoUri || resolvedCurrentPhoto;

  const uploadPhotoMutation = useMutation({
    mutationFn: async (uri: string) => {
      const formData = new FormData();
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      formData.append("photo", { uri, name: `series-cover.${ext}`, type: mime } as any);
      const url = new URL(`/api/coach/series/${series.id}/photo`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      // Keep the preview showing via the resolved (signed) URL returned by the server
      if (data?.resolvedUrl) setLocalPhotoUri(data.resolvedUrl);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${series.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
    },
    onError: (err: any) => {
      setLocalPhotoUri(null);
      Alert.alert("Upload Failed", err.message || "Could not upload photo");
    },
    onSettled: () => setPhotoUploading(false),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/coach/series/${series.id}/photo`);
    },
    onSuccess: () => {
      setLocalPhotoUri(null);
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${series.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/series"] });
    },
    onError: () => Alert.alert("Error", "Could not remove photo"),
  });

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Photo library access is needed to upload a cover photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setPhotoUploading(true);
    uploadPhotoMutation.mutate(uri);
  };

  // Camp inclusions & original price state (Task #2035)
  const [inclusionItems, setInclusionItems] = useState<string[]>(series.inclusions ?? []);
  const [newInclusionText, setNewInclusionText] = useState("");
  const [editingOriginalPrice, setEditingOriginalPrice] = useState(false);
  const [originalPriceInput, setOriginalPriceInput] = useState(series.originalPrice ?? "");

  useEffect(() => {
    setInclusionItems(series.inclusions ?? []);
    setOriginalPriceInput(series.originalPrice ?? "");
  }, [series.id, series.inclusions, series.originalPrice]);

  const saveCampFieldsMutation = useMutation({
    mutationFn: async (data: { inclusions?: string[]; originalPrice?: string | null }) => {
      return apiRequest("PATCH", `/api/coach/series/${series.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${series.id}`] });
    },
  });

  // ------- Inline schedule editor state -------
  const [draftDay, setDraftDay] = useState<number>(series.dayOfWeek);
  const [draftStartTime, setDraftStartTime] = useState<string>(series.startTime);
  const [draftDuration, setDraftDuration] = useState<number>(series.duration);
  const [expandedScheduleField, setExpandedScheduleField] = useState<
    "day" | "time" | "duration" | null
  >(null);
  const [showNativeTimePicker, setShowNativeTimePicker] = useState(false);

  useEffect(() => {
    setDraftDay(series.dayOfWeek);
    setDraftStartTime(series.startTime);
    setDraftDuration(series.duration);
    setExpandedScheduleField(null);
    setShowNativeTimePicker(false);
  }, [series.id, series.dayOfWeek, series.startTime, series.duration]);

  const draftTimeAsDate = useMemo(() => {
    const [h, m] = (draftStartTime || "00:00").split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }, [draftStartTime]);

  const scheduleHasChanges =
    draftDay !== series.dayOfWeek ||
    draftStartTime !== series.startTime ||
    draftDuration !== series.duration;

  const handleSaveSchedule = () => {
    if (!scheduleHasChanges) return;
    onRequestScheduleChange({
      dayOfWeek: draftDay,
      startTime: draftStartTime,
      duration: draftDuration,
    });
  };

  const handleResetSchedule = () => {
    setDraftDay(series.dayOfWeek);
    setDraftStartTime(series.startTime);
    setDraftDuration(series.duration);
    setExpandedScheduleField(null);
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderColor: accentColor }]}>
          <Text style={[styles.statValue, { color: accentColor }]}>
            {series.stats.completedSessions}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statCard, { borderColor: Colors.dark.successNeon }]}>
          <Text style={[styles.statValue, { color: Colors.dark.successNeon }]}>
            {series.stats.upcomingSessions}
          </Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={[styles.statCard, { borderColor: Colors.dark.accentWarning }]}>
          <Text style={[styles.statValue, { color: Colors.dark.accentWarning }]}>
            {series.stats.cancelledSessions}
          </Text>
          <Text style={styles.statLabel}>Cancelled</Text>
        </View>
        <View style={[styles.statCard, { borderColor: Colors.dark.textMuted }]}>
          <Text style={[styles.statValue, { color: Colors.dark.text }]}>
            {series.stats.totalSessions}
          </Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {(series.stats.sessionsNeedingReview ?? 0) > 0 ? (
        <View style={reviewBannerStyles.banner}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.dark.gold} />
          <View style={{ flex: 1 }}>
            <Text style={reviewBannerStyles.title}>
              {series.stats.sessionsNeedingReview} session{(series.stats.sessionsNeedingReview ?? 0) !== 1 ? "s" : ""} need attendance review
            </Text>
            <Text style={reviewBannerStyles.subtitle}>
              These sessions were completed while the system was offline. Open each session in the Timeline tab to confirm who attended.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Cover Photo */}
      <View style={coverPhotoStyles.section}>
        <Text style={styles.sectionTitle}>Cover Photo</Text>
        {displayPhotoUri ? (
          <View style={coverPhotoStyles.previewWrapper}>
            <Image
              source={{ uri: displayPhotoUri }}
              style={coverPhotoStyles.preview}
              contentFit="cover"
            />
            {photoUploading ? (
              <View style={coverPhotoStyles.uploadingOverlay}>
                <TennisBallSpinner size="small" color="#fff" />
                <Text style={coverPhotoStyles.uploadingText}>Uploading…</Text>
              </View>
            ) : null}
            <View style={coverPhotoStyles.photoActions}>
              <Pressable style={coverPhotoStyles.changeBtn} onPress={handlePickPhoto} disabled={photoUploading}>
                <Ionicons name="image-outline" size={15} color="#fff" />
                <Text style={coverPhotoStyles.changeBtnText}>Change</Text>
              </Pressable>
              <Pressable
                style={coverPhotoStyles.removeBtn}
                onPress={() => Alert.alert("Remove Cover Photo", "Remove this cover photo?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => deletePhotoMutation.mutate() },
                ])}
                disabled={deletePhotoMutation.isPending}
              >
                <Ionicons name="trash-outline" size={15} color={Colors.dark.danger} />
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={coverPhotoStyles.uploadPlaceholder} onPress={handlePickPhoto} disabled={photoUploading}>
            {photoUploading ? (
              <TennisBallSpinner size="small" color={Colors.dark.textMuted} />
            ) : (
              <Ionicons name="camera-outline" size={28} color={Colors.dark.textMuted} />
            )}
            <Text style={coverPhotoStyles.uploadLabel}>
              {photoUploading ? "Uploading…" : "Add cover photo"}
            </Text>
            <Text style={coverPhotoStyles.uploadHint}>Shown as a hero image on session cards</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Schedule</Text>

        {/* Day-of-week row — only shown for fixed-day series.
            Flexible series (dayOfWeek === -1) only expose time + duration. */}
        {series.dayOfWeek === -1 ? (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
            <Text style={styles.infoText}>Flexible day</Text>
          </View>
        ) : (
          <>
            <Pressable
              style={styles.infoRow}
              onPress={() =>
                setExpandedScheduleField(
                  expandedScheduleField === "day" ? null : "day",
                )
              }
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.infoText}>
                {draftDay === -1 ? "Flexible day" : `${DAY_NAMES[draftDay]}s`}
              </Text>
              <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
            </Pressable>
            {expandedScheduleField === "day" ? (
              <View style={scheduleStyles.expandedBox}>
                <Text style={scheduleStyles.expandedLabel}>SELECT DAY</Text>
                <View style={scheduleStyles.chipsRow}>
                  {[1, 2, 3, 4, 5, 6, 0, -1].map((d) => {
                    const selected = draftDay === d;
                    const label = d === -1 ? "Flexible" : DAY_NAMES[d].slice(0, 3);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDraftDay(d)}
                        style={[scheduleStyles.chip, selected && scheduleStyles.chipSelected]}
                      >
                        <Text
                          style={[scheduleStyles.chipText, selected && scheduleStyles.chipTextSelected]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* Time row */}
        <Pressable
          style={styles.infoRow}
          onPress={() =>
            setExpandedScheduleField(
              expandedScheduleField === "time" ? null : "time",
            )
          }
        >
          <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>at {formatTime(draftStartTime)}</Text>
          <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
        </Pressable>
        {expandedScheduleField === "time" ? (
          <View style={scheduleStyles.expandedBox}>
            <Text style={scheduleStyles.expandedLabel}>SELECT TIME</Text>
            {Platform.OS === "web" ? (
              <TextInput
                style={scheduleStyles.webTimeInput}
                value={draftStartTime}
                onChangeText={(text) => {
                  const [hours, minutes] = text.split(":").map(Number);
                  if (!isNaN(hours) && !isNaN(minutes)) {
                    setDraftStartTime(
                      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
                    );
                  } else {
                    setDraftStartTime(text);
                  }
                }}
                placeholder="HH:MM"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="numbers-and-punctuation"
              />
            ) : (
              <>
                <Pressable
                  onPress={() => setShowNativeTimePicker(true)}
                  style={scheduleStyles.timeButton}
                >
                  <Ionicons name="time-outline" size={20} color={Colors.dark.accentCyan} />
                  <Text style={scheduleStyles.timeButtonText}>{draftStartTime}</Text>
                </Pressable>
                {showNativeTimePicker ? (
                  <DateTimePicker
                    value={draftTimeAsDate}
                    mode="time"
                    is24Hour={true}
                    display="spinner"
                    onChange={(_, date) => {
                      setShowNativeTimePicker(false);
                      if (date) {
                        const hh = String(date.getHours()).padStart(2, "0");
                        const mm = String(date.getMinutes()).padStart(2, "0");
                        setDraftStartTime(`${hh}:${mm}`);
                      }
                    }}
                  />
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* Duration row */}
        <Pressable
          style={styles.infoRow}
          onPress={() =>
            setExpandedScheduleField(
              expandedScheduleField === "duration" ? null : "duration",
            )
          }
        >
          <Ionicons name="hourglass-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>{draftDuration} minutes</Text>
          <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
        </Pressable>
        {expandedScheduleField === "duration" ? (
          <View style={scheduleStyles.expandedBox}>
            <Text style={scheduleStyles.expandedLabel}>SELECT DURATION</Text>
            <View style={scheduleStyles.chipsRow}>
              {DURATION_OPTIONS.map((d) => {
                const selected = draftDuration === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDraftDuration(d)}
                    style={[scheduleStyles.chip, selected && scheduleStyles.chipSelected]}
                  >
                    <Text
                      style={[scheduleStyles.chipText, selected && scheduleStyles.chipTextSelected]}
                    >
                      {d} min
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Save / reset bar */}
        {scheduleHasChanges ? (
          <View style={scheduleStyles.saveBar}>
            <Pressable
              style={scheduleStyles.resetButton}
              onPress={handleResetSchedule}
              disabled={scheduleSaving}
            >
              <Text style={scheduleStyles.resetButtonText}>Reset</Text>
            </Pressable>
            <Pressable
              style={[scheduleStyles.saveButton, scheduleSaving && scheduleStyles.saveButtonDisabled]}
              onPress={handleSaveSchedule}
              disabled={scheduleSaving}
            >
              {scheduleSaving ? (
                <TennisBallSpinner size="small" color={Colors.dark.text} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.dark.text} />
                  <Text style={scheduleStyles.saveButtonText}>Save schedule changes</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
        <Pressable style={styles.infoRow} onPress={() => setShowSeriesCourtPicker(!showSeriesCourtPicker)}>
          <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            {series.locationName ? series.locationName : ""}
            {series.courtName ? `${series.locationName ? " - " : ""}${series.courtName}` : "No court assigned"}
          </Text>
          <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
        </Pressable>
        {series.locationAddress ? (
          <Pressable
            style={[styles.infoRow, { marginTop: -4 }]}
            onPress={() => {
              openDirections({ address: series.locationAddress! });
            }}
          >
            <Ionicons name="navigate-outline" size={16} color={Colors.dark.primary} />
            <Text style={[styles.infoText, { color: Colors.dark.primary }]} numberOfLines={1}>
              {series.locationAddress}
            </Text>
          </Pressable>
        ) : null}
        {showSeriesCourtPicker && courtsData && courtsData.length > 0 ? (
          <View style={{ backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 12, marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Change Court for All Sessions</Text>
            {courtsData.map((c) => (
              <Pressable
                key={c.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 6, ...(c.id === series.courtId ? { backgroundColor: "rgba(0, 255, 135, 0.1)" } : {}) }}
                onPress={() => {
                  if (c.id !== series.courtId) {
                    changeSeriesCourtMutation.mutate(c.id);
                  } else {
                    setShowSeriesCourtPicker(false);
                  }
                }}
                disabled={changeSeriesCourtMutation.isPending}
              >
                <Ionicons
                  name={c.id === series.courtId ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={c.id === series.courtId ? Colors.dark.primary : Colors.dark.disabled}
                />
                <Text style={{ fontSize: 15, color: c.id === series.courtId ? Colors.dark.primary : Colors.dark.text }}>{c.name}</Text>
              </Pressable>
            ))}
            {changeSeriesCourtMutation.isPending ? (
              <TennisBallSpinner size="small" color={Colors.dark.primary} style={{ marginTop: 8 }} />
            ) : null}
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Ionicons name="trophy-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>{series.xpPerSession} XP per session</Text>
        </View>
      </View>

      <CourtBookingSetupSection series={series} />

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Visibility</Text>
        <View style={publicStyles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={publicStyles.toggleLabel}>Open to public</Text>
            <Text style={publicStyles.toggleSubLabel}>Public lessons appear to all players in your region.</Text>
          </View>
          {updatingVisibility ? (
            <TennisBallSpinner size="small" color={Colors.dark.successNeon} />
          ) : (
            <Switch
              value={series.isPublic ?? false}
              onValueChange={handleTogglePublic}
              trackColor={{ false: Colors.dark.disabled, true: Colors.dark.successNeon }}
              thumbColor={Colors.dark.text}
            />
          )}
        </View>
        {series.isPublic ? (
          <View style={publicStyles.priceRow}>
            <Ionicons name="pricetag-outline" size={16} color={Colors.dark.textMuted} />
            {editingDropInPrice ? (
              <View style={publicStyles.priceEditRow}>
                <TextInput
                  style={publicStyles.priceInput}
                  value={dropInPriceInput}
                  onChangeText={setDropInPriceInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 20"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoFocus
                />
                <Pressable
                  onPress={() => {
                    const ok = handleSaveDropInPrice(dropInPriceInput);
                    if (ok !== false) setEditingDropInPrice(false);
                  }}
                  style={publicStyles.priceSaveBtn}
                >
                  <Ionicons name="checkmark" size={18} color={Colors.dark.successNeon} />
                </Pressable>
                <Pressable
                  onPress={() => setEditingDropInPrice(false)}
                  style={publicStyles.priceCancelBtn}
                >
                  <Ionicons name="close" size={18} color={Colors.dark.error} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setDropInPriceInput(series.publicDropInPrice ?? "");
                  setEditingDropInPrice(true);
                }}
                style={publicStyles.priceDisplayRow}
              >
                <Text style={publicStyles.priceText}>
                  {series.publicDropInPrice
                    ? `Drop-in price: ${series.publicDropInPrice}`
                    : "Free / Price on request"}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      <ProgramRulesSection series={series} />

      {series.sessionType === "camp" && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Camp inclusions</Text>

          {inclusionItems.map((item, idx) => (
            <View key={idx} style={campStyles.inclusionRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
              <Text style={campStyles.inclusionText}>{item}</Text>
              <Pressable
                onPress={() => {
                  const next = inclusionItems.filter((_, i) => i !== idx);
                  setInclusionItems(next);
                  saveCampFieldsMutation.mutate({ inclusions: next });
                }}
                style={campStyles.removeBtn}
              >
                <Ionicons name="close-circle" size={16} color={Colors.dark.error} />
              </Pressable>
            </View>
          ))}

          {inclusionItems.length < 8 && (
            <View style={campStyles.addInclusionRow}>
              <TextInput
                style={campStyles.inclusionInput}
                value={newInclusionText}
                onChangeText={setNewInclusionText}
                placeholder="e.g. 5x Groepsles"
                placeholderTextColor={Colors.dark.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const trimmed = newInclusionText.trim();
                  if (!trimmed) return;
                  const next = [...inclusionItems, trimmed];
                  setInclusionItems(next);
                  setNewInclusionText("");
                  saveCampFieldsMutation.mutate({ inclusions: next });
                }}
              />
              <Pressable
                style={campStyles.addBtn}
                onPress={() => {
                  const trimmed = newInclusionText.trim();
                  if (!trimmed) return;
                  const next = [...inclusionItems, trimmed];
                  setInclusionItems(next);
                  setNewInclusionText("");
                  saveCampFieldsMutation.mutate({ inclusions: next });
                }}
              >
                <Ionicons name="add" size={20} color={Colors.dark.successNeon} />
              </Pressable>
            </View>
          )}

          <View style={campStyles.originalPriceSection}>
            <Text style={campStyles.originalPriceLabel}>Original price (crossed out)</Text>
            {editingOriginalPrice ? (
              <View style={campStyles.originalPriceEditRow}>
                <TextInput
                  style={campStyles.originalPriceInput}
                  value={originalPriceInput}
                  onChangeText={setOriginalPriceInput}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 500"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoFocus
                />
                <Pressable
                  onPress={() => {
                    const trimmed = originalPriceInput.trim();
                    saveCampFieldsMutation.mutate({ originalPrice: trimmed || null });
                    setEditingOriginalPrice(false);
                  }}
                  style={campStyles.originalPriceSaveBtn}
                >
                  <Ionicons name="checkmark" size={18} color={Colors.dark.successNeon} />
                </Pressable>
                <Pressable onPress={() => setEditingOriginalPrice(false)} style={campStyles.originalPriceCancelBtn}>
                  <Ionicons name="close" size={18} color={Colors.dark.error} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setOriginalPriceInput(series.originalPrice ?? "");
                  setEditingOriginalPrice(true);
                }}
                style={campStyles.originalPriceDisplayRow}
              >
                <Text style={campStyles.originalPriceValue}>
                  {series.originalPrice ? `AED ${series.originalPrice}` : "Not set"}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} style={{ marginLeft: 6 }} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View style={[styles.infoSection, { overflow: "visible" }]}>
        {playerActionMenuId ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPlayerActionMenuId(null)}
          />
        ) : null}
        {(() => {
          const activePlayers = series.players.filter(p => p.status === "active");
          const pausedPlayers = series.players.filter(p => p.status === "paused");
          const formerPlayers = series.players.filter(p => p.status === "left");
          const effectiveMaxPlayers = series.sessionType === "private" ? 1 : series.maxPlayers || (series.sessionType === "semi_private" ? 2 : 6);
          const canAddMore = activePlayers.length < effectiveMaxPlayers;

          return (
            <>
              <View style={styles.sectionHeaderRow}>
                {editingMaxPlayers ? (
                  <View style={styles.editMaxPlayersRow}>
                    <Text style={styles.sectionTitle}>Active Players ({activePlayers.length}/</Text>
                    <TextInput
                      style={styles.maxPlayersInput}
                      value={newMaxPlayers}
                      onChangeText={setNewMaxPlayers}
                      keyboardType="number-pad"
                      placeholder={String(effectiveMaxPlayers)}
                      placeholderTextColor={Colors.dark.textMuted}
                      maxLength={2}
                      autoFocus
                    />
                    <Text style={styles.sectionTitle}>)</Text>
                    <Pressable onPress={handleSaveMaxPlayers} style={styles.saveMaxPlayersBtn}>
                      <Ionicons name="checkmark" size={18} color={Colors.dark.successNeon} />
                    </Pressable>
                    <Pressable onPress={() => { setEditingMaxPlayers(false); setNewMaxPlayers(""); }} style={styles.cancelMaxPlayersBtn}>
                      <Ionicons name="close" size={18} color={Colors.dark.error} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => { setEditingMaxPlayers(true); setNewMaxPlayers(String(effectiveMaxPlayers)); }}
                    style={styles.editableTitle}
                  >
                    <Text style={styles.sectionTitle}>
                      Active Players ({activePlayers.length}/{effectiveMaxPlayers})
                    </Text>
                    <Ionicons name="pencil" size={14} color={Colors.dark.textMuted} style={{ marginLeft: 6 }} />
                  </Pressable>
                )}
                {canAddMore && !editingMaxPlayers ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Pressable
                      onPress={() => setShowSmartFill(true)}
                      style={[styles.addPlayerButton, { backgroundColor: Colors.dark.orange + "15", borderColor: Colors.dark.orange + "30" }]}
                    >
                      <Ionicons name="flash" size={16} color={Colors.dark.orange} />
                      <Text style={[styles.addPlayerButtonText, { color: Colors.dark.orange }]}>Smart Fill</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleAddPlayerPress}
                      style={styles.addPlayerButton}
                    >
                      <Ionicons name="add-circle" size={20} color={Colors.dark.successNeon} />
                      <Text style={styles.addPlayerButtonText}>Add</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {activePlayers.length === 0 ? (
                <Pressable onPress={handleAddPlayerPress} style={styles.emptyAddButton}>
                  <Ionicons name="person-add-outline" size={24} color={Colors.dark.successNeon} />
                  <Text style={styles.emptyAddText}>Tap to add a player</Text>
                </Pressable>
              ) : (
                activePlayers.map((player) => {
                  const sessionType = series.sessionType;
                  const credits = player.credits;
                  let relevantCredits = 0;
                  let relevantDebt = 0;
                  if (credits) {
                    if (sessionType === "private") {
                      relevantCredits = credits.private;
                      relevantDebt = credits.privateDebt || 0;
                    } else if (sessionType === "semi_private" || sessionType === "semi") {
                      relevantCredits = credits.semi_private;
                      relevantDebt = credits.semiPrivateDebt || 0;
                    } else {
                      relevantCredits = credits.group;
                      relevantDebt = credits.groupDebt || 0;
                    }
                  }
                  const hasNoCredits = relevantCredits <= 0 && relevantDebt === 0;
                  const hasDebt = relevantDebt > 0;
                  const displayCredits = hasDebt && relevantCredits <= 0 ? -relevantDebt : relevantCredits;

                  const isMenuOpen = playerActionMenuId === player.id;
                  const isPausing = pausingPlayerId === player.id;
                  const isRemoving = removingPlayerId === player.id;

                  const ballColor = getBallLevelColor(player.ballLevel);
                  return (
                    <View key={player.id} style={[styles.playerRow, isMenuOpen && { zIndex: 999 }]}>
                      <Pressable
                        onPress={() => handlePlayerTap(player.id)}
                        style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                      >
                        {buildPhotoUrl(player.profilePhotoUrl) ? (
                          <Image
                            source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                            style={[styles.playerAvatar, { borderWidth: 2, borderColor: ballColor }]}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.playerAvatar, { backgroundColor: ballColor + "30", borderWidth: 2, borderColor: ballColor }]}>
                            <Text style={[styles.playerInitial, { color: ballColor }]}>
                              {player.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.playerInfo}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={styles.playerName}>{player.name}</Text>
                            {player.isGuest ? (
                              <View style={styles.guestBadge}>
                                <Text style={styles.guestBadgeText}>GUEST</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.playerStats}>
                            {player.isGuest && player.guestUntil
                              ? `Guest until ${formatDate(player.guestUntil)}`
                              : `${player.joinedAt ? `Since ${formatDate(player.joinedAt)}` : ""}${player.sessionsAttended ? ` - ${player.sessionsAttended} sessions` : ""}`
                            }
                          </Text>
                        </View>
                      </Pressable>
                      {credits ? (
                        <View style={[
                          styles.creditBadge,
                          hasNoCredits && styles.creditBadgeWarning,
                          hasDebt && styles.creditBadgeDebt,
                        ]}>
                          <Text style={[
                            styles.creditBadgeText,
                            hasNoCredits && styles.creditBadgeTextWarning,
                            hasDebt && styles.creditBadgeTextDebt,
                          ]}>
                            {formatCredits(displayCredits)}
                          </Text>
                        </View>
                      ) : null}
                      <Pressable
                        onPress={() => setPlayerActionMenuId(isMenuOpen ? null : player.id)}
                        style={styles.playerMenuButton}
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={Colors.dark.textMuted} />
                      </Pressable>
                      {isMenuOpen ? (
                        <View style={styles.playerActionMenu}>
                          <LinearGradient
                            colors={["rgba(30, 41, 59, 0.98)", "rgba(15, 23, 42, 0.98)"]}
                            style={styles.playerActionMenuGradient}
                          >
                            <View style={styles.playerActionMenuHeader}>
                              <Ionicons name="settings-outline" size={12} color={Colors.dark.textMuted} />
                              <Text style={styles.playerActionMenuTitle}>Player Actions</Text>
                            </View>
                            <View style={styles.playerActionDivider} />
                            <Pressable
                              onPress={() => handleEditJoinDate(player)}
                              style={({ pressed }) => [
                                styles.playerActionItem,
                                pressed && styles.playerActionItemPressed,
                              ]}
                            >
                              <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.accentCyan + "20" }]}>
                                <Ionicons name="calendar" size={16} color={Colors.dark.accentCyan} />
                              </View>
                              <Text style={[styles.playerActionText, { color: Colors.dark.text }]}>Edit Join Date</Text>
                              <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
                            </Pressable>
                            {player.name === "Deleted User" ? (
                              <>
                                <View style={styles.playerActionDivider} />
                                <Pressable
                                  onPress={() => handleRestoreIdentity(player)}
                                  style={({ pressed }) => [
                                    styles.playerActionItem,
                                    pressed && styles.playerActionItemPressed,
                                  ]}
                                >
                                  <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.primary + "20" }]}>
                                    <Ionicons name="person-add" size={16} color={Colors.dark.primary} />
                                  </View>
                                  <Text style={[styles.playerActionText, { color: Colors.dark.primary }]}>Restore Identity</Text>
                                  <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
                                </Pressable>
                                <View style={styles.playerActionDivider} />
                              </>
                            ) : null}
                            <Pressable
                              onPress={() => handlePausePlayer(player.id)}
                              style={({ pressed }) => [
                                styles.playerActionItem,
                                pressed && styles.playerActionItemPressed,
                              ]}
                              disabled={isPausing}
                            >
                              {isPausing ? (
                                <TennisBallSpinner size="small" color={Colors.dark.gold} />
                              ) : (
                                <>
                                  <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.gold + "20" }]}>
                                    <Ionicons name="pause" size={16} color={Colors.dark.gold} />
                                  </View>
                                  <Text style={[styles.playerActionText, { color: Colors.dark.text }]}>Pause Player</Text>
                                  <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
                                </>
                              )}
                            </Pressable>
                            <View style={styles.playerActionDivider} />
                            <Pressable
                              onPress={() => handleRemovePlayer(player.id)}
                              style={({ pressed }) => [
                                styles.playerActionItem,
                                styles.playerActionItemDanger,
                                pressed && styles.playerActionItemPressed,
                              ]}
                              disabled={isRemoving}
                            >
                              {isRemoving ? (
                                <TennisBallSpinner size="small" color={Colors.dark.error} />
                              ) : (
                                <>
                                  <View style={[styles.playerActionIconWrapper, { backgroundColor: Colors.dark.error + "20" }]}>
                                    <Ionicons name="person-remove" size={16} color={Colors.dark.error} />
                                  </View>
                                  <Text style={[styles.playerActionText, { color: Colors.dark.error }]}>Remove Player</Text>
                                </>
                              )}
                            </Pressable>
                          </LinearGradient>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}

              {pausedPlayers.length > 0 ? (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                    On Vacation ({pausedPlayers.length})
                  </Text>
                  {pausedPlayers.map((player) => {
                    const pausedBallColor = getBallLevelColor(player.ballLevel);
                    return (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.7 }]}>
                        <Pressable
                          onPress={() => handlePlayerTap(player.id)}
                          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                        >
                          <View style={[styles.playerAvatar, { backgroundColor: pausedBallColor + "20", borderWidth: 2, borderColor: pausedBallColor }]}>
                            <Ionicons name="airplane-outline" size={16} color={pausedBallColor} />
                          </View>
                          <View style={styles.playerInfo}>
                            <Text style={styles.playerName}>{player.name}</Text>
                            <Text style={[styles.playerStats, { color: Colors.dark.gold }]}>
                              {player.pauseFrom && player.pauseUntil
                                ? `${formatDate(player.pauseFrom)} - ${formatDate(player.pauseUntil)}`
                                : player.pauseReason || "On vacation"}
                            </Text>
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => handleReactivatePlayer(player.id)}
                          style={styles.reactivateButton}
                        >
                          <Ionicons name="play-circle-outline" size={18} color={Colors.dark.successNeon} />
                          <Text style={styles.reactivateButtonText}>Reactivate</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </>
              ) : null}

              {formerPlayers.length > 0 ? (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
                    Former Players ({formerPlayers.length})
                  </Text>
                  {formerPlayers.map((player) => {
                    const formerBallColor = getBallLevelColor(player.ballLevel);
                    return (
                      <View key={player.id} style={[styles.playerRow, { opacity: 0.5 }]}>
                        {buildPhotoUrl(player.profilePhotoUrl) ? (
                          <Image
                            source={{ uri: buildPhotoUrl(player.profilePhotoUrl)! }}
                            style={[styles.playerAvatar, { borderWidth: 2, borderColor: formerBallColor + "60", opacity: 0.6 }]}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.playerAvatar, { backgroundColor: formerBallColor + "20", borderWidth: 2, borderColor: formerBallColor + "60" }]}>
                            <Text style={[styles.playerInitial, { color: formerBallColor + "80" }]}>
                              {player.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.playerInfo}>
                          <Text style={[styles.playerName, { color: Colors.dark.textMuted }]}>
                            {player.name}
                          </Text>
                          <Text style={styles.playerStats}>
                            {player.joinedAt && player.leftAt
                              ? `${formatDate(player.joinedAt)} - ${formatDate(player.leftAt)}`
                              : player.sessionsAttended ? `${player.sessionsAttended} sessions attended` : ""}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              ) : null}
            </>
          );
        })()}
      </View>

      <View style={styles.deleteSeriesSection}>
        {series?.status === "active" && (
          <Pressable
            onPress={handleExtendSeries}
            style={[styles.extendSeriesButton, extendingSeries && styles.extendSeriesButtonDisabled]}
            disabled={extendingSeries}
          >
            {extendingSeries ? (
              <TennisBallSpinner size="small" color={Colors.dark.accent} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color={Colors.dark.accent} />
                <Text style={styles.extendSeriesButtonText}>Extend Class (+weeks)</Text>
              </>
            )}
          </Pressable>
        )}

        {series?.status === "active" && (
          <Pressable
            onPress={() => setShowExtraLessonModal(true)}
            style={[styles.extendSeriesButton, addingExtraLesson && styles.extendSeriesButtonDisabled]}
            disabled={addingExtraLesson}
          >
            {addingExtraLesson ? (
              <TennisBallSpinner size="small" color={Colors.dark.warning} />
            ) : (
              <>
                <Ionicons name="calendar-outline" size={18} color={Colors.dark.warning} />
                <Text style={[styles.extendSeriesButtonText, { color: Colors.dark.warning }]}>Add Extra Lesson</Text>
              </>
            )}
          </Pressable>
        )}

        {series?.status === "active" && onSendReminder ? (
          <Pressable
            onPress={onSendReminder}
            style={styles.extendSeriesButton}
          >
            <Ionicons name="notifications-outline" size={18} color={Colors.dark.accentCyan} />
            <Text style={[styles.extendSeriesButtonText, { color: Colors.dark.accentCyan }]}>
              {t("coach.reminder.actionLabel")}
            </Text>
          </Pressable>
        ) : null}

        {series?.status === "active" && (
          <Pressable
            onPress={handleCompleteSeries}
            style={[styles.completeSeriesButton, completingSeries && styles.completeSeriesButtonDisabled]}
            disabled={completingSeries}
          >
            {completingSeries ? (
              <TennisBallSpinner size="small" color={Colors.dark.successNeon} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dark.successNeon} />
                <Text style={styles.completeSeriesButtonText}>Complete Class</Text>
              </>
            )}
          </Pressable>
        )}

        {series?.status === "ended" && (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.dark.successNeon} />
            <Text style={styles.completedBadgeText}>Class Completed</Text>
            {(series as any).endedAt && (
              <Text style={styles.completedDateText}>
                {new Date((series as any).endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })}
              </Text>
            )}
          </View>
        )}

        <Pressable
          onPress={handleDeleteSeries}
          style={[styles.deleteSeriesButton, deletingSeries && styles.deleteSeriesButtonDisabled]}
          disabled={deletingSeries}
        >
          {deletingSeries ? (
            <TennisBallSpinner size="small" color={Colors.dark.error} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              <Text style={styles.deleteSeriesButtonText}>Delete Entire Class</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── Program Rules Section ─────────────────────────────────────────────────────
// Coaches can define rules players must accept when joining the program,
// and set the enrollment type (open / approval / closed).
function ProgramRulesSection({ series }: { series: SeriesDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [ruleInput, setRuleInput] = useState("");
  const [localRules, setLocalRules] = useState<string[]>((series.programRules as string[]) || []);
  const [enrollmentType, setEnrollmentType] = useState(series.enrollmentType || "open");

  const saveMutation = useMutation({
    mutationFn: (payload: { programRules: string[]; enrollmentType: string }) =>
      apiRequest("PATCH", `/api/coach/series/${series.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${series.id}`] });
      setEditing(false);
    },
    onError: () => Alert.alert("Error", "Could not save program rules"),
  });

  const handleAddRule = () => {
    const trimmed = ruleInput.trim();
    if (!trimmed || localRules.length >= 20) return;
    setLocalRules((prev) => [...prev, trimmed]);
    setRuleInput("");
  };

  const handleRemoveRule = (idx: number) => {
    setLocalRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    saveMutation.mutate({ programRules: localRules, enrollmentType });
  };

  const handleCancel = () => {
    setLocalRules((series.programRules as string[]) || []);
    setEnrollmentType(series.enrollmentType || "open");
    setEditing(false);
  };

  const enrollmentLabels: Record<string, string> = {
    open: "Open — anyone can join instantly",
    approval: "Approval — coach reviews each request",
    closed: "Closed — not accepting new members",
  };

  if (!editing && localRules.length === 0 && (!series.programRules || (series.programRules as string[]).length === 0)) {
    return (
      <View style={rulesStyles.container}>
        <View style={rulesStyles.headerRow}>
          <Ionicons name="document-text-outline" size={16} color={Colors.dark.primary} />
          <Text style={rulesStyles.sectionTitle}>Program Rules</Text>
          <Pressable onPress={() => setEditing(true)} style={rulesStyles.editBtn}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.dark.primary} />
            <Text style={rulesStyles.editBtnText}>Add Rules</Text>
          </Pressable>
        </View>
        <Text style={rulesStyles.emptyText}>No program rules set. Add rules players must accept when joining.</Text>
      </View>
    );
  }

  const displayRules = editing ? localRules : ((series.programRules as string[]) || []);
  const displayEnrollment = editing ? enrollmentType : (series.enrollmentType || "open");

  return (
    <View style={rulesStyles.container}>
      <View style={rulesStyles.headerRow}>
        <Ionicons name="document-text-outline" size={16} color={Colors.dark.primary} />
        <Text style={rulesStyles.sectionTitle}>Program Rules</Text>
        {!editing ? (
          <Pressable onPress={() => { setLocalRules((series.programRules as string[]) || []); setEnrollmentType(series.enrollmentType || "open"); setEditing(true); }} style={rulesStyles.editBtn}>
            <Ionicons name="pencil-outline" size={16} color={Colors.dark.primary} />
            <Text style={rulesStyles.editBtnText}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Enrollment type */}
      <View style={rulesStyles.enrollmentRow}>
        <Ionicons name="people-circle-outline" size={14} color={Colors.dark.textMuted} />
        {editing ? (
          <View style={rulesStyles.enrollmentPicker}>
            {(["open", "approval", "closed"] as const).map((type) => (
              <Pressable
                key={type}
                style={[rulesStyles.enrollChip, enrollmentType === type && rulesStyles.enrollChipActive]}
                onPress={() => setEnrollmentType(type)}
              >
                <Text style={[rulesStyles.enrollChipText, enrollmentType === type && rulesStyles.enrollChipTextActive]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={rulesStyles.enrollmentLabel}>{enrollmentLabels[displayEnrollment] || displayEnrollment}</Text>
        )}
      </View>

      {/* Rules list */}
      {displayRules.map((rule, idx) => (
        <View key={idx} style={rulesStyles.ruleRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.dark.primary} style={{ marginTop: 2 }} />
          <Text style={rulesStyles.ruleText}>{rule}</Text>
          {editing ? (
            <Pressable onPress={() => handleRemoveRule(idx)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color={Colors.dark.error} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {/* Add rule input */}
      {editing ? (
        <>
          {localRules.length < 20 ? (
            <View style={rulesStyles.addRow}>
              <TextInput
                style={rulesStyles.ruleInput}
                value={ruleInput}
                onChangeText={setRuleInput}
                placeholder="Add a rule..."
                placeholderTextColor={Colors.dark.textMuted}
                onSubmitEditing={handleAddRule}
                returnKeyType="done"
              />
              <Pressable onPress={handleAddRule} style={rulesStyles.addBtn}>
                <Ionicons name="add" size={20} color={Colors.dark.primary} />
              </Pressable>
            </View>
          ) : null}
          <View style={rulesStyles.saveRow}>
            <Pressable onPress={handleCancel} style={rulesStyles.cancelBtn}>
              <Text style={rulesStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={rulesStyles.saveBtn} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <TennisBallSpinner size="small" color={Colors.dark.buttonText} />
              ) : (
                <Text style={rulesStyles.saveBtnText}>Save Rules</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const rulesStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "25",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editBtnText: {
    color: Colors.dark.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontStyle: "italic",
  },
  enrollmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  enrollmentLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    flex: 1,
  },
  enrollmentPicker: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
    flexWrap: "wrap",
  },
  enrollChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  enrollChipActive: {
    backgroundColor: Colors.dark.primary + "25",
    borderColor: Colors.dark.primary,
  },
  enrollChipText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  enrollChipTextActive: {
    color: Colors.dark.primary,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  ruleText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 13,
    lineHeight: 18,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.sm,
  },
  ruleInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.dark.text,
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  addBtn: {
    padding: 6,
  },
  saveRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },
  cancelBtnText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: Colors.dark.buttonText,
    fontSize: 14,
    fontWeight: "700",
  },
});

// ── Court Booking Setup Section (Task #1712) ──────────────────────────────────
// Lets coaches configure the community court location and optionally target
// specific lesson groups for booking reminders.
type LessonGroupOption = { id: string; name: string; memberCount?: number };

function CourtBookingSetupSection({ series }: { series: SeriesDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [locationInput, setLocationInput] = useState(series.courtLocation ?? "");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    series.courtReminderGroupIds ?? []
  );

  // Fetch available lesson groups for the academy (always loaded so read-only
  // display can also show the configured group names)
  const { data: lessonGroups } = useQuery<LessonGroupOption[]>({
    queryKey: ["/api/lesson-groups"],
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { courtLocation: string | null; courtReminderGroupIds: string[] | null }) =>
      apiRequest("PATCH", `/api/coach/series/${series.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/coach/series/${series.id}`] });
      setEditing(false);
    },
    onError: () => {
      Alert.alert("Failed to save court booking settings");
    },
  });

  const handleSave = () => {
    const loc = locationInput.trim() || null;
    const groups = selectedGroupIds.length > 0 ? selectedGroupIds : null;
    saveMutation.mutate({ courtLocation: loc, courtReminderGroupIds: groups });
  };

  const handleRemove = () => {
    saveMutation.mutate({ courtLocation: null, courtReminderGroupIds: null });
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const hasLocation = !!series.courtLocation;
  const groupNames =
    series.courtReminderGroupIds && lessonGroups
      ? lessonGroups
          .filter((g) => (series.courtReminderGroupIds ?? []).includes(g.id))
          .map((g) => g.name)
          .join(", ")
      : null;

  return (
    <View style={courtSetupStyles.container}>
      <View style={courtSetupStyles.headerRow}>
        <Ionicons name="shield-checkmark-outline" size={16} color={Colors.dark.accentCyan} />
        <Text style={courtSetupStyles.sectionTitle}>Court Booking</Text>
        {!editing ? (
          <Pressable
            onPress={() => {
              setLocationInput(series.courtLocation ?? "");
              setSelectedGroupIds(series.courtReminderGroupIds ?? []);
              setEditing(true);
            }}
            style={courtSetupStyles.editBtn}
          >
            <Ionicons name="pencil-outline" size={14} color={Colors.dark.disabled} />
          </Pressable>
        ) : null}
      </View>

      {!editing ? (
        hasLocation ? (
          <View style={{ gap: 4 }}>
            <View style={courtSetupStyles.locationRow}>
              <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={courtSetupStyles.locationText}>{series.courtLocation}</Text>
            </View>
            {groupNames ? (
              <Text style={courtSetupStyles.groupHint}>
                Reminders target: {groupNames}
              </Text>
            ) : (
              <Text style={courtSetupStyles.groupHint}>Reminders sent to all enrolled players</Text>
            )}
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setLocationInput("");
              setSelectedGroupIds([]);
              setEditing(true);
            }}
            style={courtSetupStyles.addRow}
          >
            <Ionicons name="add-circle-outline" size={15} color={Colors.dark.accentCyan} />
            <Text style={courtSetupStyles.addText}>Set court location for booking reminders</Text>
          </Pressable>
        )
      ) : (
        <View style={courtSetupStyles.editContainer}>
          <Text style={courtSetupStyles.fieldLabel}>Court / Venue Name</Text>
          <TextInput
            style={courtSetupStyles.input}
            value={locationInput}
            onChangeText={setLocationInput}
            placeholder="e.g. Maple Court, Sidra Tennis Club"
            placeholderTextColor={Colors.dark.textMuted}
            autoFocus
          />

          {lessonGroups && lessonGroups.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={courtSetupStyles.fieldLabel}>
                Remind groups (leave empty for all players)
              </Text>
              <View style={courtSetupStyles.groupsRow}>
                {lessonGroups.map((g) => {
                  const active = selectedGroupIds.includes(g.id);
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => toggleGroup(g.id)}
                      style={[
                        courtSetupStyles.groupChip,
                        active && courtSetupStyles.groupChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          courtSetupStyles.groupChipText,
                          active && courtSetupStyles.groupChipTextActive,
                        ]}
                      >
                        {g.name}
                        {g.memberCount !== undefined ? ` (${g.memberCount})` : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={courtSetupStyles.editActions}>
            <Pressable
              style={[courtSetupStyles.actionBtn, courtSetupStyles.saveBtn]}
              onPress={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <TennisBallSpinner size="small" color={Colors.dark.text} />
              ) : (
                <Text style={courtSetupStyles.saveBtnText}>Save</Text>
              )}
            </Pressable>
            <Pressable
              style={[courtSetupStyles.actionBtn, courtSetupStyles.cancelBtn]}
              onPress={() => setEditing(false)}
              disabled={saveMutation.isPending}
            >
              <Text style={courtSetupStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            {hasLocation ? (
              <Pressable
                style={[courtSetupStyles.actionBtn, courtSetupStyles.removeBtn]}
                onPress={handleRemove}
                disabled={saveMutation.isPending}
              >
                <Text style={courtSetupStyles.removeBtnText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={courtSetupStyles.hint}>
            Players receive push reminders at 14, 7, and 3 days before each session at 08:00 local time.
          </Text>
        </View>
      )}
    </View>
  );
}

const courtSetupStyles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(0, 229, 255, 0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 229, 255, 0.18)",
    padding: 12,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.accentCyan,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  editBtn: { padding: 4 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationText: {
    fontSize: 14,
    color: Colors.dark.text,
    flex: 1,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addText: {
    fontSize: 13,
    color: Colors.dark.accentCyan,
  },
  editContainer: { gap: 8 },
  input: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  editActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
  },
  saveBtn: { backgroundColor: Colors.dark.accentCyan },
  saveBtnText: { color: "#000", fontWeight: "700", fontSize: 13 },
  cancelBtn: { backgroundColor: "rgba(255,255,255,0.08)" },
  cancelBtnText: { color: Colors.dark.textMuted, fontSize: 13 },
  removeBtn: { backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  removeBtnText: { color: Colors.dark.error, fontSize: 13 },
  hint: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  groupHint: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.7,
  },
  groupsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  groupChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  groupChipActive: {
    borderColor: Colors.dark.accentCyan,
    backgroundColor: "rgba(0, 229, 255, 0.15)",
  },
  groupChipText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "600" as const,
  },
  groupChipTextActive: {
    color: Colors.dark.accentCyan,
  },
});

const scheduleStyles = StyleSheet.create({
  expandedBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  expandedLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipSelected: {
    borderColor: Colors.dark.accentCyan,
    backgroundColor: "rgba(0, 200, 255, 0.15)",
  },
  chipText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: Colors.dark.accentCyan,
  },
  webTimeInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
    minWidth: 100,
    alignSelf: "flex-start",
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  timeButtonText: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  resetButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  resetButtonText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.accentCyan,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
  },
});

const campStyles = StyleSheet.create({
  inclusionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  inclusionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
  },
  removeBtn: {
    padding: 2,
  },
  addInclusionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  inclusionInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  addBtn: {
    padding: 6,
  },
  originalPriceSection: {
    marginTop: 14,
    gap: 4,
  },
  originalPriceLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  originalPriceDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  originalPriceValue: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  originalPriceEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  originalPriceInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  originalPriceSaveBtn: {
    padding: 4,
  },
  originalPriceCancelBtn: {
    padding: 4,
  },
});

const publicStyles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  toggleLabel: {
    fontSize: 15,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  toggleSubLabel: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  priceDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  priceText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  priceEditRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  priceInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  priceSaveBtn: {
    padding: 6,
  },
  priceCancelBtn: {
    padding: 6,
  },
});

const coverPhotoStyles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  uploadPlaceholder: {
    height: 130,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  uploadHint: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    opacity: 0.7,
  },
  previewWrapper: {
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  preview: {
    width: "100%",
    height: 160,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  photoActions: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    gap: 8,
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  changeBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  removeBtn: {
    backgroundColor: "rgba(0,0,0,0.65)",
    padding: 8,
    borderRadius: 20,
  },
});

const reviewBannerStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.gold,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
});
