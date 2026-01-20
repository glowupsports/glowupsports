export interface AttendanceRecord {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string;
  status: string | null;
  lateMinutes: number | null;
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
}

export function generateAttendanceReportHtml(data: AttendanceReportData): string {
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
        hour12: false 
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
    return '#F59E0B';
  };

  const getStatusLabel = (status: string | null) => {
    if (status === 'present') return 'Present';
    if (status === 'absent') return 'Absent';
    return 'Pending';
  };

  // Group records by month
  const recordsByMonth = new Map<string, AttendanceRecord[]>();
  data.records.forEach(record => {
    if (!record.date) return;
    const date = new Date(record.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    if (!recordsByMonth.has(monthKey)) {
      recordsByMonth.set(monthKey, []);
    }
    recordsByMonth.get(monthKey)!.push(record);
  });

  // Sort months newest first
  const sortedMonths = Array.from(recordsByMonth.keys()).sort((a, b) => b.localeCompare(a));

  // Generate month tabs HTML
  const monthTabsHtml = sortedMonths.map((monthKey, index) => {
    const date = new Date(monthKey + '-01');
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const count = recordsByMonth.get(monthKey)!.length;
    return `<div class="month-tab ${index === 0 ? 'active' : ''}">${label} (${count})</div>`;
  }).join('');

  // Generate attendance rows grouped by month
  const monthSectionsHtml = sortedMonths.map(monthKey => {
    const records = recordsByMonth.get(monthKey)!;
    const date = new Date(monthKey + '-01');
    const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const rowsHtml = records.map(record => `
      <tr>
        <td class="date-cell">
          <div class="date-text">${formatShortDate(record.date)}</div>
          <div class="time-text">${formatTime(record.startTime)}</div>
        </td>
        <td class="type-cell">
          <span class="session-type-badge">${getSessionTypeLabel(record.sessionType)}</span>
        </td>
        <td class="status-cell">
          <span class="status-badge" style="background: ${getStatusColor(record.status)}20; color: ${getStatusColor(record.status)};">
            ${getStatusLabel(record.status)}
            ${record.lateMinutes && record.lateMinutes > 0 ? ` (+${record.lateMinutes}m)` : ''}
          </span>
        </td>
      </tr>
    `).join('');

    return `
      <div class="month-section">
        <div class="month-header">${monthLabel}</div>
        <table class="attendance-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

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
    
    .month-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    
    .month-tab {
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .month-tab.active {
      background: rgba(0, 212, 255, 0.2);
      border-color: #00D4FF;
      color: #00D4FF;
    }
    
    .month-section {
      margin-bottom: 32px;
    }
    
    .month-header {
      font-size: 16px;
      font-weight: 600;
      color: #00D4FF;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(0, 212, 255, 0.3);
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
          <div class="stat-value total">${data.summary.totalSessions}</div>
          <div class="stat-label">Total Sessions</div>
        </div>
        <div class="stat-box">
          <div class="stat-value present">${data.summary.presentCount}</div>
          <div class="stat-label">Present</div>
        </div>
        <div class="stat-box">
          <div class="stat-value absent">${data.summary.absentCount}</div>
          <div class="stat-label">Absent</div>
        </div>
        <div class="stat-box">
          <div class="stat-value rate">${data.summary.attendanceRate}%</div>
          <div class="stat-label">Attendance Rate</div>
        </div>
      </div>
    </div>
    
    <div class="month-tabs">
      ${monthTabsHtml}
    </div>
    
    ${monthSectionsHtml}
    
    <div class="footer">
      <p>Generated by ${data.academy.name} • ${formatDate(data.reportDate)}</p>
    </div>
  </div>
</body>
</html>
`;
}
