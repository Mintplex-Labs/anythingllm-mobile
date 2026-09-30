jest.mock('react-native-calendar-events', () => ({ __esModule: true, default: {} }));
jest.mock('@/utils/calendar', () => ({ ensureCalendarPermission: jest.fn() }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

import moment from 'moment';
import { CLOCK_HORIZON_MS, confirmAfterApproval, resolveReminder } from '@/utils/reminders';

// Wednesday, Sep 30 2026, 10:00 local time
const NOW = moment('2026-09-30T10:00:00').valueOf();
const at = (text: string) => moment(text).valueOf();

describe('resolveReminder', () => {
  it('turns relative times within a day into timers', () => {
    expect(resolveReminder({ inMinutes: 20 }, NOW)).toEqual({ ok: true, kind: 'timer', fireAt: NOW + 20 * 60_000, durationSeconds: 1200 });
    expect(resolveReminder({ inMinutes: '1440' }, NOW)).toMatchObject({ ok: true, kind: 'timer', durationSeconds: 86_400 });
  });

  it('turns relative times past a day into calendar reminders', () => {
    expect(resolveReminder({ inMinutes: 1441 }, NOW)).toMatchObject({ ok: true, kind: 'calendar', fireAt: NOW + 1441 * 60_000 });
  });

  it('rejects bad relative times', () => {
    expect(resolveReminder({ inMinutes: 0 }, NOW).ok).toBe(false);
    expect(resolveReminder({ inMinutes: 'soon' }, NOW).ok).toBe(false);
  });

  it('sets a clock time with no day for its next occurrence', () => {
    expect(resolveReminder({ atTime: '15:30' }, NOW)).toMatchObject({ ok: true, kind: 'alarm', fireAt: at('2026-09-30T15:30:00') });
    // Already past today - tomorrow morning, still within a day
    expect(resolveReminder({ atTime: '07:00' }, NOW)).toMatchObject({ ok: true, kind: 'alarm', fireAt: at('2026-10-01T07:00:00') });
  });

  it('accepts 12-hour times', () => {
    expect(resolveReminder({ atTime: '3:30 pm' }, NOW)).toMatchObject({ ok: true, fireAt: at('2026-09-30T15:30:00') });
    expect(resolveReminder({ atTime: '9am', onDate: 'tomorrow' }, NOW)).toMatchObject({ ok: true, kind: 'alarm', fireAt: at('2026-10-01T09:00:00') });
  });

  it('uses the calendar once the time is more than a day away', () => {
    expect(resolveReminder({ atTime: '11:00', onDate: 'tomorrow' }, NOW)).toMatchObject({ ok: true, kind: 'calendar', fireAt: at('2026-10-01T11:00:00') });
    expect(resolveReminder({ atTime: '09:00', onDate: '2026-10-14' }, NOW)).toMatchObject({ ok: true, kind: 'calendar', fireAt: at('2026-10-14T09:00:00') });
  });

  it('resolves weekdays to their next occurrence, counting today while the time is ahead', () => {
    expect(resolveReminder({ atTime: '17:00', onDate: 'friday' }, NOW)).toMatchObject({ ok: true, fireAt: at('2026-10-02T17:00:00') });
    expect(resolveReminder({ atTime: '17:00', onDate: 'Wednesday' }, NOW)).toMatchObject({ ok: true, kind: 'alarm', fireAt: at('2026-09-30T17:00:00') });
    expect(resolveReminder({ atTime: '08:00', onDate: 'wed' }, NOW)).toMatchObject({ ok: true, fireAt: at('2026-10-07T08:00:00') });
    expect(resolveReminder({ atTime: '08:00', onDate: 'mon' }, NOW)).toMatchObject({ ok: true, fireAt: at('2026-10-05T08:00:00') });
  });

  it('refuses times that have passed or cannot be read', () => {
    expect(resolveReminder({ atTime: '08:00', onDate: 'today' }, NOW).ok).toBe(false);
    expect(resolveReminder({ atTime: '09:00', onDate: '2026-09-01' }, NOW).ok).toBe(false);
    expect(resolveReminder({ atTime: 'noonish' }, NOW).ok).toBe(false);
    expect(resolveReminder({ atTime: '09:00', onDate: 'someday' }, NOW).ok).toBe(false);
    expect(resolveReminder({}, NOW).ok).toBe(false);
  });

  it('keeps alarms inside the clock horizon', () => {
    const result = resolveReminder({ atTime: '09:59' }, NOW);
    expect(result).toMatchObject({ ok: true, kind: 'alarm' });
    if (result.ok) expect(result.fireAt - NOW).toBeLessThanOrEqual(CLOCK_HORIZON_MS);
  });
});

describe('confirmAfterApproval', () => {
  const approvedAt = NOW + 45_000;

  it('refuses an alarm whose time went by while waiting for approval', () => {
    const alarm = { ok: true as const, kind: 'alarm' as const, fireAt: NOW + 30_000, durationSeconds: null };
    expect(confirmAfterApproval(alarm, approvedAt).ok).toBe(false);
    expect(confirmAfterApproval(alarm, alarm.fireAt).ok).toBe(false);
  });

  it('keeps an alarm that is still ahead', () => {
    const alarm = { ok: true as const, kind: 'alarm' as const, fireAt: NOW + 60_000, durationSeconds: null };
    expect(confirmAfterApproval(alarm, approvedAt)).toEqual(alarm);
  });

  it('counts timers from the approval', () => {
    const timer = { ok: true as const, kind: 'timer' as const, fireAt: NOW + 600_000, durationSeconds: 600 };
    expect(confirmAfterApproval(timer, approvedAt)).toEqual({ ...timer, fireAt: approvedAt + 600_000 });
  });

  it('refuses a calendar reminder that is already due', () => {
    const calendar = { ok: true as const, kind: 'calendar' as const, fireAt: NOW, durationSeconds: null };
    expect(confirmAfterApproval(calendar, approvedAt).ok).toBe(false);
  });
});
