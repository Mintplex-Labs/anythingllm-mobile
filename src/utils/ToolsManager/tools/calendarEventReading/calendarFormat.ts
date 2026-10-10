import moment from 'moment';

/** Allowed values for `search` in the tool input. */
export const ALLOWED_SEARCH_VALUES = [
    'today',
    'tomorrow',
    'this week',
    'next week',
    'this month',
    'next month',
    'specific date',
] as const;
export type SearchType = (typeof ALLOWED_SEARCH_VALUES)[number];

/** Parsed and validated input; `error` is non-empty when the input is bad. */
export interface ParsedArgs {
    search: SearchType;
    specificDate?: string;
    error: string;
}

/** A validated date range as ISO strings (local midnight boundaries). */
export interface DateRange {
    startDate: string;
    endDate: string;
}

/** Validate and normalise the tool input.

    - `search` must be one of the allowed values.
    - `specificDate` is trimmed to 10 characters (YYYY-MM-DD) before validation.
    - `{ specificDate }` alone (no `search`) infers `search: 'specific date'`.
    - Empty `search` defaults to `'today'`.
    - Whitespace-only or non-string `specificDate` is treated as absent.
*/
export function parseArgs(raw: unknown): ParsedArgs {
    let obj: Record<string, unknown>;

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) {
                return { search: 'today', error: '' };
            }
            obj = parsed;
        } catch {
            return { search: 'today', error: 'Invalid input format.' };
        }
    } else if (typeof raw === 'object' && raw !== null) {
        obj = raw as Record<string, unknown>;
    } else {
        return { search: 'today', error: '' };
    }

    const searchRaw = obj.search;

    // Normalize: string → trim + lowercase; null/undefined → ''
    let search: string;
    if (searchRaw === null || searchRaw === undefined) {
        search = '';
    } else if (typeof searchRaw === 'string') {
        search = searchRaw.trim().toLowerCase();
    } else {
        // Non-string, non-null (e.g. 5) — error, never throws.
        return { search: 'today', error: `Unknown search value '${searchRaw}'.` };
    }

    let specificDate: string | undefined;

    if (typeof obj.specificDate === 'string') {
        specificDate = obj.specificDate.trim().slice(0, 10);
        if (specificDate === '') { specificDate = undefined; }
    }

    // `{ specificDate }` alone infers 'specific date'.
    if (search === '' && specificDate !== undefined) {
        search = 'specific date';
    }

    // Empty `search` defaults to 'today'.
    if (search === '') {
        search = 'today';
    }

    // Validate `search`.
    if (!ALLOWED_SEARCH_VALUES.includes(search as SearchType)) {
        return {
            search: 'today',
            error: `Unknown search value '${search}'. Allowed values: ${ALLOWED_SEARCH_VALUES.join(', ')}.`,
        };
    }

    // For 'specific date', the date is required.
    if (search === 'specific date') {
        if (!specificDate || !moment(specificDate, 'YYYY-MM-DD', true).isValid()) {
            return {
                search: 'specific date',
                specificDate: specificDate ?? '',
                error: 'specificDate is required when search is "specific date" and must be in YYYY-MM-DD format.',
            };
        }
    } else {
        // Non-specific-date searches ignore specificDate.
        specificDate = undefined;
    }

    return { search: search as SearchType, specificDate, error: '' };
}

/** Compute a date range from a search type and optional specificDate.

    The range spans local midnight-to-midnight (start inclusive, end inclusive
    via 23:59:59.999).
*/
export function getDateRange(search: SearchType, specificDate?: string): DateRange {
    const base = moment();

    switch (search) {
        case 'today':
            return {
                startDate: base.clone().startOf('day').toISOString(),
                endDate: base.clone().endOf('day').toISOString(),
            };
        case 'tomorrow':
            return {
                startDate: base.clone().add(1, 'day').startOf('day').toISOString(),
                endDate: base.clone().add(1, 'day').endOf('day').toISOString(),
            };
        case 'this week':
            return {
                startDate: base.clone().startOf('week').toISOString(),
                endDate: base.clone().endOf('week').toISOString(),
            };
        case 'next week':
            return {
                startDate: base.clone().add(1, 'week').startOf('week').toISOString(),
                endDate: base.clone().add(1, 'week').endOf('week').toISOString(),
            };
        case 'this month':
            return {
                startDate: base.clone().startOf('month').toISOString(),
                endDate: base.clone().endOf('month').toISOString(),
            };
        case 'next month':
            return {
                startDate: base.clone().add(1, 'month').startOf('month').toISOString(),
                endDate: base.clone().add(1, 'month').endOf('month').toISOString(),
            };
        case 'specific date': {
            const day = moment(specificDate, 'YYYY-MM-DD', true);
            if (!specificDate || !day.isValid()) {
                return {
                    startDate: base.clone().startOf('day').toISOString(),
                    endDate: base.clone().endOf('day').toISOString(),
                };
            }
            return {
                startDate: day.startOf('day').toISOString(),
                endDate: day.endOf('day').toISOString(),
            };
        }
        default:
            return {
                startDate: base.clone().startOf('day').toISOString(),
                endDate: base.clone().endOf('day').toISOString(),
            };
    }
}

// ---------------------------------------------------------------------------
// All-day helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a date value falls exactly at UTC midnight.
 *
 * Assumption: the library returns all-day events as UTC midnight to the
 * next UTC midnight (exclusive end).  We take the calendar date from the
 * raw UTC fields when the start is exactly T00:00:00.000Z; otherwise
 * we fall back to local dates.
 *
 * TODO: verify on device whether all-day events really come as UTC
 * midnight boundaries.
 */
export function startsAtUtcMidnight(date: Date | string): boolean {
    const startUtc = moment.utc(date);
    return startUtc.hour() === 0 && startUtc.minute() === 0 && startUtc.second() === 0 && startUtc.millisecond() === 0;
}

/**
 * Get the YYYY-MM-DD range for an all-day event.
 *
 * Unverified on device — needs device verification to confirm
 * that all-day events come as UTC-midnight boundaries.
 */
export function getAllDayRange(eventStartDate: Date | string, eventEndDate: Date | string): { startDay: string; endDay: string } {
    const parse = (d: Date | string) =>
        startsAtUtcMidnight(eventStartDate) ? moment.utc(d) : moment(d);
    const s = parse(eventStartDate);
    const e = parse(eventEndDate);
    const last = e.isAfter(s) ? e.clone().subtract(1, 'ms') : s;
    return { startDay: s.format('YYYY-MM-DD'), endDay: last.format('YYYY-MM-DD') };
}

export function allDayEventsOverlap(
    eventStartDate: Date | string,
    eventEndDate: Date | string,
    queryStart: string,
    queryEnd: string,
): boolean {
    const { startDay, endDay } = getAllDayRange(eventStartDate, eventEndDate);
    // Derive local dates from the ISO strings.
    const qStart = moment(queryStart).format('YYYY-MM-DD');
    const qEnd = moment(queryEnd).format('YYYY-MM-DD');
    return startDay <= qEnd && endDay >= qStart;
}

interface SortableEvent {
    startDate: Date | string;
    endDate?: Date | string | null;
    title: string;
    allDay?: boolean;
}

/** Sort key for an event.  All-day events sort at 00:00 of their day;
    timed events sort by their actual local start time; ties break by title. */
interface SortKey {
    dateStr: string;   // YYYY-MM-DD
    timeMs: number;    // 0 for all-day, millis for timed
    title: string;
}

function computeSortKey(event: SortableEvent): SortKey {
    if (event.allDay === true) {
        const { startDay } = getAllDayRange(event.startDate, event.endDate ?? event.startDate);
        return { dateStr: startDay, timeMs: 0, title: event.title };
    }
    const localStart = moment(event.startDate);
    return {
        dateStr: localStart.format('YYYY-MM-DD'),
        timeMs: localStart.valueOf(),
        title: event.title,
    };
}

export function sortEventsByDate<T extends SortableEvent>(events: T[]): T[] {
    return [...events].sort((a, b) => {
        const ka = computeSortKey(a);
        const kb = computeSortKey(b);
        if (ka.dateStr !== kb.dateStr) return ka.dateStr < kb.dateStr ? -1 : 1;
        if (ka.timeMs !== kb.timeMs) return ka.timeMs - kb.timeMs;
        return ka.title.localeCompare(kb.title);
    });
}

export function formatDuration(minutes: number): string {
    if (minutes < 0) minutes = 0;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    const parts: string[] = [];
    if (hours > 0) {
        parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    if (mins > 0) {
        parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
    }
    return parts.join(' and ') || '0 minutes';
}

/**
 * Format a timed event as a readable line.
 *
 * Three cases:
 *   - Normal: "Title — Tuesday, October 13, 2026, 4:00 PM to 6:15 PM for 2 hours and 15 minutes"
 *   - No endDate: "Title — Tuesday, October 13, 2026, 4:00 PM, end time not set"
 *   - End <= start: "Title — Tuesday, October 13, 2026, 4:00 PM"  (no duration, no "end time not set")
 *
 * Location is appended with a comma prefix: ", at Home".
 */
export function formatTimedEvent(
    title: string,
    startDate: Date | string,
    endDate: Date | string | null | undefined,
    location?: string,
): string {
    title = title || 'Untitled';
    const startFormatted = moment(startDate).format('dddd, MMMM D, YYYY');
    const startTime = moment(startDate).format('h:mm A');

    const startMs = moment(startDate).valueOf();
    let line: string;

    if (!endDate) {
        // No end — show date, start time, and the "not set" marker.
        line = `${title} — ${startFormatted}, ${startTime}, end time not set`;
    } else {
        const endMs = moment(endDate).valueOf();
        if (endMs <= startMs) {
            // End <= start: just date and start time, no duration text.
            line = `${title} — ${startFormatted}, ${startTime}`;
        } else {
            const endTime = moment(endDate).format('h:mm A');
            const duration = formatDuration(Math.round((endMs - startMs) / 60000));
            const sameDay = moment(startDate).isSame(endDate, 'day');

            if (sameDay) {
                line = `${title} — ${startFormatted}, ${startTime} to ${endTime} for ${duration}`;
            } else {
                const endFormatted = moment(endDate).format('dddd, MMMM D, YYYY');
                line = `${title} — ${startFormatted}, ${startTime} to ${endFormatted}, ${endTime} for ${duration}`;
            }
        }
    }

    if (location) {
        line += `, at ${location}`;
    }

    return line;
}

/**
 * Format an all-day event.
 *
 * Single day: "Holiday — Tuesday, October 13, 2026, all day"
 * Multi-day:  "Trip — Tuesday, October 13, 2026 to Thursday, October 15, 2026, all day"
 *
 * Location is appended with a comma prefix: ", at Home".
 */
export function formatAllDayEvent(
    title: string,
    startDate: Date | string,
    endDate: Date | string | null | undefined,
    location?: string,
): string {
    title = title || 'Untitled';
    const { startDay, endDay } = getAllDayRange(startDate, endDate ?? startDate);

    // Use the day strings directly for full date formatting.
    const startFormatted = moment(startDay, 'YYYY-MM-DD').format('dddd, MMMM D, YYYY');
    const endFormatted = endDay !== startDay
        ? moment(endDay, 'YYYY-MM-DD').format('dddd, MMMM D, YYYY')
        : '';

    const datePart = endFormatted ? `${startFormatted} to ${endFormatted}` : startFormatted;

    let line = `${title} — ${datePart}, all day`;
    if (location) {
        line += `, at ${location}`;
    }

    return line;
}
