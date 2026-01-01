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
      <View style={styles.joinCodeSection}>
        <View style={styles.joinCodeHeader}>
          <View style={styles.joinCodeIconContainer}>
            <Ionicons name="qr-code" size={24} color={Colors.dark.primary} />
          </View>
          <View style={styles.joinCodeHeaderText}>
            <Text style={styles.joinCodeTitle}>Player Join Code</Text>
            <Text style={styles.joinCodeSubtitle}>Share this code with players to let them join your academy</Text>
          </View>
        </View>
        
        {joinCodeLoading ? (
          <View style={styles.joinCodeLoadingContainer}>
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          </View>
        ) : joinCodeData?.joinCode ? (
          <>
            <View style={styles.joinCodeDisplay}>
              <Text style={styles.joinCodeText}>{joinCodeData.joinCode}</Text>
            </View>
            <View style={styles.joinCodeActions}>
              <Pressable style={styles.joinCodeActionButton} onPress={handleCopyJoinCode}>
                <Ionicons name="copy-outline" size={20} color={Colors.dark.primary} />
                <Text style={styles.joinCodeActionText}>Copy</Text>
              </Pressable>
              <Pressable style={styles.joinCodeActionButton} onPress={handleShareJoinCode}>
                <Ionicons name="share-outline" size={20} color={Colors.dark.primary} />
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
            <Pressable 
              style={[styles.generateCodeButton, regenerateJoinCodeMutation.isPending && styles.buttonDisabled]}
              onPress={() => regenerateJoinCodeMutation.mutate()}
              disabled={regenerateJoinCodeMutation.isPending}
            >
              {regenerateJoinCodeMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.generateCodeButtonText}>Generate Code</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Business Information</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Business Name</Text>
          <TextInput
            style={styles.input}
            value={formData.businessName}
            onChangeText={(text) => updateField("businessName", text)}
            placeholder="Your academy name"
            placeholderTextColor={Colors.dark.disabled}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Contact Email</Text>
          <TextInput
            style={styles.input}
            value={formData.contactEmail}
            onChangeText={(text) => updateField("contactEmail", text)}
            placeholder="contact@academy.com"
            placeholderTextColor={Colors.dark.disabled}
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
            placeholderTextColor={Colors.dark.disabled}
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
            placeholderTextColor={Colors.dark.disabled}
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Regional Settings</Text>
        
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invoice Settings</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Invoice Prefix</Text>
          <TextInput
            style={styles.input}
            value={formData.invoicePrefix}
            onChangeText={(text) => updateField("invoicePrefix", text)}
            placeholder="INV"
            placeholderTextColor={Colors.dark.disabled}
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
            placeholderTextColor={Colors.dark.disabled}
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
            placeholderTextColor={Colors.dark.disabled}
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {hasChanges && (
        <Pressable
          style={[styles.saveButton, updateSettingsMutation.isPending && styles.buttonDisabled]}
          onPress={handleSaveSettings}
          disabled={updateSettingsMutation.isPending}
        >
          <LinearGradient
            colors={[Colors.dark.primary, "#1EA030"]}
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
        </Pressable>
      )}
    </View>
  );

  const renderTeamTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team Members ({members.length})</Text>
        
        {membersLoading ? (
          <ActivityIndicator color={Colors.dark.primary} />
        ) : members.length === 0 ? (
          <Text style={styles.emptyText}>No team members yet</Text>
        ) : (
          members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberIcon}>
                <Ionicons name="person" size={24} color={Colors.dark.primary} />
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invite New Coach</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="coach@email.com"
            placeholderTextColor={Colors.dark.disabled}
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

        <Pressable
          style={[styles.sendButton, createInviteMutation.isPending && styles.buttonDisabled]}
          onPress={handleSendInvite}
          disabled={createInviteMutation.isPending}
        >
          <LinearGradient
            colors={[Colors.dark.primary, "#1EA030"]}
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
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pending Invites ({invites.filter(i => i.status === "pending").length})</Text>
        
        {invitesLoading ? (
          <ActivityIndicator color={Colors.dark.primary} />
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
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Academy Settings</Text>
        <View style={{ width: 40 }} />
      </View>

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
              size={20}
              color={activeTab === tab.key ? Colors.dark.primary : Colors.dark.disabled}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAwareScrollViewCompat style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "settings" && renderSettingsTab()}
        {activeTab === "team" && renderTeamTab()}
        {activeTab === "invites" && renderInvitesTab()}
        <View style={{ height: insets.bottom + 20 }} />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  tabText: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  tabTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.disabled,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionButtonActive: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    borderColor: Colors.dark.primary,
  },
  optionText: {
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  optionTextActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  memberIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
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
    ...Typography.small,
    color: Colors.dark.disabled,
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.xs,
  },
  ownerBadge: {
    backgroundColor: "rgba(46, 204, 64, 0.15)",
  },
  roleText: {
    ...Typography.caption,
    color: Colors.dark.disabled,
    textTransform: "capitalize",
  },
  removeButton: {
    padding: Spacing.xs,
  },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteEmail: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  inviteRole: {
    ...Typography.small,
    color: Colors.dark.primary,
    textTransform: "capitalize",
  },
  inviteExpiry: {
    ...Typography.caption,
    color: Colors.dark.disabled,
  },
  cancelButton: {
    padding: Spacing.sm,
    backgroundColor: "rgba(255, 68, 68, 0.1)",
    borderRadius: BorderRadius.xs,
  },
  sendButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  saveButton: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  buttonText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "600",
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.disabled,
    textAlign: "center",
    paddingVertical: Spacing.xl,
  },
  joinCodeSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  joinCodeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  joinCodeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(46, 204, 64, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  joinCodeHeaderText: {
    flex: 1,
  },
  joinCodeTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  joinCodeSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  joinCodeLoadingContainer: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  joinCodeDisplay: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    borderStyle: "dashed",
  },
  joinCodeText: {
    ...Typography.h1,
    color: Colors.dark.primary,
    letterSpacing: 4,
    fontWeight: "700",
  },
  joinCodeActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  joinCodeActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  joinCodeActionText: {
    ...Typography.small,
    color: Colors.dark.primary,
    fontWeight: "600",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
  },
  generateCodeButtonText: {
    ...Typography.body,
    color: "#fff",
    fontWeight: "600",
  },
});
