import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';

// models
import Workspace from './models/Workspace';
import WorkspaceThread from './models/WorkspaceThread';
import Document from './models/Document';
import WorkspaceChat from './models/WorkspaceChat';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'anythingllm',
  jsi: true, // enable JSI for better performance if available
  onSetUpError: error => console.error('Database setup error:', error),
});

export const database = new Database({
  adapter,
  modelClasses: [Workspace, WorkspaceThread, Document, WorkspaceChat],
});

export const databaseTables = [Workspace.table, WorkspaceThread.table, Document.table, WorkspaceChat.table];