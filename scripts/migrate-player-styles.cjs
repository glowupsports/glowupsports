#!/usr/bin/env node
/* One-off codemod: wrap every `const styles = StyleSheet.create({...})` in
 * client/player/** with makeReactiveStyles so colors are resolved at render
 * time against the active player scheme. Adds the import if missing.
 *
 * NOTE: scripts/ is excluded from runtime per project rules; this file is
 * intentionally outside scripts/ would-be-protected paths — it lives at
 * the repo's scripts/ helper folder for one-off use only.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "client", "player");
const HOOK_IMPORT = `import { makeReactiveStyles } from "@/hooks/useThemedStyles";`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function findMatchingClose(src, openIdx) {
  // openIdx is the index of the '(' after StyleSheet.create
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function migrate(file) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("makeReactiveStyles(")) return false;

  const re = /const\s+(\w+)\s*=\s*StyleSheet\.create\s*\(/g;
  const matches = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const openParen = re.lastIndex - 1;
    const closeParen = findMatchingClose(src, openParen);
    if (closeParen === -1) return false;
    matches.push({ start: m.index, openParen, closeParen, varName: m[1] });
  }
  if (matches.length === 0) return false;

  // Apply replacements from the end so indices stay valid.
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, openParen, closeParen, varName } = matches[i];
    const before = src.slice(0, start);
    const between = src.slice(start, openParen + 1);
    const inner = src.slice(openParen + 1, closeParen);
    const after = src.slice(closeParen + 1);
    const newDecl = `const ${varName} = makeReactiveStyles(() => StyleSheet.create(${inner}))`;
    src = before + newDecl + after;
  }

  // Add the import if not present.
  if (!src.includes(HOOK_IMPORT)) {
    // Insert after the last import line.
    const importRe = /^(import[\s\S]*?from\s+["'][^"']+["'];?)\s*$/gm;
    let lastImportEnd = 0;
    let im;
    while ((im = importRe.exec(src)) !== null) {
      lastImportEnd = im.index + im[0].length;
    }
    if (lastImportEnd > 0) {
      src = src.slice(0, lastImportEnd) + "\n" + HOOK_IMPORT + src.slice(lastImportEnd);
    } else {
      src = HOOK_IMPORT + "\n" + src;
    }
  }

  fs.writeFileSync(file, src);
  return true;
}

const files = walk(ROOT);
let migrated = 0;
let total = 0;
for (const f of files) {
  total++;
  try {
    if (migrate(f)) migrated++;
  } catch (e) {
    console.error("FAILED", f, e.message);
  }
}
console.log(`Migrated ${migrated} / ${total} files.`);
