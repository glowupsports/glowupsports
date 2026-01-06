import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface AcademyData {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
}

export default function AcademyProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<AcademyData>>({});

  const { data: academy, isLoading } = useQuery<AcademyData>({
    queryKey: ["/api/owner/academy"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<AcademyData>) => {
      return apiRequest("PATCH", "/api/owner/academy", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner/academy"] });
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleSave = () => {
    if (Object.keys(formData).length === 0) {
      setIsEditing(false);
      return;
    }
    updateMutation.mutate(formData);
  };

  const handleEdit = () => {
    setFormData({
      name: academy?.name || "",
      description: academy?.description || "",
      email: academy?.email || "",
      phone: academy?.phone || "",
      address: academy?.address || "",
      website: academy?.website || "",
      primaryColor: academy?.primaryColor || "#FFD700",
      secondaryColor: academy?.secondaryColor || "#00CED1",
    });
    setIsEditing(true);
  };

  const brandingColors = [
    { label: "Gold", value: "#FFD700" },
    { label: "Cyan", value: "#00CED1" },
    { label: "Purple", value: "#9B59B6" },
    { label: "Green", value: "#2ECC71" },
    { label: "Blue", value: "#3498DB" },
    { label: "Red", value: "#E74C3C" },
    { label: "Orange", value: "#F39C12" },
    { label: "Pink", value: "#E91E63" },
  ];

  const getColorLabel = (hex: string | undefined) => {
    const color = brandingColors.find(c => c.value === hex);
    return color ? color.label : "Custom";
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.title}>Academy Profile</Text>
        <Pressable 
          style={styles.actionButton} 
          onPress={isEditing ? handleSave : handleEdit}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.gold} />
          ) : (
            <Text style={styles.actionButtonText}>{isEditing ? "Save" : "Edit"}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[
          styles.logoSection, 
          CardStyles.elevated,
          isEditing && { borderWidth: 2, borderColor: formData.primaryColor || "#FFD700" }
        ]}>
          <View style={[
            styles.logoPlaceholder, 
            isEditing && { backgroundColor: `${formData.primaryColor || "#FFD700"}20` }
          ]}>
            <Ionicons 
              name="business" 
              size={48} 
              color={isEditing ? (formData.primaryColor || Colors.dark.gold) : Colors.dark.gold} 
            />
          </View>
          <Text style={[
            styles.academyName,
            isEditing && { color: formData.primaryColor || Colors.dark.gold }
          ]}>
            {isEditing ? (formData.name || "Your Academy") : (academy?.name || "Your Academy")}
          </Text>
          {isEditing ? (
            <View style={styles.previewBadge}>
              <View style={[styles.previewDot, { backgroundColor: formData.primaryColor || "#FFD700" }]} />
              <View style={[styles.previewDot, { backgroundColor: formData.secondaryColor || "#00CED1" }]} />
              <Text style={styles.previewText}>Live Preview</Text>
            </View>
          ) : (
            <Text style={styles.academyDescription}>
              {academy?.description || "Add a description for your academy"}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="business-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Academy Name</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="Academy Name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            ) : (
              <Text style={styles.fieldValue}>{academy?.name || "Not set"}</Text>
            )}
          </View>

          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="document-text-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Description</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Tell us about your academy..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
              />
            ) : (
              <Text style={styles.fieldValue}>{academy?.description || "Not set"}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          
          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="mail-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Email</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                placeholder="academy@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.fieldValue}>{academy?.email || "Not set"}</Text>
            )}
          </View>

          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="call-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Phone</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
                placeholder="+1 234 567 8900"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{academy?.phone || "Not set"}</Text>
            )}
          </View>

          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="location-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Address</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.address}
                onChangeText={(text) => setFormData(prev => ({ ...prev, address: text }))}
                placeholder="123 Tennis Court Lane..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={2}
              />
            ) : (
              <Text style={styles.fieldValue}>{academy?.address || "Not set"}</Text>
            )}
          </View>

          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="globe-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Website</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={formData.website}
                onChangeText={(text) => setFormData(prev => ({ ...prev, website: text }))}
                placeholder="https://www.example.com"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.fieldValue}>{academy?.website || "Not set"}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Branding</Text>
          
          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="color-palette-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Primary Color</Text>
            </View>
            {isEditing ? (
              <View style={styles.colorGrid}>
                {brandingColors.map((color) => (
                  <Pressable
                    key={color.value}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.value },
                      formData.primaryColor === color.value && styles.colorOptionSelected,
                    ]}
                    onPress={() => {
                      setFormData(prev => ({ ...prev, primaryColor: color.value }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    {formData.primaryColor === color.value ? (
                      <Ionicons name="checkmark" size={16} color="#000" />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.colorPreview}>
                <View style={[styles.colorSwatch, { backgroundColor: academy?.primaryColor || "#FFD700" }]} />
                <Text style={styles.fieldValue}>{getColorLabel(academy?.primaryColor || "#FFD700")}</Text>
              </View>
            )}
          </View>

          <View style={[styles.fieldCard, CardStyles.elevated]}>
            <View style={styles.fieldRow}>
              <Ionicons name="color-filter-outline" size={20} color={Colors.dark.gold} />
              <Text style={styles.fieldLabel}>Secondary Color</Text>
            </View>
            {isEditing ? (
              <View style={styles.colorGrid}>
                {brandingColors.map((color) => (
                  <Pressable
                    key={color.value}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.value },
                      formData.secondaryColor === color.value && styles.colorOptionSelected,
                    ]}
                    onPress={() => {
                      setFormData(prev => ({ ...prev, secondaryColor: color.value }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    {formData.secondaryColor === color.value ? (
                      <Ionicons name="checkmark" size={16} color="#000" />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.colorPreview}>
                <View style={[styles.colorSwatch, { backgroundColor: academy?.secondaryColor || "#00CED1" }]} />
                <Text style={styles.fieldValue}>{getColorLabel(academy?.secondaryColor || "#00CED1")}</Text>
              </View>
            )}
          </View>
        </View>

        {isEditing ? (
          <Pressable style={styles.cancelButton} onPress={() => setIsEditing(false)}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  centered: {
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
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
  },
  actionButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  actionButtonText: {
    ...Typography.body,
    color: Colors.dark.gold,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  logoSection: {
    alignItems: "center",
    padding: Spacing.xl,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${Colors.dark.gold}20`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  academyName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  academyDescription: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.full,
  },
  previewDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  previewText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.dark.gold,
    marginBottom: Spacing.xs,
  },
  fieldCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldValue: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  input: {
    ...Typography.body,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  cancelButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: Colors.dark.text,
  },
  colorPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
