// Dean Hamilton — Coach Session Report
//
// Public shareable HTML page showing Dean's sessions from May 11 2026 onwards.
// Fixed rate: 200 AED per session (non-cancelled, non-excluded).
// No player names shown — only time, type, level colours, player count, status.
//
// Routes:
//   GET /report/dean/:token              — public view (shareable with Dean)
//   POST /report/dean/:token/exclude     — toggle session exclusion (manage token required)
//
// Tokens stored in: server/data/coach-report-dean.json

import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { pool } from "../db";

const router = Router();

const CONFIG_PATH = path.join(process.cwd(), "server/data/coach-report-dean.json");

const DEAN_COACH_ID = "76f7d0e7-1363-404f-93d0-7edcce95a28d";

interface ReportConfig {
  publicToken: string;
  manageToken: string;
  excludedSessionIds: string[];
  startDate: string;
  ratePerSession: number;
  currency: string;
}

function loadConfig(): ReportConfig {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ReportConfig;
}

function saveConfig(cfg: ReportConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

interface SessionRow {
  id: string;
  start_time: Date;
  end_time: Date;
  session_type: string;
  ball_level: string | null;
  status: string | null;
  series_title: string | null;
  player_count: string;
}

async function fetchSessions(startDate: string): Promise<SessionRow[]> {
  const result = await pool.query<SessionRow>(
    `SELECT
       s.id,
       s.start_time,
       s.end_time,
       s.session_type,
       s.ball_level,
       s.status,
       cs.title AS series_title,
       COUNT(sp.player_id) AS player_count
     FROM sessions s
     LEFT JOIN coaching_series cs ON cs.id::text = s.series_id
     LEFT JOIN session_players sp ON sp.session_id = s.id
     WHERE s.coach_id = $1
       AND s.start_time >= $2
       AND (s.status IS NULL OR s.status NOT IN ('draft','deleted'))
     GROUP BY s.id, cs.title
     ORDER BY s.start_time ASC`,
    [DEAN_COACH_ID, startDate]
  );
  return result.rows;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string): string {
  if (t === "private") return "Private";
  if (t === "semi_private") return "Semi-Private";
  return "Group";
}

function typeBadgeStyle(t: string): string {
  if (t === "private") return "background:#7C3AED;color:#fff";
  if (t === "semi_private") return "background:#2563EB;color:#fff";
  return "background:#16a34a;color:#fff";
}

function levelDot(level: string | null): string {
  const map: Record<string, string> = {
    red: "#EF4444",
    orange: "#F97316",
    green: "#22C55E",
    yellow: "#EAB308",
    purple: "#A855F7",
    blue: "#3B82F6",
  };
  const col = (level && map[level.toLowerCase()]) ? map[level.toLowerCase()] : "#6B7280";
  const label = level ? level.charAt(0).toUpperCase() + level.slice(1) : "—";
  return `<span style="display:inline-flex;align-items:center;gap:5px;">
    <span style="width:10px;height:10px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0;"></span>
    <span style="color:${col};font-weight:600;font-size:12px;">${label}</span>
  </span>`;
}

function statusBadge(s: string | null): string {
  if (!s || s === "scheduled") return `<span style="color:#94A3B8;font-size:12px;font-weight:500;">Scheduled</span>`;
  if (s === "completed") return `<span style="color:#22C55E;font-size:12px;font-weight:600;">Completed</span>`;
  if (s === "cancelled") return `<span style="color:#EF4444;font-size:12px;font-weight:600;">Cancelled</span>`;
  return `<span style="color:#94A3B8;font-size:12px;">${s}</span>`;
}

function formatTime(d: Date): string {
  const dt = new Date(d);
  const h = dt.getUTCHours().toString().padStart(2, "0");
  const m = dt.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function isoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function friendlyDate(d: Date): string {
  const dt = new Date(d);
  const day = DAY_NAMES[dt.getUTCDay()];
  const mon = MONTH_NAMES[dt.getUTCMonth()];
  return `${day}, ${dt.getUTCDate()} ${mon} ${dt.getUTCFullYear()}`;
}

function weekKey(d: Date): string {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  const diff = dt.getUTCDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), diff));
  const sun = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), diff + 6));
  const ms = MONTH_NAMES[mon.getUTCMonth()];
  const me = MONTH_NAMES[sun.getUTCMonth()];
  return `${mon.getUTCDate()} ${ms} – ${sun.getUTCDate()} ${me} ${sun.getUTCFullYear()}`;
}

function monthKey(d: Date): string {
  const dt = new Date(d);
  return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHTML(sessions: SessionRow[], cfg: ReportConfig, isManage: boolean): string {
  const excluded = new Set(cfg.excludedSessionIds);
  const rate = cfg.ratePerSession;
  const currency = cfg.currency;

  const visible = sessions.filter(s =>
    isManage ? true : !excluded.has(s.id)
  );

  const isCancelled = (s: SessionRow) =>
    s.status === "cancelled";

  const countsForPayment = (s: SessionRow) =>
    !isCancelled(s) && !excluded.has(s.id);

  const grandTotal = sessions.filter(countsForPayment).length * rate;

  // Group by week → day
  type DayMap = Map<string, SessionRow[]>;
  type WeekMap = Map<string, DayMap>;
  const weeks: WeekMap = new Map();

  for (const s of visible) {
    const wk = weekKey(s.start_time);
    const dk = isoDate(s.start_time);
    if (!weeks.has(wk)) weeks.set(wk, new Map());
    const dayMap = weeks.get(wk)!;
    if (!dayMap.has(dk)) dayMap.set(dk, []);
    dayMap.get(dk)!.push(s);
  }

  // Count earned per week (from ALL sessions for accurate total, not just visible)
  function weekEarned(wk: string): number {
    return sessions
      .filter(s => weekKey(s.start_time) === wk && countsForPayment(s))
      .length * rate;
  }
  function monthEarned(mk: string): number {
    return sessions
      .filter(s => monthKey(s.start_time) === mk && countsForPayment(s))
      .length * rate;
  }

  let body = "";
  let lastMonth = "";

  for (const [wk, dayMap] of weeks) {
    const firstDay = dayMap.values().next().value![0].start_time;
    const mk = monthKey(firstDay);

    if (mk !== lastMonth) {
      const me = monthEarned(mk);
      body += `
      <div class="month-header">
        <span>${mk}</span>
        <span class="month-total">${currency} ${me.toLocaleString()}</span>
      </div>`;
      lastMonth = mk;
    }

    const we = weekEarned(wk);
    body += `
    <div class="week-block">
      <div class="week-header">
        <span class="week-label">Week of ${wk}</span>
        <span class="week-earned">${currency} ${we.toLocaleString()}</span>
      </div>`;

    for (const [_dk, daySessions] of dayMap) {
      const firstS = daySessions[0];
      body += `<div class="day-group">
        <div class="day-label">${friendlyDate(firstS.start_time)}</div>
        <div class="sessions-list">`;

      for (const s of daySessions) {
        const isExcluded = excluded.has(s.id);
        const isCanceled = isCancelled(s);
        const rowClass = isExcluded
          ? "session-row excluded"
          : isCanceled
            ? "session-row cancelled"
            : "session-row";

        const seriesName = s.series_title ?? typeLabel(s.session_type);
        const players = parseInt(s.player_count, 10);
        const playerText = players > 0 ? `${players} player${players !== 1 ? "s" : ""}` : "—";

        let excludeBtn = "";
        if (isManage) {
          excludeBtn = `
            <button
              class="toggle-btn ${isExcluded ? "btn-show" : "btn-hide"}"
              onclick="toggleSession('${s.id}', this)"
            >${isExcluded ? "Show" : "Hide"}</button>`;
        }

        const earnedCell = !isManage
          ? ""
          : `<span class="cell-earned">${isExcluded || isCanceled ? "—" : `${currency} ${rate}`}</span>`;

        body += `
          <div class="${rowClass}" data-id="${s.id}">
            <span class="cell-time">${formatTimeRange(s.start_time, s.end_time)}</span>
            <span class="cell-badge" style="${typeBadgeStyle(s.session_type)}">${typeLabel(s.session_type)}</span>
            <span class="cell-level">${levelDot(s.ball_level)}</span>
            <span class="cell-players">${playerText}</span>
            <span class="cell-series">${seriesName}</span>
            <span class="cell-status">${statusBadge(s.status)}</span>
            ${earnedCell}
            ${excludeBtn}
          </div>`;
      }

      body += `</div></div>`;
    }

    body += `</div>`;
  }

  const totalSessions = sessions.filter(countsForPayment).length;
  const manageNote = isManage
    ? `<div class="manage-banner">
        <span>Admin View — Toggle sessions to show/hide from Dean's report</span>
       </div>`
    : "";

  const toggleScript = isManage ? `
  <script>
    async function toggleSession(id, btn) {
      btn.disabled = true;
      const url = window.location.pathname.replace(/\/$/, '') + '/exclude';
      const token = new URLSearchParams(window.location.search).get('manage');
      const res = await fetch(url + '?manage=' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id })
      });
      if (res.ok) {
        const row = btn.closest('.session-row');
        if (row.classList.contains('excluded')) {
          row.classList.remove('excluded');
          btn.textContent = 'Hide';
          btn.className = 'toggle-btn btn-hide';
        } else {
          row.classList.add('excluded');
          btn.textContent = 'Show';
          btn.className = 'toggle-btn btn-show';
        }
        btn.disabled = false;
      } else {
        alert('Error toggling session');
        btn.disabled = false;
      }
    }
  </script>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dean Hamilton — Session Overview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg:       #0C1118;
      --bg2:      #111820;
      --bg3:      #161D28;
      --bg4:      #1C2533;
      --accent:   #C8FF3D;
      --text:     #F0F4F8;
      --muted:    #8A95A3;
      --border:   rgba(255,255,255,0.07);
      --radius:   12px;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 0 0 80px;
    }
    .top-bar {
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .top-bar-left { display: flex; align-items: center; gap: 14px; }
    .coach-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #C8FF3D 0%, #7FCC00 100%);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 17px; color: #0C1118; flex-shrink: 0;
    }
    .coach-name { font-weight: 700; font-size: 17px; }
    .coach-sub  { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .grand-total {
      text-align: right;
    }
    .grand-total-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; }
    .grand-total-value { font-size: 22px; font-weight: 800; color: var(--accent); }
    .grand-total-sub   { font-size: 11px; color: var(--muted); margin-top: 2px; }

    .manage-banner {
      background: linear-gradient(90deg, #7C3AED22, #2563EB22);
      border-bottom: 1px solid #7C3AED55;
      padding: 10px 24px;
      font-size: 13px;
      color: #A78BFA;
      font-weight: 600;
      text-align: center;
    }

    .content { max-width: 860px; margin: 0 auto; padding: 28px 16px 0; }

    .month-header {
      display: flex; align-items: center; justify-content: space-between;
      margin: 32px 0 8px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border);
    }
    .month-header span:first-child { font-size: 20px; font-weight: 800; color: var(--text); }
    .month-total { font-size: 16px; font-weight: 700; color: var(--accent); }

    .week-block {
      margin-bottom: 24px;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .week-header {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--bg3);
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
    }
    .week-label  { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
    .week-earned { font-size: 13px; font-weight: 700; color: var(--accent); }

    .day-group { border-bottom: 1px solid var(--border); }
    .day-group:last-child { border-bottom: none; }
    .day-label {
      font-size: 12px; font-weight: 700; color: var(--muted);
      padding: 8px 16px 4px;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .sessions-list { padding: 0 8px 8px; display: flex; flex-direction: column; gap: 4px; }

    .session-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px;
      border-radius: 8px;
      background: var(--bg4);
      transition: background .15s;
      flex-wrap: wrap;
    }
    .session-row:hover { background: #1e2d40; }
    .session-row.excluded {
      opacity: .38;
      background: var(--bg3);
    }
    .session-row.cancelled { opacity: .5; }

    .cell-time   { font-size: 13px; font-weight: 700; min-width: 110px; color: var(--text); }
    .cell-badge  { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; min-width: 84px; text-align: center; letter-spacing: .3px; }
    .cell-level  { min-width: 80px; }
    .cell-players{ font-size: 12px; color: var(--muted); min-width: 62px; }
    .cell-series { font-size: 12px; color: var(--muted); flex: 1; min-width: 100px; }
    .cell-status { min-width: 80px; text-align: right; }
    .cell-earned { font-size: 12px; font-weight: 700; color: var(--accent); min-width: 72px; text-align: right; }

    .toggle-btn {
      border: none; border-radius: 6px; padding: 4px 12px; font-size: 11px;
      font-weight: 700; cursor: pointer; font-family: inherit;
      transition: opacity .15s;
    }
    .toggle-btn:disabled { opacity: .4; cursor: not-allowed; }
    .btn-hide { background: #EF44441a; color: #EF4444; border: 1px solid #EF444433; }
    .btn-show { background: #22C55E1a; color: #22C55E; border: 1px solid #22C55E33; }
    .btn-hide:hover:not(:disabled) { background: #EF444430; }
    .btn-show:hover:not(:disabled) { background: #22C55E30; }

    .summary-strip {
      max-width: 860px; margin: 28px auto 0; padding: 0 16px;
    }
    .summary-card {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 16px;
    }
    .summary-item { text-align: center; }
    .summary-value { font-size: 28px; font-weight: 800; color: var(--accent); }
    .summary-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-top: 2px; }

    .footer {
      text-align: center; color: var(--muted); font-size: 11px;
      margin-top: 40px; padding: 0 16px;
    }

    @media (max-width: 600px) {
      .session-row { gap: 7px; }
      .cell-time   { min-width: 90px; }
      .cell-series { display: none; }
      .top-bar { padding: 16px; }
    }
  </style>
</head>
<body>

<div class="top-bar">
  <div class="top-bar-left">
    <div class="coach-avatar">DH</div>
    <div>
      <div class="coach-name">Dean Hamilton</div>
      <div class="coach-sub">Sessions from 11 May 2026 · ${currency} ${rate} / session</div>
    </div>
  </div>
  <div class="grand-total">
    <div class="grand-total-label">Total Earned</div>
    <div class="grand-total-value">${currency} ${grandTotal.toLocaleString()}</div>
    <div class="grand-total-sub">${totalSessions} sessions counted</div>
  </div>
</div>

${manageNote}

<div class="content">
  ${body || '<p style="color:var(--muted);text-align:center;padding:40px 0;">No sessions found.</p>'}
</div>

<div class="summary-strip">
  <div class="summary-card">
    <div class="summary-item">
      <div class="summary-value">${totalSessions}</div>
      <div class="summary-label">Sessions Counted</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${sessions.filter(s => s.status === "completed" && !excluded.has(s.id)).length}</div>
      <div class="summary-label">Completed</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${sessions.filter(s => s.status === "cancelled").length}</div>
      <div class="summary-label">Cancelled</div>
    </div>
    <div class="summary-item">
      <div class="summary-value" style="color:var(--accent)">${currency} ${grandTotal.toLocaleString()}</div>
      <div class="summary-label">Total ${currency}</div>
    </div>
  </div>
</div>

<div class="footer">
  <p>Generated ${new Date().toUTCString()}</p>
  <p style="margin-top:4px">Glow Up Sports · Private &amp; Confidential</p>
</div>

${toggleScript}
</body>
</html>`;
}

// ── routes ────────────────────────────────────────────────────────────────────

router.get("/coach-overview/dean/:token", async (req: Request, res: Response) => {
  try {
    const cfg = loadConfig();
    const { token } = req.params;
    const manageParam = req.query["manage"] as string | undefined;

    const isPublic = token === cfg.publicToken;
    const isManage = isPublic && manageParam === cfg.manageToken;

    if (!isPublic) {
      return res.status(404).send("Not found");
    }

    const sessions = await fetchSessions(cfg.startDate);
    const html = buildHTML(sessions, cfg, isManage);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(html);
  } catch (err) {
    console.error("[CoachReport] Error:", err);
    return res.status(500).send("Internal error");
  }
});

router.post("/coach-overview/dean/:token/exclude", async (req: Request, res: Response) => {
  try {
    const cfg = loadConfig();
    const { token } = req.params;
    const manageParam = req.query["manage"] as string | undefined;

    if (token !== cfg.publicToken || manageParam !== cfg.manageToken) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const excluded = new Set(cfg.excludedSessionIds);
    if (excluded.has(sessionId)) {
      excluded.delete(sessionId);
    } else {
      excluded.add(sessionId);
    }

    cfg.excludedSessionIds = Array.from(excluded);
    saveConfig(cfg);

    return res.json({ ok: true, excluded: cfg.excludedSessionIds.includes(sessionId) });
  } catch (err) {
    console.error("[CoachReport] Toggle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
