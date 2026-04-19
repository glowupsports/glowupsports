import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express, { type Express, type NextFunction, type Response } from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import type { AuthenticatedRequest, JWTPayload } from '../auth';
import { defaultAcademyTheme } from '../../shared/theme';

interface FakeAcademy {
  id: string;
  theme: unknown;
}
interface UpdateCall {
  id: string;
  data: { theme: unknown };
}

const academies = new Map<string, FakeAcademy>();
const updateCalls: UpdateCall[] = [];
let testUser: JWTPayload | undefined;

vi.mock('../db', () => ({ db: {}, pool: {} }));

vi.mock('../storage', () => ({
  storage: {
    getAcademy: vi.fn(async (id: string) => academies.get(id)),
    updateAcademy: vi.fn(async (id: string, data: { theme: unknown }) => {
      updateCalls.push({ id, data });
      const existing = academies.get(id) ?? { id, theme: null };
      const next: FakeAcademy = { ...existing, ...data };
      academies.set(id, next);
      return next;
    }),
  },
}));

vi.mock('../auth', async () => {
  const actual = await vi.importActual<typeof import('../auth')>('../auth');
  const authMiddlewareWithFreshData = (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    if (testUser) req.user = testUser;
    next();
  };
  return { ...actual, authMiddlewareWithFreshData };
});

vi.mock('../pushNotifications', () => ({
  sendPushNotification: vi.fn(),
  getPlayerPushTokens: vi.fn(async () => []),
  getCoachPushTokens: vi.fn(async () => []),
  getUserPushTokens: vi.fn(async () => []),
}));

vi.mock('../services/invoicePdf', () => ({
  generateInvoiceHtml: vi.fn(),
  parseLineItems: vi.fn(() => []),
  parseInvoiceMetadata: vi.fn(() => ({})),
}));

vi.mock('../services/xp-service', () => ({ awardXP: vi.fn() }));

let server: Server;
let baseUrl: string;

function authedFetch(
  path: string,
  user: JWTPayload | undefined,
  init: RequestInit = {},
) {
  testUser = user;
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function makeUser(overrides: Partial<JWTPayload> & Pick<JWTPayload, 'role'>): JWTPayload {
  return {
    userId: 'test-user',
    email: 'test@test.com',
    academyId: 'acad-1',
    coachId: null,
    playerId: null,
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= 'test-secret';
  const { default: router } = await import('../routes/academy-settings');
  const app: Express = express();
  app.use(express.json());
  app.use(router);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  return async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  };
});

beforeEach(() => {
  academies.clear();
  updateCalls.length = 0;
  testUser = undefined;
  academies.set('acad-1', { id: 'acad-1', theme: null });
});

describe('PATCH /api/academy/theme — role guard', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await authedFetch('/api/academy/theme', undefined, {
      method: 'PATCH',
      body: JSON.stringify({ theme: defaultAcademyTheme }),
    });
    expect(res.status).toBe(401);
    expect(updateCalls).toHaveLength(0);
  });

  it.each(['coach', 'player', 'admin'])('rejects %s role with 403', async (role) => {
    const res = await authedFetch('/api/academy/theme', makeUser({ role }), {
      method: 'PATCH',
      body: JSON.stringify({ theme: defaultAcademyTheme }),
    });
    expect(res.status).toBe(403);
    expect(updateCalls).toHaveLength(0);
  });

  it.each(['owner', 'academy_owner', 'platform_owner'])(
    'allows %s role through to validation',
    async (role) => {
      const res = await authedFetch('/api/academy/theme', makeUser({ role }), {
        method: 'PATCH',
        body: JSON.stringify({ theme: defaultAcademyTheme }),
      });
      expect(res.status).toBe(200);
    },
  );
});

describe('PATCH /api/academy/theme — validation & persistence', () => {
  const owner = (): JWTPayload => makeUser({ role: 'owner' });

  it('persists a valid full theme and returns it', async () => {
    const res = await authedFetch('/api/academy/theme', owner(), {
      method: 'PATCH',
      body: JSON.stringify({ theme: defaultAcademyTheme }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { theme: unknown };
    expect(body.theme).toEqual(defaultAcademyTheme);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      id: 'acad-1',
      data: { theme: defaultAcademyTheme },
    });

    const getRes = await authedFetch('/api/academy/theme', owner());
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { theme: unknown }).theme).toEqual(defaultAcademyTheme);
  });

  it('persists a partial theme', async () => {
    const res = await authedFetch('/api/academy/theme', owner(), {
      method: 'PATCH',
      body: JSON.stringify({ theme: { primary: '#1E62D0' } }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { theme: unknown }).theme).toEqual({ primary: '#1E62D0' });
  });

  it('clears the theme when null is sent', async () => {
    academies.set('acad-1', { id: 'acad-1', theme: defaultAcademyTheme });
    const res = await authedFetch('/api/academy/theme', owner(), {
      method: 'PATCH',
      body: JSON.stringify({ theme: null }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { theme: unknown }).theme).toBeNull();
    expect(updateCalls[0].data).toEqual({ theme: null });
  });

  it('rejects an invalid hex value with 400', async () => {
    const res = await authedFetch('/api/academy/theme', owner(), {
      method: 'PATCH',
      body: JSON.stringify({ theme: { primary: '#ZZZ' } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe('Invalid theme');
    expect(typeof body.details).toBe('string');
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects unknown top-level fields with 400', async () => {
    const res = await authedFetch('/api/academy/theme', owner(), {
      method: 'PATCH',
      body: JSON.stringify({ theme: { primary: '#C8FF3D', evil: '#000000' } }),
    });
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects non-string colour values with 400', async () => {
    const res = await authedFetch('/api/academy/theme', owner(), {
      method: 'PATCH',
      body: JSON.stringify({ theme: { primary: 42 } }),
    });
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 400 when the owner has no academy on their token', async () => {
    const res = await authedFetch(
      '/api/academy/theme',
      makeUser({ role: 'owner', academyId: null }),
      { method: 'PATCH', body: JSON.stringify({ theme: defaultAcademyTheme }) },
    );
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});

describe('GET /api/academy/theme', () => {
  it('returns null when the user has no academy', async () => {
    const res = await authedFetch(
      '/api/academy/theme',
      makeUser({ role: 'owner', academyId: null }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { theme: unknown }).theme).toBeNull();
  });

  it('returns the persisted theme when one exists', async () => {
    academies.set('acad-1', { id: 'acad-1', theme: defaultAcademyTheme });
    const res = await authedFetch('/api/academy/theme', makeUser({ role: 'owner' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { theme: unknown }).theme).toEqual(defaultAcademyTheme);
  });
});
