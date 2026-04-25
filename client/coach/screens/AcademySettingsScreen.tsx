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
import { useTranslation } from "react-i18next";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
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
  vatRegistrationNumber: string | null;
  openJoin?: boolean;
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
  const { t } = useTranslation();
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
    bankName: "",
    bankAccountNumber: "",
    bankIban: "",
    bankAccountHolder: "",
    bankSwiftCode: "",
    paymentInstructions: "",
    acceptsCash: true,
    acceptsBankTransfer: true,
    vatRegistrationNumber: "",
    openJoin: true,
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
        bankName: (settings as any).bankName || "",
        bankAccountNumber: (settings as any).bankAccountNumber || "",
        bankIban: (settings as any).bankIban || "",
        bankAccountHolder: (settings as any).bankAccountHolder || "",
        bankSwiftCode: (settings as any).bankSwiftCode || "",
        paymentInstructions: (settings as any).paymentInstructions || "",
        acceptsCash: (settings as any).acceptsCash !== false,
        acceptsBankTransfer: (settings as any).acceptsBankTransfer !== false,
        vatRegistrationNumber: (settings as any).vatRegistrationNumber || "",
        openJoin: settings.openJoin !== false,
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
      bankName: formData.bankName || null,
      bankAccountNumber: formData.bankAccountNumber || null,
      bankIban: formData.bankIban || null,
      bankAccountHolder: formData.bankAccountHolder || null,
      bankSwiftCode: formData.bankSwiftCode || null,
      paymentInstructions: formData.paymentInstructions || null,
      acceptsCash: formData.acceptsCash,
      acceptsBankTransfer: formData.acceptsBankTransfer,
      vatRegistrationNumber: formData.vatRegistrationNumber || null,
      openJoin: formData.openJoin,
    } as any);
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
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Ionicons name="add" size={20} color={Colors.dark.buttonText} />
                    <Text style={styles.generateCodeButtonText}>Generate Code</Text>
                  </>
                )}
              </LinearGradient>
            </AnimatedButton>
          </View>
        )}
      </View>

      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>{t("academy.joinFlow.settingsSection")}</Text>

        <View style={styles.toggleRow}>
          <View style={[styles.toggleInfo, { flex: 1, paddingRight: Spacing.md }]}>
            <Ionicons
              name={formData.openJoin ? "lock-open-outline" : "lock-closed-outline"}
              size={20}
              color={formData.openJoin ? Colors.dark.primary : Colors.dark.gold}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t("academy.joinFlow.openJoinLabel")}</Text>
              <Text style={styles.openJoinHelper}>
                {formData.openJoin
                  ? t("academy.joinFlow.openJoinHelperOn")
                  : t("academy.joinFlow.openJoinHelperOff")}
              </Text>
            </View>
          </View>
          <Pressable
            style={[styles.toggle, formData.openJoin && styles.toggleActive]}
            onPress={() => {
              setFormData(prev => ({ ...prev, openJoin: !prev.openJoin }));
              setHasChanges(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={[styles.toggleKnob, formData.openJoin && styles.toggleKnobActive]} />
          </Pressable>
        </View>
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
          <Text style={styles.label}>VAT Registration Number (TRN)</Text>
          <TextInput
            style={styles.input}
            value={formData.vatRegistrationNumber}
            onChangeText={(text) => updateField("vatRegistrationNumber", text)}
            placeholder="e.g. 100123456700003"
            placeholderTextColor={Colors.dark.textMuted}
          />
          <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginTop: 4 }}>
            If empty, invoices will show &quot;Supplier is not VAT registered&quot;
          </Text>
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

      <View style={styles.glassSection}>
        <Text style={styles.sectionTitle}>PAYMENT METHODS</Text>
        <Text style={styles.sectionSubtitle}>Configure how parents can pay for credits</Text>
        
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Ionicons name="cash-outline" size={20} color={Colors.dark.gold} />
            <Text style={styles.toggleLabel}>Accept Cash Payments</Text>
          </View>
          <Pressable
            style={[styles.toggle, formData.acceptsCash && styles.toggleActive]}
            onPress={() => { setFormData(prev => ({ ...prev, acceptsCash: !prev.acceptsCash })); setHasChanges(true); }}
          >
            <View style={[styles.toggleKnob, formData.acceptsCash && styles.toggleKnobActive]} />
          </Pressable>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Ionicons name="card-outline" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.toggleLabel}>Accept Bank Transfer</Text>
          </View>
          <Pressable
            style={[styles.toggle, formData.acceptsBankTransfer && styles.toggleActive]}
            onPress={() => { setFormData(prev => ({ ...prev, acceptsBankTransfer: !prev.acceptsBankTransfer })); setHasChanges(true); }}
          >
            <View style={[styles.toggleKnob, formData.acceptsBankTransfer && styles.toggleKnobActive]} />
          </Pressable>
        </View>
      </View>

      {formData.acceptsBankTransfer ? (
        <View style={styles.glassSection}>
          <Text style={styles.sectionTitle}>BANK DETAILS</Text>
          <Text style={styles.sectionSubtitle}>These details will be shown to parents when they purchase credits</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bank Name</Text>
            <TextInput
              style={styles.input}
              value={formData.bankName}
              onChangeText={(text) => updateField("bankName", text)}
              placeholder="e.g., Emirates NBD"
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Holder Name</Text>
            <TextInput
              style={styles.input}
              value={formData.bankAccountHolder}
              onChangeText={(text) => updateField("bankAccountHolder", text)}
              placeholder="Name on the account"
              placeholderTextColor={Colors.dark.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Number</Text>
            <TextInput
              style={styles.input}
              value={formData.bankAccountNumber}
              onChangeText={(text) => updateField("bankAccountNumber", text)}
              placeholder="Your account number"
              placeholderTextColor={Colors.dark.textMuted}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>IBAN</Text>
            <TextInput
              style={styles.input}
              value={formData.bankIban}
              onChangeText={(text) => updateField("bankIban", text)}
              placeholder="e.g., AE12 3456 7890 1234 5678 901"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>SWIFT/BIC Code (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.bankSwiftCode}
              onChangeText={(text) => updateField("bankSwiftCode", text)}
              placeholder="e.g., EABORAEA"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Payment Instructions (Optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={formData.paymentInstructions}
              onChangeText={(text) => updateField("paymentInstructions", text)}
              placeholder="e.g., Please include player name as reference"
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>
        </View>
      ) : null}

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
              <ActivityIndicator color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color={Colors.dark.buttonText} />
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
              <ActivityIndicator color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="mail-outline" size={20} color={Colors.dark.buttonText} />
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  sectionTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    letterSpacing: 1.5,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  toggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  openJoinHelper: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(50, 50, 55, 0.9)",
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: `${Colors.dark.primary}60`,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.textMuted,
  },
  toggleKnobActive: {
    backgroundColor: Colors.dark.primary,
    marginLeft: "auto",
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
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    borderColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: Backgrounds.elevated,
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
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
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
