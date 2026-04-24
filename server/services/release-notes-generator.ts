import OpenAI from "openai";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { db } from "../db";
import { releaseNotesCache } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SUPPORTED_ROLES = ["player", "parent", "coach", "owner"] as const;
export type ReleaseNoteRole = (typeof SUPPORTED_ROLES)[number];

const SUPPORTED_LOCALES = ["en", "nl", "id", "ar"] as const;
export type ReleaseNoteLocale = (typeof SUPPORTED_LOCALES)[number];

export type ReleaseNoteSlide = {
  id: string;
  icon: string;
  title: string;
  body: string;
};

export type ReleaseNotesPayload = {
  version: string;
  fromVersion: string | null;
  slides: ReleaseNoteSlide[];
};

export function normalizeRole(raw: string | undefined): ReleaseNoteRole {
  const r = String(raw || "").toLowerCase();
  if (r === "parent") return "parent";
  if (r === "coach" || r === "assistant") return "coach";
  if (r === "owner" || r === "platform_owner" || r === "academy_owner") return "owner";
  return "player";
}

export function normalizeLocale(raw: string | undefined): ReleaseNoteLocale {
  const l = String(raw || "").toLowerCase().slice(0, 2);
  if (l === "nl" || l === "id" || l === "ar") return l;
  return "en";
}

const ROLE_PERSONAS: Record<ReleaseNoteRole, string> = {
  player:
    "a junior or adult tennis player using the app to book lessons, track progress, and play matches. Mention only changes that affect THEIR experience: lessons, sessions, matches, ranking, ladder, tournaments, social feed, friends, profile, court booking, gamification (XP, levels, streaks, quests). Skip backend, coach, owner and academy admin changes.",
  parent:
    "a parent of one or more junior players, who manages family accounts, payments, scheduling, and credit. Mention only family-relevant changes: family lobby, payments, invoices, credits, schedules of children, parent dashboards, push notifications, and anything called 'parent'. Skip purely player-fun, coach-tooling and owner-admin changes.",
  coach:
    "a tennis coach using the app to plan sessions, manage players, mark attendance, run drills, message players, and track player progress. Mention only coach-side changes: planning, attendance, week planner, group/series management, player detail, lesson templates, evaluations, messaging, smart fill, guest players. Skip player-only and owner-admin changes.",
  owner:
    "an academy owner / platform owner using the dashboards to manage staff, finances, locations, branding, and platform-wide settings. Mention only changes that affect academy admin or platform-owner workflows: dashboards, finance, invoicing, staff management, locations/courts, theming, integrations, system reliability, security. Skip player-fun and coach-only changes.",
};

const LOCALE_NAMES: Record<ReleaseNoteLocale, string> = {
  en: "English",
  nl: "Dutch (Nederlands)",
  id: "Indonesian (Bahasa Indonesia)",
  ar: "Arabic (العربية)",
};

const FEATHER_ICON_HINTS = [
  "zap", "star", "heart", "trending-up", "calendar", "users", "user-plus",
  "bell", "message-circle", "award", "shield", "tool", "settings", "globe",
  "map-pin", "credit-card", "gift", "play", "edit-3", "send", "bookmark",
  "compass", "package", "smile", "thumbs-up", "trophy",
];

/**
 * Look up the commit SHA we previously cached for `fromVersion` (any role/locale)
 * so we can do `git log <sha>..HEAD` even though we don't tag releases.
 *
 * Returns null if no prior cache exists for that version (first time the
 * version is asked about) — the caller should fall back to a count-based
 * window in that case.
 */
async function lookupCachedShaForVersion(
  version: string,
): Promise<string | null> {
  try {
    const [hit] = await db
      .select({ commitSha: releaseNotesCache.commitSha })
      .from(releaseNotesCache)
      .where(eq(releaseNotesCache.version, version))
      .orderBy(desc(releaseNotesCache.generatedAt))
      .limit(1);
    return hit?.commitSha ?? null;
  } catch {
    return null;
  }
}

function safeGitLog(
  sinceVersion: string | null,
  cachedSinceSha: string | null,
  maxCount = 200,
): {
  commits: string[];
  headSha: string | null;
  windowKind: "tag" | "sha" | "count" | "none";
} {
  let headSha: string | null = null;
  try {
    headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    headSha = null;
  }
  // Strategy chain:
  //   1) v<since>..HEAD or <since>..HEAD if a release tag exists
  //   2) <cached-sha>..HEAD if we previously stored the commit SHA for `since`
  //   3) Last 50 commits (count window) — relevant-but-not-perfect since we
  //      don't tag releases
  //   4) Empty (caller should treat as "no relevant commits")
  type Strategy = { range: string; kind: "tag" | "sha" | "count" };
  const strategies: Strategy[] = [];
  if (sinceVersion) {
    strategies.push({ range: `v${sinceVersion}..HEAD`, kind: "tag" });
    strategies.push({ range: `${sinceVersion}..HEAD`, kind: "tag" });
  }
  if (cachedSinceSha) {
    strategies.push({ range: `${cachedSinceSha}..HEAD`, kind: "sha" });
  }
  // Only fall back to a count-window when we have no other signal at all.
  // Without `since` we still want SOMETHING for the manual launcher.
  if (!sinceVersion && !cachedSinceSha) {
    strategies.push({ range: `-n 50`, kind: "count" });
  }

  for (const s of strategies) {
    try {
      const cmd = s.kind === "count"
        ? `git log --pretty=format:%s --no-merges ${s.range}`
        : `git log ${s.range} --pretty=format:%s --no-merges -n ${maxCount}`;
      const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const lines = out
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length > 0) {
        return { commits: lines.slice(0, maxCount), headSha, windowKind: s.kind };
      }
    } catch {
      // try next strategy
    }
  }
  return { commits: [], headSha, windowKind: "none" };
}

function buildPrompt(
  role: ReleaseNoteRole,
  locale: ReleaseNoteLocale,
  version: string,
  fromVersion: string | null,
  commits: string[],
): string {
  const persona = ROLE_PERSONAS[role];
  const localeName = LOCALE_NAMES[locale];
  const commitBullets = commits.slice(0, 120).map((c) => `- ${c}`).join("\n");
  return [
    `You are writing the in-app "What's New" carousel for Glow Up Sports, a tennis academy app, for app version ${version}${fromVersion ? ` (since ${fromVersion})` : ""}.`,
    `The reader is ${persona}`,
    "",
    `Write 3 to 5 short, friendly, hype-but-honest highlights in ${localeName}. Each highlight is one slide.`,
    "Rules:",
    `- Title: max 5 words, no period, sentence case (first letter capital).`,
    `- Body: max 18 words, one sentence, plain language a non-technical user understands. Tell them WHAT they can now do, not which file changed.`,
    `- Pick a Feather icon name from this list that matches the highlight: ${FEATHER_ICON_HINTS.join(", ")}.`,
    `- id: a short kebab-case slug derived from the title.`,
    "- Skip purely internal / refactor / lint / test / scaffolding / migration commits.",
    "- Combine related commits into one highlight (don't list 5 fixes about the same screen).",
    "- If less than 3 user-facing changes, still return at least 3 by widening to general 'polish & reliability' style highlights.",
    "- Never invent features that aren't in the commits.",
    "",
    "Commits since the previous version (newest first):",
    commitBullets || "(no commits found — write 3 generic 'polish & reliability' highlights)",
    "",
    `Respond ONLY with JSON: { "slides": [{ "id": "...", "icon": "...", "title": "...", "body": "..." }] }`,
  ].join("\n");
}

async function generateWithOpenAI(
  prompt: string,
): Promise<ReleaseNoteSlide[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You write concise, user-facing release notes for a mobile app. You always respond with valid JSON in the requested shape.",
      },
      { role: "user", content: prompt },
    ],
  });
  const raw = completion.choices?.[0]?.message?.content || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const slides = (parsed as { slides?: unknown })?.slides;
  if (!Array.isArray(slides)) return [];
  return slides
    .map((s: unknown, idx: number): ReleaseNoteSlide | null => {
      if (!s || typeof s !== "object") return null;
      const obj = s as Record<string, unknown>;
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      const body = typeof obj.body === "string" ? obj.body.trim() : "";
      if (!title || !body) return null;
      const id = typeof obj.id === "string" && obj.id ? obj.id : `slide-${idx}`;
      const icon = typeof obj.icon === "string" && obj.icon ? obj.icon : "star";
      return {
        id: id.slice(0, 64),
        icon: icon.slice(0, 32),
        title: title.slice(0, 80),
        body: body.slice(0, 200),
      };
    })
    .filter((s): s is ReleaseNoteSlide => s !== null)
    .slice(0, 5);
}

function fallbackSlides(
  role: ReleaseNoteRole,
  locale: ReleaseNoteLocale,
): ReleaseNoteSlide[] {
  const dict: Record<ReleaseNoteLocale, { title: string; body: string }[]> = {
    en: [
      { title: "Faster and smoother", body: "Performance and reliability tweaks across the app." },
      { title: "Bug fixes", body: "Squashed several small bugs you reported." },
      { title: "Polish", body: "Tiny visual touch-ups for a cleaner experience." },
    ],
    nl: [
      { title: "Sneller en stabieler", body: "Snelheid en stabiliteit zijn verbeterd door de hele app." },
      { title: "Bugs gefixt", body: "Een paar kleine bugs die je had gemeld zijn opgelost." },
      { title: "Visuele finish", body: "Kleine schoonheidsfoutjes weggewerkt voor een schonere look." },
    ],
    id: [
      { title: "Lebih cepat dan stabil", body: "Peningkatan performa dan keandalan di seluruh aplikasi." },
      { title: "Perbaikan bug", body: "Beberapa bug kecil yang kamu laporkan sudah diperbaiki." },
      { title: "Polesan akhir", body: "Sentuhan visual kecil untuk pengalaman yang lebih bersih." },
    ],
    ar: [
      { title: "أسرع وأكثر ثباتًا", body: "تحسينات في الأداء والموثوقية في جميع أنحاء التطبيق." },
      { title: "إصلاح الأخطاء", body: "تم إصلاح عدة أخطاء صغيرة أبلغت عنها." },
      { title: "لمسات نهائية", body: "تعديلات بصرية صغيرة لتجربة أنظف." },
    ],
  };
  const items = dict[locale] || dict.en;
  return items.map((item, idx) => ({
    id: `fallback-${role}-${idx}`,
    icon: ["zap", "tool", "smile"][idx] || "star",
    title: item.title,
    body: item.body,
  }));
}

/**
 * Read the per-platform versions from app.json so the route can validate that
 * a client-supplied `version` matches a real published build. Without this
 * check, anyone could spam unique versions to bypass the per-key cache and
 * force OpenAI generations.
 */
let cachedAppVersions: { all: Set<string>; primary: string } | null = null;
export function getServerAppVersions(): { all: Set<string>; primary: string } {
  if (cachedAppVersions) return cachedAppVersions;
  const all = new Set<string>();
  let primary = "0.0.0";
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const raw = fs.readFileSync(appJsonPath, "utf8");
    const parsed = JSON.parse(raw) as {
      expo?: {
        version?: string;
        ios?: { version?: string };
        android?: { version?: string };
      };
    };
    const top = parsed?.expo?.version;
    const ios = parsed?.expo?.ios?.version;
    const android = parsed?.expo?.android?.version;
    [top, ios, android].forEach((v) => {
      if (typeof v === "string" && /^[\w.\-]{1,32}$/.test(v)) all.add(v);
    });
    primary = top || android || ios || "0.0.0";
  } catch (err) {
    console.warn("[release-notes] cannot read app.json for version allowlist:", err);
  }
  cachedAppVersions = { all, primary };
  return cachedAppVersions;
}

/**
 * Get release notes for (version, role, locale). Uses the cache when present;
 * otherwise calls OpenAI on the git log since `fromVersion` and stores the result.
 *
 * `allowFallback` controls what happens when OpenAI returns nothing:
 *   - true  → return canned generic "polish & reliability" slides (used by the
 *             manual "View latest updates" launcher, where the user explicitly
 *             asked to see something).
 *   - false → return an empty slides array (used by the auto boot-time flow,
 *             where the WhatsNewGate silently dismisses if there are no
 *             role-relevant updates).
 */
export async function getReleaseNotes(opts: {
  version: string;
  role: ReleaseNoteRole;
  locale: ReleaseNoteLocale;
  fromVersion: string | null;
  forceRegenerate?: boolean;
  allowFallback?: boolean;
}): Promise<ReleaseNotesPayload> {
  const {
    version,
    role,
    locale,
    fromVersion,
    forceRegenerate,
    allowFallback = false,
  } = opts;

  if (!forceRegenerate) {
    try {
      const [hit] = await db
        .select()
        .from(releaseNotesCache)
        .where(
          and(
            eq(releaseNotesCache.version, version),
            eq(releaseNotesCache.role, role),
            eq(releaseNotesCache.locale, locale),
          ),
        )
        .limit(1);
      if (hit) {
        let cachedSlides = (hit.slides as ReleaseNoteSlide[]) || [];
        // If the cached row is empty AND the caller wants a fallback (manual
        // launcher), upgrade to canned slides on the fly without re-caching —
        // this keeps the auto-flow behavior empty for everyone else.
        if (cachedSlides.length === 0 && allowFallback) {
          cachedSlides = fallbackSlides(role, locale);
        }
        return {
          version,
          fromVersion: hit.fromVersion ?? fromVersion,
          slides: cachedSlides,
        };
      }
    } catch (err) {
      console.warn("[release-notes] cache lookup failed:", err);
    }
  }

  const cachedSinceSha = fromVersion
    ? await lookupCachedShaForVersion(fromVersion)
    : null;
  const { commits, headSha } = safeGitLog(fromVersion, cachedSinceSha);
  let slides: ReleaseNoteSlide[] = [];
  try {
    if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY && commits.length > 0) {
      const prompt = buildPrompt(role, locale, version, fromVersion, commits);
      slides = await generateWithOpenAI(prompt);
    }
  } catch (err) {
    console.warn("[release-notes] OpenAI generation failed:", err);
  }
  // For the auto boot-flow (allowFallback === false) we keep slides empty when
  // there is genuinely nothing relevant — the WhatsNewGate silently dismisses.
  // For the manual launcher (allowFallback === true) we fall back to canned
  // slides because the user explicitly asked to see what's new.
  if (slides.length === 0 && allowFallback) {
    slides = fallbackSlides(role, locale);
  }

  // We always store the result — including empty arrays — so subsequent hits
  // for the same (version, role, locale) are served from cache instead of
  // re-running git+OpenAI. Empty arrays are upgraded on read for fallback
  // callers (see above).
  try {
    if (forceRegenerate) {
      await db
        .delete(releaseNotesCache)
        .where(
          and(
            eq(releaseNotesCache.version, version),
            eq(releaseNotesCache.role, role),
            eq(releaseNotesCache.locale, locale),
          ),
        );
    }
    await db.insert(releaseNotesCache).values({
      version,
      role,
      locale,
      fromVersion,
      slides,
      commitSha: headSha,
    }).onConflictDoNothing();
  } catch (err) {
    console.warn("[release-notes] cache write failed:", err);
  }

  return { version, fromVersion, slides };
}
