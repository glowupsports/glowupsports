import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Permission {
  key: string;
  label: string;
  description: string;
}

interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string;
  permissions: Record<string, boolean>;
  isSystemRole: boolean;
}

const AVAILABLE_PERMISSIONS: Permission[] = [
  { key: "view_players", label: "View Players", description: "Can see player list and profiles" },
  { key: "edit_players", label: "Edit Players", description: "Can modify player information" },
  { key: "delete_players", label: "Delete Players", description: "Can remove players from academy" },
  { key: "view_sessions", label: "View Sessions", description: "Can see all session schedules" },
  { key: "create_sessions", label: "Create Sessions", description: "Can schedule new sessions" },
  { key: "edit_sessions", label: "Edit Sessions", description: "Can modify session details" },
  { key: "delete_sessions", label: "Delete Sessions", description: "Can cancel or remove sessions" },
  { key: "view_coaches", label: "View Coaches", description: "Can see coach list and profiles" },
  { key: "manage_coaches", label: "Manage Coaches", description: "Can add, edit, or remove coaches" },
  { key: "view_courts", label: "View Courts", description: "Can see court availability" },
  { key: "manage_courts", label: "Manage Courts", description: "Can add, edit, or remove courts" },
  { key: "view_reports", label: "View Reports", description: "Can access analytics and reports" },
  { key: "manage_billing", label: "Manage Billing", description: "Can handle payments and invoices" },
  { key: "send_notifications", label: "Send Notifications", description: "Can send push/email notifications" },
  { key: "manage_settings", label: "Manage Settings", description: "Can modify academy settings" },
];

const DEFAULT_ROLES: Role[] = [
  {
    id: "admin",
    name: "admin",
    displayName: "Admin",
    description: "Full access to all academy features",
    isSystemRole: true,
    permissions: {
      view_players: true,
      edit_players: true,
      delete_players: true,
      view_sessions: true,
      create_sessions: true,
      edit_sessions: true,
      delete_sessions: true,
      view_coaches: true,
      manage_coaches: true,
      view_courts: true,
      manage_courts: true,
      view_reports: true,
      manage_billing: true,
      send_notifications: true,
      manage_settings: true,
    },
  },
  {
    id: "coach",
    name: "coach",
    displayName: "Coach",
    description: "Can manage own sessions and view players",
    isSystemRole: true,
    permissions: {
      view_players: true,
      edit_players: false,
      delete_players: false,
      view_sessions: true,
      create_sessions: true,
      edit_sessions: true,
      delete_sessions: false,
      view_coaches: true,
      manage_coaches: false,
      view_courts: true,
      manage_courts: false,
      view_reports: false,
      manage_billing: false,
      send_notifications: true,
      manage_settings: false,
    },
  },
  {
    id: "assistant_coach",
    name: "assistant_coach",
    displayName: "Assistant Coach",
    description: "Limited coaching capabilities",
    isSystemRole: false,
    permissions: {
      view_players: true,
      edit_players: false,
      delete_players: false,
      view_sessions: true,
      create_sessions: false,
      edit_sessions: false,
      delete_sessions: false,
      view_coaches: true,
      manage_coaches: false,
      view_courts: true,
      manage_courts: false,
      view_reports: false,
      manage_billing: false,
      send_notifications: false,
      manage_settings: false,
    },
  },
  {
    id: "front_desk",
    name: "front_desk",
    displayName: "Front Desk",
    description: "Reception and scheduling support",
    isSystemRole: false,
    permissions: {
      view_players: true,
      edit_players: true,
      delete_players: false,
      view_sessions: true,
      create_sessions: true,
      edit_sessions: true,
      delete_sessions: false,
      view_coaches: true,
      manage_coaches: false,
      view_courts: true,
      manage_courts: false,
      view_reports: false,
      manage_billing: true,
      send_notifications: true,
      manage_settings: false,
    },
  },
];

export default function AdminRolesPermissionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isCompact = width < 600;
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>("coach");
  const [localRoles, setLocalRoles] = useState<Role[]>(DEFAULT_ROLES);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: rolesData, isLoading } = useQuery<{ roles: Role[] }>({
    queryKey: ["/api/admin/roles"],
  });

  useEffect(() => {
    if (rolesData?.roles) {
      setLocalRoles(rolesData.roles);
    }
  }, [rolesData]);

  const selectedRole = localRoles.find((r) => r.id === selectedRoleId);

  const saveMutation = useMutation({
    mutationFn: async (updatedRoles: Role[]) => {
      return apiRequest("PUT", "/api/admin/roles", { roles: updatedRoles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roles"] });
      setHasChanges(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        window.alert("Role permissions saved successfully!");
      } else {
        Alert.alert("Success", "Role permissions saved successfully!");
      }
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const handleTogglePermission = (permissionKey: string) => {
    if (!selectedRole) return;
    
    if (selectedRole.id === "admin") {
      if (Platform.OS === "web") {
        window.alert("Admin role permissions cannot be modified.");
      } else {
        Alert.alert("Info", "Admin role permissions cannot be modified.");
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const updatedRoles = localRoles.map((role) => {
      if (role.id === selectedRoleId) {
        return {
          ...role,
          permissions: {
            ...role.permissions,
            [permissionKey]: !role.permissions[permissionKey],
          },
        };
      }
      return role;
    });
    
    setLocalRoles(updatedRoles);
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(localRoles);
  };

  const handleBack = () => {
    if (hasChanges) {
      if (Platform.OS === "web") {
        if (window.confirm("You have unsaved changes. Discard them?")) {
          navigation.goBack();
        }
      } else {
        Alert.alert(
          "Unsaved Changes",
          "You have unsaved changes. Discard them?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Discard", style: "destructive", onPress: () => navigation.goBack() },
          ]
        );
      }
    } else {
      navigation.goBack();
    }
  };

  const getRoleIcon = (roleId: string) => {
    switch (roleId) {
      case "admin":
        return "shield-checkmark";
      case "coach":
        return "fitness";
      case "assistant_coach":
        return "person";
      case "front_desk":
        return "desktop";
      default:
        return "people";
    }
  };

  const getPermissionCount = (role: Role) => {
    return Object.values(role.permissions).filter(Boolean).length;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Roles & Permissions</Text>
        <Pressable
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <Text style={[styles.saveButtonText, !hasChanges && styles.saveButtonTextDisabled]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.content, isCompact && styles.contentCompact]}>
        <View style={[styles.rolesColumn, isCompact && styles.rolesColumnCompact]}>
          <Text style={styles.columnTitle}>Roles</Text>
          <ScrollView 
            horizontal={isCompact} 
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={isCompact ? styles.rolesScrollCompact : undefined}
          >
            {localRoles.map((role) => (
              <Pressable
                key={role.id}
                style={[
                  styles.roleCard,
                  isCompact && styles.roleCardCompact,
                  selectedRoleId === role.id && styles.roleCardSelected,
                ]}
                onPress={() => {
                  setSelectedRoleId(role.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View style={styles.roleIconContainer}>
                  <Ionicons
                    name={getRoleIcon(role.id) as any}
                    size={20}
                    color={selectedRoleId === role.id ? Colors.dark.orange : Colors.dark.textSecondary}
                  />
                </View>
                <View style={styles.roleInfo}>
                  <Text
                    style={[
                      styles.roleName,
                      selectedRoleId === role.id && styles.roleNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {role.displayName}
                  </Text>
                  {!isCompact ? (
                    <Text style={styles.rolePermissionCount}>
                      {getPermissionCount(role)} of {AVAILABLE_PERMISSIONS.length} permissions
                    </Text>
                  ) : null}
                </View>
                {role.isSystemRole && !isCompact ? (
                  <View style={styles.systemBadge}>
                    <Text style={styles.systemBadgeText}>System</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.permissionsColumn, isCompact && styles.permissionsColumnCompact]}>
          <Text style={styles.columnTitle}>
            {selectedRole ? `${selectedRole.displayName} Permissions` : "Select a Role"}
          </Text>
          {selectedRole && (
            <Text style={styles.roleDescription}>{selectedRole.description}</Text>
          )}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.permissionsList}
          >
            {selectedRole ? (
              AVAILABLE_PERMISSIONS.map((permission) => (
                <View key={permission.key} style={styles.permissionItem}>
                  <View style={styles.permissionInfo}>
                    <Text style={styles.permissionLabel}>{permission.label}</Text>
                    <Text style={styles.permissionDescription}>{permission.description}</Text>
                  </View>
                  <Switch
                    value={selectedRole.permissions[permission.key] || false}
                    onValueChange={() => handleTogglePermission(permission.key)}
                    trackColor={{
                      false: Colors.dark.backgroundDefault,
                      true: Colors.dark.orange,
                    }}
                    thumbColor={
                      selectedRole.permissions[permission.key]
                        ? Colors.dark.text
                        : Colors.dark.textSecondary
                    }
                    disabled={selectedRole.id === "admin"}
                  />
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="shield-outline" size={48} color={Colors.dark.textSecondary} />
                <Text style={styles.emptyStateText}>Select a role to view and edit permissions</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
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
    borderRadius: 20,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.dark.text,
  },
  saveButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
    minWidth: 70,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: Colors.dark.backgroundDefault,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.buttonText,
  },
  saveButtonTextDisabled: {
    color: Colors.dark.textSecondary,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  contentCompact: {
    flexDirection: "column",
  },
  rolesColumn: {
    width: "35%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  rolesColumnCompact: {
    width: "100%",
    maxHeight: 140,
  },
  rolesScrollCompact: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  permissionsColumn: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  permissionsColumnCompact: {
    flex: 1,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  roleDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  roleCardCompact: {
    marginBottom: 0,
    marginRight: Spacing.sm,
    minWidth: 120,
  },
  roleCardSelected: {
    backgroundColor: "rgba(255,152,0,0.15)",
    borderWidth: 1,
    borderColor: Colors.dark.orange,
  },
  roleIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: Colors.dark.text,
  },
  roleNameSelected: {
    color: Colors.dark.orange,
  },
  rolePermissionCount: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  systemBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: "rgba(255,152,0,0.2)",
    borderRadius: BorderRadius.sm,
  },
  systemBadgeText: {
    fontSize: 10,
    fontWeight: "500" as const,
    color: Colors.dark.orange,
  },
  permissionsList: {
    paddingBottom: Spacing.lg,
  },
  permissionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  permissionInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  permissionLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: Colors.dark.text,
  },
  permissionDescription: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
    textAlign: "center",
  },
});
