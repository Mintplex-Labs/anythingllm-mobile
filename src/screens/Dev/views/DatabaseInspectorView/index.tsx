import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { database, databaseTables } from '@/database';
import uiStore from '@/store/UIStore';
import { showToast } from '@/utils/Notification';

// Define the collections we want to inspect
const COLLECTIONS = databaseTables;
const DatabaseInspectorView = () => {
  const [collectionData, setCollectionData] = useState<{
    [key: string]: Array<any>;
  }>({});
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // Load data for all collections
  const loadAllCollections = async () => {
    const data: { [key: string]: Array<any> } = {};

    for (const collectionName of COLLECTIONS) {
      try {
        const records = await database.collections
          .get(collectionName)
          .query()
          .fetch();
        data[collectionName] = records.map(record => ({ ...record._raw }));
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

  const renderCollectionList = () => (
    <View className="bg-[--secondary-bg] rounded-xl p-4 mb-4">
      <Text className="text-white text-2xl font-bold mb-4">
        Database Collections
      </Text>
      <ScrollView className="max-h-[300px]">
        {COLLECTIONS.map(collectionName => (
          <TouchableOpacity
            key={collectionName}
            className="flex-row justify-between items-center p-4 mb-2 bg-[--primary-bg] rounded-lg"
            onPress={() => setSelectedCollection(collectionName)}>
            <Text className="text-white text-lg font-medium">
              {collectionName}
            </Text>
            <View className="bg-[--cta-light-blue] px-3 py-1 rounded-full">
              <Text className="text-[--dark] font-medium">
                {collectionData[collectionName]?.length || 0}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity
        onPress={loadAllCollections}
        className="bg-[--cta-light-blue] rounded-lg p-4 mt-4">
        <Text className="text-[--dark] font-bold text-center">
          Refresh Collections
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderRecordList = () => {
    if (!selectedCollection) return null;
    const records = collectionData[selectedCollection] || [];

    return (
      <View className="bg-[--secondary-bg] rounded-xl p-4 mb-4">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-white text-2xl font-bold">
            {selectedCollection}
          </Text>
          <View className="bg-[--cta-light-blue] px-3 py-1 rounded-full">
            <Text className="text-[--dark] font-medium">
              {records.length} records
            </Text>
          </View>
        </View>
        <ScrollView className="max-h-[400px]">
          {records.length === 0 ? (
            <Text className="text-[#6c757d] italic text-center py-4">
              No records found
            </Text>
          ) : (
            records.map(record => (
              <TouchableOpacity
                key={record.id}
                className="p-4 mb-2 bg-[--primary-bg] rounded-lg"
                onPress={() => setSelectedRecord(record)}>
                <Text className="text-white font-medium mb-1">
                  ID: {record.id}
                </Text>
                {record.title && (
                  <Text className="text-[#B2DDFF]">{record.title}</Text>
                )}
                {record.session_id && (
                  <Text className="text-[#6c757d]">
                    Session: {record.session_id}
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
        <TouchableOpacity
          onPress={() => setSelectedCollection(null)}
          className="bg-[--cta-light-blue] rounded-lg p-4 mt-4">
          <Text className="text-[--dark] font-bold text-center">
            Back to Collections
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRecordDetails = () => {
    if (!selectedRecord) return null;

    const records = collectionData[selectedCollection || ''] || [];
    const currentIndex = records.findIndex(
      record => record.id === selectedRecord.id,
    );
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < records.length - 1;

    return (
      <View className="bg-[--secondary-bg] rounded-xl p-4 mb-4">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-white text-2xl font-bold">Record Details</Text>
          <Text className="text-[#B2DDFF]">
            {currentIndex + 1} of {records.length}
          </Text>
        </View>
        <ScrollView
          nestedScrollEnabled={true}
          style={{ maxHeight: 400 }}
          contentContainerStyle={{ paddingBottom: 8 }}>
          {Object.entries(selectedRecord).map(([key, value]) => (
            <View key={key} className="p-4 mb-2 bg-[--primary-bg] rounded-lg">
              <Text className="text-[#B2DDFF] font-medium mb-1">{key}</Text>
              <Text className="text-white font-mono">
                {typeof value === 'object'
                  ? JSON.stringify(value, null, 2)
                  : String(value)}
              </Text>
            </View>
          ))}
        </ScrollView>
        <View className="flex-row justify-between items-center mt-4">
          <TouchableOpacity
            onPress={() => setSelectedRecord(null)}
            className="bg-[--cta-light-blue] rounded-lg px-6 py-3">
            <Text className="text-[--dark] font-bold">Back</Text>
          </TouchableOpacity>
          <View className="flex-row gap-x-2">
            <TouchableOpacity
              onPress={() => setSelectedRecord(records[currentIndex - 1])}
              disabled={!hasPrevious}
              className={`rounded-lg px-6 py-3 ${
                hasPrevious ? 'bg-[--cta-light-blue]' : 'bg-[--primary-bg]'
              }`}>
              <Text
                className={hasPrevious ? 'text-[--dark]' : 'text-[#6c757d]'}
                style={{ fontWeight: '600' }}>
                Previous
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectedRecord(records[currentIndex + 1])}
              disabled={!hasNext}
              className={`rounded-lg px-6 py-3 ${
                hasNext ? 'bg-[--cta-light-blue]' : 'bg-[--primary-bg]'
              }`}>
              <Text
                className={hasNext ? 'text-[--dark]' : 'text-[#6c757d]'}
                style={{ fontWeight: '600' }}>
                Next
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="mb-6">
      {selectedRecord
        ? renderRecordDetails()
        : selectedCollection
        ? renderRecordList()
        : renderCollectionList()}

      {!selectedRecord && !selectedCollection && (
        <View className="flex flex-row gap-x-4">
          <TouchableOpacity
            className="flex-1 bg-red-500 rounded-lg p-4 shadow-sm"
            onPress={async () => {
              await database.write(async () => {
                const collections = Object.values(database.collections.map);
                for (const collection of collections) {
                  await collection.query().destroyAllPermanently();
                }
              });
              loadAllCollections();
              showToast('Database has been reset');
            }}>
            <Text className="text-white text-center font-bold">
              Reset Database
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-1 bg-blue-500 rounded-lg p-4 shadow-sm"
            onPress={() => {
              uiStore.resetAllStorage();
              showToast('Onboarding has been reset');
            }}>
            <Text className="text-white text-center font-bold">
              Reset Onboarding
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default DatabaseInspectorView;
