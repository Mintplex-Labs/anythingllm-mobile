import {Model} from '@nozbe/watermelondb';
import {field, text} from '@nozbe/watermelondb/decorators';
import {CompletionParams} from '../../utils/completionTypes';
import {migrateCompletionSettings} from '../../utils/completionSettingsVersions';

export default class GlobalSetting extends Model {
  static table = 'global_settings';

  @text('key') key!: string;
  @text('value') value!: string;
  @field('created_at') createdAt!: number;
  @field('updated_at') updatedAt!: number;

  // Helper methods
  getValue<T>(): T {
    // For completion settings, apply migrations if needed
    if (this.key === 'newChatCompletionSettings') {
      try {
        const parsedSettings = JSON.parse(this.value) as CompletionParams;

        // Check if settings need migration
        const migratedSettings = migrateCompletionSettings(parsedSettings);

        // If settings were migrated, log it but don't try to save automatically
        // The repository should handle saving with proper database.write() calls
        if (migratedSettings.version !== parsedSettings.version) {
          console.log(
            `Migrated global completion settings from version ${parsedSettings.version} to ${migratedSettings.version} for key ${this.key}`,
          );
          console.log(
            'Global settings need to be saved by the repository with a proper database.write() call',
          );
        }

        return migratedSettings as unknown as T;
      } catch (error) {
        console.error('Error parsing global completion settings:', error);
        // Return default settings if parsing fails
        return migrateCompletionSettings({}) as unknown as T;
      }
    }

    // For other settings, just parse the JSON
    return JSON.parse(this.value);
  }

  setValue<T>(value: T) {
    // For completion settings, ensure version is set
    if (this.key === 'newChatCompletionSettings') {
      const settings = value as unknown as CompletionParams;
      if (settings.version === undefined) {
        value = migrateCompletionSettings(settings) as unknown as T;
      }
    }

    return this.update(record => {
      record.value = JSON.stringify(value);
    });
  }
}
