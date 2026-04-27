// Task #1398 — In-process Express dispatch for player god-endpoints.
//
// Player dashboard god-endpoints (`/api/player/me/profile-data`,
// `/api/player/me/community-data`, `/api/player/me/play-data`,
// `/api/player/me/progress-data`) used to fan out to legacy endpoints over
// HTTP loopback. Each loopback hop paid for:
//   1. TCP socket open + HTTP framing
//   2. JSON body re-parsing
//   3. A FULL re-run of `authMiddlewareWithFreshData`, which performs
//      ~2 extra database round-trips per call (user lookup + family/lock
//      checks). With 7-10 sub-fetches per dashboard load that's 14-20
//      "free" DB queries on every page open.
//
// `dispatchInProcess` synthesises the minimal Node `IncomingMessage` /
// `ServerResponse` surface that Express needs, attaches the parent
// request's already-resolved `req.user` via the `__inProcessUser` /
// `__inProcessDispatch` flags (the auth middlewares short-circuit on
// these — see server/auth.ts), and dispatches the child request through
// the same Express app (`parentReq.app`). Routing, middleware,
// validation and the route handler all execute exactly as they would
// over HTTP, so response shape parity is byte-equivalent — but the
// loopback HTTP cost vanishes.
//
// Errors are mapped onto the same `SubFetchResult<T>` shape the legacy
// `subFetch` helper returned so god-endpoints can drop this in with no
// downstream changes.
import { EventEmitter } from "events";
import type { AuthenticatedRequest } from "../auth";

export interface DispatchResult<T> {
  status: "ok" | "error";
  data: T | null;
  httpStatus: number | null;
}

interface DispatchOptions {
  forwardHeaders?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

export async function dispatchInProcess<T>(
  parentReq: AuthenticatedRequest,
  path: string,
  opts: DispatchOptions = {},
): Promise<DispatchResult<T>> {
  // Express attaches itself onto every incoming request via `req.app`.
  // We reuse it so the in-process child request is routed through the
  // same middleware stack as a normal HTTP request.
  const app: any = (parentReq as any).app;
  if (!app || typeof app !== "function") {
    return { status: "error", data: null, httpStatus: null };
  }

  return new Promise<DispatchResult<T>>((resolve) => {
    const queryIdx = path.indexOf("?");
    const pathname = queryIdx >= 0 ? path.slice(0, queryIdx) : path;

    // Carry forward only safe, useful headers from the parent request —
    // notably `authorization`, `x-academy-id`, `x-active-player-id`,
    // `accept-language`, and any caller-provided `forwardHeaders`. We
    // explicitly drop `content-length` / `transfer-encoding` because the
    // synthesized request has no body, and `host` because the dispatched
    // route is local to this process.
    const parentHeaders = parentReq.headers || {};
    const headers: Record<string, string> = {};
    const SAFE_FORWARD = new Set([
      "authorization",
      "accept",
      "accept-language",
      "user-agent",
      "x-academy-id",
      "x-active-player-id",
    ]);
    for (const k of Object.keys(parentHeaders)) {
      const lk = k.toLowerCase();
      if (!SAFE_FORWARD.has(lk)) continue;
      const v = (parentHeaders as any)[k];
      if (typeof v === "string") headers[lk] = v;
      else if (Array.isArray(v) && typeof v[0] === "string") headers[lk] = v[0];
    }
    if (!headers["accept"]) headers["accept"] = "application/json";
    if (opts.forwardHeaders) {
      for (const [k, v] of Object.entries(opts.forwardHeaders)) {
        headers[k.toLowerCase()] = v;
      }
    }

    const req: any = new EventEmitter();
    req.app = app;
    req.method = "GET";
    req.url = path;
    req.originalUrl = path;
    req.baseUrl = "";
    req.path = pathname;
    req.headers = headers;
    req.rawHeaders = Object.entries(headers).flatMap(([k, v]) => [k, v]);
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.complete = true;
    req.readable = false;
    req.body = {};
    req.connection = { remoteAddress: "127.0.0.1", encrypted: false };
    req.socket = req.connection;
    // Auth short-circuit hooks consumed by server/auth.ts — see
    // `authMiddleware` and `authMiddlewareWithFreshData`. When set, those
    // middlewares trust the pre-resolved `req.user` from the parent
    // request instead of re-validating the JWT and re-fetching the user
    // row from the DB.
    req.__inProcessDispatch = true;
    req.__inProcessUser = parentReq.user;
    // Standard Node `IncomingMessage` API surface — Express does not
    // call `read()` on a GET, but body-parsing middleware probes it.
    req.read = () => null;
    req.resume = () => req;
    req.pause = () => req;
    req.setEncoding = () => req;

    let statusCode = 200;
    const headersOut: Record<string, string | string[]> = {};
    const chunks: Buffer[] = [];
    let resolved = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (resolved) return;
      resolved = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      const buf = Buffer.concat(chunks).toString("utf8");
      let parsed: any = null;
      if (buf.length > 0) {
        try {
          parsed = JSON.parse(buf);
        } catch {
          parsed = null;
        }
      }
      const ok = statusCode >= 200 && statusCode < 300;
      resolve({
        status: ok ? "ok" : "error",
        data: ok ? (parsed as T) : null,
        httpStatus: statusCode,
      });
    };

    const res: any = new EventEmitter();
    res.app = app;
    res.req = req;
    res.statusCode = 200;
    res.statusMessage = "OK";
    res.headersSent = false;
    res.locals = {};
    res.finished = false;
    res.writableEnded = false;

    const setHeader = (k: string, v: any): any => {
      headersOut[k.toLowerCase()] = v;
      return res;
    };
    res.setHeader = setHeader;
    res.getHeader = (k: string) => headersOut[k.toLowerCase()];
    res.getHeaders = () => ({ ...headersOut });
    res.removeHeader = (k: string): void => {
      delete headersOut[k.toLowerCase()];
    };
    res.hasHeader = (k: string): boolean =>
      Object.prototype.hasOwnProperty.call(headersOut, k.toLowerCase());

    res.writeHead = (code: number, hdrs?: any): any => {
      statusCode = code;
      res.statusCode = code;
      if (hdrs && typeof hdrs === "object") {
        for (const [k, v] of Object.entries(hdrs)) {
          headersOut[k.toLowerCase()] = v as any;
        }
      }
      res.headersSent = true;
      return res;
    };

    res.status = (code: number): any => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };

    res.set = (k: any, v?: any): any => {
      if (typeof k === "string") return setHeader(k, v);
      if (k && typeof k === "object") {
        for (const [hk, hv] of Object.entries(k)) setHeader(hk, hv);
      }
      return res;
    };
    res.header = res.set;
    res.type = (_t: string): any => res;
    res.vary = (_v: string): any => res;
    res.append = (k: string, v: any): any => setHeader(k, v);
    res.cookie = (): any => res;
    res.clearCookie = (): any => res;
    res.location = (l: string): any => setHeader("location", l);
    res.redirect = (codeOrUrl: number | string, maybeUrl?: string): any => {
      if (typeof codeOrUrl === "number") {
        statusCode = codeOrUrl;
        if (maybeUrl) setHeader("location", maybeUrl);
      } else {
        statusCode = 302;
        setHeader("location", codeOrUrl);
      }
      res.headersSent = true;
      finish();
      return res;
    };

    res.write = (chunk: any): boolean => {
      if (chunk == null) return true;
      if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
      else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else chunks.push(Buffer.from(String(chunk)));
      return true;
    };

    res.end = (chunk?: any): any => {
      if (chunk != null) res.write(chunk);
      res.headersSent = true;
      res.finished = true;
      res.writableEnded = true;
      finish();
      return res;
    };

    res.json = (body: any): any => {
      const s = JSON.stringify(body ?? null);
      chunks.push(Buffer.from(s));
      res.headersSent = true;
      res.finished = true;
      res.writableEnded = true;
      finish();
      return res;
    };

    res.send = (body: any): any => {
      if (body == null) {
        res.headersSent = true;
        finish();
        return res;
      }
      if (typeof body === "object" && !Buffer.isBuffer(body)) {
        return res.json(body);
      }
      res.write(typeof body === "string" ? body : String(body));
      res.headersSent = true;
      res.finished = true;
      res.writableEnded = true;
      finish();
      return res;
    };

    res.sendStatus = (code: number): any => {
      statusCode = code;
      res.statusCode = code;
      return res.end();
    };

    res.get = (k: string) => res.getHeader(k);

    // Safety timeout — never let an in-process call wedge the parent
    // request. Mirrors the implicit timeout of the old loopback HTTP
    // path (Node's default keep-alive disconnect after idle).
    timeoutHandle = setTimeout(() => {
      if (!resolved) {
        statusCode = 504;
        finish();
      }
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      app(req, res, (err: unknown) => {
        // Express's outer callback fires only when no route matched and
        // no middleware called next() with an error. Treat as 404.
        if (!resolved) {
          if (err) statusCode = 500;
          else statusCode = 404;
          finish();
        }
      });
    } catch (err) {
      if (!resolved) {
        statusCode = 500;
        finish();
      }
    }
  });
}
