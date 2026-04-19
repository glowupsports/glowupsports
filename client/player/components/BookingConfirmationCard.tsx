import React, { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes } from "@/constants/theme";
import { TimeSlot } from "./TimeSlotGrid";

interface SelectedFriend {
  id: string;
  name: string;
  photoUrl: string | null;
  level: number;
  ballLevel: string | null;
}

interface BookingConfirmationCardProps {
  selectedDate: Date;
  selectedSlot: TimeSlot;
  xpReward?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  bookWithFriends?: boolean;
  selectedFriends?: SelectedFriend[];
  splitPrice?: number;
  onToggleBookWithFriends?: () => void;
  onEditFriends?: () => void;
  createOpenMatch?: boolean;
  onToggleCreateOpenMatch?: () => void;
  openMatchType?: "singles" | "doubles";
  onChangeMatchType?: (type: "singles" | "doubles") => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const formatDate = (date: Date): string => {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
};

export function BookingConfirmationCard({
  selectedDate,
  selectedSlot,
  xpReward = 50,
  onConfirm,
  onCancel,
  isLoading = false,
  bookWithFriends = false,
  selectedFriends = [],
  splitPrice,
  onToggleBookWithFriends,
  onEditFriends,
  createOpenMatch = false,
  onToggleCreateOpenMatch,
  openMatchType = "singles",
  onChangeMatchType,
}: BookingConfirmationCardProps) {
  const buttonScale = useSharedValue(1);
  const xpPulse = useSharedValue(1);

  useEffect(() => {
    xpPulse.value = withSequence(
      withDelay(300, withSpring(1.1, { damping: 10 })),
      withSpring(1, { damping: 10 })
    );
  }, []);

  const handleConfirm = () => {
    buttonScale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const xpAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: xpPulse.value }],
  }));

  return (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.container}>
      <LinearGradient
        colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundDefault]}
        style={styles.card}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Confirm Booking</Text>
          <Text style={styles.subtitle}>Tap 3 of 3</Text>
        </View>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar" size={20} color={Colors.dark.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(selectedDate)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="time" size={20} color={Colors.dark.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{selectedSlot.time}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="tennisball" size={20} color={Colors.dark.gold} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Court</Text>
              <Text style={styles.detailValue}>{selectedSlot.courtName || "Court"}</Text>
            </View>
          </View>

          {selectedSlot.price && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="card" size={20} color={Colors.dark.primary} />
              </View>
              <View style={styles.priceContainer}>
                <Text style={styles.detailLabel}>Price</Text>
                <View style={styles.priceRow}>
                  <Text style={[styles.detailValue, bookWithFriends && selectedFriends.length > 0 && styles.strikethrough]}>
                    {selectedSlot.currency || "AED"} {selectedSlot.price}
                  </Text>
                  {bookWithFriends && selectedFriends.length > 0 && splitPrice !== undefined && (
                    <Text style={styles.splitPriceValue}>
                      {selectedSlot.currency || "AED"} {splitPrice.toFixed(2)}/each
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>

        {onToggleBookWithFriends && (
          <Pressable 
            onPress={onToggleBookWithFriends}
            style={[styles.friendsToggle, bookWithFriends && styles.friendsToggleActive]}
          >
            <View style={styles.friendsToggleLeft}>
              <Ionicons 
                name={bookWithFriends ? "people" : "people-outline"} 
                size={22} 
                color={bookWithFriends ? Colors.dark.primary : Colors.dark.textMuted} 
              />
              <Text style={[styles.friendsToggleText, bookWithFriends && styles.friendsToggleTextActive]}>
                Book with Friends
              </Text>
            </View>
            <View style={[styles.toggleSwitch, bookWithFriends && styles.toggleSwitchActive]}>
              <View style={[styles.toggleThumb, bookWithFriends && styles.toggleThumbActive]} />
            </View>
          </Pressable>
        )}

        {bookWithFriends && selectedFriends.length > 0 && (
          <View style={styles.friendsPreview}>
            <View style={styles.friendsAvatars}>
              {selectedFriends.slice(0, 3).map((friend, index) => (
                <View key={friend.id} style={[styles.friendAvatarWrapper, { marginLeft: index > 0 ? -8 : 0 }]}>
                  <View style={styles.friendAvatarPlaceholder}>
                    <Ionicons name="person" size={14} color={Colors.dark.text} />
                  </View>
                </View>
              ))}
              {selectedFriends.length > 3 && (
                <View style={[styles.friendAvatarWrapper, { marginLeft: -8 }]}>
                  <View style={styles.friendAvatarMore}>
                    <Text style={styles.friendAvatarMoreText}>+{selectedFriends.length - 3}</Text>
                  </View>
                </View>
              )}
            </View>
            <Text style={styles.friendsNames}>
              {selectedFriends.map(f => f.name.split(" ")[0]).join(", ")}
            </Text>
            {onEditFriends && (
              <Pressable onPress={onEditFriends} style={styles.editFriendsButton}>
                <Ionicons name="pencil" size={14} color={Colors.dark.primary} />
              </Pressable>
            )}
          </View>
        )}

        {onToggleCreateOpenMatch && !bookWithFriends && (
          <Pressable 
            onPress={onToggleCreateOpenMatch}
            style={[styles.friendsToggle, createOpenMatch && styles.openMatchToggleActive]}
          >
            <View style={styles.friendsToggleLeft}>
              <Ionicons 
                name={createOpenMatch ? "tennisball" : "tennisball-outline"} 
                size={22} 
                color={createOpenMatch ? Colors.dark.gold : Colors.dark.textMuted} 
              />
              <View>
                <Text style={[styles.friendsToggleText, createOpenMatch && styles.openMatchToggleTextActive]}>
                  Create Open Match
                </Text>
                <Text style={styles.openMatchSubtext}>
                  Let others join your court booking
                </Text>
              </View>
            </View>
            <View style={[styles.toggleSwitch, createOpenMatch && styles.openMatchToggleSwitchActive]}>
              <View style={[styles.toggleThumb, createOpenMatch && styles.openMatchToggleThumbActive]} />
            </View>
          </Pressable>
        )}

        {createOpenMatch && (
          <View style={styles.openMatchInfo}>
            <Text style={styles.openMatchConfigTitle}>Match Type</Text>
            <View style={styles.matchTypeSelector}>
              <Pressable
                style={[
                  styles.matchTypeOption,
                  openMatchType === "singles" && styles.matchTypeOptionSelected,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChangeMatchType?.("singles");
                }}
              >
                <Ionicons
                  name="person"
                  size={18}
                  color={openMatchType === "singles" ? Colors.dark.text : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.matchTypeText,
                    openMatchType === "singles" && styles.matchTypeTextSelected,
                  ]}
                >
                  Singles
                </Text>
                <Text style={styles.matchTypeSubtext}>1v1</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.matchTypeOption,
                  openMatchType === "doubles" && styles.matchTypeOptionSelected,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChangeMatchType?.("doubles");
                }}
              >
                <Ionicons
                  name="people"
                  size={18}
                  color={openMatchType === "doubles" ? Colors.dark.text : Colors.dark.textMuted}
                />
                <Text
                  style={[
                    styles.matchTypeText,
                    openMatchType === "doubles" && styles.matchTypeTextSelected,
                  ]}
                >
                  Doubles
                </Text>
                <Text style={styles.matchTypeSubtext}>2v2</Text>
              </Pressable>
            </View>
            <View style={styles.openMatchInfoRow}>
              <Ionicons name="flash" size={16} color={Colors.dark.gold} />
              <Text style={styles.openMatchInfoText}>+25 XP bonus for hosting</Text>
            </View>
            <View style={styles.openMatchInfoRow}>
              <Ionicons name="card" size={16} color={Colors.dark.primary} />
              <Text style={styles.openMatchInfoText}>
                Cost split: {selectedSlot.currency || "AED"}{" "}
                {selectedSlot.price
                  ? (parseFloat(selectedSlot.price) / (openMatchType === "doubles" ? 4 : 2)).toFixed(2)
                  : "0"}{" "}
                per player
              </Text>
            </View>
          </View>
        )}

        <Animated.View entering={ZoomIn.delay(200).duration(300)} style={styles.xpContainer}>
          <Animated.View style={xpAnimatedStyle}>
            <LinearGradient
              colors={[Colors.dark.primary + "30", Colors.dark.primary + "20"]}
              style={styles.xpBadge}
            >
              <Ionicons name="flash" size={18} color={Colors.dark.primary} />
              <Text style={styles.xpText}>+{xpReward} XP</Text>
              <Text style={styles.xpLabel}>Booking Reward</Text>
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.cancelButton} disabled={isLoading}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <AnimatedPressable
            onPress={handleConfirm}
            style={[buttonAnimatedStyle]}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primary + "DD"]}
              style={styles.confirmButton}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors.dark.text} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.dark.text} />
                  <Text style={styles.confirmText}>Book Now</Text>
                </>
              )}
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  card: {
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  details: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  detailValue: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  xpContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  xpBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  xpText: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  xpLabel: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  confirmButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  confirmText: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  priceContainer: {
    flex: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  strikethrough: {
    textDecorationLine: "line-through",
    color: Colors.dark.textMuted,
  },
  splitPriceValue: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  friendsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  friendsToggleActive: {
    backgroundColor: Colors.dark.primary + "15",
    borderColor: Colors.dark.primary + "40",
  },
  friendsToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  friendsToggleText: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  friendsToggleTextActive: {
    color: Colors.dark.text,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.textMuted,
  },
  toggleThumbActive: {
    backgroundColor: Colors.dark.text,
    alignSelf: "flex-end",
  },
  friendsPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  friendsAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  friendAvatarWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  friendAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.primary + "30",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  friendAvatarMore: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  friendAvatarMoreText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  friendsNames: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  editFriendsButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  openMatchToggleActive: {
    backgroundColor: Colors.dark.gold + "15",
    borderColor: Colors.dark.gold + "40",
  },
  openMatchToggleTextActive: {
    color: Colors.dark.text,
  },
  openMatchSubtext: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  openMatchToggleSwitchActive: {
    backgroundColor: Colors.dark.gold,
  },
  openMatchToggleThumbActive: {
    backgroundColor: Colors.dark.text,
    alignSelf: "flex-end",
  },
  openMatchInfo: {
    backgroundColor: Colors.dark.gold + "10",
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  openMatchInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  openMatchInfoText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  openMatchConfigTitle: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  matchTypeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  matchTypeOption: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  matchTypeOptionSelected: {
    backgroundColor: Colors.dark.primary + "30",
    borderColor: Colors.dark.primary,
  },
  matchTypeText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  matchTypeTextSelected: {
    color: Colors.dark.text,
  },
  matchTypeSubtext: {
    fontSize: FontSizes.xs,
    color: Colors.dark.textMuted,
  },
});

export default BookingConfirmationCard;
