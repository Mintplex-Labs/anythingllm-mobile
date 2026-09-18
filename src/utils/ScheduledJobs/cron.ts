/**
 * Minimal 5-field cron support for scheduled jobs: validation, next-run computation and a
 * plain-language description. Everything is interpreted in the device's local time zone -
 * the phone is the only place a job ever runs, so unlike the desktop server there is no
 * UTC round trip.
 *
 * Supported field syntax (standard cron): `*`, `N`, `A-B`, `A,B,C`, `*​/S`, `A-B/S`.
 * Day-of-month and day-of-week combine the standard way: when both are restricted a date
 * matches if either does; when one is `*` only the other is checked. Sunday is 0 (7 is
 * accepted and folded to 0).
 *
 * The visual builder in the scheduled job form only ever produces a subset of this
 * (see `builderStateToCron` / `cronToBuilderState`), the custom mode accepts anything here.
 */

export type CronFields = {
    minute: Set<number>;
    hour: Set<number>;
    dayOfMonth: Set<number>;
    month: Set<number>;
    dayOfWeek: Set<number>;
    /** Whether the day-of-month field was `*` (affects dom/dow combination) */
    anyDayOfMonth: boolean;
    /** Whether the day-of-week field was `*` */
    anyDayOfWeek: boolean;
};

const FIELD_RANGES = {
    minute: [0, 59],
    hour: [0, 23],
    dayOfMonth: [1, 31],
    month: [1, 12],
    dayOfWeek: [0, 7],
} as const;

/** Farthest ahead `nextCronRun` searches before giving up (covers Feb 29 type schedules). */
const MAX_SEARCH_MS = 5 * 366 * 24 * 60 * 60 * 1000;

function parseField(raw: string, min: number, max: number): Set<number> | null {
    const values = new Set<number>();
    if (!raw) return null;
    for (const part of raw.split(',')) {
        if (!part) return null;
        const [rangePart, stepPart] = part.split('/');
        if (stepPart !== undefined && !/^\d+$/.test(stepPart)) return null;
        const step = stepPart !== undefined ? parseInt(stepPart, 10) : 1;
        if (step < 1) return null;

        let start: number;
        let end: number;
        if (rangePart === '*') {
            start = min;
            end = max;
        } else if (/^\d+$/.test(rangePart)) {
            start = parseInt(rangePart, 10);
            // `N/S` means "starting at N, every S" (vixie cron extension)
            end = stepPart !== undefined ? max : start;
        } else if (/^\d+-\d+$/.test(rangePart)) {
            const [a, b] = rangePart.split('-').map((n) => parseInt(n, 10));
            start = a;
            end = b;
        } else {
            return null;
        }
        if (start < min || end > max || start > end) return null;
        for (let value = start; value <= end; value += step) values.add(value);
    }
    return values.size ? values : null;
}

/** Parses a 5-field cron expression, or returns null when it is not valid. */
export function parseCron(expression: string): CronFields | null {
    if (typeof expression !== 'string') return null;
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;

    const minute = parseField(minuteRaw, ...FIELD_RANGES.minute);
    const hour = parseField(hourRaw, ...FIELD_RANGES.hour);
    const dayOfMonth = parseField(domRaw, ...FIELD_RANGES.dayOfMonth);
    const month = parseField(monthRaw, ...FIELD_RANGES.month);
    const dayOfWeekRaw = parseField(dowRaw, ...FIELD_RANGES.dayOfWeek);
    if (!minute || !hour || !dayOfMonth || !month || !dayOfWeekRaw) return null;

    // 7 is an alias for Sunday
    const dayOfWeek = new Set<number>();
    dayOfWeekRaw.forEach((day) => dayOfWeek.add(day % 7));

    return {
        minute,
        hour,
        dayOfMonth,
        month,
        dayOfWeek,
        anyDayOfMonth: domRaw === '*',
        anyDayOfWeek: dowRaw === '*',
    };
}

export function isValidCron(expression: string): boolean {
    return parseCron(expression) !== null;
}

function dateMatchesDay(fields: CronFields, date: Date): boolean {
    const domMatch = fields.dayOfMonth.has(date.getDate());
    const dowMatch = fields.dayOfWeek.has(date.getDay());
    if (fields.anyDayOfMonth && fields.anyDayOfWeek) return true;
    if (fields.anyDayOfMonth) return dowMatch;
    if (fields.anyDayOfWeek) return domMatch;
    return domMatch || dowMatch;
}

/**
 * The first time strictly after `from` that the expression fires, in local time.
 * Returns null for an invalid expression or when nothing matches within a few years.
 */
export function nextCronRun(expression: string, from: Date | number = Date.now()): Date | null {
    const fields = parseCron(expression);
    if (!fields) return null;

    const start = new Date(typeof from === 'number' ? from : from.getTime());
    const limit = start.getTime() + MAX_SEARCH_MS;
    // Cron resolution is one minute - begin at the next whole minute.
    const cursor = new Date(start.getTime());
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    while (cursor.getTime() <= limit) {
        if (!fields.month.has(cursor.getMonth() + 1)) {
            // Jump to the first minute of the next month
            cursor.setMonth(cursor.getMonth() + 1, 1);
            cursor.setHours(0, 0, 0, 0);
            continue;
        }
        if (!dateMatchesDay(fields, cursor)) {
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
            continue;
        }
        if (!fields.hour.has(cursor.getHours())) {
            cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
            continue;
        }
        if (!fields.minute.has(cursor.getMinutes())) {
            cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
            continue;
        }
        return cursor;
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// Visual builder <-> cron
// ---------------------------------------------------------------------------------------------

export type BuilderFrequency = 'minute' | 'hour' | 'day' | 'week' | 'month';

export type BuilderState = {
    frequency: BuilderFrequency;
    /** `minute` frequency: run every N minutes */
    minuteInterval: number;
    /** `hour` frequency: minute past every hour */
    hourMinuteOffset: number;
    /** `day` / `week` / `month`: local time of day */
    hour: number;
    minute: number;
    /** `week`: 0 = Sunday ... 6 = Saturday */
    weekdays: number[];
    /** `month`: 1-31 */
    dayOfMonth: number;
};

export const MINUTE_INTERVALS = [5, 10, 15, 20, 30] as const;

export const DEFAULT_BUILDER_STATE: BuilderState = {
    frequency: 'day',
    minuteInterval: 30,
    hourMinuteOffset: 0,
    hour: 9,
    minute: 0,
    weekdays: [1],
    dayOfMonth: 1,
};

/** The cron the form starts from: every day at 9:00 local time. */
export const DEFAULT_CRON = builderStateToCron(DEFAULT_BUILDER_STATE);

export function builderStateToCron(state: BuilderState): string {
    switch (state.frequency) {
        case 'minute': {
            const n = Math.max(1, Math.floor(state.minuteInterval || 1));
            return n === 1 ? '* * * * *' : `*/${n} * * * *`;
        }
        case 'hour':
            return `${state.hourMinuteOffset} * * * *`;
        case 'day':
            return `${state.minute} ${state.hour} * * *`;
        case 'week': {
            const days = [...new Set(state.weekdays.length ? state.weekdays : [1])].sort((a, b) => a - b).join(',');
            return `${state.minute} ${state.hour} * * ${days}`;
        }
        case 'month':
            return `${state.minute} ${state.hour} ${state.dayOfMonth} * *`;
        default:
            return `${DEFAULT_BUILDER_STATE.minute} ${DEFAULT_BUILDER_STATE.hour} * * *`;
    }
}

/**
 * Reverse of `builderStateToCron`. `matched` is false when the expression uses syntax the
 * builder cannot show, in which case the default state is returned and the form should stay
 * in custom (cron) mode.
 */
export function cronToBuilderState(expression: string): { state: BuilderState; matched: boolean } {
    const fallback = { state: { ...DEFAULT_BUILDER_STATE }, matched: false };
    if (!isValidCron(expression)) return fallback;
    const [m, h, dom, mon, dow] = expression.trim().split(/\s+/);
    if (mon !== '*') return fallback;
    const isNumber = (value: string) => /^\d+$/.test(value);

    if (m === '*' && h === '*' && dom === '*' && dow === '*') {
        return { state: { ...DEFAULT_BUILDER_STATE, frequency: 'minute', minuteInterval: 1 }, matched: true };
    }
    const step = m.match(/^\*\/(\d+)$/);
    if (step && h === '*' && dom === '*' && dow === '*') {
        return { state: { ...DEFAULT_BUILDER_STATE, frequency: 'minute', minuteInterval: parseInt(step[1], 10) }, matched: true };
    }
    if (isNumber(m) && h === '*' && dom === '*' && dow === '*') {
        return { state: { ...DEFAULT_BUILDER_STATE, frequency: 'hour', hourMinuteOffset: parseInt(m, 10) }, matched: true };
    }
    if (isNumber(m) && isNumber(h) && dom === '*' && dow === '*') {
        return { state: { ...DEFAULT_BUILDER_STATE, frequency: 'day', hour: parseInt(h, 10), minute: parseInt(m, 10) }, matched: true };
    }
    if (isNumber(m) && isNumber(h) && dom === '*' && /^\d+(,\d+)*$/.test(dow)) {
        const weekdays = [...new Set(dow.split(',').map((d) => parseInt(d, 10) % 7))].sort((a, b) => a - b);
        return { state: { ...DEFAULT_BUILDER_STATE, frequency: 'week', hour: parseInt(h, 10), minute: parseInt(m, 10), weekdays }, matched: true };
    }
    if (isNumber(m) && isNumber(h) && isNumber(dom) && dow === '*') {
        return { state: { ...DEFAULT_BUILDER_STATE, frequency: 'month', hour: parseInt(h, 10), minute: parseInt(m, 10), dayOfMonth: parseInt(dom, 10) }, matched: true };
    }
    return fallback;
}

// ---------------------------------------------------------------------------------------------
// Plain language
// ---------------------------------------------------------------------------------------------

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** `9:05 AM` style local time label */
export function formatTimeOfDay(hour: number, minute: number): string {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelveHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function ordinal(n: number): string {
    const rem10 = n % 10;
    const rem100 = n % 100;
    if (rem10 === 1 && rem100 !== 11) return `${n}st`;
    if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
    if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
    return `${n}th`;
}

function listWeekdays(days: number[]): string {
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    if (sorted.length === 7) return 'every day';
    if (sorted.join(',') === '1,2,3,4,5') return 'weekdays';
    if (sorted.join(',') === '0,6') return 'weekends';
    const names = sorted.map((d) => WEEKDAY_LONG[d]);
    if (names.length === 1) return `every ${names[0]}`;
    return `every ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Human readable schedule, eg: "Every day at 9:00 AM", "Weekdays at 6:30 PM",
 * "Every 15 minutes". Expressions the builder cannot express fall back to a
 * generic label with the raw cron so the user still sees what is stored.
 */
export function describeCron(expression: string): string {
    const { state, matched } = cronToBuilderState(expression);
    if (!matched) return isValidCron(expression) ? `Custom schedule (${expression.trim()})` : 'Invalid schedule';
    switch (state.frequency) {
        case 'minute':
            return state.minuteInterval === 1 ? 'Every minute' : `Every ${state.minuteInterval} minutes`;
        case 'hour':
            return state.hourMinuteOffset === 0 ? 'Every hour' : `Every hour at ${String(state.hourMinuteOffset).padStart(2, '0')} past`;
        case 'day':
            return `Every day at ${formatTimeOfDay(state.hour, state.minute)}`;
        case 'week': {
            const days = listWeekdays(state.weekdays);
            const label = days.charAt(0).toUpperCase() + days.slice(1);
            return `${label} at ${formatTimeOfDay(state.hour, state.minute)}`;
        }
        case 'month':
            return `On the ${ordinal(state.dayOfMonth)} of every month at ${formatTimeOfDay(state.hour, state.minute)}`;
        default:
            return expression;
    }
}
