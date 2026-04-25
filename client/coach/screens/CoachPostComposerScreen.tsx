import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  Switch,
  Image,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight , HeaderButton } from "@react-navigation/elements";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import {
  POST_TEMPLATE_META,
  type PostTemplate,
  type Group,
} from "@/player/components/community/CommunityTypes";

type ComposerMode = "coach" | "academy";

interface RouteParams {
  mode?: ComposerMode;
  initialTemplate?: PostTemplate;
}

const COACH_TEMPLATES: PostTemplate[] = ["tip", "announcement", "drill"];
const ACADEMY_TEMPLATES: PostTemplate[] = [
  "announcement",
  "schedule_change",
  "event_invite",
  "coach_spotlight",
  "tip",
  "drill",
];

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface AcademyCoach {
  id: string;
  name: string;
  photoUrl: string | null;
  specialty: string | null;
  userId: string | null;
}
interface AcademyEvent {
  id: string;
  title: string | null;
  startTime: string;
  endTime: string | null;
  sessionType: string | null;
}

const MAX_IMAGES = 5;

/**
 * Phase 3 — Coach/Academy podium composer.
 * Used by both coaches and academy owners to publish a templated post.
 * The server enforces role/template validation; this screen drives the UX:
 * template chooser, audience picker, pinning, character limit, photo
 * attachments, and template-specific entity pickers (event for
 * `event_invite`, coach for `coach_spotlight`).
 */
export default function CoachPostComposerScreen({ route }: { route?: { params?: RouteParams } }) {
  const mode: ComposerMode = route?.params?.mode === "academy" ? "academy" : "coach";
  const navigation = useNavigation<any>();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const templates = mode === "academy" ? ACADEMY_TEMPLATES : COACH_TEMPLATES;
  const [template, setTemplate] = useState<PostTemplate>(
    route?.params?.initialTemplate && templates.includes(route.params.initialTemplate)
      ? route.params.initialTemplate
      : templates[0],
  );
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"academy" | "group">("academy");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [pinPost, setPinPost] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [coachUserId, setCoachUserId] = useState<string | null>(null);
  const [coachRowId, setCoachRowId] = useState<string | null>(null);

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["/api/social/groups"],
  });

  const { data: coachesData } = useQuery<{ coaches: AcademyCoach[] }>({
    queryKey: ["/api/social/composer/academy-coaches"],
    enabled: template === "coach_spotlight",
  });

  const { data: eventsData } = useQuery<{ events: AcademyEvent[] }>({
    queryKey: ["/api/social/composer/upcoming-events"],
    enabled: template === "event_invite",
  });

  const meta = POST_TEMPLATE_META[template];

  const coachGroupOptions = useMemo(
    () => (groups || []).filter((g: Group) => g.isJoined),
    [groups],
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: mode === "academy" ? "New Academy Post" : "New Coach Post",
      headerRight: () => (
        <HeaderButton
          onPress={handleSubmit}
          disabled={submitting || !caption.trim()}
        >
          <Text style={[styles.postBtn, (submitting || !caption.trim()) && styles.postBtnDisabled]}>
            {submitting ? "Posting…" : "Post"}
          </Text>
        </HeaderButton>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, mode, submitting, caption, template, audience, groupId, pinPost, images, eventId, coachUserId]);

  async function handlePickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_IMAGES - images.length,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, MAX_IMAGES));
    }
  }

  function handleRemoveImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadImages(): Promise<string[]> {
    if (images.length === 0) return [];
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const authToken = await AsyncStorage.getItem("auth_token");
    const authHeaders: Record<string, string> = authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {};

    if (Platform.OS === "web") {
      const formData = new FormData();
      for (let idx = 0; idx < images.length; idx++) {
        const uri = images[idx];
        const blob = await fetch(uri).then((r) => r.blob());
        formData.append("images", blob, `photo_${idx}.jpg`);
      }
      const res = await fetch(`${getApiUrl()}/api/social/posts/upload-images`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Image upload failed${errText ? `: ${errText}` : ""}`);
      }
      const json = await res.json();
      return Array.isArray(json.images) ? json.images : [];
    } else {
      const { uploadAsync, FileSystemUploadType } = await import("expo-file-system/legacy");
      const uploadUrl = `${getApiUrl()}/api/social/posts/upload-images`;
      const allUrls: string[] = [];
      for (const uri of images) {
        const result = await uploadAsync(uploadUrl, uri, {
          fieldName: "images",
          httpMethod: "POST",
          uploadType: FileSystemUploadType.MULTIPART,
          mimeType: "image/jpeg",
          headers: authHeaders,
        });
        if (result.status >= 200 && result.status < 300) {
          const json = JSON.parse(result.body);
          if (Array.isArray(json.images)) allUrls.push(...json.images);
        } else {
          throw new Error(`Image upload failed: ${result.body}`);
        }
      }
      return allUrls;
    }
  }

  async function handleSubmit() {
    if (!caption.trim()) {
      Alert.alert("Add a caption", "Tell people what this post is about.");
      return;
    }
    if (caption.length > 280) {
      Alert.alert("Too long", "Captions are limited to 280 characters.");
      return;
    }
    if (audience === "group" && !groupId) {
      Alert.alert("Pick a group", "Choose a group to post to.");
      return;
    }
    if (template === "event_invite" && !eventId) {
      Alert.alert("Pick an event", "Choose which event this post invites people to.");
      return;
    }
    if (template === "coach_spotlight" && !coachUserId) {
      Alert.alert("Pick a coach", "Choose which coach to spotlight.");
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const mediaUrls = await uploadImages();
      const mediaTypes = mediaUrls.map(() => "image");

      const visibility = audience === "group" ? "group" : "academy";
      const contextType =
        template === "drill"
          ? "training"
          : template === "event_invite"
            ? "event"
            : audience === "group"
              ? "group"
              : "training";

      await apiRequest("POST", "/api/social/posts", {
        contextType,
        contextId: template === "event_invite" ? eventId : undefined,
        caption: caption.trim(),
        visibility,
        groupId: audience === "group" ? groupId : null,
        postTemplate: template,
        isPinned: pinPost,
        mediaUrls,
        mediaTypes,
        taggedUserIds: template === "coach_spotlight" && coachUserId ? [coachUserId] : [],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/social/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/groups"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err instanceof Error ? err.message : "Could not post. Please try again.";
      Alert.alert("Post failed", String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  const academyCoaches = coachesData?.coaches || [];
  const upcomingEvents = eventsData?.events || [];

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.md, paddingBottom: Spacing.xxl }}
      style={styles.container}
    >
      <ThemedText style={styles.sectionLabel}>Template</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
        {templates.map((tpl) => {
          const m = POST_TEMPLATE_META[tpl];
          const active = tpl === template;
          return (
            <Pressable
              key={tpl}
              onPress={() => {
                Haptics.selectionAsync();
                setTemplate(tpl);
                if (tpl !== "event_invite") setEventId(null);
                if (tpl !== "coach_spotlight") {
                  setCoachUserId(null);
                  setCoachRowId(null);
                }
              }}
              style={[
                styles.templateChip,
                active && { backgroundColor: m.accent + "22", borderColor: m.accent },
              ]}
            >
              <Ionicons name={m.icon as IoniconName} size={14} color={active ? m.accent : Colors.dark.textMuted} />
              <Text style={[styles.templateChipText, active && { color: m.accent, fontWeight: "700" }]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.hint}>{meta.hint}</Text>

      <ThemedText style={styles.sectionLabel}>What&apos;s the message?</ThemedText>
      <View style={[styles.captionWrap, { borderColor: meta.accent + "55" }]}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder={meta.hint}
          placeholderTextColor={Colors.dark.textMuted}
          multiline
          maxLength={280}
          style={styles.captionInput}
        />
        <Text style={styles.charCount}>{caption.length}/280</Text>
      </View>

      {/* Photos: optional for tip / announcement / drill / coach_spotlight. */}
      <ThemedText style={styles.sectionLabel}>Photos (optional)</ThemedText>
      <View style={styles.imageRow}>
        {images.map((uri, idx) => (
          <View key={uri + idx} style={styles.imageThumbWrap}>
            <Image source={{ uri }} style={styles.imageThumb} />
            <Pressable onPress={() => handleRemoveImage(idx)} style={styles.imageRemove}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {images.length < MAX_IMAGES ? (
          <Pressable onPress={handlePickImages} style={styles.imageAddBtn}>
            <Ionicons name="camera" size={20} color={Colors.dark.textMuted} />
            <Text style={styles.imageAddText}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Event picker — only for event_invite. */}
      {template === "event_invite" ? (
        <>
          <ThemedText style={styles.sectionLabel}>Pick an event</ThemedText>
          {upcomingEvents.length === 0 ? (
            <Text style={styles.hint}>No upcoming events in the next 30 days.</Text>
          ) : (
            <View style={styles.pickerList}>
              {upcomingEvents.map((ev) => {
                const active = ev.id === eventId;
                const when = new Date(ev.startTime).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                });
                return (
                  <Pressable
                    key={ev.id}
                    onPress={() => setEventId(ev.id)}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                  >
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={active ? Colors.dark.primary : Colors.dark.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerTitle}>{ev.title || ev.sessionType || "Event"}</Text>
                      <Text style={styles.pickerSubtitle}>{when}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {/* Coach picker — only for coach_spotlight. */}
      {template === "coach_spotlight" ? (
        <>
          <ThemedText style={styles.sectionLabel}>Pick a coach</ThemedText>
          {academyCoaches.length === 0 ? (
            <Text style={styles.hint}>No coaches in this academy yet.</Text>
          ) : (
            <View style={styles.pickerList}>
              {academyCoaches.map((c) => {
                const active = c.id === coachRowId;
                const disabled = !c.userId;
                return (
                  <Pressable
                    key={c.id}
                    disabled={disabled}
                    onPress={() => {
                      setCoachRowId(c.id);
                      setCoachUserId(c.userId);
                    }}
                    style={[
                      styles.pickerRow,
                      active && styles.pickerRowActive,
                      disabled && { opacity: 0.4 },
                    ]}
                  >
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={active ? Colors.dark.primary : Colors.dark.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerTitle}>{c.name}</Text>
                      {c.specialty ? (
                        <Text style={styles.pickerSubtitle}>{c.specialty}</Text>
                      ) : null}
                      {disabled ? (
                        <Text style={styles.pickerSubtitle}>(no linked user account)</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {mode === "coach" ? (
        <>
          <ThemedText style={styles.sectionLabel}>Audience</ThemedText>
          <View style={styles.audienceRow}>
            <Pressable
              onPress={() => setAudience("academy")}
              style={[styles.audienceChip, audience === "academy" && styles.audienceChipActive]}
            >
              <Ionicons name="business" size={14} color={audience === "academy" ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.audienceText, audience === "academy" && styles.audienceTextActive]}>
                Whole academy
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAudience("group")}
              style={[styles.audienceChip, audience === "group" && styles.audienceChipActive]}
            >
              <Ionicons name="people" size={14} color={audience === "group" ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.audienceText, audience === "group" && styles.audienceTextActive]}>
                Specific group
              </Text>
            </Pressable>
          </View>

          {audience === "group" ? (
            <View style={styles.groupList}>
              {coachGroupOptions.length === 0 ? (
                <Text style={styles.hint}>You&apos;re not in any coaching groups yet.</Text>
              ) : (
                coachGroupOptions.map((g) => {
                  const active = g.id === groupId;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => setGroupId(g.id)}
                      style={[styles.groupRow, active && styles.groupRowActive]}
                    >
                      <Ionicons
                        name={active ? "radio-button-on" : "radio-button-off"}
                        size={18}
                        color={active ? Colors.dark.primary : Colors.dark.textMuted}
                      />
                      <Text style={styles.groupName}>{g.name}</Text>
                      <Text style={styles.groupCount}>{g.memberCount}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.pinRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.sectionLabel}>Pin to top</ThemedText>
          <Text style={styles.hint}>Pinned for up to 24 hours. Replaces any existing pin.</Text>
        </View>
        <Switch
          value={pinPost}
          onValueChange={setPinPost}
          trackColor={{ true: meta.accent, false: Colors.dark.backgroundSecondary }}
        />
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  postBtn: {
    color: Colors.dark.primary,
    fontWeight: "700",
    fontSize: 15,
    paddingHorizontal: Spacing.sm,
  },
  postBtnDisabled: {
    color: Colors.dark.textMuted,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  templateRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  templateChipText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  hint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  captionWrap: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    minHeight: 120,
  },
  captionInput: {
    color: Colors.dark.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 90,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    textAlign: "right",
    marginTop: 4,
  },
  imageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  imageThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    position: "relative",
  },
  imageThumb: {
    width: "100%",
    height: "100%",
  },
  imageRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  imageAddBtn: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  imageAddText: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  pickerList: {
    gap: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  pickerRowActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "0F",
  },
  pickerTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600",
  },
  pickerSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  audienceRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  audienceChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  audienceChipActive: {
    backgroundColor: Colors.dark.primary + "1A",
    borderColor: Colors.dark.primary,
  },
  audienceText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  audienceTextActive: {
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  groupList: {
    marginTop: Spacing.sm,
    gap: 8,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  groupRowActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "0F",
  },
  groupName: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
  },
  groupCount: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});
