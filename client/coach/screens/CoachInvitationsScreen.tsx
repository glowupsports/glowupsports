import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/coach/context/AuthContext";

interface CoachInvitation {
  id: string;
  academyId: string;
  email: string;
  role: string | null;
  status: string;
  message: string | null;
  token: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  academyName?: string;
  academyCity?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedButton({ onPress, style, children, disabled }: any) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.95, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15, stiffness: 400 }); }}
      style={[animatedStyle, style]}
      disabled={disabled}
    >
      {children}
    </AnimatedPressable>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "accepted":
      return Colors.dark.primary;
    case "declined":
    case "expired":
      return Colors.dark.error;
    default:
      return Colors.dark.orange;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    default:
      return "Pending";
  }
}

function SentInvitationCard({ 
  invitation, 
  onDelete 
}: { 
  invitation: CoachInvitation; 
  onDelete: () => void;
}) {
  const isExpired = new Date(invitation.expiresAt) < new Date();
  const displayStatus = isExpired && invitation.status === "pending" ? "expired" : invitation.status;
  
  return (
    <View style={styles.invitationCard}>
      <View style={styles.cardHeader}>
        <View style={styles.emailBadge}>
          <Ionicons name="mail-outline" size={16} color={Colors.dark.xpCyan} />
          <Text style={styles.emailText}>{invitation.email}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(displayStatus)}25`, borderColor: getStatusColor(displayStatus) }]}>
          <Text style={[styles.statusText, { color: getStatusColor(displayStatus) }]}>
            {getStatusLabel(displayStatus)}
          </Text>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Role</Text>
          <Text style={styles.detailValue}>{invitation.role || "Coach"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Sent</Text>
          <Text style={styles.detailValue}>
            {new Date(invitation.createdAt).toLocaleDateString()}
          </Text>
        </View>
        {!isExpired && invitation.status === "pending" ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={styles.detailValue}>
              {new Date(invitation.expiresAt).toLocaleDateString()}
            </Text>
          </View>
        ) : null}
      </View>

      {invitation.message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Message:</Text>
          <Text style={styles.messageText}>&quot;{invitation.message}&quot;</Text>
        </View>
      ) : null}

      {invitation.status === "pending" ? (
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
          <Text style={styles.deleteButtonText}>Cancel Invitation</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReceivedInvitationCard({ 
  invitation, 
  onRespond 
}: { 
  invitation: CoachInvitation; 
  onRespond: (decision: "accept" | "decline") => void;
}) {
  return (
    <View style={[styles.invitationCard, styles.receivedCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.academyBadge}>
          <View style={styles.academyIconContainer}>
            <Ionicons name="school" size={18} color={Colors.dark.xpCyan} />
          </View>
          <View>
            <Text style={styles.academyName}>{invitation.academyName}</Text>
            {invitation.academyCity ? (
              <Text style={styles.academyCity}>{invitation.academyCity}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Role</Text>
          <Text style={styles.detailValue}>{invitation.role || "Coach"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Received</Text>
          <Text style={styles.detailValue}>
            {new Date(invitation.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {invitation.message ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageLabel}>Message from academy:</Text>
          <Text style={styles.messageText}>&quot;{invitation.message}&quot;</Text>
        </View>
      ) : null}

      <View style={styles.actionButtons}>
        <Pressable 
          style={styles.declineButton}
          onPress={() => onRespond("decline")}
        >
          <Ionicons name="close" size={18} color={Colors.dark.error} />
          <Text style={styles.declineButtonText}>Decline</Text>
        </Pressable>
        <AnimatedButton 
          style={styles.acceptButton}
          onPress={() => onRespond("accept")}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.acceptButtonGradient}
          >
            <Ionicons name="checkmark" size={18} color={Colors.dark.text} />
            <Text style={styles.acceptButtonText}>Accept</Text>
          </LinearGradient>
        </AnimatedButton>
      </View>
    </View>
  );
}

export default function CoachInvitationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [newEmail, setNewEmail] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);

  const isAcademyOwner = user?.role === "academy_owner";

  const { data: sentData, isLoading: sentLoading } = useQuery<{ invitations: CoachInvitation[] }>({
    queryKey: ["/api/coach-invitations"],
    enabled: isAcademyOwner,
  });

  const { data: receivedData, isLoading: receivedLoading } = useQuery<{ invitations: CoachInvitation[] }>({
    queryKey: ["/api/coach/pending-invitations"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/coach-invitations", { 
        email: newEmail.toLowerCase().trim(),
        message: newMessage.trim() || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach-invitations"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewEmail("");
      setNewMessage("");
      setShowInviteForm(false);
      Alert.alert("Invitation Sent", "The coach has been invited to join your academy.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to send invitation");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/coach-invitations/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach-invitations"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to cancel invitation");
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "accept" | "decline" }) => {
      const response = await apiRequest("POST", `/api/coach-invitations/${id}/respond`, { decision });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/pending-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        variables.decision === "accept" ? "Invitation Accepted" : "Invitation Declined",
        variables.decision === "accept" 
          ? "You've joined the academy! You can now switch between academies."
          : "The invitation has been declined."
      );
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to respond to invitation");
    },
  });

  const handleDelete = (id: string) => {
    Alert.alert(
      "Cancel Invitation",
      "Are you sure you want to cancel this invitation?",
      [
        { text: "No", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]
    );
  };

  const sentInvitations = sentData?.invitations || [];
  const receivedInvitations = receivedData?.invitations || [];
  const isLoading = sentLoading || receivedLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
        style={styles.gamingHeader}
      >
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.xpCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerTopLine}
        />
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>COACH INVITATIONS</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {receivedInvitations.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="mail-unread" size={20} color={Colors.dark.xpCyan} />
                <View>
                  <Text style={styles.sectionTitle}>INVITATIONS FOR YOU</Text>
                  <Text style={styles.sectionSubtitle}>Other academies want you to join their team</Text>
                </View>
              </View>
              {receivedInvitations.map((invitation) => (
                <ReceivedInvitationCard
                  key={invitation.id}
                  invitation={invitation}
                  onRespond={(decision) => respondMutation.mutate({ id: invitation.id, decision })}
                />
              ))}
            </View>
          ) : null}

          {isAcademyOwner ? (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="people" size={20} color={Colors.dark.primary} />
                  <View>
                    <Text style={styles.sectionTitle}>INVITE COACHES</Text>
                    <Text style={styles.sectionSubtitle}>Grow your coaching team</Text>
                  </View>
                </View>
                {!showInviteForm ? (
                  <AnimatedButton 
                    style={styles.addButton}
                    onPress={() => setShowInviteForm(true)}
                  >
                    <LinearGradient
                      colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.addButtonGradient}
                    >
                      <Ionicons name="add" size={20} color={Colors.dark.text} />
                    </LinearGradient>
                  </AnimatedButton>
                ) : null}
              </View>

              {showInviteForm ? (
                <View style={styles.inviteForm}>
                  <TextInput
                    style={styles.input}
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="Coach email address"
                    placeholderTextColor={Colors.dark.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    style={[styles.input, styles.messageInput]}
                    value={newMessage}
                    onChangeText={setNewMessage}
                    placeholder="Personal message (optional)"
                    placeholderTextColor={Colors.dark.textMuted}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                  <View style={styles.formButtons}>
                    <Pressable 
                      style={styles.cancelFormButton}
                      onPress={() => {
                        setShowInviteForm(false);
                        setNewEmail("");
                        setNewMessage("");
                      }}
                    >
                      <Text style={styles.cancelFormButtonText}>Cancel</Text>
                    </Pressable>
                    <AnimatedButton 
                      style={[styles.sendButton, createMutation.isPending && styles.buttonDisabled]}
                      onPress={() => createMutation.mutate()}
                      disabled={createMutation.isPending || !newEmail.trim()}
                    >
                      <LinearGradient
                        colors={[Colors.dark.xpCyan, Colors.dark.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.sendButtonGradient}
                      >
                        {createMutation.isPending ? (
                          <ActivityIndicator size="small" color={Colors.dark.text} />
                        ) : (
                          <>
                            <Ionicons name="send" size={16} color={Colors.dark.text} />
                            <Text style={styles.sendButtonText}>Send Invite</Text>
                          </>
                        )}
                      </LinearGradient>
                    </AnimatedButton>
                  </View>
                </View>
              ) : null}

              {sentInvitations.length > 0 ? (
                <View style={styles.sentList}>
                  <Text style={styles.listTitle}>SENT INVITATIONS</Text>
                  {sentInvitations.map((invitation) => (
                    <SentInvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      onDelete={() => handleDelete(invitation.id)}
                    />
                  ))}
                </View>
              ) : !showInviteForm ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="people-outline" size={32} color={Colors.dark.xpCyan} />
                  <Text style={styles.emptyText}>No invitations sent yet</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {receivedInvitations.length === 0 && (!isAcademyOwner || sentInvitations.length === 0) && !showInviteForm ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="mail-unread-outline" size={48} color={Colors.dark.xpCyan} />
              </View>
              <Text style={styles.emptyTitle}>No Invitations</Text>
              <Text style={styles.emptySub}>
                {isAcademyOwner 
                  ? "Invite coaches to join your academy" 
                  : "You'll see invitations from academies here"}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  gamingHeader: {
    paddingBottom: Spacing.md,
  },
  headerTopLine: {
    height: 3,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  sectionSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  addButton: {
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  addButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  inviteForm: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  input: {
    backgroundColor: "rgba(30, 30, 35, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
  },
  messageInput: {
    minHeight: 60,
  },
  formButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelFormButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(30, 30, 35, 0.9)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  cancelFormButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  sendButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  sendButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  sendButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sentList: {
    marginTop: Spacing.md,
  },
  listTitle: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  invitationCard: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  receivedCard: {
    borderColor: `${Colors.dark.xpCyan}40`,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  emailBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  emailText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  academyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  academyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.xpCyan}20`,
    justifyContent: "center",
    alignItems: "center",
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academyCity: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  cardDetails: {
    gap: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  detailValue: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  messageBox: {
    marginTop: Spacing.sm,
    backgroundColor: "rgba(30, 30, 35, 0.8)",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}15`,
  },
  messageLabel: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginBottom: 2,
  },
  messageText: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    fontStyle: "italic",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.error}15`,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  deleteButtonText: {
    ...Typography.small,
    color: Colors.dark.error,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  declineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.error}15`,
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  declineButtonText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "500",
  },
  acceptButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  acceptButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  acceptButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  emptyBox: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    gap: Spacing.md,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptySub: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});
