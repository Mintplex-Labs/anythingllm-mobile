import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'workspaces',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'workspace_threads',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'workspace_slug', type: 'string', isIndexed: true },
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
