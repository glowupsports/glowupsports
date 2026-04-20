import React from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import StandaloneSessionDetailDrawer from "@/coach/components/StandaloneSessionDetailDrawer";
import { styles } from "../coachingStyles";
import type { FeedbackTabState } from "./useFeedbackTab";
import type { QuickSignal, SocialIssue } from "../types";
import { useCoachingScroll } from "../CoachingScrollContext";

export function FeedbackDetailView(props: FeedbackTabState) {
  const onScroll = useCoachingScroll();
  const {
    selectedSession, setSelectedSession,
    detailSession, setDetailSession,
    showDetailDrawer, setShowDetailDrawer,
    intensity, setIntensity,
    mood, setMood,
    focusTags, setFocusTags,
    generalNote, setGeneralNote,
    playerFeedback,
    expandedPlayers,
    showSuccess,
    showSkillSelector, setShowSkillSelector,
    sessionPlayers,
    isPrivateSession,
    skillChips,
    skillGroups,
    saveFeedbackMutation,
    tabBarHeight,
    toggleSkillGroup,
    getPlayerExpandedGroups,
    togglePlayerExpanded,
    applyEffortToAll,
    setAsExpected,
    toggleQuickSignal,
    setSocialIssue,
    calculateDomainImpact,
    cycleSkillState,
    getSkillChipStyle,
    getSkillChipIcon,
    getSkillChipColor,
    updatePlayerFeedback,
    getSessionXp,
    availableTags,
    toggleTag,
    formatTime,
    handleSaveFeedback,
  } = props;

  if (!selectedSession) return null;

  const STEPS = ["Intensity", "Mood", "Players", "Note"];
  const stepsDone = [
    intensity !== null && intensity !== undefined && intensity !== "",
    mood !== null && mood !== undefined && mood !== "",
    playerFeedback.some(pf => pf.progressTrend !== "stable" || pf.effortLevel !== "normal" || pf.note),
    generalNote.trim().length > 0,
  ];
  const stepsComplete = stepsDone.filter(Boolean).length;

  return (
      <View style={{ flex: 1 }}>
        {showSuccess ? (
          <View style={styles.successOverlay}>
            <View style={styles.successContent}>
              <Ionicons name="checkmark-circle" size={64} color={Colors.dark.primary} />
              <Text style={styles.successText}>Feedback Saved</Text>
              <Text style={styles.successSubtext}>Feedback saved — pillar scores updated</Text>
            </View>
          </View>
        ) : null}
        <ScrollView
          style={styles.feedbackForm}
          contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <Pressable style={styles.backRow} onPress={() => setSelectedSession(null)}>
            <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
            <Text style={styles.backText}>Back to overview</Text>
          </Pressable>

        <View style={styles.feedbackHeader}>
          <Text style={styles.feedbackTitle}>Session Feedback</Text>
          <Text style={styles.feedbackTime}>
            {formatTime(selectedSession.startTime)} - {formatTime(selectedSession.endTime)}
          </Text>
        </View>

        {/* Step Progress Indicator (B4) */}
        <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 11, color: Colors.dark.textMuted }}>
              {stepsComplete === STEPS.length ? "Ready to save" : `${stepsComplete} of ${STEPS.length} sections filled`}
            </Text>
            <Text style={{ fontSize: 11, color: stepsComplete === STEPS.length ? Colors.dark.successNeon : Colors.dark.xpCyan }}>
              {Math.round((stepsComplete / STEPS.length) * 100)}%
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {STEPS.map((step, i) => (
              <View key={step} style={{ flex: 1 }}>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: stepsDone[i]
                      ? Colors.dark.xpCyan
                      : Colors.dark.backgroundSecondary,
                  }}
                />
                <Text style={{ fontSize: 9, color: stepsDone[i] ? Colors.dark.xpCyan : Colors.dark.textMuted, marginTop: 3, textAlign: "center" }}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Intensity</Text>
          <View style={styles.intensityRow}>
            {([
              { value: "light", label: "Light", color: Colors.dark.primary },
              { value: "normal", label: "Normal", color: Colors.dark.orange },
              { value: "intense", label: "Intense", color: Colors.dark.error },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.intensityButton,
                  intensity === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIntensity(opt.value);
                }}
              >
                <View style={[styles.intensityDot, { backgroundColor: opt.color }]} />
                <Text
                  style={[
                    styles.intensityText,
                    intensity === opt.value && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Observed Mood</Text>
          <View style={styles.intensityRow}>
            {([
              { value: "good", label: "Good", icon: "happy-outline" as const, color: Colors.dark.primary },
              { value: "neutral", label: "Neutral", icon: "remove-outline" as const, color: Colors.dark.orange },
              { value: "low", label: "Low", icon: "sad-outline" as const, color: Colors.dark.error },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.intensityButton,
                  mood === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMood(opt.value);
                }}
              >
                <Ionicons name={opt.icon} size={18} color={mood === opt.value ? opt.color : Colors.dark.disabled} />
                <Text
                  style={[
                    styles.intensityText,
                    mood === opt.value && { color: opt.color },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>Session Focus (optional)</Text>
          <View style={styles.tagsGrid}>
            {availableTags.map((tag) => (
              <Pressable
                key={tag}
                style={[styles.tagChip, focusTags.includes(tag) && styles.tagChipActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, focusTags.includes(tag) && styles.tagTextActive]}>
                  {tag}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {playerFeedback.length > 0 && (
          <View style={styles.feedbackSection}>
            <View style={styles.feedbackLabelRow}>
              <Text style={styles.feedbackLabel}>Player Feedback</Text>
              {playerFeedback.length > 1 ? (
                <View style={styles.quickActionsRow}>
                  <Pressable
                    style={styles.applyAllButton}
                    onPress={() => applyEffortToAll("normal")}
                  >
                    <Ionicons name="copy-outline" size={12} color={Colors.dark.tabIconDefault} />
                    <Text style={styles.applyAllText}>All Normal</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            
            {/* Quick action for standard sessions */}
            <Pressable
              style={styles.asExpectedButton}
              onPress={setAsExpected}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.xpCyan} />
              <Text style={styles.asExpectedText}>Session went as expected</Text>
            </Pressable>

            {playerFeedback.map((pf) => {
              const isExpanded = expandedPlayers.has(pf.playerId);
              return (
                <View key={pf.playerId} style={styles.playerFeedbackCard}>
                  <Pressable 
                    style={styles.playerFeedbackHeader}
                    onPress={() => togglePlayerExpanded(pf.playerId)}
                  >
                    <Text style={styles.playerFeedbackName}>{pf.playerName}</Text>
                    <View style={styles.playerFeedbackHeaderRight}>
                      {!isExpanded ? (() => {
                        const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
                        const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
                        return (
                          <>
                            {upCount > 0 ? (
                              <View style={styles.headerProgressBadge}>
                                <Ionicons name="trending-up" size={10} color={Colors.dark.primary} />
                                <Text style={[styles.headerProgressText, { color: Colors.dark.primary }]}>{upCount}</Text>
                              </View>
                            ) : null}
                            {downCount > 0 ? (
                              <View style={styles.headerProgressBadge}>
                                <Ionicons name="trending-down" size={10} color={Colors.dark.error} />
                                <Text style={[styles.headerProgressText, { color: Colors.dark.error }]}>{downCount}</Text>
                              </View>
                            ) : null}
                          </>
                        );
                      })() : null}
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={Colors.dark.tabIconDefault}
                      />
                    </View>
                  </Pressable>
                  
                  {isExpanded ? (
                    <>
                      {/* Per-skill progress summary */}
                      {(() => {
                        const upCount = Object.values(pf.skillProgress).filter(s => s === "up").length;
                        const downCount = Object.values(pf.skillProgress).filter(s => s === "down").length;
                        const hasProgress = upCount > 0 || downCount > 0;
                        return hasProgress ? (
                          <View style={styles.skillProgressSummary}>
                            {upCount > 0 ? (
                              <View style={styles.skillProgressBadge}>
                                <Ionicons name="trending-up" size={12} color={Colors.dark.primary} />
                                <Text style={[styles.skillProgressBadgeText, { color: Colors.dark.primary }]}>
                                  {upCount} improved
                                </Text>
                              </View>
                            ) : null}
                            {downCount > 0 ? (
                              <View style={styles.skillProgressBadge}>
                                <Ionicons name="trending-down" size={12} color={Colors.dark.error} />
                                <Text style={[styles.skillProgressBadgeText, { color: Colors.dark.error }]}>
                                  {downCount} needs work
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null;
                      })()}

                      <View style={styles.playerFeedbackRow}>
                        <Text style={styles.playerFeedbackLabel}>Effort</Text>
                        <View style={styles.trendButtons}>
                          {([
                            { value: "high", label: "High", color: Colors.dark.primary },
                            { value: "normal", label: "Normal", color: Colors.dark.orange },
                            { value: "low", label: "Low", color: Colors.dark.error },
                          ] as const).map((opt) => (
                            <Pressable
                              key={opt.value}
                              style={[
                                styles.effortButton,
                                pf.effortLevel === opt.value && { backgroundColor: opt.color + "20", borderColor: opt.color },
                              ]}
                              onPress={() => updatePlayerFeedback(pf.playerId, "effortLevel", opt.value)}
                            >
                              <Text
                                style={[
                                  styles.effortButtonText,
                                  pf.effortLevel === opt.value && { color: opt.color },
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Quick Signals Section */}
                      <View style={styles.quickSignalsSection}>
                        <Text style={styles.playerFeedbackLabel}>Quick Signals (optional)</Text>
                        <View style={styles.quickSignalsGrid}>
                          {([
                            { id: "focused" as QuickSignal, icon: "eye-outline" as const, label: "Focused", domain: "mental" },
                            { id: "smart_decisions" as QuickSignal, icon: "bulb-outline" as const, label: "Smart", domain: "tactical" },
                            { id: "good_teammate" as QuickSignal, icon: "people-outline" as const, label: "Teammate", domain: "social" },
                            { id: "took_initiative" as QuickSignal, icon: "hand-right-outline" as const, label: "Initiative", domain: "social" },
                            { id: "showed_respect" as QuickSignal, icon: "heart-outline" as const, label: "Respect", domain: "social" },
                            { id: "listened_well" as QuickSignal, icon: "ear-outline" as const, label: "Listened", domain: "social" },
                            { id: "fair_play" as QuickSignal, icon: "shield-checkmark-outline" as const, label: "Fair Play", domain: "social" },
                          ] as const).map((signal) => {
                            const isActive = pf.quickSignals.includes(signal.id);
                            return (
                              <Pressable
                                key={signal.id}
                                style={[
                                  styles.quickSignalChip,
                                  isActive && styles.quickSignalChipActive,
                                ]}
                                onPress={() => toggleQuickSignal(pf.playerId, signal.id)}
                              >
                                <Ionicons 
                                  name={signal.icon} 
                                  size={14} 
                                  color={isActive ? Colors.dark.primary : Colors.dark.tabIconDefault} 
                                />
                                <Text style={[
                                  styles.quickSignalText,
                                  isActive && styles.quickSignalTextActive,
                                ]}>
                                  {signal.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        
                        {/* Social Correction (hidden toggle) */}
                        <Pressable
                          style={styles.issueToggle}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (pf.socialIssue) {
                              setSocialIssue(pf.playerId, null);
                            } else {
                              setSocialIssue(pf.playerId, "disruptive");
                            }
                          }}
                        >
                          <Ionicons 
                            name={pf.socialIssue ? "warning" : "warning-outline"} 
                            size={12} 
                            color={pf.socialIssue ? Colors.dark.error : Colors.dark.tabIconDefault} 
                          />
                          <Text style={[
                            styles.issueToggleText,
                            pf.socialIssue && { color: Colors.dark.error },
                          ]}>
                            {pf.socialIssue ? "Issue observed" : "Issue observed?"}
                          </Text>
                        </Pressable>
                        
                        {pf.socialIssue ? (
                          <View style={styles.issueOptions}>
                            {([
                              { id: "disruptive" as SocialIssue, label: "Disruptive" },
                              { id: "poor_attitude" as SocialIssue, label: "Poor attitude" },
                              { id: "disrespect" as SocialIssue, label: "Disrespect" },
                            ] as const).map((issue) => (
                              <Pressable
                                key={issue.id}
                                style={[
                                  styles.issueChip,
                                  pf.socialIssue === issue.id && styles.issueChipActive,
                                ]}
                                onPress={() => setSocialIssue(pf.playerId, issue.id)}
                              >
                                <Text style={[
                                  styles.issueChipText,
                                  pf.socialIssue === issue.id && styles.issueChipTextActive,
                                ]}>
                                  {issue.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </View>

                      {/* Domain Preview Chips (read-only) */}
                      {(() => {
                        const impact = calculateDomainImpact(pf);
                        const domains = [
                          { key: "technical", label: "Tech", value: impact.technical },
                          { key: "mental", label: "Mental", value: impact.mental },
                          { key: "physical", label: "Physical", value: impact.physical },
                          { key: "social", label: "Social", value: impact.social },
                          { key: "tactical", label: "Tactical", value: impact.tactical },
                        ];
                        const hasAnyChange = domains.some(d => d.value !== "stable");
                        if (!hasAnyChange) return null;
                        return (
                          <View style={styles.domainPreviewSection}>
                            <Text style={styles.domainPreviewLabel}>Core Impact (auto)</Text>
                            <View style={styles.domainPreviewGrid}>
                              {domains.map((d) => (
                                <View 
                                  key={d.key} 
                                  style={[
                                    styles.domainPreviewChip,
                                    d.value === "up" && styles.domainPreviewUp,
                                    d.value === "down" && styles.domainPreviewDown,
                                  ]}
                                >
                                  {d.value === "up" ? (
                                    <Ionicons name="arrow-up" size={10} color={Colors.dark.primary} />
                                  ) : d.value === "down" ? (
                                    <Ionicons name="arrow-down" size={10} color={Colors.dark.error} />
                                  ) : null}
                                  <Text style={[
                                    styles.domainPreviewText,
                                    d.value === "up" && { color: Colors.dark.primary },
                                    d.value === "down" && { color: Colors.dark.error },
                                  ]}>
                                    {d.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })()}

                      <View style={styles.skillChipsSection}>
                        <Text style={styles.playerFeedbackLabel}>Skills (tap to toggle)</Text>
                        {/* Skill Groups - Collapsible (per-player) */}
                        {skillGroups.map((group) => {
                          const playerGroups = getPlayerExpandedGroups(pf.playerId);
                          const isExpanded = playerGroups.has(group.key);
                          const groupSkillsWithState = group.skills.filter(s => pf.skillProgress[s]);
                          const hasUpSkills = group.skills.some(s => pf.skillProgress[s] === "up");
                          const hasDownSkills = group.skills.some(s => pf.skillProgress[s] === "down");
                          
                          return (
                            <View key={group.key} style={styles.skillGroupContainer}>
                              <Pressable 
                                style={styles.skillGroupHeader}
                                onPress={() => toggleSkillGroup(pf.playerId, group.key)}
                              >
                                <View style={styles.skillGroupHeaderLeft}>
                                  <Ionicons 
                                    name={isExpanded ? "chevron-down" : "chevron-forward"} 
                                    size={16} 
                                    color={Colors.dark.tabIconDefault} 
                                  />
                                  <Text style={styles.skillGroupLabel}>{group.label}</Text>
                                  {!isExpanded && groupSkillsWithState.length > 0 ? (
                                    <View style={styles.skillGroupBadge}>
                                      {hasUpSkills ? (
                                        <Ionicons name="trending-up" size={10} color={Colors.dark.primary} />
                                      ) : hasDownSkills ? (
                                        <Ionicons name="trending-down" size={10} color={Colors.dark.error} />
                                      ) : null}
                                      <Text style={[
                                        styles.skillGroupBadgeText,
                                        hasUpSkills && { color: Colors.dark.primary },
                                        hasDownSkills && { color: Colors.dark.error },
                                      ]}>
                                        {groupSkillsWithState.length}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </Pressable>
                              {isExpanded ? (
                                <View style={styles.skillChipsGrid}>
                                  {group.skills.sort((a, b) => {
                                    const aFocused = focusTags.includes(a);
                                    const bFocused = focusTags.includes(b);
                                    if (aFocused && !bFocused) return -1;
                                    if (!aFocused && bFocused) return 1;
                                    return 0;
                                  }).map((skill) => {
                                    const state = pf.skillProgress[skill];
                                    const icon = getSkillChipIcon(state);
                                    const isFocused = focusTags.includes(skill);
                                    return (
                                      <Pressable
                                        key={skill}
                                        style={[
                                          styles.skillChip,
                                          isFocused && !state && styles.skillChipFocused,
                                          getSkillChipStyle(state),
                                        ]}
                                        onPress={() => cycleSkillState(pf.playerId, skill)}
                                      >
                                        {isFocused && !state ? (
                                          <Ionicons name="star" size={10} color={Colors.dark.gold} />
                                        ) : icon ? (
                                          <Ionicons name={icon} size={12} color={getSkillChipColor(state)} />
                                        ) : null}
                                        <Text style={[
                                          styles.skillChipText, 
                                          { color: getSkillChipColor(state) },
                                          isFocused && !state && { color: Colors.dark.gold },
                                        ]}>
                                          {skill}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        {/* Warning when too many skills (>7) marked as improved */}
                        {Object.values(pf.skillProgress).filter(s => s === "up").length > 7 ? (
                          <View style={styles.skillWarning}>
                            <Ionicons name="warning-outline" size={14} color={Colors.dark.orange} />
                            <Text style={styles.skillWarningText}>
                              Many skills improved - consider focusing on key areas
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <TextInput
                        style={styles.playerNoteInput}
                        placeholder="Optional coach note..."
                        placeholderTextColor={Colors.dark.tabIconDefault}
                        value={pf.note}
                        onChangeText={(text) => updatePlayerFeedback(pf.playerId, "note", text)}
                        maxLength={100}
                      />
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackLabel}>General note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Short note about the session..."
            placeholderTextColor={Colors.dark.tabIconDefault}
            value={generalNote}
            onChangeText={setGeneralNote}
            multiline
            maxLength={200}
          />
        </View>

        <Pressable
          style={[styles.saveButton, saveFeedbackMutation.isPending && styles.saveButtonDisabled]}
          onPress={handleSaveFeedback}
          disabled={saveFeedbackMutation.isPending}
        >
          {saveFeedbackMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
              <Text style={styles.saveButtonText}>Save Feedback</Text>
            </>
          )}
        </Pressable>
        </ScrollView>
      </View>
  );
}
