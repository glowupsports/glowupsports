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
  const { apiKey } = await getCredentials();
  return {
    client: new Resend(apiKey),
    // Use verified subdomain - admin.glowupsports.com is verified in Resend
    fromEmail: 'Glow Up Sports <noreply@admin.glowupsports.com>'
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

export async function sendDeleteAccountRequestEmail(params: {
  userEmail: string;
  userName: string;
  reason?: string;
  comments?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userEmail, userName, reason, comments } = params;
  
  const reasonLabels: Record<string, string> = {
    'no-longer-using': 'No longer using the app',
    'switching-academy': 'Switching to another academy',
    'privacy-concerns': 'Privacy concerns',
    'too-many-notifications': 'Too many notifications',
    'child-no-longer-plays': 'Child no longer plays tennis',
    'other': 'Other',
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
        .header { background: linear-gradient(135deg, #EF4444, #DC2626); color: white; padding: 20px; border-radius: 10px 10px 0 0; margin: -30px -30px 20px; text-align: center; }
        .info-row { padding: 10px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; color: #666; }
        .value { color: #333; margin-top: 4px; }
        .comments { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 20px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Account Deletion Request</h2>
        </div>
        
        <p>A user has requested to delete their account. Please process this request within 30 days.</p>
        
        <div class="info-row">
          <div class="label">User Email</div>
          <div class="value">${escapeHtml(userEmail)}</div>
        </div>
        
        <div class="info-row">
          <div class="label">User Name</div>
          <div class="value">${escapeHtml(userName)}</div>
        </div>
        
        <div class="info-row">
          <div class="label">Reason</div>
          <div class="value">${reason ? escapeHtml(reasonLabels[reason] || reason) : 'Not specified'}</div>
        </div>
        
        ${comments ? `
        <div class="comments">
          <div class="label">Additional Comments</div>
          <div class="value" style="margin-top: 8px;">${escapeHtml(comments)}</div>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>This request was submitted through the Glow Up Sports delete account page.</p>
          <p>Request date: ${new Date().toISOString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send to support email
  return sendEmail({
    to: 'support@glowupsports.com',
    subject: `Account Deletion Request - ${userName}`,
    html,
    text: `Account Deletion Request\n\nUser: ${userName}\nEmail: ${userEmail}\nReason: ${reason || 'Not specified'}\nComments: ${comments || 'None'}`
  });
}

// ==================== EMAIL OTP VERIFICATION ====================

interface OTPStore {
  code: string;
  email: string;
  expiresAt: Date;
  attempts: number;
}

// In-memory OTP store (in production, use Redis or database)
const otpStore = new Map<string, OTPStore>();

// Clean up expired OTPs every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, otp] of otpStore.entries()) {
    if (otp.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOTPEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate 6-digit OTP
    const code = generateOTPCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Store OTP (key by email, allows same email to have multiple OTPs for different accounts)
    const otpKey = `${email.toLowerCase()}_${Date.now()}`;
    otpStore.set(otpKey, {
      code,
      email: email.toLowerCase(),
      expiresAt,
      attempts: 0,
    });

    // Also store by email for verification lookup
    otpStore.set(email.toLowerCase(), {
      code,
      email: email.toLowerCase(),
      expiresAt,
      attempts: 0,
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0A0B; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1A1A1D 0%, #16161A 100%); border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px; text-align: center; border-bottom: 1px solid rgba(50, 255, 126, 0.1);">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #32FF7E;">Glow Up Sports</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.6);">Tennis Academy Platform</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #ffffff;">Verify Your Email</h2>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.7);">
                Use this code to complete your registration. This code expires in 10 minutes.
              </p>
              
              <!-- OTP Code Box -->
              <div style="background: linear-gradient(135deg, rgba(50, 255, 126, 0.15) 0%, rgba(50, 255, 126, 0.05) 100%); border: 2px solid rgba(50, 255, 126, 0.3); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #32FF7E; font-family: 'SF Mono', Monaco, monospace;">${code}</span>
              </div>
              
              <p style="margin: 24px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.5);">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: rgba(0,0,0,0.3); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.4);">
                This is an automated message from Glow Up Sports. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const result = await sendEmail({
      to: email,
      subject: `${code} - Your Glow Up Sports Verification Code`,
      html,
      text: `Your Glow Up Sports verification code is: ${code}. This code expires in 10 minutes.`,
    });

    if (result.success) {
      console.log(`[OTP] Sent verification code to ${email}`);
    }

    return result;
  } catch (error) {
    console.error("[OTP] Failed to send verification code:", error);
    return { success: false, error: "Failed to send verification code" };
  }
}

export function verifyOTPCode(email: string, code: string): { valid: boolean; error?: string } {
  const normalizedEmail = email.toLowerCase();
  const storedOTP = otpStore.get(normalizedEmail);

  if (!storedOTP) {
    return { valid: false, error: "No verification code found. Please request a new one." };
  }

  // Check expiry
  if (storedOTP.expiresAt < new Date()) {
    otpStore.delete(normalizedEmail);
    return { valid: false, error: "Verification code has expired. Please request a new one." };
  }

  // Check attempts (max 5)
  if (storedOTP.attempts >= 5) {
    otpStore.delete(normalizedEmail);
    return { valid: false, error: "Too many failed attempts. Please request a new code." };
  }

  // Verify code
  if (storedOTP.code !== code) {
    storedOTP.attempts++;
    return { valid: false, error: `Invalid code. ${5 - storedOTP.attempts} attempts remaining.` };
  }

  // Success - delete the OTP
  otpStore.delete(normalizedEmail);
  console.log(`[OTP] Email verified: ${email}`);
  
  return { valid: true };
}

export function hasValidOTP(email: string): boolean {
  const normalizedEmail = email.toLowerCase();
  const storedOTP = otpStore.get(normalizedEmail);
  
  if (!storedOTP) return false;
  if (storedOTP.expiresAt < new Date()) {
    otpStore.delete(normalizedEmail);
    return false;
  }
  
  return true;
}

// Monthly Player Report Email
export interface MonthlyReportData {
  playerName: string;
  playerEmail: string;
  month: string; // e.g., "January 2026"
  academyName: string;
  
  // Lessons
  lessonsTotal: number;
  lessonsAttended: number;
  lessonsAbsent: number;
  lessonsLate: number;
  lessonsHoliday: number;
  lessonsByType: { type: string; count: number }[];
  coachNames: string[];
  
  // Courts
  courtsBooked: number;
  courtHours: number;
  
  // Matches
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  
  // XP & Level
  xpEarned: number;
  currentLevel: number;
  currentXp: number;
  xpToNextLevel: number;
  levelProgress: number; // percentage
  
  // Credits
  creditsUsed: number;
  creditsRemaining: number;
  creditsByType: { type: string; used: number; remaining: number }[];
  
  // Glow Level
  glowLevel?: string;
  glowLevelProgress?: number;
}

export async function sendMonthlyReportEmail(data: MonthlyReportData): Promise<{ success: boolean; error?: string }> {
  const attendanceRate = data.lessonsTotal > 0 
    ? Math.round((data.lessonsAttended / data.lessonsTotal) * 100) 
    : 0;
  
  const winRate = data.matchesPlayed > 0 
    ? Math.round((data.matchesWon / data.matchesPlayed) * 100) 
    : 0;

  const lessonsByTypeHtml = data.lessonsByType.map(lt => `
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #333;">
      <span style="color: #aaa;">${escapeHtml(lt.type)}</span>
      <span style="color: #fff; font-weight: 600;">${lt.count} sessions</span>
    </div>
  `).join('');

  const creditsByTypeHtml = data.creditsByType.map(ct => `
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #333;">
      <span style="color: #aaa;">${escapeHtml(ct.type)}</span>
      <span style="color: #fff;">Used: <strong>${ct.used}</strong> | Remaining: <strong style="color: #00ff88;">${ct.remaining}</strong></span>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Monthly Tennis Report</title>
    </head>
    <body style="margin: 0; padding: 0; background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        
        <!-- Header -->
        <div style="text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%); border-radius: 16px 16px 0 0;">
          <h1 style="margin: 0; font-size: 28px; color: #00ff88;">Glow Up Sports</h1>
          <p style="margin: 10px 0 0; color: #00d4ff; font-size: 18px;">${escapeHtml(data.month)} Report</p>
        </div>
        
        <!-- Player Info -->
        <div style="background: #1a1a2e; padding: 25px; border-bottom: 1px solid #333;">
          <p style="margin: 0; color: #aaa; font-size: 14px;">Hello,</p>
          <h2 style="margin: 8px 0 0; color: #fff; font-size: 24px;">${escapeHtml(data.playerName)}</h2>
          <p style="margin: 8px 0 0; color: #666; font-size: 14px;">${escapeHtml(data.academyName)}</p>
        </div>
        
        <!-- Quick Stats Grid -->
        <div style="background: #141428; padding: 25px;">
          <h3 style="margin: 0 0 20px; color: #00d4ff; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Monthly Highlights</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            
            <!-- Lessons -->
            <div style="background: #1a1a2e; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; color: #00ff88; font-weight: bold;">${data.lessonsAttended}</div>
              <div style="color: #aaa; font-size: 12px; margin-top: 5px;">LESSONS ATTENDED</div>
              <div style="color: #666; font-size: 11px; margin-top: 3px;">of ${data.lessonsTotal} scheduled</div>
            </div>
            
            <!-- Attendance Rate -->
            <div style="background: #1a1a2e; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; color: ${attendanceRate >= 80 ? '#00ff88' : attendanceRate >= 60 ? '#ffaa00' : '#ff4444'}; font-weight: bold;">${attendanceRate}%</div>
              <div style="color: #aaa; font-size: 12px; margin-top: 5px;">ATTENDANCE RATE</div>
            </div>
            
            <!-- Courts -->
            <div style="background: #1a1a2e; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; color: #00d4ff; font-weight: bold;">${data.courtsBooked}</div>
              <div style="color: #aaa; font-size: 12px; margin-top: 5px;">COURTS BOOKED</div>
              <div style="color: #666; font-size: 11px; margin-top: 3px;">${data.courtHours} hours</div>
            </div>
            
            <!-- Matches -->
            <div style="background: #1a1a2e; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; color: #aa88ff; font-weight: bold;">${data.matchesPlayed}</div>
              <div style="color: #aaa; font-size: 12px; margin-top: 5px;">MATCHES PLAYED</div>
              <div style="color: #666; font-size: 11px; margin-top: 3px;">${data.matchesWon}W - ${data.matchesLost}L ${data.matchesPlayed > 0 ? `(${winRate}%)` : ''}</div>
            </div>
            
          </div>
        </div>
        
        <!-- XP & Level Progress -->
        <div style="background: #1a1a2e; padding: 25px; border-top: 1px solid #333;">
          <h3 style="margin: 0 0 20px; color: #00d4ff; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Level Progress</h3>
          
          <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 15px;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #00ff88 0%, #00d4ff 100%); display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 24px; font-weight: bold; color: #0a0a0a;">${data.currentLevel}</span>
            </div>
            <div>
              <div style="color: #fff; font-size: 18px; font-weight: 600;">Level ${data.currentLevel}</div>
              <div style="color: #00ff88; font-size: 14px;">+${data.xpEarned} XP this month</div>
            </div>
          </div>
          
          <!-- Progress Bar -->
          <div style="background: #333; border-radius: 8px; height: 12px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #00ff88 0%, #00d4ff 100%); height: 100%; width: ${data.levelProgress}%; transition: width 0.3s;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 8px;">
            <span style="color: #666; font-size: 12px;">${data.currentXp} XP</span>
            <span style="color: #666; font-size: 12px;">${data.xpToNextLevel} XP to Level ${data.currentLevel + 1}</span>
          </div>
          
          ${data.glowLevel ? `
          <div style="margin-top: 20px; padding: 15px; background: #141428; border-radius: 8px;">
            <div style="color: #aaa; font-size: 12px;">GLOW LEVEL</div>
            <div style="color: #00ff88; font-size: 20px; font-weight: bold; margin-top: 5px;">${escapeHtml(data.glowLevel)}</div>
          </div>
          ` : ''}
        </div>
        
        <!-- Lesson Breakdown -->
        <div style="background: #141428; padding: 25px; border-top: 1px solid #333;">
          <h3 style="margin: 0 0 20px; color: #00d4ff; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Lesson Breakdown</h3>
          
          <!-- Attendance Status -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
            <div style="background: #1a1a2e; padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; color: #00ff88; font-weight: bold;">${data.lessonsAttended}</div>
              <div style="color: #666; font-size: 10px;">PRESENT</div>
            </div>
            <div style="background: #1a1a2e; padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; color: #ff4444; font-weight: bold;">${data.lessonsAbsent}</div>
              <div style="color: #666; font-size: 10px;">ABSENT</div>
            </div>
            <div style="background: #1a1a2e; padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; color: #ffaa00; font-weight: bold;">${data.lessonsLate}</div>
              <div style="color: #666; font-size: 10px;">LATE</div>
            </div>
            <div style="background: #1a1a2e; padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; color: #888; font-weight: bold;">${data.lessonsHoliday}</div>
              <div style="color: #666; font-size: 10px;">HOLIDAY</div>
            </div>
          </div>
          
          <!-- By Session Type -->
          <div style="background: #1a1a2e; padding: 15px; border-radius: 8px;">
            <div style="color: #aaa; font-size: 12px; margin-bottom: 10px;">BY SESSION TYPE</div>
            ${lessonsByTypeHtml || '<div style="color: #666;">No lessons this month</div>'}
          </div>
          
          ${data.coachNames.length > 0 ? `
          <div style="margin-top: 15px; color: #666; font-size: 12px;">
            Coached by: <span style="color: #aaa;">${data.coachNames.map(n => escapeHtml(n)).join(', ')}</span>
          </div>
          ` : ''}
        </div>
        
        <!-- Credits -->
        <div style="background: #1a1a2e; padding: 25px; border-top: 1px solid #333;">
          <h3 style="margin: 0 0 20px; color: #00d4ff; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Credit Usage</h3>
          
          <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
            <div style="text-align: center;">
              <div style="font-size: 28px; color: #ff6666; font-weight: bold;">${data.creditsUsed}</div>
              <div style="color: #666; font-size: 12px;">USED</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 28px; color: #00ff88; font-weight: bold;">${data.creditsRemaining}</div>
              <div style="color: #666; font-size: 12px;">REMAINING</div>
            </div>
          </div>
          
          ${creditsByTypeHtml ? `
          <div style="background: #141428; padding: 15px; border-radius: 8px;">
            <div style="color: #aaa; font-size: 12px; margin-bottom: 10px;">BY CREDIT TYPE</div>
            ${creditsByTypeHtml}
          </div>
          ` : ''}
        </div>
        
        <!-- Footer -->
        <div style="background: #0a0a0a; padding: 30px 20px; text-align: center; border-radius: 0 0 16px 16px;">
          <p style="margin: 0; color: #666; font-size: 12px;">Keep up the great work! See you on the court.</p>
          <p style="margin: 15px 0 0; color: #444; font-size: 11px;">Glow Up Sports - Dubai Tennis Academy</p>
        </div>
        
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: data.playerEmail,
    subject: `Your ${data.month} Tennis Report - Glow Up Sports`,
    html,
  });
}
