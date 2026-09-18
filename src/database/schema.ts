import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 3,
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
