import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Colors, Spacing } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { Player, PackageTemplate, CreditPackageOption } from "./types";

const CREDIT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  private: { label: "Private Credits", color: Colors.dark.sessionPrivate, icon: "person" },
  semi: { label: "Semi-Private Credits", color: Colors.dark.sessionSemiPrivate, icon: "people" },
  group: { label: "Group Credits", color: Colors.dark.sessionGroup, icon: "people-circle" },
};

interface SelectedCreditPackage {
  creditType: string;
  credits: number;
  price: string;
}

interface PastSession {
  id: string;
  startTime: string;
  weekNumber?: number;
}

const BALL_LEVELS = ["Blue", "Red", "Orange", "Green", "Yellow", "Glow"];

interface SeriesAddPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
  showAttendanceBackfill: boolean;
  showPackageSelection: boolean;
  selectedPlayerId: string | null;
  joinDate: Date;
  setJoinDate: (date: Date) => void;
  isGuestAdd: boolean;
  setIsGuestAdd: (v: boolean) => void;
  guestUntilDate: Date;
  setGuestUntilDate: (date: Date) => void;
  showDatePicker: boolean;
  setShowDatePicker: (v: boolean) => void;
  showGuestDatePicker: boolean;
  setShowGuestDatePicker: (v: boolean) => void;
  selectedAttendance: Record<string, boolean>;
  setSelectedAttendance: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  pastSessions: PastSession[];
  addPlayerIsPending: boolean;
  handleSavePlayer: () => void;
  showCreatePackageForm: boolean;
  setShowCreatePackageForm: (v: boolean) => void;
  newPackageName: string;
  setNewPackageName: (v: string) => void;
  newPackageCredits: string;
  setNewPackageCredits: (v: string) => void;
  newPackagePricePerCredit: string;
  setNewPackagePricePerCredit: (v: string) => void;
  createPackageIsPending: boolean;
  handleCreatePackage: () => void;
  creditPackagesByType: Record<string, CreditPackageOption[]>;
  expandedCreditType: string | null;
  setExpandedCreditType: (v: string | null) => void;
  selectedCreditPackage: SelectedCreditPackage | null;
  setSelectedCreditPackage: (pkg: SelectedCreditPackage | null) => void;
  selectedPackageTemplateId: string | null;
  setSelectedPackageTemplateId: (id: string | null) => void;
  packageTemplates: PackageTemplate[];
  deleteTemplateIsPending: boolean;
  onDeleteTemplate: (id: string) => void;
  handleSelectPackage: (id: string) => void;
  handleSkipPackage: () => void;
  onAssignCreditPackage: () => void;
  allPlayers: Player[];
  filteredPlayers: Player[];
  playerSearch: string;
  setPlayerSearch: (v: string) => void;
  ballLevelFilter: string | null;
  setBallLevelFilter: (v: string | null) => void;
  handlePlayerSelect: (playerId: string) => void;
  handleContinueToPackage: () => void;
  getBallLevelColor: (level?: string | null) => string;
  formatDate: (date: string | Date) => string;
}

export function SeriesAddPlayerModal({
  visible,
  onClose,
  bottomInset,
  showAttendanceBackfill,
  showPackageSelection,
  selectedPlayerId,
  joinDate,
  setJoinDate,
  isGuestAdd,
  setIsGuestAdd,
  guestUntilDate,
  setGuestUntilDate,
  showDatePicker,
  setShowDatePicker,
  showGuestDatePicker,
  setShowGuestDatePicker,
  selectedAttendance,
  setSelectedAttendance,
  pastSessions,
  addPlayerIsPending,
  handleSavePlayer,
  showCreatePackageForm,
  setShowCreatePackageForm,
  newPackageName,
  setNewPackageName,
  newPackageCredits,
  setNewPackageCredits,
  newPackagePricePerCredit,
  setNewPackagePricePerCredit,
  createPackageIsPending,
  handleCreatePackage,
  creditPackagesByType,
  expandedCreditType,
  setExpandedCreditType,
  selectedCreditPackage,
  setSelectedCreditPackage,
  selectedPackageTemplateId,
  setSelectedPackageTemplateId,
  packageTemplates,
  deleteTemplateIsPending,
  onDeleteTemplate,
  handleSelectPackage,
  handleSkipPackage,
  onAssignCreditPackage,
  allPlayers,
  filteredPlayers,
  playerSearch,
  setPlayerSearch,
  ballLevelFilter,
  setBallLevelFilter,
  handlePlayerSelect,
  handleContinueToPackage,
  getBallLevelColor,
  formatDate,
}: SeriesAddPlayerModalProps) {
  const titleText = showAttendanceBackfill
    ? "Mark Attendance"
    : showPackageSelection
      ? "Assign Package"
      : selectedPlayerId
        ? "Set Join Date"
        : "Add Player";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.drawer, { paddingBottom: bottomInset + Spacing.md }]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <View style={styles.addPlayerHeader}>
            <Text style={styles.addPlayerTitle}>{titleText}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>

          {showAttendanceBackfill ? (
            <ScrollView style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 100 }}>
              <Text style={styles.backfillSubtitle}>
                Mark which past sessions this player attended since {joinDate.toLocaleDateString()}
              </Text>
              {pastSessions.map((session, idx) => (
                <Pressable
                  key={session.id}
                  style={[
                    styles.attendanceRow,
                    selectedAttendance[session.id] && styles.attendanceRowSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedAttendance(prev => ({ ...prev, [session.id]: !prev[session.id] }));
                  }}
                >
                  <View style={styles.attendanceCheck}>
                    {selectedAttendance[session.id] ? (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.dark.successNeon} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={24} color={Colors.dark.textMuted} />
                    )}
                  </View>
                  <View style={styles.attendanceInfo}>
                    <Text style={styles.attendanceDate}>{formatDate(session.startTime)}</Text>
                    <Text style={styles.attendanceWeek}>Week {session.weekNumber || idx + 1}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable
                style={[styles.saveButton, addPlayerIsPending && styles.saveButtonDisabled]}
                onPress={handleSavePlayer}
                disabled={addPlayerIsPending}
              >
                {addPlayerIsPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    Save ({Object.values(selectedAttendance).filter(Boolean).length} sessions attended)
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          ) : showPackageSelection ? (
            <KeyboardAwareScrollViewCompat style={styles.addPlayerContent} contentContainerStyle={{ paddingBottom: 100 }}>
              <Text style={styles.backfillSubtitle}>
                Optionally assign a credit package to this player
              </Text>

              {showCreatePackageForm ? (
                <View style={styles.createPackageForm}>
                  <Text style={styles.createPackageTitle}>Create New Package</Text>

                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>Package Name</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g., 10 Lesson Pack"
                      placeholderTextColor={Colors.dark.textMuted}
                      value={newPackageName}
                      onChangeText={setNewPackageName}
                    />
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.formField, { flex: 1 }]}>
                      <Text style={styles.formLabel}>Credits</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="10"
                        placeholderTextColor={Colors.dark.textMuted}
                        keyboardType="numeric"
                        value={newPackageCredits}
                        onChangeText={setNewPackageCredits}
                      />
                    </View>
                    <View style={[styles.formField, { flex: 1, marginLeft: Spacing.sm }]}>
                      <Text style={styles.formLabel}>Price/Credit (AED)</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="150"
                        placeholderTextColor={Colors.dark.textMuted}
                        keyboardType="decimal-pad"
                        value={newPackagePricePerCredit}
                        onChangeText={setNewPackagePricePerCredit}
                      />
                    </View>
                  </View>

                  {newPackageCredits && newPackagePricePerCredit ? (
                    <Text style={styles.totalPricePreview}>
                      Total: AED {(parseInt(newPackageCredits, 10) * parseFloat(newPackagePricePerCredit) || 0).toFixed(0)}
                    </Text>
                  ) : null}

                  <View style={styles.formActions}>
                    <Pressable
                      style={styles.formCancelButton}
                      onPress={() => {
                        setShowCreatePackageForm(false);
                        setNewPackageName("");
                        setNewPackageCredits("");
                        setNewPackagePricePerCredit("");
                      }}
                    >
                      <Text style={styles.formCancelButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.formSaveButton,
                        (!newPackageName.trim() || !newPackageCredits || !newPackagePricePerCredit || createPackageIsPending) && styles.formSaveButtonDisabled,
                      ]}
                      onPress={handleCreatePackage}
                      disabled={!newPackageName.trim() || !newPackageCredits || !newPackagePricePerCredit || createPackageIsPending}
                    >
                      {createPackageIsPending ? (
                        <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
                      ) : (
                        <Text style={styles.formSaveButtonText}>Create Package</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={16} color={Colors.dark.textMuted} />
                    <Text style={styles.infoBoxText}>
                      Credit packages are automatically priced based on your session pricing.
                    </Text>
                  </View>

                  {Object.entries(creditPackagesByType).map(([creditType, packages]) => {
                    const config = CREDIT_TYPE_CONFIG[creditType] || { label: creditType, color: Colors.dark.textMuted, icon: "cube" };
                    const isExpanded = expandedCreditType === creditType;
                    const pricePerCredit = packages[0]?.pricePerCredit || "0";
                    const currency = packages[0]?.currency || "AED";

                    return (
                      <View key={creditType} style={styles.creditAccordion}>
                        <Pressable
                          style={[styles.creditAccordionHeader, isExpanded && styles.creditAccordionHeaderExpanded]}
                          onPress={() => setExpandedCreditType(isExpanded ? null : creditType)}
                        >
                          <View style={styles.creditAccordionLeft}>
                            <View style={[styles.creditTypeIcon, { backgroundColor: config.color + "30" }]}>
                              <Ionicons name={config.icon as "person" | "people" | "people-circle"} size={20} color={config.color} />
                            </View>
                            <View>
                              <Text style={styles.creditAccordionTitle}>{config.label}</Text>
                              <Text style={styles.creditAccordionSubtitle}>
                                {currency} {parseFloat(pricePerCredit).toFixed(2)} per credit
                              </Text>
                            </View>
                          </View>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.textMuted} />
                        </Pressable>

                        {isExpanded ? (
                          <View style={styles.creditOptionsGrid}>
                            {packages.map((pkg) => {
                              const isSelected = selectedCreditPackage?.creditType === pkg.creditType &&
                                selectedCreditPackage?.credits === pkg.credits;
                              return (
                                <Pressable
                                  key={`${pkg.creditType}-${pkg.credits}`}
                                  style={[styles.creditOption, isSelected && styles.creditOptionSelected]}
                                  onPress={() => {
                                    setSelectedPackageTemplateId(null);
                                    setSelectedCreditPackage({
                                      creditType: pkg.creditType,
                                      credits: pkg.credits,
                                      price: pkg.totalPrice,
                                    });
                                  }}
                                >
                                  <Text style={[styles.creditOptionCredits, isSelected && styles.creditOptionTextSelected]}>
                                    {pkg.credits}
                                  </Text>
                                  <Text style={[styles.creditOptionLabel, isSelected && styles.creditOptionTextSelected]}>
                                    {pkg.credits === 1 ? "credit" : "credits"}
                                  </Text>
                                  <Text style={[styles.creditOptionPrice, isSelected && styles.creditOptionTextSelected]}>
                                    {pkg.currency} {parseFloat(pkg.totalPrice).toFixed(0)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  {selectedCreditPackage ? (
                    <Pressable
                      style={[styles.assignPackageButton, addPlayerIsPending && styles.assignPackageButtonDisabled]}
                      onPress={onAssignCreditPackage}
                      disabled={addPlayerIsPending}
                    >
                      <Text style={styles.assignPackageButtonText}>
                        {addPlayerIsPending ? "Adding..." : `Assign ${selectedCreditPackage.credits} ${selectedCreditPackage.creditType} Credits`}
                      </Text>
                    </Pressable>
                  ) : null}

                  {packageTemplates.length > 0 ? (
                    <View style={styles.templateSection}>
                      <Text style={styles.templateSectionTitle}>Or select a saved package:</Text>
                      {packageTemplates.map((template) => (
                        <View key={template.id} style={styles.templateRow}>
                          <Pressable
                            style={[
                              styles.packageCard,
                              styles.packageCardFlex,
                              selectedPackageTemplateId === template.id && styles.packageCardSelected,
                            ]}
                            onPress={() => {
                              setSelectedCreditPackage(null);
                              handleSelectPackage(template.id);
                            }}
                          >
                            <View style={styles.packageInfo}>
                              <Text style={styles.packageName}>{template.name}</Text>
                              <Text style={styles.packageDetails}>
                                {template.credits} credits - Valid {template.validityDays} days
                              </Text>
                            </View>
                            <Text style={styles.packagePrice}>
                              {template.currency} {parseFloat(template.price).toFixed(0)}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.templateDeleteButton}
                            onPress={() => onDeleteTemplate(template.id)}
                            disabled={deleteTemplateIsPending}
                          >
                            <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <Pressable style={styles.createPackageButton} onPress={() => setShowCreatePackageForm(true)}>
                    <Ionicons name="add-circle-outline" size={20} color={Colors.dark.successNeon} />
                    <Text style={styles.createPackageButtonText}>Create Custom Package</Text>
                  </Pressable>
                </>
              )}

              <Pressable
                style={[styles.skipButton, addPlayerIsPending && styles.skipButtonDisabled]}
                onPress={handleSkipPackage}
                disabled={addPlayerIsPending}
              >
                <Text style={styles.skipButtonText}>
                  {addPlayerIsPending ? "Adding..." : "Skip - Add Without Package"}
                </Text>
              </Pressable>
            </KeyboardAwareScrollViewCompat>
          ) : selectedPlayerId ? (
            <View style={styles.addPlayerContent}>
              <Text style={styles.selectedPlayerName}>
                {allPlayers.find(p => p.id === selectedPlayerId)?.name}
              </Text>

              <Text style={styles.dateLabel}>When did they join this class?</Text>
              {Platform.OS === "web" ? (
                <WebCalendarPicker
                  value={joinDate}
                  onChange={setJoinDate}
                  maximumDate={new Date()}
                />
              ) : (
                <>
                  <Pressable style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.dark.successNeon} />
                    <Text style={styles.datePickerText}>{joinDate.toLocaleDateString()}</Text>
                  </Pressable>
                  {showDatePicker ? (
                    <DateTimePicker
                      value={joinDate}
                      mode="date"
                      display="default"
                      onChange={(_, date) => {
                        setShowDatePicker(false);
                        if (date) setJoinDate(date);
                      }}
                      maximumDate={new Date()}
                    />
                  ) : null}
                </>
              )}

              <View style={styles.guestToggleContainer}>
                <View style={styles.guestToggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.guestToggleLabel}>Add as Guest</Text>
                    <Text style={styles.guestToggleSubtext}>Temporary membership with an end date</Text>
                  </View>
                  <Pressable
                    style={[styles.guestToggleSwitch, isGuestAdd && styles.guestToggleSwitchActive]}
                    onPress={() => setIsGuestAdd(!isGuestAdd)}
                  >
                    <View style={[styles.guestToggleKnob, isGuestAdd && styles.guestToggleKnobActive]} />
                  </Pressable>
                </View>

                {isGuestAdd ? (
                  <View style={styles.guestDateSection}>
                    <Text style={styles.guestDateLabel}>Guest until</Text>
                    <View style={styles.guestQuickButtons}>
                      {[
                        { label: "1 week", days: 7 },
                        { label: "2 weeks", days: 14 },
                        { label: "1 month", days: 30 },
                      ].map(({ label, days }) => {
                        const target = new Date();
                        target.setDate(target.getDate() + days);
                        const isSelected = Math.abs(guestUntilDate.getTime() - target.getTime()) < 86400000;
                        return (
                          <Pressable
                            key={label}
                            style={[styles.guestQuickBtn, isSelected && styles.guestQuickBtnActive]}
                            onPress={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + days);
                              setGuestUntilDate(d);
                            }}
                          >
                            <Text style={[styles.guestQuickBtnText, isSelected && styles.guestQuickBtnTextActive]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable style={styles.datePickerButton} onPress={() => setShowGuestDatePicker(true)}>
                      <Ionicons name="calendar-outline" size={18} color={Colors.dark.orange} />
                      <Text style={[styles.datePickerText, { color: Colors.dark.orange }]}>
                        Until {guestUntilDate.toLocaleDateString()}
                      </Text>
                    </Pressable>
                    {showGuestDatePicker ? (
                      <DateTimePicker
                        value={guestUntilDate}
                        mode="date"
                        display="default"
                        onChange={(_, date) => {
                          setShowGuestDatePicker(false);
                          if (date) setGuestUntilDate(date);
                        }}
                        minimumDate={new Date()}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>

              <Pressable style={[styles.saveButton, { marginTop: Spacing.xl }]} onPress={handleContinueToPackage}>
                <Text style={styles.saveButtonText}>Continue</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.addPlayerContent}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search players..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={playerSearch}
                  onChangeText={setPlayerSearch}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, gap: Spacing.xs }}
              >
                <Pressable
                  style={[
                    ballLevelChipStyles.chip,
                    ballLevelFilter === null && ballLevelChipStyles.chipSelected,
                  ]}
                  onPress={() => setBallLevelFilter(null)}
                >
                  <Text style={[ballLevelChipStyles.chipText, ballLevelFilter === null && ballLevelChipStyles.chipTextSelected]}>
                    All
                  </Text>
                </Pressable>
                {BALL_LEVELS.map((level) => {
                  const color = getBallLevelColor(level);
                  const isSelected = ballLevelFilter === level.toLowerCase();
                  return (
                    <Pressable
                      key={level}
                      style={[
                        ballLevelChipStyles.chip,
                        isSelected && { backgroundColor: color, borderColor: color },
                      ]}
                      onPress={() => setBallLevelFilter(isSelected ? null : level.toLowerCase())}
                    >
                      <View style={[ballLevelChipStyles.chipDot, { backgroundColor: isSelected ? "#fff" : color }]} />
                      <Text style={[ballLevelChipStyles.chipText, isSelected && { color: "#fff" }]}>
                        {level}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ScrollView style={styles.playerList}>
                {filteredPlayers.length === 0 ? (
                  <Text style={styles.noPlayersText}>
                    {playerSearch ? "No matching players" : "No available players"}
                  </Text>
                ) : (
                  filteredPlayers.map((player) => {
                    const playerBallColor = getBallLevelColor(player.ballLevel);
                    return (
                      <Pressable
                        key={player.id}
                        style={styles.selectablePlayerRow}
                        onPress={() => handlePlayerSelect(player.id)}
                      >
                        <View style={[styles.playerAvatar, { backgroundColor: playerBallColor + "30", borderWidth: 2, borderColor: playerBallColor }]}>
                          <Text style={[styles.playerInitial, { color: playerBallColor }]}>
                            {player.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.playerInfo}>
                          <Text style={styles.playerName}>{player.name}</Text>
                          {player.ballLevel ? (
                            <Text style={styles.playerStats}>{player.ballLevel.toUpperCase()}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const ballLevelChipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundElevated,
    gap: 5,
  },
  chipSelected: {
    backgroundColor: Colors.dark.successNeon + "20",
    borderColor: Colors.dark.successNeon,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextSelected: {
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
});
