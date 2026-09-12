import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowsClockwise, CaretLeft, CaretRight } from 'phosphor-react-native';
import { database, databaseTables } from '@/database';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import { Button, Card, DEV_COLORS, DevHeader, Pill, Row, Section } from '../../components';

type RawRecord = { id: string; [key: string]: any };
type CollectionData = { [collection: string]: RawRecord[] };

/** Best-effort human label for a record row, falling back to nothing when the table has no name-like column. */
function recordLabel(record: RawRecord): string | null {
  return record.name ?? record.title ?? record.slug ?? record.filename ?? null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'string') {
    // Pretty-print JSON stored as a string so it's readable.
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {}
    }
  }
  return String(value);
}

export default function DatabaseInspectorView({ onExit }: { onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CollectionData>({});
  const [loading, setLoading] = useState(false);
  const [collection, setCollection] = useState<string | null>(null);
  const [record, setRecord] = useState<RawRecord | null>(null);

  // Refs so the hardware back handler (registered once) sees current depth.
  const collectionRef = useRef<string | null>(null);
  const recordRef = useRef<RawRecord | null>(null);
  function openCollection(name: string | null) {
    collectionRef.current = name;
    setCollection(name);
  }
  function openRecord(next: RawRecord | null) {
    recordRef.current = next;
    setRecord(next);
  }

  function goBack() {
    if (recordRef.current) return openRecord(null);
    if (collectionRef.current) return openCollection(null);
    onExit();
  }
  useHighjackBackButtonPress(() => {
    goBack();
    return true;
  });

  async function loadAll() {
    setLoading(true);
    const next: CollectionData = {};
    for (const name of databaseTables) {
      try {
        const rows = await database.collections.get(name).query().fetch();
        next[name] = rows.map(row => ({ ...(row._raw as RawRecord) }));
      } catch (error) {
        console.error(`Error fetching ${name}:`, error);
        next[name] = [];
      }
    }
    setData(next);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const records = collection ? data[collection] ?? [] : [];
  const recordIndex = record ? records.findIndex(r => r.id === record.id) : -1;
  const hasPrevious = recordIndex > 0;
  const hasNext = recordIndex >= 0 && recordIndex < records.length - 1;

  const title = record ? 'Record' : collection ?? 'Database';
  const headerRight = record ? (
    <Text style={{ color: DEV_COLORS.muted }} className="text-sm">
      {recordIndex + 1} of {records.length}
    </Text>
  ) : (
    <TouchableOpacity
      hitSlop={12}
      disabled={loading}
      onPress={async () => {
        await loadAll();
        showToast('Collections refreshed', 'short');
      }}>
      <ArrowsClockwise size={22} color="#FFF" style={{ opacity: loading ? 0.4 : 1 }} />
    </TouchableOpacity>
  );

  return (
    <>
      <DevHeader title={title} onBack={goBack} right={headerRight} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingBottom: insets.bottom + 20,
          gap: 24,
          flexGrow: 1,
        }}>
        {!collection && (
          <Section
            title="Collections"
            description="Tap a collection to browse its records. Counts reflect the last refresh.">
            <Card>
              {databaseTables.map((name, index) => (
                <Row
                  key={name}
                  title={name}
                  right={<Pill label={data[name]?.length ?? 0} />}
                  onPress={() => openCollection(name)}
                  borderBottom={index !== databaseTables.length - 1}
                />
              ))}
            </Card>
          </Section>
        )}

        {collection && !record && (
          <Section title={`${records.length} record${records.length === 1 ? '' : 's'}`}>
            <Card>
              {records.length === 0 ? (
                <Text style={{ color: DEV_COLORS.muted }} className="text-base text-center py-2">
                  No records in this collection
                </Text>
              ) : (
                records.map((row, index) => (
                  <Row
                    key={row.id}
                    title={recordLabel(row) ?? row.id}
                    subtitle={recordLabel(row) ? row.id : undefined}
                    onPress={() => openRecord(row)}
                    borderBottom={index !== records.length - 1}
                  />
                ))
              )}
            </Card>
          </Section>
        )}

        {record && (
          <>
            <Section title="Fields">
              <Card>
                {Object.entries(record).map(([key, value], index, all) => (
                  <View
                    key={key}
                    style={{
                      gap: 4,
                      borderBottomWidth: index !== all.length - 1 ? 1 : 0,
                      borderBottomColor: DEV_COLORS.divider,
                      paddingBottom: index !== all.length - 1 ? 12 : 0,
                    }}>
                    <Text style={{ color: DEV_COLORS.muted }} className="text-sm uppercase">
                      {key}
                    </Text>
                    <Text selectable className="text-white text-sm font-mono">
                      {formatValue(value)}
                    </Text>
                  </View>
                ))}
              </Card>
            </Section>

            <View className="flex-1" />
            <View className="flex flex-row" style={{ gap: 12 }}>
              <Button
                label="Previous"
                variant="secondary"
                disabled={!hasPrevious}
                icon={<CaretLeft size={16} color="#FFF" />}
                style={{ flex: 1 }}
                onPress={() => openRecord(records[recordIndex - 1])}
              />
              <Button
                label="Next"
                variant="secondary"
                disabled={!hasNext}
                icon={<CaretRight size={16} color="#FFF" />}
                style={{ flex: 1, flexDirection: 'row-reverse' }}
                onPress={() => openRecord(records[recordIndex + 1])}
              />
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}
