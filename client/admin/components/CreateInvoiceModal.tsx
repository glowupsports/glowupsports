import logger from "@/lib/logger";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, CardStyles } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { GLOW_UP_TENNIS_LOGO } from "./logoBase64";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(month: number, year: number) {
  if (month === 1 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month];
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PlayerInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  coachId?: string;
  coachName?: string;
}

interface AcademyInfo {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  logo?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankAccountHolder?: string;
  bankSwiftCode?: string;
}

interface CreateInvoiceModalProps {
  visible: boolean;
  onClose: () => void;
  player: PlayerInfo | null;
  academy?: AcademyInfo;
  onSuccess?: () => void;
}


const formatDate = (date: Date) => {
  return date.toISOString().split("T")[0];
};

const generateInvoicePDF = (invoice: {
  invoiceNumber: string;
  playerName: string;
  playerEmail?: string;
  academyName: string;
  academyAddress?: string;
  academyEmail?: string;
  academyPhone?: string;
  vatRegistrationNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankAccountHolder?: string;
  bankSwiftCode?: string;
  issueDate: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  currency: string;
  notes?: string;
  terms?: string[];
}) => {
  const lineItemsHTML = invoice.lineItems.map((item, index) => `
    <tr style="border-bottom: 1px solid #2a2d35;">
      <td style="padding: 16px; color: #ffffff; font-size: 14px;">${index + 1}</td>
      <td style="padding: 16px; color: #ffffff; font-size: 14px;">${item.description}</td>
      <td style="padding: 16px; color: #ffffff; font-size: 14px; text-align: center;">${item.quantity}</td>
      <td style="padding: 16px; color: #ffffff; font-size: 14px; text-align: right;">${invoice.currency} ${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 16px; color: #C8FF3D; font-size: 14px; text-align: right; font-weight: 600;">${invoice.currency} ${item.total.toFixed(2)}</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        body { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #0B0D10;
          color: #ffffff;
          padding: 32px;
          min-height: 100vh;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .invoice-container {
          max-width: 780px;
          margin: 0 auto;
          background: #12151A;
          border-radius: 20px;
          padding: 40px;
          border: 1px solid #2a2d35;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 48px;
          padding-bottom: 32px;
          border-bottom: 1px solid #2a2d35;
        }
        .logo-row {
          margin-bottom: 12px;
        }
        .logo-img {
          width: 160px;
          height: auto;
        }
        .contact-info {
          color: #6b7280;
          font-size: 12px;
          line-height: 1.6;
        }
        .invoice-badge {
          background: linear-gradient(135deg, #C8FF3D20 0%, #C8FF3D10 100%);
          border: 1px solid #C8FF3D40;
          border-radius: 12px;
          padding: 16px 24px;
          text-align: right;
        }
        .invoice-badge h2 {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: #C8FF3D;
          margin-bottom: 8px;
        }
        .invoice-badge .number {
          font-size: 20px;
          font-weight: 700;
          color: #ffffff;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-bottom: 40px;
        }
        .info-box {
          background: #12151a;
          border-radius: 16px;
          padding: 24px;
          border: 1px solid #1e2128;
        }
        .info-box h3 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #6b7280;
          margin-bottom: 16px;
        }
        .info-box p {
          color: #ffffff;
          font-size: 14px;
          line-height: 1.6;
          margin-bottom: 4px;
        }
        .info-box p.highlight {
          color: #C8FF3D;
          font-weight: 600;
          font-size: 16px;
        }
        .dates-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 32px;
        }
        .date-box {
          background: #12151a;
          border-radius: 12px;
          padding: 16px 20px;
          border: 1px solid #1e2128;
        }
        .date-box label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #6b7280;
          display: block;
          margin-bottom: 6px;
        }
        .date-box span {
          color: #ffffff;
          font-size: 14px;
          font-weight: 500;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 32px;
        }
        th {
          background: #12151a;
          padding: 16px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #6b7280;
          border-bottom: 2px solid #2a2d35;
        }
        th:nth-child(3), th:nth-child(4), th:nth-child(5) {
          text-align: center;
        }
        th:last-child {
          text-align: right;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 40px;
        }
        .totals-box {
          width: 320px;
          background: #12151a;
          border-radius: 16px;
          padding: 24px;
          border: 1px solid #1e2128;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #1e2128;
        }
        .total-row:last-child {
          border-bottom: none;
          padding-top: 16px;
          margin-top: 8px;
          border-top: 2px solid #C8FF3D40;
        }
        .total-row label {
          color: #8a8f9c;
          font-size: 14px;
        }
        .total-row span {
          color: #ffffff;
          font-size: 14px;
          font-weight: 500;
        }
        .total-row.grand label, .total-row.grand span {
          font-size: 18px;
          font-weight: 700;
        }
        .total-row.grand span {
          color: #C8FF3D;
        }
        .notes-section {
          background: #12151a;
          border-radius: 16px;
          padding: 24px;
          border: 1px solid #1e2128;
          margin-bottom: 32px;
        }
        .notes-section h4 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #6b7280;
          margin-bottom: 12px;
        }
        .notes-section p {
          color: #8a8f9c;
          font-size: 14px;
          line-height: 1.6;
        }
        .footer {
          text-align: center;
          padding-top: 32px;
          border-top: 1px solid #2a2d35;
        }
        .footer p {
          color: #6b7280;
          font-size: 12px;
        }
        .footer .brand {
          color: #C8FF3D;
          font-weight: 600;
          font-size: 14px;
          margin-top: 8px;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <div class="logo-section">
            <div class="logo-row">
              <img src="${GLOW_UP_TENNIS_LOGO}" alt="Logo" class="logo-img" />
            </div>
            <p class="contact-info">${invoice.academyAddress || "Dubai, UAE"}<br/>
            ${invoice.academyEmail || "info@glowuptennis.com"}<br/>
            ${invoice.academyPhone || ""}</p>
            <p class="contact-info" style="margin-top: 8px; font-style: italic;">${invoice.vatRegistrationNumber ? `TRN: ${invoice.vatRegistrationNumber}` : "Not VAT registered"}</p>
          </div>
          <div class="invoice-badge">
            <h2>Invoice</h2>
            <div class="number">${invoice.invoiceNumber}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-box">
            <h3>Bill To</h3>
            <p class="highlight">${invoice.playerName}</p>
            <p>${invoice.playerEmail || ""}</p>
          </div>
          <div class="info-box">
            <h3>Invoice Details</h3>
            <p><strong>Issue Date:</strong> ${invoice.issueDate}</p>
            <p><strong>Due Date:</strong> ${invoice.dueDate}</p>
            <p><strong>Currency:</strong> ${invoice.currency}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHTML}
          </tbody>
        </table>

        <div class="totals-section">
          <div class="totals-box">
            <div class="total-row">
              <label>Subtotal</label>
              <span>${invoice.currency} ${invoice.subtotal.toFixed(2)}</span>
            </div>
            ${invoice.taxRate > 0 ? `
            <div class="total-row">
              <label>Tax (${invoice.taxRate}%)</label>
              <span>${invoice.currency} ${invoice.taxAmount.toFixed(2)}</span>
            </div>
            ` : ""}
            ${invoice.discount > 0 ? `
            <div class="total-row">
              <label>Discount</label>
              <span>-${invoice.currency} ${invoice.discount.toFixed(2)}</span>
            </div>
            ` : ""}
            <div class="total-row grand">
              <label>Total Due</label>
              <span>${invoice.currency} ${invoice.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        ${invoice.notes ? `
        <div class="notes-section">
          <h4>Notes</h4>
          <p>${invoice.notes}</p>
        </div>
        ` : ""}

        ${(invoice.bankName || invoice.bankIban || invoice.bankAccountNumber) ? `
        <div class="notes-section" style="margin-top: 24px;">
          <h4>Payment Details - Bank Transfer</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px;">
            ${invoice.bankName ? `<p><strong style="color: #6b7280;">Bank Name:</strong><br/><span style="color: #ffffff; font-weight: 500;">${invoice.bankName}</span></p>` : ""}
            ${invoice.bankAccountHolder ? `<p><strong style="color: #6b7280;">Account Holder:</strong><br/><span style="color: #ffffff; font-weight: 500;">${invoice.bankAccountHolder}</span></p>` : ""}
            ${invoice.bankAccountNumber ? `<p><strong style="color: #6b7280;">Account Number:</strong><br/><span style="color: #C8FF3D; font-weight: 600; font-family: monospace;">${invoice.bankAccountNumber}</span></p>` : ""}
            ${invoice.bankIban ? `<p><strong style="color: #6b7280;">IBAN:</strong><br/><span style="color: #C8FF3D; font-weight: 600; font-family: monospace;">${invoice.bankIban}</span></p>` : ""}
            ${invoice.bankSwiftCode ? `<p><strong style="color: #6b7280;">SWIFT/BIC:</strong><br/><span style="color: #ffffff; font-weight: 500; font-family: monospace;">${invoice.bankSwiftCode}</span></p>` : ""}
          </div>
        </div>
        ` : ""}

        ${invoice.terms && invoice.terms.length > 0 ? `
        <div class="notes-section" style="margin-top: 24px; border-top: 1px solid #2a2d35; padding-top: 20px;">
          <h4 style="color: #C8FF3D; margin-bottom: 12px;">Terms & Conditions</h4>
          <ol style="color: #9ca3af; font-size: 12px; line-height: 1.8; padding-left: 16px; margin: 0;">
            ${invoice.terms.map(t => `<li style="margin-bottom: 4px;">${t}</li>`).join("")}
          </ol>
        </div>
        ` : ""}

        <div class="footer">
          <p>Thank you for choosing ${invoice.academyName}</p>
          <p class="brand">Powered by Glow Up Sports</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  date: Date;
  onDateChange: (date: Date) => void;
  title: string;
}

function DatePickerModal({ visible, onClose, date, onDateChange, title }: DatePickerModalProps) {
  const [selectedYear, setSelectedYear] = useState(date.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(date.getMonth());
  const [selectedDay, setSelectedDay] = useState(date.getDate());

  useEffect(() => {
    setSelectedYear(date.getFullYear());
    setSelectedMonth(date.getMonth());
    setSelectedDay(date.getDate());
  }, [date, visible]);

  const daysInCurrentMonth = getDaysInMonth(selectedMonth, selectedYear);
  const days = Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i);

  const handleConfirm = () => {
    const newDate = new Date(selectedYear, selectedMonth, selectedDay);
    onDateChange(newDate);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={datePickerStyles.overlay} onPress={onClose}>
        <Pressable style={datePickerStyles.container} onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={["#C8FF3D15", "transparent"]}
            style={datePickerStyles.gradient}
          />
          <Text style={datePickerStyles.title}>{title}</Text>
          
          <View style={datePickerStyles.pickersRow}>
            <View style={datePickerStyles.pickerColumn}>
              <Text style={datePickerStyles.pickerLabel}>Day</Text>
              <ScrollView style={datePickerStyles.pickerScroll} showsVerticalScrollIndicator={false}>
                {days.map((day) => (
                  <Pressable
                    key={day}
                    style={[
                      datePickerStyles.pickerItem,
                      selectedDay === day && datePickerStyles.pickerItemSelected,
                    ]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text style={[
                      datePickerStyles.pickerItemText,
                      selectedDay === day && datePickerStyles.pickerItemTextSelected,
                    ]}>
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            
            <View style={datePickerStyles.pickerColumn}>
              <Text style={datePickerStyles.pickerLabel}>Month</Text>
              <ScrollView style={datePickerStyles.pickerScroll} showsVerticalScrollIndicator={false}>
                {MONTHS.map((month, index) => (
                  <Pressable
                    key={month}
                    style={[
                      datePickerStyles.pickerItem,
                      selectedMonth === index && datePickerStyles.pickerItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedMonth(index);
                      const maxDays = getDaysInMonth(index, selectedYear);
                      if (selectedDay > maxDays) setSelectedDay(maxDays);
                    }}
                  >
                    <Text style={[
                      datePickerStyles.pickerItemText,
                      selectedMonth === index && datePickerStyles.pickerItemTextSelected,
                    ]}>
                      {month}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            
            <View style={datePickerStyles.pickerColumn}>
              <Text style={datePickerStyles.pickerLabel}>Year</Text>
              <ScrollView style={datePickerStyles.pickerScroll} showsVerticalScrollIndicator={false}>
                {years.map((year) => (
                  <Pressable
                    key={year}
                    style={[
                      datePickerStyles.pickerItem,
                      selectedYear === year && datePickerStyles.pickerItemSelected,
                    ]}
                    onPress={() => setSelectedYear(year)}
                  >
                    <Text style={[
                      datePickerStyles.pickerItemText,
                      selectedYear === year && datePickerStyles.pickerItemTextSelected,
                    ]}>
                      {year}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
          
          <View style={datePickerStyles.selectedPreview}>
            <Text style={datePickerStyles.previewText}>
              {selectedDay} {MONTHS[selectedMonth]} {selectedYear}
            </Text>
          </View>
          
          <View style={datePickerStyles.buttonsRow}>
            <Pressable style={datePickerStyles.cancelButton} onPress={onClose}>
              <Text style={datePickerStyles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={datePickerStyles.confirmButton} onPress={handleConfirm}>
              <Text style={datePickerStyles.confirmButtonText}>Confirm</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const datePickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  container: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
    overflow: "hidden",
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  pickersRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pickerColumn: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  pickerScroll: {
    height: 160,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xs,
  },
  pickerItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  pickerItemSelected: {
    backgroundColor: Colors.dark.primary,
  },
  pickerItemText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  pickerItemTextSelected: {
    color: "#0B0D10",
    fontWeight: "700",
  },
  selectedPreview: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "40",
  },
  previewText: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "600",
    color: Colors.dark.primary,
    textAlign: "center",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
  },
  confirmButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: "#0B0D10",
  },
});

export default function CreateInvoiceModal({
  visible,
  onClose,
  player,
  academy: academyProp,
  onSuccess,
}: CreateInvoiceModalProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const { data: fetchedAcademy } = useQuery<AcademyInfo>({
    queryKey: ["/api/admin/academy"],
    enabled: visible && !academyProp,
  });
  
  const { data: academySettings } = useQuery<{ vatRegistrationNumber?: string }>({
    queryKey: ["/api/academy/settings"],
    enabled: visible,
  });
  
  const academy = academyProp || fetchedAcademy;
  
  const { data: invoiceNumberData } = useQuery<{ invoiceNumber: string }>({
    queryKey: ["/api/admin/next-invoice-number"],
    enabled: visible,
  });

  const { data: courtsData } = useQuery<any[]>({
    queryKey: ["/api/courts"],
    enabled: visible,
  });

  const { data: playerStatsData } = useQuery<any>({
    queryKey: ["/api/admin/players", player?.id, "stats"],
    enabled: visible && !!player?.id,
  });

  const [showCourtRental, setShowCourtRental] = useState(false);
  const [courtRentalPeriod, setCourtRentalPeriod] = useState<"30" | "60" | "90">("30");

  const courtRentalSummary = (() => {
    if (!playerStatsData?.sessions || !courtsData) return [];
    const now = new Date();
    const daysBack = parseInt(courtRentalPeriod);
    const cutoff = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const completedSessions = playerStatsData.sessions.filter((s: any) => {
      const sessionDate = new Date(s.startTime);
      return sessionDate >= cutoff && sessionDate <= now && s.courtId &&
        s.status !== "cancelled" && s.attendanceStatus !== "cancelled";
    });

    const courtMap: Record<string, { courtName: string; courtId: string; sessions: number; totalHours: number; pricePerHour: number }> = {};
    completedSessions.forEach((s: any) => {
      const court = courtsData.find((c: any) => c.id === s.courtId);
      if (!court) return;
      const pricePerHour = parseFloat(court.pricePerHour || "0");
      if (!pricePerHour || isNaN(pricePerHour) || pricePerHour <= 0) return;
      if (!s.startTime || !s.endTime) return;
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (isNaN(durationHours) || durationHours <= 0) return;
      if (!courtMap[s.courtId]) {
        courtMap[s.courtId] = {
          courtName: court.name,
          courtId: s.courtId,
          sessions: 0,
          totalHours: 0,
          pricePerHour,
        };
      }
      courtMap[s.courtId].sessions += 1;
      courtMap[s.courtId].totalHours += durationHours;
    });

    return Object.values(courtMap);
  })();

  const addCourtRentalLineItem = (rental: { courtName: string; sessions: number; totalHours: number; pricePerHour: number }) => {
    const hoursFormatted = Math.round(rental.totalHours * 10) / 10;
    const totalCost = Math.round(rental.totalHours * rental.pricePerHour * 100) / 100;
    const newItem: LineItem = {
      id: `court_${Date.now()}`,
      description: `Court Rental - ${rental.courtName} (${rental.sessions} sessions, ${hoursFormatted}h)`,
      quantity: 1,
      unitPrice: totalCost,
      total: totalCost,
    };
    setLineItems(items => {
      const hasEmptyFirst = items.length === 1 && !items[0].description && items[0].unitPrice === 0;
      return hasEmptyFirst ? [newItem] : [...items, newItem];
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const addAllCourtRentals = () => {
    if (courtRentalSummary.length === 0) return;
    const newItems: LineItem[] = courtRentalSummary.map((rental) => {
      const hoursFormatted = Math.round(rental.totalHours * 10) / 10;
      const totalCost = Math.round(rental.totalHours * rental.pricePerHour * 100) / 100;
      return {
        id: `court_${rental.courtId}_${Date.now()}`,
        description: `Court Rental - ${rental.courtName} (${rental.sessions} sessions, ${hoursFormatted}h)`,
        quantity: 1,
        unitPrice: totalCost,
        total: totalCost,
      };
    });
    setLineItems(items => {
      const hasEmptyFirst = items.length === 1 && !items[0].description && items[0].unitPrice === 0;
      return hasEmptyFirst ? newItems : [...items, ...newItems];
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const invoiceNumber = invoiceNumberData?.invoiceNumber || "...";
  const [issueDate, setIssueDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date;
  });
  const [showIssueDatePicker, setShowIssueDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", quantity: 1, unitPrice: 0, total: 0 }
  ]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>("private");
  const [taxRate, setTaxRate] = useState(0);
  
  const PACKAGE_TEMPLATES = [
    { id: "private_5", label: "5 Private Lessons", description: "Private Tennis Lessons (5 sessions)", quantity: 5, unitPrice: 280 },
    { id: "private_10", label: "10 Private Lessons", description: "Private Tennis Lessons (10 sessions)", quantity: 10, unitPrice: 280 },
    { id: "private_20", label: "20 Private Lessons", description: "Private Tennis Lessons (20 sessions)", quantity: 20, unitPrice: 280 },
    { id: "semi_5", label: "5 Semi-Private Lessons", description: "Semi-Private Tennis Lessons (5 sessions)", quantity: 5, unitPrice: 160 },
    { id: "semi_10", label: "10 Semi-Private Lessons", description: "Semi-Private Tennis Lessons (10 sessions)", quantity: 10, unitPrice: 160 },
    { id: "semi_20", label: "20 Semi-Private Lessons", description: "Semi-Private Tennis Lessons (20 sessions)", quantity: 20, unitPrice: 160 },
    { id: "group_10", label: "10 Group Lessons", description: "Group Tennis Lessons (10 sessions)", quantity: 10, unitPrice: 95 },
    { id: "group_20", label: "20 Group Lessons", description: "Group Tennis Lessons (20 sessions)", quantity: 20, unitPrice: 95 },
    { id: "group_40", label: "40 Group Lessons", description: "Group Tennis Lessons (40 sessions)", quantity: 40, unitPrice: 95 },
  ];
  
  const selectPackageTemplate = (templateId: string) => {
    const template = PACKAGE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      const newItem: LineItem = {
        id: `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        description: template.description,
        quantity: template.quantity,
        unitPrice: template.unitPrice,
        total: template.quantity * template.unitPrice,
      };
      setLineItems(items => {
        const hasEmptyFirst = items.length === 1 && !items[0].description && items[0].unitPrice === 0;
        return hasEmptyFirst ? [newItem] : [...items, newItem];
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };
  const [discountInput, setDiscountInput] = useState(0);
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [notes, setNotes] = useState("");
  const [currency] = useState("AED");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const [billToName, setBillToName] = useState(player?.name || "");
  const [billToEmail, setBillToEmail] = useState(player?.email || "");

  useEffect(() => {
    if (visible) {
      setBillToName(player?.name || "");
      setBillToEmail(player?.email || "");
    }
  }, [visible, player?.id]);

  const [showTerms, setShowTerms] = useState(true);

  const defaultTerms = [
    "All lessons are scheduled on a weekly basis.",
    "In case of absence, the lesson is still counted.",
    "Lessons will not be counted only during official holidays.",
    "Court bookings are subject to availability and may be adjusted based on scheduling needs.",
    "Payment is due within 7 days of the invoice date.",
  ];

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const discount = discountType === 'percent' ? (subtotal * discountInput) / 100 : discountInput;
  const total = subtotal + taxAmount - discount;

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(items => items.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        updated.total = updated.quantity * updated.unitPrice;
      }
      return updated;
    }));
  };

  const addLineItem = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLineItems(items => [
      ...items,
      { id: Date.now().toString(), description: "", quantity: 1, unitPrice: 0, total: 0 }
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length === 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLineItems(items => items.filter(item => item.id !== id));
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/billing/invoices", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/next-invoice-number"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess?.();
      onClose();
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleGeneratePDF = async () => {
    if (lineItems.every(item => !item.description || item.total === 0)) {
      Alert.alert("Error", "Please add at least one line item");
      return;
    }

    setIsGeneratingPDF(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const html = generateInvoicePDF({
        invoiceNumber,
        playerName: billToName || player?.name || "",
        playerEmail: billToEmail || undefined,
        academyName: academy?.name || "Glow Up Tennis",
        academyAddress: academy?.address,
        academyEmail: academy?.email,
        academyPhone: academy?.phone,
        vatRegistrationNumber: (academySettings as any)?.vatRegistrationNumber || undefined,
        bankName: academy?.bankName,
        bankAccountNumber: academy?.bankAccountNumber,
        bankIban: academy?.bankIban,
        bankAccountHolder: academy?.bankAccountHolder,
        bankSwiftCode: academy?.bankSwiftCode,
        issueDate: formatDate(issueDate),
        dueDate: formatDate(dueDate),
        lineItems: lineItems.filter(item => item.description && item.total > 0),
        subtotal,
        taxRate,
        taxAmount,
        discount,
        total,
        currency,
        notes,
        terms: showTerms ? defaultTerms : undefined,
      });

      if (Platform.OS === "web") {
        // Create a direct download link (no popup blocking)
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const filename = `Invoice_${invoiceNumber.replace('#', '').replace(/\//g, '-')}_${player?.name?.replace(/\s+/g, '_') || 'Invoice'}.html`;
        
        // Create invisible download link and click it
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        showToast("Invoice downloaded! Open it and use Print > Save as PDF.");
      } else {
        // Mobile: Generate PDF and share (allows saving to Files)
        logger.log("[PDF] Starting mobile PDF generation...");
        const { uri } = await Print.printToFileAsync({ html });
        logger.log("[PDF] PDF created at:", uri);
        const canShare = await Sharing.isAvailableAsync();
        logger.log("[PDF] Sharing available:", canShare);
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: `Invoice ${invoiceNumber}`,
            UTI: "com.adobe.pdf",
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert("Success", "PDF saved. Check your downloads folder.");
        }
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      Alert.alert("Error", "Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (lineItems.every(item => !item.description || item.total === 0)) {
      Alert.alert("Error", "Please add at least one line item");
      return;
    }

    createInvoiceMutation.mutate({
      playerId: player?.id,
      amount: total,
      currency,
      dueDate: formatDate(dueDate),
      lineItems: lineItems.filter(item => item.description && item.total > 0),
      notes,
      discount,
      taxRate,
      taxAmount,
      subtotal,
      billToName: billToName || player?.name || undefined,
      billToEmail: billToEmail || undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={["#C8FF3D20", "transparent"]}
          style={styles.headerGradient}
        />
        
        {toastMessage ? (
          <View style={styles.toastContainer}>
            <View style={styles.toastContent}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.successNeon} />
              <Text style={styles.toastText}>{toastMessage}</Text>
              <Pressable onPress={() => setToastMessage(null)} hitSlop={8}>
                <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.title}>Create Invoice</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.invoiceHeader}>
            <View style={styles.invoiceBadge}>
              <Text style={styles.invoiceBadgeLabel}>Invoice</Text>
              <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="person-outline" size={18} color={Colors.dark.successNeon} />
              <Text style={styles.sectionTitle}>Bill To</Text>
            </View>
            <View style={styles.premiumPlayerCard}>
              <LinearGradient
                colors={['rgba(200, 255, 61, 0.08)', 'transparent']}
                style={styles.playerCardGradient}
              />
              <View style={styles.playerAvatar}>
                <Text style={styles.playerAvatarText}>
                  {player?.name?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
              <View style={styles.playerInfo}>
                <TextInput
                  style={styles.billToInput}
                  value={billToName}
                  onChangeText={setBillToName}
                  placeholder="Billing name"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                <TextInput
                  style={[styles.billToInput, styles.billToEmailInput]}
                  value={billToEmail}
                  onChangeText={setBillToEmail}
                  placeholder="Billing email (optional)"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {player?.coachName ? (
                  <View style={styles.coachRow}>
                    <Ionicons name="fitness-outline" size={12} color={Colors.dark.orange} />
                    <Text style={styles.coachName}>Coach: {player.coachName}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="calendar-outline" size={18} color={Colors.dark.orange} />
              <Text style={styles.sectionTitle}>Dates</Text>
            </View>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>Issue Date</Text>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => setShowIssueDatePicker(true)}
                >
                  <Text style={styles.datePickerText}>{formatDate(issueDate)}</Text>
                  <Ionicons name="calendar" size={18} color={Colors.dark.orange} />
                </Pressable>
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>Due Date</Text>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => setShowDueDatePicker(true)}
                >
                  <Text style={styles.datePickerText}>{formatDate(dueDate)}</Text>
                  <Ionicons name="calendar" size={18} color={Colors.dark.orange} />
                </Pressable>
              </View>
            </View>
            
            {Platform.OS === "web" ? (
              <>
                <DatePickerModal
                  visible={showIssueDatePicker}
                  onClose={() => setShowIssueDatePicker(false)}
                  date={issueDate}
                  onDateChange={setIssueDate}
                  title="Select Issue Date"
                />
                <DatePickerModal
                  visible={showDueDatePicker}
                  onClose={() => setShowDueDatePicker(false)}
                  date={dueDate}
                  onDateChange={setDueDate}
                  title="Select Due Date"
                />
              </>
            ) : (
              <>
                {showIssueDatePicker && (
                  <DateTimePicker
                    value={issueDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedDate) => {
                      setShowIssueDatePicker(Platform.OS === "ios");
                      if (selectedDate) setIssueDate(selectedDate);
                    }}
                    themeVariant="dark"
                  />
                )}
                {showDueDatePicker && (
                  <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selectedDate) => {
                      setShowDueDatePicker(Platform.OS === "ios");
                      if (selectedDate) setDueDate(selectedDate);
                    }}
                    themeVariant="dark"
                  />
                )}
              </>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="pricetag-outline" size={18} color={Colors.dark.primary} />
              <Text style={styles.sectionTitle}>Quick Select Package</Text>
            </View>
            
            {/* Private Lessons */}
            <Pressable 
              style={styles.categoryHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedCategory(expandedCategory === "private" ? null : "private");
              }}
            >
              <View style={styles.categoryTitleRow}>
                <View style={[styles.categoryIcon, { backgroundColor: `${Colors.dark.orange}20` }]}>
                  <Ionicons name="person" size={18} color={Colors.dark.orange} />
                </View>
                <View>
                  <Text style={styles.categoryTitle}>Private</Text>
                  <Text style={styles.categorySubtitle}>AED 280/session</Text>
                </View>
              </View>
              <Ionicons 
                name={expandedCategory === "private" ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.dark.textMuted} 
              />
            </Pressable>
            {expandedCategory === "private" && (
              <View style={styles.packageGrid}>
                {[5, 10, 20].map((qty) => {
                  const templateId = `private_${qty}`;
                  const template = PACKAGE_TEMPLATES.find(t => t.id === templateId);
                  const isSelected = template ? lineItems.some(item => item.description === template.description) : false;
                  const total = qty * 280;
                  return (
                    <Pressable
                      key={templateId}
                      style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                      onPress={() => selectPackageTemplate(templateId)}
                    >
                      <Text style={[styles.packageQty, isSelected && styles.packageQtySelected]}>{qty}</Text>
                      <Text style={styles.packageQtyLabel}>sessions</Text>
                      <Text style={[styles.packagePrice, isSelected && styles.packagePriceSelected]}>
                        AED {total.toLocaleString()}
                      </Text>
                      <Text style={styles.packagePriceEach}>AED 280/ea</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Semi-Private Lessons */}
            <Pressable 
              style={styles.categoryHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedCategory(expandedCategory === "semi_private" ? null : "semi_private");
              }}
            >
              <View style={styles.categoryTitleRow}>
                <View style={[styles.categoryIcon, { backgroundColor: `${Colors.dark.primary}20` }]}>
                  <Ionicons name="people" size={18} color={Colors.dark.primary} />
                </View>
                <View>
                  <Text style={styles.categoryTitle}>Semi-Private</Text>
                  <Text style={styles.categorySubtitle}>AED 160/session</Text>
                </View>
              </View>
              <Ionicons 
                name={expandedCategory === "semi_private" ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.dark.textMuted} 
              />
            </Pressable>
            {expandedCategory === "semi_private" && (
              <View style={styles.packageGrid}>
                {[5, 10, 20].map((qty) => {
                  const templateId = `semi_${qty}`;
                  const template = PACKAGE_TEMPLATES.find(t => t.id === templateId);
                  const isSelected = template ? lineItems.some(item => item.description === template.description) : false;
                  const total = qty * 160;
                  return (
                    <Pressable
                      key={templateId}
                      style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                      onPress={() => selectPackageTemplate(templateId)}
                    >
                      <Text style={[styles.packageQty, isSelected && styles.packageQtySelected]}>{qty}</Text>
                      <Text style={styles.packageQtyLabel}>sessions</Text>
                      <Text style={[styles.packagePrice, isSelected && styles.packagePriceSelected]}>
                        AED {total.toLocaleString()}
                      </Text>
                      <Text style={styles.packagePriceEach}>AED 160/ea</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Group Lessons */}
            <Pressable 
              style={styles.categoryHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedCategory(expandedCategory === "group" ? null : "group");
              }}
            >
              <View style={styles.categoryTitleRow}>
                <View style={[styles.categoryIcon, { backgroundColor: `${Colors.dark.xpCyan}20` }]}>
                  <Ionicons name="people-outline" size={18} color={Colors.dark.xpCyan} />
                </View>
                <View>
                  <Text style={styles.categoryTitle}>Group</Text>
                  <Text style={styles.categorySubtitle}>AED 95/session</Text>
                </View>
              </View>
              <Ionicons 
                name={expandedCategory === "group" ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={Colors.dark.textMuted} 
              />
            </Pressable>
            {expandedCategory === "group" && (
              <View style={styles.packageGrid}>
                {[10, 20, 40].map((qty) => {
                  const templateId = `group_${qty}`;
                  const template = PACKAGE_TEMPLATES.find(t => t.id === templateId);
                  const isSelected = template ? lineItems.some(item => item.description === template.description) : false;
                  const total = qty * 95;
                  return (
                    <Pressable
                      key={templateId}
                      style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                      onPress={() => selectPackageTemplate(templateId)}
                    >
                      <Text style={[styles.packageQty, isSelected && styles.packageQtySelected]}>{qty}</Text>
                      <Text style={styles.packageQtyLabel}>sessions</Text>
                      <Text style={[styles.packagePrice, isSelected && styles.packagePriceSelected]}>
                        AED {total.toLocaleString()}
                      </Text>
                      <Text style={styles.packagePriceEach}>AED 95/ea</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Pressable
              style={styles.courtRentalToggle}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCourtRental(!showCourtRental);
              }}
            >
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="tennisball-outline" size={18} color={Colors.dark.gold} />
                <Text style={styles.sectionTitle}>Court Rental</Text>
              </View>
              <Ionicons
                name={showCourtRental ? "chevron-up" : "chevron-down"}
                size={20}
                color={Colors.dark.textMuted}
              />
            </Pressable>

            {showCourtRental ? (
              <View style={styles.courtRentalContent}>
                <View style={styles.periodSelector}>
                  {(["30", "60", "90"] as const).map((period) => (
                    <Pressable
                      key={period}
                      style={[
                        styles.periodButton,
                        courtRentalPeriod === period && styles.periodButtonActive,
                      ]}
                      onPress={() => setCourtRentalPeriod(period)}
                    >
                      <Text
                        style={[
                          styles.periodButtonText,
                          courtRentalPeriod === period && styles.periodButtonTextActive,
                        ]}
                      >
                        {period} days
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {courtRentalSummary.length > 0 ? (
                  <>
                    {courtRentalSummary.map((rental) => {
                      const hoursFormatted = Math.round(rental.totalHours * 10) / 10;
                      const totalCost = Math.round(rental.totalHours * rental.pricePerHour * 100) / 100;
                      return (
                        <View key={rental.courtId} style={styles.courtRentalCard}>
                          <View style={styles.courtRentalInfo}>
                            <Text style={styles.courtRentalName}>{rental.courtName}</Text>
                            <Text style={styles.courtRentalDetail}>
                              {rental.sessions} sessions | {hoursFormatted}h | AED {rental.pricePerHour}/hr
                            </Text>
                            <Text style={styles.courtRentalTotal}>
                              Total: AED {totalCost.toLocaleString()}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.courtRentalAddBtn}
                            onPress={() => addCourtRentalLineItem(rental)}
                          >
                            <Ionicons name="add-circle" size={28} color={Colors.dark.successNeon} />
                          </Pressable>
                        </View>
                      );
                    })}
                    {courtRentalSummary.length > 1 ? (
                      <Pressable style={styles.addAllRentalsBtn} onPress={addAllCourtRentals}>
                        <Ionicons name="checkmark-done" size={18} color={Colors.dark.buttonText} />
                        <Text style={styles.addAllRentalsText}>Add All Court Rentals</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.courtRentalEmpty}>
                    <Ionicons name="information-circle-outline" size={20} color={Colors.dark.textMuted} />
                    <Text style={styles.courtRentalEmptyText}>
                      {!courtsData ? "Loading courts..." : !playerStatsData?.sessions ? "Loading sessions..." : "No sessions with court rental fees found in this period. Set court prices in Courts management."}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Line Items</Text>
              <Pressable onPress={addLineItem} style={styles.addButton}>
                <Ionicons name="add-circle" size={24} color={Colors.dark.successNeon} />
              </Pressable>
            </View>
            
            {lineItems.map((item, index) => (
              <View key={item.id} style={styles.lineItem}>
                <View style={styles.lineItemHeader}>
                  <Text style={styles.lineItemNumber}>#{index + 1}</Text>
                  {lineItems.length > 1 && (
                    <Pressable onPress={() => removeLineItem(item.id)}>
                      <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                    </Pressable>
                  )}
                </View>
                
                <TextInput
                  style={styles.descriptionInput}
                  value={item.description}
                  onChangeText={(text) => updateLineItem(item.id, "description", text)}
                  placeholder="Description (e.g., Tennis lessons - January)"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                
                <View style={styles.lineItemRow}>
                  <View style={styles.quantityField}>
                    <Text style={styles.fieldLabel}>Qty</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={item.quantity.toString()}
                      onChangeText={(text) => updateLineItem(item.id, "quantity", parseInt(text) || 0)}
                      keyboardType="numeric"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                  </View>
                  <View style={styles.priceField}>
                    <Text style={styles.fieldLabel}>Unit Price ({currency})</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={item.unitPrice.toString()}
                      onChangeText={(text) => updateLineItem(item.id, "unitPrice", parseFloat(text) || 0)}
                      keyboardType="numeric"
                      placeholderTextColor={Colors.dark.textMuted}
                    />
                  </View>
                  <View style={styles.totalField}>
                    <Text style={styles.fieldLabel}>Total</Text>
                    <Text style={styles.lineItemTotal}>{currency} {item.total.toFixed(2)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Options</Text>
            <View style={styles.optionsRow}>
              <View style={styles.optionField}>
                <Text style={styles.fieldLabel}>Tax Rate (%)</Text>
                <TextInput
                  style={styles.optionInput}
                  value={taxRate.toString()}
                  onChangeText={(text) => setTaxRate(parseFloat(text) || 0)}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
              <View style={styles.optionField}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.fieldLabel}>{discountType === 'percent' ? 'Discount (%)' : `Discount (${currency})`}</Text>
                  <View style={{ flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.border }}>
                    <Pressable
                      onPress={() => { setDiscountType('flat'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: discountType === 'flat' ? Colors.dark.primary : 'transparent' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: discountType === 'flat' ? Colors.dark.buttonText : Colors.dark.textMuted }}>{currency}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setDiscountType('percent'); if (discountInput > 100) setDiscountInput(0); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: discountType === 'percent' ? Colors.dark.primary : 'transparent' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: discountType === 'percent' ? Colors.dark.buttonText : Colors.dark.textMuted }}>%</Text>
                    </Pressable>
                  </View>
                </View>
                <TextInput
                  style={styles.optionInput}
                  value={discountInput.toString()}
                  onChangeText={(text) => {
                    let val = parseFloat(text) || 0;
                    if (discountType === 'percent') val = Math.min(100, Math.max(0, val));
                    setDiscountInput(val);
                  }}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.dark.textMuted}
                />
                {discountType === 'percent' && discountInput > 0 ? (
                  <Text style={{ fontSize: 11, color: Colors.dark.primary, marginTop: 4 }}>
                    = {currency} {discount.toFixed(2)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes or payment instructions..."
              placeholderTextColor={Colors.dark.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.section}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
              <Text style={styles.sectionTitle}>Terms & Conditions</Text>
              <Pressable
                onPress={() => {
                  setShowTerms(!showTerms);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: BorderRadius.sm,
                  backgroundColor: showTerms ? Colors.dark.primary + "20" : Colors.dark.cardAlt,
                  borderWidth: 1,
                  borderColor: showTerms ? Colors.dark.primary : Colors.dark.border,
                }}
              >
                <Text style={{ color: showTerms ? Colors.dark.primary : Colors.dark.textMuted, fontSize: 12, fontWeight: "600" }}>
                  {showTerms ? "Included" : "Excluded"}
                </Text>
              </Pressable>
            </View>
            {showTerms && (
              <View style={{
                backgroundColor: Colors.dark.cardAlt,
                borderRadius: BorderRadius.md,
                padding: Spacing.md,
                borderWidth: 1,
                borderColor: Colors.dark.border,
              }}>
                {defaultTerms.map((term, index) => (
                  <View key={index} style={{ flexDirection: "row", marginBottom: index < defaultTerms.length - 1 ? 8 : 0 }}>
                    <Text style={{ color: Colors.dark.primary, fontSize: 12, fontWeight: "700", marginRight: 8, minWidth: 16 }}>{index + 1}.</Text>
                    <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 }}>{term}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{currency} {subtotal.toFixed(2)}</Text>
            </View>
            {taxRate > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
                <Text style={styles.totalValue}>{currency} {taxAmount.toFixed(2)}</Text>
              </View>
            )}
            {discount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount</Text>
                <Text style={[styles.totalValue, { color: Colors.dark.error }]}>
                  -{currency} {discount.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grandTotal]}>
              <Text style={styles.grandTotalLabel}>Total Due</Text>
              <Text style={styles.grandTotalValue}>{currency} {total.toFixed(2)}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            style={styles.downloadButton}
            onPress={handleGeneratePDF}
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF ? (
              <ActivityIndicator size="small" color={Colors.dark.buttonText} />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.downloadButtonText}>Download PDF</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={styles.saveButton}
            onPress={handleSaveInvoice}
            disabled={createInvoiceMutation.isPending}
          >
            {createInvoiceMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color={Colors.dark.text} />
                <Text style={styles.saveButtonText}>Save Invoice</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
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
    height: 150,
  },
  toastContainer: {
    position: "absolute",
    top: 60,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 100,
    alignItems: "center",
  },
  toastContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: `${Colors.dark.successNeon}18`,
    borderWidth: 1,
    borderColor: `${Colors.dark.successNeon}40`,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  toastText: {
    ...Typography.small,
    color: Colors.dark.successNeon,
    flex: 1,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundTertiary,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  title: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  invoiceHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  invoiceBadge: {
    backgroundColor: Colors.dark.successNeon + "20",
    borderWidth: 1,
    borderColor: Colors.dark.successNeon + "40",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  invoiceBadgeLabel: {
    fontSize: Typography.small.fontSize,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: Colors.dark.successNeon,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.small.fontSize,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  playerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.orange + "30",
    borderWidth: 2,
    borderColor: Colors.dark.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.orange,
  },
  playerInfo: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  playerName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerEmail: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  billToInput: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(200, 255, 61, 0.3)",
    paddingVertical: 4,
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  billToEmailInput: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "400",
    color: Colors.dark.textMuted,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  dateRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  dateField: {
    flex: 1,
  },
  dateLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  addButton: {
    padding: Spacing.xs,
  },
  lineItem: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  lineItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  lineItemNumber: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.successNeon,
  },
  descriptionInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    marginBottom: Spacing.sm,
  },
  lineItemRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  quantityField: {
    flex: 1,
  },
  priceField: {
    flex: 2,
  },
  totalField: {
    flex: 1.5,
    alignItems: "flex-end",
  },
  fieldLabel: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  smallInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  lineItemTotal: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.successNeon,
    paddingVertical: Spacing.sm,
  },
  optionsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  optionField: {
    flex: 1,
  },
  optionInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
  },
  notesInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    minHeight: 80,
    textAlignVertical: "top",
  },
  totalsSection: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundTertiary,
  },
  totalLabel: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.textMuted,
  },
  totalValue: {
    fontSize: Typography.body.fontSize,
    fontWeight: "500",
    color: Colors.dark.text,
  },
  grandTotal: {
    borderBottomWidth: 0,
    borderTopWidth: 2,
    borderTopColor: Colors.dark.successNeon + "40",
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  grandTotalLabel: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  grandTotalValue: {
    fontSize: Typography.h3.fontSize,
    fontWeight: "700",
    color: Colors.dark.successNeon,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundRoot,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.backgroundTertiary,
  },
  downloadButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.successNeon,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  downloadButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
  },
  saveButtonText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  packageTemplatesContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  packageTemplateCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minWidth: 140,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
  },
  packageTemplateCardSelected: {
    backgroundColor: Colors.dark.successNeon + "15",
    borderColor: Colors.dark.successNeon,
  },
  packageTemplateLabel: {
    fontSize: Typography.caption.fontSize,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 4,
    textAlign: "center",
  },
  packageTemplateLabelSelected: {
    color: Colors.dark.successNeon,
  },
  packageTemplatePrice: {
    fontSize: Typography.h4.fontSize,
    fontWeight: "700",
    color: Colors.dark.textMuted,
  },
  packageTemplatePriceSelected: {
    color: Colors.dark.successNeon,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  premiumPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.15)",
    overflow: "hidden",
  },
  playerCardGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  coachName: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.orange,
    fontWeight: "500",
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 152, 0, 0.2)",
  },
  datePickerText: {
    fontSize: Typography.body.fontSize,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  categoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTitle: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  categorySubtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  packageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  packageCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  packageCardSelected: {
    backgroundColor: `${Colors.dark.successNeon}15`,
    borderColor: Colors.dark.successNeon,
  },
  packageQty: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: -1,
  },
  packageQtySelected: {
    color: Colors.dark.successNeon,
  },
  packageQtyLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  packagePrice: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.primary,
  },
  packagePriceSelected: {
    color: Colors.dark.successNeon,
  },
  packagePriceEach: {
    fontSize: Typography.caption.fontSize,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  courtRentalToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  courtRentalContent: {
    marginTop: Spacing.md,
  },
  periodSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  periodButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  periodButtonActive: {
    backgroundColor: `${Colors.dark.gold}20`,
    borderColor: Colors.dark.gold,
  },
  periodButtonText: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
    fontWeight: "600",
  },
  periodButtonTextActive: {
    color: Colors.dark.gold,
  },
  courtRentalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  courtRentalInfo: {
    flex: 1,
  },
  courtRentalName: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  courtRentalDetail: {
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
  courtRentalTotal: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.gold,
    marginTop: 4,
  },
  courtRentalAddBtn: {
    padding: Spacing.xs,
  },
  addAllRentalsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.gold,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  addAllRentalsText: {
    fontSize: Typography.body.fontSize,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  courtRentalEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  courtRentalEmptyText: {
    flex: 1,
    fontSize: Typography.small.fontSize,
    color: Colors.dark.textMuted,
  },
});
