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
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import CreateInvoiceModal from "@/admin/components/CreateInvoiceModal";
import CreditStoreModal from "@/admin/components/CreditStoreModal";
import { GLOW_UP_TENNIS_LOGO } from "@/admin/components/logoBase64";
const generateAttendanceReportPDF = (stats: any, player: any) => {
  if (!stats?.sessions || stats.sessions.length === 0) {
    Alert.alert("No Sessions", "There are no sessions to include in the report.");
    return;
  }

  const now = new Date();
  const reportDate = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  
  // Filter out future sessions - only show past sessions
  const pastSessions = stats.sessions.filter((s: any) => {
    if (!s.startTime) return false;
    const sessionTime = new Date(s.startTime);
    return sessionTime < now;
  });
  
  if (pastSessions.length === 0) {
    Alert.alert("No Past Sessions", "There are no completed sessions to include in the report.");
    return;
  }
  
  // Calculate stats only for past sessions
  const presentCount = pastSessions.filter((s: any) => s.attended === "present").length;
  const absentCount = pastSessions.filter((s: any) => s.attended === "absent" || s.attended === "no_show").length;
  const attendanceRate = pastSessions.length > 0 ? Math.round((presentCount / pastSessions.length) * 100) : 0;

  // Group sessions by month
  const sessionsByMonth: { [key: string]: any[] } = {};
  pastSessions.forEach((session: any) => {
    const sessionDate = new Date(session.startTime);
    const monthKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;
    if (!sessionsByMonth[monthKey]) {
      sessionsByMonth[monthKey] = [];
    }
    sessionsByMonth[monthKey].push(session);
  });
  
  // Sort months newest first
  const sortedMonths = Object.keys(sessionsByMonth).sort((a, b) => b.localeCompare(a));
  
  // Generate month tabs HTML
  const monthTabsHtml = sortedMonths.map((monthKey, index) => {
    const date = new Date(monthKey + '-01');
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const count = sessionsByMonth[monthKey].length;
    return `<span style="display: inline-block; padding: 6px 12px; background: ${index === 0 ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${index === 0 ? '#00D4FF' : 'rgba(255,255,255,0.1)'}; border-radius: 16px; font-size: 12px; color: ${index === 0 ? '#00D4FF' : 'rgba(255,255,255,0.6)'}; margin-right: 8px; margin-bottom: 8px;">${label} (${count})</span>`;
  }).join('');
  
  // Generate month sections HTML
  const monthSectionsHtml = sortedMonths.map(monthKey => {
    const sessions = sessionsByMonth[monthKey];
    const date = new Date(monthKey + '-01');
    const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const rowsHtml = sessions.map((session: any) => {
      const sessionDate = new Date(session.startTime);
      const isAttended = session.attended === "present";
      const isAbsent = session.attended === "absent" || session.attended === "no_show";
      const statusLabel = isAttended ? "Present" : isAbsent ? "Absent" : "Pending";
      const statusColor = isAttended ? "#00E676" : isAbsent ? "#FF5252" : "#FFD740";
      const sessionType = session.sessionType === "private" ? "Private" : 
                          session.sessionType === "semi_private" ? "Semi-Private" : "Group";
      
      return `
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #2a2d35;">
            <div style="font-weight: 600; color: #fff;">${sessionDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
            <div style="font-size: 12px; color: #6b7280;">${sessionDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #2a2d35;">
            <span style="background: #1e2127; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #00D4FF;">${sessionType}</span>
          </td>
          <td style="padding: 14px 16px; border-bottom: 1px solid #2a2d35; text-align: center;">
            <span style="background: ${statusColor}20; color: ${statusColor}; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600;">${statusLabel}</span>
          </td>
        </tr>
      `;
    }).join('');
    
    return `
      <div style="margin-bottom: 24px;">
        <div style="font-size: 14px; font-weight: 600; color: #00D4FF; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(0, 212, 255, 0.3);">${monthLabel}</div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 10px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; background: #1a1d22;">Date & Time</th>
              <th style="text-align: left; padding: 10px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; background: #1a1d22;">Type</th>
              <th style="text-align: center; padding: 10px 16px; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; background: #1a1d22;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html style="background: #0B0D10; min-height: 100%;">
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          min-height: 100%;
          height: 100%;
          background: #0B0D10;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0B0D10;
          color: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
          background: #0B0D10;
          min-height: 100vh;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #2a2d35;
        }
        .report-badge {
          background: linear-gradient(135deg, #00D4FF20, #00D4FF10);
          border: 1px solid #00D4FF40;
          border-radius: 12px;
          padding: 16px 24px;
          text-align: right;
        }
        .report-label {
          font-size: 11px;
          color: #00D4FF;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .report-title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
        }
        .download-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #C8FF3D 0%, #9FCC31 100%);
          color: #0B0D10;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          margin-left: 16px;
        }
        .download-btn:hover { opacity: 0.9; }
        @media print { .download-btn { display: none !important; } }
        .player-section {
          background: linear-gradient(135deg, #C8FF3D10, #C8FF3D05);
          border: 1px solid #C8FF3D30;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .player-name {
          font-size: 24px;
          font-weight: 800;
          color: #C8FF3D;
          margin-bottom: 8px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: #14171C;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          border: 1px solid #2a2d35;
        }
        .stat-value {
          font-size: 28px;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .stat-label {
          font-size: 11px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #2a2d35;
          text-align: center;
          color: #6b7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-section">
            <img src="${GLOW_UP_TENNIS_LOGO}" alt="Glow Up Tennis" style="width: 140px; height: auto;" />
          </div>
          <div style="display: flex; align-items: center;">
            <div class="report-badge">
              <div class="report-label">Attendance Report</div>
              <div class="report-title">${reportDate}</div>
            </div>
            <button class="download-btn" onclick="window.print()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PDF
            </button>
          </div>
        </div>
        

        <div class="player-section">
          <div class="player-name">${player?.name || stats.player?.name || "Player"}</div>
          <div style="font-size: 14px; color: #6b7280;">${player?.email || stats.player?.email || ""}</div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" style="color: #00D4FF;">${pastSessions.length}</div>
            <div class="stat-label">Total Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #00E676;">${presentCount}</div>
            <div class="stat-label">Present</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #FF5252;">${absentCount}</div>
            <div class="stat-label">Absent</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #C8FF3D;">${attendanceRate}%</div>
            <div class="stat-label">Attendance Rate</div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          ${monthTabsHtml}
        </div>

        <div style="background: #14171C; border-radius: 16px; padding: 20px; border: 1px solid #2a2d35;">
          ${monthSectionsHtml}
        </div>

        <div class="footer">
          Generated by Glow Up Tennis • ${reportDate}
        </div>
      </div>
    </body>
    </html>
  `;

  if (Platform.OS === "web") {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  } else {
    import("expo-print").then(({ printAsync }) => {
      printAsync({ html: htmlContent });
    });
  }
};

interface Player {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  ballLevel?: string;
  level?: number;
  totalXp?: number;
  coachName?: string;
  remainingCredits?: number;
  totalCredits?: number;
  creditsByType?: { private: number; group: number; semiPrivate: number };
  age?: number;
  dateOfBirth?: string;
  status?: string;
  isActive?: boolean;
}

interface PlayerSession {
  id: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  attended: string;
  creditsUsed: number;
  isPaid: boolean;
}

interface PlayerPackage {
  id: string;
  creditType: string;
  totalCredits: number;
  remainingCredits: number;
  status: string;
  expiryDate?: string;
  createdAt?: string;
  pricePerCredit?: number;
  isPaid?: boolean;
  price?: number;
}

interface PlayerStats {
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
  attendance: {
    totalSessions: number;
    attended: number;
    missed: number;
    rate: number;
    streak: number;
  };
  progress: {
    level: number;
    xp: number;
    xpToNextLevel: number;
    skills: {
      technical: number;
      tactical: number;
      physical: number;
      mental: number;
      social: number;
    };
    recentMilestones: string[];
  };
  payments: {
    totalOwed: number;
    totalPaid: number;
    lastPaymentDate?: string;
    status: "paid" | "partial" | "overdue";
    currency: string;
  };
  credits?: {
    total: number;
    group: number;
    semiPrivate: number;
    private: number;
    activePackages: number;
  };
  packages?: PlayerPackage[];
  sessions?: PlayerSession[];
}

const BALL_LEVELS = ["red", "orange", "green", "yellow"];

interface StatItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
}

function StatItem({ icon, label, value, color = Colors.dark.primary }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function SkillBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.skillRow}>
      <Text style={styles.skillLabel}>{label}</Text>
      <View style={styles.skillBarContainer}>
        <View style={[styles.skillBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.skillValue}>{value}</Text>
    </View>
  );
}

type SortOption = "name_asc" | "name_desc" | "level_high" | "level_low" | "newest";

interface Coach {
  id: string;
  name: string;
}

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

  const { data: playerStats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery<PlayerStats>({
    queryKey: ["/api/admin/players", selectedPlayerId, "stats"],
    enabled: !!selectedPlayerId && (showDetailModal || showFullDetailsModal),
  });

  const { data: playerInvite, isLoading: inviteLoading, isError: inviteError, refetch: refetchInvite } = useQuery<{ 
    inviteCode: string; 
    inviteLink: string;
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
    playerStats.sessions.forEach((s: any) => {
      if (s.seriesName && s.seriesId) {
        seriesMap.set(s.seriesId, s.seriesName);
      }
    });
    return Array.from(seriesMap.entries()).map(([id, name]) => ({ id, name }));
  }, [playerStats?.sessions]);

  const filteredSessions = useMemo(() => {
    if (!playerStats?.sessions) return [];
    return selectedSeriesFilter 
      ? playerStats.sessions.filter((s: any) => s.seriesId === selectedSeriesFilter)
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

  const handleCopyInviteLink = async () => {
    if (playerInvite?.inviteLink) {
      await Clipboard.setStringAsync(playerInvite.inviteLink);
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

  const renderPlayer = ({ item }: { item: Player }) => (
    <Pressable
      style={[styles.playerCard, CardStyles.elevated]}
      onPress={() => togglePlayerExpansion(item.id)}
    >
      <View style={[styles.playerAvatar, { borderColor: getBallLevelColor(item.ballLevel) }]}>
        <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase() || "?"}</Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{item.name}</Text>
        <Text style={styles.playerEmail}>{item.email || "No email"}</Text>
        <View style={styles.playerMeta}>
          <View style={[styles.ballBadge, { backgroundColor: `${getBallLevelColor(item.ballLevel)}20` }]}>
            <View style={[styles.ballDot, { backgroundColor: getBallLevelColor(item.ballLevel) }]} />
            <Text style={[styles.ballText, { color: getBallLevelColor(item.ballLevel) }]}>
              {item.ballLevel || "N/A"}
            </Text>
          </View>
          {item.level ? (
            <Text style={styles.levelText}>Level {item.level}</Text>
          ) : null}
          {item.coachName ? (
            <Text style={styles.coachText}>{item.coachName}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.creditsContainer}>
        {(() => {
          const credits = item.remainingCredits;
          const byType = item.creditsByType;

          const getCreditTypeColor = (val: number) =>
            val < 0 ? Colors.dark.error
            : val === 0 ? Colors.dark.error
            : val <= 2 ? Colors.dark.gold
            : "#22c55e";

          const overallColor = credits === undefined
            ? Colors.dark.textMuted
            : getCreditTypeColor(credits);

          const formatCreditParts = () => {
            if (credits === undefined) return [{ text: "No pkg", color: Colors.dark.textMuted }];
            if (!byType) return [{ text: credits === 0 ? "0 credits" : `${credits}`, color: getCreditTypeColor(credits) }];

            const parts: { text: string; color: string }[] = [];
            if (byType.private !== 0) parts.push({ text: `${byType.private} Prv`, color: getCreditTypeColor(byType.private) });
            if (byType.group !== 0) parts.push({ text: `${byType.group} Grp`, color: getCreditTypeColor(byType.group) });
            if (byType.semiPrivate !== 0) parts.push({ text: `${byType.semiPrivate} Semi`, color: getCreditTypeColor(byType.semiPrivate) });
            return parts.length > 0 ? parts : [{ text: "0 credits", color: Colors.dark.error }];
          };

          const parts = formatCreditParts();

          return (
            <View style={[styles.creditsBadge, { backgroundColor: overallColor + "20" }]}>
              <Ionicons name="ticket-outline" size={12} color={overallColor} />
              {parts.map((p, i) => (
                <Text key={i} style={[styles.creditsText, { color: p.color }]}>
                  {i > 0 ? " | " : ""}{p.text}
                </Text>
              ))}
            </View>
          );
        })()}
        <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );

  const closeFullDetailsModal = () => {
    setShowFullDetailsModal(false);
  };
  
  const renderDetailModal = () => {
    const stats = playerStats;
    
    return (
      <Modal
        visible={showFullDetailsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeFullDetailsModal}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeFullDetailsModal}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Player Details</Text>
            <Pressable onPress={() => {
              if (stats?.player) {
                setEditingPlayer({
                  id: stats.player.id,
                  name: stats.player.name,
                  email: stats.player.email,
                  phone: stats.player.phone,
                  ballLevel: stats.player.ballLevel,
                });
                setFormData({
                  name: stats.player.name || "",
                  email: stats.player.email || "",
                  phone: stats.player.phone || "",
                  ballLevel: stats.player.ballLevel || "green",
                  parentName: stats.player.parentName || "",
                  parentPhone: stats.player.parentPhone || "",
                });
                closeDetailModal();
                setShowAddModal(true);
              }
            }}>
              <Ionicons name="pencil" size={20} color={Colors.dark.orange} />
            </Pressable>
          </View>

          {statsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.orange} />
              <Text style={styles.loadingText}>Loading player details...</Text>
            </View>
          ) : statsError ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
              <Text style={styles.errorText}>Failed to load player details</Text>
              <Pressable style={styles.retryButton} onPress={() => refetchStats()}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </Pressable>
              <Pressable 
                style={[styles.retryButton, { backgroundColor: Colors.dark.surface, marginTop: Spacing.sm }]} 
                onPress={() => setShowReportIssueModal(true)}
              >
                <Ionicons name="warning-outline" size={16} color={Colors.dark.text} style={{ marginRight: Spacing.xs }} />
                <Text style={[styles.retryButtonText, { color: Colors.dark.text }]}>Report Issue</Text>
              </Pressable>
            </View>
          ) : stats ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(stats.player.ballLevel) }]}>
                  <Text style={styles.profileAvatarText}>
                    {stats.player.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <Text style={styles.profileName}>{stats.player.name}</Text>
                <View style={[styles.ballBadgeLarge, { backgroundColor: `${getBallLevelColor(stats.player.ballLevel)}20` }]}>
                  <View style={[styles.ballDotLarge, { backgroundColor: getBallLevelColor(stats.player.ballLevel) }]} />
                  <Text style={[styles.ballTextLarge, { color: getBallLevelColor(stats.player.ballLevel) }]}>
                    {stats.player.ballLevel || "N/A"} Ball
                  </Text>
                </View>
                {stats.player.coachName ? (
                  <Text style={styles.coachAssignment}>Coach: {stats.player.coachName}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Attendance</Text>
                <View style={styles.statsGrid}>
                  <StatItem 
                    icon="checkmark-circle" 
                    label="Attended" 
                    value={stats.attendance.attended}
                    color={Colors.dark.successNeon}
                  />
                  <StatItem 
                    icon="close-circle" 
                    label="Missed" 
                    value={stats.attendance.missed}
                    color={Colors.dark.error}
                  />
                  <StatItem 
                    icon="trending-up" 
                    label="Rate" 
                    value={`${stats.attendance.rate}%`}
                    color={Colors.dark.orange}
                  />
                  <StatItem 
                    icon="flame" 
                    label="Streak" 
                    value={stats.attendance.streak}
                    color={Colors.dark.gold}
                  />
                </View>
              </View>

              <Pressable 
                style={[styles.section, CardStyles.elevated]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setProgressExpanded(!progressExpanded);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.sectionTitle}>Progress</Text>
                  <Ionicons 
                    name={progressExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color={Colors.dark.textMuted} 
                  />
                </View>
                {progressExpanded ? (
                  <>
                    <View style={styles.progressHeader}>
                      <View style={styles.levelBadge}>
                        <Text style={styles.levelNumber}>{stats.progress.level}</Text>
                        <Text style={styles.levelLabel}>Level</Text>
                      </View>
                      <View style={styles.xpInfo}>
                        <Text style={styles.xpText}>{stats.progress.xp} / {stats.progress.xpToNextLevel} XP</Text>
                        <View style={styles.xpBar}>
                          <View 
                            style={[
                              styles.xpFill, 
                              { width: `${(stats.progress.xp / stats.progress.xpToNextLevel) * 100}%` }
                            ]} 
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.skillsSection}>
                      <SkillBar label="Technical" value={stats.progress.skills.technical} color={Colors.dark.xpCyan} />
                      <SkillBar label="Tactical" value={stats.progress.skills.tactical} color={Colors.dark.primary} />
                      <SkillBar label="Physical" value={stats.progress.skills.physical} color={Colors.dark.orange} />
                      <SkillBar label="Mental" value={stats.progress.skills.mental} color={Colors.dark.gold} />
                      <SkillBar label="Social" value={stats.progress.skills.social} color={Colors.dark.successNeon} />
                    </View>
                  </>
                ) : null}
              </Pressable>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Payments</Text>
                <View style={styles.paymentSummary}>
                  <View style={[
                    styles.paymentStatusBadge, 
                    { backgroundColor: `${getPaymentStatusColor(stats.payments.status)}20` }
                  ]}>
                    <Text style={[styles.paymentStatusText, { color: getPaymentStatusColor(stats.payments.status) }]}>
                      {stats.payments.status?.toUpperCase() || "N/A"}
                    </Text>
                  </View>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Total Owed</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.error }]}>
                    {stats.payments.currency} {stats.payments.totalOwed}
                  </Text>
                </View>
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Total Paid</Text>
                  <Text style={[styles.financeValue, { color: Colors.dark.successNeon }]}>
                    {stats.payments.currency} {stats.payments.totalPaid}
                  </Text>
                </View>
                {stats.payments.lastPaymentDate ? (
                  <View style={styles.financeRow}>
                    <Text style={styles.financeLabel}>Last Payment</Text>
                    <Text style={styles.financeValue}>{stats.payments.lastPaymentDate}</Text>
                  </View>
                ) : null}
                <View style={styles.paymentActions}>
                  <Pressable 
                    style={styles.recordPaymentButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowRecordPaymentModal(true);
                    }}
                  >
                    <Ionicons name="card-outline" size={16} color="#000" />
                    <Text style={styles.recordPaymentText}>Record Payment</Text>
                  </Pressable>
                  <Pressable 
                    style={styles.createInvoiceButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowInvoiceModal(true);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={16} color={Colors.dark.successNeon} />
                    <Text style={styles.createInvoiceText}>Create Invoice</Text>
                  </Pressable>
                </View>
              </View>

              {/* Credits/Packages Section */}
              <View style={[styles.section, CardStyles.elevated]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="ticket-outline" size={18} color={Colors.dark.primary} />
                    <Text style={styles.sectionTitle}>Packages</Text>
                  </View>
                  <Pressable 
                    style={styles.addCreditsButtonPremium}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowCreditStoreModal(true);
                    }}
                  >
                    <Ionicons name="add" size={16} color="#000" />
                    <Text style={styles.addCreditsButtonText}>Add</Text>
                  </Pressable>
                </View>
                
                <View style={styles.creditsOverview}>
                  <View style={styles.creditStatCard}>
                    <Text style={styles.creditStatValue}>{stats.credits?.total || 0}</Text>
                    <Text style={styles.creditStatLabel}>Total Credits</Text>
                  </View>
                  <View style={styles.creditStatCard}>
                    <Text style={styles.creditStatValue}>{stats.credits?.activePackages || 0}</Text>
                    <Text style={styles.creditStatLabel}>Active Packages</Text>
                  </View>
                </View>

                <View style={styles.creditTypeRow}>
                  <View style={[styles.creditTypeCard, { backgroundColor: `${Colors.dark.xpCyan}15` }]}>
                    <Text style={[styles.creditTypeValue, { color: Colors.dark.xpCyan }]}>{stats.credits?.group || 0}</Text>
                    <Text style={styles.creditTypeLabel}>Group</Text>
                  </View>
                  <View style={[styles.creditTypeCard, { backgroundColor: `${Colors.dark.orange}15` }]}>
                    <Text style={[styles.creditTypeValue, { color: Colors.dark.orange }]}>{stats.credits?.private || 0}</Text>
                    <Text style={styles.creditTypeLabel}>Private</Text>
                  </View>
                  <View style={[styles.creditTypeCard, { backgroundColor: `${Colors.dark.primary}15` }]}>
                    <Text style={[styles.creditTypeValue, { color: Colors.dark.primary }]}>{stats.credits?.semiPrivate || 0}</Text>
                    <Text style={styles.creditTypeLabel}>Semi-Private</Text>
                  </View>
                </View>

                <Pressable 
                  style={styles.grantCreditsButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowCreditStoreModal(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.dark.primary} />
                  <Text style={styles.grantCreditsText}>Grant Credits</Text>
                </Pressable>

                {/* Package Cards */}
                {stats.packages && stats.packages.length > 0 ? (
                  <View style={styles.packageCardsList}>
                    {stats.packages.map((pkg) => {
                      const isDepleted = pkg.remainingCredits <= 0;
                      const isExpired = pkg.expiryDate && new Date(pkg.expiryDate) < new Date();
                      const typeColor = pkg.creditType === "private" ? Colors.dark.orange : 
                                       pkg.creditType === "semi_private" ? Colors.dark.primary : Colors.dark.xpCyan;
                      const typeLabel = pkg.creditType === "private" ? "Private" : 
                                       pkg.creditType === "semi_private" ? "Semi-Private" : "Group";
                      const expiryDate = pkg.expiryDate ? new Date(pkg.expiryDate) : null;
                      const pkgPrice = Number(pkg.price) || (Number(pkg.pricePerCredit || 0) * pkg.totalCredits);
                      
                      return (
                        <View key={pkg.id} style={[styles.packageCard, { borderColor: `${typeColor}40` }]}>
                          <View style={styles.packageCardHeader}>
                            <View style={[styles.packageTypeBadge, { backgroundColor: `${typeColor}20` }]}>
                              <Text style={[styles.packageTypeText, { color: typeColor }]}>{typeLabel}</Text>
                            </View>
                            <View style={styles.packageHeaderRight}>
                              <View style={[
                                styles.packagePaymentBadge, 
                                { backgroundColor: pkg.isPaid ? `${Colors.dark.successNeon}20` : `${Colors.dark.gold}20` }
                              ]}>
                                <Text style={[
                                  styles.packagePaymentText, 
                                  { color: pkg.isPaid ? Colors.dark.successNeon : Colors.dark.gold }
                                ]}>
                                  {pkg.isPaid ? "Paid" : "Unpaid"}
                                </Text>
                              </View>
                              <View style={[
                                styles.packageStatusBadge, 
                                { backgroundColor: isDepleted ? `${Colors.dark.error}20` : `${Colors.dark.successNeon}20` }
                              ]}>
                                <Text style={[
                                  styles.packageStatusText, 
                                  { color: isDepleted ? Colors.dark.error : Colors.dark.successNeon }
                                ]}>
                                  {isDepleted ? "Depleted" : "Active"}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.packageCardBody}>
                            <View style={styles.packageCreditsRow}>
                              <View>
                                <Text style={styles.packageCreditsLabel}>Credits</Text>
                                <Text style={[styles.packageCreditsValue, { color: typeColor }]}>
                                  {pkg.remainingCredits} / {pkg.totalCredits}
                                </Text>
                              </View>
                              {pkgPrice > 0 && (
                                <View style={styles.packagePriceBlock}>
                                  <Text style={styles.packageCreditsLabel}>Price</Text>
                                  <Text style={[styles.packagePriceValue, { color: pkg.isPaid ? Colors.dark.successNeon : Colors.dark.gold }]}>
                                    AED {pkgPrice.toFixed(0)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                          {expiryDate ? (
                            <View style={styles.packageCardFooter}>
                              <Ionicons name="calendar-outline" size={12} color={Colors.dark.textMuted} />
                              <Text style={[
                                styles.packageExpiryText,
                                isExpired && { color: Colors.dark.error }
                              ]}>
                                {isExpired ? "Expired " : "Valid until "}
                                {expiryDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </Text>
                            </View>
                          ) : null}
                          {!pkg.isPaid && (
                            <Pressable 
                              style={styles.markPaidButton}
                              onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                try {
                                  await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
                                  queryClient.invalidateQueries({ queryKey: [`/api/admin/players/${selectedPlayer?.id}/stats`] });
                                  queryClient.invalidateQueries({ queryKey: [`/api/players/${selectedPlayer?.id}/packages`] });
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  Alert.alert("Payment Recorded", "Package marked as paid.");
                                } catch (error) {
                                  console.error("Failed to mark package as paid:", error);
                                  Alert.alert("Error", "Failed to mark as paid. Please try again.");
                                }
                              }}
                            >
                              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.dark.successNeon} />
                              <Text style={styles.markPaidText}>Mark as Paid</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {/* Attendance History Section - Premium */}
              <View style={[styles.section, styles.attendanceSectionPremium]}>
                <View style={styles.attendanceHeader}>
                  <View style={styles.attendanceHeaderLeft}>
                    <View style={styles.attendanceIconWrapper}>
                      <Ionicons name="calendar" size={20} color={Colors.dark.xpCyan} />
                    </View>
                    <View>
                      <Text style={styles.attendanceTitle}>Attendance History</Text>
                      <Text style={styles.attendanceSubtitle}>{filteredSessions?.length || 0} sessions recorded</Text>
                    </View>
                  </View>
                  <Pressable 
                    style={styles.downloadReportButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      generateAttendanceReportPDF(stats, selectedPlayer);
                    }}
                  >
                    <Ionicons name="download-outline" size={16} color="#000" />
                    <Text style={styles.downloadReportText}>Report</Text>
                  </Pressable>
                </View>

                {uniqueSeries.length > 0 ? (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.seriesFilterContainer}
                    contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
                  >
                    <Pressable
                      style={[
                        styles.seriesFilterChip,
                        selectedSeriesFilter === null && styles.seriesFilterChipActive,
                      ]}
                      onPress={() => {
                        setSelectedSeriesFilter(null);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[
                        styles.seriesFilterChipText,
                        selectedSeriesFilter === null && styles.seriesFilterChipTextActive,
                      ]}>All</Text>
                    </Pressable>
                    {uniqueSeries.map((series) => (
                      <Pressable
                        key={series.id}
                        style={[
                          styles.seriesFilterChip,
                          selectedSeriesFilter === series.id && styles.seriesFilterChipActive,
                        ]}
                        onPress={() => {
                          setSelectedSeriesFilter(series.id);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={[
                          styles.seriesFilterChipText,
                          selectedSeriesFilter === series.id && styles.seriesFilterChipTextActive,
                        ]}>{series.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {filteredSessions && filteredSessions.length > 0 ? (
                  <View style={styles.attendanceList}>
                    {filteredSessions.slice(0, 10).map((session: any, index: number) => {
                      const sessionDate = new Date(session.startTime);
                      const isAttended = session.attended === "present";
                      const isAbsent = session.attended === "absent" || session.attended === "no_show";
                      const attendanceLabel = isAttended ? "Present" : isAbsent ? "Absent" : "Pending";
                      const attendanceColor = isAttended ? Colors.dark.successNeon : isAbsent ? Colors.dark.error : Colors.dark.gold;
                      const attendanceIcon = isAttended ? "checkmark-circle" : isAbsent ? "close-circle" : "time";
                      
                      return (
                        <View key={session.id || index} style={styles.attendanceCard}>
                          <View style={styles.attendanceDateSection}>
                            <Text style={styles.attendanceDay}>
                              {sessionDate.toLocaleDateString("en-US", { weekday: "short" })}
                            </Text>
                            <Text style={styles.attendanceDateNum}>
                              {sessionDate.getDate()}
                            </Text>
                            <Text style={styles.attendanceMonth}>
                              {sessionDate.toLocaleDateString("en-US", { month: "short" })}
                            </Text>
                          </View>
                          <View style={styles.attendanceDetails}>
                            <View style={styles.attendanceTimeRow}>
                              <Ionicons name="time-outline" size={14} color={Colors.dark.textMuted} />
                              <Text style={styles.attendanceTimeText}>
                                {sessionDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </Text>
                              <View style={[styles.sessionTypeChip, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                                <Text style={[styles.sessionTypeChipText, { color: Colors.dark.xpCyan }]}>
                                  {session.sessionType === "private" ? "Private" : 
                                   session.sessionType === "semi_private" ? "Semi-Private" : "Group"}
                                </Text>
                              </View>
                            </View>
                            {session.seriesName ? (
                              <Text style={styles.seriesNameText}>{session.seriesName}</Text>
                            ) : null}
                            <View style={styles.attendanceCreditsRow}>
                              <Text style={styles.attendanceCreditsText}>
                                {session.creditsUsed || 1} credit{(session.creditsUsed || 1) > 1 ? "s" : ""} used
                              </Text>
                            </View>
                          </View>
                          <View style={[styles.attendanceStatusBadge, { backgroundColor: `${attendanceColor}15`, borderColor: `${attendanceColor}40` }]}>
                            <Ionicons name={attendanceIcon} size={18} color={attendanceColor} />
                            <Text style={[styles.attendanceStatusText, { color: attendanceColor }]}>
                              {attendanceLabel}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyAttendanceState}>
                    <View style={styles.emptyAttendanceIcon}>
                      <Ionicons name="calendar-outline" size={40} color={Colors.dark.textMuted} />
                    </View>
                    <Text style={styles.emptyAttendanceTitle}>No Sessions Yet</Text>
                    <Text style={styles.emptyAttendanceText}>Sessions will appear here once scheduled</Text>
                  </View>
                )}
              </View>

              {stats.player.parentName || stats.player.parentPhone ? (
                <View style={[styles.section, CardStyles.elevated]}>
                  <Text style={styles.sectionTitle}>Parent/Guardian</Text>
                  {stats.player.parentName ? (
                    <View style={styles.contactRow}>
                      <Ionicons name="person" size={18} color={Colors.dark.textMuted} />
                      <Text style={styles.contactText}>{stats.player.parentName}</Text>
                    </View>
                  ) : null}
                  {stats.player.parentPhone ? (
                    <View style={styles.contactRow}>
                      <Ionicons name="call" size={18} color={Colors.dark.textMuted} />
                      <Text style={styles.contactText}>{stats.player.parentPhone}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {stats.player.medicalNotes ? (
                <View style={[styles.section, CardStyles.elevated, styles.medicalSection]}>
                  <Text style={styles.sectionTitle}>Medical Notes</Text>
                  <Text style={styles.medicalText}>{stats.player.medicalNotes}</Text>
                </View>
              ) : null}

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Player Invite Link</Text>
                <Text style={styles.inviteDescription}>
                  Share this link so the player or parent can connect their account
                </Text>
                {inviteError ? (
                  <Pressable 
                    style={styles.inviteLoading} 
                    onPress={() => refetchInvite()}
                  >
                    <Ionicons name="alert-circle" size={20} color={Colors.dark.error} />
                    <Text style={[styles.inviteLoadingText, { color: Colors.dark.error }]}>
                      Failed to load - tap to retry
                    </Text>
                  </Pressable>
                ) : playerInvite?.inviteLink ? (
                  <Pressable 
                    style={[styles.inviteLinkButton, inviteCopied && styles.inviteLinkButtonCopied]}
                    onPress={handleCopyInviteLink}
                  >
                    <View style={styles.inviteLinkContent}>
                      <Ionicons 
                        name={inviteCopied ? "checkmark-circle" : "link"} 
                        size={20} 
                        color={inviteCopied ? Colors.dark.successNeon : Colors.dark.orange} 
                      />
                      <Text style={[styles.inviteLinkText, inviteCopied && styles.inviteLinkTextCopied]}>
                        {inviteCopied ? "Link Copied!" : "Copy Invite Link"}
                      </Text>
                    </View>
                    <Ionicons name="copy-outline" size={18} color={Colors.dark.textMuted} />
                  </Pressable>
                ) : inviteLoading ? (
                  <View style={styles.inviteLoading}>
                    <ActivityIndicator size="small" color={Colors.dark.orange} />
                    <Text style={styles.inviteLoadingText}>Generating invite link...</Text>
                  </View>
                ) : null}
              </View>

              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteText}>Delete Player</Text>
              </Pressable>
            </ScrollView>
          ) : selectedPlayer ? (
            <ScrollView 
              style={styles.detailScroll}
              contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 40 }]}
            >
              <View style={styles.profileSection}>
                <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(selectedPlayer.ballLevel) }]}>
                  <Text style={styles.profileAvatarText}>
                    {selectedPlayer.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
                <Text style={styles.profileName}>{selectedPlayer.name}</Text>
                <View style={[styles.levelBadge, { backgroundColor: `${getBallLevelColor(selectedPlayer.ballLevel)}20` }]}>
                  <View style={[styles.levelDot, { backgroundColor: getBallLevelColor(selectedPlayer.ballLevel) }]} />
                  <Text style={[styles.levelText, { color: getBallLevelColor(selectedPlayer.ballLevel) }]}>
                    {selectedPlayer.ballLevel || "Unknown"} Ball
                  </Text>
                </View>
                {selectedPlayer.email ? (
                  <Text style={styles.profileEmail}>{selectedPlayer.email}</Text>
                ) : null}
              </View>

              <View style={[styles.section, CardStyles.elevated]}>
                <Text style={styles.sectionTitle}>Basic Info</Text>
                <View style={styles.contactRow}>
                  <Ionicons name="call" size={18} color={Colors.dark.textMuted} />
                  <Text style={styles.contactText}>{selectedPlayer.phone || "No phone"}</Text>
                </View>
              </View>

              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.dark.orange} />
                <Text style={styles.loadingText}>Loading full stats...</Text>
              </View>

              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                <Text style={styles.deleteText}>Delete Player</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <Ionicons name="person-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.errorText}>No player selected</Text>
            </View>
          )}
        </View>
      </Modal>
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

  const renderInlinePlayerProfile = () => {
    const stats = playerStats;
    
    return (
      <ScrollView 
        style={styles.inlineProfileScroll}
        contentContainerStyle={[styles.inlineProfileContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button Header */}
        <View style={styles.inlineProfileHeader}>
          <Pressable 
            style={styles.backButton}
            onPress={() => {
              closeDetailModal();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
            <Text style={styles.backButtonText}>Back to Players</Text>
          </Pressable>
          <Pressable onPress={() => {
            if (stats?.player) {
              setEditingPlayer({
                id: stats.player.id,
                name: stats.player.name,
                email: stats.player.email,
                phone: stats.player.phone,
                ballLevel: stats.player.ballLevel,
              });
              setFormData({
                name: stats.player.name || "",
                email: stats.player.email || "",
                phone: stats.player.phone || "",
                ballLevel: stats.player.ballLevel || "green",
                parentName: stats.player.parentName || "",
                parentPhone: stats.player.parentPhone || "",
              });
              closeDetailModal();
              setShowAddModal(true);
            }
          }}>
            <Ionicons name="pencil" size={20} color={Colors.dark.orange} />
          </Pressable>
        </View>

        {statsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.orange} />
            <Text style={styles.loadingText}>Loading player details...</Text>
          </View>
        ) : statsError ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.dark.error} />
            <Text style={styles.errorText}>Failed to load player details</Text>
            <Pressable style={styles.retryButton} onPress={() => refetchStats()}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : stats ? (
          <>
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <View style={[styles.profileAvatar, { borderColor: getBallLevelColor(stats.player.ballLevel) }]}>
                <Text style={styles.profileAvatarText}>
                  {stats.player.name?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
              <Text style={styles.profileName}>{stats.player.name}</Text>
              <View style={[styles.ballBadgeLarge, { backgroundColor: `${getBallLevelColor(stats.player.ballLevel)}20` }]}>
                <View style={[styles.ballDotLarge, { backgroundColor: getBallLevelColor(stats.player.ballLevel) }]} />
                <Text style={[styles.ballTextLarge, { color: getBallLevelColor(stats.player.ballLevel) }]}>
                  {stats.player.ballLevel || "N/A"} Ball
                </Text>
              </View>
              {stats.player.coachName ? (
                <Text style={styles.coachAssignment}>Coach: {stats.player.coachName}</Text>
              ) : null}
            </View>

            {/* Attendance Section */}
            <View style={[styles.section, CardStyles.elevated]}>
              <Text style={styles.sectionTitle}>Attendance</Text>
              <View style={styles.statsGrid}>
                <StatItem 
                  icon="checkmark-circle" 
                  label="Attended" 
                  value={stats.attendance.attended}
                  color={Colors.dark.successNeon}
                />
                <StatItem 
                  icon="close-circle" 
                  label="Missed" 
                  value={stats.attendance.missed}
                  color={Colors.dark.error}
                />
                <StatItem 
                  icon="trending-up" 
                  label="Rate" 
                  value={`${stats.attendance.rate}%`}
                  color={Colors.dark.orange}
                />
                <StatItem 
                  icon="flame" 
                  label="Streak" 
                  value={stats.attendance.streak}
                  color={Colors.dark.gold}
                />
              </View>
            </View>

            {/* Progress Section - Collapsible */}
            <Pressable 
              style={[styles.section, CardStyles.elevated]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setProgressExpanded(!progressExpanded);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.sectionTitle}>Progress</Text>
                <Ionicons 
                  name={progressExpanded ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color={Colors.dark.textMuted} 
                />
              </View>
              {progressExpanded ? (
                <>
                  <View style={styles.progressHeader}>
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelNumber}>{stats.progress.level}</Text>
                      <Text style={styles.levelLabel}>Level</Text>
                    </View>
                    <View style={styles.xpInfo}>
                      <Text style={styles.xpText}>{stats.progress.xp} / {stats.progress.xpToNextLevel} XP</Text>
                      <View style={styles.xpBar}>
                        <View 
                          style={[
                            styles.xpFill, 
                            { width: `${(stats.progress.xp / stats.progress.xpToNextLevel) * 100}%` }
                          ]} 
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.skillsSection}>
                    <SkillBar label="Technical" value={stats.progress.skills.technical} color={Colors.dark.xpCyan} />
                    <SkillBar label="Tactical" value={stats.progress.skills.tactical} color={Colors.dark.primary} />
                    <SkillBar label="Physical" value={stats.progress.skills.physical} color={Colors.dark.orange} />
                    <SkillBar label="Mental" value={stats.progress.skills.mental} color={Colors.dark.gold} />
                    <SkillBar label="Social" value={stats.progress.skills.social} color={Colors.dark.successNeon} />
                  </View>
                </>
              ) : null}
            </Pressable>

            {/* Payments Section */}
            <View style={[styles.section, CardStyles.elevated]}>
              <Text style={styles.sectionTitle}>Payments</Text>
              <View style={styles.paymentSummary}>
                <View style={[
                  styles.paymentStatusBadge, 
                  { backgroundColor: `${getPaymentStatusColor(stats.payments.status)}20` }
                ]}>
                  <Text style={[styles.paymentStatusText, { color: getPaymentStatusColor(stats.payments.status) }]}>
                    {stats.payments.status?.toUpperCase() || "N/A"}
                  </Text>
                </View>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Total Owed</Text>
                <Text style={[styles.financeValue, { color: Colors.dark.error }]}>
                  {stats.payments.currency} {stats.payments.totalOwed}
                </Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Total Paid</Text>
                <Text style={[styles.financeValue, { color: Colors.dark.successNeon }]}>
                  {stats.payments.currency} {stats.payments.totalPaid}
                </Text>
              </View>
              {stats.payments.lastPaymentDate ? (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Last Payment</Text>
                  <Text style={styles.financeValue}>{stats.payments.lastPaymentDate}</Text>
                </View>
              ) : null}
              <View style={styles.paymentActions}>
                <Pressable 
                  style={styles.recordPaymentButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowRecordPaymentModal(true);
                  }}
                >
                  <Ionicons name="card-outline" size={16} color="#000" />
                  <Text style={styles.recordPaymentText}>Record Payment</Text>
                </Pressable>
                <Pressable 
                  style={styles.createInvoiceButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowInvoiceModal(true);
                  }}
                >
                  <Ionicons name="document-text-outline" size={16} color={Colors.dark.successNeon} />
                  <Text style={styles.createInvoiceText}>Create Invoice</Text>
                </Pressable>
              </View>
            </View>

            {/* Packages Section */}
            <View style={[styles.section, CardStyles.elevated]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="ticket-outline" size={18} color={Colors.dark.primary} />
                  <Text style={styles.sectionTitle}>Packages</Text>
                </View>
                <Pressable 
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: Colors.dark.successNeon,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    shadowColor: Colors.dark.successNeon,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.4,
                    shadowRadius: 6,
                    elevation: 4,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowCreditStoreModal(true);
                  }}
                >
                  <Ionicons name="add" size={18} color="#0B0D10" />
                  <Text style={{ color: '#0B0D10', fontSize: 13, fontWeight: '700' }}>Add Package</Text>
                </Pressable>
              </View>
              
              {stats.packages && stats.packages.length > 0 ? (
                <View style={styles.packagesGrid}>
                  {stats.packages.map((pkg: PlayerPackage) => {
                    const remaining = pkg.remainingCredits ?? pkg.remaining ?? 0;
                    const total = pkg.totalCredits || 0;
                    const percentage = total > 0 ? (remaining / total) * 100 : 0;
                    const creditColor = remaining > 0 ? Colors.dark.successNeon : Colors.dark.textMuted;
                    
                    return (
                      <View 
                        key={pkg.id} 
                        style={[
                          styles.premiumPackageCard,
                          !pkg.isPaid && styles.premiumPackageCardUnpaid
                        ]}
                      >
                        <LinearGradient
                          colors={[
                            pkg.isPaid ? 'rgba(200, 255, 61, 0.08)' : 'rgba(255, 152, 0, 0.08)',
                            'transparent'
                          ]}
                          style={styles.packageGradient}
                        />
                        <View style={styles.premiumPackageHeader}>
                          <View style={styles.packageTypeRow}>
                            <View style={[
                              styles.packageIconBadge,
                              { backgroundColor: pkg.isPaid ? `${Colors.dark.successNeon}20` : `${Colors.dark.orange}20` }
                            ]}>
                              <Ionicons 
                                name="ticket" 
                                size={16} 
                                color={pkg.isPaid ? Colors.dark.successNeon : Colors.dark.orange} 
                              />
                            </View>
                            <Text style={styles.premiumPackageName}>
                              {(pkg.packageName || pkg.creditType || 'Package').charAt(0).toUpperCase() + 
                               (pkg.packageName || pkg.creditType || 'Package').slice(1)}
                            </Text>
                          </View>
                          {!pkg.isPaid ? (
                            <View style={styles.premiumUnpaidBadge}>
                              <Text style={styles.premiumUnpaidText}>UNPAID</Text>
                            </View>
                          ) : (
                            <View style={styles.premiumPaidBadge}>
                              <Text style={styles.premiumPaidText}>PAID</Text>
                            </View>
                          )}
                        </View>
                        
                        <View style={styles.premiumCreditsSection}>
                          <View style={styles.creditsDisplay}>
                            <Text style={[styles.premiumCreditsValue, { color: creditColor }]}>
                              {remaining}
                            </Text>
                            <Text style={styles.premiumCreditsDivider}>/</Text>
                            <Text style={styles.premiumCreditsTotal}>{total}</Text>
                            <Text style={styles.premiumCreditsLabel}>credits</Text>
                          </View>
                          <View style={styles.creditsProgressBar}>
                            <View 
                              style={[
                                styles.creditsProgressFill,
                                { 
                                  width: `${percentage}%`,
                                  backgroundColor: creditColor
                                }
                              ]} 
                            />
                          </View>
                        </View>
                        
                        {pkg.expiresAt || pkg.expiryDate ? (
                          <View style={styles.packageExpiryRow}>
                            <Ionicons name="calendar-outline" size={12} color={Colors.dark.textMuted} />
                            <Text style={styles.premiumPackageExpiry}>
                              Expires {new Date(pkg.expiresAt || pkg.expiryDate).toLocaleDateString()}
                            </Text>
                          </View>
                        ) : null}
                        
                        {!pkg.isPaid && (
                          <Pressable
                            style={styles.premiumMarkPaidButton}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              setSelectedPackageForPayment(pkg);
                              setPaymentMethod("cash");
                              setPaymentDate(new Date());
                              setShowMarkPaidModal(true);
                            }}
                          >
                            <Ionicons name="checkmark-circle" size={14} color={Colors.dark.successNeon} />
                            <Text style={styles.premiumMarkPaidText}>Mark as Paid</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyPackages}>
                  <Ionicons name="ticket-outline" size={32} color={Colors.dark.textMuted} />
                  <Text style={styles.emptyPackagesText}>No packages yet</Text>
                </View>
              )}
            </View>

            {/* Attendance History Section - Premium */}
            <View style={[styles.section, CardStyles.elevated, { overflow: 'hidden' }]}>
              <LinearGradient
                colors={['rgba(0, 224, 255, 0.08)', 'transparent']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${Colors.dark.xpCyan}15`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
                  </View>
                  <View>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance History</Text>
                    <Text style={{ fontSize: 12, color: Colors.dark.textMuted, marginTop: 2 }}>{filteredSessions?.length || 0} sessions recorded</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    if (stats && selectedPlayer) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      generateAttendanceReportPDF(stats, selectedPlayer);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#FF0000',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: '#FF0000',
                  }}
                >
                  <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Report</Text>
                </Pressable>
              </View>
              
              {uniqueSeries.length > 0 ? (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.seriesFilterContainer}
                  contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}
                >
                  <Pressable
                    style={[
                      styles.seriesFilterChip,
                      selectedSeriesFilter === null && styles.seriesFilterChipActive,
                    ]}
                    onPress={() => {
                      setSelectedSeriesFilter(null);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.seriesFilterChipText,
                      selectedSeriesFilter === null && styles.seriesFilterChipTextActive,
                    ]}>All</Text>
                  </Pressable>
                  {uniqueSeries.map((series) => (
                    <Pressable
                      key={series.id}
                      style={[
                        styles.seriesFilterChip,
                        selectedSeriesFilter === series.id && styles.seriesFilterChipActive,
                      ]}
                      onPress={() => {
                        setSelectedSeriesFilter(series.id);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <Text style={[
                        styles.seriesFilterChipText,
                        selectedSeriesFilter === series.id && styles.seriesFilterChipTextActive,
                      ]}>{series.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {filteredSessions && filteredSessions.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {filteredSessions.slice(0, 10).map((session: { id: string; startTime: string; sessionType: string; attended: string }) => {
                    const sessionDate = session.startTime ? new Date(session.startTime) : null;
                    const dayName = sessionDate ? sessionDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : 'N/A';
                    const dayNum = sessionDate ? sessionDate.getDate() : '';
                    const monthName = sessionDate ? sessionDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';
                    const timeStr = sessionDate ? sessionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
                    const statusColor = session.attended === 'present' ? Colors.dark.successNeon : 
                      session.attended === 'absent' ? Colors.dark.error : Colors.dark.orange;
                    const statusText = session.attended === 'present' ? 'Present' : 
                      session.attended === 'absent' ? 'Absent' : 'Pending';
                    
                    return (
                      <View 
                        key={session.id} 
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: 'rgba(30, 35, 45, 0.8)',
                          borderRadius: 12,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.06)',
                        }}
                      >
                        <View style={{
                          width: 54,
                          height: 60,
                          backgroundColor: `${Colors.dark.xpCyan}10`,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 14,
                          borderWidth: 1,
                          borderColor: `${Colors.dark.xpCyan}30`,
                        }}>
                          <Text style={{ fontSize: 10, color: Colors.dark.xpCyan, fontWeight: '600', letterSpacing: 0.5 }}>{dayName}</Text>
                          <Text style={{ fontSize: 22, color: Colors.dark.text, fontWeight: '700' }}>{dayNum}</Text>
                          <Text style={{ fontSize: 9, color: Colors.dark.textMuted, fontWeight: '500' }}>{monthName}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <View style={{
                              backgroundColor: `${Colors.dark.primary}20`,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 6,
                            }}>
                              <Text style={{ fontSize: 11, color: Colors.dark.primary, fontWeight: '600', textTransform: 'capitalize' }}>
                                {session.sessionType || 'Session'}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 13, color: Colors.dark.textMuted }}>{timeStr}</Text>
                        </View>
                        <View style={{
                          backgroundColor: `${statusColor}15`,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: `${statusColor}40`,
                        }}>
                          <Text style={{ fontSize: 12, color: statusColor, fontWeight: '600' }}>{statusText}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <Ionicons name="calendar-outline" size={40} color={Colors.dark.textMuted} />
                  <Text style={{ color: Colors.dark.textMuted, marginTop: 12, fontSize: 14 }}>No sessions recorded yet</Text>
                </View>
              )}
            </View>

            {/* Invite Link Section */}
            <View style={[styles.section, CardStyles.elevated]}>
              <View style={styles.premiumInviteHeader}>
                <View style={styles.inviteIconBadge}>
                  <Ionicons name="link" size={18} color={Colors.dark.xpCyan} />
                </View>
                <Text style={styles.premiumSectionTitle}>Player Invite</Text>
              </View>
              {inviteLoading ? (
                <View style={styles.inviteLoadingState}>
                  <ActivityIndicator size="small" color={Colors.dark.orange} />
                  <Text style={styles.inviteLoadingStateText}>Generating invite...</Text>
                </View>
              ) : playerInvite?.inviteLink ? (
                <View style={styles.premiumInviteContainer}>
                  <View style={styles.inviteCodeBox}>
                    <Text style={styles.inviteCodeLabel}>Invite Code</Text>
                    <Text style={styles.premiumInviteCode}>{playerInvite.inviteCode}</Text>
                  </View>
                  <Pressable
                    style={[styles.premiumCopyButton, inviteCopied && styles.premiumCopyButtonCopied]}
                    onPress={handleCopyInviteLink}
                  >
                    <LinearGradient
                      colors={inviteCopied 
                        ? ['rgba(200, 255, 61, 0.2)', 'rgba(200, 255, 61, 0.1)'] 
                        : ['rgba(0, 224, 255, 0.15)', 'rgba(0, 224, 255, 0.05)']}
                      style={styles.copyButtonGradient}
                    />
                    <Ionicons 
                      name={inviteCopied ? "checkmark-circle" : "copy"} 
                      size={18} 
                      color={inviteCopied ? Colors.dark.successNeon : Colors.dark.xpCyan} 
                    />
                    <Text style={[styles.premiumCopyButtonText, inviteCopied && styles.premiumCopyButtonTextCopied]}>
                      {inviteCopied ? "Copied!" : "Copy Invite Link"}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.noInviteState}>
                  <Ionicons name="link-outline" size={24} color={Colors.dark.textMuted} />
                  <Text style={styles.noInviteText}>No invite link available</Text>
                </View>
              )}
            </View>

            {/* Delete Player Button */}
            <Pressable 
              style={styles.deletePlayerButton}
              onPress={() => setShowDeleteModal(true)}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
              <Text style={styles.deletePlayerText}>Delete Player</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    );
  };

  // Check if we should show inline profile
  const showInlineProfile = selectedPlayerId && showDetailModal;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["rgba(255,152,0,0.15)", "transparent"]}
        style={styles.headerGradient}
      />

      {showInlineProfile ? (
        renderInlinePlayerProfile()
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

      {renderDetailModal()}

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + Spacing.lg }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingPlayer ? "Edit Player" : "Add Player"}
            </Text>
            <Pressable 
              onPress={handleSubmit}
              disabled={addPlayerMutation.isPending}
            >
              <Text style={[styles.saveButton, addPlayerMutation.isPending && styles.disabledButton]}>
                {addPlayerMutation.isPending ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.formScroll}
            contentContainerStyle={styles.form}
          >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                placeholder="Player name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="player@example.com"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
                placeholder="+971 50 123 4567"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Ball Level</Text>
              <View style={styles.ballLevelSelector}>
                {BALL_LEVELS.map((level) => (
                  <Pressable
                    key={level}
                    style={[
                      styles.ballLevelOption,
                      formData.ballLevel === level && styles.ballLevelSelected,
                      { borderColor: getBallLevelColor(level) },
                    ]}
                    onPress={() => {
                      setFormData((prev) => ({ ...prev, ballLevel: level }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <View style={[styles.ballLevelDot, { backgroundColor: getBallLevelColor(level) }]} />
                    <Text style={[styles.ballLevelText, { color: getBallLevelColor(level) }]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formDivider}>
              <Text style={styles.formDividerText}>Parent/Guardian</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Name</Text>
              <TextInput
                style={styles.input}
                value={formData.parentName}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, parentName: text }))}
                placeholder="Parent name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Parent Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.parentPhone}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, parentPhone: text }))}
                placeholder="+971 50 123 4567"
                placeholderTextColor={Colors.dark.textMuted}
                keyboardType="phone-pad"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

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

      {/* Mark Package as Paid Modal */}
      <Modal
        visible={showMarkPaidModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMarkPaidModal(false)}
      >
        <View 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMarkPaidModal(false)} />
          <View 
            style={{
              backgroundColor: '#11141A',
              borderRadius: 16,
              padding: 24,
              width: '90%',
              maxWidth: 400,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${Colors.dark.successNeon}15`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="card" size={20} color={Colors.dark.successNeon} />
                </View>
                <Text style={{ color: Colors.dark.text, fontSize: 18, fontWeight: '700' }}>Record Payment</Text>
              </View>
              <Pressable onPress={() => setShowMarkPaidModal(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            {selectedPackageForPayment && (
              <View style={{ backgroundColor: 'rgba(200,255,61,0.08)', padding: 16, borderRadius: 12, marginBottom: 20 }}>
                <Text style={{ color: Colors.dark.textMuted, fontSize: 12, marginBottom: 4 }}>Package</Text>
                <Text style={{ color: Colors.dark.text, fontSize: 16, fontWeight: '600' }}>
                  {(selectedPackageForPayment.packageName || selectedPackageForPayment.creditType || 'Package').charAt(0).toUpperCase() + 
                   (selectedPackageForPayment.packageName || selectedPackageForPayment.creditType || 'Package').slice(1)}
                </Text>
                <Text style={{ color: Colors.dark.successNeon, fontSize: 14, marginTop: 4 }}>
                  {selectedPackageForPayment.totalCredits} credits
                </Text>
              </View>
            )}

            <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: '600', marginBottom: 12 }}>Payment Method</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <Pressable
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: paymentMethod === 'cash' ? Colors.dark.successNeon : 'rgba(255,255,255,0.1)',
                  backgroundColor: paymentMethod === 'cash' ? `${Colors.dark.successNeon}15` : 'transparent',
                  alignItems: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPaymentMethod('cash');
                }}
              >
                <Ionicons name="cash" size={24} color={paymentMethod === 'cash' ? Colors.dark.successNeon : Colors.dark.textMuted} />
                <Text style={{ color: paymentMethod === 'cash' ? Colors.dark.successNeon : Colors.dark.textMuted, marginTop: 8, fontWeight: '600' }}>Cash</Text>
              </Pressable>
              <Pressable
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: paymentMethod === 'bank_transfer' ? Colors.dark.xpCyan : 'rgba(255,255,255,0.1)',
                  backgroundColor: paymentMethod === 'bank_transfer' ? `${Colors.dark.xpCyan}15` : 'transparent',
                  alignItems: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPaymentMethod('bank_transfer');
                }}
              >
                <Ionicons name="business" size={24} color={paymentMethod === 'bank_transfer' ? Colors.dark.xpCyan : Colors.dark.textMuted} />
                <Text style={{ color: paymentMethod === 'bank_transfer' ? Colors.dark.xpCyan : Colors.dark.textMuted, marginTop: 8, fontWeight: '600' }}>Bank</Text>
              </Pressable>
            </View>

            <Text style={{ color: Colors.dark.text, fontSize: 14, fontWeight: '600', marginBottom: 12 }}>Payment Date</Text>
            <Pressable
              style={{
                padding: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(255,255,255,0.05)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                marginBottom: 24,
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowPaymentDatePicker(true);
              }}
            >
              <Ionicons name="calendar" size={20} color={Colors.dark.orange} />
              <Text style={{ color: Colors.dark.text, fontSize: 16 }}>
                {paymentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
            </Pressable>
            
            {showPaymentDatePicker && (
              <View style={{ marginBottom: 16 }}>
                <DateTimePicker
                  value={paymentDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    if (Platform.OS === 'android') {
                      setShowPaymentDatePicker(false);
                    }
                    if (selectedDate) {
                      setPaymentDate(selectedDate);
                    }
                  }}
                  textColor="#FFFFFF"
                  themeVariant="dark"
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    style={{
                      backgroundColor: Colors.dark.orange,
                      padding: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                      marginTop: 8,
                    }}
                    onPress={() => setShowPaymentDatePicker(false)}
                  >
                    <Text style={{ color: '#0B0D10', fontWeight: '600' }}>Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Pressable
              style={{
                backgroundColor: Colors.dark.successNeon,
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={async () => {
                if (!selectedPackageForPayment) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                try {
                  await apiRequest("PATCH", `/api/packages/${selectedPackageForPayment.id}`, { 
                    isPaid: true,
                    paymentMethod,
                    paymentDate: paymentDate.toISOString(),
                  });
                  queryClient.invalidateQueries({ queryKey: [`/api/admin/players/${selectedPlayer?.id}/stats`] });
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setShowMarkPaidModal(false);
                  setSelectedPackageForPayment(null);
                } catch (error) {
                  console.error("Failed to mark as paid:", error);
                }
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#0B0D10" />
              <Text style={{ color: '#0B0D10', fontSize: 16, fontWeight: '700' }}>Confirm Payment</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        visible={showRecordPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecordPaymentModal(false)}
      >
        <View style={styles.recordPaymentModalOverlay}>
          <View style={styles.recordPaymentModalContainer}>
            <View style={styles.recordPaymentModalHeader}>
              <Text style={styles.recordPaymentModalTitle}>Record Payment</Text>
              <Pressable 
                style={styles.recordPaymentModalClose}
                onPress={() => setShowRecordPaymentModal(false)}
              >
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.recordPaymentModalContent}>
              {playerStats?.packages?.filter((p: PlayerPackage) => !p.isPaid).length === 0 ? (
                <View style={styles.noUnpaidContainer}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.dark.successNeon} />
                  <Text style={styles.noUnpaidTitle}>All Paid!</Text>
                  <Text style={styles.noUnpaidText}>
                    This player has no outstanding payments.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.unpaidSectionTitle}>Unpaid Packages</Text>
                  {playerStats?.packages?.filter((p: PlayerPackage) => !p.isPaid).map((pkg: PlayerPackage) => (
                    <View key={pkg.id} style={styles.unpaidPackageCard}>
                      <View style={styles.unpaidPackageInfo}>
                        <View style={styles.unpaidPackageRow}>
                          <Ionicons 
                            name={pkg.creditType === "private" ? "person" : pkg.creditType === "semi_private" ? "people" : "people-circle"} 
                            size={20} 
                            color={Colors.dark.primary} 
                          />
                          <Text style={styles.unpaidPackageType}>
                            {pkg.creditType === "private" ? "Private" : pkg.creditType === "semi_private" ? "Semi-Private" : "Group"}
                          </Text>
                        </View>
                        <Text style={styles.unpaidPackageCredits}>
                          {pkg.remainingCredits} / {pkg.totalCredits} credits
                        </Text>
                        <Text style={styles.unpaidPackagePrice}>
                          AED {Number(pkg.price || 0).toLocaleString()}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.markPaidButton}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          try {
                            await apiRequest("PATCH", `/api/packages/${pkg.id}`, { isPaid: true, paidAt: new Date().toISOString() });
                            queryClient.invalidateQueries({ queryKey: [`/api/admin/players/${selectedPlayer?.id}/stats`] });
                            queryClient.invalidateQueries({ queryKey: [`/api/players/${selectedPlayer?.id}/packages`] });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert("Payment Recorded", `Package marked as paid.`);
                          } catch (error) {
                            console.error("Failed to record payment:", error);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            Alert.alert("Error", "Failed to record payment. Please try again.");
                          }
                        }}
                      >
                        <Ionicons name="checkmark" size={18} color="#000" />
                        <Text style={styles.markPaidButtonText}>Mark Paid</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
            
            <Pressable
              style={styles.recordPaymentModalDone}
              onPress={() => setShowRecordPaymentModal(false)}
            >
              <Text style={styles.recordPaymentModalDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.body.fontSize,
    marginTop: Spacing.sm,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  title: {
    ...Typography.h2,
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.dark.text,
    paddingVertical: Spacing.md,
  },
  filterToggle: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  filterToggleActive: {
    backgroundColor: `${Colors.dark.orange}20`,
    borderRadius: BorderRadius.sm,
  },
  filterBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    ...Typography.small,
    fontSize: 10,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  filterContainer: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  filterLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 45,
  },
  filterChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  filterChipActive: {
    backgroundColor: `${Colors.dark.orange}20`,
    borderColor: Colors.dark.orange,
  },
  filterChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  filterChipTextActive: {
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.dark.border,
    marginHorizontal: Spacing.xs,
  },
  clearFiltersButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  clearFiltersText: {
    ...Typography.small,
    color: Colors.dark.orange,
    fontSize: 12,
  },
  list: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Backgrounds.card,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  playerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  playerName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  playerEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  ballBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  ballDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ballText: {
    ...Typography.caption,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  levelText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  coachText: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
  },
  creditsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  creditsBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  creditsText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  playerCardWrapper: {
    marginBottom: Spacing.sm,
  },
  playerCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
    borderBottomWidth: 0,
  },
  expandedContent: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  quickStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: Spacing.md,
  },
  quickStat: {
    alignItems: "center",
  },
  quickStatValue: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  quickStatLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  expandedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.successNeon + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  actionButtonText: {
    ...Typography.caption,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  viewMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  viewMoreText: {
    ...Typography.caption,
    color: Colors.dark.primary,
  },
  packagesSummary: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  packagesSummaryTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  packageSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  packageSummaryName: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  packageSummaryCredits: {
    ...Typography.small,
    fontWeight: "700",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  loadingText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  noDataText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    padding: Spacing.md,
  },
  inlineProfileScroll: {
    flex: 1,
  },
  inlineProfileContent: {
    padding: Spacing.lg,
  },
  inlineProfileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  deletePlayerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
  },
  deletePlayerText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  errorText: {
    ...Typography.body,
    color: Colors.dark.error,
    marginTop: Spacing.md,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.orange,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cancelButton: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  saveButton: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
  formScroll: {
    flex: 1,
  },
  form: {
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
  },
  formDivider: {
    marginVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.lg,
  },
  formDividerText: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
  },
  ballLevelSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ballLevelOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    backgroundColor: Backgrounds.card,
    gap: Spacing.xs,
  },
  ballLevelSelected: {
    backgroundColor: Backgrounds.card,
  },
  ballLevelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ballLevelText: {
    ...Typography.small,
    fontWeight: "600",
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: Spacing.lg,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Backgrounds.card,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  profileAvatarText: {
    ...Typography.h1,
    color: Colors.dark.text,
  },
  profileName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  profileEmail: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ballBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  ballDotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ballTextLarge: {
    ...Typography.body,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  coachAssignment: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: BorderRadius.md,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    width: "45%",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  levelBadge: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.dark.gold}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  levelNumber: {
    ...Typography.h2,
    color: Colors.dark.gold,
  },
  levelLabel: {
    ...Typography.caption,
    color: Colors.dark.gold,
  },
  xpInfo: {
    flex: 1,
  },
  xpText: {
    ...Typography.body,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  xpBar: {
    height: 8,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 4,
    overflow: "hidden",
  },
  xpFill: {
    height: "100%",
    backgroundColor: Colors.dark.gold,
    borderRadius: 4,
  },
  skillsSection: {
    gap: Spacing.sm,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  skillLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    width: 70,
  },
  skillBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  skillBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  skillValue: {
    ...Typography.caption,
    color: Colors.dark.text,
    width: 30,
    textAlign: "right",
  },
  paymentSummary: {
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  paymentStatusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  paymentStatusText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  financeLabel: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  financeValue: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  paymentActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  recordPaymentButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.dark.orange,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  recordPaymentText: {
    ...Typography.body,
    color: "#000",
    fontWeight: "700",
  },
  createInvoiceButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.successNeon + "20",
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "40",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  createInvoiceText: {
    ...Typography.body,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  contactText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  medicalSection: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.error,
  },
  medicalText: {
    ...Typography.body,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  inviteDescription: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  inviteLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}40`,
    padding: Spacing.md,
  },
  inviteLinkButtonCopied: {
    borderColor: `${Colors.dark.successNeon}40`,
  },
  inviteLinkContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  inviteLinkText: {
    ...Typography.body,
    color: Colors.dark.orange,
    fontWeight: "600",
  },
  inviteLinkTextCopied: {
    color: Colors.dark.successNeon,
  },
  inviteLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  inviteLoadingText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.lg,
  },
  deleteText: {
    ...Typography.body,
    color: Colors.dark.error,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  deleteModalContent: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    padding: Spacing.xl,
  },
  deleteModalHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  deleteModalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.dark.error}20`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  deleteModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  deleteModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  deleteOptionsLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deleteOptionsContainer: {
    maxHeight: 280,
  },
  deleteOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  deleteOptionContent: {
    flex: 1,
  },
  deleteOptionLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  deleteOptionDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  warningInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.warning}40`,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  warningText: {
    ...Typography.caption,
    color: Colors.dark.warning,
    flex: 1,
  },
  deleteModalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelDeleteBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
  },
  cancelDeleteBtnText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  confirmDeleteBtn: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteBtnText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  addCreditsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  addCreditsButtonPremium: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  addCreditsButtonText: {
    ...Typography.caption,
    color: "#000",
    fontWeight: "700",
  },
  creditsOverview: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  creditStatCard: {
    flex: 1,
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
  },
  creditStatValue: {
    ...Typography.h2,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  creditStatLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  creditTypeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  creditTypeCard: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: "center",
  },
  creditTypeValue: {
    ...Typography.h3,
    fontWeight: "700",
  },
  creditTypeLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  grantCreditsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  grantCreditsText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  sessionCount: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  sessionsList: {
    gap: Spacing.sm,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  sessionDateBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionIndicator: {
    width: 3,
    height: 32,
    borderRadius: 2,
  },
  sessionDate: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  sessionTime: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sessionTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  sessionTypeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  paymentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  paymentBadgeText: {
    ...Typography.small,
    fontWeight: "600",
  },
  emptySessionsState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptySessionsText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  packageCardsList: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  packageCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  packageCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  packageTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  packageTypeText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  packageStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  packageStatusText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  packageCardBody: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  packageCreditsLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 2,
  },
  packageCreditsValue: {
    ...Typography.h2,
    fontWeight: "700",
  },
  packageCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  packageExpiryText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  packageHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  packagePaymentBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  packagePaymentText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  packageCreditsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
  },
  packagePriceBlock: {
    alignItems: "center",
  },
  packagePriceValue: {
    ...Typography.h3,
    fontWeight: "700",
  },
  markPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.successNeon}40`,
    backgroundColor: `${Colors.dark.successNeon}10`,
  },
  markPaidText: {
    ...Typography.caption,
    color: Colors.dark.successNeon,
    fontWeight: "600",
  },
  packagesGrid: {
    gap: Spacing.md,
  },
  premiumPackageCard: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
    padding: Spacing.lg,
    overflow: "hidden",
  },
  premiumPackageCardUnpaid: {
    borderColor: "rgba(255, 152, 0, 0.25)",
  },
  packageGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  premiumPackageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  packageTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  packageIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumPackageName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  premiumUnpaidBadge: {
    backgroundColor: `${Colors.dark.orange}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.orange}30`,
  },
  premiumUnpaidText: {
    ...Typography.caption,
    color: Colors.dark.orange,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  premiumPaidBadge: {
    backgroundColor: `${Colors.dark.successNeon}20`,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.dark.successNeon}30`,
  },
  premiumPaidText: {
    ...Typography.caption,
    color: Colors.dark.successNeon,
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  premiumCreditsSection: {
    marginBottom: Spacing.sm,
  },
  creditsDisplay: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: Spacing.sm,
  },
  premiumCreditsValue: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
  },
  premiumCreditsDivider: {
    ...Typography.h3,
    color: Colors.dark.textMuted,
    fontWeight: "400",
  },
  premiumCreditsTotal: {
    ...Typography.h3,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  premiumCreditsLabel: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginLeft: 4,
  },
  creditsProgressBar: {
    height: 4,
    backgroundColor: Backgrounds.elevated,
    borderRadius: 2,
    overflow: "hidden",
  },
  creditsProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  packageExpiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
  },
  premiumPackageExpiry: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  premiumMarkPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.successNeon}40`,
    backgroundColor: `${Colors.dark.successNeon}15`,
  },
  premiumMarkPaidText: {
    ...Typography.small,
    color: Colors.dark.successNeon,
    fontWeight: "700",
  },
  emptyPackages: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyPackagesText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  premiumInviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  inviteIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: `${Colors.dark.xpCyan}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumSectionTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  inviteLoadingState: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  inviteLoadingStateText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  premiumInviteContainer: {
    gap: Spacing.md,
  },
  inviteCodeBox: {
    backgroundColor: "rgba(0, 224, 255, 0.08)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(0, 224, 255, 0.15)",
  },
  inviteCodeLabel: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  premiumInviteCode: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  premiumCopyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}30`,
    overflow: "hidden",
  },
  premiumCopyButtonCopied: {
    borderColor: `${Colors.dark.successNeon}40`,
  },
  copyButtonGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  premiumCopyButtonText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "700",
  },
  premiumCopyButtonTextCopied: {
    color: Colors.dark.successNeon,
  },
  noInviteState: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  noInviteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  recordPaymentModalOverlay: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "flex-end",
  },
  recordPaymentModalContainer: {
    backgroundColor: Colors.dark.backgroundElevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    paddingBottom: 34,
  },
  recordPaymentModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  recordPaymentModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  recordPaymentModalClose: {
    padding: Spacing.xs,
  },
  recordPaymentModalContent: {
    padding: Spacing.lg,
  },
  noUnpaidContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  noUnpaidTitle: {
    ...Typography.h3,
    color: Colors.dark.successNeon,
    fontWeight: "700",
  },
  noUnpaidText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  unpaidSectionTitle: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  unpaidPackageCard: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  unpaidPackageInfo: {
    flex: 1,
    gap: 4,
  },
  unpaidPackageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  unpaidPackageType: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  unpaidPackageCredits: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  unpaidPackagePrice: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "700",
  },
  markPaidButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.successNeon,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  markPaidButtonText: {
    ...Typography.caption,
    color: "#000",
    fontWeight: "700",
  },
  recordPaymentModalDone: {
    backgroundColor: Colors.dark.primary,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  recordPaymentModalDoneText: {
    ...Typography.body,
    color: "#000",
    fontWeight: "700",
  },
  attendanceSectionPremium: {
    backgroundColor: Colors.dark.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: `${Colors.dark.xpCyan}20`,
  },
  attendanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: `${Colors.dark.xpCyan}08`,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  attendanceHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  attendanceIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${Colors.dark.xpCyan}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  attendanceTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  attendanceSubtitle: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  downloadReportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.dark.xpCyan,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  downloadReportText: {
    ...Typography.caption,
    color: "#000",
    fontWeight: "700",
  },
  attendanceList: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  attendanceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  attendanceDateSection: {
    width: 50,
    alignItems: "center",
    paddingRight: Spacing.md,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  attendanceDay: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    fontSize: 10,
  },
  attendanceDateNum: {
    ...Typography.h2,
    color: Colors.dark.text,
    fontWeight: "800",
    lineHeight: 28,
  },
  attendanceMonth: {
    ...Typography.caption,
    color: Colors.dark.xpCyan,
    textTransform: "uppercase",
    fontSize: 10,
  },
  attendanceDetails: {
    flex: 1,
    gap: 4,
  },
  attendanceTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  attendanceTimeText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  sessionTypeChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sessionTypeChipText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "600",
  },
  attendanceCreditsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  attendanceCreditsText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  seriesNameText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  attendanceStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  attendanceStatusText: {
    ...Typography.caption,
    fontWeight: "700",
    fontSize: 11,
  },
  emptyAttendanceState: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyAttendanceIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.dark.xpCyan}10`,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyAttendanceTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  emptyAttendanceText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  seriesFilterContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  seriesFilterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  seriesFilterChipActive: {
    backgroundColor: `${Colors.dark.xpCyan}20`,
    borderColor: Colors.dark.xpCyan,
  },
  seriesFilterChipText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  seriesFilterChipTextActive: {
    color: Colors.dark.xpCyan,
  },
});
