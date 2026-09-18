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
  ],
});
