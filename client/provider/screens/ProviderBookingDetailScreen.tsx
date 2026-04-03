import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import { apiRequest, getStaticAssetsUrl, buildPhotoUrl } from "@/lib/query-client";
import { Colors, Spacing } from "@/constants/theme";

const BADGE_LABELS: Record<string, string> = {
  first_job: "First Job",
  ten_bookings: "Getting Started",
  century: "Century Club",
  five_star: "5-Star Pro",
  streak_7: "On Fire",
  streak_30: "Unstoppable",
  leveled_up: "Level Up",
};

interface BookingItem {
  id: string;
  quantity: number;
  unitPrice: string;
  serviceDetails?: string | null;
  service?: {
    id: string;
    name: string;
    iconName: string;
    durationMinutes: number | null;
    description?: string;
  };
}

interface Booking {
  id: string;
  orderNumber: string;
  status: string;
  scheduledAt: string | null;
  notes: string | null;
  totalAmount: string;
  items: BookingItem[];
  player?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    level: number;
    phone?: string | null;
    email?: string | null;
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  confirmed: Colors.dark.primary,
  completed: Colors.dark.textSecondary,
  cancelled: Colors.dark.error,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "No time set";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function safeIoniconName(name: string): keyof typeof Ionicons.glyphMap {
  return name in Ionicons.glyphMap
    ? (name as keyof typeof Ionicons.glyphMap)
    : "help-circle-outline";
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconContainer}>
        <Ionicons name={safeIoniconName(icon)} size={16} color={Colors.dark.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

interface BookingStatusResponse {
  id: string;
  status: string;
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number;
  newRank: string;
  newBadges: string[];
  [key: string]: unknown;
}

interface CompletionToast {
  xpAwarded: number;
  leveledUp: boolean;
  newLevel: number;
  newRank: string;
  newBadges: string[];
}

interface CatalogService {
  id: string;
  name: string;
  price: string;
  iconName: string;
  durationMinutes: number | null;
}

interface UpsellRequest {
  id: string;
  label: string;
  price: string;
  status: "pending" | "approved" | "declined";
  serviceId: string | null;
  createdAt: string;
}

function AddExtraModal({
  visible,
  orderId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: services } = useQuery<CatalogService[]>({
    queryKey: ["/api/provider/services"],
    enabled: visible,
  });

  const handleSelectService = (svc: CatalogService) => {
    setSelectedServiceId(svc.id);
    setLabel(svc.name);
    setPrice(parseFloat(svc.price).toFixed(2));
  };

  const handleClearService = () => {
    setSelectedServiceId(null);
    setLabel("");
    setPrice("");
  };

  const handleAdd = async () => {
    const p = parseFloat(price);
    if (!label.trim()) {
      Alert.alert("Label required", "Please enter a description for the extra.");
      return;
    }
    if (isNaN(p) || p <= 0) {
      Alert.alert("Invalid price", "Please enter a valid price greater than 0.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("POST", `/api/provider/bookings/${orderId}/upsell`, {
        label: label.trim(),
        price: p,
        serviceId: selectedServiceId,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      setLabel("");
      setPrice("");
      setSelectedServiceId(null);
      onSuccess();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not propose extra. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[addExtraStyles.container, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={addExtraStyles.header}>
          <Pressable onPress={onClose} style={addExtraStyles.closeBtn}>
            <Text style={addExtraStyles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={addExtraStyles.title}>Propose Extra</Text>
          <Pressable
            onPress={handleAdd}
            style={[addExtraStyles.saveBtn, saving && { opacity: 0.5 }]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Text style={addExtraStyles.saveText}>Send</Text>
            )}
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={addExtraStyles.body}
          keyboardShouldPersistTaps="handled"
        >
          {services && services.length > 0 ? (
            <View style={addExtraStyles.field}>
              <Text style={addExtraStyles.label}>From Your Service Menu</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.lg }} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
                {services.map((svc) => (
                  <Pressable
                    key={svc.id}
                    onPress={() => handleSelectService(svc)}
                    style={[
                      addExtraStyles.serviceChip,
                      selectedServiceId === svc.id && addExtraStyles.serviceChipSelected,
                    ]}
                  >
                    <Ionicons name={safeIoniconName(svc.iconName ?? "pricetag")} size={14} color={selectedServiceId === svc.id ? Colors.dark.backgroundDefault : Colors.dark.primary} />
                    <Text style={[addExtraStyles.serviceChipText, selectedServiceId === svc.id && addExtraStyles.serviceChipTextSelected]}>
                      {svc.name}
                    </Text>
                    <Text style={[addExtraStyles.serviceChipPrice, selectedServiceId === svc.id && { color: Colors.dark.backgroundDefault + "CC" }]}>
                      AED {parseFloat(svc.price).toFixed(0)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {selectedServiceId ? (
                <Pressable onPress={handleClearService} style={addExtraStyles.clearBtn}>
                  <Text style={addExtraStyles.clearBtnText}>Clear selection</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={addExtraStyles.field}>
            <Text style={addExtraStyles.label}>Description</Text>
            <TextInput
              style={addExtraStyles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Extra 30 min, Aromatherapy add-on"
              placeholderTextColor={Colors.dark.textSecondary}
              maxLength={80}
            />
          </View>
          <View style={addExtraStyles.field}>
            <Text style={addExtraStyles.label}>Price (AED)</Text>
            <TextInput
              style={addExtraStyles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={Colors.dark.textSecondary}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
          <View style={addExtraStyles.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.dark.primary} />
            <Text style={addExtraStyles.infoText}>
              The player will receive a request to approve this extra. The booking total updates only when they accept.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function UpsellHistorySection({ orderId }: { orderId: string }) {
  const { data: upsells } = useQuery<UpsellRequest[]>({
    queryKey: [`/api/provider/bookings/${orderId}/upsells`],
    refetchInterval: 10000,
  });

  if (!upsells || upsells.length === 0) return null;

  return (
    <View style={addExtraStyles.upsellSection}>
      <Text style={addExtraStyles.upsellSectionTitle}>Proposed Extras</Text>
      {upsells.map((u) => (
        <View key={u.id} style={addExtraStyles.upsellRow}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={addExtraStyles.upsellLabel}>{u.label}</Text>
            <Text style={addExtraStyles.upsellPrice}>AED {parseFloat(u.price).toFixed(0)}</Text>
          </View>
          <View style={[addExtraStyles.upsellBadge, { backgroundColor: u.status === "approved" ? Colors.dark.primary + "20" : u.status === "declined" ? Colors.dark.error + "20" : Colors.dark.border }]}>
            <Text style={[addExtraStyles.upsellBadgeText, { color: u.status === "approved" ? Colors.dark.primary : u.status === "declined" ? Colors.dark.error : Colors.dark.textSecondary }]}>
              {u.status === "pending" ? "Awaiting approval" : u.status === "approved" ? "Approved" : "Declined"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ProviderBookingDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const orderId: string = route.params?.orderId;
  const [completionToast, setCompletionToast] = useState<CompletionToast | null>(null);
  const [showAddExtra, setShowAddExtra] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastQueue = useRef<CompletionToast[]>([]);

  const showNextToast = (onAllDone: () => void) => {
    const next = toastQueue.current.shift();
    if (!next) { onAllDone(); return; }
    setCompletionToast(next);
    toastTimer.current = setTimeout(() => {
      setCompletionToast(null);
      setTimeout(() => showNextToast(onAllDone), 300);
    }, 2500);
  };

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const { data: allBookings = [] } = useQuery<Booking[]>({
    queryKey: ["/api/provider/me/bookings"],
  });

  const booking = allBookings.find((b) => b.id === orderId);

  const statusMutation = useMutation({
    mutationFn: async (status: string): Promise<BookingStatusResponse> => {
      const res = await apiRequest("PATCH", `/api/provider/bookings/${orderId}/status`, { status });
      return res.json();
    },
    onSuccess: (data, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/me/bookings", { date: "today" }] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/stats"] });
      if (status === "completed" && data && Number(data.xpAwarded) > 0) {
        const xpAwarded = Number(data.xpAwarded);
        const didLevelUp = Boolean(data.leveledUp);
        const newLevel = Number(data.newLevel);
        const newRank = String(data.newRank ?? "");
        const newBadges: string[] = Array.isArray(data.newBadges) ? data.newBadges : [];

        toastQueue.current = [];
        if (didLevelUp) {
          toastQueue.current.push({ xpAwarded, leveledUp: true, newLevel, newRank, newBadges: [] });
        }
        if (newBadges.length > 0) {
          toastQueue.current.push({ xpAwarded: didLevelUp ? 0 : xpAwarded, leveledUp: false, newLevel, newRank, newBadges });
        }
        if (toastQueue.current.length === 0) {
          toastQueue.current.push({ xpAwarded, leveledUp: false, newLevel, newRank, newBadges: [] });
        }

        showNextToast(() => setTimeout(() => navigation.goBack(), 200));
      } else {
        setTimeout(() => navigation.goBack(), 350);
      }
    },
    onError: () =>
      Alert.alert("Error", "Failed to update booking status. Please try again."),
  });

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Pressable
          style={[styles.backButton, { marginLeft: Spacing.lg }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Booking not found</Text>
        </View>
      </View>
    );
  }

  const service = booking.items?.[0]?.service;
  const serviceName = service?.name ?? "Service Booking";
  const serviceIcon = safeIoniconName(service?.iconName ?? "build-outline");
  const statusColor = STATUS_COLORS[booking.status] ?? Colors.dark.textSecondary;
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
  const price = `AED ${parseFloat(booking.totalAmount).toFixed(0)}`;

  const handleConfirm = () => {
    Alert.alert("Confirm Booking", "Confirm this booking for the player?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: () => statusMutation.mutate("confirmed"),
      },
    ]);
  };

  const handleDecline = () => {
    Alert.alert("Decline Booking", "Are you sure you want to decline this booking?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => statusMutation.mutate("cancelled"),
      },
    ]);
  };

  const handleComplete = () => {
    Alert.alert("Mark Complete", "Mark this booking as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Complete",
        onPress: () => statusMutation.mutate("completed"),
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert("Cancel Booking", "Are you sure you want to cancel this booking?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Booking",
        style: "destructive",
        onPress: () => statusMutation.mutate("cancelled"),
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.delay(50).duration(300)}>
          <View style={styles.orderHeader}>
            <View style={styles.serviceIconLarge}>
              <Ionicons name={serviceIcon} size={32} color={Colors.dark.primary} />
            </View>
            <View style={styles.orderHeaderInfo}>
              <Text style={styles.serviceName}>{serviceName}</Text>
              <Text style={styles.orderNumber}>Order #{booking.orderNumber}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </Animated.View>

        {booking.player ? (
          <Animated.View entering={FadeInUp.delay(100).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PLAYER</Text>
              <View style={styles.playerCard}>
                {booking.player.profilePhotoUrl ? (
                  <Image
                    source={{
                      uri: buildPhotoUrl(booking.player.profilePhotoUrl)!,
                    }}
                    style={styles.playerPhoto}
                  />
                ) : (
                  <View style={styles.playerPhotoPlaceholder}>
                    <Ionicons name="person" size={24} color={Colors.dark.textSecondary} />
                  </View>
                )}
                <View style={styles.playerCardInfo}>
                  <Text style={styles.playerCardName}>{booking.player.name}</Text>
                  <View style={styles.levelBadge}>
                    <Ionicons name="flash" size={11} color={Colors.dark.primary} />
                    <Text style={styles.levelText}>Level {booking.player.level}</Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(150).duration(300)}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BOOKING INFO</Text>
            <View style={styles.infoCard}>
              <InfoRow
                icon="calendar-outline"
                label="Scheduled"
                value={formatDateTime(booking.scheduledAt)}
              />
              <View style={styles.infoDivider} />
              <InfoRow
                icon="cash-outline"
                label="Amount"
                value={price}
              />
              {service?.durationMinutes ? (
                <>
                  <View style={styles.infoDivider} />
                  <InfoRow
                    icon="time-outline"
                    label="Duration"
                    value={`${service.durationMinutes} minutes`}
                  />
                </>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {booking.notes ? (
          <Animated.View entering={FadeInUp.delay(200).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES FROM PLAYER</Text>
              <View style={styles.notesCard}>
                <Text style={styles.notesText}>{booking.notes}</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {(() => {
          const firstItem = booking.items?.[0];
          const rawDetails = firstItem?.serviceDetails;
          let parsedDetails: Record<string, string> | null = null;
          if (rawDetails) {
            try { parsedDetails = JSON.parse(rawDetails); } catch {}
          }
          const hasDetails = service?.description || parsedDetails;
          if (!hasDetails) return null;
          return (
            <Animated.View entering={FadeInUp.delay(240).duration(300)}>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SERVICE DETAILS</Text>
                <View style={styles.infoCard}>
                  {service?.description ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailValue}>{service.description}</Text>
                    </View>
                  ) : null}
                  {parsedDetails
                    ? Object.entries(parsedDetails).map(([key, val], idx) => (
                        <View key={key}>
                          {idx > 0 || service?.description ? <View style={styles.infoDivider} /> : null}
                          <InfoRow
                            icon={key === "tension" ? "speedometer-outline" : "ribbon-outline"}
                            label={key === "tension" ? "Tension" : key === "stringChoice" ? "String Choice" : key}
                            value={val}
                          />
                        </View>
                      ))
                    : null}
                </View>
              </View>
            </Animated.View>
          );
        })()}

        {booking.player?.phone || booking.player?.email ? (
          <Animated.View entering={FadeInUp.delay(280).duration(300)}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CONTACT INFO</Text>
              <View style={styles.infoCard}>
                {booking.player.phone ? (
                  <InfoRow icon="call-outline" label="Phone" value={booking.player.phone} />
                ) : null}
                {booking.player.email && booking.player.phone ? (
                  <View style={styles.infoDivider} />
                ) : null}
                {booking.player.email ? (
                  <InfoRow icon="mail-outline" label="Email" value={booking.player.email} />
                ) : null}
              </View>
            </View>
          </Animated.View>
        ) : null}

        {booking.status === "confirmed" ? (
          <Animated.View entering={FadeInUp.delay(310).duration(300)}>
            <View style={styles.section}>
              <UpsellHistorySection orderId={booking.id} />
            </View>
          </Animated.View>
        ) : null}

        {(booking.status === "confirmed" || booking.status === "completed") && booking.player ? (
          <Animated.View entering={FadeInUp.delay(320).duration(300)}>
            <View style={styles.section}>
              <Pressable
                style={styles.chatButton}
                onPress={() => navigation.navigate("ProviderChat", { orderId: booking.id })}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.dark.backgroundDefault} />
                <Text style={styles.chatButtonText}>Chat with Player</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      {completionToast ? (
        <Animated.View
          entering={FadeInUp.duration(350)}
          exiting={FadeOutDown.duration(300)}
          style={[styles.achievementToast, { bottom: insets.bottom + 90 }]}
        >
          <View style={styles.achievementToastInner}>
            <View style={styles.achievementIconRow}>
              <Ionicons name="flash" size={20} color={Colors.dark.primary} />
            </View>
            <View style={{ flex: 1 }}>
              {completionToast.leveledUp ? (
                <Text style={styles.achievementTitle}>
                  {"Level Up! Lv."}
                  {completionToast.newLevel}
                  {completionToast.newRank ? ` · ${completionToast.newRank}` : ""}
                </Text>
              ) : completionToast.newBadges.length > 0 ? (
                <Text style={styles.achievementTitle}>Achievement Unlocked!</Text>
              ) : (
                <Text style={styles.achievementTitle}>Booking Complete!</Text>
              )}
              <Text style={styles.achievementSub}>
                +{completionToast.xpAwarded} XP earned
                {completionToast.newBadges.length > 0
                  ? `  •  ${completionToast.newBadges.map((id) => BADGE_LABELS[id] ?? id).join(", ")}`
                  : ""}
              </Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <AddExtraModal
        visible={showAddExtra}
        orderId={orderId}
        onClose={() => setShowAddExtra(false)}
        onSuccess={() => {
          setShowAddExtra(false);
          queryClient.invalidateQueries({ queryKey: ["/api/provider/me/bookings"] });
          queryClient.invalidateQueries({ queryKey: [`/api/provider/bookings/${orderId}/upsells`] });
        }}
      />

      {(booking.status === "pending" || booking.status === "confirmed") ? (
        <Animated.View
          entering={FadeInUp.delay(300).duration(300)}
          style={[styles.actionBar, { paddingBottom: insets.bottom + Spacing.md }]}
        >
          {booking.status === "pending" ? (
            <>
              <Pressable
                style={[styles.actionButton, styles.actionButtonOutline]}
                onPress={handleDecline}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="close" size={18} color={Colors.dark.error} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.error }]}>
                  Decline
                </Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleConfirm}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="checkmark" size={18} color={Colors.dark.backgroundDefault} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.backgroundDefault }]}>
                  Confirm Booking
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.actionButton, styles.actionButtonOutline]}
                onPress={handleCancel}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="close" size={18} color={Colors.dark.error} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.error }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionButtonSecondary]}
                onPress={() => setShowAddExtra(true)}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.dark.primary} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.primary }]}>
                  Add Extra
                </Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={handleComplete}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="checkmark-done" size={18} color={Colors.dark.backgroundDefault} />
                <Text style={[styles.actionButtonText, { color: Colors.dark.backgroundDefault }]}>
                  Complete
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  serviceIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  orderHeaderInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  orderNumber: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  playerPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  playerPhotoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  playerCardInfo: {
    flex: 1,
    gap: 4,
  },
  playerCardName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary + "15",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  levelText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  infoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.md,
  },
  detailRow: {
    padding: Spacing.md,
  },
  detailLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  notesCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 14,
    padding: Spacing.md,
  },
  notesText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.md,
    borderRadius: 14,
  },
  actionButtonPrimary: {
    backgroundColor: Colors.dark.primary,
    flex: 1,
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: Colors.dark.primary + "60",
    backgroundColor: Colors.dark.primary + "10",
    flex: 1,
  },
  actionButtonOutline: {
    borderWidth: 1,
    borderColor: Colors.dark.error + "60",
    backgroundColor: Colors.dark.error + "10",
    flex: 1,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  achievementToast: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 100,
  },
  achievementToastInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  achievementIconRow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  achievementTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  achievementSub: {
    fontSize: 12,
    color: Colors.dark.primary,
    marginTop: 2,
    fontWeight: "600",
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  chatButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.backgroundDefault,
  },
});

const addExtraStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  cancelText: { fontSize: 16, color: Colors.dark.textSecondary },
  saveBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 44, alignItems: "flex-end" },
  saveText: { fontSize: 16, fontWeight: "700", color: Colors.dark.primary },
  body: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.lg,
  },
  field: { gap: Spacing.sm },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.primary + "10",
    borderRadius: 12,
    padding: Spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  serviceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  serviceChipSelected: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  serviceChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.primary,
  },
  serviceChipTextSelected: {
    color: Colors.dark.backgroundDefault,
  },
  serviceChipPrice: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  clearBtn: {
    alignSelf: "flex-start",
    marginTop: Spacing.xs,
  },
  clearBtnText: {
    fontSize: 13,
    color: Colors.dark.error,
    fontWeight: "500",
  },
  upsellSection: {
    gap: Spacing.sm,
  },
  upsellSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  upsellRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  upsellLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  upsellPrice: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  upsellBadge: {
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  upsellBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
