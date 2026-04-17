import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
} from "react-native";
import { useDesktop } from "@/hooks/useDesktop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { formatCredits } from "@/lib/dateUtils";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import CreditStoreModal from "@/admin/components/CreditStoreModal";
import { GLOW_UP_TENNIS_LOGO } from "@/admin/components/logoBase64";
import { styles } from "@/admin/components/players/adminPlayersStyles";
import { generateAttendanceReportPDF, StatItem, SkillBar } from "@/admin/components/players/AdminPlayerHelpers";
import { AdminPlayerDetailModal } from "@/admin/components/players/AdminPlayerDetailModal";
import { AdminInlinePlayerProfile } from "@/admin/components/players/AdminInlinePlayerProfile";
import { AdminAddPlayerModal } from "@/admin/components/players/AdminAddPlayerModal";

type SortOption = "name_asc" | "name_desc" | "level_high" | "level_low" | "newest" | "not_activated";
type Player = { id: string; name: string; email?: string | null; phone?: string | null; ballLevel?: string; level?: number; coachName?: string; age?: number; dateOfBirth?: string; parentName?: string; parentPhone?: string; isActive?: boolean; status?: string; remainingCredits?: number; creditsByType?: Record<string, number>; onboardingCompleted?: boolean; createdAt?: string; lastSessionDate?: string | null };
type PlayerPackage = {
  id: string;
  creditType: string;
  totalCredits: number;
  remainingCredits: string | number;
  status: string;
  expiryDate: string | null;
  createdAt: string;
  pricePerCredit: number;
  isPaid: boolean;
  price: number;
};
type PlayerSessionItem = {
  id: string;
  sessionId?: string;
  startTime: string;
  endTime?: string;
  sessionType: string;
  attended?: string;
  attendanceStatus?: string | null;
  status?: string | null;
  courtId?: string | null;
  creditsUsed?: number;
  isPaid?: boolean;
  seriesId?: string | null;
  seriesName?: string | null;
};
type PlayerStats = {
  player: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    ballLevel?: string;
    level?: number;
    totalXp?: number;
    glowScore?: number;
    coachName?: string;
    parentName?: string;
    parentPhone?: string;
    medicalNotes?: string;
  };
  attendance: { totalSessions: number; attended: number; missed: number; rate: number; streak: number };
  progress: {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: { technical: number; tactical: number; physical: number; mental: number; social: number };
    recentMilestones: string[];
  };
  payments: {
    totalOwed: number;
    totalPaid: number;
    lastPaymentDate?: string;
    status: string;
    currency: string;
    invoices: { id: string; invoiceNumber?: string; amount: number; currency: string; status: string; dueDate?: string; paidAt?: string; createdAt: string; notes?: string; isOverdue: boolean }[];
  };
  credits: { total: number; group: number; semiPrivate: number; private: number; activePackages: number; totalDebt: number; hasDebt: boolean };
  packages: PlayerPackage[];
  sessions: PlayerSessionItem[];
};
type Coach = { id: string; name: string };

export default function AdminPlayersScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFullDetailsModal, setShowFullDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [invitePopoverPlayer, setInvitePopoverPlayer] = useState<{ id: string; name: string } | null>(null);
  const [invitePopoverCopied, setInvitePopoverCopied] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [showCreditStoreModal, setShowCreditStoreModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [selectedPackageForPayment, setSelectedPackageForPayment] = useState<PlayerPackage | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("cash");
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [ballLevelFilter, setBallLevelFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hasEmailFilter, setHasEmailFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [selectedSeriesFilter, setSelectedSeriesFilter] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    ballLevel: "green",
    parentName: "",
    parentPhone: "",
    dateOfBirth: "",
  });

  const { data: players = [], isLoading, error, refetch } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
  });

  // Used by the Rebuild button so platform_owner can supply academyId explicitly.
  const { data: currentUser } = useQuery<{ id: string; role: string; academyId?: string }>({
    queryKey: ["/api/me"],
  });

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: playerStats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery<PlayerStats>({
    queryKey: ["/api/admin/players", selectedPlayerId, "stats"],
    enabled: !!selectedPlayerId && (showDetailModal || showFullDetailsModal),
  });

  const { data: playerInvite, isLoading: inviteLoading, isError: inviteError, refetch: refetchInvite } = useQuery<{ 
    inviteCode: string; 
    status: string;
  }>({
    queryKey: [`/api/players/${selectedPlayerId}/invite`],
    enabled: !!selectedPlayerId && (showDetailModal || showFullDetailsModal),
    retry: 2,
    retryDelay: 1000,
  });

  const selectedPlayer = players.find(p => p.id === selectedPlayerId);
  const uniqueSeries = useMemo(() => {
    if (!playerStats?.sessions) return [];
    const seriesMap = new Map();
    playerStats.sessions.forEach((s: PlayerSessionItem) => {
      if (s.seriesName && s.seriesId) {
        seriesMap.set(s.seriesId, s.seriesName);
      }
    });
    return Array.from(seriesMap.entries()).map(([id, name]) => ({ id, name }));
  }, [playerStats?.sessions]);

  const filteredSessions = useMemo(() => {
    if (!playerStats?.sessions) return [];
    return selectedSeriesFilter 
      ? playerStats.sessions.filter((s: PlayerSessionItem) => s.seriesId === selectedSeriesFilter)
      : playerStats.sessions;
  }, [playerStats?.sessions, selectedSeriesFilter]);

  const addPlayerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/players", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/players/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowAddModal(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return apiRequest("DELETE", `/api/admin/players/${playerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      setShowDeleteModal(false);
      closeDetailModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(`Failed to delete player: ${err.message}`);
      } else {
        Alert.alert("Error", `Failed to delete player: ${err.message}`);
      }
    },
  });

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", ballLevel: "green", parentName: "", parentPhone: "", dateOfBirth: "" });
    setEditingPlayer(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const togglePlayerExpansion = (playerId: string) => {
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      setShowDetailModal(false);
    } else {
      setSelectedPlayerId(playerId);
      setShowDetailModal(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openDetailModal = (playerId: string) => {
    togglePlayerExpansion(playerId);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedPlayerId(null);
    setInviteCopied(false);
  };

  const handleCopyInviteCode = async () => {
    if (playerInvite?.inviteCode) {
      await Clipboard.setStringAsync(playerInvite.inviteCode);
      setInviteCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setInviteCopied(false), 3000);
    }
  };

  const regenerateInviteCodeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlayerId) throw new Error("No player selected");
      const res = await apiRequest("POST", `/api/players/${selectedPlayerId}/invite/regenerate`);
      return res.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (selectedPlayerId) {
        queryClient.invalidateQueries({ queryKey: [`/api/players/${selectedPlayerId}/invite`] });
      }
    },
    onError: () => {
      Alert.alert("Error", "Could not generate new code. Try again.");
    },
  });

  const fullCreditRebuildMutation = useMutation({
    mutationFn: async () => {
      // Send academyId in body so platform_owner (who has no req.user.academyId)
      // can still trigger the rebuild for the academy they're currently viewing.
      const academyId = currentUser?.academyId;
      const startedAt = Date.now();
      const res = await apiRequest("POST", "/api/admin/full-credit-rebuild", { academyId });
      const json = await res.json();
      return { ...json, _elapsedMs: Date.now() - startedAt };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players?withCredits=true"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const consumed = data.consumed || 0;
      const debts = data.debts || 0;
      const players = data.playersProcessed || 0;
      const errors = (data.errors && data.errors.length) || 0;
      const elapsed = data._elapsedMs || 0;
      const fast = elapsed < 100;
      let msg = `${consumed} package deductions, ${debts} debt transactions across ${players} players.`;
      if (errors > 0) msg += `\n\n${errors} error(s) — check server log.`;
      if (fast) {
        msg += `\n\nResponse in ${elapsed}ms — if no [FullCreditRebuild] entries appear in the server log, the endpoint exited early. Check console.`;
        console.warn("[FullCreditRebuild] Suspicious fast response:", data);
      } else {
        console.log("[FullCreditRebuild] Result:", data);
      }
      if (Platform.OS === "web") {
        window.alert(`Rebuild complete. ${msg}`);
      } else {
        Alert.alert("Rebuild Complete", msg);
      }
    },
    onError: (err: Error) => {
      console.error("[FullCreditRebuild] Failed:", err);
      const message = err?.message || "Failed to rebuild credits";
      if (Platform.OS === "web") {
        window.alert(`Rebuild failed: ${message}`);
      } else {
        Alert.alert("Rebuild Failed", message);
      }
    },
  });

  const handleFullCreditRebuild = () => {
    const confirm = () => fullCreditRebuildMutation.mutate();
    if (Platform.OS === "web") {
      if (window.confirm("This will RESET all credit transactions for every player and recalculate from scratch based on actual session attendance. This cannot be undone. Continue?")) {
        confirm();
      }
    } else {
      Alert.alert(
        "Rebuild All Credits",
        "This will RESET all credit transactions for every player and recalculate from scratch based on actual session attendance.\n\nThis cannot be undone. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Rebuild", style: "destructive", onPress: confirm },
        ]
      );
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter player name");
      } else {
        Alert.alert("Error", "Please enter player name");
      }
      return;
    }
    if (editingPlayer) {
      updatePlayerMutation.mutate({ id: editingPlayer.id, data: formData });
    } else {
      addPlayerMutation.mutate(formData);
    }
  };

  const handleDelete = () => {
    if (!selectedPlayerId) return;
    setShowDeleteModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmDelete = () => {
    if (!selectedPlayerId) return;
    deletePlayerMutation.mutate(selectedPlayerId);
  };

  const getBallLevelColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case "blue": return "#3B82F6";
      case "red": return "#EF4444";
      case "orange": return "#F97316";
      case "green": return "#22C55E";
      case "yellow": return "#EAB308";
      case "adult":
      case "glow": return "#00E5FF"; // Cyan for adult players
      default: return Colors.dark.textMuted;
    }
  };

  const getPaymentStatusColor = (status?: string) => {
    switch (status) {
      case "paid": return Colors.dark.successNeon;
      case "partial": return Colors.dark.orange;
      case "overdue": return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

  const getPlayerAge = (player: Player): number | null => {
    if (player.age) return player.age;
    if (player.dateOfBirth) {
      const birthDate = new Date(player.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }
    return null;
  };

  const filteredPlayers = players
    .filter((player) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (player.name ?? "").toLowerCase().includes(searchLower) ||
        (player.email ?? "").toLowerCase().includes(searchLower);
      const matchesBall = ballLevelFilter === "all" || player.ballLevel?.toLowerCase() === ballLevelFilter;
      const matchesLevel = levelFilter === "all" || 
        (levelFilter === "1-3" && (player.level || 1) <= 3) ||
        (levelFilter === "4-6" && (player.level || 1) >= 4 && (player.level || 1) <= 6) ||
        (levelFilter === "7-10" && (player.level || 1) >= 7);
      const playerAge = getPlayerAge(player);
      const matchesAge = ageGroupFilter === "all" || 
        (ageGroupFilter === "u8" && playerAge !== null && playerAge < 8) ||
        (ageGroupFilter === "u10" && playerAge !== null && playerAge >= 8 && playerAge < 10) ||
        (ageGroupFilter === "u12" && playerAge !== null && playerAge >= 10 && playerAge < 12) ||
        (ageGroupFilter === "u14" && playerAge !== null && playerAge >= 12 && playerAge < 14) ||
        (ageGroupFilter === "u16" && playerAge !== null && playerAge >= 14 && playerAge < 16) ||
        (ageGroupFilter === "adult" && playerAge !== null && playerAge >= 16);
      const matchesCoach = coachFilter === "all" || player.coachName === coachFilter;
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "active" && (player.isActive !== false && player.status !== "inactive")) ||
        (statusFilter === "inactive" && (player.isActive === false || player.status === "inactive"));
      const matchesEmail = hasEmailFilter === "all" ||
        (hasEmailFilter === "with" && player.email && player.email.length > 0) ||
        (hasEmailFilter === "without" && (!player.email || player.email.length === 0));
      return matchesSearch && matchesBall && matchesLevel && matchesAge && matchesCoach && matchesStatus && matchesEmail;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name_asc":
          return (a.name || "").localeCompare(b.name || "");
        case "name_desc":
          return (b.name || "").localeCompare(a.name || "");
        case "level_high":
          return (b.level || 0) - (a.level || 0);
        case "level_low":
          return (a.level || 0) - (b.level || 0);
        case "newest":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "not_activated":
          const aActivated = a.onboardingCompleted ? 1 : 0;
          const bActivated = b.onboardingCompleted ? 1 : 0;
          if (aActivated !== bActivated) return aActivated - bActivated;
          return (a.name || "").localeCompare(b.name || "");
        default:
          return 0;
      }
    });

  const activeFilterCount = [
    ballLevelFilter !== "all",
    levelFilter !== "all",
    ageGroupFilter !== "all",
    coachFilter !== "all",
    statusFilter !== "all",
    hasEmailFilter !== "all",
    sortBy !== "name_asc",
  ].filter(Boolean).length;

  const getCreditsColor = (remaining?: number, total?: number) => {
    if (!remaining || !total || total === 0) return Colors.dark.textMuted;
    const ratio = remaining / total;
    if (ratio <= 0.2) return Colors.dark.error;
    if (ratio <= 0.5) return Colors.dark.orange;
    return Colors.dark.successNeon;
  };

  const renderPlayer = ({ item }: { item: Player }) => {
    const credits = item.remainingCredits;
    const byType = item.creditsByType;
    const ballColor = getBallLevelColor(item.ballLevel);

    const getCreditTypeColor = (val: number) =>
      val < 0 ? Colors.dark.error
      : val === 0 ? Colors.dark.error
      : val <= 2 ? Colors.dark.gold
      : "#22c55e";

    const overallCreditColor = credits === undefined ? Colors.dark.textMuted : getCreditTypeColor(credits);

    const creditParts = (() => {
      if (credits === undefined) return [{ text: "No pkg", color: Colors.dark.textMuted }];
      if (!byType) return [{ text: credits === 0 ? "0 credits" : `${formatCredits(credits)}`, color: getCreditTypeColor(credits) }];
      const parts: { text: string; color: string }[] = [];
      if (byType.private !== 0) parts.push({ text: `${formatCredits(byType.private)} Prv`, color: getCreditTypeColor(byType.private) });
      if (byType.group !== 0) parts.push({ text: `${formatCredits(byType.group)} Grp`, color: getCreditTypeColor(byType.group) });
      if (byType.semiPrivate !== 0) parts.push({ text: `${formatCredits(byType.semiPrivate)} Semi`, color: getCreditTypeColor(byType.semiPrivate) });
      return parts.length > 0 ? parts : [{ text: "0 credits", color: Colors.dark.error }];
    })();

    return (
      <Pressable
        style={[styles.playerCard, CardStyles.elevated]}
        onPress={() => togglePlayerExpansion(item.id)}
      >
        <View style={styles.playerCardTop}>
          <View style={[styles.playerAvatar, { borderColor: ballColor }]}>
            <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase() || "?"}</Text>
          </View>
          <View style={styles.playerInfo}>
            <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.playerEmail} numberOfLines={1}>{item.email || "No email"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
        </View>
        <View style={styles.playerCardBottom}>
          <View style={[styles.ballBadge, { backgroundColor: `${ballColor}20` }]}>
            <View style={[styles.ballDot, { backgroundColor: ballColor }]} />
            <Text style={[styles.ballText, { color: ballColor }]}>{item.ballLevel || "N/A"}</Text>
          </View>
          {item.level ? <Text style={styles.levelText}>Lvl {item.level}</Text> : null}
          {item.coachName ? <Text style={styles.coachText} numberOfLines={1}>{item.coachName}</Text> : null}
          <View style={{ flex: 1 }} />
          <View style={[styles.creditsBadge, { backgroundColor: overallCreditColor + "20" }]}>
            <Ionicons name="ticket-outline" size={11} color={overallCreditColor} />
            {creditParts.map((p, i) => (
              <Text key={i} style={[styles.creditsText, { color: p.color }]}>
                {i > 0 ? " | " : ""}{p.text}
              </Text>
            ))}
          </View>
          {!item.onboardingCompleted ? (
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.dark.orange + "25", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.dark.orange + "50" }}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInvitePopoverCopied(false);
                setInvitePopoverPlayer({ id: item.id, name: item.name });
              }}
            >
              <Ionicons name="time-outline" size={9} color={Colors.dark.orange} />
              <Text style={{ fontSize: 9, fontWeight: "700", color: Colors.dark.orange, letterSpacing: 0.3 }}>Awaiting signup</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#22c55e18", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#22c55e" }} />
              <Text style={{ fontSize: 9, fontWeight: "700", color: "#22c55e", letterSpacing: 0.3 }}>App active</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };


  const isDesktop = useDesktop();
  const [desktopSelectedId, setDesktopSelectedId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<"name" | "ballLevel" | "credits" | "coach" | "lastSession">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [creditStatusFilter, setCreditStatusFilter] = useState<"all" | "has" | "none">("all");

  const desktopSortedPlayers = useMemo(() => {
    return [...filteredPlayers]
      .filter((p) => {
        if (creditStatusFilter === "has") return (p.remainingCredits ?? 0) > 0;
        if (creditStatusFilter === "none") return (p.remainingCredits ?? 0) <= 0;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortCol === "name") cmp = (a.name || "").localeCompare(b.name || "");
        else if (sortCol === "ballLevel") cmp = (a.ballLevel || "").localeCompare(b.ballLevel || "");
        else if (sortCol === "credits") cmp = (a.remainingCredits || 0) - (b.remainingCredits || 0);
        else if (sortCol === "coach") cmp = (a.coachName || "").localeCompare(b.coachName || "");
        else if (sortCol === "lastSession") cmp = (a.lastSessionDate ?? "").localeCompare(b.lastSessionDate ?? "");
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [filteredPlayers, sortCol, sortDir, creditStatusFilter]);

  const handleDesktopSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const toggleBulk = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkExport = () => {
    const selected = desktopSortedPlayers.filter((p) => bulkSelected.has(p.id));
    const csv = ["Name,Email,Ball Level,Credits"]
      .concat(selected.map((p) => `${p.name},${p.email ?? ""},${p.ballLevel ?? ""},${p.remainingCredits ?? 0}`))
      .join("\n");
    Clipboard.setStringAsync(csv);
    if (Platform.OS === "web") {
      window.alert(`Copied ${selected.length} player records to clipboard as CSV`);
    } else {
      Alert.alert("Exported", `${selected.length} player records copied to clipboard`);
    }
  };

  const handleBulkMessage = () => {
    const selected = desktopSortedPlayers.filter((p) => bulkSelected.has(p.id));
    const names = selected.map((p) => p.name).join(", ");
    if (Platform.OS === "web") {
      window.alert(`Open each player profile to send a message. Selected: ${names}`);
    } else {
      Alert.alert("Send Message", `Open each player profile to send a message. Selected: ${names}`);
    }
  };

  const handleBulkAddCredits = () => {
    const count = bulkSelected.size;
    if (Platform.OS === "web") {
      window.alert(`Open each player profile to add credits. ${count} player(s) selected.`);
    } else {
      Alert.alert("Add Credits", `Open each player profile to add credits. ${count} player(s) selected.`);
    }
  };

  const desktopSelectedPlayer = desktopSortedPlayers.find((p) => p.id === desktopSelectedId) ?? null;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isDesktop ? 0 : insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: isDesktop ? 0 : insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load players</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (isDesktop) {
    const SortIcon = ({ col }: { col: typeof sortCol }) => (
      <Ionicons
        name={sortCol === col ? (sortDir === "asc" ? "chevron-up" : "chevron-down") : "swap-vertical-outline"}
        size={12}
        color={sortCol === col ? "#C8FF3D" : Colors.dark.textMuted}
        style={{ marginLeft: 4 }}
      />
    );

    return (
      <View style={dtStyles.root}>
        <View style={dtStyles.toolbar}>
          <View style={dtStyles.searchWrap}>
            <Ionicons name="search" size={16} color={Colors.dark.textMuted} />
            <TextInput
              style={dtStyles.searchInput}
              placeholder="Search players..."
              placeholderTextColor={Colors.dark.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <View style={dtStyles.filterChipsRow}>
            <Text style={dtStyles.filterGroupLabel}>Ball:</Text>
            {["all", "red", "orange", "green", "yellow"].map((b) => (
              <Pressable
                key={b}
                style={[dtStyles.chip, ballLevelFilter === b && dtStyles.chipActive]}
                onPress={() => setBallLevelFilter(b)}
              >
                <Text style={[dtStyles.chipText, ballLevelFilter === b && dtStyles.chipTextActive]}>
                  {b === "all" ? "All" : b.charAt(0).toUpperCase() + b.slice(1)}
                </Text>
              </Pressable>
            ))}
            <Text style={[dtStyles.filterGroupLabel, { marginLeft: 8 }]}>Credits:</Text>
            {(["all", "has", "none"] as const).map((c) => (
              <Pressable
                key={c}
                style={[dtStyles.chip, creditStatusFilter === c && dtStyles.chipActive]}
                onPress={() => setCreditStatusFilter(c)}
              >
                <Text style={[dtStyles.chipText, creditStatusFilter === c && dtStyles.chipTextActive]}>
                  {c === "all" ? "Any" : c === "has" ? "Has Credits" : "No Credits"}
                </Text>
              </Pressable>
            ))}
            {coaches.length > 0 ? (
              <>
                <Text style={[dtStyles.filterGroupLabel, { marginLeft: 8 }]}>Coach:</Text>
                <Pressable
                  style={[dtStyles.chip, coachFilter === "all" && dtStyles.chipActive]}
                  onPress={() => setCoachFilter("all")}
                >
                  <Text style={[dtStyles.chipText, coachFilter === "all" && dtStyles.chipTextActive]}>All</Text>
                </Pressable>
                {coaches.slice(0, 4).map((coach: Coach) => (
                  <Pressable
                    key={coach.id}
                    style={[dtStyles.chip, coachFilter === coach.name && dtStyles.chipActive]}
                    onPress={() => setCoachFilter(coach.name)}
                  >
                    <Text style={[dtStyles.chipText, coachFilter === coach.name && dtStyles.chipTextActive]} numberOfLines={1}>
                      {coach.name.split(" ")[0]}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
          </View>
          <Text style={dtStyles.countText}>
            {desktopSortedPlayers.length} of {players.length} players
          </Text>
          <Pressable
            onPress={handleFullCreditRebuild}
            disabled={fullCreditRebuildMutation.isPending}
            style={[dtStyles.addBtn, { backgroundColor: `${Colors.dark.error}18`, borderWidth: 1, borderColor: `${Colors.dark.error}40` }]}
          >
            {fullCreditRebuildMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.error} />
            ) : (
              <Ionicons name="refresh-circle-outline" size={14} color={Colors.dark.error} />
            )}
            <Text style={[dtStyles.addBtnText, { color: Colors.dark.error }]}>
              {fullCreditRebuildMutation.isPending ? "Rebuilding..." : "Rebuild Credits"}
            </Text>
          </Pressable>
          <Pressable style={dtStyles.addBtn} onPress={openAddModal}>
            <Ionicons name="add" size={16} color="#0B0D10" />
            <Text style={dtStyles.addBtnText}>Add Player</Text>
          </Pressable>
        </View>

        {bulkSelected.size > 0 ? (
          <View style={dtStyles.bulkBar}>
            <Text style={dtStyles.bulkText}>{bulkSelected.size} selected</Text>
            <Pressable style={dtStyles.bulkAction} onPress={() => setBulkSelected(new Set())}>
              <Ionicons name="close" size={14} color={Colors.dark.textMuted} />
              <Text style={dtStyles.bulkActionText}>Clear</Text>
            </Pressable>
            <Pressable style={dtStyles.bulkAction} onPress={handleBulkMessage}>
              <Ionicons name="mail-outline" size={14} color={Colors.dark.xpCyan} />
              <Text style={[dtStyles.bulkActionText, { color: Colors.dark.xpCyan }]}>Send message</Text>
            </Pressable>
            <Pressable style={dtStyles.bulkAction} onPress={handleBulkAddCredits}>
              <Ionicons name="ticket-outline" size={14} color={Colors.dark.primary} />
              <Text style={[dtStyles.bulkActionText, { color: Colors.dark.primary }]}>Add credits</Text>
            </Pressable>
            <Pressable style={dtStyles.bulkAction} onPress={handleBulkExport}>
              <Ionicons name="download-outline" size={14} color={Colors.dark.gold} />
              <Text style={[dtStyles.bulkActionText, { color: Colors.dark.gold }]}>Export</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={dtStyles.tableArea}>
          <ScrollView style={dtStyles.tableScroll} showsVerticalScrollIndicator={false}>
            <View style={dtStyles.tableHeader}>
              <View style={[dtStyles.thCell, dtStyles.colCheck]}>
                <Pressable
                  onPress={() => {
                    if (bulkSelected.size === desktopSortedPlayers.length && desktopSortedPlayers.length > 0) {
                      setBulkSelected(new Set());
                    } else {
                      setBulkSelected(new Set(desktopSortedPlayers.map((p) => p.id)));
                    }
                  }}
                >
                  <View style={[dtStyles.checkbox, bulkSelected.size === desktopSortedPlayers.length && desktopSortedPlayers.length > 0 && dtStyles.checkboxChecked]}>
                    {bulkSelected.size === desktopSortedPlayers.length && desktopSortedPlayers.length > 0 ? (
                      <Ionicons name="checkmark" size={10} color="#0B0D10" />
                    ) : null}
                  </View>
                </Pressable>
              </View>
              <Pressable style={[dtStyles.thCell, dtStyles.colName, dtStyles.thPressable]} onPress={() => handleDesktopSort("name")}>
                <Text style={dtStyles.thText}>Name</Text>
                <SortIcon col="name" />
              </Pressable>
              <Pressable style={[dtStyles.thCell, dtStyles.colBall, dtStyles.thPressable]} onPress={() => handleDesktopSort("ballLevel")}>
                <Text style={dtStyles.thText}>Ball Level</Text>
                <SortIcon col="ballLevel" />
              </Pressable>
              <Pressable style={[dtStyles.thCell, dtStyles.colCredits, dtStyles.thPressable]} onPress={() => handleDesktopSort("credits")}>
                <Text style={dtStyles.thText}>Credits</Text>
                <SortIcon col="credits" />
              </Pressable>
              <Pressable style={[dtStyles.thCell, dtStyles.colCoach, dtStyles.thPressable]} onPress={() => handleDesktopSort("coach")}>
                <Text style={dtStyles.thText}>Coach</Text>
                <SortIcon col="coach" />
              </Pressable>
              <Pressable style={[dtStyles.thCell, dtStyles.colLastSession, dtStyles.thPressable]} onPress={() => handleDesktopSort("lastSession")}>
                <Text style={dtStyles.thText}>Last Session</Text>
                <SortIcon col="lastSession" />
              </Pressable>
              <View style={[dtStyles.thCell, dtStyles.colStatus]}>
                <Text style={dtStyles.thText}>Status</Text>
              </View>
              <View style={[dtStyles.thCell, dtStyles.colActions]}>
                <Text style={dtStyles.thText}>Actions</Text>
              </View>
            </View>

            {desktopSortedPlayers.map((player) => {
              const ballColor = getBallLevelColor(player.ballLevel);
              const credits = player.remainingCredits;
              const isActive = player.isActive !== false && player.status !== "inactive";
              const isRowSelected = desktopSelectedId === player.id;
              const isChecked = bulkSelected.has(player.id);
              const initials = player.name?.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") ?? "?";

              return (
                <Pressable
                  key={player.id}
                  style={[dtStyles.tableRow, isRowSelected && dtStyles.tableRowSelected]}
                  onPress={() => setDesktopSelectedId(isRowSelected ? null : player.id)}
                >
                  <View style={[dtStyles.tdCell, dtStyles.colCheck]}>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); toggleBulk(player.id); }}
                      style={[dtStyles.checkbox, isChecked && dtStyles.checkboxChecked]}
                    >
                      {isChecked ? <Ionicons name="checkmark" size={10} color="#0B0D10" /> : null}
                    </Pressable>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colName]}>
                    <View style={[dtStyles.playerAvatar, { borderColor: ballColor }]}>
                      <Text style={dtStyles.avatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dtStyles.playerName} numberOfLines={1}>{player.name}</Text>
                      <Text style={dtStyles.playerEmail} numberOfLines={1}>{player.email || "No email"}</Text>
                    </View>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colBall]}>
                    <View style={[dtStyles.ballBadge, { backgroundColor: `${ballColor}20` }]}>
                      <View style={[dtStyles.ballDot, { backgroundColor: ballColor }]} />
                      <Text style={[dtStyles.ballText, { color: ballColor }]}>
                        {player.ballLevel ? player.ballLevel.charAt(0).toUpperCase() + player.ballLevel.slice(1) : "N/A"}
                      </Text>
                    </View>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colCredits]}>
                    <Text style={{ color: credits !== undefined && credits > 0 ? "#22c55e" : Colors.dark.error, fontSize: 13, fontWeight: "600" }}>
                      {credits ?? "—"}
                    </Text>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colCoach]}>
                    <Text style={{ color: Colors.dark.textSecondary, fontSize: 13 }} numberOfLines={1}>
                      {player.coachName || "—"}
                    </Text>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colLastSession]}>
                    <Text style={{ color: Colors.dark.textMuted, fontSize: 12 }} numberOfLines={1}>
                      {player.lastSessionDate
                        ? new Date(player.lastSessionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : "—"}
                    </Text>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colStatus]}>
                    <View style={[dtStyles.statusBadge, { backgroundColor: isActive ? "#22c55e20" : "#ff4d4d20" }]}>
                      <View style={[dtStyles.statusDot, { backgroundColor: isActive ? "#22c55e" : "#ff4d4d" }]} />
                      <Text style={[dtStyles.statusText, { color: isActive ? "#22c55e" : "#ff4d4d" }]}>
                        {isActive ? "Active" : "Inactive"}
                      </Text>
                    </View>
                  </View>
                  <View style={[dtStyles.tdCell, dtStyles.colActions]}>
                    <Pressable
                      style={dtStyles.rowAction}
                      onPress={(e) => { e.stopPropagation(); setSelectedPlayerId(player.id); setShowCreditStoreModal(true); }}
                    >
                      <Text style={dtStyles.rowActionText}>+ Credits</Text>
                    </Pressable>
                    <Pressable
                      style={[dtStyles.rowAction, { backgroundColor: "rgba(255,255,255,0.04)" }]}
                      onPress={(e) => { e.stopPropagation(); setDesktopSelectedId(isRowSelected ? null : player.id); }}
                    >
                      <Text style={[dtStyles.rowActionText, { color: Colors.dark.textSecondary }]}>View</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}

            {desktopSortedPlayers.length === 0 ? (
              <View style={dtStyles.emptyRow}>
                <Text style={dtStyles.emptyText}>No players found</Text>
              </View>
            ) : null}
          </ScrollView>

          {desktopSelectedId && desktopSelectedPlayer ? (
            <View style={dtStyles.rightPanel}>
              <View style={dtStyles.panelHeader}>
                <Text style={dtStyles.panelTitle}>Player Profile</Text>
                <Pressable onPress={() => setDesktopSelectedId(null)}>
                  <Ionicons name="close" size={20} color={Colors.dark.textMuted} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={dtStyles.panelAvatarRow}>
                  <View style={[dtStyles.panelAvatar, { borderColor: getBallLevelColor(desktopSelectedPlayer.ballLevel) }]}>
                    <Text style={dtStyles.panelAvatarText}>
                      {desktopSelectedPlayer.name?.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") ?? "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={dtStyles.panelName}>{desktopSelectedPlayer.name}</Text>
                    <Text style={dtStyles.panelEmail}>{desktopSelectedPlayer.email || "No email"}</Text>
                  </View>
                </View>
                {[
                  { label: "Ball Level", value: desktopSelectedPlayer.ballLevel || "—" },
                  { label: "Coach", value: desktopSelectedPlayer.coachName || "—" },
                  { label: "Credits", value: String(desktopSelectedPlayer.remainingCredits ?? "—") },
                  { label: "Phone", value: desktopSelectedPlayer.phone || "—" },
                  { label: "Parent", value: desktopSelectedPlayer.parentName || "—" },
                  { label: "Status", value: desktopSelectedPlayer.isActive !== false ? "Active" : "Inactive" },
                ].map(({ label, value }) => (
                  <View key={label} style={dtStyles.panelRow}>
                    <Text style={dtStyles.panelRowLabel}>{label}</Text>
                    <Text style={dtStyles.panelRowValue}>{value}</Text>
                  </View>
                ))}
                <View style={dtStyles.panelActions}>
                  <Pressable style={dtStyles.panelActionBtn} onPress={() => { setSelectedPlayerId(desktopSelectedId); setShowCreditStoreModal(true); }}>
                    <Ionicons name="ticket-outline" size={14} color={Colors.dark.primary} />
                    <Text style={[dtStyles.panelActionText, { color: Colors.dark.primary }]}>Add Credits</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>

        {showCreditStoreModal && selectedPlayerId ? (
          <CreditStoreModal
            visible={showCreditStoreModal}
            onClose={() => { setShowCreditStoreModal(false); setSelectedPlayerId(null); }}
            playerId={selectedPlayerId}
            playerName={players.find((p) => p.id === selectedPlayerId)?.name || ""}
          />
        ) : null}
        <AdminAddPlayerModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          editingPlayer={editingPlayer}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          isSubmitting={addPlayerMutation.isPending || updatePlayerMutation.isPending}
        />
      </View>
    );
  }

  // Check if we should show inline profile
  const showInlineProfile = selectedPlayerId && showDetailModal;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      {showInlineProfile && selectedPlayerId ? (
        <AdminInlinePlayerProfile
          selectedPlayerId={selectedPlayerId}
          selectedPlayer={selectedPlayer}
          onBack={closeDetailModal}
          onEditPlayer={(player) => {
            setEditingPlayer(player as Player);
            setFormData({
              name: player.name || "",
              email: player.email || "",
              phone: player.phone || "",
              ballLevel: player.ballLevel || "green",
              parentName: player.parentName || "",
              parentPhone: player.parentPhone || "",
              dateOfBirth: player.dateOfBirth || "",
            });
            closeDetailModal();
            setShowAddModal(true);
          }}
          onShowDeleteModal={() => setShowDeleteModal(true)}
          onShowCreditStoreModal={() => setShowCreditStoreModal(true)}
          onShowMarkPaidModal={(pkg) => {
            setSelectedPackageForPayment(pkg);
            setPaymentMethod("cash");
            setPaymentDate(new Date());
            setShowMarkPaidModal(true);
          }}
        />
      ) : (
        <>
          
            <View style={styles.header}>
              <Text style={styles.title}>Manage Players</Text>
              
                <Pressable style={styles.addButton} onPress={openAddModal}>
                  <Ionicons name="add" size={24} color={Colors.dark.text} />
                </Pressable>
              
            </View>
          

      
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players..."
            placeholderTextColor={Colors.dark.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
            </Pressable>
          ) : null}
          <Pressable 
            style={[styles.filterToggle, showFilters && styles.filterToggleActive]} 
            onPress={() => {
              setShowFilters(!showFilters);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons name="options-outline" size={20} color={showFilters ? Colors.dark.orange : Colors.dark.textMuted} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      

      {showFilters ? (
        <View style={styles.filterContainer}>
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Ball</Text>
            <View style={styles.filterChipsWrap}>
              {["all", "red", "orange", "green", "yellow"].map((ball) => (
                <Pressable
                  key={ball}
                  style={[styles.filterChip, ballLevelFilter === ball && styles.filterChipActive]}
                  onPress={() => {
                    setBallLevelFilter(ball);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  {ball !== "all" ? (
                    <View style={[styles.chipDot, { backgroundColor: getBallLevelColor(ball) }]} />
                  ) : null}
                  <Text style={[styles.filterChipText, ballLevelFilter === ball && styles.filterChipTextActive]}>
                    {ball === "all" ? "All" : ball.charAt(0).toUpperCase() + ball.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Level</Text>
            <View style={styles.filterChipsWrap}>
              {[{ key: "all", label: "All" }, { key: "1-3", label: "1-3" }, { key: "4-6", label: "4-6" }, { key: "7-10", label: "7+" }].map((lvl) => (
                <Pressable
                  key={lvl.key}
                  style={[styles.filterChip, levelFilter === lvl.key && styles.filterChipActive]}
                  onPress={() => {
                    setLevelFilter(lvl.key);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.filterChipText, levelFilter === lvl.key && styles.filterChipTextActive]}>
                    {lvl.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Age</Text>
            <View style={styles.filterChipsWrap}>
              {[
                { key: "all", label: "All" },
                { key: "u8", label: "U8" },
                { key: "u10", label: "U10" },
                { key: "u12", label: "U12" },
                { key: "u14", label: "U14" },
                { key: "u16", label: "U16" },
                { key: "adult", label: "18+" },
              ].map((age) => (
                <Pressable
                  key={age.key}
                  style={[styles.filterChip, ageGroupFilter === age.key && styles.filterChipActive]}
                  onPress={() => {
                    setAgeGroupFilter(age.key);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.filterChipText, ageGroupFilter === age.key && styles.filterChipTextActive]}>
                    {age.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {coaches.length > 0 ? (
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Coach</Text>
              <View style={styles.filterChipsWrap}>
                <Pressable
                  style={[styles.filterChip, coachFilter === "all" && styles.filterChipActive]}
                  onPress={() => {
                    setCoachFilter("all");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.filterChipText, coachFilter === "all" && styles.filterChipTextActive]}>All</Text>
                </Pressable>
                {coaches.slice(0, 4).map((coach) => (
                  <Pressable
                    key={coach.id}
                    style={[styles.filterChip, coachFilter === coach.name && styles.filterChipActive]}
                    onPress={() => {
                      setCoachFilter(coach.name);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[styles.filterChipText, coachFilter === coach.name && styles.filterChipTextActive]}>
                      {coach.name.split(" ")[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterChipsWrap}>
              {[
                { key: "all", label: "All" },
                { key: "active", label: "Active" },
                { key: "inactive", label: "Inactive" },
              ].map((status) => (
                <Pressable
                  key={status.key}
                  style={[styles.filterChip, statusFilter === status.key && styles.filterChipActive]}
                  onPress={() => {
                    setStatusFilter(status.key);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.filterChipText, statusFilter === status.key && styles.filterChipTextActive]}>
                    {status.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Email</Text>
            <View style={styles.filterChipsWrap}>
              {[
                { key: "all", label: "All" },
                { key: "with", label: "Has Email" },
                { key: "without", label: "No Email" },
              ].map((email) => (
                <Pressable
                  key={email.key}
                  style={[styles.filterChip, hasEmailFilter === email.key && styles.filterChipActive]}
                  onPress={() => {
                    setHasEmailFilter(email.key);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.filterChipText, hasEmailFilter === email.key && styles.filterChipTextActive]}>
                    {email.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>Sort</Text>
            <View style={styles.filterChipsWrap}>
              {[
                { key: "name_asc", label: "A-Z", icon: "arrow-up" },
                { key: "name_desc", label: "Z-A", icon: "arrow-down" },
                { key: "level_high", label: "Level", icon: "trending-up" },
                { key: "newest", label: "Newest", icon: "time-outline" },
                { key: "not_activated", label: "Activated", icon: "person-add-outline" },
              ].map((sort) => (
                <Pressable
                  key={sort.key}
                  style={[styles.filterChip, sortBy === sort.key && styles.filterChipActive]}
                  onPress={() => {
                    setSortBy(sort.key as SortOption);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons 
                    name={sort.icon as keyof typeof Ionicons.glyphMap} 
                    size={12} 
                    color={sortBy === sort.key ? Colors.dark.orange : Colors.dark.textMuted} 
                  />
                  <Text style={[styles.filterChipText, sortBy === sort.key && styles.filterChipTextActive]}>
                    {sort.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {activeFilterCount > 0 ? (
            <Pressable 
              style={styles.clearFiltersButton}
              onPress={() => {
                setBallLevelFilter("all");
                setLevelFilter("all");
                setAgeGroupFilter("all");
                setCoachFilter("all");
                setStatusFilter("all");
                setHasEmailFilter("all");
                setSortBy("name_asc");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
            >
              <Ionicons name="refresh-outline" size={14} color={Colors.dark.orange} />
              <Text style={styles.clearFiltersText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={handleFullCreditRebuild}
        disabled={fullCreditRebuildMutation.isPending}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginHorizontal: Spacing.lg,
          marginBottom: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: `${Colors.dark.error}12`,
          borderWidth: 1,
          borderColor: `${Colors.dark.error}30`,
          alignSelf: "flex-start",
        }}
      >
        {fullCreditRebuildMutation.isPending ? (
          <ActivityIndicator size="small" color={Colors.dark.error} />
        ) : (
          <Ionicons name="refresh-circle-outline" size={14} color={Colors.dark.error} />
        )}
        <Text style={{ color: Colors.dark.error, fontSize: 12, fontWeight: "700" }}>
          {fullCreditRebuildMutation.isPending ? "Rebuilding..." : "Rebuild All Credits"}
        </Text>
      </Pressable>

        <FlatList
          data={filteredPlayers}
          keyExtractor={(item) => item.id}
          renderItem={renderPlayer}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>
                {searchQuery ? "No players found" : "No players yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? "Try a different search" : "Tap + to add your first player"}
            </Text>
          </View>
        }
      />
      
      </>
      )}

      <AdminPlayerDetailModal
        showFullDetailsModal={showFullDetailsModal}
        closeFullDetailsModal={() => setShowFullDetailsModal(false)}
        insets={insets}
        statsLoading={statsLoading}
        statsError={statsError}
        refetchStats={refetchStats}
        playerStats={playerStats}
        selectedPlayer={selectedPlayer}
        selectedPlayerId={selectedPlayerId}
        setShowReportIssueModal={setShowReportIssueModal}
        setEditingPlayer={setEditingPlayer}
        setFormData={setFormData}
        closeDetailModal={closeDetailModal}
        setShowAddModal={setShowAddModal}
        setShowCreditStoreModal={setShowCreditStoreModal}
        progressExpanded={progressExpanded}
        setProgressExpanded={setProgressExpanded}
        selectedSeriesFilter={selectedSeriesFilter}
        setSelectedSeriesFilter={setSelectedSeriesFilter}
        uniqueSeries={uniqueSeries}
        filteredSessions={filteredSessions}
        handleCopyInviteCode={handleCopyInviteCode}
        handleRegenerateInviteCode={() => regenerateInviteCodeMutation.mutate()}
        isRegeneratingInviteCode={regenerateInviteCodeMutation.isPending}
        playerInvite={playerInvite}
        inviteLoading={inviteLoading}
        inviteError={inviteError}
        refetchInvite={refetchInvite}
        inviteCopied={inviteCopied}
        handleDelete={handleDelete}
        showDeleteModal={showDeleteModal}
        isDeletePending={deletePlayerMutation.isPending}
        closeDeleteModal={() => setShowDeleteModal(false)}
        confirmDelete={confirmDelete}
        showAddModal={showAddModal}
        editingPlayer={editingPlayer}
        formData={formData}
        handleAddPlayerSubmit={handleSubmit}
        isAddPlayerSubmitting={addPlayerMutation.isPending || updatePlayerMutation.isPending}
        showCreditStoreModal={showCreditStoreModal}
        showReportIssueModal={showReportIssueModal}
        showMarkPaidModal={showMarkPaidModal}
        selectedPackageForPayment={selectedPackageForPayment}
        setSelectedPackageForPayment={setSelectedPackageForPayment}
        setShowMarkPaidModal={setShowMarkPaidModal}
        showRecordPaymentModal={showRecordPaymentModal}
        setShowRecordPaymentModal={setShowRecordPaymentModal}
      />

      {/* Add Player modal for the FAB "Add new player" flow only.
          When the player detail modal is open, an instance of this modal is rendered
          INSIDE AdminPlayerDetailModal so the edit form stacks on top of the detail. */}
      {!showFullDetailsModal ? (
        <AdminAddPlayerModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          editingPlayer={editingPlayer}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          isSubmitting={addPlayerMutation.isPending || updatePlayerMutation.isPending}
        />
      ) : null}

      <AdminInvitePopover
        player={invitePopoverPlayer}
        copied={invitePopoverCopied}
        onClose={() => { setInvitePopoverPlayer(null); setInvitePopoverCopied(false); }}
        onCopied={() => setInvitePopoverCopied(true)}
      />
    </View>
  );
}

const dtStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0D10",
    flexDirection: "column",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 12,
    flexWrap: "wrap",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#11141A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    
  },
  filterChipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: {
    backgroundColor: "rgba(200,255,61,0.12)",
    borderColor: "rgba(200,255,61,0.3)",
  },
  chipText: {
    fontSize: 12,
    color: "#7C8290",
  },
  chipTextActive: {
    color: "#C8FF3D",
    fontWeight: "600",
  },
  countText: {
    fontSize: 12,
    color: "#7C8290",
    flex: 1,
    textAlign: "right",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#C8FF3D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B0D10",
  },
  bulkBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: "rgba(200,255,61,0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(200,255,61,0.15)",
    gap: 16,
  },
  bulkText: {
    fontSize: 13,
    color: "#C8FF3D",
    fontWeight: "600",
  },
  bulkAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bulkActionText: {
    fontSize: 13,
    color: "#7C8290",
  },
  tableArea: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  tableScroll: {
    flex: 1,
    overflow: "scroll",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#0D0F13",
  },
  thCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  thPressable: {
    
  },
  thText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7C8290",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    
  },
  tableRowSelected: {
    backgroundColor: "rgba(200,255,61,0.05)",
  },
  tdCell: {
    flexDirection: "row",
    alignItems: "center",
  },
  colCheck: { width: 32 },
  colName: { flex: 2, gap: 10 },
  colBall: { flex: 1 },
  colCredits: { flex: 1 },
  colCoach: { flex: 1.5 },
  colLastSession: { flex: 1 },
  colStatus: { flex: 1 },
  colActions: { flex: 1.5, gap: 6 },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#7C8290",
    alignSelf: "center",
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#C8FF3D",
    borderColor: "#C8FF3D",
  },
  playerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,133,27,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: {
    color: "#FF851B",
    fontSize: 11,
    fontWeight: "700",
  },
  playerName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  playerEmail: {
    color: "#7C8290",
    fontSize: 11,
    marginTop: 1,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ballDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ballText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  rowAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(200,255,61,0.08)",
    borderWidth: 1,
    borderColor: "rgba(200,255,61,0.15)",
  },
  rowActionText: {
    fontSize: 11,
    color: "#C8FF3D",
    fontWeight: "600",
  },
  emptyRow: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#7C8290",
    fontSize: 14,
  },
  rightPanel: {
    width: 280,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#11141A",
    padding: 20,
    overflow: "scroll",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  panelAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  panelAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,133,27,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  panelAvatarText: {
    color: "#FF851B",
    fontSize: 16,
    fontWeight: "700",
  },
  panelName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  panelEmail: {
    fontSize: 12,
    color: "#7C8290",
    marginTop: 2,
  },
  panelRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  panelRowLabel: {
    flex: 1,
    fontSize: 12,
    color: "#7C8290",
  },
  panelRowValue: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  panelActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  panelActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  panelActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

function AdminInvitePopover({
  player,
  copied,
  onClose,
  onCopied,
}: {
  player: { id: string; name: string } | null;
  copied: boolean;
  onClose: () => void;
  onCopied: () => void;
}) {
  const { data: inviteData, isLoading } = useQuery<{ inviteCode: string; status: string } | null>({
    queryKey: ["/api/players", player?.id, "invite"],
    enabled: !!player,
    retry: false,
  });

  const handleCopy = async () => {
    const code = inviteData?.inviteCode;
    if (code) {
      await Clipboard.setStringAsync(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCopied();
    }
  };

  return (
    <Modal visible={!!player} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: Colors.dark.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            width: 300,
            borderWidth: 1,
            borderColor: Colors.dark.orange + "40",
            alignItems: "center",
          }}
          onPress={(e) => e.stopPropagation()}
          onStartShouldSetResponder={() => true}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="time-outline" size={18} color={Colors.dark.orange} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.dark.text }}>Awaiting Signup</Text>
          </View>
          <Text style={{ fontSize: 12, color: Colors.dark.textMuted, textAlign: "center", lineHeight: 16, marginBottom: Spacing.md }}>
            {player?.name} hasn't joined the app yet. Share this code with them:
          </Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.dark.orange} style={{ marginVertical: 16 }} />
          ) : inviteData?.inviteCode ? (
            <>
              <Text style={{
                fontSize: 28,
                fontWeight: "900",
                color: Colors.dark.orange,
                letterSpacing: 6,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                marginVertical: Spacing.sm,
              }} selectable>{inviteData.inviteCode}</Text>
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: Colors.dark.orange + "20",
                  borderRadius: BorderRadius.md,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderWidth: 1,
                  borderColor: Colors.dark.orange + "50",
                  width: "100%",
                  justifyContent: "center",
                }}
                onPress={handleCopy}
              >
                <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={16} color={copied ? Colors.dark.primary : Colors.dark.orange} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: copied ? Colors.dark.primary : Colors.dark.orange }}>
                  {copied ? "Copied!" : "Copy Code"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: Colors.dark.textMuted, fontSize: 13 }}>No invite code available</Text>
          )}
          <Pressable style={{ marginTop: Spacing.sm, paddingVertical: 8 }} onPress={onClose}>
            <Text style={{ fontSize: 13, color: Colors.dark.textMuted, textAlign: "center" }}>Dismiss</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

