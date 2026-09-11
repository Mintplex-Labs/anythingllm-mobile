import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 2,
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
