import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // v1 -> v2: rolling context summary per thread (see utils/chat/contextCompaction)
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'workspace_threads',
          columns: [{ name: 'context_summary', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v2 -> v3: user-authored memories (see utils/Memories)
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'memories',
          columns: [
            { name: 'uuid', type: 'string', isIndexed: true },
            { name: 'scope', type: 'string', isIndexed: true },
            { name: 'workspace_slug', type: 'string', isOptional: true, isIndexed: true },
            { name: 'content', type: 'string' },
            { name: 'embedding', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    // v3 -> v4: scheduled jobs and their runs (see utils/ScheduledJobs)
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'scheduled_jobs',
          columns: [
            { name: 'uuid', type: 'string', isIndexed: true },
            { name: 'name', type: 'string' },
            { name: 'prompt', type: 'string' },
            { name: 'tools', type: 'string' },
            { name: 'schedule', type: 'string' },
            { name: 'enabled', type: 'boolean' },
            { name: 'notify_on_complete', type: 'boolean' },
            { name: 'last_run_at', type: 'number', isOptional: true },
            { name: 'next_run_at', type: 'number', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'scheduled_job_runs',
          columns: [
            { name: 'uuid', type: 'string', isIndexed: true },
            { name: 'job_uuid', type: 'string', isIndexed: true },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'trigger', type: 'string' },
            { name: 'result', type: 'string', isOptional: true },
            { name: 'error', type: 'string', isOptional: true },
            { name: 'started_at', type: 'number' },
            { name: 'completed_at', type: 'number', isOptional: true },
            { name: 'read_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
