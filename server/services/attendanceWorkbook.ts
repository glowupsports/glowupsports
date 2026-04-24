import ExcelJS from "exceljs";
import { db } from "../db";
import { and, eq, gte, lte, inArray, asc } from "drizzle-orm";
import {
  players,
  sessions,
  sessionPlayers,
  coachingSeries,
  coaches,
  seriesPlayers,
  courts,
  locations,
  playerSessionCancellations,
} from "@shared/schema";

export interface AttendanceWorkbookFilters {
  academyId: string;
  from: Date;
  to: Date;
  ballLevel?: string;
  seriesId?: string;
}

type StatusCode = "P" | "L" | "A" | "H" | "V" | "-";

const STATUS_FILL: Record<StatusCode, string | null> = {
  P: "FF10B981", // green - present
  L: "FFF59E0B", // amber - late
  A: "FFEF4444", // red - absent
  H: "FF3B82F6", // blue - holiday
  V: "FF3B82F6", // blue - vacation
  "-": null,
};

const STATUS_LABEL: Record<StatusCode, string> = {
  P: "Present",
  L: "Late",
  A: "Absent",
  H: "Holiday",
  V: "Vacation",
  "-": "No data",
};

const HEADER_FILL = "FF1F2937";
const HEADER_FONT = "FFFFFFFF";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeStatus(raw: string | null | undefined): StatusCode {
  if (!raw) return "-";
  switch (raw.toLowerCase()) {
    case "present":
      return "P";
    case "late":
      return "L";
    case "absent":
      return "A";
    case "holiday":
      return "H";
    case "vacation":
      return "V";
    default:
      return "-";
  }
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeSheetName(raw: string, used: Set<string>): string {
  // Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ]
  let name = raw.replace(/[:\\/?*\[\]]/g, " ").trim();
  if (!name) name = "Series";
  if (name.length > 28) name = name.slice(0, 28);
  let candidate = name;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function autoSizeColumns(ws: ExcelJS.Worksheet, minWidth = 8, maxWidth = 40): void {
  ws.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      let len = 0;
      if (v == null) len = 0;
      else if (typeof v === "string") len = v.length;
      else if (typeof v === "number") len = String(v).length;
      else if (v instanceof Date) len = 10;
      else if (typeof v === "object" && "richText" in (v as object))
        len = ((v as ExcelJS.CellRichTextValue).richText || [])
          .map((r) => r.text.length)
          .reduce((a, b) => a + b, 0);
      else len = String(v).length;
      if (len > max) max = len;
    });
    col.width = Math.min(maxWidth, Math.max(minWidth, max + 2));
  });
}

function styleHeaderRow(ws: ExcelJS.Worksheet, headerRowNumber = 1): void {
  const row = ws.getRow(headerRowNumber);
  row.font = { bold: true, color: { argb: HEADER_FONT } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  row.alignment = { vertical: "middle", horizontal: "left" };
  row.eachCell((cell) => {
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF374151" } },
    };
  });
  ws.views = [{ state: "frozen", ySplit: headerRowNumber }];
}

function applyStatusFill(cell: ExcelJS.Cell, status: StatusCode): void {
  const fill = STATUS_FILL[status];
  if (fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fill },
    };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  } else {
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
}

interface SessionRow {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  sessionType: string;
  seriesId: string | null;
  coachId: string | null;
  coachName: string | null;
  courtName: string | null;
  locationName: string | null;
}

interface SessionPlayerRow {
  sessionId: string;
  playerId: string;
  attendanceStatus: string | null;
  lateMinutes: number | null;
  absenceReason: string | null;
}

interface CancellationRow {
  sessionId: string | null;
  playerId: string | null;
  cancellationType: string;
  reason: string;
  reasonText: string | null;
  billingStatus: string | null;
  isLateCancel: boolean | null;
}

interface PlayerRow {
  id: string;
  name: string;
  ballLevel: string | null;
}

interface SeriesRow {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  sessionType: string;
}

export async function buildAttendanceWorkbook(
  filters: AttendanceWorkbookFilters,
): Promise<Buffer> {
  const { academyId, from, to, ballLevel, seriesId } = filters;

  // 1. Fetch sessions in range, scoped by academy
  const sessionConds = [
    eq(sessions.academyId, academyId),
    gte(sessions.startTime, from),
    lte(sessions.startTime, to),
  ];
  if (seriesId) sessionConds.push(eq(sessions.seriesId, seriesId));

  const sessionRows: SessionRow[] = (await db
    .select({
      sessionId: sessions.id,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      sessionType: sessions.sessionType,
      seriesId: sessions.seriesId,
      coachId: sessions.coachId,
      coachName: coaches.name,
      courtName: courts.name,
      locationName: locations.name,
    })
    .from(sessions)
    .leftJoin(coaches, eq(coaches.id, sessions.coachId))
    .leftJoin(courts, eq(courts.id, sessions.courtId))
    .leftJoin(locations, eq(locations.id, sessions.locationId))
    .where(and(...sessionConds))
    .orderBy(asc(sessions.startTime))) as SessionRow[];

  const sessionIds = sessionRows.map((s) => s.sessionId);

  // 2. Fetch attendance rows for those sessions
  const attendanceRows: SessionPlayerRow[] =
    sessionIds.length === 0
      ? []
      : ((await db
          .select({
            sessionId: sessionPlayers.sessionId,
            playerId: sessionPlayers.playerId,
            attendanceStatus: sessionPlayers.attendanceStatus,
            lateMinutes: sessionPlayers.lateMinutes,
            absenceReason: sessionPlayers.absenceReason,
          })
          .from(sessionPlayers)
          .where(inArray(sessionPlayers.sessionId, sessionIds))) as SessionPlayerRow[]);

  // 2b. Fetch cancellations (for billing status / cancellation reason on the
  // All Sessions tab). Scoped by academy and the in-range session ids.
  const cancellationRows: CancellationRow[] =
    sessionIds.length === 0
      ? []
      : ((await db
          .select({
            sessionId: playerSessionCancellations.sessionId,
            playerId: playerSessionCancellations.playerId,
            cancellationType: playerSessionCancellations.cancellationType,
            reason: playerSessionCancellations.reason,
            reasonText: playerSessionCancellations.reasonText,
            billingStatus: playerSessionCancellations.billingStatus,
            isLateCancel: playerSessionCancellations.isLateCancel,
          })
          .from(playerSessionCancellations)
          .where(
            and(
              eq(playerSessionCancellations.academyId, academyId),
              inArray(playerSessionCancellations.sessionId, sessionIds),
            ),
          )) as CancellationRow[]);
  const cancellationMap = new Map<string, CancellationRow>();
  for (const c of cancellationRows) {
    if (c.sessionId && c.playerId) {
      cancellationMap.set(`${c.sessionId}::${c.playerId}`, c);
    }
  }

  // 3. Determine relevant player set
  //    - All players that appear on any session in range, scoped to the academy.
  //    - Plus, if a seriesId filter is provided, all active members of that series.
  //    - Apply optional ballLevel filter.
  const playerIdSet = new Set<string>();
  for (const row of attendanceRows) {
    if (row.playerId) playerIdSet.add(row.playerId);
  }

  if (seriesId) {
    const memberRows = await db
      .select({ playerId: seriesPlayers.playerId })
      .from(seriesPlayers)
      .where(eq(seriesPlayers.seriesId, seriesId));
    for (const r of memberRows) {
      if (r.playerId) playerIdSet.add(r.playerId);
    }
  }

  let playerRows: PlayerRow[] = [];
  if (playerIdSet.size > 0) {
    const playerConds = [
      eq(players.academyId, academyId),
      inArray(players.id, Array.from(playerIdSet)),
    ];
    if (ballLevel) playerConds.push(eq(players.ballLevel, ballLevel));

    playerRows = (await db
      .select({
        id: players.id,
        name: players.name,
        ballLevel: players.ballLevel,
      })
      .from(players)
      .where(and(...playerConds))
      .orderBy(asc(players.name))) as PlayerRow[];
  }

  const allowedPlayerIds = new Set(playerRows.map((p) => p.id));
  // Filter attendance to allowed players (in case ballLevel narrowed it down)
  const filteredAttendance = attendanceRows.filter(
    (a) => a.playerId && allowedPlayerIds.has(a.playerId),
  );

  // 4. Fetch series referenced by sessions in range
  const seriesIds = Array.from(
    new Set(sessionRows.map((s) => s.seriesId).filter((x): x is string => Boolean(x))),
  );
  let seriesRows: SeriesRow[] = [];
  if (seriesIds.length > 0) {
    seriesRows = (await db
      .select({
        id: coachingSeries.id,
        title: coachingSeries.title,
        dayOfWeek: coachingSeries.dayOfWeek,
        startTime: coachingSeries.startTime,
        sessionType: coachingSeries.sessionType,
      })
      .from(coachingSeries)
      .where(inArray(coachingSeries.id, seriesIds))) as SeriesRow[];
  }
  const seriesMap = new Map<string, SeriesRow>();
  for (const s of seriesRows) seriesMap.set(s.id, s);

  // ---- Build workbook ----
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Academy Reports";
  workbook.created = new Date();

  const fromYmd = formatYmd(from);
  const toYmd = formatYmd(to);
  const usedSheetNames = new Set<string>();

  // ===== Sheet 1: Summary =====
  const summary = workbook.addWorksheet(safeSheetName("Summary", usedSheetNames));

  // Build per-player summary aggregations
  // Map: playerId -> counts
  interface PlayerAgg {
    sessionsScheduled: number;
    present: number;
    late: number;
    absent: number;
    holidayOrVacation: number;
    lastAttended: Date | null;
  }
  const playerAgg = new Map<string, PlayerAgg>();
  for (const p of playerRows) {
    playerAgg.set(p.id, {
      sessionsScheduled: 0,
      present: 0,
      late: 0,
      absent: 0,
      holidayOrVacation: 0,
      lastAttended: null,
    });
  }
  const sessionById = new Map(sessionRows.map((s) => [s.sessionId, s]));
  for (const a of filteredAttendance) {
    const agg = playerAgg.get(a.playerId);
    if (!agg) continue;
    agg.sessionsScheduled += 1;
    const code = normalizeStatus(a.attendanceStatus);
    if (code === "P") agg.present += 1;
    else if (code === "L") agg.late += 1;
    else if (code === "A") agg.absent += 1;
    else if (code === "H" || code === "V") agg.holidayOrVacation += 1;
    // Last attended date only counts present or late (actual attendance)
    if (code === "P" || code === "L") {
      const sess = sessionById.get(a.sessionId);
      if (sess && (!agg.lastAttended || sess.startTime > agg.lastAttended)) {
        agg.lastAttended = sess.startTime;
      }
    }
  }

  summary.columns = [
    { header: "Player", key: "name" },
    { header: "Ball Level", key: "ballLevel" },
    { header: "Sessions Scheduled", key: "sessionsScheduled" },
    { header: "Present", key: "present" },
    { header: "Late", key: "late" },
    { header: "Absent", key: "absent" },
    { header: "Holiday/Vacation", key: "holidayOrVacation" },
    { header: "Attendance Rate %", key: "rate" },
    { header: "Last Attended", key: "lastAttended" },
  ];

  if (playerRows.length === 0) {
    summary.addRow({
      name: `No data in range ${fromYmd} to ${toYmd}`,
    });
  } else {
    for (const p of playerRows) {
      const agg = playerAgg.get(p.id)!;
      const denom = agg.present + agg.late + agg.absent;
      const rate = denom > 0 ? Math.round(((agg.present + agg.late) / denom) * 1000) / 10 : 0;
      summary.addRow({
        name: p.name,
        ballLevel: p.ballLevel || "",
        sessionsScheduled: agg.sessionsScheduled,
        present: agg.present,
        late: agg.late,
        absent: agg.absent,
        holidayOrVacation: agg.holidayOrVacation,
        rate,
        lastAttended: agg.lastAttended ? formatYmd(agg.lastAttended) : "",
      });
    }
  }
  styleHeaderRow(summary, 1);
  autoSizeColumns(summary);

  // ===== Sheet 2: All Sessions (flat) =====
  const allSheet = workbook.addWorksheet(safeSheetName("All Sessions", usedSheetNames));
  allSheet.columns = [
    { header: "Date", key: "date" },
    { header: "Day", key: "day" },
    { header: "Start", key: "start" },
    { header: "End", key: "end" },
    { header: "Series", key: "series" },
    { header: "Type", key: "type" },
    { header: "Coach", key: "coach" },
    { header: "Court", key: "court" },
    { header: "Location", key: "location" },
    { header: "Player", key: "player" },
    { header: "Ball Level", key: "ballLevel" },
    { header: "Status", key: "status" },
    { header: "Late Min", key: "lateMin" },
    { header: "Reason", key: "reason" },
    { header: "Cancellation Reason", key: "cancelReason" },
    { header: "Billing Status", key: "billingStatus" },
  ];

  const playerById = new Map(playerRows.map((p) => [p.id, p]));

  if (filteredAttendance.length === 0) {
    allSheet.addRow({ date: `No data in range ${fromYmd} to ${toYmd}` });
  } else {
    // Sort flat rows by session start, then player name for stable output
    const flat = filteredAttendance
      .map((a) => {
        const sess = sessionById.get(a.sessionId);
        const player = playerById.get(a.playerId);
        return { a, sess, player };
      })
      .filter((r): r is { a: SessionPlayerRow; sess: SessionRow; player: PlayerRow } =>
        Boolean(r.sess && r.player),
      )
      .sort((x, y) => {
        const t = x.sess.startTime.getTime() - y.sess.startTime.getTime();
        if (t !== 0) return t;
        return x.player.name.localeCompare(y.player.name);
      });

    for (const { a, sess, player } of flat) {
      const dateStr = formatYmd(sess.startTime);
      const day = DAY_NAMES[sess.startTime.getUTCDay()];
      const startStr = sess.startTime
        .toISOString()
        .substring(11, 16);
      const endStr = sess.endTime.toISOString().substring(11, 16);
      const seriesTitle = sess.seriesId
        ? seriesMap.get(sess.seriesId)?.title || ""
        : "";
      const code = normalizeStatus(a.attendanceStatus);
      const cancellation = cancellationMap.get(`${a.sessionId}::${a.playerId}`);
      const cancelReason = cancellation
        ? cancellation.reasonText && cancellation.reasonText.trim().length > 0
          ? `${cancellation.reason}: ${cancellation.reasonText}`
          : cancellation.reason
        : "";
      const billingStatus = cancellation?.billingStatus || "";
      const row = allSheet.addRow({
        date: dateStr,
        day,
        start: startStr,
        end: endStr,
        series: seriesTitle,
        type: sess.sessionType,
        coach: sess.coachName || "",
        court: sess.courtName || "",
        location: sess.locationName || "",
        player: player.name,
        ballLevel: player.ballLevel || "",
        status: STATUS_LABEL[code],
        lateMin: a.lateMinutes ?? "",
        reason: a.absenceReason || "",
        cancelReason,
        billingStatus,
      });
      const statusCell = row.getCell("status");
      applyStatusFill(statusCell, code);
    }
  }
  styleHeaderRow(allSheet, 1);
  autoSizeColumns(allSheet);

  // ===== Sheets per series: date matrix =====
  // Sort series by title for stable order
  const sortedSeries = [...seriesRows].sort((a, b) => a.title.localeCompare(b.title));

  for (const series of sortedSeries) {
    // Sessions for this series in range, sorted by date
    const seriesSessions = sessionRows
      .filter((s) => s.seriesId === series.id)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    if (seriesSessions.length === 0) continue;

    // Players: all that have an attendance row for any session in this series
    // OR active members of the series (within filter)
    const seriesPlayerIds = new Set<string>();
    const seriesSessionIds = new Set(seriesSessions.map((s) => s.sessionId));
    for (const a of filteredAttendance) {
      if (seriesSessionIds.has(a.sessionId)) seriesPlayerIds.add(a.playerId);
    }
    // Also pull series memberships
    const memberRows = await db
      .select({ playerId: seriesPlayers.playerId })
      .from(seriesPlayers)
      .where(eq(seriesPlayers.seriesId, series.id));
    for (const m of memberRows) {
      if (m.playerId && allowedPlayerIds.has(m.playerId)) {
        seriesPlayerIds.add(m.playerId);
      }
    }
    const seriesPlayerList = Array.from(seriesPlayerIds)
      .map((id) => playerById.get(id))
      .filter((p): p is PlayerRow => Boolean(p))
      .sort((a, b) => a.name.localeCompare(b.name));

    const sheetName = safeSheetName(series.title, usedSheetNames);
    const ws = workbook.addWorksheet(sheetName);

    if (seriesPlayerList.length === 0) {
      // Series exists in range but has no resolvable player rows — produce
      // a stub tab so the consumer sees the series in the workbook.
      ws.columns = [
        { header: "Player", key: "player", width: 24 },
        { header: "Note", key: "note", width: 60 },
      ];
      ws.addRow({
        player: "(no roster)",
        note: `${seriesSessions.length} session(s) in range — no players matched the active filters.`,
      });
      styleHeaderRow(ws, 1);
      autoSizeColumns(ws);
      continue;
    }

    // Build columns: Player, Ball Level, then one column per session date
    const dateCols = seriesSessions.map((s) => formatYmd(s.startTime));
    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Player", key: "player", width: 24 },
      { header: "Ball Level", key: "ballLevel", width: 12 },
    ];
    for (let i = 0; i < seriesSessions.length; i++) {
      cols.push({ header: dateCols[i], key: `d${i}`, width: 12 });
    }
    cols.push({ header: "Present", key: "tPresent", width: 10 });
    cols.push({ header: "Late", key: "tLate", width: 8 });
    cols.push({ header: "Absent", key: "tAbsent", width: 10 });
    cols.push({ header: "Holiday/Vacation", key: "tHV", width: 18 });
    cols.push({ header: "Rate %", key: "tRate", width: 10 });
    ws.columns = cols as ExcelJS.Column[];

    // Build a quick lookup: sessionId -> playerId -> code
    const attendanceMap = new Map<string, Map<string, StatusCode>>();
    for (const a of filteredAttendance) {
      if (!seriesSessionIds.has(a.sessionId)) continue;
      let inner = attendanceMap.get(a.sessionId);
      if (!inner) {
        inner = new Map();
        attendanceMap.set(a.sessionId, inner);
      }
      inner.set(a.playerId, normalizeStatus(a.attendanceStatus));
    }

    for (const player of seriesPlayerList) {
      const rowData: Record<string, string | number> = {
        player: player.name,
        ballLevel: player.ballLevel || "",
      };
      let p = 0,
        l = 0,
        ab = 0,
        hv = 0;
      for (let i = 0; i < seriesSessions.length; i++) {
        const sess = seriesSessions[i];
        const inner = attendanceMap.get(sess.sessionId);
        const code: StatusCode = inner?.get(player.id) || "-";
        rowData[`d${i}`] = code;
        if (code === "P") p++;
        else if (code === "L") l++;
        else if (code === "A") ab++;
        else if (code === "H" || code === "V") hv++;
      }
      const denom = p + l + ab;
      const rate = denom > 0 ? Math.round(((p + l) / denom) * 1000) / 10 : 0;
      rowData.tPresent = p;
      rowData.tLate = l;
      rowData.tAbsent = ab;
      rowData.tHV = hv;
      rowData.tRate = rate;
      const row = ws.addRow(rowData);

      // Color status cells
      for (let i = 0; i < seriesSessions.length; i++) {
        const cell = row.getCell(`d${i}`);
        const code = String(cell.value || "-") as StatusCode;
        applyStatusFill(cell, code);
      }
    }

    // Insert a legend row above the header (row 1 becomes legend, header shifts to row 2)
    ws.spliceRows(1, 0, []);
    const totalCols = cols.length;
    const legendCell = ws.getCell(1, 1);
    legendCell.value =
      "Legend:  P = Present   L = Late   A = Absent   H = Holiday   V = Vacation   - = Not scheduled";
    legendCell.font = { italic: true, color: { argb: "FF374151" } };
    legendCell.alignment = { vertical: "middle", horizontal: "left" };
    if (totalCols > 1) {
      ws.mergeCells(1, 1, 1, totalCols);
    }
    ws.getRow(1).height = 18;

    // Color the status keys inside the legend by appending small colored cells
    // is non-trivial across merged cells; the inline text + status-cell coloring
    // in the matrix below already makes the meaning unambiguous.

    styleHeaderRow(ws, 2);
    // Center the date header cells (header is now row 2)
    const headerRow = ws.getRow(2);
    for (let i = 0; i < seriesSessions.length; i++) {
      const c = headerRow.getCell(3 + i);
      c.alignment = { horizontal: "center", vertical: "middle" };
    }
    autoSizeColumns(ws, 8, 24);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
