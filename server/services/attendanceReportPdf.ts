export interface AttendanceRecord {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: string | null;
  lateMinutes: number | null;
  seriesId?: string | null;
  paymentStatus?: "paid" | "pending" | "cancelled" | "no_charge";
}

export interface SeriesInfo {
  id: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  sessionType: string;
}

export interface SeriesAttendanceSummary {
  series: SeriesInfo;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
}

export interface AttendanceReportData {
  reportDate: string;
  academy: {
    name: string;
    logo?: string;
  };
  player: {
    name: string;
    ballLevel?: string;
  };
  summary: {
    totalSessions: number;
    presentCount: number;
    absentCount: number;
    attendanceRate: number;
  };
  records: AttendanceRecord[];
  seriesMap?: Record<string, SeriesInfo>;
  seriesSummaries?: SeriesAttendanceSummary[];
}

export function generateAttendanceReportHtml(data: AttendanceReportData): string {
  const vacationStatuses = new Set(['vacation', 'holiday']);
  const lessonRecords = data.records.filter(r => !vacationStatuses.has(r.status || ''));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Dubai',
      });
    } catch {
      return '';
    }
  };

  const getSessionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      private: 'Private',
      semi_private: 'Semi-Private',
      group: 'Group',
    };
    return labels[type] || type;
  };

  const getStatusColor = (status: string | null) => {
    if (status === 'present') return '#10B981';
    if (status === 'absent') return '#EF4444';
    if (status === 'late') return '#F97316';
    if (status === 'cancelled') return '#6B7280';
    if (status === 'active') return '#6B7280';
    return '#F59E0B';
  };

  const getStatusLabel = (status: string | null, lateMinutes?: number | null) => {
    if (status === 'present') return 'Present';
    if (status === 'absent') return 'Absent';
    if (status === 'late') return `Late${lateMinutes && lateMinutes > 0 ? ` (+${lateMinutes}m)` : ''}`;
    if (status === 'cancelled') return 'Cancelled';
    if (status === 'pending') return 'Pending';
    if (status === 'active') return 'Scheduled';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
  };

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 90) return '#10B981';
    if (rate >= 75) return '#C8FF3D';
    if (rate >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const monthLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
  };

  const monthKey = (dateStr: string) => {
    const d = new Date(dateStr);
    const y = d.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Dubai' });
    const m = d.toLocaleDateString('en-US', { month: '2-digit', timeZone: 'Asia/Dubai' });
    return `${y}-${m}`;
  };

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Dubai' });
  };

  const dayKey = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  };

  const nonCancelledLessonRecords = lessonRecords.filter(r => r.status !== 'cancelled');
  const lessonPresentCount = nonCancelledLessonRecords.filter(r => r.status === 'present').length;
  const lessonAbsentCount = nonCancelledLessonRecords.filter(r => r.status === 'absent').length;
  const lessonAttendanceRate = nonCancelledLessonRecords.length > 0
    ? Math.round((lessonPresentCount / nonCancelledLessonRecords.length) * 100)
    : 0;

  const paidLessons = lessonRecords.filter(r => r.paymentStatus === 'paid');
  const pendingLessons = lessonRecords.filter(r => r.paymentStatus === 'pending');

  const buildMonthDayGroups = (records: typeof lessonRecords): string => {
    if (records.length === 0) {
      return `<div class="empty-tab">No lessons in this category.</div>`;
    }

    const sorted = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const monthGroups = new Map<string, Map<string, typeof lessonRecords>>();
    for (const r of sorted) {
      const mk = monthKey(r.startTime || r.date);
      const dk = dayKey(r.startTime || r.date);
      if (!monthGroups.has(mk)) monthGroups.set(mk, new Map());
      const dayMap = monthGroups.get(mk)!;
      if (!dayMap.has(dk)) dayMap.set(dk, []);
      dayMap.get(dk)!.push(r);
    }

    let html = '';
    for (const [_mk, dayMap] of monthGroups) {
      const firstRecord = dayMap.values().next().value![0];
      html += `<div class="month-group">
        <div class="month-header">${monthLabel(firstRecord.startTime || firstRecord.date)}</div>`;

      for (const [_dk, dayRecords] of dayMap) {
        const firstDay = dayRecords[0];
        html += `<div class="day-group">
          <div class="day-label">${dayLabel(firstDay.startTime || firstDay.date)}</div>
          <div class="day-rows">`;

        for (const r of dayRecords) {
          const statusColor = getStatusColor(r.status);
          const statusLabel = getStatusLabel(r.status, r.lateMinutes);
          const typeLabel = getSessionTypeLabel(r.sessionType);
          const time = formatTime(r.startTime);
          const isCancelled = r.status === 'cancelled';
          const isPaid = r.paymentStatus === 'paid';
          const isNoCharge = r.paymentStatus === 'no_charge' || r.paymentStatus === 'cancelled';
          const paymentBadge = isNoCharge
            ? `<span class="payment-badge payment-noop">—</span>`
            : isPaid
              ? `<span class="payment-badge payment-paid">Paid</span>`
              : `<span class="payment-badge payment-pending">Pending</span>`;

          html += `<div class="lesson-row${isCancelled ? ' lesson-cancelled' : ''}">
            <div class="lesson-time">${time}</div>
            <div class="lesson-type"><span class="type-badge">${typeLabel}</span></div>
            <div class="lesson-status"><span class="status-badge" style="background:${statusColor}20;color:${statusColor};">${statusLabel}</span></div>
            <div class="lesson-payment">${paymentBadge}</div>
          </div>`;
        }

        html += `</div></div>`;
      }

      html += `</div>`;
    }

    return html;
  };

  const paidHtml = buildMonthDayGroups(paidLessons);
  const pendingHtml = buildMonthDayGroups(pendingLessons);
  const allLessonsHtml = buildMonthDayGroups(lessonRecords);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: white;
      background: #0B0D10;
      min-height: 100vh;
    }

    .report-container {
      max-width: 860px;
      margin: 0 auto;
      padding: 40px 24px;
      background: linear-gradient(180deg, #0B0D10 0%, #12151A 100%);
      min-height: 100vh;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #C8FF3D;
    }

    .logo-text {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(90deg, #C8FF3D, #00D4FF);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .report-title-box {
      text-align: right;
      background: rgba(200, 255, 61, 0.08);
      border: 1px solid rgba(200, 255, 61, 0.25);
      border-radius: 12px;
      padding: 12px 20px;
    }

    .report-label {
      font-size: 11px;
      font-weight: 600;
      color: #C8FF3D;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .report-date {
      font-size: 15px;
      font-weight: 700;
      color: white;
      margin-top: 2px;
    }

    .player-card {
      background: linear-gradient(135deg, rgba(200, 255, 61, 0.12) 0%, rgba(200, 255, 61, 0.04) 100%);
      border: 1px solid rgba(200, 255, 61, 0.25);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }

    .player-name {
      font-size: 28px;
      font-weight: 700;
      color: #C8FF3D;
      margin-bottom: 20px;
    }

    .stats-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .stat-box {
      flex: 1;
      min-width: 100px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .stat-value { font-size: 32px; font-weight: 700; }
    .stat-value.total  { color: #00D4FF; }
    .stat-value.present { color: #10B981; }
    .stat-value.absent  { color: #EF4444; }
    .stat-value.rate    { color: ${getAttendanceRateColor(lessonAttendanceRate)}; }

    .stat-label {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }

    .tabs-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .tab-btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.5);
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s;
    }

    .tab-btn.active-pending {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.45);
      color: #F59E0B;
    }

    .tab-btn.active-paid {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.45);
      color: #10B981;
    }

    .tab-btn.active-all {
      background: rgba(200, 255, 61, 0.12);
      border-color: rgba(200, 255, 61, 0.4);
      color: #C8FF3D;
    }

    .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      border-radius: 11px;
      padding: 0 6px;
      font-size: 12px;
      font-weight: 700;
    }

    .tab-btn.active-pending .tab-count {
      background: rgba(245, 158, 11, 0.3);
      color: #F59E0B;
    }

    .tab-btn.active-paid .tab-count {
      background: rgba(16, 185, 129, 0.3);
      color: #10B981;
    }

    .tab-btn.active-all .tab-count {
      background: rgba(200, 255, 61, 0.25);
      color: #C8FF3D;
    }

    .tab-btn:not(.active-pending):not(.active-paid):not(.active-all) .tab-count {
      background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.4);
    }

    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    .month-group { margin-bottom: 28px; }

    .month-header {
      font-size: 13px;
      font-weight: 700;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      padding-bottom: 10px;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    .day-group { margin-bottom: 8px; }

    .day-label {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255,255,255,0.55);
      padding: 6px 0 4px;
    }

    .day-rows { display: flex; flex-direction: column; gap: 6px; }

    .lesson-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 12px 16px;
      border-left: 3px solid #C8FF3D;
    }

    .lesson-row.lesson-cancelled {
      border-left-color: #4B5563;
      opacity: 0.55;
    }

    .lesson-time {
      font-size: 14px;
      font-weight: 600;
      color: white;
      min-width: 52px;
    }

    .type-badge {
      display: inline-block;
      padding: 3px 10px;
      background: rgba(200, 255, 61, 0.12);
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      color: #C8FF3D;
      white-space: nowrap;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .lesson-status { margin-left: auto; }

    .lesson-payment { flex-shrink: 0; }

    .payment-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .payment-paid {
      background: rgba(16, 185, 129, 0.15);
      color: #10B981;
    }

    .payment-pending {
      background: rgba(245, 158, 11, 0.12);
      color: #F59E0B;
    }

    .payment-noop {
      color: rgba(255, 255, 255, 0.25);
      background: transparent;
    }

    .empty-tab {
      text-align: center;
      padding: 48px 24px;
      color: rgba(255,255,255,0.3);
      font-size: 14px;
    }

    .footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.08);
      text-align: center;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
    }

    .print-btn {
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
      font-family: inherit;
    }

    .print-combined { display: none; }

    @media print {
      body { background: #0B0D10 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .tabs-bar { display: none !important; }
      .tab-panel { display: none !important; }
      .print-btn { display: none !important; }
      .print-combined { display: block !important; }
    }

    @media (max-width: 600px) {
      .stats-row { flex-wrap: wrap; }
      .stat-box { min-width: calc(50% - 6px); }
      .header { flex-direction: column; gap: 16px; }
    }
  </style>
</head>
<body>
  <div class="report-container">

    <div class="header">
      <div class="logo-text">GLOW UP TENNIS</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="report-title-box">
          <div class="report-label">Attendance Report</div>
          <div class="report-date">${formatDate(data.reportDate)}</div>
        </div>
        <button class="print-btn" onclick="window.print()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Save PDF
        </button>
      </div>
    </div>

    <div class="player-card">
      <div class="player-name">${data.player.name}</div>
      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value total">${nonCancelledLessonRecords.length}</div>
          <div class="stat-label">Total Lessons</div>
        </div>
        <div class="stat-box">
          <div class="stat-value present">${lessonPresentCount}</div>
          <div class="stat-label">Present</div>
        </div>
        <div class="stat-box">
          <div class="stat-value absent">${lessonAbsentCount}</div>
          <div class="stat-label">Absent</div>
        </div>
        <div class="stat-box">
          <div class="stat-value rate">${lessonAttendanceRate}%</div>
          <div class="stat-label">Attendance Rate</div>
        </div>
      </div>
    </div>

    <div class="tabs-bar">
      <button class="tab-btn" id="btn-all" onclick="switchTab('all')">
        All
        <span class="tab-count">${lessonRecords.length}</span>
      </button>
      <button class="tab-btn active-pending" id="btn-pending" onclick="switchTab('pending')">
        Pending
        <span class="tab-count">${pendingLessons.length}</span>
      </button>
      <button class="tab-btn" id="btn-paid" onclick="switchTab('paid')">
        Paid
        <span class="tab-count">${paidLessons.length}</span>
      </button>
    </div>

    <div class="tab-panel" id="panel-all">
      ${allLessonsHtml}
    </div>

    <div class="tab-panel active" id="panel-pending">
      ${pendingHtml}
    </div>

    <div class="tab-panel" id="panel-paid">
      ${paidHtml}
    </div>

    <div class="print-combined">
      ${allLessonsHtml}
    </div>

    <div class="footer">
      <p>Generated by ${data.academy.name} &bull; ${formatDate(data.reportDate)}</p>
    </div>

  </div>

  <script>
    var TAB_CLASSES = { all: 'active-all', pending: 'active-pending', paid: 'active-paid' };
    function switchTab(tab) {
      var tabs = ['all', 'pending', 'paid'];
      tabs.forEach(function(t) {
        var panel = document.getElementById('panel-' + t);
        var btn = document.getElementById('btn-' + t);
        if (!panel || !btn) return;
        if (t === tab) {
          panel.classList.add('active');
          btn.classList.add(TAB_CLASSES[t]);
        } else {
          panel.classList.remove('active');
          btn.classList.remove('active-all', 'active-pending', 'active-paid');
        }
      });
    }
  </script>
</body>
</html>`;
}
