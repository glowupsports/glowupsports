import React from "react";
import { View, Text, Pressable, Modal, ScrollView, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { styles } from "./adminPlayersStyles";
import { AdminPlayerPackage } from "./adminPlayerTypes";

interface AdminRecordPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  packages: AdminPlayerPackage[] | undefined;
  selectedPlayerId: string | null;
}

export function AdminRecordPaymentModal({ visible, onClose, packages, selectedPlayerId }: AdminRecordPaymentModalProps) {
  const queryClient = useQueryClient();
  const unpaidPackages = packages?.filter((p: AdminPlayerPackage) => !p.isPaid) || [];

  const handleMarkPaid = async (pkg: AdminPlayerPackage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Payment Recorded", "Package marked as paid.");
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to record payment. Please try again.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.recordPaymentModalOverlay}>
        <View style={styles.recordPaymentModalContainer}>
          <View style={styles.recordPaymentModalHeader}>
            <Text style={styles.recordPaymentModalTitle}>Record Payment</Text>
            <Pressable style={styles.recordPaymentModalClose} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.recordPaymentModalContent}>
            {unpaidPackages.length === 0 ? (
              <View style={styles.noUnpaidContainer}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.dark.successNeon} />
                <Text style={styles.noUnpaidTitle}>All Paid!</Text>
                <Text style={styles.noUnpaidText}>This player has no outstanding payments.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.unpaidSectionTitle}>Unpaid Packages</Text>
                {unpaidPackages.map((pkg: AdminPlayerPackage) => (
                  <View key={pkg.id} style={styles.unpaidPackageCard}>
                    <View style={styles.unpaidPackageInfo}>
                      <View style={styles.unpaidPackageRow}>
                        <Ionicons
                          name={pkg.creditType === "private" ? "person" : pkg.creditType === "semi_private" ? "people" : "people-circle"}
                          size={20}
                          color={Colors.dark.primary}
                        />
                        <Text style={styles.unpaidPackageType}>
                          {pkg.creditType === "private" ? "Private" : pkg.creditType === "semi_private" ? "Semi-Private" : "Group"}
                        </Text>
                      </View>
                      <Text style={styles.unpaidPackageCredits}>
                        {formatCredits(pkg.remainingCredits)} / {formatCredits(pkg.totalCredits)} credits
                      </Text>
                      <Text style={styles.unpaidPackagePrice}>AED {Number(pkg.price || 0).toLocaleString()}</Text>
                    </View>
                    <Pressable style={styles.markPaidButtonFilled} onPress={() => handleMarkPaid(pkg)}>
                      <Ionicons name="checkmark" size={18} color={Colors.dark.buttonText} />
                      <Text style={styles.markPaidButtonFilledText}>Mark Paid</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
          <Pressable style={styles.recordPaymentModalDone} onPress={onClose}>
            <Text style={styles.recordPaymentModalDoneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
