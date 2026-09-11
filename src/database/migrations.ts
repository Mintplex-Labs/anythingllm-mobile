import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
