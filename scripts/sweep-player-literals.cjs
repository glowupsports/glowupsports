#!/usr/bin/env node
/* One-off codemod: replace hardcoded dark-era color literals throughout
 * client/player/** with mutable theme tokens (Backgrounds.*, TextColors.*,
 * GlowColors.*) so they flip when applyPlayerScheme runs.
 *
 * Also rewrites per-file `const ProTennisColors = { ... }` palette objects
 * into proxied palettes that read from the live theme tokens.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "client", "player");

// Hex literal → token mapping. Keys are matched case-insensitively.
const HEX_MAP = {
  // Backgrounds
  "#0B0D10": "Backgrounds.root",
  "#0a0f1a": "Backgrounds.root",
  "#0F141B": "Backgrounds.root",
  "#090E17": "Backgrounds.root",
  "#0a0a0a": "Backgrounds.root",
  "#000000": "Backgrounds.root",
  "#11141A": "Backgrounds.card",
  "#141820": "Backgrounds.card",
  "#171B22": "Backgrounds.elevated",
  "#1A1F2A": "Backgrounds.elevated",
  "#1a2235": "Backgrounds.elevated",
  "#1F2430": "Backgrounds.surface",
  "#2A2E38": "Backgrounds.surface",
  // Text
  "#FFFFFF": "TextColors.primary",
  "#A0A4B0": "TextColors.secondary",
  "#B8BCC6": "TextColors.secondary",
  "#7C8290": "TextColors.muted",
  "#6B7280": "TextColors.muted",
  // Accent
  "#CCFF00": "GlowColors.primary",
  "#C8FF3D": "GlowColors.primary",
};

// Build a normalized lookup keyed by lowercase hex.
const NORM = {};
for (const [k, v] of Object.entries(HEX_MAP)) NORM[k.toLowerCase()] = v;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function replaceLiterals(src) {
  const usedTokens = new Set();
  // Match either '#xxxxxx' or "#xxxxxx" exact length 7 (3-byte hex).
  src = src.replace(/(['"])(#[0-9a-fA-F]{6})\1/g, (full, q, hex) => {
    const tok = NORM[hex.toLowerCase()];
    if (!tok) return full;
    usedTokens.add(tok.split(".")[0]);
    return tok;
  });
  return { src, usedTokens };
}

function rewriteProTennisColors(src) {
  // Replace `const ProTennisColors = { ...literal mapping... };` with a Proxy
  // that resolves each name to a live theme token at access time.
  const re = /const\s+ProTennisColors\s*=\s*\{[\s\S]*?\n\};/m;
  if (!re.test(src)) return { src, changed: false };
  const replacement = `const ProTennisColors = new Proxy({} as Record<string, string>, {
  get(_t, prop: string) {
    switch (prop) {
      case "midnightBlue": return Backgrounds.root;
      case "surfaceCard": return Backgrounds.card;
      case "surfaceElevated": return Backgrounds.elevated;
      case "neonGreen": return GlowColors.primary;
      case "neonCyan": return "#00E5FF";
      case "neonPurple": return "#E040FB";
      case "white": return TextColors.primary;
      case "textSecondary": return TextColors.secondary;
      case "textMuted": return TextColors.muted;
      case "gold": return "#FFD700";
      case "border": return Backgrounds.surface;
      default: return undefined;
    }
  },
});`;
  return { src: src.replace(re, replacement), changed: true };
}

function ensureImports(src, tokens) {
  // tokens: set of "Backgrounds" | "TextColors" | "GlowColors"
  if (tokens.size === 0) return src;
  // Find existing import from theme.
  const themeImportRe = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["'](?:@\/constants\/theme|\.\.?\/[^"']*constants\/theme)["'];?/m;
  const m = themeImportRe.exec(src);
  if (m) {
    const existing = new Set(m[1].split(",").map(s => s.trim()).filter(Boolean));
    let added = false;
    for (const t of tokens) {
      if (!existing.has(t)) {
        existing.add(t);
        added = true;
      }
    }
    if (added) {
      const newImport = `import { ${Array.from(existing).join(", ")} } from "@/constants/theme";`;
      src = src.replace(themeImportRe, newImport);
    }
    return src;
  }
  // No existing theme import — add one after the last import.
  const importRe = /^(import[\s\S]*?from\s+["'][^"']+["'];?)\s*$/gm;
  let lastImportEnd = 0;
  let im;
  while ((im = importRe.exec(src)) !== null) {
    lastImportEnd = im.index + im[0].length;
  }
  const newImport = `import { ${Array.from(tokens).join(", ")} } from "@/constants/theme";`;
  if (lastImportEnd > 0) {
    src = src.slice(0, lastImportEnd) + "\n" + newImport + src.slice(lastImportEnd);
  } else {
    src = newImport + "\n" + src;
  }
  return src;
}

let changed = 0;
let total = 0;
for (const file of walk(ROOT)) {
  total++;
  const orig = fs.readFileSync(file, "utf8");
  let src = orig;
  const { src: src1, usedTokens } = replaceLiterals(src);
  src = src1;
  const { src: src2, changed: ptcChanged } = rewriteProTennisColors(src);
  src = src2;
  if (ptcChanged) {
    usedTokens.add("Backgrounds");
    usedTokens.add("TextColors");
    usedTokens.add("GlowColors");
  }
  src = ensureImports(src, usedTokens);
  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
  }
}
console.log(`Updated ${changed} / ${total} files.`);
