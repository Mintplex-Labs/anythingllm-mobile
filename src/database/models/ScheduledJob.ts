import { field, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import { isValidCron, nextCronRun } from '@/utils/ScheduledJobs/cron';
import ScheduledJobRun from './ScheduledJobRun';

export type ScheduledJobType = {
  uuid: string;
  name: string;
  prompt: string;
  /** ToolsManager tool ids the job may call. Empty = plain reply with no tools. */
  tools: string[];
  /** 5-field cron expression, local time */
  schedule: string;
  enabled: boolean;
  /** Push a notification when a run completes with something to show */
  notifyOnComplete: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ScheduledJobDBType = Model & Omit<ScheduledJobType, 'tools'> & { tools: string };

export type ScheduledJobWritable = {
  name: string;
  prompt: string;
  tools: string[];
  schedule: string;
  enabled: boolean;
  notifyOnComplete: boolean;
};

type Where = { field: string; value: any }[];

/**
 * A prompt the assistant runs on its own on a schedule - the mobile counterpart of the desktop
 * `scheduled_jobs` table. A job is a name, a prompt, the tools it may use and a cron expression.
 * Every execution is a `ScheduledJobRun`. Rows are plain SQLite; `tools` is a JSON string array.
 *
 * Jobs only run with an external (cloud / self-hosted) LLM provider - the on-device model cannot
 * be loaded in the background - see `ScheduledJobRunner`.
 */
export default class ScheduledJob extends Model {
  static table = 'scheduled_jobs';

  static maxNameLength = 80;
  static maxPromptLength = 10_000;

  @text('uuid') uuid!: string;
  @text('name') name!: string;
  @text('prompt') prompt!: string;
  @text('tools') tools!: string;
  @text('schedule') schedule!: string;
  @field('enabled') enabled!: boolean;
  @field('notify_on_complete') notifyOnComplete!: boolean;
  @field('last_run_at') lastRunAt!: number | null;
  @field('next_run_at') nextRunAt!: number | null;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:ScheduledJob]\x1b[0m`, message, ...args); // eslint-disable-line no-console
  }

  static validate(input: Partial<ScheduledJobWritable>): { valid: boolean; error: string } {
    const name = String(input.name ?? '').trim();
    const prompt = String(input.prompt ?? '').trim();
    if (!name) return { valid: false, error: 'Give the job a name' };
    if (name.length > ScheduledJob.maxNameLength) return { valid: false, error: `Name must be ${ScheduledJob.maxNameLength} characters or fewer` };
    if (!prompt) return { valid: false, error: 'Write the prompt the job should run' };
    if (prompt.length > ScheduledJob.maxPromptLength) return { valid: false, error: `Prompt must be ${ScheduledJob.maxPromptLength} characters or fewer` };
    if (!isValidCron(String(input.schedule ?? ''))) return { valid: false, error: 'The schedule is not a valid cron expression' };
    if (input.tools !== undefined && !Array.isArray(input.tools)) return { valid: false, error: 'Tools must be a list' };
    return { valid: true, error: '' };
  }

  static parseTools(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw !== 'string' || !raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  static computeNextRunAt(schedule: string, from: number = Date.now()): number | null {
    const next = nextCronRun(schedule, from);
    return next ? next.getTime() : null;
  }

  static toScheduledJobObject(data: any): ScheduledJobType {
    const { uuid, name, prompt, tools, schedule, enabled, notifyOnComplete, lastRunAt, nextRunAt, createdAt, updatedAt } = data;
    return {
      uuid,
      name,
      prompt,
      tools: ScheduledJob.parseTools(tools),
      schedule,
      enabled: !!enabled,
      notifyOnComplete: !!notifyOnComplete,
      lastRunAt: lastRunAt ?? null,
      nextRunAt: nextRunAt ?? null,
      createdAt,
      updatedAt,
    };
  }

  static async get(where: Where = []): Promise<ScheduledJobDBType[]> {
    const rows = await database.get(ScheduledJob.table).query(
      where.map((clause) => Q.where(clause.field, clause.value))
    ).fetch();
    return rows as ScheduledJobDBType[];
  }

  /** Every job, newest first */
  static async find(where: Where = []): Promise<ScheduledJobType[]> {
    const rows = await this.get(where);
    return rows.map((row) => this.toScheduledJobObject(row)).sort((a, b) => b.createdAt - a.createdAt);
  }

  static async findByUuid(uuid: string): Promise<ScheduledJobType | null> {
    const rows = await this.get([{ field: 'uuid', value: uuid }]);
    return rows.length ? this.toScheduledJobObject(rows[0]) : null;
  }

  static async allEnabled(): Promise<ScheduledJobType[]> {
    return this.find([{ field: 'enabled', value: true }]);
  }

  /** Enabled jobs whose next run is at or before `now` (a missing next run counts as due so it gets repaired). */
  static async due(now: number = Date.now()): Promise<ScheduledJobType[]> {
    const jobs = await this.allEnabled();
    return jobs.filter((job) => job.nextRunAt === null || job.nextRunAt <= now);
  }

  /** Earliest upcoming run across every enabled job, or null when nothing is scheduled. */
  static async earliestNextRunAt(): Promise<number | null> {
    const jobs = await this.allEnabled();
    const times = jobs.map((job) => job.nextRunAt).filter((t): t is number => typeof t === 'number');
    return times.length ? Math.min(...times) : null;
  }

  static async count(): Promise<number> {
    return database.get(ScheduledJob.table).query().fetchCount();
  }

  static async create(input: ScheduledJobWritable): Promise<ScheduledJobType> {
    const validation = ScheduledJob.validate(input);
    if (!validation.valid) throw new Error(validation.error);

    const now = Date.now();
    let created: any;
    await database.write(async () => {
      created = await database.get(ScheduledJob.table).create((job: any) => {
        job.uuid = generateUUID();
        job.name = input.name.trim();
        job.prompt = input.prompt.trim();
        job.tools = JSON.stringify(input.tools ?? []);
        job.schedule = input.schedule.trim();
        job.enabled = !!input.enabled;
        job.notifyOnComplete = !!input.notifyOnComplete;
        job.lastRunAt = null;
        job.nextRunAt = input.enabled ? ScheduledJob.computeNextRunAt(input.schedule, now) : null;
        job.createdAt = now;
        job.updatedAt = now;
      });
    });
    const job = this.toScheduledJobObject(created);
    this.log(`created job ${job.uuid} "${job.name}" (${job.schedule})`);
    return job;
  }

  static async update(uuid: string, updates: Partial<ScheduledJobWritable>): Promise<ScheduledJobType | null> {
    const rows = await this.get([{ field: 'uuid', value: uuid }]);
    if (!rows.length) return null;
    const current = this.toScheduledJobObject(rows[0]);
    const merged: ScheduledJobWritable = {
      name: updates.name ?? current.name,
      prompt: updates.prompt ?? current.prompt,
      tools: updates.tools ?? current.tools,
      schedule: updates.schedule ?? current.schedule,
      enabled: updates.enabled ?? current.enabled,
      notifyOnComplete: updates.notifyOnComplete ?? current.notifyOnComplete,
    };
    const validation = ScheduledJob.validate(merged);
    if (!validation.valid) throw new Error(validation.error);

    const now = Date.now();
    const scheduleChanged = merged.schedule.trim() !== current.schedule;
    const enabledChanged = merged.enabled !== current.enabled;
    let updated: any = rows[0];
    await database.write(async () => {
      updated = await rows[0].update((job: any) => {
        job.name = merged.name.trim();
        job.prompt = merged.prompt.trim();
        job.tools = JSON.stringify(merged.tools ?? []);
        job.schedule = merged.schedule.trim();
        job.enabled = merged.enabled;
        job.notifyOnComplete = merged.notifyOnComplete;
        job.updatedAt = now;
        if (!merged.enabled) job.nextRunAt = null;
        else if (scheduleChanged || enabledChanged || job.nextRunAt === null) job.nextRunAt = ScheduledJob.computeNextRunAt(merged.schedule, now);
      });
    });
    this.log(`updated job ${uuid}`);
    return this.toScheduledJobObject(updated);
  }

  static async setEnabled(uuid: string, enabled: boolean): Promise<ScheduledJobType | null> {
    return this.update(uuid, { enabled });
  }

  /** Stamp a run as started: `lastRunAt = now` and the next run computed from the schedule. */
  static async markRun(uuid: string, at: number = Date.now()): Promise<ScheduledJobType | null> {
    const rows = await this.get([{ field: 'uuid', value: uuid }]);
    if (!rows.length) return null;
    let updated: any = rows[0];
    await database.write(async () => {
      updated = await rows[0].update((job: any) => {
        job.lastRunAt = at;
        job.nextRunAt = job.enabled ? ScheduledJob.computeNextRunAt(job.schedule, at) : null;
      });
    });
    return this.toScheduledJobObject(updated);
  }

  /** Recompute `nextRunAt` for every enabled job (eg: after the clock moved or the app was closed for a while). */
  static async recomputeNextRuns(now: number = Date.now()): Promise<void> {
    const rows = await this.get([{ field: 'enabled', value: true }]);
    const stale = rows.filter((row) => row.nextRunAt === null || row.nextRunAt <= now);
    if (!stale.length) return;
    await database.write(async () => {
      await database.batch(stale.map((row) => row.prepareUpdate((job: any) => {
        job.nextRunAt = ScheduledJob.computeNextRunAt(job.schedule, now);
      })));
    });
  }

  /** Deletes the job and every run (and generated file) that belongs to it. */
  static async delete(uuid: string): Promise<boolean> {
    try {
      const rows = await this.get([{ field: 'uuid', value: uuid }]);
      if (!rows.length) return false;
      await ScheduledJobRun.deleteForJob(uuid);
      await database.write(async () => {
        await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
      });
      this.log(`deleted job ${uuid}`);
      return true;
    } catch (error) {
      this.log('error deleting job', error);
      return false;
    }
  }

  static async deleteAll(): Promise<boolean> {
    await ScheduledJobRun.deleteAll();
    const rows = await this.get();
    if (!rows.length) return true;
    await database.write(async () => {
      this.log(`deleting ${rows.length} jobs`);
      await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
    });
    return true;
  }
}
