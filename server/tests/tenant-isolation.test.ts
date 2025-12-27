import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_BASE = process.env.API_URL || 'http://localhost:5000';

interface TestUser {
  token: string;
  academyId: string;
  coachId: string;
  userId: string;
}

interface TestData {
  academy1: TestUser;
  academy2: TestUser;
  academy1PlayerId?: string;
}

const testData: TestData = {
  academy1: {} as TestUser,
  academy2: {} as TestUser,
};

async function registerAndLogin(email: string, password: string, name: string, academyName: string): Promise<TestUser> {
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, academyName, role: 'owner' }),
  });
  
  if (!registerRes.ok) {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${await loginRes.text()}`);
    }
    const loginData = await loginRes.json();
    return {
      token: loginData.token,
      academyId: loginData.user.academyId,
      coachId: loginData.user.coachId,
      userId: loginData.user.id,
    };
  }
  
  const registerData = await registerRes.json();
  return {
    token: registerData.token,
    academyId: registerData.user.academyId,
    coachId: registerData.user.coachId,
    userId: registerData.user.id,
  };
}

async function authFetch(url: string, token: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
}

describe('Multi-Tenant Isolation Tests', () => {
  beforeAll(async () => {
    const timestamp = Date.now();
    
    testData.academy1 = await registerAndLogin(
      `tenant-test-1-${timestamp}@test.com`,
      'TestPass123!',
      'Test Coach One',
      `Test Academy One ${timestamp}`
    );
    
    testData.academy2 = await registerAndLogin(
      `tenant-test-2-${timestamp}@test.com`, 
      'TestPass123!',
      'Test Coach Two',
      `Test Academy Two ${timestamp}`
    );

    const playerRes = await authFetch(`${API_BASE}/api/players`, testData.academy1.token, {
      method: 'POST',
      body: JSON.stringify({
        name: `Test Player ${timestamp}`,
        email: `testplayer-${timestamp}@test.com`,
        ballLevel: 'green',
      }),
    });
    
    if (playerRes.ok) {
      const playerData = await playerRes.json();
      testData.academy1PlayerId = playerData.id;
    }
  });

  describe('Player Isolation', () => {
    it('Academy 1 can access own player', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}`,
        testData.academy1.token
      );
      expect(res.status).toBe(200);
    });

    it('Academy 2 cannot access Academy 1 player', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}`,
        testData.academy2.token
      );
      expect(res.status).toBe(404);
    });

    it('Academy 2 cannot see Academy 1 players in list', async () => {
      const res = await authFetch(`${API_BASE}/api/players`, testData.academy2.token);
      const players = await res.json();
      
      if (testData.academy1PlayerId) {
        const leakedPlayer = players.find((p: any) => p.id === testData.academy1PlayerId);
        expect(leakedPlayer).toBeUndefined();
      }
    });

    it('Academy 2 cannot update Academy 1 player', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}`,
        testData.academy2.token,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Hacked Name' }),
        }
      );
      expect(res.status).toBe(404);
    });

    it('Academy 2 cannot delete Academy 1 player', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}`,
        testData.academy2.token,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Player Notes Isolation', () => {
    it('Academy 2 cannot access Academy 1 player notes', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}/notes`,
        testData.academy2.token
      );
      expect(res.status).toBe(404);
    });

    it('Academy 2 cannot create notes for Academy 1 player', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}/notes`,
        testData.academy2.token,
        {
          method: 'POST',
          body: JSON.stringify({ content: 'Leaked note content' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Package Isolation', () => {
    it('Academy 2 cannot access Academy 1 player packages', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}/packages`,
        testData.academy2.token
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Coach Profile Isolation', () => {
    it('Academy 1 can access own coach profile', async () => {
      const res = await authFetch(
        `${API_BASE}/api/coach/profile/${testData.academy1.coachId}`,
        testData.academy1.token
      );
      expect(res.status).toBe(200);
    });

    it('Academy 2 cannot access Academy 1 coach profile', async () => {
      const res = await authFetch(
        `${API_BASE}/api/coach/profile/${testData.academy1.coachId}`,
        testData.academy2.token
      );
      expect(res.status).toBe(404);
    });

    it('Academy 2 cannot update Academy 1 coach', async () => {
      const res = await authFetch(
        `${API_BASE}/api/coach/profile/${testData.academy1.coachId}`,
        testData.academy2.token,
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Hacked Coach Name' }),
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('XP Isolation', () => {
    it('Academy 2 cannot award XP to Academy 1 coach', async () => {
      const res = await authFetch(
        `${API_BASE}/api/coach/${testData.academy1.coachId}/xp`,
        testData.academy2.token,
        {
          method: 'POST',
          body: JSON.stringify({ xpAmount: 100, source: 'malicious_test' }),
        }
      );
      expect(res.status).toBe(404);
    });

    it('Academy 2 cannot view Academy 1 player XP', async () => {
      if (!testData.academy1PlayerId) return;
      
      const res = await authFetch(
        `${API_BASE}/api/players/${testData.academy1PlayerId}/xp`,
        testData.academy2.token
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Notification Isolation', () => {
    it('notifications only return own coach data', async () => {
      const res = await authFetch(
        `${API_BASE}/api/coach/notifications`,
        testData.academy2.token
      );
      expect(res.ok).toBe(true);
      
      const notifications = await res.json();
      const leakedNotifications = notifications.filter(
        (n: any) => n.coachId === testData.academy1.coachId
      );
      expect(leakedNotifications.length).toBe(0);
    });
  });

  describe('Template Isolation', () => {
    it('templates only return own coach data', async () => {
      const res = await authFetch(
        `${API_BASE}/api/coach/templates`,
        testData.academy2.token
      );
      expect(res.ok).toBe(true);
      
      const templates = await res.json();
      const leakedTemplates = templates.filter(
        (t: any) => t.coachId === testData.academy1.coachId
      );
      expect(leakedTemplates.length).toBe(0);
    });
  });

  describe('Unauthenticated Access', () => {
    it('rejects unauthenticated player access', async () => {
      const res = await fetch(`${API_BASE}/api/players`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated session access', async () => {
      const res = await fetch(`${API_BASE}/api/coach/sessions`);
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated coach profile access', async () => {
      const res = await fetch(`${API_BASE}/api/coach/profile/some-id`);
      expect(res.status).toBe(401);
    });
  });
});
