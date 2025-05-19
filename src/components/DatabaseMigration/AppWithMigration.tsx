import React, {useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import {DatabaseMigration} from './DatabaseMigration';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

/**
 * Wraps the main app component and displays the migration UI when needed.
 */
export const AppWithMigration: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  useEffect(() => {
    const migrateSettings = async () => {
      try {
        // Wait a bit to avoid blocking the UI during startup
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Migrate all settings to the latest version
        await chatSessionRepository.migrateAllSettings();
      } catch (error) {
        console.error('Failed to migrate settings:', error);
      }
    };

    migrateSettings();
  }, []);

  return (
    <View style={styles.container}>
      {children}
      <DatabaseMigration />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
