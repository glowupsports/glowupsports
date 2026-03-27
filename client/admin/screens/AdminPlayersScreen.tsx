import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
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
import { ReportIssueModal } from "@/components/ReportIssueModal";
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";
import CreditStoreModal from "@/admin/components/CreditStoreModal";
import { GLOW_UP_TENNIS_LOGO } from "@/admin/components/logoBase64";
import { styles } from "@/admin/components/players/adminPlayersStyles";
import { generateAttendanceReportPDF, StatItem, SkillBar } from "@/admin/components/players/AdminPlayerHelpers";
import { AdminPlayerDetailModal } from "@/admin/components/players/AdminPlayerDetailModal";
import { AdminInlinePlayerProfile } from "@/admin/components/players/AdminInlinePlayerProfile";
import { AdminMarkPaidModal } from "@/admin/components/players/AdminMarkPaidModal";
import { AdminRecordPaymentModal } from "@/admin/components/players/AdminRecordPaymentModal";
import { AdminAddPlayerModal } from "@/admin/components/players/AdminAddPlayerModal";

type Player = { id: string; name: string; email?: string | null; phone?: string | null; ballLevel?: string; level?: number; coachName?: string; age?: number; dateOfBirth?: string; parentName?: string; parentPhone?: string; isActive?: boolean; status?: string };
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
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
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
  });

  const { data: players = [], isLoading, error, refetch } = useQuery<Player[]>({
    queryKey: ["/api/players?withCredits=true"],
  });

  const { data: coaches = [] } = useQuery<Coach[]>({
    queryKey: ["/api/coaches"],
  });

  const { data: invoicesData = [] } = useQuery<{ id: string; playerId: string | null; status: string; amount: string; dueDate: string | null }[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const invoicesByPlayer = useMemo(() => {
    const map = new Map<string, { pendingCount: number; overdueCount: number; totalOwed: number }>();
    const now = new Date();
    for (const inv of invoicesData) {
      if (!inv.playerId || inv.status !== "pending") continue;
      const existing = map.get(inv.playerId) || { pendingCount: 0, overdueCount: 0, totalOwed: 0 };
      existing.pendingCount++;
      existing.totalOwed += Number(inv.amount) || 0;
      if (inv.dueDate && new Date(inv.dueDate) < now) {
        existing.overdueCount++;
      }
      map.set(inv.playerId, existing);
    }
    return map;
  }, [invoicesData]);

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
    setFormData({ name: "", email: "", phone: "", ballLevel: "green", parentName: "", parentPhone: "" });
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

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      if (Platform.OS === "web") {
        window.alert("Please enter player name");
      } else {
        Alert.alert("Error", "Please enter player name");
      }
      return;
    }
    addPlayerMutation.mutate(formData);
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
    const invoiceInfo = invoicesByPlayer.get(item.id);
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
          {invoiceInfo ? (
            <View style={[styles.invoiceBadge, { backgroundColor: (invoiceInfo.overdueCount > 0 ? Colors.dark.error : Colors.dark.gold) + "20" }]}>
              <Ionicons
                name={invoiceInfo.overdueCount > 0 ? "alert-circle" : "document-text-outline"}
                size={10}
                color={invoiceInfo.overdueCount > 0 ? Colors.dark.error : Colors.dark.gold}
              />
              <Text style={[styles.invoiceBadgeText, { color: invoiceInfo.overdueCount > 0 ? Colors.dark.error : Colors.dark.gold }]}>
                {invoiceInfo.overdueCount > 0 ? "Overdue" : "Pending"}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };


  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.dark.orange} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>Failed to load players</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
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
            });
            closeDetailModal();
            setShowAddModal(true);
          }}
          onShowDeleteModal={() => setShowDeleteModal(true)}
          onShowInvoiceModal={() => setShowInvoiceModal(true)}
          onShowCreditStoreModal={() => setShowCreditStoreModal(true)}
          onShowRecordPaymentModal={() => setShowRecordPaymentModal(true)}
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
        setShowRecordPaymentModal={setShowRecordPaymentModal}
        setSelectedPackageForPayment={setSelectedPackageForPayment}
        setShowInvoiceModal={setShowInvoiceModal}
        setShowCreditStoreModal={setShowCreditStoreModal}
        progressExpanded={progressExpanded}
        setProgressExpanded={setProgressExpanded}
        selectedSeriesFilter={selectedSeriesFilter}
        setSelectedSeriesFilter={setSelectedSeriesFilter}
        uniqueSeries={uniqueSeries}
        filteredSessions={filteredSessions}
        handleCopyInviteCode={handleCopyInviteCode}
        playerInvite={playerInvite}
        inviteLoading={inviteLoading}
        inviteError={inviteError}
        refetchInvite={refetchInvite}
        inviteCopied={inviteCopied}
        handleDelete={handleDelete}
      />

      <AdminAddPlayerModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        editingPlayer={editingPlayer}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        isSubmitting={addPlayerMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDeleteModal(false)} />
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteModalIconContainer}>
                <Ionicons name="trash" size={32} color={Colors.dark.error} />
              </View>
              <Text style={styles.deleteModalTitle}>Delete Player</Text>
              <Text style={styles.deleteModalSubtitle}>
                {playerStats?.player?.name || selectedPlayer?.name || "Player"}
              </Text>
            </View>

            <Text style={styles.deleteOptionsLabel}>This will permanently delete:</Text>
            
            <ScrollView style={styles.deleteOptionsContainer}>
              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Progress & XP Data</Text>
                  <Text style={styles.deleteOptionDesc}>Skills, levels, XP transactions, assessments</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Feedback & Notes</Text>
                  <Text style={styles.deleteOptionDesc}>Session feedback, coach notes</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Billing & Payments</Text>
                  <Text style={styles.deleteOptionDesc}>Invoices, payments, packages, subscriptions</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Chat Messages</Text>
                  <Text style={styles.deleteOptionDesc}>Conversations and message history</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Coach Reviews</Text>
                  <Text style={styles.deleteOptionDesc}>Reviews given by the player</Text>
                </View>
              </View>

              <View style={styles.deleteOptionRow}>
                <View style={[styles.checkbox, styles.checkboxChecked]}>
                  <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
                </View>
                <View style={styles.deleteOptionContent}>
                  <Text style={styles.deleteOptionLabel}>Booking Requests</Text>
                  <Text style={styles.deleteOptionDesc}>Pending and past booking requests</Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.warningInfo}>
              <Ionicons name="warning" size={16} color={Colors.dark.warning} />
              <Text style={styles.warningText}>
                This action cannot be undone
              </Text>
            </View>

            <View style={styles.deleteModalActions}>
              <Pressable 
                style={styles.cancelDeleteBtn}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.cancelDeleteBtnText}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.confirmDeleteBtn, deletePlayerMutation.isPending && styles.btnDisabled]}
                onPress={confirmDelete}
                disabled={deletePlayerMutation.isPending}
              >
                {deletePlayerMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color={Colors.dark.text} />
                    <Text style={styles.confirmDeleteBtnText}>Delete Player</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ReportIssueModal
        visible={showReportIssueModal}
        onClose={() => setShowReportIssueModal(false)}
        currentScreen="AdminPlayersScreen - Player Details"
      />

      <CreateInvoiceModal
        visible={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        player={playerStats?.player ? {
          id: playerStats.player.id,
          name: playerStats.player.name,
          email: playerStats.player.email,
          phone: playerStats.player.phone,
          parentName: playerStats.player.parentName,
          parentEmail: undefined,
          parentPhone: playerStats.player.parentPhone,
        } : null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/players", selectedPlayerId, "stats"] });
        }}
      />

      <CreditStoreModal
        visible={showCreditStoreModal}
        onClose={() => setShowCreditStoreModal(false)}
        playerId={selectedPlayerId || ""}
        playerName={playerStats?.player?.name || ""}
      />

      <AdminMarkPaidModal
        visible={showMarkPaidModal}
        onClose={() => {
          setShowMarkPaidModal(false);
          setSelectedPackageForPayment(null);
        }}
        selectedPackage={selectedPackageForPayment}
        selectedPlayerId={selectedPlayerId}
      />

      {/* Record Payment Modal */}
      <AdminRecordPaymentModal
        visible={showRecordPaymentModal}
        onClose={() => setShowRecordPaymentModal(false)}
        packages={playerStats?.packages}
        selectedPlayerId={selectedPlayerId}
      />
    </View>
  );
}

