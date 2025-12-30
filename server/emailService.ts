// Email Service using Resend integration
// Integration: connection:conn_resend_01KDF7GB7D3CMQPBEEJ67T7ZSP

import { Resend } from 'resend';

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || 'noreply@glowupsports.com'
  };
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    });

    if (result.error) {
      console.error('[Email] Send failed:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Email] Sent successfully to:', options.to);
    return { success: true };
  } catch (error) {
    console.error('[Email] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function sendWelcomeEmail(params: {
  to: string;
  playerName: string;
  academyName: string;
  coachName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, playerName, academyName, coachName } = params;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h1 { color: #2ECC40; margin: 0; font-size: 28px; }
        h2 { color: #ffffff; margin-bottom: 20px; }
        p { color: #a0a0a0; line-height: 1.6; margin-bottom: 16px; }
        .highlight { color: #00D4FF; font-weight: 600; }
        .cta { display: inline-block; background: linear-gradient(135deg, #2ECC40, #27ae60); color: #000000; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>Glow Up Sports</h1>
        </div>
        <h2>Welcome to ${academyName}!</h2>
        <p>Hi <span class="highlight">${playerName}</span>,</p>
        <p>You've been added to <strong>${academyName}</strong>${coachName ? ` and will be training with Coach ${coachName}` : ''}.</p>
        <p>With Glow Up Sports, you can:</p>
        <ul style="color: #a0a0a0;">
          <li>Track your progress and skill development</li>
          <li>View your upcoming sessions</li>
          <li>Receive feedback from your coach</li>
          <li>Earn XP and level up your game</li>
        </ul>
        <p>Download the app and sign in to get started!</p>
        <div class="footer">
          <p>Glow Up Sports - Level Up Your Game</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Welcome to ${academyName} - Glow Up Sports`,
    html,
    text: `Welcome to ${academyName}! Hi ${playerName}, you've been added to ${academyName}. Download the Glow Up Sports app to track your progress.`
  });
}

export async function sendSessionReminderEmail(params: {
  to: string;
  playerName: string;
  sessionDate: string;
  sessionTime: string;
  location?: string;
  coachName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, playerName, sessionDate, sessionTime, location, coachName } = params;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h1 { color: #2ECC40; margin: 0; font-size: 28px; }
        h2 { color: #ffffff; margin-bottom: 20px; }
        p { color: #a0a0a0; line-height: 1.6; margin-bottom: 16px; }
        .highlight { color: #00D4FF; font-weight: 600; }
        .session-card { background: #252525; border-radius: 12px; padding: 24px; margin: 20px 0; border-left: 4px solid #2ECC40; }
        .session-detail { margin-bottom: 12px; }
        .session-label { color: #666; font-size: 12px; text-transform: uppercase; }
        .session-value { color: #ffffff; font-size: 18px; font-weight: 600; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>Glow Up Sports</h1>
        </div>
        <h2>Session Reminder</h2>
        <p>Hi <span class="highlight">${playerName}</span>,</p>
        <p>Just a friendly reminder about your upcoming tennis session:</p>
        <div class="session-card">
          <div class="session-detail">
            <div class="session-label">Date</div>
            <div class="session-value">${sessionDate}</div>
          </div>
          <div class="session-detail">
            <div class="session-label">Time</div>
            <div class="session-value">${sessionTime}</div>
          </div>
          ${location ? `
          <div class="session-detail">
            <div class="session-label">Location</div>
            <div class="session-value">${location}</div>
          </div>
          ` : ''}
          ${coachName ? `
          <div class="session-detail">
            <div class="session-label">Coach</div>
            <div class="session-value">${coachName}</div>
          </div>
          ` : ''}
        </div>
        <p>See you on the court!</p>
        <div class="footer">
          <p>Glow Up Sports - Level Up Your Game</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Session Reminder: ${sessionDate} at ${sessionTime}`,
    html,
    text: `Hi ${playerName}, reminder about your tennis session on ${sessionDate} at ${sessionTime}${location ? ` at ${location}` : ''}${coachName ? ` with Coach ${coachName}` : ''}.`
  });
}

export async function sendFeedbackNotificationEmail(params: {
  to: string;
  playerName: string;
  sessionDate: string;
  coachName: string;
  feedbackSummary?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, playerName, sessionDate, coachName, feedbackSummary } = params;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h1 { color: #2ECC40; margin: 0; font-size: 28px; }
        h2 { color: #ffffff; margin-bottom: 20px; }
        p { color: #a0a0a0; line-height: 1.6; margin-bottom: 16px; }
        .highlight { color: #00D4FF; font-weight: 600; }
        .feedback-card { background: #252525; border-radius: 12px; padding: 24px; margin: 20px 0; border-left: 4px solid #00D4FF; }
        .cta { display: inline-block; background: linear-gradient(135deg, #2ECC40, #27ae60); color: #000000; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>Glow Up Sports</h1>
        </div>
        <h2>New Feedback Available</h2>
        <p>Hi <span class="highlight">${playerName}</span>,</p>
        <p>Coach <strong>${coachName}</strong> has submitted feedback for your session on <strong>${sessionDate}</strong>.</p>
        ${feedbackSummary ? `
        <div class="feedback-card">
          <p style="margin: 0; color: #ffffff;">"${escapeHtml(feedbackSummary)}"</p>
        </div>
        ` : ''}
        <p>Open the Glow Up Sports app to view your full feedback and track your progress!</p>
        <div class="footer">
          <p>Glow Up Sports - Level Up Your Game</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `New Feedback from Coach ${coachName}`,
    html,
    text: `Hi ${playerName}, Coach ${coachName} has submitted feedback for your session on ${sessionDate}. Open the app to view your feedback.`
  });
}

export async function sendLevelUpEmail(params: {
  to: string;
  playerName: string;
  newLevel: string;
  totalXP: number;
}): Promise<{ success: boolean; error?: string }> {
  const { to, playerName, newLevel, totalXP } = params;
  
  const levelColors: Record<string, string> = {
    'Red': '#E74C3C',
    'Orange': '#F39C12',
    'Green': '#2ECC40',
    'Yellow': '#F1C40F',
    'Glow': '#00D4FF'
  };
  
  const levelColor = levelColors[newLevel] || '#2ECC40';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; text-align: center; }
        .logo { margin-bottom: 30px; }
        .logo h1 { color: #2ECC40; margin: 0; font-size: 28px; }
        h2 { color: #ffffff; margin-bottom: 20px; font-size: 32px; }
        p { color: #a0a0a0; line-height: 1.6; margin-bottom: 16px; }
        .level-badge { display: inline-block; background: ${levelColor}; color: #000000; padding: 20px 40px; border-radius: 16px; font-size: 36px; font-weight: 800; margin: 30px 0; box-shadow: 0 0 30px ${levelColor}40; }
        .xp-text { color: #00D4FF; font-size: 24px; font-weight: 600; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>Glow Up Sports</h1>
        </div>
        <h2>Level Up!</h2>
        <p>Congratulations <strong style="color: #ffffff;">${playerName}</strong>!</p>
        <p>You've reached a new level:</p>
        <div class="level-badge">${newLevel}</div>
        <p class="xp-text">${totalXP.toLocaleString()} XP</p>
        <p>Keep up the amazing work on the court!</p>
        <div class="footer">
          <p>Glow Up Sports - Level Up Your Game</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `Congratulations! You've reached ${newLevel} level!`,
    html,
    text: `Congratulations ${playerName}! You've reached ${newLevel} level with ${totalXP} XP. Keep up the amazing work!`
  });
}

export async function sendCoachInviteEmail(params: {
  to: string;
  academyName: string;
  inviterName: string;
  inviteCode?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { to, academyName, inviterName, inviteCode } = params;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 16px; padding: 40px; }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h1 { color: #2ECC40; margin: 0; font-size: 28px; }
        h2 { color: #ffffff; margin-bottom: 20px; }
        p { color: #a0a0a0; line-height: 1.6; margin-bottom: 16px; }
        .highlight { color: #2ECC40; font-weight: 600; }
        .invite-code { background: #252525; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center; }
        .invite-code-value { color: #2ECC40; font-size: 32px; font-weight: 800; letter-spacing: 4px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>Glow Up Sports</h1>
        </div>
        <h2>You're Invited!</h2>
        <p><span class="highlight">${inviterName}</span> has invited you to join <strong>${academyName}</strong> as a coach on Glow Up Sports.</p>
        <p>With Glow Up Sports, you can:</p>
        <ul style="color: #a0a0a0;">
          <li>Manage your players and sessions</li>
          <li>Track player progress with our XP system</li>
          <li>Provide detailed feedback</li>
          <li>Communicate with players and parents</li>
        </ul>
        ${inviteCode ? `
        <div class="invite-code">
          <p style="color: #666; margin-bottom: 8px;">Your invite code:</p>
          <div class="invite-code-value">${inviteCode}</div>
        </div>
        ` : ''}
        <p>Download the Glow Up Sports app and sign up to get started!</p>
        <div class="footer">
          <p>Glow Up Sports - Level Up Your Game</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `You're invited to join ${academyName} on Glow Up Sports`,
    html,
    text: `${inviterName} has invited you to join ${academyName} as a coach on Glow Up Sports.${inviteCode ? ` Your invite code: ${inviteCode}` : ''}`
  });
}
