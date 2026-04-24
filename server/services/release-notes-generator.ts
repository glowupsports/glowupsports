import OpenAI from "openai";
import { execSync } from "node:child_process";
import { db } from "../db";
import { releaseNotesCache } from "@shared/schema";
import { and, eq } from "drizzle-orm";

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

function safeGitLog(sinceVersion: string | null, maxCount = 200): {
  commits: string[];
  headSha: string | null;
} {
  let headSha: string | null = null;
  try {
    headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    headSha = null;
  }
  const commits: string[] = [];
  // Try a few strategies in order — we don't tag releases so we have to be flexible.
  const candidateRanges: string[] = [];
  if (sinceVersion) {
    // If we ever start tagging like v1.3.4, this will work first.
    candidateRanges.push(`v${sinceVersion}..HEAD`);
    candidateRanges.push(`${sinceVersion}..HEAD`);
    // Otherwise, search commit messages mentioning the previous version.
    candidateRanges.push("");
  } else {
    candidateRanges.push("");
  }
  for (const range of candidateRanges) {
    try {
      const cmd = range
        ? `git log ${range} --pretty=format:%s --no-merges -n ${maxCount}`
        : `git log --pretty=format:%s --no-merges -n ${maxCount}`;
      const out = execSync(cmd, { encoding: "utf8" });
      if (out.trim()) {
        out.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) commits.push(trimmed);
        });
        break;
      }
    } catch {
      // try next strategy
    }
  }
  return { commits: commits.slice(0, maxCount), headSha };
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
    .map((s: any, idx: number): ReleaseNoteSlide | null => {
      if (!s || typeof s !== "object") return null;
      const title = String(s.title || "").trim();
      const body = String(s.body || "").trim();
      if (!title || !body) return null;
      return {
        id: String(s.id || `slide-${idx}`).slice(0, 64),
        icon: String(s.icon || "star").slice(0, 32),
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
 * Get release notes for (version, role, locale). Uses the cache when present;
 * otherwise calls OpenAI on the git log since `fromVersion` and stores the result.
 * Never throws — falls back to canned slides on any error so the boot flow
 * keeps moving.
 */
export async function getReleaseNotes(opts: {
  version: string;
  role: ReleaseNoteRole;
  locale: ReleaseNoteLocale;
  fromVersion: string | null;
  forceRegenerate?: boolean;
}): Promise<ReleaseNotesPayload> {
  const { version, role, locale, fromVersion, forceRegenerate } = opts;

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
        return {
          version,
          fromVersion: hit.fromVersion ?? fromVersion,
          slides: hit.slides as ReleaseNoteSlide[],
        };
      }
    } catch (err) {
      console.warn("[release-notes] cache lookup failed:", err);
    }
  }

  const { commits, headSha } = safeGitLog(fromVersion);
  let slides: ReleaseNoteSlide[] = [];
  try {
    if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      const prompt = buildPrompt(role, locale, version, fromVersion, commits);
      slides = await generateWithOpenAI(prompt);
    }
  } catch (err) {
    console.warn("[release-notes] OpenAI generation failed:", err);
  }
  if (slides.length === 0) {
    slides = fallbackSlides(role, locale);
  }

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
