import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import {Platform} from 'react-native';

import schema from './schema';
import migrations from './migrations';
import {ChatSession, Message, CompletionSetting, GlobalSetting} from './models';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'pocketpalai',
  jsi: Platform.OS === 'ios', // Enable JSI for better performance on iOS
  onSetUpError: error => {
    console.error('Database setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [ChatSession, Message, CompletionSetting, GlobalSetting],
});
