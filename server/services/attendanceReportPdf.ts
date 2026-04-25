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
      day: 'numeric' 
    });
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
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
        timeZone: 'Asia/Dubai'
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
    if (status === 'vacation') return '#8B5CF6';
    if (status === 'active') return '#6B7280';
    return '#F59E0B';
  };

  const getStatusLabel = (status: string | null) => {
    if (status === 'present') return 'Present';
    if (status === 'absent') return 'Absent';
    if (status === 'late') return 'Late';
    if (status === 'vacation') return 'Vacation';
    if (status === 'pending') return 'Pending';
    if (status === 'active') return 'Scheduled';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || '';
  };

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 90) return '#10B981';
    if (rate >= 75) return '#C8FF3D';
    if (rate >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const nonCancelledLessonRecords = lessonRecords.filter(r => r.status !== 'cancelled');
  const lessonPresentCount = nonCancelledLessonRecords.filter(r => r.status === 'present').length;
  const lessonAbsentCount = nonCancelledLessonRecords.filter(r => r.status === 'absent').length;
  const lessonAttendanceRate = nonCancelledLessonRecords.length > 0
    ? Math.round((lessonPresentCount / nonCancelledLessonRecords.length) * 100)
    : 0;

  const seriesGroupsRaw: Map<string, { seriesId: string; info: SeriesInfo | null; records: typeof lessonRecords }> = new Map();

  for (const record of lessonRecords) {
    const key = record.seriesId || '__no_series__';
    if (!seriesGroupsRaw.has(key)) {
      const info = record.seriesId && data.seriesMap ? data.seriesMap[record.seriesId] || null : null;
      seriesGroupsRaw.set(key, { seriesId: key, info, records: [] });
    }
    seriesGroupsRaw.get(key)!.records.push(record);
  }

  const realSeriesCount = Array.from(seriesGroupsRaw.keys()).filter(k => k !== '__no_series__').length;
  const isMultiSeries = realSeriesCount > 1;

  let sortedSeriesGroups: { seriesId: string; info: SeriesInfo | null; records: typeof lessonRecords }[];

  if (isMultiSeries) {
    sortedSeriesGroups = Array.from(seriesGroupsRaw.values()).sort((a, b) => {
      if (!a.info && !b.info) return 0;
      if (!a.info) return 1;
      if (!b.info) return -1;
      return a.info.dayOfWeek - b.info.dayOfWeek;
    });
  } else {
    sortedSeriesGroups = [{ seriesId: '__combined__', info: null, records: lessonRecords }];
  }

  interface SeriesTableData {
    idx: number;
    title: string;
    dayName: string;
    timeLabel: string;
    sessionType: string;
    presentCount: number;
    absentCount: number;
    totalCount: number;
    attendanceRate: number;
    lessonsJson: string;
  }

  const seriesTables: SeriesTableData[] = sortedSeriesGroups.map((group, idx) => {
    const sorted = [...group.records].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const numbered = sorted.map((record, i) => ({
      ...record,
      lessonNumber: i + 1,
    }));
    const newestFirst = [...numbered].reverse();

    const nonCancelled = group.records.filter(r => r.status !== 'cancelled');
    const present = nonCancelled.filter(r => r.status === 'present').length;
    const absent = nonCancelled.filter(r => r.status === 'absent').length;
    const total = nonCancelled.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    const json = JSON.stringify(newestFirst.map(r => ({
      n: r.lessonNumber,
      date: formatShortDate(r.date),
      time: formatTime(r.startTime),
      type: getSessionTypeLabel(r.sessionType),
      statusColor: getStatusColor(r.status),
      statusLabel: getStatusLabel(r.status) + (r.lateMinutes && r.lateMinutes > 0 ? ` (+${r.lateMinutes}m)` : ''),
      paymentClass: r.paymentStatus === 'paid' ? 'paid' : r.paymentStatus === 'cancelled' ? 'cancelled' : r.paymentStatus === 'no_charge' ? 'cancelled' : 'pending',
      paymentLabel: r.paymentStatus === 'paid' ? 'Paid' : r.paymentStatus === 'cancelled' ? 'N/A' : r.paymentStatus === 'no_charge' ? 'No Charge' : 'Pending',
    })));

    return {
      idx,
      title: group.info?.title || '',
      dayName: group.info ? getDayName(group.info.dayOfWeek) : '',
      timeLabel: group.info?.startTime || '',
      sessionType: group.info ? getSessionTypeLabel(group.info.sessionType) : '',
      presentCount: present,
      absentCount: absent,
      totalCount: total,
      attendanceRate: rate,
      lessonsJson: json,
    };
  });

  const seriesBreakdownHtml = data.seriesSummaries && data.seriesSummaries.length >= 1 && !isMultiSeries ? `
    <div class="series-breakdown">
      <div class="section-title">Attendance per Lesson Group</div>
      <div class="series-grid">
        ${data.seriesSummaries.map(summary => `
          <div class="series-card">
            <div class="series-header">
              <div class="series-day">${getDayName(summary.series.dayOfWeek)}</div>
              <div class="series-time">${summary.series.startTime}</div>
            </div>
            <div class="series-title">${summary.series.title}</div>
            <div class="series-stats">
              <div class="series-stat">
                <span class="series-stat-value" style="color: #00D4FF;">${summary.totalSessions}</span>
                <span class="series-stat-label">Sessions</span>
              </div>
              <div class="series-stat">
                <span class="series-stat-value" style="color: #10B981;">${summary.presentCount}</span>
                <span class="series-stat-label">Present</span>
              </div>
              <div class="series-stat">
                <span class="series-stat-value" style="color: #EF4444;">${summary.absentCount}</span>
                <span class="series-stat-label">Absent</span>
              </div>
              <div class="series-stat">
                <span class="series-stat-value" style="color: ${getAttendanceRateColor(summary.attendanceRate)};">${summary.attendanceRate}%</span>
                <span class="series-stat-label">Rate</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const buildSeriesSection = (table: SeriesTableData) => {
    const id = table.idx;
    const hasHeader = isMultiSeries;

    const headerHtml = hasHeader ? `
      <div class="series-table-header">
        <div class="series-table-header-left">
          <span class="series-table-day">${table.dayName || 'Other Sessions'}</span>
          ${table.timeLabel ? `<span class="series-table-time">${table.timeLabel}</span>` : ''}
          ${table.title ? `<span class="series-table-title">${table.title}</span>` : ''}
        </div>
        <div class="series-table-header-stats">
          <span style="color:#00D4FF;font-weight:700;">${table.totalCount}</span>
          <span style="color:rgba(255,255,255,0.4);font-size:11px;">lessons</span>
          <span style="margin:0 6px;color:rgba(255,255,255,0.15);">|</span>
          <span style="color:#10B981;font-weight:700;">${table.presentCount}</span>
          <span style="color:rgba(255,255,255,0.4);font-size:11px;">present</span>
          <span style="margin:0 6px;color:rgba(255,255,255,0.15);">|</span>
          <span style="color:#EF4444;font-weight:700;">${table.absentCount}</span>
          <span style="color:rgba(255,255,255,0.4);font-size:11px;">absent</span>
          <span style="margin:0 6px;color:rgba(255,255,255,0.15);">|</span>
          <span style="color:${getAttendanceRateColor(table.attendanceRate)};font-weight:700;">${table.attendanceRate}%</span>
          <span style="color:rgba(255,255,255,0.4);font-size:11px;">rate</span>
        </div>
      </div>
    ` : '';

    return `
    <div class="lessons-section">
      ${headerHtml}
      <div class="lessons-header">
        <div class="section-title" style="margin-bottom:0;">${isMultiSeries ? '' : 'Lessons'}</div>
        <div class="pagination-controls" id="paginationControls_${id}" style="display:flex;align-items:center;gap:12px;">
          <button class="page-btn" id="prevBtn_${id}" onclick="changePage_${id}(-1)">&#8592; Prev</button>
          <span class="page-info" id="pageInfo_${id}"></span>
          <button class="page-btn" id="nextBtn_${id}" onclick="changePage_${id}(1)">Next &#8594;</button>
        </div>
      </div>
      <table class="attendance-table" style="margin-top:16px;">
        <thead>
          <tr>
            <th>Lesson</th>
            <th>Date &amp; Time</th>
            <th>Type</th>
            <th>Status</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody id="lessonsTableBody_${id}"></tbody>
      </table>
      <div id="emptyLessons_${id}" style="display:none;text-align:center;padding:32px;color:rgba(255,255,255,0.4);">No lessons recorded yet.</div>
    </div>
    <div id="lessonsData_${id}" data-lessons="${table.lessonsJson.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" style="display:none;"></div>

    <script>
      (function() {
        var rawData = document.getElementById('lessonsData_${id}');
        var lessons = rawData ? JSON.parse(rawData.getAttribute('data-lessons') || '[]') : [];
        var BLOCK = 10;
        var currentPage = 0;
        var totalPages = Math.max(1, Math.ceil(lessons.length / BLOCK));

        function renderPage(page) {
          var tbody = document.getElementById('lessonsTableBody_${id}');
          var empty = document.getElementById('emptyLessons_${id}');
          var info = document.getElementById('pageInfo_${id}');
          var prevBtn = document.getElementById('prevBtn_${id}');
          var nextBtn = document.getElementById('nextBtn_${id}');

          tbody.innerHTML = '';
          if (lessons.length === 0) {
            empty.style.display = 'block';
            document.getElementById('paginationControls_${id}').style.display = 'none';
            return;
          }

          var start = page * BLOCK;
          var end = Math.min(start + BLOCK, lessons.length);
          var slice = lessons.slice(start, end);

          slice.forEach(function(r) {
            var tr = document.createElement('tr');
            tr.innerHTML =
              '<td class="date-cell" style="width:12%;font-weight:700;color:#C8FF3D;">L' + r.n + '</td>' +
              '<td class="date-cell"><div class="date-text">' + r.date + '</div><div class="time-text">' + r.time + '</div></td>' +
              '<td class="type-cell"><span class="session-type-badge">' + r.type + '</span></td>' +
              '<td class="status-cell"><span class="status-badge" style="background:' + r.statusColor + '20;color:' + r.statusColor + ';">' + r.statusLabel + '</span></td>' +
              '<td class="payment-cell"><span class="payment-badge ' + r.paymentClass + '">' + r.paymentLabel + '</span></td>';
            tbody.appendChild(tr);
          });

          var minLesson = slice[slice.length - 1].n;
          var maxLesson = slice[0].n;
          info.textContent = 'Lessons ' + minLesson + '\\u2013' + maxLesson + ' of ' + lessons.length;
          prevBtn.disabled = page === 0;
          nextBtn.disabled = page >= totalPages - 1;
          prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
          nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
        }

        window['changePage_${id}'] = function(dir) {
          var next = currentPage + dir;
          if (next >= 0 && next < totalPages) {
            currentPage = next;
            renderPage(currentPage);
          }
        };

        renderPage(0);
      })();
    </script>
    `;
  };

  const seriesSectionsContent = seriesTables.map(t => buildSeriesSection(t)).join('\n');
  const allSeriesSectionsHtml = isMultiSeries
    ? `<div class="series-tables-grid">${seriesSectionsContent}</div>`
    : seriesSectionsContent;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: white;
      background: #0B0D10;
      min-height: 100vh;
    }
    
    .report-container {
      width: 100%;
      min-height: 100vh;
      padding: 40px;
      background: linear-gradient(180deg, #0B0D10 0%, #12151A 100%);
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #C8FF3D;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-text {
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(90deg, #C8FF3D, #00D4FF);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .report-title-box {
      text-align: right;
      background: rgba(200, 255, 61, 0.1);
      border: 1px solid rgba(200, 255, 61, 0.3);
      border-radius: 12px;
      padding: 16px 24px;
    }
    
    .report-label {
      font-size: 12px;
      font-weight: 600;
      color: #C8FF3D;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .report-date {
      font-size: 18px;
      font-weight: 700;
      color: white;
      margin-top: 4px;
    }
    
    .player-card {
      background: linear-gradient(135deg, rgba(200, 255, 61, 0.15) 0%, rgba(200, 255, 61, 0.05) 100%);
      border: 1px solid rgba(200, 255, 61, 0.3);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
    }
    
    .player-name {
      font-size: 32px;
      font-weight: 700;
      color: #C8FF3D;
      margin-bottom: 20px;
    }
    
    .stats-row {
      display: flex;
      gap: 16px;
    }
    
    .stat-box {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .stat-value {
      font-size: 36px;
      font-weight: 700;
    }
    
    .stat-value.total { color: #00D4FF; }
    .stat-value.present { color: #10B981; }
    .stat-value.absent { color: #EF4444; }
    .stat-value.rate { color: #C8FF3D; }
    
    .stat-label {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    
    .series-breakdown {
      margin-bottom: 32px;
    }
    
    .series-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    
    .series-card {
      background: rgba(0, 212, 255, 0.08);
      border: 1px solid rgba(0, 212, 255, 0.25);
      border-radius: 12px;
      padding: 16px;
    }
    
    .series-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .series-day {
      font-size: 18px;
      font-weight: 700;
      color: #00D4FF;
    }
    
    .series-time {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 10px;
      border-radius: 8px;
    }
    
    .series-title {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .series-stats {
      display: flex;
      gap: 12px;
    }
    
    .series-stat {
      flex: 1;
      text-align: center;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 8px 4px;
    }
    
    .series-stat-value {
      display: block;
      font-size: 20px;
      font-weight: 700;
    }
    
    .series-stat-label {
      display: block;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    .series-tables-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      align-items: start;
    }

    .series-tables-grid .lessons-section {
      margin-bottom: 0;
    }

    .series-tables-grid .attendance-table th,
    .series-tables-grid .attendance-table td {
      padding: 10px 8px;
      font-size: 12px;
    }

    .series-tables-grid .series-table-header-left {
      flex-wrap: wrap;
      gap: 8px;
    }

    .series-tables-grid .series-table-day {
      font-size: 16px;
    }

    .series-tables-grid .series-table-header-stats {
      font-size: 11px;
      flex-wrap: wrap;
      gap: 2px;
    }

    .series-tables-grid .series-table-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .series-table-header {
      background: rgba(0, 212, 255, 0.1);
      border: 1px solid rgba(0, 212, 255, 0.25);
      border-radius: 12px 12px 0 0;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .series-table-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .series-table-day {
      font-size: 20px;
      font-weight: 700;
      color: #00D4FF;
    }

    .series-table-time {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 12px;
      border-radius: 8px;
    }

    .series-table-title {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
      font-weight: 500;
    }

    .series-table-header-stats {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
    }
    
    .attendance-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0 8px;
    }
    
    .attendance-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: rgba(255, 255, 255, 0.5);
    }
    
    .attendance-table td {
      padding: 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    
    .attendance-table tr td:first-child {
      border-radius: 8px 0 0 8px;
      border-left: 3px solid #C8FF3D;
    }
    
    .attendance-table tr td:last-child {
      border-radius: 0 8px 8px 0;
    }
    
    .date-cell {
      width: 40%;
    }
    
    .date-text {
      font-weight: 600;
      color: white;
      font-size: 14px;
    }
    
    .time-text {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 2px;
    }
    
    .type-cell {
      width: 30%;
    }
    
    .session-type-badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(200, 255, 61, 0.15);
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      color: #C8FF3D;
    }
    
    .status-cell {
      width: 30%;
      text-align: right;
    }
    
    .status-badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .payment-cell {
      text-align: center;
    }
    
    .payment-badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .payment-badge.paid {
      background: rgba(16, 185, 129, 0.2);
      color: #10B981;
    }
    
    .payment-badge.pending {
      background: rgba(245, 158, 11, 0.2);
      color: #F59E0B;
    }
    
    .payment-badge.cancelled {
      background: rgba(229, 57, 53, 0.15);
      color: #E53935;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
    }
    
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #C8FF3D 0%, #9FCC31 100%);
      color: #0B0D10;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-left: 16px;
      text-decoration: none;
    }
    
    .download-btn:hover {
      opacity: 0.9;
    }

    .lessons-section {
      margin-bottom: 32px;
    }

    .lessons-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0;
    }

    .page-btn {
      background: rgba(200, 255, 61, 0.15);
      color: #C8FF3D;
      border: 1px solid rgba(200, 255, 61, 0.4);
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }

    .page-btn:hover {
      background: rgba(200, 255, 61, 0.25);
    }

    .page-info {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
      min-width: 120px;
      text-align: center;
    }
    
    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.8);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    
    @media print {
      body {
        background: #0B0D10 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      .report-container {
        padding: 20px;
      }
      
      .download-btn {
        display: none !important;
      }
    }
    
    @page {
      size: A4;
      margin: 0;
    }

    @media (max-width: 900px) {
      .series-tables-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .series-table-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .series-table-header-stats {
        flex-wrap: wrap;
      }
      .stats-row {
        flex-wrap: wrap;
      }
      .stat-box {
        min-width: 45%;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <div class="logo">
        <div class="logo-text">GLOW UP TENNIS</div>
      </div>
      <div class="header-actions">
        <div class="report-title-box">
          <div class="report-label">Attendance Report</div>
          <div class="report-date">${formatDate(data.reportDate)}</div>
        </div>
        <button class="download-btn" onclick="window.print()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDF
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
    
    ${seriesBreakdownHtml}
    
    ${allSeriesSectionsHtml}
    
    <div class="footer">
      <p>Generated by ${data.academy.name} &bull; ${formatDate(data.reportDate)}</p>
    </div>
  </div>
</body>
</html>
`;
}
