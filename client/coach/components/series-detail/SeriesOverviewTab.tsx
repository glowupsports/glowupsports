import React from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { openDirections } from "@/lib/maps";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing } from "@/constants/theme";
import { formatCredits } from "@/lib/dateUtils";
import { styles } from "./seriesDetailStyles";
import { DAY_NAMES, getBallLevelColor } from "./utils";
import type { SeriesDetail, Player, CourtOption } from "./types";

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
}: SeriesOverviewTabProps) {
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

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>
            {series.dayOfWeek === -1
              ? `Flexible at ${formatTime(series.startTime)}`
              : `${DAY_NAMES[series.dayOfWeek]}s at ${formatTime(series.startTime)}`}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>{series.duration} minutes</Text>
        </View>
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
              <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginTop: 8 }} />
            ) : null}
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Ionicons name="trophy-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.infoText}>{series.xpPerSession} XP per session</Text>
        </View>
      </View>

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
                        <View style={[styles.playerAvatar, { backgroundColor: ballColor + "30", borderWidth: 2, borderColor: ballColor }]}>
                          <Text style={[styles.playerInitial, { color: ballColor }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
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
                                <ActivityIndicator size="small" color={Colors.dark.gold} />
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
                                <ActivityIndicator size="small" color={Colors.dark.error} />
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
                        <View style={[styles.playerAvatar, { backgroundColor: formerBallColor + "20", borderWidth: 2, borderColor: formerBallColor + "60" }]}>
                          <Text style={[styles.playerInitial, { color: formerBallColor + "80" }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
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
              <ActivityIndicator size="small" color={Colors.dark.accent} />
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
              <ActivityIndicator size="small" color={Colors.dark.warning} />
            ) : (
              <>
                <Ionicons name="calendar-outline" size={18} color={Colors.dark.warning} />
                <Text style={[styles.extendSeriesButtonText, { color: Colors.dark.warning }]}>Add Extra Lesson</Text>
              </>
            )}
          </Pressable>
        )}

        {series?.status === "active" && (
          <Pressable
            onPress={handleCompleteSeries}
            style={[styles.completeSeriesButton, completingSeries && styles.completeSeriesButtonDisabled]}
            disabled={completingSeries}
          >
            {completingSeries ? (
              <ActivityIndicator size="small" color={Colors.dark.successNeon} />
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
            <ActivityIndicator size="small" color={Colors.dark.error} />
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
