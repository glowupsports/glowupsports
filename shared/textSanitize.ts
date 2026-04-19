// Invisible/zero-width Unicode characters that can sneak into copy-pasted
// names and break things like initials extraction or visible labels.
// U+200B ZERO WIDTH SPACE
// U+200C ZERO WIDTH NON-JOINER
// U+200D ZERO WIDTH JOINER
// U+2060 WORD JOINER
// U+FEFF ZERO WIDTH NO-BREAK SPACE / BOM
// U+00AD SOFT HYPHEN
// U+180E MONGOLIAN VOWEL SEPARATOR
// U+200E LEFT-TO-RIGHT MARK
// U+200F RIGHT-TO-LEFT MARK
const INVISIBLE_CHARS_RE = /[\u200B-\u200F\u2060\uFEFF\u00AD\u180E]/g;
const LEADING_INVISIBLE_RE = /^[\s\u200B-\u200F\u2060\uFEFF\u00AD\u180E]+/;
const TRAILING_INVISIBLE_RE = /[\s\u200B-\u200F\u2060\uFEFF\u00AD\u180E]+$/;

/**
 * Removes invisible characters from anywhere in the string. Use this for
 * derived/display values (e.g. computing initials) where interior invisibles
 * would still cause incorrect rendering.
 *
 * IMPORTANT: do NOT use this on persisted name fields — interior characters
 * like ZWJ/ZWNJ can be semantically meaningful in some scripts.
 */
export function stripInvisibleChars(input: string): string {
  return input.replace(INVISIBLE_CHARS_RE, "");
}

/**
 * Sanitize a human-facing name field for persistence: strips invisible
 * Unicode characters and normal whitespace ONLY from the start and end of the
 * string, preserving interior characters (which may be meaningful in some
 * scripts, e.g. ZWJ in Indic/Arabic text). Returns the trimmed string, which
 * may be empty if the entire input was invisible/whitespace.
 */
export function sanitizeName(input: string): string {
  return input.replace(LEADING_INVISIBLE_RE, "").replace(TRAILING_INVISIBLE_RE, "");
}
