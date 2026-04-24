import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AcademyTheme,
  AcademyThemeColors,
  contrastRatio,
  defaultAcademyTheme,
  isReadable,
  themePresets,
} from "@shared/theme";
import {
  resolveTheme,
} from "@/contexts/AcademyThemeContext";
import {
  BorderRadius,
  Colors,
  Spacing,
  Typography,
} from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth";

const COLOR_FIELDS: Array<{
  key: keyof AcademyThemeColors;
  label: string;
  hint: string;
}> = [
  { key: "primary", label: "Primary", hint: "Buttons, focus, highlights" },
  { key: "secondary", label: "Secondary", hint: "Hover, soft accents" },
  { key: "accent", label: "Accent", hint: "Badges, info pills" },
  { key: "surface", label: "App background", hint: "Root screen background" },
  { key: "panel", label: "Panel / Card", hint: "Default card background" },
  { key: "panelElevated", label: "Elevated panel", hint: "Modals, sheets" },
  { key: "panelBorder", label: "Panel border", hint: "Card outlines (rgba ok)" },
  { key: "text", label: "Text", hint: "Primary text colour" },
  { key: "textMuted", label: "Muted text", hint: "Secondary / helper text" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isValidColor(v: string | undefined): boolean {
  if (!v) return false;
  return HEX_RE.test(v) || /^rgba?\(/i.test(v);
}

function emptyTheme(): AcademyTheme {
  return { dark: {} };
}

export default function BrandingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();

  // When opened by a platform owner from AcademyDetail, an `academyId` param
  // targets that academy's theme instead of the caller's own. Without the
  // param we behave as before and edit the caller's academy.
  const targetAcademyId: string | undefined = route.params?.academyId;
  const targetAcademyName: string | undefined = route.params?.academyName;
  const themeQueryKey = targetAcademyId
    ? ["/api/academy/theme", targetAcademyId]
    : ["/api/academy/theme"];
  const themeQueryUrl = targetAcademyId
    ? `/api/academy/theme?academyId=${encodeURIComponent(targetAcademyId)}`
    : "/api/academy/theme";

  // Fetch current theme via the public read endpoint.
  const { data, isLoading } = useQuery<{
    theme: AcademyTheme | null;
    logoUrl: string | null;
  }>({
    queryKey: themeQueryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", themeQueryUrl);
      return res.json();
    },
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const invalidateBranding = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/academy/theme"] });
    if (targetAcademyId) {
      queryClient.invalidateQueries({ queryKey: ["/api/academy/theme", targetAcademyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/academies", targetAcademyId] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/owner/academy"] });
    queryClient.invalidateQueries({ queryKey: ["/api/player/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/owner/dashboard"] });
  };

  const handleUploadLogo = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photo library to upload a logo.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploadingLogo(true);
      const asset = result.assets[0];
      const filename = asset.uri.split("/").pop() || "logo.png";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1].toLowerCase().replace("jpg", "jpeg")}` : "image/png";

      const formData = new FormData();
      if (Platform.OS === "web") {
        if ((asset as any).file) {
          formData.append("logo", (asset as any).file);
        } else {
          const r = await fetch(asset.uri);
          const blob = await r.blob();
          formData.append("logo", blob, filename);
        }
      } else {
        formData.append("logo", { uri: asset.uri, name: filename, type } as any);
      }

      if (targetAcademyId) {
        formData.append("academyId", targetAcademyId);
      }
      const token = getAuthToken();
      const logoUrl = targetAcademyId
        ? `${getApiUrl()}/api/academy/logo?academyId=${encodeURIComponent(targetAcademyId)}`
        : `${getApiUrl()}/api/academy/logo`;
      const res = await fetch(logoUrl, {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const { parseUploadErrorResponse } = await import("@/lib/uploads");
        const { message } = await parseUploadErrorResponse(
          res,
          "Could not upload logo. Please try again.",
        );
        throw new Error(message);
      }
      invalidateBranding();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error: any) {
      Alert.alert("Upload failed", error?.message || "Could not upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      setUploadingLogo(true);
      const path = targetAcademyId
        ? `/api/academy/logo?academyId=${encodeURIComponent(targetAcademyId)}`
        : "/api/academy/logo";
      await apiRequest("DELETE", path);
      invalidateBranding();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error: any) {
      Alert.alert("Remove failed", error?.message || "Could not remove logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const [draft, setDraft] = useState<AcademyTheme | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Once the theme loads, seed the draft with current values (or defaults).
  React.useEffect(() => {
    if (data && draft === null) {
      setDraft(data.theme ?? emptyTheme());
    }
  }, [data, draft]);

  const effectiveDraft: AcademyTheme = draft ?? emptyTheme();
  const previewResolved = useMemo(
    () => resolveTheme(effectiveDraft, mode),
    [effectiveDraft, mode],
  );

  const saveMutation = useMutation({
    mutationFn: async (theme: AcademyTheme | null) =>
      apiRequest("PATCH", "/api/academy/theme", {
        theme,
        ...(targetAcademyId ? { academyId: targetAcademyId } : {}),
      }),
    onSuccess: () => {
      invalidateBranding();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
  });

  const updateField = (key: keyof AcademyThemeColors, value: string) => {
    setDraft((prev) => {
      const base = prev ?? emptyTheme();
      if (mode === "dark") {
        const dark = { ...(base.dark ?? {}) };
        if (value) (dark as any)[key] = value;
        else delete (dark as any)[key];
        return { ...base, dark };
      }
      const next = { ...base } as AcademyTheme;
      if (value) (next as any)[key] = value;
      else delete (next as any)[key];
      return next;
    });
  };

  const fieldValue = (key: keyof AcademyThemeColors): string => {
    if (mode === "dark") return (effectiveDraft.dark?.[key] as string | undefined) ?? "";
    return (effectiveDraft[key] as string | undefined) ?? "";
  };

  const applyPreset = (preset: AcademyTheme) => {
    setDraft({ ...preset, dark: { ...(preset.dark ?? {}) } });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const resetToDefault = () => {
    setDraft(emptyTheme());
  };

  const handleSave = () => {
    const cleaned = sanitizeTheme(effectiveDraft);
    saveMutation.mutate(cleaned);
  };

  const contrastWarn =
    previewResolved.text && previewResolved.panel
      ? !isReadable(previewResolved.text, previewResolved.panel)
      : false;
  const contrastValue =
    previewResolved.text && previewResolved.panel
      ? contrastRatio(previewResolved.text, previewResolved.panel).toFixed(2)
      : "—";

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Title>{targetAcademyName ? `Branding · ${targetAcademyName}` : "Branding"}</Title>
          <Subtitle>
            {targetAcademyId
              ? "Editing branding on behalf of this academy."
              : "Make this academy feel like home."}
          </Subtitle>
        </View>
        <Pressable
          onPress={handleSave}
          disabled={saveMutation.isPending}
          style={({ pressed }) => [
            styles.saveBtn,
            { opacity: pressed || saveMutation.isPending ? 0.6 : 1 },
          ]}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <Title style={styles.saveBtnLabel}>Save</Title>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + Spacing.xl * 2 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Academy logo */}
        <Section title="Academy logo">
          <View style={styles.logoRow}>
            <View style={styles.logoPreview}>
              {data?.logoUrl ? (
                <RNImage
                  source={{ uri: data.logoUrl }}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="image-outline" size={32} color={Colors.dark.textMuted} />
              )}
            </View>
            <View style={{ flex: 1, gap: Spacing.sm }}>
              <Text style={styles.colorHint}>
                Shown on the player home, owner dashboard and invoices. PNG or
                SVG works best — square images look cleanest.
              </Text>
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <Pressable
                  onPress={handleUploadLogo}
                  disabled={uploadingLogo}
                  style={[styles.logoBtn, { opacity: uploadingLogo ? 0.6 : 1 }]}
                >
                  {uploadingLogo ? (
                    <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={16} color={Colors.dark.buttonText} />
                      <Text style={styles.logoBtnLabel}>
                        {data?.logoUrl ? "Replace" : "Upload"}
                      </Text>
                    </>
                  )}
                </Pressable>
                {data?.logoUrl ? (
                  <Pressable
                    onPress={handleRemoveLogo}
                    disabled={uploadingLogo}
                    style={[styles.logoBtnGhost, { opacity: uploadingLogo ? 0.6 : 1 }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.dark.text} />
                    <Text style={{ color: Colors.dark.text }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </Section>

        {/* Mode toggle */}
        <View style={styles.modeToggleRow}>
          <ModeBtn label="Dark" active={mode === "dark"} onPress={() => setMode("dark")} />
          <ModeBtn label="Light" active={mode === "light"} onPress={() => setMode("light")} />
        </View>

        {/* Live preview */}
        <Section title="Live preview">
          <Preview resolved={previewResolved} />
          <View style={styles.contrastRow}>
            <Ionicons
              name={contrastWarn ? "warning" : "checkmark-circle"}
              size={16}
              color={contrastWarn ? "#FFB020" : "#00E676"}
            />
            <Text>
              Text-on-panel contrast: {contrastValue}{" "}
              {contrastWarn ? "(below WCAG AA — pick a different text colour)" : "(WCAG AA)"}
            </Text>
          </View>
        </Section>

        {/* Presets */}
        <Section title="Quick presets">
          <View style={styles.presetGrid}>
            {themePresets.map((p) => (
              <PresetCard
                key={p.id}
                name={p.name}
                description={p.description}
                colors={[
                  p.theme.dark?.primary ?? p.theme.primary ?? "#000",
                  p.theme.dark?.secondary ?? p.theme.secondary ?? "#000",
                  p.theme.dark?.panel ?? p.theme.panel ?? "#000",
                ]}
                onPress={() => applyPreset(p.theme)}
              />
            ))}
          </View>
        </Section>

        {/* Color fields */}
        <Section title={`Colours (${mode} mode)`}>
          {COLOR_FIELDS.map((f) => (
            <ColorRow
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={fieldValue(f.key)}
              onChange={(v) => updateField(f.key, v)}
            />
          ))}
        </Section>

        <Section title="">
          <Pressable onPress={resetToDefault} style={styles.resetBtn}>
            <Ionicons name="refresh" size={16} color={Colors.dark.textMuted} />
            <Text style={{ color: Colors.dark.textMuted }}>Reset to default</Text>
          </Pressable>
          <View style={{ height: Spacing.md }} />
          <Text style={styles.note}>
            System status colours (success / warning / error) are not themable —
            this protects readability when something goes wrong.
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}

// ---------- Helpers / sub-components ----------

function sanitizeTheme(t: AcademyTheme): AcademyTheme {
  const out: any = {};
  for (const k of Object.keys(t) as (keyof AcademyTheme)[]) {
    if (k === "dark") continue;
    const v = (t as any)[k];
    if (typeof v === "string" && isValidColor(v)) out[k] = v;
  }
  if (t.dark) {
    const dark: any = {};
    for (const k of Object.keys(t.dark) as (keyof AcademyThemeColors)[]) {
      const v = (t.dark as any)[k];
      if (typeof v === "string" && isValidColor(v)) dark[k] = v;
    }
    if (Object.keys(dark).length) out.dark = dark;
  }
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function Title({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}
function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}
function Text(props: React.ComponentProps<typeof RNText>) {
  return <RNText {...props} style={[{ color: Colors.dark.text }, props.style]} />;
}

function ModeBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modeBtn,
        { backgroundColor: active ? Colors.dark.primary : "transparent" },
      ]}
    >
      <Text
        style={{
          color: active ? Colors.dark.buttonText : Colors.dark.textMuted,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PresetCard({
  name,
  description,
  colors,
  onPress,
}: {
  name: string;
  description: string;
  colors: string[];
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.presetCard}>
      <View style={styles.presetSwatchRow}>
        {colors.map((c, i) => (
          <View key={i} style={[styles.presetSwatch, { backgroundColor: c }]} />
        ))}
      </View>
      <Text style={styles.presetName}>{name}</Text>
      <Text style={styles.presetDesc} numberOfLines={2}>
        {description}
      </Text>
    </Pressable>
  );
}

function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = !value || isValidColor(value);
  return (
    <View style={styles.colorRow}>
      <View
        style={[
          styles.colorSwatch,
          {
            backgroundColor: valid && value ? value : "transparent",
            borderColor: Colors.dark.borderSubtle,
          },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.colorLabel}>{label}</Text>
        <Text style={styles.colorHint}>{hint}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="#RRGGBB"
        placeholderTextColor={Colors.dark.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={[
          styles.colorInput,
          { borderColor: valid ? Colors.dark.borderSubtle : "#FF4D4D" },
        ]}
      />
    </View>
  );
}

function Preview({ resolved }: { resolved: ReturnType<typeof resolveTheme> }) {
  return (
    <View
      style={[
        styles.previewWrap,
        { backgroundColor: resolved.surface, borderColor: resolved.panelBorder },
      ]}
    >
      {/* Fake header */}
      <View
        style={[
          styles.previewHeader,
          { backgroundColor: resolved.panel, borderColor: resolved.panelBorder },
        ]}
      >
        <View
          style={[
            styles.previewLogoDot,
            { backgroundColor: resolved.primary },
          ]}
        />
        <RNText style={[styles.previewTitle, { color: resolved.text }]}>
          Tonight's session
        </RNText>
      </View>
      {/* Card */}
      <View
        style={[
          styles.previewCard,
          { backgroundColor: resolved.panel, borderColor: resolved.panelBorder },
        ]}
      >
        <RNText style={[styles.previewCardTitle, { color: resolved.text }]}>
          Group lesson · Court 2
        </RNText>
        <RNText style={[styles.previewCardSub, { color: resolved.textMuted }]}>
          18:00 — 19:30 with Coach Alex
        </RNText>
        <View style={styles.previewBtnRow}>
          <View
            style={[styles.previewPrimaryBtn, { backgroundColor: resolved.primary }]}
          >
            <RNText style={[styles.previewBtnLabel, { color: "#000" }]}>
              Confirm
            </RNText>
          </View>
          <View
            style={[
              styles.previewGhostBtn,
              { borderColor: resolved.panelBorder, backgroundColor: resolved.panelElevated },
            ]}
          >
            <RNText style={[styles.previewBtnLabel, { color: resolved.text }]}>
              Skip
            </RNText>
          </View>
        </View>
        <View style={styles.previewChipRow}>
          <View style={[styles.previewChip, { backgroundColor: resolved.secondary }]}>
            <RNText style={[styles.previewChipLabel, { color: "#000" }]}>+12 XP</RNText>
          </View>
          <View style={[styles.previewChip, { backgroundColor: resolved.accent }]}>
            <RNText style={[styles.previewChipLabel, { color: "#000" }]}>Streak 5</RNText>
          </View>
        </View>
      </View>
      {/* Tab bar */}
      <View
        style={[
          styles.previewTabBar,
          { backgroundColor: resolved.panel, borderColor: resolved.panelBorder },
        ]}
      >
        {["home", "calendar", "trophy", "person"].map((icon, i) => (
          <Ionicons
            key={icon}
            name={icon as any}
            size={20}
            color={i === 0 ? resolved.primary : resolved.textMuted}
          />
        ))}
      </View>
    </View>
  );
}

import { Text as RNText } from "react-native";

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTextWrap: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  headerTitle: {},
  headerTitleInner: {},
  headerTitleSpacer: { height: 0 },
  headerTitlePosition: {},
  title: { ...Typography.h2, color: Colors.dark.text },
  subtitle: { ...Typography.small, color: Colors.dark.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  saveBtnLabel: { color: Colors.dark.buttonText, ...Typography.body, fontWeight: "700" },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.xl },
  modeToggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignSelf: "flex-start",
  },
  modeBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
  section: { gap: Spacing.md },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
  },
  contrastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  presetCard: {
    width: "47%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    gap: 6,
  },
  presetSwatchRow: { flexDirection: "row", gap: 4 },
  presetSwatch: {
    flex: 1,
    height: 28,
    borderRadius: 6,
  },
  presetName: { ...Typography.body, fontWeight: "600", color: Colors.dark.text },
  presetDesc: { ...Typography.caption, color: Colors.dark.textMuted },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
  },
  colorLabel: { ...Typography.body, color: Colors.dark.text, fontWeight: "600" },
  colorHint: { ...Typography.caption, color: Colors.dark.textMuted },
  colorInput: {
    width: 110,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    fontSize: 12,
  },
  previewWrap: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  previewLogoDot: { width: 16, height: 16, borderRadius: 8 },
  previewTitle: { fontSize: 14, fontWeight: "700" },
  previewCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  previewCardTitle: { fontSize: 16, fontWeight: "700" },
  previewCardSub: { fontSize: 13 },
  previewBtnRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  previewPrimaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
  },
  previewGhostBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  previewBtnLabel: { fontSize: 13, fontWeight: "700" },
  previewChipRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  previewChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  previewChipLabel: { fontSize: 11, fontWeight: "700" },
  previewTabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  note: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  logoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.primary,
  },
  logoBtnLabel: { color: Colors.dark.buttonText, fontWeight: "700" },
  logoBtnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
});
