import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowsClockwise, CaretDown, CaretUp, Trash } from 'phosphor-react-native';
import uiStore, { UIStore, type StorageKeys } from '@/store/UIStore';
import AwaitableAlert from '@/components/AwaitableAlert';
import { showToast } from '@/utils/Notification';
import { Card, DEV_COLORS, DevHeader, Pill, Section } from '../../components';

type StoredValues = Partial<Record<StorageKeys, string | null>>;

function summarize(raw: string | null): string {
  if (raw === null) return 'not set';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return `${parsed.length} item${parsed.length === 1 ? '' : 's'}`;
    if (parsed && typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      return `${keys.length} key${keys.length === 1 ? '' : 's'}`;
    }
    return String(parsed);
  } catch {
    return raw;
  }
}

function pretty(raw: string | null): string {
  if (raw === null) return 'null';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Read-only browser for every key the UI store persists, with a per-key clear. */
export default function StorageInspectorView({ onExit }: { onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<StoredValues>({});
  const [expanded, setExpanded] = useState<StorageKeys | null>(null);

  async function loadAll() {
    const next: StoredValues = {};
    for (const key of UIStore.STORAGE_KEYS) {
      next[key] = await uiStore.getFromStorage<any>(key, null).then(v =>
        v === null ? null : JSON.stringify(v),
      );
    }
    setValues(next);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function clearKey(key: StorageKeys) {
    const confirm = await AwaitableAlert(
      'Clear stored value',
      `Remove "${key}" from storage? The app will fall back to its default for this key.`,
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive' },
    );
    if (!confirm) return;
    await uiStore.removeFromStorage(key);
    showToast(`Cleared ${key}`, 'short');
    if (expanded === key) setExpanded(null);
    await loadAll();
  }

  return (
    <>
      <DevHeader
        title="Preference Storage"
        onBack={onExit}
        right={
          <TouchableOpacity hitSlop={12} onPress={loadAll}>
            <ArrowsClockwise size={22} color="#FFF" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingBottom: insets.bottom + 20,
          gap: 24,
          flexGrow: 1,
        }}>
        <Section
          title="Stored keys"
          description="Everything the UI store persists between launches. Tap a key to view its raw value. Clearing a key removes it and the app uses its default.">
          <Card>
            {UIStore.STORAGE_KEYS.map((key, index) => {
              const raw = values[key] ?? null;
              const isOpen = expanded === key;
              const last = index === UIStore.STORAGE_KEYS.length - 1;
              return (
                <View
                  key={key}
                  style={{
                    gap: 10,
                    borderBottomWidth: last ? 0 : 1,
                    borderBottomColor: DEV_COLORS.divider,
                    paddingBottom: last ? 0 : 12,
                  }}>
                  <TouchableOpacity
                    className="flex flex-row items-center"
                    style={{ gap: 12 }}
                    onPress={() => setExpanded(isOpen ? null : key)}>
                    <View className="flex-1 flex flex-col" style={{ gap: 2 }}>
                      <Text numberOfLines={1} className="text-white text-base font-mono">
                        {key}
                      </Text>
                      <Text style={{ color: DEV_COLORS.muted }} className="text-sm">
                        {summarize(raw)}
                      </Text>
                    </View>
                    {raw === null ? (
                      <Pill label="unset" />
                    ) : (
                      <TouchableOpacity hitSlop={10} onPress={() => clearKey(key)}>
                        <Trash size={18} color={DEV_COLORS.danger} />
                      </TouchableOpacity>
                    )}
                    {isOpen ? (
                      <CaretUp size={16} color="#FFF" />
                    ) : (
                      <CaretDown size={16} color="#FFF" />
                    )}
                  </TouchableOpacity>
                  {isOpen && (
                    <View
                      style={{ backgroundColor: DEV_COLORS.input, padding: 12, borderRadius: 8 }}>
                      <Text selectable className="text-white text-sm font-mono">
                        {pretty(raw)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </Section>
      </ScrollView>
    </>
  );
}
