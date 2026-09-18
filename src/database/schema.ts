import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: 'workspaces',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'system_prompt', type: 'string', isOptional: true },
        { name: 'temperature', type: 'number', isOptional: true },
        { name: 'context_length', type: 'number', isOptional: true },
        { name: 'is_remote', type: 'boolean', isOptional: true },
        { name: 'remote_config', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'workspace_threads',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'workspace_slug', type: 'string', isIndexed: true },
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'is_remote', type: 'boolean', isOptional: true },
        { name: 'remote_config', type: 'string', isOptional: true },
        // Rolling summary of the oldest chats used to keep long threads inside small context windows (JSON, see ThreadContextSummary)
        { name: 'context_summary', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'workspace_documents',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'workspace_slug', type: 'string', isIndexed: true },
        { name: 'vector_box_ids', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      // User-authored memories injected into prompts - see utils/Memories. Global memories apply to every
      // workspace; workspace memories carry the slug they belong to and are pruned with the workspace.
      name: 'memories',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'scope', type: 'string', isIndexed: true },
        { name: 'workspace_slug', type: 'string', isOptional: true, isIndexed: true },
        { name: 'content', type: 'string' },
        // JSON float array from the on-device embedder, filled lazily - null until embedded
        { name: 'embedding', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // Prompts the assistant runs unattended on a cron schedule - see utils/ScheduledJobs
      name: 'scheduled_jobs',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'prompt', type: 'string' },
        // JSON array of ToolsManager tool ids the job may use (empty = no tools)
        { name: 'tools', type: 'string' },
        // 5-field cron expression in local time
        { name: 'schedule', type: 'string' },
        { name: 'enabled', type: 'boolean' },
        { name: 'notify_on_complete', type: 'boolean' },
        { name: 'last_run_at', type: 'number', isOptional: true },
        { name: 'next_run_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      // One row per execution of a scheduled job
      name: 'scheduled_job_runs',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'job_uuid', type: 'string', isIndexed: true },
        // queued | running | completed | failed | timed_out
        { name: 'status', type: 'string', isIndexed: true },
        // 'schedule' | 'manual'
        { name: 'trigger', type: 'string' },
        // JSON WorkspaceChatResponseType (same shape as a chat reply) once the run finishes
        { name: 'result', type: 'string', isOptional: true },
        { name: 'error', type: 'string', isOptional: true },
        { name: 'started_at', type: 'number' },
        { name: 'completed_at', type: 'number', isOptional: true },
        // null = the user has not opened this run yet
        { name: 'read_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'workspace_chats',
      columns: [
        { name: 'uuid', type: 'string', isIndexed: true },
        { name: 'workspace_thread_slug', type: 'string', isIndexed: true },
        { name: 'prompt', type: 'string' },
        { name: 'response', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
