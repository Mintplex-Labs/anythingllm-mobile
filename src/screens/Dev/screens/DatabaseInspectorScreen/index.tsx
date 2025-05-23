import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput
} from 'react-native';
import { Card, Button  } from 'react-native-paper';
import { database } from '@/database';
import { useNavigation } from '@react-navigation/native';
import { PATHS } from '@/utils/paths';
import uiStore from '@/store/UIStore';
import { KeyboardAccessoryView } from '@/components/KeyboardAccessoryView';

// Define the collections we want to inspect
const COLLECTIONS = [
  'workspaces',
  'workspace_threads',
];

const DatabaseInspectorScreen = () => {
  const navigation = useNavigation();
  const [collectionData, setCollectionData] = useState<{
    [key: string]: Array<any>;
  }>({});
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [llmpref, setLlmPref] = useState<{provider: string, config: {model: string}} | null>(null);

  useEffect(() => {
    uiStore.getFromStorage('llmPreference', {provider: 'openai', config: {model: 'gpt-4'}}).then((value) => {
      setLlmPref(value);
    });
  }, []);

  // Load data for all collections
  const loadAllCollections = async () => {
    const data: { [key: string]: Array<any> } = {};

    for (const collectionName of COLLECTIONS) {
      try {
        const records = await database.collections
          .get(collectionName)
          .query()
          .fetch();

        data[collectionName] = records.map(record => ({
          ...record._raw,
        }));
      } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        data[collectionName] = [];
      }
    }

    setCollectionData(data);
  };

  useEffect(() => {
    loadAllCollections();
  }, []);


  const renderCollectionList = () => {
    return (
      <Card>
        <Card.Title title="Database Collections" />
        <Card.Content>
          {COLLECTIONS.map(collectionName => (
            <TouchableOpacity
              key={collectionName}
              onPress={() => setSelectedCollection(collectionName)}>
              <Text>{collectionName}</Text>
              <Text>
                {collectionData[collectionName]?.length || 0} records
              </Text>
            </TouchableOpacity>
          ))}
        </Card.Content>
        <Card.Actions>
          <Button onPress={loadAllCollections}>Refresh</Button>
        </Card.Actions>
      </Card>
    );
  };

  const renderRecordList = () => {
    if (!selectedCollection) {
      return null;
    }

    const records = collectionData[selectedCollection] || [];

    return (
      <Card>
        <Card.Title
          title={`${selectedCollection} (${records.length})`}
          subtitle="Tap a record to view details"
        />
        <Card.Content>
          <ScrollView>
            {records.length === 0 ? (
              <Text>No records found</Text>
            ) : (
              records.map(record => (
                <TouchableOpacity
                  key={record.id}
                  onPress={() => setSelectedRecord(record)}>
                  <Text>{record.id}</Text>
                  {record.title && (
                    <Text>{record.title}</Text>
                  )}
                  {record.session_id && (
                    <Text>
                      Session: {record.session_id}
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Card.Content>
        <Card.Actions>
          <Button onPress={() => setSelectedCollection(null)}>Back</Button>
        </Card.Actions>
      </Card>
    );
  };

  const renderRecordDetails = () => {
    if (!selectedRecord) {
      return null;
    }

    // Find the current record index and collection
    const records = collectionData[selectedCollection || ''] || [];
    const currentIndex = records.findIndex(
      record => record.id === selectedRecord.id,
    );

    // Determine if there are previous/next records
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < records.length - 1;

    // Find related records
    const relatedRecords: { [key: string]: any[] } = {};

    return (
      <Card>
        <Card.Title
          title="Record Details"
          subtitle={`${selectedCollection} (${currentIndex + 1}/${records.length
            })`}
        />
        <Card.Content>
          <ScrollView>
            {Object.entries(selectedRecord).map(([key, value]) => (
              <View key={key}>
                <Text>{key}:</Text>
                <Text>
                  {typeof value === 'object'
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </Text>
              </View>
            ))}

            {/* Related Records Section */}
            {Object.keys(relatedRecords).length > 0 && (
              <View>
                <Text>Related Records:</Text>
                {Object.entries(relatedRecords).map(
                  ([collection, relatedItems]) => (
                    <View key={collection}>
                      <Text>
                        {collection} ({relatedItems.length})
                      </Text>
                      {relatedItems.map(record => (
                        <TouchableOpacity
                          key={record.id}
                          onPress={() => {
                            setSelectedCollection(collection);
                            setSelectedRecord(record);
                          }}>
                          <Text>
                            {record.id}
                          </Text>
                          {record.title && (
                            <Text>
                              {record.title}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ),
                )}
              </View>
            )}
          </ScrollView>
        </Card.Content>
        <Card.Actions>
          <Button onPress={() => setSelectedRecord(null)} mode="outlined">
            Back
          </Button>
          <View>
            <Button
              onPress={() => setSelectedRecord(records[currentIndex - 1])}
              disabled={!hasPrevious}
              mode="text"
              icon="chevron-left">
              Prev
            </Button>
            <Button
              onPress={() => setSelectedRecord(records[currentIndex + 1])}
              disabled={!hasNext}
              mode="text"
              icon="chevron-right"
            >
              Next
            </Button>
          </View>
        </Card.Actions>
      </Card>
    );
  };

  return (
    <SafeAreaView>
      <View>
        <Text className="text-2xl font-bold text-black">Database Inspector</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate(PATHS.home as never)}>
          <Text className="text-black">Close</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={async () => {
          await database.write(async () => {
            const collections = Object.values(database.collections.map)
            for (const collection of collections) {
              await collection.query().destroyAllPermanently()
            }
          })
        }}>
          <Text className="text-red-500">Reset Database</Text>
        </TouchableOpacity>

      </View>
      <ScrollView>
        {selectedRecord
          ? renderRecordDetails()
          : selectedCollection
            ? renderRecordList()
            : renderCollectionList()}
      </ScrollView>

      <View className="flex flex-col gap-y-4">
        <Text className="text-2xl font-bold text-black">LLM Manager</Text>
        
        <KeyboardAccessoryView
          useListenersOnAndroid={true}
          renderScrollable={(panHandlers) => (
            <View className="flex flex-col gap-y-4 h-[200px]" {...panHandlers}>
              <View className="flex flex-col gap-y-4">
                <TextInput
                  placeholder="Provider"
                  className="px-2 rounded-md text-lg text-white bg-[--secondary-bg]"
                  value={llmpref?.provider}
                  // @ts-ignore
                  onChangeText={(text: string) => setLlmPref({...llmpref, provider: text})}
              />
              <TextInput
                placeholder="Model"
                className="px-2 rounded-md text-lg text-white bg-[--secondary-bg]"
                value={llmpref?.config?.model}
                // @ts-ignore
                onChangeText={(text: string) => setLlmPref({...llmpref, config: {...llmpref?.config, model: text}})}
              />
            </View>
            <TouchableOpacity onPress={() => uiStore.setToStorage('llmPreference', llmpref)}>
              <Text className="text-blue-500">Save LLM Preference</Text>
            </TouchableOpacity>
            </View>
          )}
        >
          
        </KeyboardAccessoryView>
      </View>
    </SafeAreaView>
  );
};

export default DatabaseInspectorScreen;
