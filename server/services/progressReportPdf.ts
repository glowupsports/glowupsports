export interface ProgressReportData {
  reportDate: string;
  period: {
    from: string;
    to: string;
  };
  academy: {
    name: string;
    logo?: string;
  };
  coach: {
    name: string;
    title?: string;
  };
  player: {
    name: string;
    age?: number;
    ballLevel: string;
    xpLevel: number;
    totalXp: number;
    glowBattlePower?: number;
  };
  pillars: {
    name: string;
    score: number;
    maxScore: number;
    trend: 'up' | 'down' | 'stable';
    notes?: string;
  }[];
  skills: {
    name: string;
    pillar: string;
    status: 'mastered' | 'progressing' | 'needs_work';
    lastAssessed?: string;
  }[];
  sessionsSummary: {
    totalSessions: number;
    attendedSessions: number;
    attendanceRate: number;
    totalMinutes: number;
  };
  achievements: {
    title: string;
    date: string;
    type: 'level_up' | 'skill_mastered' | 'badge' | 'milestone';
  }[];
  coachComments?: string;
  recommendations: string[];
}

export function generateProgressReportHtml(data: ProgressReportData): string {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getBallLevelColor = (level: string) => {
    if (level.startsWith('RED')) return '#EF4444';
    if (level.startsWith('ORANGE')) return '#F97316';
    if (level.startsWith('GREEN')) return '#22C55E';
    if (level.startsWith('YELLOW')) return '#EAB308';
    if (level.startsWith('GLOW')) return '#E040FB';
    return '#6B7280';
  };

  const getBallLevelLabel = (level: string) => {
    const parts = level.split('_');
    return `${parts[0]} ${parts[1] || ''}`.trim();
  };

  const getStatusColor = (status: string) => {
    if (status === 'mastered') return '#10B981';
    if (status === 'progressing') return '#3B82F6';
    return '#F59E0B';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'mastered') return 'Mastered';
    if (status === 'progressing') return 'Progressing';
    return 'Needs Work';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return '<span style="color: #10B981;">&#x25B2;</span>';
    if (trend === 'down') return '<span style="color: #EF4444;">&#x25BC;</span>';
    return '<span style="color: #6B7280;">&#x25C6;</span>';
  };

  const pillarsHtml = data.pillars.map(pillar => `
    <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 600; color: #111827;">${pillar.name}</span>
        <span style="font-size: 18px; font-weight: 700; color: #111827;">
          ${pillar.score}/${pillar.maxScore} ${getTrendIcon(pillar.trend)}
        </span>
      </div>
      <div style="background: #E5E7EB; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #2ECC40, #00D4FF); height: 100%; width: ${(pillar.score / pillar.maxScore) * 100}%; border-radius: 4px;"></div>
      </div>
      ${pillar.notes ? `<p style="font-size: 12px; color: #6B7280; margin-top: 8px;">${pillar.notes}</p>` : ''}
    </div>
  `).join('');

  const skillsHtml = data.skills.slice(0, 12).map(skill => `
    <tr>
      <td style="padding: 10px 16px; border-bottom: 1px solid #E5E7EB;">${skill.name}</td>
      <td style="padding: 10px 16px; border-bottom: 1px solid #E5E7EB; text-align: center;">${skill.pillar}</td>
      <td style="padding: 10px 16px; border-bottom: 1px solid #E5E7EB; text-align: center;">
        <span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; background: ${getStatusColor(skill.status)}20; color: ${getStatusColor(skill.status)};">
          ${getStatusLabel(skill.status)}
        </span>
      </td>
    </tr>
  `).join('');

  const achievementsHtml = data.achievements.length > 0 ? data.achievements.slice(0, 6).map(achievement => `
    <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: #F9FAFB; border-radius: 8px; margin-bottom: 8px;">
      <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #2ECC40, #00D4FF); display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 16px;">${achievement.type === 'level_up' ? '&#x2B06;' : achievement.type === 'skill_mastered' ? '&#x2713;' : achievement.type === 'badge' ? '&#x2605;' : '&#x1F3C6;'}</span>
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 500; color: #111827;">${achievement.title}</div>
        <div style="font-size: 12px; color: #6B7280;">${formatDate(achievement.date)}</div>
      </div>
    </div>
  `).join('') : '<p style="color: #6B7280; text-align: center; padding: 20px;">No achievements this period</p>';

  const recommendationsHtml = data.recommendations.map(rec => `
    <li style="margin-bottom: 8px; padding-left: 8px;">${rec}</li>
  `).join('');

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
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1F2937;
      background: #FFFFFF;
    }
    
    .report-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 3px solid #2ECC40;
    }
    
    .academy-info h1 {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }
    
    .academy-info p {
      color: #6B7280;
      font-size: 13px;
    }
    
    .report-title {
      text-align: right;
    }
    
    .report-title h2 {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }
    
    .report-title p {
      color: #6B7280;
      font-size: 12px;
    }
    
    .player-card {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
      color: white;
    }
    
    .player-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .player-name {
      font-size: 24px;
      font-weight: 700;
    }
    
    .player-age {
      font-size: 14px;
      color: rgba(255,255,255,0.7);
    }
    
    .ball-level-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
    }
    
    .player-stats {
      display: flex;
      gap: 24px;
    }
    
    .stat-item {
      flex: 1;
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #2ECC40;
    }
    
    .stat-label {
      font-size: 12px;
      color: rgba(255,255,255,0.7);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .section {
      margin-bottom: 32px;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #E5E7EB;
    }
    
    .skills-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #E5E7EB;
    }
    
    .skills-table th {
      background: #F9FAFB;
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6B7280;
      border-bottom: 1px solid #E5E7EB;
    }
    
    .session-stats {
      display: flex;
      gap: 16px;
    }
    
    .session-stat {
      flex: 1;
      background: #F9FAFB;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    
    .session-stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
    }
    
    .session-stat-label {
      font-size: 12px;
      color: #6B7280;
      text-transform: uppercase;
    }
    
    .coach-comments {
      background: #F0FDF4;
      border-left: 4px solid #2ECC40;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 16px;
    }
    
    .recommendations {
      background: #EFF6FF;
      border-radius: 8px;
      padding: 20px;
    }
    
    .recommendations ul {
      margin-left: 20px;
      color: #1F2937;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      color: #6B7280;
      font-size: 12px;
    }
    
    @media print {
      .report-container {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <div class="academy-info">
        <h1>${data.academy.name}</h1>
        <p>Player Progress Report</p>
      </div>
      <div class="report-title">
        <h2>Progress Report</h2>
        <p>${formatDate(data.period.from)} - ${formatDate(data.period.to)}</p>
      </div>
    </div>
    
    <div class="player-card">
      <div class="player-header">
        <div>
          <div class="player-name">${data.player.name}</div>
          ${data.player.age ? `<div class="player-age">Age ${data.player.age}</div>` : ''}
        </div>
        <div class="ball-level-badge" style="background: ${getBallLevelColor(data.player.ballLevel)}; color: white;">
          ${getBallLevelLabel(data.player.ballLevel)}
        </div>
      </div>
      <div class="player-stats">
        <div class="stat-item">
          <div class="stat-value">${data.player.xpLevel}</div>
          <div class="stat-label">XP Level</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${data.player.totalXp.toLocaleString()}</div>
          <div class="stat-label">Total XP</div>
        </div>
        ${data.player.glowBattlePower ? `
        <div class="stat-item">
          <div class="stat-value">${data.player.glowBattlePower}</div>
          <div class="stat-label">Glow Power</div>
        </div>
        ` : ''}
      </div>
    </div>
    
    <div class="section">
      <h3 class="section-title">Session Attendance</h3>
      <div class="session-stats">
        <div class="session-stat">
          <div class="session-stat-value">${data.sessionsSummary.attendedSessions}/${data.sessionsSummary.totalSessions}</div>
          <div class="session-stat-label">Sessions Attended</div>
        </div>
        <div class="session-stat">
          <div class="session-stat-value">${data.sessionsSummary.attendanceRate}%</div>
          <div class="session-stat-label">Attendance Rate</div>
        </div>
        <div class="session-stat">
          <div class="session-stat-value">${Math.round(data.sessionsSummary.totalMinutes / 60)}</div>
          <div class="session-stat-label">Hours Trained</div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h3 class="section-title">Development Pillars</h3>
      ${pillarsHtml}
    </div>
    
    ${data.skills.length > 0 ? `
    <div class="section">
      <h3 class="section-title">Skills Assessment</h3>
      <table class="skills-table">
        <thead>
          <tr>
            <th>Skill</th>
            <th style="text-align: center;">Pillar</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${skillsHtml}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <div class="section">
      <h3 class="section-title">Achievements</h3>
      ${achievementsHtml}
    </div>
    
    ${data.coachComments ? `
    <div class="section">
      <h3 class="section-title">Coach Comments</h3>
      <div class="coach-comments">
        <p>${data.coachComments}</p>
        <p style="margin-top: 12px; font-weight: 500;">- ${data.coach.name}${data.coach.title ? `, ${data.coach.title}` : ''}</p>
      </div>
    </div>
    ` : ''}
    
    ${data.recommendations.length > 0 ? `
    <div class="section">
      <h3 class="section-title">Recommendations for Improvement</h3>
      <div class="recommendations">
        <ul>
          ${recommendationsHtml}
        </ul>
      </div>
    </div>
    ` : ''}
    
    <div class="footer">
      <p>Generated on ${formatDate(data.reportDate)} by ${data.academy.name}</p>
      <p style="margin-top: 4px; color: #9CA3AF;">Powered by Glow Up Sports</p>
    </div>
  </div>
</body>
</html>
`;
}
