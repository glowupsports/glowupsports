// Google Calendar Service - Push sessions to coach's Google Calendar
// Integration: connection:conn_google-calendar_01K6NH2ZMQD043EW3EKPJHDRZW

import { google, calendar_v3 } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface SessionEventData {
  sessionId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  playerNames?: string[];
}

export async function createCalendarEvent(data: SessionEventData): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const calendar = await getCalendarClient();
    
    const eventDescription = data.playerNames && data.playerNames.length > 0
      ? `${data.description || ''}\n\nPlayers: ${data.playerNames.join(', ')}`
      : data.description;

    const event: calendar_v3.Schema$Event = {
      summary: data.title,
      description: eventDescription,
      start: {
        dateTime: data.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: data.endTime.toISOString(),
        timeZone: 'UTC',
      },
      location: data.location,
      extendedProperties: {
        private: {
          glowUpSessionId: data.sessionId,
        },
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    console.log(`[GoogleCalendar] Created event ${response.data.id} for session ${data.sessionId}`);
    return { success: true, eventId: response.data.id || undefined };
  } catch (error: any) {
    console.error('[GoogleCalendar] Failed to create event:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateCalendarEvent(eventId: string, data: SessionEventData): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = await getCalendarClient();
    
    const eventDescription = data.playerNames && data.playerNames.length > 0
      ? `${data.description || ''}\n\nPlayers: ${data.playerNames.join(', ')}`
      : data.description;

    const event: calendar_v3.Schema$Event = {
      summary: data.title,
      description: eventDescription,
      start: {
        dateTime: data.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: data.endTime.toISOString(),
        timeZone: 'UTC',
      },
      location: data.location,
    };

    await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: event,
    });

    console.log(`[GoogleCalendar] Updated event ${eventId} for session ${data.sessionId}`);
    return { success: true };
  } catch (error: any) {
    console.error('[GoogleCalendar] Failed to update event:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = await getCalendarClient();
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log(`[GoogleCalendar] Deleted event ${eventId}`);
    return { success: true };
  } catch (error: any) {
    console.error('[GoogleCalendar] Failed to delete event:', error.message);
    return { success: false, error: error.message };
  }
}

export async function listCalendars(): Promise<{ success: boolean; calendars?: { id: string; name: string }[]; error?: string }> {
  try {
    const calendar = await getCalendarClient();
    
    const response = await calendar.calendarList.list();
    
    const calendars = response.data.items?.map(cal => ({
      id: cal.id || '',
      name: cal.summary || 'Unnamed Calendar',
    })) || [];

    return { success: true, calendars };
  } catch (error: any) {
    console.error('[GoogleCalendar] Failed to list calendars:', error.message);
    return { success: false, error: error.message };
  }
}

export async function checkConnection(): Promise<{ connected: boolean; email?: string; error?: string }> {
  try {
    const calendar = await getCalendarClient();
    
    const response = await calendar.calendarList.get({
      calendarId: 'primary',
    });

    return { 
      connected: true, 
      email: response.data.id || undefined 
    };
  } catch (error: any) {
    return { 
      connected: false, 
      error: error.message 
    };
  }
}
