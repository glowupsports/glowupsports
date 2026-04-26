import { describe, it, expect } from 'vitest';
import { parseCalendarDateParts } from '../../client/lib/dateUtils';

describe('parseCalendarDateParts', () => {
  it('parses a strict YYYY-MM-DD string into local-calendar parts', () => {
    expect(parseCalendarDateParts('2026-04-26')).toEqual({
      year: 2026,
      month: 4,
      day: 26,
    });
  });

  it('parses an ISO timestamp using the viewer\'s local calendar (matches new Date(...).getDate())', () => {
    const iso = '2026-04-25T22:00:00.000Z';
    const parts = parseCalendarDateParts(iso);
    const d = new Date(iso);
    expect(parts).toEqual({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    });
  });

  it('does NOT silently truncate the YYYY-MM-DD prefix of a longer ISO string', () => {
    // For an ISO that crosses local midnight, falling back to a Date-based
    // parse must NOT just return {2026,4,25} for every viewer.
    const iso = '2026-04-25T22:00:00.000Z';
    const d = new Date(iso);
    const parts = parseCalendarDateParts(iso);
    expect(parts?.day).toBe(d.getDate());
    expect(parts?.month).toBe(d.getMonth() + 1);
    expect(parts?.year).toBe(d.getFullYear());
  });

  it('returns null for empty / nullish input', () => {
    expect(parseCalendarDateParts('')).toBeNull();
    expect(parseCalendarDateParts(null)).toBeNull();
    expect(parseCalendarDateParts(undefined)).toBeNull();
  });

  it('returns null for clearly unparseable input', () => {
    expect(parseCalendarDateParts('not-a-date')).toBeNull();
  });
});
