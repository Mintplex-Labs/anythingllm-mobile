import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowCounterClockwise,
  Cpu,
  Database,
  HardDrives,
  Key,
  Plugs,
  Trash,
} from 'phosphor-react-native';
import SafeView from '@/components/SafeView';
import AwaitableAlert from '@/components/AwaitableAlert';
import useRedirect from '@/hooks/useRedirect';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { database } from '@/database';
import uiStore from '@/store/UIStore';
import { showToast } from '@/utils/Notification';
import { PATHS } from '@/utils/paths';
import DatabaseInspectorView from './views/DatabaseInspectorView';
import LLMManagerView from './views/LLMManagerView';
import StorageInspectorView from './views/StorageInspectorView';
import { Card, DEV_COLORS, DevHeader, Row, Section } from './components';

type DevPage = 'main' | 'database' | 'llm' | 'storage';

export default function DevToolsMenu() {
  useRedirect();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<DevPage>('main');
  const pageRef = useRef<DevPage>('main');

  function goToPage(next: DevPage) {
    pageRef.current = next;
    setPage(next);
  }

  function goHome() {
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.home }],
    });
    return true;
  }

  // Sub-views register their own back handlers (mounted later, so they run first).
  // If they fall through, step back to the main menu, then out to Home.
  useHighjackBackButtonPress(() => {
    if (pageRef.current !== 'main') {
      goToPage('main');
      return true;
    }
    return goHome();
  });

  async function resetDatabase() {
    const confirm = await AwaitableAlert(
      'Reset database',
      'This permanently deletes every workspace, thread, chat, and document record on this device.',
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset database', style: 'destructive' },
    );
    if (!confirm) return;
    await database.write(async () => {
      const collections = Object.values(database.collections.map);
      for (const collection of collections) {
        await collection.query().destroyAllPermanently();
      }
    });
    showToast('Database has been reset');
  }

  async function confirmThen(title: string, message: string, action: () => Promise<void>, done: string) {
    const confirm = await AwaitableAlert(
      title,
      message,
      { text: 'Cancel', style: 'cancel' },
      { text: title, style: 'destructive' },
    );
    if (!confirm) return;
    await action();
    showToast(done);
  }

  const clearProviderCache = () =>
    confirmThen(
      'Clear cached configs',
      'Forgets the saved API keys, base URLs, and models for every provider you are not currently using. The active LLM preference is untouched.',
      () => uiStore.removeFromStorage('provider_config_cache'),
      'Cached provider configs cleared',
    );

  const clearExternalConnections = () =>
    confirmThen(
      'Clear connections',
      'Removes every saved AnythingLLM instance connection, including the active one.',
      async () => {
        await uiStore.removeFromStorage('current_anythingllm_external_connection');
        await uiStore.removeFromStorage('anythingllm_external_connections');
      },
      'External connections cleared',
    );

  const clearToolSettings = () =>
    confirmThen(
      'Clear tool settings',
      'Resets agent tool enablement and options back to defaults.',
      () => uiStore.removeFromStorage('tools'),
      'Tool settings cleared',
    );

  const resetOnboarding = () =>
    confirmThen(
      'Reset onboarding',
      'Clears every stored preference (LLM, tools, connections, cached configs) so the app starts from onboarding on next launch.',
      () => uiStore.resetAllStorage(),
      'Onboarding has been reset',
    );

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex-1 flex flex-col"
      safeAreaStyle={{ backgroundColor: DEV_COLORS.background }}>
      {page === 'database' && <DatabaseInspectorView onExit={() => goToPage('main')} />}
      {page === 'llm' && <LLMManagerView onExit={() => goToPage('main')} />}
      {page === 'storage' && <StorageInspectorView onExit={() => goToPage('main')} />}
      {page === 'main' && (
        <>
          <DevHeader title="Developer Tools" onBack={goHome} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 8,
              paddingBottom: insets.bottom + 20,
              gap: 24,
              flexGrow: 1,
            }}>
            <Section
              title="Tools"
              description="Internal utilities for inspecting and debugging the app on this device.">
              <Card>
                <Row
                  title="Database inspector"
                  subtitle="Browse local tables and records"
                  icon={<Database size={20} color="#FFF" />}
                  onPress={() => goToPage('database')}
                />
                <Row
                  title="LLM preference"
                  subtitle="View and edit the raw stored provider config"
                  icon={<Cpu size={20} color="#FFF" />}
                  onPress={() => goToPage('llm')}
                />
                <Row
                  title="Preference storage"
                  subtitle="Inspect or clear any persisted UI store key"
                  icon={<HardDrives size={20} color="#FFF" />}
                  onPress={() => goToPage('storage')}
                  borderBottom={false}
                />
              </Card>
            </Section>

            <Section
              title="Danger zone"
              description="These actions cannot be undone. Each one will ask for confirmation.">
              <Card style={{ backgroundColor: DEV_COLORS.dangerBg }}>
                <Row
                  title="Clear cached provider configs"
                  subtitle="Forget saved keys and URLs for inactive providers"
                  icon={<Key size={20} color={DEV_COLORS.danger} />}
                  danger
                  onPress={clearProviderCache}
                />
                <Row
                  title="Clear external connections"
                  subtitle="Remove all saved AnythingLLM instance connections"
                  icon={<Plugs size={20} color={DEV_COLORS.danger} />}
                  danger
                  onPress={clearExternalConnections}
                />
                <Row
                  title="Clear tool settings"
                  subtitle="Reset agent tool enablement to defaults"
                  icon={<ArrowCounterClockwise size={20} color={DEV_COLORS.danger} />}
                  danger
                  onPress={clearToolSettings}
                />
                <Row
                  title="Reset database"
                  subtitle="Delete all workspaces, threads, chats, and documents"
                  icon={<Trash size={20} color={DEV_COLORS.danger} />}
                  danger
                  onPress={resetDatabase}
                />
                <Row
                  title="Reset onboarding"
                  subtitle="Clear every stored preference and restart onboarding"
                  icon={<Trash size={20} color={DEV_COLORS.danger} />}
                  danger
                  onPress={resetOnboarding}
                  borderBottom={false}
                />
              </Card>
            </Section>
          </ScrollView>
        </>
      )}
    </SafeView>
  );
}
