import { field, text } from '@nozbe/watermelondb/decorators';
import { database } from '@/database';
import { Q, Model } from '@nozbe/watermelondb';
import { generateUUID } from '@/utils/constants';
import { deleteGeneratedDocumentsByStorageFilenames } from '@/utils/fs/generatedDocuments';
import WorkspaceChat, { type WorkspaceChatResponseType } from './WorkspaceChat';

export type ScheduledJobRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out';
export type ScheduledJobRunTrigger = 'schedule' | 'manual';

export const RUN_STATUSES: Record<ScheduledJobRunStatus, ScheduledJobRunStatus> = {
  queued: 'queued',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  timed_out: 'timed_out',
};
export const NON_TERMINAL_RUN_STATUSES: ScheduledJobRunStatus[] = ['queued', 'running'];

export type ScheduledJobRunType = {
  uuid: string;
  jobUuid: string;
  status: ScheduledJobRunStatus;
  trigger: ScheduledJobRunTrigger;
  /** The assistant's reply for this run - same shape as a chat reply so the chat UI can render it */
  result: WorkspaceChatResponseType | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
  readAt: number | null;
};

export type ScheduledJobRunDBType = Model & Omit<ScheduledJobRunType, 'result'> & { result: string | null };

type Where = { field: string; value: any }[];

/**
 * One execution of a `ScheduledJob`. Lifecycle: queued -> running -> completed | failed | timed_out.
 * `result` stores the finished `WorkspaceChatResponseType` (text, activity chain, actions with any
 * generated files) so the run detail screen reuses the chat message components. `readAt` stays
 * null until the user opens the run - that is what drives the unseen dots in the UI.
 */
export default class ScheduledJobRun extends Model {
  static table = 'scheduled_job_runs';

  @text('uuid') uuid!: string;
  @text('job_uuid') jobUuid!: string;
  @text('status') status!: ScheduledJobRunStatus;
  @text('trigger') trigger!: ScheduledJobRunTrigger;
  @text('result') result!: string | null;
  @text('error') error!: string | null;
  @field('started_at') startedAt!: number;
  @field('completed_at') completedAt!: number | null;
  @field('read_at') readAt!: number | null;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:ScheduledJobRun]\x1b[0m`, message, ...args); // eslint-disable-line no-console
  }

  static isTerminal(status: ScheduledJobRunStatus): boolean {
    return !NON_TERMINAL_RUN_STATUSES.includes(status);
  }

  static parseResult(raw: unknown): WorkspaceChatResponseType | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw as WorkspaceChatResponseType;
    try {
      return JSON.parse(String(raw)) as WorkspaceChatResponseType;
    } catch {
      return null;
    }
  }

  static toRunObject(data: any): ScheduledJobRunType {
    const { uuid, jobUuid, status, trigger, result, error, startedAt, completedAt, readAt } = data;
    return {
      uuid,
      jobUuid,
      status,
      trigger: trigger === 'manual' ? 'manual' : 'schedule',
      result: ScheduledJobRun.parseResult(result),
      error: error ?? null,
      startedAt,
      completedAt: completedAt ?? null,
      readAt: readAt ?? null,
    };
  }

  static async get(where: Where = []): Promise<ScheduledJobRunDBType[]> {
    const rows = await database.get(ScheduledJobRun.table).query(
      where.map((clause) => Q.where(clause.field, clause.value))
    ).fetch();
    return rows as ScheduledJobRunDBType[];
  }

  /** Runs for a job, newest first */
  static async forJob(jobUuid: string, limit: number = 50): Promise<ScheduledJobRunType[]> {
    const rows = await database.get(ScheduledJobRun.table).query(
      Q.where('job_uuid', jobUuid),
      Q.sortBy('started_at', Q.desc),
      Q.take(limit),
    ).fetch();
    return rows.map((row) => this.toRunObject(row));
  }

  static async findByUuid(uuid: string): Promise<ScheduledJobRunType | null> {
    const rows = await this.get([{ field: 'uuid', value: uuid }]);
    return rows.length ? this.toRunObject(rows[0]) : null;
  }

  /** The most recent run of a job, if any */
  static async latestForJob(jobUuid: string): Promise<ScheduledJobRunType | null> {
    const runs = await this.forJob(jobUuid, 1);
    return runs[0] ?? null;
  }

  /** Whether a run of this job is queued or running right now */
  static async hasInFlightRun(jobUuid: string): Promise<boolean> {
    const count = await database.get(ScheduledJobRun.table).query(
      Q.where('job_uuid', jobUuid),
      Q.where('status', Q.oneOf(NON_TERMINAL_RUN_STATUSES)),
    ).fetchCount();
    return count > 0;
  }

  /** Query for every finished run the user has not opened - observe it for the unseen dots */
  static unreadQuery(jobUuid?: string) {
    const clauses = [
      Q.where('read_at', null),
      Q.where('status', Q.notIn(NON_TERMINAL_RUN_STATUSES)),
    ];
    if (jobUuid) clauses.push(Q.where('job_uuid', jobUuid));
    return database.get(ScheduledJobRun.table).query(...clauses);
  }

  static async unreadCount(jobUuid?: string): Promise<number> {
    return this.unreadQuery(jobUuid).fetchCount();
  }

  /**
   * Claim a new run for a job. Returns null when a run is already in flight so a job never
   * executes twice at once (the foreground ticker and the background worker can overlap).
   */
  static async start(jobUuid: string, trigger: ScheduledJobRunTrigger): Promise<ScheduledJobRunType | null> {
    return database.write(async () => {
      const inFlight = await database.get(ScheduledJobRun.table).query(
        Q.where('job_uuid', jobUuid),
        Q.where('status', Q.oneOf(NON_TERMINAL_RUN_STATUSES)),
      ).fetchCount();
      if (inFlight > 0) return null;

      const created: any = await database.get(ScheduledJobRun.table).create((run: any) => {
        run.uuid = generateUUID();
        run.jobUuid = jobUuid;
        run.status = RUN_STATUSES.queued;
        run.trigger = trigger;
        run.result = null;
        run.error = null;
        run.startedAt = Date.now();
        run.completedAt = null;
        run.readAt = null;
      });
      return this.toRunObject(created);
    });
  }

  private static async patch(uuid: string, patch: (run: any) => void): Promise<ScheduledJobRunType | null> {
    const rows = await this.get([{ field: 'uuid', value: uuid }]);
    if (!rows.length) return null;
    let updated: any = rows[0];
    await database.write(async () => {
      updated = await rows[0].update(patch);
    });
    return this.toRunObject(updated);
  }

  static async markRunning(uuid: string): Promise<ScheduledJobRunType | null> {
    return this.patch(uuid, (run) => {
      run.status = RUN_STATUSES.running;
      run.startedAt = Date.now();
    });
  }

  static async complete(uuid: string, result: WorkspaceChatResponseType): Promise<ScheduledJobRunType | null> {
    return this.patch(uuid, (run) => {
      run.status = RUN_STATUSES.completed;
      run.result = JSON.stringify(result);
      run.error = null;
      run.completedAt = Date.now();
    });
  }

  /** Marks the run failed, keeping whatever partial result was produced so the user can see how far it got. */
  static async fail(uuid: string, error: string, partialResult: WorkspaceChatResponseType | null = null): Promise<ScheduledJobRunType | null> {
    return this.patch(uuid, (run) => {
      run.status = RUN_STATUSES.failed;
      run.error = error || 'Job failed';
      if (partialResult) run.result = JSON.stringify(partialResult);
      run.completedAt = Date.now();
    });
  }

  static async timeout(uuid: string, partialResult: WorkspaceChatResponseType | null = null): Promise<ScheduledJobRunType | null> {
    return this.patch(uuid, (run) => {
      run.status = RUN_STATUSES.timed_out;
      run.error = 'The job took too long and was stopped';
      if (partialResult) run.result = JSON.stringify(partialResult);
      run.completedAt = Date.now();
    });
  }

  static async markRead(uuid: string): Promise<boolean> {
    const updated = await this.patch(uuid, (run) => { if (!run.readAt) run.readAt = Date.now(); });
    return !!updated;
  }

  static async markAllReadForJob(jobUuid: string): Promise<number> {
    const rows = await this.get([{ field: 'job_uuid', value: jobUuid }, { field: 'read_at', value: null }]);
    if (!rows.length) return 0;
    await database.write(async () => {
      await database.batch(rows.map((row) => row.prepareUpdate((run: any) => { run.readAt = Date.now(); })));
    });
    return rows.length;
  }

  /**
   * Runs left queued/running by a crash or the OS killing the process cannot finish - fail them
   * so the job can run again. Called before every scheduler pass.
   */
  static async failOrphanedRuns(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const rows = await database.get(ScheduledJobRun.table).query(
      Q.where('status', Q.oneOf(NON_TERMINAL_RUN_STATUSES)),
      Q.where('started_at', Q.lt(cutoff)),
    ).fetch();
    if (!rows.length) return 0;
    await database.write(async () => {
      await database.batch(rows.map((row) => row.prepareUpdate((run: any) => {
        run.status = RUN_STATUSES.failed;
        run.error = 'The app was closed before the job finished';
        run.completedAt = Date.now();
      })));
    });
    this.log(`failed ${rows.length} orphaned run(s)`);
    return rows.length;
  }

  /** Storage filenames of every generated file referenced by these runs (`file_download` actions in the result) */
  static storageFilenamesFrom(runs: Array<{ result?: any }>): string[] {
    return WorkspaceChat.storageFilenamesFrom(runs.map((run) => ({ response: run.result })));
  }

  /** Deletes runs matching `where` and purges the generated files they reference. */
  static async delete(where: Where): Promise<number> {
    if (!where.length) return 0;
    const storageFilenames = await database.write(async () => {
      const rows = await database.get(ScheduledJobRun.table).query(
        where.map((clause) => Q.where(clause.field, clause.value))
      ).fetch() as ScheduledJobRunDBType[];
      if (!rows.length) return null;
      // @ts-ignore - _raw holds the serialized column
      const filenames = this.storageFilenamesFrom(rows.map((row) => ({ result: row._raw?.result ?? row.result })));
      await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
      this.log(`deleted ${rows.length} run(s)`);
      return { filenames, count: rows.length };
    });
    if (!storageFilenames) return 0;
    await deleteGeneratedDocumentsByStorageFilenames(storageFilenames.filenames);
    return storageFilenames.count;
  }

  static async deleteByUuid(uuid: string): Promise<boolean> {
    return (await this.delete([{ field: 'uuid', value: uuid }])) > 0;
  }

  static async deleteForJob(jobUuid: string): Promise<number> {
    return this.delete([{ field: 'job_uuid', value: jobUuid }]);
  }

  static async deleteAll(): Promise<boolean> {
    const rows = await this.get();
    if (!rows.length) return true;
    // @ts-ignore - _raw holds the serialized column
    const filenames = this.storageFilenamesFrom(rows.map((row) => ({ result: row._raw?.result ?? row.result })));
    await database.write(async () => {
      this.log(`deleting ${rows.length} runs`);
      await database.batch(rows.map((row) => row.prepareDestroyPermanently()));
    });
    await deleteGeneratedDocumentsByStorageFilenames(filenames);
    return true;
  }
}
