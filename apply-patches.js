#!/usr/bin/env node
/**
 * apply-patches.js — re-apply node_modules patches that must survive npm install.
 *
 * Run with: node apply-patches.js
 *
 * WHY THIS EXISTS — Task #1487 EAS OTA Push Bug:
 *   The EAS server (api.expo.dev) started rejecting ALL sdkVersion values in
 *   the `publishUpdateGroups` GraphQL mutation on 2026-05-01 between 03:00 and
 *   05:00 UTC. This is a server-side regression:
 *
 *   Tested values (all rejected with VALIDATION_ERROR / errorType "USER"):
 *     - 51.0.0  (request 81e06f09-f559-4220-9f72-ce4767c7295b)
 *     - 54.0.0  (request 1d869dd1-53f5-49b9-9fa8-e5bd7cb775c6)
 *   Deleting sdkVersion from extra.expoClient entirely → UNEXPECTED_ERROR
 *     (request 56483ad5-aead-43c2-958a-616572027101, server null-pointer bug)
 *
 *   The last SUCCESSFUL OTA push at 03:00 UTC (by GitHub App robot) used
 *   sdkVersion "54.0.0" — identical to what we now send. EAS changed
 *   behaviour between those two timepoints.
 *
 *   STATUS: Blocked on EAS platform fix. Contact Expo support with the
 *   request IDs above. The GitHub App integration may bypass this validation.
 *
 * PATCHES APPLIED:
 *   1. publish.js — verbose debug logging of the manifest sent to EAS
 *   2. client.js  — verbose GraphQL error logging ([EAS-DEBUG] prefix)
 */
const fs = require('fs');
const path = require('path');

const PUBLISH_TARGET = path.resolve(process.cwd(), 'node_modules/eas-cli/build/project/publish.js');
const CLIENT_TARGET = path.resolve(process.cwd(), 'node_modules/eas-cli/build/graphql/client.js');

// ── Patch 1: publish.js — restore original expoClient (no sdkVersion override)
// The sdkVersion override is no longer attempted because ALL values are rejected.
// The original `expoClient: exp` sends sdkVersion: "54.0.0" (from expo package).
if (!fs.existsSync(PUBLISH_TARGET)) {
  console.warn('[apply-patches] eas-cli publish.js not found — skipping');
} else {
  const src = fs.readFileSync(PUBLISH_TARGET, 'utf8');

  const ORIGINAL = `            extra: {
                expoClient: exp,
            },`;

  // Remove any previous patch (sdkVersion override or delete)
  const prevPatch = /expoClient: \(function\(e\).*?\}\)\(exp\),/;
  if (prevPatch.test(src)) {
    const cleaned = src.replace(prevPatch, 'expoClient: exp,');
    fs.writeFileSync(PUBLISH_TARGET, cleaned, 'utf8');
    console.log('[apply-patches] publish.js — removed stale sdkVersion patch (restored original)');
  } else if (src.includes(ORIGINAL)) {
    console.log('[apply-patches] publish.js already in original state — nothing to do');
  } else {
    console.warn('[apply-patches] publish.js — could not find known patch target, manual review needed');
  }
}

// ── Patch 2: client.js verbose GraphQL error logging ───────────────────────
if (!fs.existsSync(CLIENT_TARGET)) {
  console.warn('[apply-patches] eas-cli client.js not found — skipping');
} else {
  const src = fs.readFileSync(CLIENT_TARGET, 'utf8');

  const DEBUG_MARKER = '[EAS-DEBUG]';
  if (src.includes(DEBUG_MARKER)) {
    console.log('[apply-patches] client.js debug patch already applied — nothing to do');
  } else {
    const ORIGINAL_CLIENT = `    if (error) {
        if (error.graphQLErrors.some(e => e?.extensions?.isTransient &&`;
    const PATCHED_CLIENT = `    if (error) {
        process.stderr.write('[EAS-DEBUG] GraphQL error details:\\n');
        if (error.graphQLErrors && error.graphQLErrors.length > 0) {
            error.graphQLErrors.forEach((e, i) => {
                process.stderr.write('[EAS-DEBUG] Error[' + i + ']: ' + JSON.stringify({message: e.message, extensions: e.extensions, path: e.path}, null, 2) + '\\n');
            });
        }
        if (error.networkError) {
            process.stderr.write('[EAS-DEBUG] Network error: ' + JSON.stringify(error.networkError) + '\\n');
        }
        if (error.graphQLErrors.some(e => e?.extensions?.isTransient &&`;
    if (src.includes(ORIGINAL_CLIENT)) {
      const patched = src.replace(ORIGINAL_CLIENT, PATCHED_CLIENT);
      fs.writeFileSync(CLIENT_TARGET, patched, 'utf8');
      console.log('[apply-patches] client.js verbose error logging applied');
    } else {
      console.warn('[apply-patches] Could not find patch target in client.js — skipping');
    }
  }
}
