import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';

import Workspace from './models/Workspace';
import WorkspaceThread from './models/WorkspaceThread';
import Document from './models/Document';
import WorkspaceChat from './models/WorkspaceChat';
import Memory from './models/Memory';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'anythingllm',
  jsi: false,
  onSetUpError: (error) => console.error('Database setup error:', error),
});

export const database = new Database({
  adapter,
  modelClasses: [Workspace, WorkspaceThread, Document, WorkspaceChat, Memory],
});
