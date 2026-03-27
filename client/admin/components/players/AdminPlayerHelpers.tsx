import { styles } from "./adminPlayersStyles";
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
export const generateAttendanceReportPDF = (stats: any, player: any) => {
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

  const safeName = (player?.name || "Player").replace(/[^a-zA-Z0-9]/g, "_");
  if (Platform.OS === "web") {
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}_Attendance_Report.html`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    import("expo-print").then(async ({ printToFileAsync }) => {
      const { uri } = await printToFileAsync({ html: htmlContent });
      const FileSystem = await import("expo-file-system");
      const Sharing = await import("expo-sharing");
      const newUri = `${FileSystem.cacheDirectory}${safeName}_Attendance_Report_${Date.now()}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, {
          mimeType: "application/pdf",
          dialogTitle: `${player?.name || "Player"} Attendance Report`,
          UTI: "com.adobe.pdf",
        });
      } else {
        const Print = await import("expo-print");
        await Print.printAsync({ uri: newUri });
      }
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
    invoices?: {
      id: string;
      invoiceNumber: string;
      amount: number;
      currency: string;
      status: string;
      dueDate?: string;
      paidAt?: string;
      createdAt?: string;
      notes?: string;
      isOverdue: boolean;
    }[];
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

export function StatItem({ icon, label, value, color = Colors.dark.primary }: StatItemProps) {
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

export function SkillBar({ label, value, color }: { label: string; value: number; color: string }) {
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

