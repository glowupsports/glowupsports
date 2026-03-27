import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { styles } from "./calendarStyles";

type SelectedCell = { hour: number; courtId?: string; date?: string };

interface BlockData {
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  reason: string;
}

interface CalendarBlockModalProps {
  visible: boolean;
  onClose: () => void;
  selectedCells: SelectedCell[];
  onConfirm: (data: BlockData) => void;
  isConfirming: boolean;
}

function formatTime(hour: number): string {
  const h = hour % 12 || 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}

export function CalendarBlockModal({ visible, onClose, selectedCells, onConfirm, isConfirming }: CalendarBlockModalProps) {
  const [blockDateFrom, setBlockDateFrom] = useState(new Date());
  const [blockDateTo, setBlockDateTo] = useState(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [blockWeekdays, setBlockWeekdays] = useState<number[]>([new Date().getDay()]);
  const [blockReason, setBlockReason] = useState("personal");

  const handleConfirm = () => {
    const allHours = selectedCells.map((c) => c.hour).sort((a, b) => a - b);
    const uniqueHours = [...new Set(allHours)];
    const startH = uniqueHours[0];
    const endH = uniqueHours[uniqueHours.length - 1] + 1;
    const startTime = `${startH.toString().padStart(2, "0")}:00`;
    const endTime = `${endH.toString().padStart(2, "0")}:00`;
    const startDate = `${blockDateFrom.getFullYear()}-${(blockDateFrom.getMonth() + 1).toString().padStart(2, "0")}-${blockDateFrom.getDate().toString().padStart(2, "0")}`;
    const endDate = `${blockDateTo.getFullYear()}-${(blockDateTo.getMonth() + 1).toString().padStart(2, "0")}-${blockDateTo.getDate().toString().padStart(2, "0")}`;
    onConfirm({ startDate, endDate, weekdays: blockWeekdays, startTime, endTime, reason: blockReason });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.blockModalOverlay} onPress={onClose}>
        <ScrollView style={{ maxHeight: "90%" }} contentContainerStyle={{ justifyContent: "center", flexGrow: 1 }}>
          <Pressable style={styles.blockModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.blockModalTitle}>BLOCK MY TIME</Text>
            <Text style={styles.blockModalSubtitle}>Block your availability as a coach</Text>

            {/* Time summary */}
            <View style={styles.blockModalSummary}>
              {(() => {
                const allHours = selectedCells.map((c) => c.hour).sort((a, b) => a - b);
                const uniqueHours = [...new Set(allHours)];
                if (uniqueHours.length === 0) return null;
                const startH = uniqueHours[0];
                const endH = uniqueHours[uniqueHours.length - 1] + 1;
                return (
                  <View style={styles.blockModalSummaryRow}>
                    <Feather name="clock" size={14} color={Colors.dark.primary} />
                    <Text style={styles.blockModalTimeRange}>{formatTime(startH)} - {formatTime(endH)}</Text>
                  </View>
                );
              })()}
            </View>

            {/* Date Range */}
            <Text style={styles.blockModalReasonLabel}>DATE RANGE</Text>
            <View style={styles.dateRangeRow}>
              <Pressable style={styles.datePickerBtn} onPress={() => setShowFromPicker(!showFromPicker)}>
                <Feather name="calendar" size={14} color={Colors.dark.primary} />
                <Text style={styles.datePickerBtnText}>
                  {blockDateFrom.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>
              </Pressable>
              <Text style={styles.dateRangeArrow}>to</Text>
              <Pressable style={styles.datePickerBtn} onPress={() => setShowToPicker(!showToPicker)}>
                <Feather name="calendar" size={14} color={Colors.dark.primary} />
                <Text style={styles.datePickerBtnText}>
                  {blockDateTo.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>
              </Pressable>
            </View>

            {showFromPicker ? (
              <View style={styles.inlineDatePicker}>
                <View style={styles.datePickerControls}>
                  <Pressable onPress={() => { const d = new Date(blockDateFrom); d.setDate(d.getDate() - 1); setBlockDateFrom(d); }}>
                    <Feather name="chevron-left" size={24} color={Colors.dark.primary} />
                  </Pressable>
                  <Text style={styles.datePickerCurrentDate}>
                    {blockDateFrom.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                  <Pressable onPress={() => { const d = new Date(blockDateFrom); d.setDate(d.getDate() + 1); setBlockDateFrom(d); if (d > blockDateTo) setBlockDateTo(new Date(d)); }}>
                    <Feather name="chevron-right" size={24} color={Colors.dark.primary} />
                  </Pressable>
                </View>
                <Pressable style={styles.datePickerDone} onPress={() => setShowFromPicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </Pressable>
              </View>
            ) : null}

            {showToPicker ? (
              <View style={styles.inlineDatePicker}>
                <View style={styles.datePickerControls}>
                  <Pressable onPress={() => { const d = new Date(blockDateTo); d.setDate(d.getDate() - 1); if (d >= blockDateFrom) setBlockDateTo(d); }}>
                    <Feather name="chevron-left" size={24} color={Colors.dark.primary} />
                  </Pressable>
                  <Text style={styles.datePickerCurrentDate}>
                    {blockDateTo.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                  <Pressable onPress={() => { const d = new Date(blockDateTo); d.setDate(d.getDate() + 1); setBlockDateTo(d); }}>
                    <Feather name="chevron-right" size={24} color={Colors.dark.primary} />
                  </Pressable>
                </View>
                <Pressable style={styles.datePickerDone} onPress={() => setShowToPicker(false)}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Weekday Selector */}
            <Text style={[styles.blockModalReasonLabel, { marginTop: 16 }]}>REPEAT ON DAYS</Text>
            <View style={styles.weekdayRow}>
              {[
                { label: "Sun", value: 0 },
                { label: "Mon", value: 1 },
                { label: "Tue", value: 2 },
                { label: "Wed", value: 3 },
                { label: "Thu", value: 4 },
                { label: "Fri", value: 5 },
                { label: "Sat", value: 6 },
              ].map((day) => {
                const isSelected = blockWeekdays.includes(day.value);
                return (
                  <Pressable
                    key={day.value}
                    style={[styles.weekdayPill, isSelected && styles.weekdayPillActive]}
                    onPress={() => {
                      setBlockWeekdays((prev) =>
                        isSelected ? prev.filter((d) => d !== day.value) : [...prev, day.value]
                      );
                    }}
                  >
                    <Text style={[styles.weekdayPillText, isSelected && styles.weekdayPillTextActive]}>{day.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Reason */}
            <Text style={[styles.blockModalReasonLabel, { marginTop: 16 }]}>REASON</Text>
            <View style={styles.blockReasonRow}>
              {["personal", "holiday", "tournament", "sick", "training"].map((reason) => (
                <Pressable
                  key={reason}
                  style={[styles.blockReasonPill, blockReason === reason && styles.blockReasonPillActive]}
                  onPress={() => setBlockReason(reason)}
                >
                  <Text style={[styles.blockReasonPillText, blockReason === reason && styles.blockReasonPillTextActive]}>
                    {reason.charAt(0).toUpperCase() + reason.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.blockModalActions}>
              <Pressable style={styles.blockModalCancelBtn} onPress={onClose}>
                <Text style={styles.blockModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.blockModalConfirmBtn}
                onPress={handleConfirm}
                disabled={isConfirming || blockWeekdays.length === 0}
              >
                {isConfirming ? (
                  <ActivityIndicator size="small" color="#1A1A1A" />
                ) : (
                  <>
                    <Feather name="lock" size={16} color="#1A1A1A" />
                    <Text style={styles.blockModalConfirmText}>Block Time</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </ScrollView>
      </Pressable>
    </Modal>
  );
}
