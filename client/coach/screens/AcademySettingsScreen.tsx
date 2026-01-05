import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface JoinCodeData {
  joinCode: string | null;
  academyName: string;
}

interface AcademySettings {
  id: string;
  academyId: string;
  businessName: string | null;
  logoUrl: string | null;
  timezone: string;
  currency: string;
  taxRate: number;
  invoicePrefix: string;
  invoiceFooter: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  websiteUrl: string | null;
}

interface AcademyInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  inviteCode: string;
  expiresAt: string;
  createdAt: string;
}

interface AcademyMember {
  id: string;
  coachId: string;
  role: string;
  isActive: boolean;
  coach: { id: string; name: string; email: string; role: string } | null;
}

const TIMEZONES = [
  { label: "Dubai (GMT+4)", value: "Asia/Dubai" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "New York (GMT-5)", value: "America/New_York" },
  { label: "Los Angeles (GMT-8)", value: "America/Los_Angeles" },
  { label: "Sydney (GMT+11)", value: "Australia/Sydney" },
];

const CURRENCIES = [
  { label: "AED (UAE Dirham)", value: "AED" },
  { label: "USD (US Dollar)", value: "USD" },
  { label: "EUR (Euro)", value: "EUR" },
  { label: "GBP (British Pound)", value: "GBP" },
  { label: "AUD (Australian Dollar)", value: "AUD" },
];

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

export default function AcademySettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"settings" | "team" | "invites">("settings");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("coach");
  
  const [formData, setFormData] = useState({
    businessName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    timezone: "Asia/Dubai",
    currency: "AED",
    invoicePrefix: "INV",
    taxRate: "0",
    invoiceFooter: "",
  });
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery<AcademySettings>({
    queryKey: ["/api/academy/settings"],
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<AcademyMember[]>({
    queryKey: ["/api/academy/members"],
  });

  const { data: invites = [], isLoading: invitesLoading } = useQuery<AcademyInvite[]>({
    queryKey: ["/api/academy/invites"],
  });

  const { data: joinCodeData, isLoading: joinCodeLoading } = useQuery<JoinCodeData>({
    queryKey: ["/api/academy/join-code"],
  });

  const regenerateJoinCodeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/academy/join-code/regenerate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/join-code"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "New join code generated!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to generate new join code");
    },
  });

  const handleCopyJoinCode = async () => {
    if (joinCodeData?.joinCode) {
      await Clipboard.setStringAsync(joinCodeData.joinCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Copied", "Join code copied to clipboard!");
    }
  };

  const handleShareJoinCode = async () => {
    if (joinCodeData?.joinCode) {
      if (Platform.OS === "web") {
        handleCopyJoinCode();
        return;
      }
      try {
        await Share.share({
          message: `Join ${joinCodeData.academyName} on Glow Up Sports! Use code: ${joinCodeData.joinCode}`,
        });
      } catch (error) {
        handleCopyJoinCode();
      }
    }
  };

  const handleRegenerateJoinCode = () => {
    Alert.alert(
      "Regenerate Code",
      "This will create a new join code. The old code will stop working. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Regenerate", onPress: () => regenerateJoinCodeMutation.mutate() },
      ]
    );
  };

  useEffect(() => {
    if (settings) {
      setFormData({
        businessName: settings.businessName || "",
        contactEmail: settings.contactEmail || "",
        contactPhone: settings.contactPhone || "",
        address: settings.address || "",
        timezone: settings.timezone || "Asia/Dubai",
        currency: settings.currency || "AED",
        invoicePrefix: settings.invoicePrefix || "INV",
        taxRate: String(settings.taxRate || 0),
        invoiceFooter: settings.invoiceFooter || "",
      });
      setHasChanges(false);
    }
  }, [settings]);

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<AcademySettings>) => {
      return apiRequest("PATCH", "/api/academy/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/settings"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
      Alert.alert("Success", "Settings saved!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to save settings");
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      businessName: formData.businessName || null,
      contactEmail: formData.contactEmail || null,
      contactPhone: formData.contactPhone || null,
      address: formData.address || null,
      timezone: formData.timezone,
      currency: formData.currency,
      invoicePrefix: formData.invoicePrefix,
      taxRate: parseFloat(formData.taxRate) || 0,
      invoiceFooter: formData.invoiceFooter || null,
    });
  };

  const createInviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      return apiRequest("POST", "/api/academy/invites", { email, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/invites"] });
      setInviteEmail("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Invite sent successfully!");
    },
    onError: () => {
      Alert.alert("Error", "Failed to send invite");
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/academy/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/invites"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, role, isActive }: { id: string; role?: string; isActive?: boolean }) => {
      return apiRequest("PATCH", `/api/academy/members/${id}`, { role, isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/members"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) {
      Alert.alert("Error", "Please enter an email address");
      return;
    }
    if (!inviteEmail.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    createInviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const handleDeleteInvite = (invite: AcademyInvite) => {
    Alert.alert(
      "Cancel Invite",
      `Cancel invite for ${invite.email}?`,
      [
        { text: "No", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: () => deleteInviteMutation.mutate(invite.id) },
      ]
    );
  };

  const handleRemoveMember = (member: AcademyMember) => {
    Alert.alert(
      "Remove Member",
      `Remove ${member.coach?.name || "this coach"} from academy?`,
      [
        { text: "No", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: () => updateMemberMutation.mutate({ id: member.id, isActive: false }) },
      ]
    );
  };

  const renderSettingsTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.glassSection}>
        <View style={styles.joinCodeHeader}>
          <View style={styles.joinCodeIconContainer}>
            <Ionicons name="qr-code" size={24} color={Colors.dark.xpCyan} />
          </View>
          <View style={styles.joinCodeHeaderText}>
            <Text style={styles.joinCodeTitle}>PLAYER JOIN CODE</Text>
            <Text style={styles.joinCodeSubtitle}>Share this code with players to let them join your academy</Text>
          </View>
        </View>
        
        {joinCodeLoading ? (
          <View style={styles.joinCodeLoadingContainer}>
            <ActivityIndicator size="small" color={Colors.dark.xpCyan} />
          </View>
        ) : joinCodeData?.joinCode ? (
          <>
            <View style={styles.joinCodeDisplay}>
              <Text style={styles.joinCodeText}>{joinCodeData.joinCode}</Text>
            </View>
            <View style={styles.joinCodeActions}>
              <Pressable style={styles.joinCodeActionButton} onPress={handleCopyJoinCode}>
                <Ionicons name="copy-outline" size={20} color={Colors.dark.xpCyan} />
                <Text style={styles.joinCodeActionText}>Copy</Text>
              </Pressable>
              <Pressable style={styles.joinCodeActionButton} onPress={handleShareJoinCode}>
                <Ionicons name="share-outline" size={20} color={Colors.dark.xpCyan} />
                <Text style={styles.joinCodeActionText}>Share</Text>
              </Pressable>
              <Pressable 
                style={[styles.joinCodeActionButton, regenerateJoinCodeMutation.isPending && styles.buttonDisabled]} 
                onPress={handleRegenerateJoinCode}
                disabled={regenerateJoinCodeMutation.isPending}
              >
                <Ionicons name="refresh-outline" size={20} color={Colors.dark.textMuted} />
                <Text style={[styles.joinCodeActionText, { color: Colors.dark.textMuted }]}>New Code</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.noJoinCodeContainer}>
            <Text style={styles.noJoinCodeText}>No join code yet</Text>
            <AnimatedButton 
              style={[styles.generateCodeButton, regenerateJoinCodeMutation.isPending && styles.buttonDisabled]}
              onPress={() => regenerateJoinCodeMutation.mutate()}
              disabled={regenerateJoinCodeMutation.isPending}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.generateCodeGradient}
              >
                {regenerateJoinCodeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.generateCodeButtonText}>Generate Code</Text>
                  </>
                )}
              </LinearGradient>
            </AnimatedButton>
          </View>
        )}
      </View>

      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>BUSINESS INFORMATION</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Business Name</Text>
          <TextInput
            style={styles.input}
            value={formData.businessName}
            onChangeText={(text) => updateField("businessName", text)}
            placeholder="Your academy name"
            placeholderTextColor={Colors.dark.textMuted}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Contact Email</Text>
          <TextInput
            style={styles.input}
            value={formData.contactEmail}
            onChangeText={(text) => updateField("contactEmail", text)}
            placeholder="contact@academy.com"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Contact Phone</Text>
          <TextInput
            style={styles.input}
            value={formData.contactPhone}
            onChangeText={(text) => updateField("contactPhone", text)}
            placeholder="+971 50 123 4567"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={formData.address}
            onChangeText={(text) => updateField("address", text)}
            placeholder="Your academy address"
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>REGIONAL SETTINGS</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Timezone</Text>
          <View style={styles.optionRow}>
            {TIMEZONES.slice(0, 3).map((tz) => (
              <Pressable
                key={tz.value}
                style={[styles.optionButton, formData.timezone === tz.value && styles.optionButtonActive]}
                onPress={() => updateField("timezone", tz.value)}
              >
                <Text style={[styles.optionText, formData.timezone === tz.value && styles.optionTextActive]}>
                  {tz.label.split(" ")[0]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Currency</Text>
          <View style={styles.optionRow}>
            {CURRENCIES.slice(0, 4).map((curr) => (
              <Pressable
                key={curr.value}
                style={[styles.optionButton, formData.currency === curr.value && styles.optionButtonActive]}
                onPress={() => updateField("currency", curr.value)}
              >
                <Text style={[styles.optionText, formData.currency === curr.value && styles.optionTextActive]}>
                  {curr.value}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>INVOICE SETTINGS</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Invoice Prefix</Text>
          <TextInput
            style={styles.input}
            value={formData.invoicePrefix}
            onChangeText={(text) => updateField("invoicePrefix", text)}
            placeholder="INV"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="characters"
            maxLength={10}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tax Rate (%)</Text>
          <TextInput
            style={styles.input}
            value={formData.taxRate}
            onChangeText={(text) => updateField("taxRate", text)}
            placeholder="5"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Invoice Footer</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={formData.invoiceFooter}
            onChangeText={(text) => updateField("invoiceFooter", text)}
            placeholder="Thank you for your business!"
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {hasChanges && (
        <AnimatedButton
          style={[styles.saveButton, updateSettingsMutation.isPending && styles.buttonDisabled]}
          onPress={handleSaveSettings}
          disabled={updateSettingsMutation.isPending}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            {updateSettingsMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.buttonText}>Save Changes</Text>
              </>
            )}
          </LinearGradient>
        </AnimatedButton>
      )}
    </View>
  );

  const renderTeamTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>TEAM MEMBERS ({members.length})</Text>
        
        {membersLoading ? (
          <ActivityIndicator color={Colors.dark.xpCyan} />
        ) : members.length === 0 ? (
          <Text style={styles.emptyText}>No team members yet</Text>
        ) : (
          members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberIcon}>
                <Ionicons name="person" size={24} color={Colors.dark.xpCyan} />
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.coach?.name || "Unknown"}</Text>
                <Text style={styles.memberEmail}>{member.coach?.email || ""}</Text>
              </View>
              <View style={styles.memberActions}>
                <View style={[styles.roleBadge, member.role === "owner" && styles.ownerBadge]}>
                  <Text style={styles.roleText}>{member.role}</Text>
                </View>
                {member.role !== "owner" && (
                  <Pressable onPress={() => handleRemoveMember(member)} style={styles.removeButton}>
                    <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );

  const renderInvitesTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>INVITE NEW COACH</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="coach@email.com"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.optionRow}>
            {["coach", "admin"].map((role) => (
              <Pressable
                key={role}
                style={[styles.optionButton, inviteRole === role && styles.optionButtonActive]}
                onPress={() => setInviteRole(role)}
              >
                <Text style={[styles.optionText, inviteRole === role && styles.optionTextActive]}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <AnimatedButton
          style={[styles.sendButton, createInviteMutation.isPending && styles.buttonDisabled]}
          onPress={handleSendInvite}
          disabled={createInviteMutation.isPending}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.xpCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            {createInviteMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="mail-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Send Invite</Text>
              </>
            )}
          </LinearGradient>
        </AnimatedButton>
      </View>

      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>PENDING INVITES ({invites.filter(i => i.status === "pending").length})</Text>
        
        {invitesLoading ? (
          <ActivityIndicator color={Colors.dark.xpCyan} />
        ) : invites.filter(i => i.status === "pending").length === 0 ? (
          <Text style={styles.emptyText}>No pending invites</Text>
        ) : (
          invites.filter(i => i.status === "pending").map((invite) => (
            <View key={invite.id} style={styles.inviteCard}>
              <View style={styles.inviteInfo}>
                <Text style={styles.inviteEmail}>{invite.email}</Text>
                <Text style={styles.inviteRole}>{invite.role}</Text>
                <Text style={styles.inviteExpiry}>
                  Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable onPress={() => handleDeleteInvite(invite)} style={styles.cancelButton}>
                <Ionicons name="close" size={18} color={Colors.dark.error} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );

  if (settingsLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.xpCyan} />
        </View>
      </View>
    );
  }

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
          <Text style={styles.headerTitle}>ACADEMY SETTINGS</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <View style={styles.tabs}>
        {[
          { key: "settings", label: "Settings", icon: "settings-outline" },
          { key: "team", label: "Team", icon: "people-outline" },
          { key: "invites", label: "Invites", icon: "mail-outline" },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <Ionicons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? Colors.dark.xpCyan : Colors.dark.disabled}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAwareScrollViewCompat 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "settings" && renderSettingsTab()}
        {activeTab === "team" && renderTeamTab()}
        {activeTab === "invites" && renderInvitesTab()}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    letterSpacing: 2,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  tabActive: {
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderColor: Colors.dark.xpCyan,
  },
  tabText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  glassSection: {
    backgroundColor: "rgba(18, 18, 22, 0.9)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    letterSpacing: 1.5,
  },
  joinCodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  joinCodeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.dark.xpCyan}20`,
    justifyContent: "center",
    alignItems: "center",
  },
  joinCodeHeaderText: {
    flex: 1,
  },
  joinCodeTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  joinCodeSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  joinCodeLoadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  joinCodeDisplay: {
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}40`,
  },
  joinCodeText: {
    ...Typography.h1,
    color: Colors.dark.xpCyan,
    letterSpacing: 4,
    fontWeight: "700",
  },
  joinCodeActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  joinCodeActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    borderRadius: BorderRadius.sm,
  },
  joinCodeActionText: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "500",
  },
  noJoinCodeContainer: {
    alignItems: "center",
    gap: Spacing.md,
  },
  noJoinCodeText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  generateCodeButton: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  generateCodeGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  generateCodeButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "rgba(30, 30, 35, 0.9)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
    backgroundColor: "rgba(30, 30, 35, 0.9)",
  },
  optionButtonActive: {
    backgroundColor: `${Colors.dark.xpCyan}25`,
    borderColor: Colors.dark.xpCyan,
  },
  optionText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  optionTextActive: {
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  saveButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  sendButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  buttonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 35, 0.8)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  memberIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${Colors.dark.xpCyan}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  memberEmail: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.dark.primary}25`,
  },
  ownerBadge: {
    backgroundColor: `${Colors.dark.gold}25`,
  },
  roleText: {
    ...Typography.caption,
    color: Colors.dark.primary,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  removeButton: {
    padding: Spacing.xs,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 35, 0.8)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}20`,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteEmail: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  inviteRole: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    textTransform: "capitalize",
  },
  inviteExpiry: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  cancelButton: {
    padding: Spacing.sm,
    backgroundColor: `${Colors.dark.error}15`,
    borderRadius: BorderRadius.sm,
  },
});
