const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"'`=/]/g, (char) => ESCAPE_MAP[char] || char);
}

export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  return escapeHtml(trimmed);
}

export function sanitizeText(input: unknown, maxLength: number = 10000): string {
  const sanitized = sanitizeString(input);
  return sanitized.slice(0, maxLength);
}

export function stripControlCharacters(input: string): string {
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function sanitizeFreeText(input: unknown, maxLength: number = 10000): string {
  if (typeof input !== 'string') return '';
  const stripped = stripControlCharacters(input.trim());
  return escapeHtml(stripped).slice(0, maxLength);
}

export function sanitizeNote(input: unknown): string {
  return sanitizeFreeText(input, 5000);
}

export function sanitizeMessage(input: unknown): string {
  return sanitizeFreeText(input, 2000);
}

export function sanitizeTemplateName(input: unknown): string {
  return sanitizeFreeText(input, 100);
}

export function sanitizeTemplateContent(input: unknown): string {
  return sanitizeFreeText(input, 10000);
}

export function sanitizeNotificationContent(input: unknown): string {
  return sanitizeFreeText(input, 1000);
}
