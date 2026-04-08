import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { styles } from "./seriesDetailStyles";
import { WebCalendarPicker } from "@/components/WebCalendarPicker";
import type { TimeSlot, CourtOption } from "./types";

interface SeriesExtraLessonModalProps {
  visible: boolean;
  onReset: () => void;
  extraLessonStep: number;
  setExtraLessonStep: (step: number) => void;
  extraLessonDate: Date;
  setExtraLessonDate: (date: Date) => void;
  showExtraLessonDatePicker: boolean;
  setShowExtraLessonDatePicker: (v: boolean) => void;
  selectedCourtId: string | null;
  setSelectedCourtId: (id: string | null) => void;
  courtsData: CourtOption[] | undefined;
  timeSlots: TimeSlot[];
  selectedTimeSlot: string | null;
  setSelectedTimeSlot: (time: string | null) => void;
  selectedEndTimeSlot: string | null;
  setSelectedEndTimeSlot: (time: string | null) => void;
  setExtraLessonTime: (time: Date) => void;
  isInRange: (time: string) => boolean;
  isRangeClear: (start: string, end: string) => boolean;
  calcDurationMins: (start: string, end: string) => number;
  confirmAddExtraLesson: () => void;
}

export function SeriesExtraLessonModal({
  visible,
  onReset,
  extraLessonStep,
  setExtraLessonStep,
  extraLessonDate,
  setExtraLessonDate,
  showExtraLessonDatePicker,
  setShowExtraLessonDatePicker,
  selectedCourtId,
  setSelectedCourtId,
  courtsData,
  timeSlots,
  selectedTimeSlot,
  setSelectedTimeSlot,
  selectedEndTimeSlot,
  setSelectedEndTimeSlot,
  setExtraLessonTime,
  isInRange,
  isRangeClear,
  calcDurationMins,
  confirmAddExtraLesson,
}: SeriesExtraLessonModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onReset}
    >
      <View style={styles.extendModalOverlay}>
        <View style={styles.extendModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onReset} />
        </View>
        <View style={styles.extendModalContent}>
          <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: Spacing.md, gap: Spacing.xs }}>
            {[1, 2, 3].map((step) => (
              <View
                key={step}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: extraLessonStep >= step ? Colors.dark.warning : Colors.dark.border
                }}
              />
            ))}
          </View>

          {extraLessonStep === 1 && (
            <>
              <View style={styles.extendModalHeader}>
                <Ionicons name="tennisball-outline" size={32} color={Colors.dark.warning} />
                <Text style={styles.extendModalTitle}>Select Court</Text>
                <Text style={styles.extendModalSubtitle}>Choose a court for the extra lesson</Text>
              </View>

              <View style={{ marginBottom: Spacing.md }}>
                {courtsData && courtsData.length > 0 ? (
                  courtsData.map((court, index) => (
                    <Pressable
                      key={court.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: Spacing.md,
                        borderRadius: BorderRadius.md,
                        backgroundColor: selectedCourtId === court.id ? Colors.dark.warning + "20" : Colors.dark.backgroundSecondary,
                        borderWidth: 2,
                        borderColor: selectedCourtId === court.id ? Colors.dark.warning : Colors.dark.border,
                        marginBottom: index < courtsData.length - 1 ? Spacing.sm : 0,
                      }}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedCourtId(court.id);
                      }}
                    >
                      <View style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: court.color || Colors.dark.accent,
                        marginRight: Spacing.md,
                      }} />
                      <Text style={{
                        color: selectedCourtId === court.id ? Colors.dark.warning : Colors.dark.text,
                        fontSize: 16,
                        fontWeight: selectedCourtId === court.id ? "600" : "400",
                        flex: 1,
                      }}>
                        {court.name}
                      </Text>
                      {selectedCourtId === court.id && (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.dark.warning} />
                      )}
                    </Pressable>
                  ))
                ) : (
                  <View style={{ padding: Spacing.lg, alignItems: "center" }}>
                    <Ionicons name="tennisball-outline" size={40} color={Colors.dark.textMuted} />
                    <Text style={{ color: Colors.dark.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
                      No courts available
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.extendModalFooter}>
                <Pressable style={styles.extendCancelButton} onPress={onReset}>
                  <Text style={styles.extendCancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.extendConfirmButton, !selectedCourtId && { opacity: 0.5 }]}
                  onPress={() => selectedCourtId && setExtraLessonStep(2)}
                  disabled={!selectedCourtId}
                >
                  <LinearGradient
                    colors={[Colors.dark.warning, Colors.dark.warning]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.extendConfirmGradient}
                  >
                    <Text style={styles.extendConfirmButtonText}>Next</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          )}

          {extraLessonStep === 2 && (
            <>
              <View style={styles.extendModalHeader}>
                <Ionicons name="calendar-outline" size={32} color={Colors.dark.warning} />
                <Text style={styles.extendModalTitle}>Select Date</Text>
                <Text style={styles.extendModalSubtitle}>Pick a date for the extra lesson</Text>
              </View>

              {Platform.OS === "web" ? (
                <WebCalendarPicker
                  value={extraLessonDate}
                  onChange={(date) => setExtraLessonDate(date)}
                />
              ) : (
                <>
                  <Pressable
                    style={styles.datePickerButton}
                    onPress={() => setShowExtraLessonDatePicker(true)}
                  >
                    <Ionicons name="calendar" size={20} color={Colors.dark.accent} />
                    <Text style={styles.datePickerText}>
                      {extraLessonDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </Text>
                  </Pressable>
                  {showExtraLessonDatePicker && (
                    <DateTimePicker
                      value={extraLessonDate}
                      mode="date"
                      display="default"
                      onChange={(event, selectedDate) => {
                        setShowExtraLessonDatePicker(false);
                        if (selectedDate) setExtraLessonDate(selectedDate);
                      }}
                    />
                  )}
                </>
              )}

              <View style={[styles.extendModalFooter, { marginTop: Spacing.lg }]}>
                <Pressable style={styles.extendCancelButton} onPress={() => setExtraLessonStep(1)}>
                  <Ionicons name="arrow-back" size={16} color={Colors.dark.textSecondary} />
                  <Text style={styles.extendCancelButtonText}>Back</Text>
                </Pressable>
                <Pressable style={styles.extendConfirmButton} onPress={() => setExtraLessonStep(3)}>
                  <LinearGradient
                    colors={[Colors.dark.warning, Colors.dark.warning]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.extendConfirmGradient}
                  >
                    <Text style={styles.extendConfirmButtonText}>Next</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          )}

          {extraLessonStep === 3 && (
            <>
              <View style={styles.extendModalHeader}>
                <Ionicons name="time-outline" size={32} color={Colors.dark.warning} />
                <Text style={styles.extendModalTitle}>Available Times</Text>
                <Text style={styles.extendModalSubtitle}>
                  {courtsData?.find(c => c.id === selectedCourtId)?.name || "Court"} - {extraLessonDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
                <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginTop: 4 }}>
                  Tap a start time, then tap an end time to set duration
                </Text>
              </View>

              <View style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                marginBottom: Spacing.md,
              }}>
                {timeSlots.map((slot) => {
                  const isStart = selectedTimeSlot === slot.time;
                  const isEnd = selectedEndTimeSlot === slot.time;
                  const inRange = isInRange(slot.time);
                  const isHighlighted = isStart || isEnd || inRange;
                  const busyLabel = slot.coachBusy ? "You're busy" : slot.courtBusy ? "Court busy" : !slot.available ? "Booked" : "";
                  return (
                    <Pressable
                      key={slot.time}
                      style={{
                        width: "23%",
                        paddingVertical: Spacing.xs,
                        paddingHorizontal: Spacing.xs,
                        marginBottom: Spacing.xs,
                        borderRadius: BorderRadius.md,
                        borderWidth: 2,
                        borderColor: isHighlighted ? Colors.dark.successNeon : slot.coachBusy ? "#FF6B6B60" : Colors.dark.border,
                        backgroundColor: isHighlighted
                          ? Colors.dark.successNeon + "30"
                          : slot.coachBusy
                            ? "#FF6B6B15"
                            : slot.available
                              ? Colors.dark.backgroundSecondary
                              : Colors.dark.backgroundRoot,
                        opacity: slot.available ? 1 : 0.5,
                        alignItems: "center",
                      }}
                      onPress={() => {
                        if (!slot.available) return;
                        Haptics.selectionAsync();
                        const slotMins = (() => { const [h, m] = slot.time.split(":").map(Number); return h * 60 + m; })();

                        if (!selectedTimeSlot) {
                          setSelectedTimeSlot(slot.time);
                          setSelectedEndTimeSlot(null);
                          const [hours, minutes] = slot.time.split(":");
                          const newTime = new Date();
                          newTime.setHours(parseInt(hours), parseInt(minutes || "0"), 0, 0);
                          setExtraLessonTime(newTime);
                        } else {
                          const startMins = (() => { const [h, m] = selectedTimeSlot.split(":").map(Number); return h * 60 + m; })();
                          if (slot.time === selectedTimeSlot) {
                            setSelectedTimeSlot(null);
                            setSelectedEndTimeSlot(null);
                          } else if (slotMins > startMins && isRangeClear(selectedTimeSlot, slot.time)) {
                            setSelectedEndTimeSlot(slot.time);
                          } else {
                            setSelectedTimeSlot(slot.time);
                            setSelectedEndTimeSlot(null);
                            const [hours, minutes] = slot.time.split(":");
                            const newTime = new Date();
                            newTime.setHours(parseInt(hours), parseInt(minutes || "0"), 0, 0);
                            setExtraLessonTime(newTime);
                          }
                        }
                      }}
                    >
                      <Text style={{
                        color: isHighlighted ? Colors.dark.successNeon : slot.available ? Colors.dark.text : Colors.dark.textMuted,
                        fontSize: 13,
                        fontWeight: isHighlighted ? "700" : "500",
                      }}>
                        {slot.time}
                      </Text>
                      {busyLabel ? (
                        <Text style={{ color: slot.coachBusy ? "#FF6B6B" : Colors.dark.textMuted, fontSize: 8, marginTop: 1 }}>
                          {busyLabel}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              {selectedTimeSlot ? (
                <View style={{
                  padding: Spacing.md,
                  backgroundColor: Colors.dark.successNeon + "15",
                  borderRadius: BorderRadius.md,
                  borderWidth: 1,
                  borderColor: Colors.dark.successNeon + "40",
                  marginBottom: Spacing.md,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
                    {selectedEndTimeSlot ? (
                      <Text style={{ color: Colors.dark.successNeon, fontWeight: "600", fontSize: 14 }}>
                        {selectedTimeSlot} {"->"} {selectedEndTimeSlot} ({calcDurationMins(selectedTimeSlot, selectedEndTimeSlot)} min)
                      </Text>
                    ) : (
                      <Text style={{ color: Colors.dark.successNeon, fontWeight: "600", fontSize: 14 }}>
                        Start: {selectedTimeSlot} — tap an end time
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}

              <View style={[styles.extendModalFooter, { marginTop: Spacing.sm }]}>
                <Pressable style={styles.extendCancelButton} onPress={() => setExtraLessonStep(2)}>
                  <Ionicons name="arrow-back" size={16} color={Colors.dark.textSecondary} />
                  <Text style={styles.extendCancelButtonText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.extendConfirmButton, !selectedTimeSlot && { opacity: 0.5 }]}
                  onPress={confirmAddExtraLesson}
                  disabled={!selectedTimeSlot}
                >
                  <LinearGradient
                    colors={[Colors.dark.successNeon, Colors.dark.accentGreen]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.extendConfirmGradient}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={Colors.dark.buttonText} />
                    <Text style={styles.extendConfirmButtonText}>Add Lesson</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
