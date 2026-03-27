import React, { useState } from "react";
import { View, Text, Pressable, Modal, Platform, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { AdminPlayerPackage } from "./adminPlayerTypes";

interface AdminMarkPaidModalProps {
  visible: boolean;
  onClose: () => void;
  selectedPackage: AdminPlayerPackage | null;
  selectedPlayerId: string | null;
}

export function AdminMarkPaidModal({ visible, onClose, selectedPackage, selectedPlayerId }: AdminMarkPaidModalProps) {
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("cash");
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleConfirm = async () => {
    if (!selectedPackage) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("PATCH", `/api/packages/${selectedPackage.id}`, {
        isPaid: true,
        paymentMethod,
        paymentDate: paymentDate.toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPaymentMethod("cash");
      setPaymentDate(new Date());
      setShowDatePicker(false);
      onClose();
    } catch (error) {
      console.error("Failed to mark as paid:", error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={{ backgroundColor: "#11141A", borderRadius: 16, padding: 24, width: "90%", maxWidth: 400, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${Colors.dark.successNeon}15`, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="card" size={20} color={Colors.dark.successNeon} />
              </View>
              <Text style={{ color: Colors.dark.text, fontSize: 18, fontWeight: "700" }}>Record Payment</Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
            </Pressable>
          </View>

          {selectedPackage ? (
            <View style={{ backgroundColor: "rgba(200,255,61,0.08)", padding: 16, borderRadius: 12, marginBottom: 20 }}>
              <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginBottom: 4 }}>Package</Text>
              <Text style={{ color: Colors.dark.text, fontSize: 16, fontWeight: "600" }}>
                {(selectedPackage.packageName || selectedPackage.creditType || "Package").charAt(0).toUpperCase() +
                  (selectedPackage.packageName || selectedPackage.creditType || "Package").slice(1)}
              </Text>
              <Text style={{ color: Colors.dark.successNeon, fontSize: 14, marginTop: 4 }}>
                {formatCredits(selectedPackage.totalCredits)} credits
              </Text>
            </View>
          ) : null}

          <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Payment Method</Text>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
            <Pressable
              style={{ flex: 1, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: paymentMethod === "cash" ? Colors.dark.successNeon : "rgba(255,255,255,0.1)", backgroundColor: paymentMethod === "cash" ? `${Colors.dark.successNeon}15` : "transparent", alignItems: "center" }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPaymentMethod("cash"); }}
            >
              <Ionicons name="cash" size={24} color={paymentMethod === "cash" ? Colors.dark.successNeon : Colors.dark.textMuted} />
              <Text style={{ color: paymentMethod === "cash" ? Colors.dark.successNeon : Colors.dark.textMuted, marginTop: 8, fontWeight: "600" }}>Cash</Text>
            </Pressable>
            <Pressable
              style={{ flex: 1, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: paymentMethod === "bank_transfer" ? Colors.dark.xpCyan : "rgba(255,255,255,0.1)", backgroundColor: paymentMethod === "bank_transfer" ? `${Colors.dark.xpCyan}15` : "transparent", alignItems: "center" }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPaymentMethod("bank_transfer"); }}
            >
              <Ionicons name="business" size={24} color={paymentMethod === "bank_transfer" ? Colors.dark.xpCyan : Colors.dark.textMuted} />
              <Text style={{ color: paymentMethod === "bank_transfer" ? Colors.dark.xpCyan : Colors.dark.textMuted, marginTop: 8, fontWeight: "600" }}>Bank</Text>
            </Pressable>
          </View>

          <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Payment Date</Text>
          <Pressable
            style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDatePicker(true); }}
          >
            <Ionicons name="calendar" size={20} color={Colors.dark.orange} />
            <Text style={{ color: Colors.dark.text, fontSize: 16 }}>
              {paymentDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </Text>
          </Pressable>

          {showDatePicker ? (
            <View style={{ marginBottom: 16 }}>
              <DateTimePicker
                value={paymentDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") setShowDatePicker(false);
                  if (selectedDate) setPaymentDate(selectedDate);
                }}
                textColor="#FFFFFF"
                themeVariant="dark"
              />
              {Platform.OS === "ios" ? (
                <Pressable style={{ backgroundColor: Colors.dark.orange, padding: 12, borderRadius: 8, alignItems: "center", marginTop: 8 }} onPress={() => setShowDatePicker(false)}>
                  <Text style={{ color: "#0B0D10", fontWeight: "600" }}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={{ backgroundColor: Colors.dark.successNeon, padding: 16, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            onPress={handleConfirm}
          >
            <Ionicons name="checkmark-circle" size={20} color="#0B0D10" />
            <Text style={{ color: "#0B0D10", fontSize: 16, fontWeight: "700" }}>Confirm Payment</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
