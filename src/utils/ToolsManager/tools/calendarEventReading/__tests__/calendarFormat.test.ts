import moment from 'moment';
import {
    parseArgs,
    getDateRange,
    allDayEventsOverlap,
    sortEventsByDate,
    formatTimedEvent,
    formatAllDayEvent,
    formatDuration,
    getAllDayRange,
} from '../calendarFormat';

// Freeze the clock for deterministic date-range tests.
jest.useFakeTimers();
const NOW = moment('2026-09-30T10:00:00').valueOf();
beforeEach(() => jest.setSystemTime(NOW));

describe('parseArgs', () => {
    it('accepts { search: "specific date", specificDate }', () => {
        const result = parseArgs({ search: 'specific date', specificDate: '2026-10-13' });
        expect(result.error).toBe('');
        expect(result.search).toBe('specific date');
        expect(result.specificDate).toBe('2026-10-13');
    });

    it('infers specific date when only { specificDate } is given', () => {
        const result = parseArgs({ specificDate: '2026-10-20' });
        expect(result.error).toBe('');
        expect(result.search).toBe('specific date');
        expect(result.specificDate).toBe('2026-10-20');
    });

    it('defaults to today when args is empty object', () => {
        const result = parseArgs({});
        expect(result.error).toBe('');
        expect(result.search).toBe('today');
    });

    it('ignores specificDate when search is not "specific date"', () => {
        const result = parseArgs({ search: 'this week', specificDate: '2026-10-13' });
        expect(result.error).toBe('');
        expect(result.search).toBe('this week');
        expect(result.specificDate).toBeUndefined();
    });

    it('trims ISO timestamp to 10 characters', () => {
        const result = parseArgs({ search: 'specific date', specificDate: '2026-10-13T14:30:00Z' });
        expect(result.error).toBe('');
        expect(result.specificDate).toBe('2026-10-13');
    });

    it('trims whitespace before slicing', () => {
        const result = parseArgs({ search: 'specific date', specificDate: '  2026-10-13  ' });
        expect(result.error).toBe('');
        expect(result.specificDate).toBe('2026-10-13');
    });

    it('returns error for invalid search', () => {
        const result = parseArgs({ search: 'yesterday' });
        expect(result.error).toContain('Unknown search value');
        expect(result.error).toContain('today');
    });

    it('accepts lowercase "today"', () => {
        const result = parseArgs({ search: 'today' });
        expect(result.error).toBe('');
        expect(result.search).toBe('today');
    });

    it('accepts mixed-case "TODAY" → "today"', () => {
        const result = parseArgs({ search: 'TODAY' });
        expect(result.error).toBe('');
        expect(result.search).toBe('today');
    });

    it('{ search: "specific date" } without date returns error', () => {
        const result = parseArgs({ search: 'specific date' });
        expect(result.error).toContain('specificDate is required');
    });

    it('{ search: "specific date", specificDate: "not-a-date" } returns error', () => {
        const result = parseArgs({ search: 'specific date', specificDate: 'not-a-date' });
        expect(result.error).toContain('YYYY-MM-DD');
    });

    it('treats empty specificDate as absent (defaults to today)', () => {
        const result = parseArgs({ specificDate: '' });
        expect(result.error).toBe('');
        expect(result.search).toBe('today');
        expect(result.specificDate).toBeUndefined();
    });

    it('treats whitespace-only specificDate as absent', () => {
        const result = parseArgs({ specificDate: '   ' });
        expect(result.search).toBe('today');
    });

    it('treats non-string specificDate as absent', () => {
        const result = parseArgs({ specificDate: 42 });
        expect(result.search).toBe('today');
    });

    it('handles JSON string input', () => {
        const result = parseArgs('{"search":"specific date","specificDate":"2026-11-01"}');
        expect(result.error).toBe('');
        expect(result.search).toBe('specific date');
    });

    it('handles JSON null/number (not an object)', () => {
        const result1 = parseArgs('null');
        const result2 = parseArgs('42');
        expect(result1.search).toBe('today');
        expect(result2.search).toBe('today');
    });

    it('handles malformed JSON', () => {
        const result = parseArgs('not json');
        expect(result.error).toBe('Invalid input format.');
    });

    it('{ search: " " } gives today', () => {
        const result = parseArgs({ search: ' ' });
        expect(result.error).toBe('');
        expect(result.search).toBe('today');
    });

    it('{ search: " ", specificDate: "2026-10-13" } gives specific date', () => {
        const result = parseArgs({ search: ' ', specificDate: '2026-10-13' });
        expect(result.error).toBe('');
        expect(result.search).toBe('specific date');
        expect(result.specificDate).toBe('2026-10-13');
    });

    it('{ search: 5 } returns an error', () => {
        const result = parseArgs({ search: 5 });
        expect(result.error).toContain('Unknown search value');
    });
});

describe('getDateRange', () => {
    function localDate(iso: string): string {
        return moment(iso).format('YYYY-MM-DD');
    }

    it('today returns local midnight to 23:59:59.999', () => {
        const range = getDateRange('today');
        expect(localDate(range.startDate)).toBe('2026-09-30');
        expect(localDate(range.endDate)).toBe('2026-09-30');
    });

    it('tomorrow is next day', () => {
        const range = getDateRange('tomorrow');
        expect(localDate(range.startDate)).toBe('2026-10-01');
        expect(localDate(range.endDate)).toBe('2026-10-01');
    });

    it('this week on a Saturday', () => {
        jest.setSystemTime(moment('2026-10-03T12:00:00').valueOf());
        const range = getDateRange('this week');
        expect(localDate(range.startDate)).toBe('2026-09-27');
        expect(localDate(range.endDate)).toBe('2026-10-03');
    });

    it('next month handles year rollover', () => {
        jest.setSystemTime(moment('2026-12-15T12:00:00').valueOf());
        const range = getDateRange('next month');
        expect(localDate(range.startDate)).toBe('2027-01-01');
        expect(localDate(range.endDate)).toBe('2027-01-31');
    });

    it('specific date spans local midnight to 23:59:59.999', () => {
        const range = getDateRange('specific date', '2026-10-13');
        expect(localDate(range.startDate)).toBe('2026-10-13');
        expect(localDate(range.endDate)).toBe('2026-10-13');
    });

    it('specific date with missing date returns today', () => {
        const range = getDateRange('specific date', undefined);
        expect(localDate(range.startDate)).toBe('2026-09-30');
        expect(localDate(range.endDate)).toBe('2026-09-30');
    });

    it('specific date with invalid date returns today', () => {
        const range = getDateRange('specific date', 'not-a-date');
        expect(localDate(range.startDate)).toBe('2026-09-30');
        expect(localDate(range.endDate)).toBe('2026-09-30');
    });

    it('unknown value (never) falls back to today', () => {
        const range = getDateRange('bogus' as never);
        expect(localDate(range.startDate)).toBe('2026-09-30');
        expect(localDate(range.endDate)).toBe('2026-09-30');
    });
});

describe('allDayEventsOverlap - timezone-independent', () => {
    it('query for Oct 13 includes only Oct 13 all-day events', () => {
        const range = getDateRange('specific date', '2026-10-13');
        const qStart = range.startDate;
        const qEnd = range.endDate;

        // Oct 12 all-day event should NOT overlap.
        expect(allDayEventsOverlap(
            new Date('2026-10-12T00:00:00.000Z'),
            new Date('2026-10-13T00:00:00.000Z'),
            qStart, qEnd,
        )).toBe(false);

        // Oct 13 all-day event SHOULD overlap.
        expect(allDayEventsOverlap(
            new Date('2026-10-13T00:00:00.000Z'),
            new Date('2026-10-14T00:00:00.000Z'),
            qStart, qEnd,
        )).toBe(true);

        // Oct 14 all-day event should NOT overlap.
        expect(allDayEventsOverlap(
            new Date('2026-10-14T00:00:00.000Z'),
            new Date('2026-10-15T00:00:00.000Z'),
            qStart, qEnd,
        )).toBe(false);
    });
});

describe('getAllDayRange', () => {
    it('UTC midnight to next UTC midnight gives one day', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const end = new Date('2026-10-14T00:00:00.000Z');
        const { startDay, endDay } = getAllDayRange(start, end);
        expect(startDay).toBe('2026-10-13');
        expect(endDay).toBe('2026-10-13');
    });

    it('UTC midnight to 23:59:59.999Z gives range', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const end = new Date('2026-10-15T23:59:59.999Z');
        const { startDay, endDay } = getAllDayRange(start, end);
        expect(startDay).toBe('2026-10-13');
        expect(endDay).toBe('2026-10-15');
    });

    it('equal start and end gives one day', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const { startDay, endDay } = getAllDayRange(start, start);
        expect(startDay).toBe('2026-10-13');
        expect(endDay).toBe('2026-10-13');
    });

    it('local-midnight shape (iOS): Oct 13 00:00 to Oct 14 00:00', () => {
        const start = moment('2026-10-13 00:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-14 00:00', 'YYYY-MM-DD HH:mm').toDate();
        const { startDay, endDay } = getAllDayRange(start, end);
        expect(startDay).toBe('2026-10-13');
        expect(endDay).toBe('2026-10-13');
    });

    it('local-midnight shape (iOS): Oct 13 00:00 to Oct 16 00:00', () => {
        const start = moment('2026-10-13 00:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-16 00:00', 'YYYY-MM-DD HH:mm').toDate();
        const { startDay, endDay } = getAllDayRange(start, end);
        expect(startDay).toBe('2026-10-13');
        expect(endDay).toBe('2026-10-15');
    });
});

describe('sortEventsByDate', () => {
    it('sorts across days', () => {
        const events = [
            { startDate: new Date('2026-10-15T10:00:00'), endDate: new Date('2026-10-15T11:00:00'), title: 'B' },
            { startDate: new Date('2026-10-13T10:00:00'), endDate: new Date('2026-10-13T11:00:00'), title: 'A' },
            { startDate: new Date('2026-10-14T10:00:00'), endDate: new Date('2026-10-14T11:00:00'), title: 'C' },
        ];
        const sorted = sortEventsByDate(events);
        expect(sorted[0].title).toBe('A');
        expect(sorted[1].title).toBe('C');
        expect(sorted[2].title).toBe('B');
    });

    it('all-day event on Oct 14 sorts after timed event on Oct 13', () => {
        const events = [
            {
                startDate: new Date('2026-10-14T00:00:00.000Z'),
                endDate: new Date('2026-10-15T00:00:00.000Z'),
                title: 'All-Day Oct 14',
                allDay: true,
            },
            {
                startDate: new Date('2026-10-13T16:00:00'),
                endDate: new Date('2026-10-13T17:00:00'),
                title: 'Timed Oct 13',
            },
        ];
        const sorted = sortEventsByDate(events);
        expect(sorted[0].title).toBe('Timed Oct 13');
        expect(sorted[1].title).toBe('All-Day Oct 14');
    });

    it('late-night timed event does not get treated as all-day', () => {
        // 2026-10-13T00:00Z is 8 PM Oct 12 in New York.
        const lateNight = new Date('2026-10-13T00:00:00.000Z');
        const localDay = moment(lateNight).format('YYYY-MM-DD');
        const evening = moment(`${localDay} 23:00`, 'YYYY-MM-DD HH:mm').toDate();
        const sorted = sortEventsByDate([
            { startDate: evening, endDate: evening, title: 'Evening' },
            { startDate: lateNight, endDate: lateNight, title: 'Late Night', allDay: false },
        ]);
        expect(sorted[0].title).toBe('Late Night');
    });

    it('ties by title', () => {
        const events = [
            { startDate: new Date('2026-10-13T16:00:00'), endDate: new Date('2026-10-13T17:00:00'), title: 'Zebra' },
            { startDate: new Date('2026-10-13T16:00:00'), endDate: new Date('2026-10-13T17:00:00'), title: 'Apple' },
        ];
        const sorted = sortEventsByDate(events);
        expect(sorted[0].title).toBe('Apple');
        expect(sorted[1].title).toBe('Zebra');
    });
});

describe('formatTimedEvent', () => {
    it('empty title falls back to "Untitled"', () => {
        const start = moment('2026-10-13 16:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 17:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('', start, end);
        expect(result).toBe('Untitled — Tuesday, October 13, 2026, 4:00 PM to 5:00 PM for 1 hour');
    });

    it('contains date, start, end, and duration', () => {
        const start = moment('2026-10-13 16:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 18:15', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Meeting', start, end);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).toContain('4:00 PM');
        expect(result).toContain('6:15 PM');
        expect(result).toContain('2 hours and 15 minutes');
    });

    it('no endDate shows date, time, and "end time not set"', () => {
        const start = moment('2026-10-13 16:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Meeting', start, null);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).toContain('4:00 PM');
        expect(result).toContain('end time not set');
    });

    it('end <= start shows date and start time only (no duration, no "end time not set")', () => {
        const start = moment('2026-10-13 16:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 15:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Meeting', start, end);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).toContain('4:00 PM');
        expect(result).not.toContain('end time not set');
        expect(result).not.toContain('for');
    });

    it('midnight-crossing gives the end its own date', () => {
        const start = moment('2026-10-13 23:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-14 00:30', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Late Call', start, end);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).toContain('Wednesday, October 14');
    });

    it('location appends with comma prefix ", at X"', () => {
        const start = moment('2026-10-13 16:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 17:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Meeting', start, end, 'Home');
        expect(result).toContain(', at Home');
    });

    it('no location adds no location text', () => {
        const start = moment('2026-10-13 16:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 17:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Meeting', start, end);
        expect(result).not.toContain(', at ');
        expect(result).not.toContain('online');
    });

    it('noon renders as 12:00 PM', () => {
        const start = moment('2026-10-13 12:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 13:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Lunch', start, end);
        expect(result).toContain('12:00 PM');
    });

    it('midnight renders as 12:00 AM', () => {
        const start = moment('2026-10-13 00:00', 'YYYY-MM-DD HH:mm').toDate();
        const end = moment('2026-10-13 01:00', 'YYYY-MM-DD HH:mm').toDate();
        const result = formatTimedEvent('Early Call', start, end);
        expect(result).toContain('12:00 AM');
    });
});

describe('formatAllDayEvent', () => {
    it('single day includes weekday and year', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const end = new Date('2026-10-14T00:00:00.000Z');
        const result = formatAllDayEvent('Holiday', start, end);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).toContain('all day');
    });

    it('multi-day shows range with weekdays and years', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const end = new Date('2026-10-16T00:00:00.000Z');
        const result = formatAllDayEvent('Trip', start, end);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).toContain('Thursday, October 15, 2026');
        expect(result).toContain('all day');
    });

    it('equal start/end shows same day (no "to" text)', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const result = formatAllDayEvent('Holiday', start, start);
        expect(result).toContain('Tuesday, October 13, 2026');
        expect(result).not.toContain(' to ');
        expect(result).toContain('all day');
    });

    it('location appends with comma prefix', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const end = new Date('2026-10-14T00:00:00.000Z');
        const result = formatAllDayEvent('Meeting', start, end, 'Office');
        expect(result).toContain(', at Office');
    });

    it('no location has no location text', () => {
        const start = new Date('2026-10-13T00:00:00.000Z');
        const end = new Date('2026-10-14T00:00:00.000Z');
        const result = formatAllDayEvent('Meeting', start, end);
        expect(result).not.toContain(', at ');
    });
});

describe('formatDuration', () => {
    it('handles common values', () => {
        expect(formatDuration(1)).toBe('1 minute');
        expect(formatDuration(45)).toBe('45 minutes');
        expect(formatDuration(60)).toBe('1 hour');
        expect(formatDuration(61)).toBe('1 hour and 1 minute');
        expect(formatDuration(90)).toBe('1 hour and 30 minutes');
        expect(formatDuration(120)).toBe('2 hours');
    });
});
