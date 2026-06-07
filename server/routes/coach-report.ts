// Dean Hamilton — Coach Session Report
//
// Public shareable HTML page showing Dean's sessions from May 11 2026 onwards.
// Fixed rate: 200 AED per session (non-cancelled, non-excluded).
// No player names shown — only time, type, level colours, player count, status.
//
// Routes:
//   GET  /coach-overview/dean/:token          — public view (shareable with Dean)
//   POST /api/coach-report/dean/:token/exclude — toggle session exclusion (manage token required)
//   POST /api/coach-report/dean/:token/pay     — toggle session paid status (manage token required)
//
// Tokens read from env vars (never stored in source):
//   DEAN_REPORT_PUBLIC_TOKEN  — the token Dean uses in his URL
//   DEAN_REPORT_MANAGE_TOKEN  — the ?manage= token for the admin toggle view
//
// State (excluded + paid session IDs) persisted in Supabase: coach_report_state table.

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sessions as sessionsTable, coachingSeries, sessionPlayers, coachReportState } from "@shared/schema";
import { eq, gte, and, count } from "drizzle-orm";

const router = Router();

const DEAN_COACH_ID = "76f7d0e7-1363-404f-93d0-7edcce95a28d";

function getPublicToken(): string {
  return process.env.DEAN_REPORT_PUBLIC_TOKEN ?? "";
}

function getManageToken(): string {
  return process.env.DEAN_REPORT_MANAGE_TOKEN ?? "";
}

interface ReportState {
  excludedSessionIds: string[];
  paidSessionIds: string[];
  startDate: string;
  ratePerSession: number;
  currency: string;
}

async function loadState(): Promise<ReportState> {
  try {
    const rows = await db.select().from(coachReportState).where(eq(coachReportState.key, "dean")).limit(1);
    if (rows.length === 0) {
      return { excludedSessionIds: [], paidSessionIds: [], startDate: "2026-05-11", ratePerSession: 200, currency: "AED" };
    }
    const row = rows[0];
    return {
      excludedSessionIds: (row.excludedSessionIds as string[]) ?? [],
      paidSessionIds: (row.paidSessionIds as string[]) ?? [],
      startDate: row.startDate ?? "2026-05-11",
      ratePerSession: row.ratePerSession ?? 200,
      currency: row.currency ?? "AED",
    };
  } catch (err) {
    console.error("[CoachReport] loadState DB error:", err);
    return { excludedSessionIds: [], paidSessionIds: [], startDate: "2026-05-11", ratePerSession: 200, currency: "AED" };
  }
}

async function saveState(state: ReportState): Promise<void> {
  await db.insert(coachReportState)
    .values({
      key: "dean",
      paidSessionIds: state.paidSessionIds,
      excludedSessionIds: state.excludedSessionIds,
      startDate: state.startDate,
      ratePerSession: state.ratePerSession,
      currency: state.currency,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: coachReportState.key,
      set: {
        paidSessionIds: state.paidSessionIds,
        excludedSessionIds: state.excludedSessionIds,
        startDate: state.startDate,
        ratePerSession: state.ratePerSession,
        currency: state.currency,
        updatedAt: new Date(),
      },
    });
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
  const rows = await db
    .select({
      id: sessionsTable.id,
      start_time: sessionsTable.startTime,
      end_time: sessionsTable.endTime,
      session_type: sessionsTable.sessionType,
      ball_level: sessionsTable.ballLevel,
      status: sessionsTable.status,
      series_title: coachingSeries.title,
      player_count: count(sessionPlayers.playerId),
    })
    .from(sessionsTable)
    .leftJoin(coachingSeries, eq(coachingSeries.id, sessionsTable.seriesId))
    .leftJoin(sessionPlayers, eq(sessionPlayers.sessionId, sessionsTable.id))
    .where(
      and(
        eq(sessionsTable.coachId, DEAN_COACH_ID),
        gte(sessionsTable.startTime, new Date(startDate)),
        eq(sessionsTable.status, "completed")
      )
    )
    .groupBy(sessionsTable.id, coachingSeries.title)
    .orderBy(sessionsTable.startTime);

  return rows.map(r => ({
    ...r,
    player_count: String(r.player_count),
  }));
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

// Dubai is UTC+4 — shift every timestamp into local time before extracting date parts
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
function toLocalDate(d: Date): Date {
  return new Date(new Date(d).getTime() + DUBAI_OFFSET_MS);
}

function formatTime(d: Date): string {
  const dt = toLocalDate(d);
  const h = dt.getUTCHours().toString().padStart(2, "0");
  const m = dt.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function isoDate(d: Date): string {
  return toLocalDate(d).toISOString().slice(0, 10);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function friendlyDate(d: Date): string {
  const dt = toLocalDate(d);
  const day = DAY_NAMES[dt.getUTCDay()];
  const mon = MONTH_NAMES[dt.getUTCMonth()];
  return `${day}, ${dt.getUTCDate()} ${mon} ${dt.getUTCFullYear()}`;
}

function weekKey(d: Date): string {
  const dt = toLocalDate(d);
  const day = dt.getUTCDay();
  const diff = dt.getUTCDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), diff));
  const sun = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), diff + 6));
  const ms = MONTH_NAMES[mon.getUTCMonth()];
  const me = MONTH_NAMES[sun.getUTCMonth()];
  return `${mon.getUTCDate()} ${ms} – ${sun.getUTCDate()} ${me} ${sun.getUTCFullYear()}`;
}

function monthKey(d: Date): string {
  const dt = toLocalDate(d);
  return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHTML(sessions: SessionRow[], state: ReportState, isManage: boolean): string {
  const excluded = new Set(state.excludedSessionIds);
  const paid = new Set(state.paidSessionIds);
  const rate = state.ratePerSession;
  const currency = state.currency;

  // Openstaand: not paid, not excluded, not cancelled
  const openstaandSessions = sessions.filter(s =>
    !paid.has(s.id) && !excluded.has(s.id) && s.status !== "cancelled"
  );

  // Betaald: marked as paid
  const betaaldSessions = sessions.filter(s => paid.has(s.id));

  // In manage view, the "Openstaand" tab shows everything that is NOT paid
  // (including excluded/cancelled so admin can manage them)
  const manageOpenstaand = sessions.filter(s => !paid.has(s.id));

  const openstaandTotal = openstaandSessions.length * rate;
  const betaaldTotal = betaaldSessions.length * rate;

  // ── build Openstaand tab body (week/day grouped) ──────────────────────────
  function buildOpenstaandBody(tabSessions: SessionRow[]): string {
    type DayMap = Map<string, SessionRow[]>;
    type WeekMap = Map<string, DayMap>;
    const weeks: WeekMap = new Map();

    for (const s of tabSessions) {
      const wk = weekKey(s.start_time);
      const dk = isoDate(s.start_time);
      if (!weeks.has(wk)) weeks.set(wk, new Map());
      const dayMap = weeks.get(wk)!;
      if (!dayMap.has(dk)) dayMap.set(dk, []);
      dayMap.get(dk)!.push(s);
    }

    if (weeks.size === 0) {
      return `<p class="empty-msg">No outstanding sessions.</p>`;
    }

    let body = "";
    let lastMonth = "";

    for (const [wk, dayMap] of weeks) {
      const firstDay = dayMap.values().next().value![0].start_time;
      const mk = monthKey(firstDay);

      if (mk !== lastMonth) {
        body += `<div class="month-header">
          <span>${mk}</span>
        </div>`;
        lastMonth = mk;
      }

      body += `<div class="week-block">
        <div class="week-header">
          <span class="week-label">Week of ${wk}</span>
        </div>`;

      for (const [_dk, daySessions] of dayMap) {
        const firstS = daySessions[0];
        body += `<div class="day-group">
          <div class="day-label">${friendlyDate(firstS.start_time)}</div>
          <div class="sessions-list">`;

        for (const s of daySessions) {
          const isExcluded = excluded.has(s.id);
          const isCanceled = s.status === "cancelled";
          const rowClass = isExcluded
            ? "session-row excluded"
            : isCanceled
              ? "session-row cancelled"
              : "session-row";

          const seriesName = s.series_title ?? typeLabel(s.session_type);
          const amountStr = (!isExcluded && !isCanceled) ? `${currency} ${rate}` : "—";

          let buttons = "";
          if (isManage) {
            buttons = `
              <button
                class="toggle-btn ${isExcluded ? "btn-show" : "btn-hide"}"
              >${isExcluded ? "Show" : "Hide"}</button>
              <button
                class="toggle-btn btn-pay"
                data-friendly="${friendlyDate(s.start_time)}"
                data-time="${formatTimeRange(s.start_time, s.end_time)}"
                data-type-label="${typeLabel(s.session_type)}"
                data-type-style="${typeBadgeStyle(s.session_type)}"
                data-level-html="${levelDot(s.ball_level).replace(/"/g, '&quot;')}"
                data-amount="${amountStr}"
              >Mark Paid</button>`;
          }

          const earnedCell = isManage
            ? `<span class="cell-earned">${amountStr}</span>`
            : `<span class="cell-earned">${amountStr}</span>`;

          body += `
            <div class="${rowClass}" data-id="${s.id}">
              <span class="cell-time">${formatTimeRange(s.start_time, s.end_time)}</span>
              <span class="cell-badge" style="${typeBadgeStyle(s.session_type)}">${typeLabel(s.session_type)}</span>
              <span class="cell-level">${levelDot(s.ball_level)}</span>
              <span class="cell-series">${seriesName}</span>
              ${earnedCell}
              ${buttons}
            </div>`;
        }

        body += `</div></div>`;
      }

      body += `</div>`;
    }

    return body;
  }

  // ── build Betaald tab body (flat list, newest first) ──────────────────────
  function buildBetaaldBody(tabSessions: SessionRow[]): string {
    if (tabSessions.length === 0) {
      return `<p class="empty-msg">No paid sessions yet.</p>`;
    }

    // Sort newest first
    const sorted = [...tabSessions].sort((a, b) =>
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    let body = `<div id="betaald-list" class="betaald-list">`;
    for (const s of sorted) {
      let buttons = "";
      if (isManage) {
        buttons = `<button
          class="toggle-btn btn-unpay"
        >Mark Unpaid</button>`;
      }

      body += `
        <div class="session-row paid-row" data-id="${s.id}">
          <span class="cell-date">${friendlyDate(s.start_time)}</span>
          <span class="cell-time">${formatTimeRange(s.start_time, s.end_time)}</span>
          <span class="cell-badge" style="${typeBadgeStyle(s.session_type)}">${typeLabel(s.session_type)}</span>
          <span class="cell-earned">${currency} ${rate}</span>
          <span class="paid-badge">Paid</span>
          ${buttons}
        </div>`;
    }
    body += `</div>`;
    return body;
  }

  const openstaandBody = buildOpenstaandBody(isManage ? manageOpenstaand : openstaandSessions);
  const betaaldBody = buildBetaaldBody(betaaldSessions);

  const manageNote = isManage
    ? `<div class="manage-banner">
        <span>Admin View — Toggle sessions to show/hide · Mark sessions as paid/unpaid</span>
       </div>`
    : "";

  // JavaScript for manage view
  const toggleScript = isManage ? `
  <script>
    var _token = new URLSearchParams(window.location.search).get('manage');
    var _parts = window.location.pathname.split('/').filter(Boolean);
    var _base = '/api/coach-report/dean/' + _parts[_parts.length - 1];

    function getManageUrl(action) {
      return _base + '/' + action + '?manage=' + encodeURIComponent(_token);
    }

    function showError(msg) {
      var banner = document.getElementById('manage-error-banner');
      if (!banner) return;
      banner.textContent = msg || 'Something went wrong — please try again.';
      banner.style.display = 'block';
      clearTimeout(banner._hideTimer);
      banner._hideTimer = setTimeout(function() { banner.style.display = 'none'; }, 6000);
    }

    async function toggleSession(id, btn) {
      btn.disabled = true;
      try {
        const res = await fetch(getManageUrl('exclude'), {
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
        } else {
          const err = await res.json().catch(() => ({}));
          showError('Error toggling session: ' + (err.error || res.status));
        }
      } catch (err) {
        showError('Network error — please check your connection.');
      }
      btn.disabled = false;
    }

    async function togglePay(id, btn) {
      btn.disabled = true;
      try {
        const res = await fetch(getManageUrl('pay'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showError('Error toggling payment: ' + (err.error || res.status));
          btn.disabled = false;
          return;
        }
        const data = await res.json();
        const nowPaid = data.paid;

        if (nowPaid) {
          // Move from Openstaand to Betaald
          const row = btn.closest('.session-row');
          const friendlyDateStr = btn.dataset.friendly || '';
          const timeStr = btn.dataset.time || '';
          const typeLabel = btn.dataset.typeLabel || '';
          const typeStyle = btn.dataset.typeStyle || '';
          const currency = '${currency}';
          const rate = ${rate};

          // Remove from Openstaand
          const dayList = row.parentElement;
          row.remove();
          cleanupEmptyGroups(dayList);
          updateOpenstaandCount(-1);

          // Add to Betaald list
          const betaaldList = document.getElementById('betaald-list') || createBetaaldList();
          const newRow = document.createElement('div');
          newRow.className = 'session-row paid-row';
          newRow.dataset.id = id;
          newRow.innerHTML =
            '<span class="cell-date">' + friendlyDateStr + '</span>' +
            '<span class="cell-time">' + timeStr + '</span>' +
            '<span class="cell-badge" style="' + typeStyle + '">' + typeLabel + '</span>' +
            '<span class="cell-earned">' + currency + ' ' + rate + '</span>' +
            '<span class="paid-badge">Paid</span>' +
            '<button class="toggle-btn btn-unpay">Mark Unpaid</button>';
          betaaldList.insertBefore(newRow, betaaldList.firstChild);
          updateBetaaldCount(1);

          // Hide the empty message if present
          const emptyMsg = document.querySelector('#tab-betaald .empty-msg');
          if (emptyMsg) emptyMsg.style.display = 'none';
        } else {
          // Move from Betaald to Openstaand — just reload for simplicity
          window.location.reload();
          return;
        }
      } catch (err) {
        showError('Network error — please check your connection.');
      }
      btn.disabled = false;
    }

    function cleanupEmptyGroups(sessionsList) {
      if (!sessionsList) return;
      const dayGroup = sessionsList.parentElement;
      if (dayGroup && sessionsList.children.length === 0) {
        const weekBlock = dayGroup.parentElement;
        dayGroup.remove();
        if (weekBlock) {
          const dayGroups = weekBlock.querySelectorAll('.day-group');
          if (dayGroups.length === 0) {
            const monthHeader = weekBlock.previousElementSibling;
            weekBlock.remove();
            if (monthHeader && monthHeader.classList.contains('month-header')) {
              const next = monthHeader.nextElementSibling;
              if (!next || !next.classList.contains('week-block')) {
                monthHeader.remove();
              }
            }
          }
        }
      }
      const tabContent = document.getElementById('tab-openstaand');
      const remaining = tabContent ? tabContent.querySelectorAll('.session-row') : [];
      if (remaining.length === 0 && tabContent) {
        const existing = tabContent.querySelector('.empty-msg');
        if (!existing) {
          tabContent.innerHTML = '<p class="empty-msg">No outstanding sessions.</p>';
        }
      }
    }

    function createBetaaldList() {
      const tab = document.getElementById('tab-betaald');
      const list = document.createElement('div');
      list.id = 'betaald-list';
      list.className = 'betaald-list';
      tab.appendChild(list);
      return list;
    }

    function updateOpenstaandCount(delta) {
      const el = document.getElementById('openstaand-count');
      const amtEl = document.getElementById('openstaand-amount');
      if (el) {
        const cur = parseInt(el.textContent, 10) || 0;
        const next = Math.max(0, cur + delta);
        el.textContent = next;
        if (amtEl) amtEl.textContent = '${currency} ' + (next * ${rate}).toLocaleString();
      }
    }

    function updateBetaaldCount(delta) {
      const el = document.getElementById('betaald-count');
      const amtEl = document.getElementById('betaald-amount');
      if (el) {
        const cur = parseInt(el.textContent, 10) || 0;
        const next = Math.max(0, cur + delta);
        el.textContent = next;
        if (amtEl) amtEl.textContent = '${currency} ' + (next * ${rate}).toLocaleString();
      }
    }

    function switchTab(tab) {
      document.getElementById('tab-openstaand').style.display = tab === 'openstaand' ? 'block' : 'none';
      document.getElementById('tab-betaald').style.display = tab === 'betaald' ? 'block' : 'none';
      document.getElementById('tab-btn-openstaand').classList.toggle('tab-active', tab === 'openstaand');
      document.getElementById('tab-btn-betaald').classList.toggle('tab-active', tab === 'betaald');
    }

    document.addEventListener('DOMContentLoaded', function() {
      var btnO = document.getElementById('tab-btn-openstaand');
      var btnB = document.getElementById('tab-btn-betaald');
      if (btnO) btnO.addEventListener('click', function() { switchTab('openstaand'); });
      if (btnB) btnB.addEventListener('click', function() { switchTab('betaald'); });

      document.addEventListener('click', function(e) {
        var btn = e.target.closest('.toggle-btn');
        if (!btn) return;
        var row = btn.closest('[data-id]');
        if (!row) return;
        var id = row.dataset.id;
        if (btn.classList.contains('btn-hide') || btn.classList.contains('btn-show')) {
          toggleSession(id, btn);
        } else if (btn.classList.contains('btn-pay') || btn.classList.contains('btn-unpay')) {
          togglePay(id, btn);
        }
      });
    });
  </script>` : `
  <script>
    function switchTab(tab) {
      document.getElementById('tab-openstaand').style.display = tab === 'openstaand' ? 'block' : 'none';
      document.getElementById('tab-betaald').style.display = tab === 'betaald' ? 'block' : 'none';
      document.getElementById('tab-btn-openstaand').classList.toggle('tab-active', tab === 'openstaand');
      document.getElementById('tab-btn-betaald').classList.toggle('tab-active', tab === 'betaald');
    }

    document.addEventListener('DOMContentLoaded', function() {
      var btnO = document.getElementById('tab-btn-openstaand');
      var btnB = document.getElementById('tab-btn-betaald');
      if (btnO) btnO.addEventListener('click', function() { switchTab('openstaand'); });
      if (btnB) btnB.addEventListener('click', function() { switchTab('betaald'); });
    });
  </script>`;

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
      --orange:   #F97316;
      --green:    #22C55E;
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

    /* Summary totals strip */
    .summary-totals {
      display: flex; gap: 12px; align-items: center;
    }
    .summary-total-item {
      text-align: right;
    }
    .summary-total-label {
      font-size: 10px; color: var(--muted); text-transform: uppercase;
      letter-spacing: .6px; font-weight: 600;
    }
    .summary-total-amount {
      font-size: 20px; font-weight: 800;
    }
    .summary-total-count {
      font-size: 11px; color: var(--muted); margin-top: 1px;
    }
    .color-orange { color: var(--orange); }
    .color-green  { color: var(--green); }
    .summary-divider { width: 1px; height: 40px; background: var(--border); }

    .manage-banner {
      background: linear-gradient(90deg, #7C3AED22, #2563EB22);
      border-bottom: 1px solid #7C3AED55;
      padding: 10px 24px;
      font-size: 13px;
      color: #A78BFA;
      font-weight: 600;
      text-align: center;
    }

    /* Tabs */
    .tabs-bar {
      max-width: 860px; margin: 24px auto 0; padding: 0 16px;
      display: flex; gap: 4px;
      border-bottom: 2px solid var(--border);
    }
    .tab-btn {
      background: none; border: none; cursor: pointer;
      font-family: inherit; font-size: 14px; font-weight: 700;
      color: var(--muted); padding: 10px 20px 12px;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: color .15s, border-color .15s;
      display: flex; align-items: center; gap: 8px;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.tab-active { color: var(--text); border-bottom-color: var(--accent); }
    .tab-count {
      font-size: 11px; font-weight: 800;
      padding: 2px 7px; border-radius: 20px;
      background: var(--bg3);
    }
    .tab-btn.tab-active .tab-count { background: var(--accent); color: #0C1118; }

    .content { max-width: 860px; margin: 0 auto; padding: 24px 16px 0; }

    .month-header {
      display: flex; align-items: center; justify-content: space-between;
      margin: 24px 0 8px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--border);
    }
    .month-header span:first-child { font-size: 20px; font-weight: 800; color: var(--text); }

    .week-block {
      margin-bottom: 20px;
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

    /* Betaald tab flat list */
    .betaald-list { display: flex; flex-direction: column; gap: 6px; }
    .paid-row { background: #0d1f14; border: 1px solid #22C55E22; }
    .paid-row:hover { background: #122a1a; }
    .paid-badge {
      font-size: 11px; font-weight: 800;
      padding: 3px 10px; border-radius: 20px;
      background: #22C55E1a; color: #22C55E;
      border: 1px solid #22C55E33;
    }

    .cell-date   { font-size: 12px; font-weight: 600; color: var(--muted); min-width: 160px; }
    .cell-time   { font-size: 13px; font-weight: 700; min-width: 110px; color: var(--text); }
    .cell-badge  { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; min-width: 84px; text-align: center; letter-spacing: .3px; }
    .cell-level  { min-width: 80px; }
    .cell-series { font-size: 12px; color: var(--muted); flex: 1; min-width: 100px; }
    .cell-earned { font-size: 12px; font-weight: 700; color: var(--accent); min-width: 72px; text-align: right; }

    .toggle-btn {
      border: none; border-radius: 6px; padding: 4px 12px; font-size: 11px;
      font-weight: 700; cursor: pointer; font-family: inherit;
      transition: opacity .15s;
    }
    .toggle-btn:disabled { opacity: .4; cursor: not-allowed; }
    .btn-hide   { background: #EF44441a; color: #EF4444; border: 1px solid #EF444433; }
    .btn-show   { background: #22C55E1a; color: #22C55E; border: 1px solid #22C55E33; }
    .btn-pay    { background: #22C55E1a; color: #22C55E; border: 1px solid #22C55E33; }
    .btn-unpay  { background: #F973161a; color: #F97316; border: 1px solid #F9731633; }
    .btn-hide:hover:not(:disabled)  { background: #EF444430; }
    .btn-show:hover:not(:disabled)  { background: #22C55E30; }
    .btn-pay:hover:not(:disabled)   { background: #22C55E30; }
    .btn-unpay:hover:not(:disabled) { background: #F9731630; }

    .empty-msg {
      color: var(--muted); text-align: center; padding: 40px 0; font-size: 14px;
    }

    .footer {
      text-align: center; color: var(--muted); font-size: 11px;
      margin-top: 40px; padding: 0 16px;
    }

    @media (max-width: 600px) {
      .session-row { gap: 7px; }
      .cell-time   { min-width: 90px; }
      .cell-series { display: none; }
      .cell-date   { min-width: 0; font-size: 11px; }
      .top-bar { padding: 16px; }
      .summary-totals { gap: 8px; }
      .summary-total-amount { font-size: 16px; }
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
  <div class="summary-totals">
    <div class="summary-total-item">
      <div class="summary-total-label">Openstaand</div>
      <div class="summary-total-amount color-orange" id="openstaand-amount">${currency} ${openstaandTotal.toLocaleString()}</div>
      <div class="summary-total-count"><span id="openstaand-count">${openstaandSessions.length}</span> sessions</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-total-item">
      <div class="summary-total-label">Betaald</div>
      <div class="summary-total-amount color-green" id="betaald-amount">${currency} ${betaaldTotal.toLocaleString()}</div>
      <div class="summary-total-count"><span id="betaald-count">${betaaldSessions.length}</span> sessions</div>
    </div>
  </div>
</div>

${manageNote}
${isManage ? `<div id="manage-error-banner" style="display:none;background:#7f1d1d;color:#fca5a5;border:1px solid #ef444466;border-radius:10px;padding:12px 16px;margin:0 16px 8px;font-size:13px;font-weight:500;"></div>` : ''}

<div class="tabs-bar">
  <button class="tab-btn tab-active" id="tab-btn-openstaand">
    Openstaand
    <span class="tab-count">${isManage ? manageOpenstaand.length : openstaandSessions.length}</span>
  </button>
  <button class="tab-btn" id="tab-btn-betaald">
    Betaald
    <span class="tab-count">${betaaldSessions.length}</span>
  </button>
</div>

<div id="tab-openstaand" class="content">
  ${openstaandBody}
</div>

<div id="tab-betaald" class="content" style="display:none;">
  ${betaaldBody}
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

router.get(["/coach-overview/dean/:token", "/api/coach-report/dean/:token"], async (req: Request, res: Response) => {
  console.log("[CoachReport] GET", req.path, "env-token-set:", !!process.env.DEAN_REPORT_PUBLIC_TOKEN);
  try {
    const { token } = req.params;
    const manageParam = req.query["manage"] as string | undefined;

    const isPublic = token === getPublicToken().trim();
    const manageToken = getManageToken().trim();
    const decodedManage = manageParam ? decodeURIComponent(manageParam).trim() : undefined;
    const isManage = isPublic && !!manageToken && decodedManage === manageToken;

    if (!isPublic) {
      return res.status(404).send("Not found");
    }

    const state = await loadState();
    const sessions = await fetchSessions(state.startDate);
    const html = buildHTML(sessions, state, isManage);

    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Surrogate-Control", "no-store");
      return res.send(html);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CoachReport] Error rendering report:", msg);
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(500).send(
        "Coach report temporarily unavailable — please try again in a moment."
      );
    }
  }
});

router.post(["/coach-overview/dean/:token/exclude", "/api/coach-report/dean/:token/exclude"], async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const manageParam = req.query["manage"] as string | undefined;
    const manageToken = getManageToken().trim();
    const decodedManage = manageParam ? decodeURIComponent(manageParam).trim() : undefined;

    if (token !== getPublicToken().trim() || !manageToken || decodedManage !== manageToken) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const state = await loadState();
    const excluded = new Set(state.excludedSessionIds);
    if (excluded.has(sessionId)) {
      excluded.delete(sessionId);
    } else {
      excluded.add(sessionId);
    }

    state.excludedSessionIds = Array.from(excluded);
    await saveState(state);

    return res.json({ ok: true, excluded: state.excludedSessionIds.includes(sessionId) });
  } catch (err) {
    console.error("[CoachReport] Toggle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post(["/coach-overview/dean/:token/pay", "/api/coach-report/dean/:token/pay"], async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const manageParam = req.query["manage"] as string | undefined;
    const manageToken = getManageToken().trim();
    const decodedManage = manageParam ? decodeURIComponent(manageParam).trim() : undefined;

    if (token !== getPublicToken().trim() || !manageToken || decodedManage !== manageToken) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const state = await loadState();
    const paidSet = new Set(state.paidSessionIds);
    if (paidSet.has(sessionId)) {
      paidSet.delete(sessionId);
    } else {
      paidSet.add(sessionId);
    }

    state.paidSessionIds = Array.from(paidSet);
    await saveState(state);

    return res.json({ ok: true, paid: state.paidSessionIds.includes(sessionId) });
  } catch (err) {
    console.error("[CoachReport] Pay toggle error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
