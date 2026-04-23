#!/usr/bin/env node
/**
 * scripts/ota-list-parser.js
 *
 * Parses the JSON returned by `eas update:list --branch <branch> --json` and
 * decides whether a freshly-published OTA update is present for a given
 * platform + runtimeVersion + message. Used by scripts/ota-push.sh as the
 * secondary cross-check after `eas update --json` already confirmed the
 * publish locally.
 *
 * Real shape (captured 2026-04-23, eas-cli@18.7.0):
 *   {
 *     "name": "production",
 *     "id": "...branch-id...",
 *     "currentPage": [
 *       {
 *         "branch": "production",
 *         "message": "\"My commit message\" (16 minutes ago by GitHub App · @user (robot))",
 *         "runtimeVersion": "1.3.5",
 *         "isRollBackToEmbedded": false,
 *         "group": "bec675da-...",
 *         "platforms": "android"        // STRING, singular, lowercase
 *       },
 *       ...
 *     ]
 *   }
 *
 * Quirks the parser must handle:
 *   1. The top-level value is an OBJECT with `currentPage`, NOT a bare array.
 *   2. `platforms` is a STRING (e.g. "android"), not an array. Older shapes
 *      may use `platform` (singular) or an array — we accept all three.
 *   3. The `message` field is wrapped in literal double-quotes AND decorated
 *      with " (N <unit> ago by ...)". To match against the message we
 *      published, we must (a) strip the surrounding quotes and (b) strip
 *      the trailing " (... ago ...)" suffix.
 *
 * Usage:
 *   node scripts/ota-list-parser.js <jsonFile> <platform> <runtimeVersion> <message>
 *
 * Exit codes:
 *   0  — match found; prints "OK id=<group>"
 *   1  — usage / file / parse error
 *   2  — no match; prints "NO_MATCH" plus a short diagnostic on stderr
 */

'use strict';

const fs = require('fs');

function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Strip the `eas update:list` decoration off a message:
 *   `"my message" (3 minutes ago by GitHub App · @user (robot))`
 * becomes:
 *   `my message`
 *
 * - Removes the trailing " (... ago ...)" (if present) — the substring
 *   " ago " inside the parens is the reliable marker.
 * - Strips one pair of surrounding double-quotes (eas wraps the message).
 * - Collapses whitespace.
 */
function stripDecoration(rawMessage) {
  let s = String(rawMessage || '').trim();
  // EAS wraps the original message in literal double-quotes and appends
  // decoration: `"<original message>" (16 minutes ago by ...)`. Naively
  // stripping a trailing parenthesized group breaks when the original
  // message itself contains parens (e.g. "Hotfix (Android crash)").
  //
  // Reliable rule: if the string starts with a `"`, the original message
  // ends at the LAST `"` in the string — everything after is decoration.
  if (s.startsWith('"')) {
    const close = s.lastIndexOf('"');
    if (close > 0) {
      s = s.slice(1, close);
    } else {
      s = s.slice(1);
    }
  } else {
    // No wrapping quotes (older or future shapes) — fall back to stripping
    // a trailing " (... ago ...)" suffix if it's clearly there.
    s = s.replace(/\s*\([^()]*\bago\b[^()]*\)\s*$/, '');
  }
  return normalizeWhitespace(s);
}

function platformsOf(item) {
  if (!item) return [];
  if (Array.isArray(item.platforms)) return item.platforms.map(String);
  if (typeof item.platforms === 'string') {
    // Could be "android" or "android,ios" — split defensively.
    return item.platforms.split(',').map((p) => p.trim()).filter(Boolean);
  }
  if (typeof item.platform === 'string') return [item.platform];
  return [];
}

/**
 * Walk the parsed `eas update:list --json` payload and return a flat list of
 * per-update records regardless of which top-level shape the CLI returns.
 */
function flattenUpdates(raw) {
  if (!raw) return [];
  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (Array.isArray(raw.currentPage)) {
    items = raw.currentPage;
  } else if (Array.isArray(raw.results)) {
    items = raw.results;
  }
  const flat = [];
  for (const it of items) {
    if (!it) continue;
    // Some legacy shapes wrap per-platform records under `updates[]`.
    if (Array.isArray(it.updates) && it.updates.length > 0) {
      flat.push(...it.updates);
    } else {
      flat.push(it);
    }
  }
  return flat;
}

/**
 * Find an update matching the requested platform, runtimeVersion, and message.
 * Returns the matching record, or null.
 */
function findMatch(raw, { platform, runtimeVersion, message }) {
  const wantMsg = normalizeWhitespace(message);
  const flat = flattenUpdates(raw);
  return (
    flat.find((u) => {
      if (!u) return false;
      const plats = platformsOf(u);
      if (!plats.includes(platform)) return false;
      if (u.runtimeVersion !== runtimeVersion) return false;
      const got = stripDecoration(u.message);
      return got === wantMsg;
    }) || null
  );
}

function main(argv) {
  const [, , file, platform, runtimeVersion, ...messageParts] = argv;
  if (!file || !platform || !runtimeVersion || messageParts.length === 0) {
    console.error(
      'Usage: node scripts/ota-list-parser.js <jsonFile> <platform> <runtimeVersion> <message>'
    );
    process.exit(1);
  }
  const message = messageParts.join(' ');

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('PARSE_ERR ' + e.message);
    process.exit(1);
  }

  const match = findMatch(raw, { platform, runtimeVersion, message });
  if (match) {
    console.log('OK id=' + (match.id || match.group || '?'));
    process.exit(0);
  }

  console.log('NO_MATCH');
  // Diagnostic on stderr — what we considered.
  const flat = flattenUpdates(raw);
  console.error(
    'No update matched platform=' +
      platform +
      ' runtimeVersion=' +
      runtimeVersion +
      ' message=' +
      JSON.stringify(message)
  );
  console.error('Considered ' + flat.length + ' update record(s):');
  for (const u of flat.slice(0, 10)) {
    console.error(
      '  - platforms=' +
        JSON.stringify(platformsOf(u)) +
        ' rt=' +
        u.runtimeVersion +
        ' msg=' +
        JSON.stringify(stripDecoration(u.message))
    );
  }
  process.exit(2);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { stripDecoration, platformsOf, flattenUpdates, findMatch };
