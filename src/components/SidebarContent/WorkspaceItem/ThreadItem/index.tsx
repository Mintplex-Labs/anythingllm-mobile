import React, { useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

const THREAD_CALLOUT_DETAIL_WIDTH = 26;

export default function ThreadItem({
  isActive,
  thread,
  hasPrevious,
  highlightDownstroke,
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
    <View className="w-full relative flex h-[38px] items-center border-none rounded-lg">
      {/* Curved line Element and leader if required */}
      <View
        style={{ width: THREAD_CALLOUT_DETAIL_WIDTH / 2 }}
        className={`${isActive
          ? "border-l-2 border-b-2 border-[--primary-text] z-[2]"
          : "border-l border-b border-[--secondary-text] z-[1]"
          } h-[50%] absolute top-0 left-3 rounded-bl-lg`}
      />

      {/* Downstroke border for next item */}
      {hasPrevious && (
        <View
          style={{ width: THREAD_CALLOUT_DETAIL_WIDTH / 2 }}
          className={`${highlightDownstroke
            ? "border-l-2 border-[--primary-text] z-[2]"
            : "border-l border-[--secondary-text] z-[1]"
            } h-[100%] absolute -top-[99%] left-3`}
        />
      )}

      {/* Curved line inline placeholder for spacing */}
      <View
        style={{ width: THREAD_CALLOUT_DETAIL_WIDTH + 8 }}
        className="h-full"
      />

      <View
        className={`absolute top-1 left-6 flex w-full items-center justify-between pr-2 ${isActive
          ? "bg-[--primary-bg] border border-solid border-transparent"
          : ""
          } rounded-[4px]`}
      >
        <TouchableOpacity
          onPress={onPress}
          onLongPress={handleLongPress}
          className="w-full pl-2 py-1 overflow-hidden"
        >
          <Text
            className={`text-left truncate max-w-[150px] ${isActive ? "font-medium text-[--primary-text]" : "text-[--secondary-text]"
              }`}
          >
            {thread.name}
          </Text>
        </TouchableOpacity>
      </View>

      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={['25%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: 'var(--secondary-bg)' }}
        handleIndicatorStyle={{ backgroundColor: 'var(--primary-button)' }}
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
      </BottomSheetModal>
    </View>
  );
}