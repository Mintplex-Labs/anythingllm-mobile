import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';
import {CompletionParams} from '../../utils/completionTypes';
import {migrateCompletionSettings} from '../../utils/completionSettingsVersions';

export default class CompletionSetting extends Model {
  static table = 'completion_settings';

  static associations = {
    chat_sessions: {type: 'belongs_to' as const, key: 'session_id'},
  };

  @text('session_id') sessionId!: string;
  @text('settings') settings!: string;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  // Helper methods
  getSettings(): CompletionParams {
    try {
      const parsedSettings = JSON.parse(this.settings);

      // Check if completion settings need migration
      const migratedSettings = migrateCompletionSettings(parsedSettings);

      if (migratedSettings.version !== parsedSettings.version) {
        console.log(
          `Migrated completion settings from version ${parsedSettings.version} to ${migratedSettings.version} for session ${this.sessionId}`,
        );
        console.log(
          'Settings need to be saved by the repository with a proper database.write() call',
        );
      }

      return migratedSettings;
    } catch (error) {
      console.error('Error parsing completion settings:', error);
      // Return default settings if parsing fails
      return migrateCompletionSettings({});
    }
  }

  setSettings(settings: CompletionParams) {
    // Ensure the version is set
    if (settings.version === undefined) {
      settings = migrateCompletionSettings(settings);
    }

    return this.update(record => {
      record.settings = JSON.stringify(settings);
    });
  }
}
