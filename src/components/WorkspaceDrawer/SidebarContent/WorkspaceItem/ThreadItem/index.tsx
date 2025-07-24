import React, { useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

export default function ThreadItem({
  isActive,
  thread,
  onPress,
  onDelete,
  onRename,
}) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    []
  );

  const handleLongPress = () => {
    bottomSheetRef.current?.present();
  };

  const handleDelete = () => {
    bottomSheetRef.current?.dismiss();
    onDelete?.(thread);
  };

  const handleRename = () => {
    bottomSheetRef.current?.dismiss();
    onRename?.(thread);
  };

  return (
    <View className="w-full relative flex rounded-lg">
      <TouchableOpacity
        onPress={onPress}
        onLongPress={handleLongPress}
        className="w-full pl-2 py-1"
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          className={`text-left text-lg w-[150px] ${isActive ? "font-medium text-[--primary-text]" : "text-[--secondary-text]"}`}
        >
          {thread.name}
        </Text>
      </TouchableOpacity>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={['25%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: '#1B1B1E' }}
        handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
      >
        <View className="flex-1 p-4">
          <TouchableOpacity
            onPress={handleRename}
            className="flex-row items-center py-3 px-2"
          >
            <Text className="text-[--primary-text] text-lg">Rename</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            className="flex-row items-center py-3 px-2"
          >
            <Text className="text-red-500 text-lg">Delete</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal >
    </View >
  );
}