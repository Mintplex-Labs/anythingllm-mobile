import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';
import schema from './schema';
import migrations from './migrations';

import Workspace from './models/Workspace';
import WorkspaceThread from './models/WorkspaceThread';
import Document from './models/Document';
import WorkspaceChat from './models/WorkspaceChat';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'anythingllm',
  jsi: Platform.OS === 'ios', // Enable JSI for better performance on iOS
  onSetUpError: (error) => console.error('Database setup error:', error),
});

export const database = new Database({
  adapter,
  modelClasses: [Workspace, WorkspaceThread, Document, WorkspaceChat],
});
