import React, { Fragment } from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { List } from 'phosphor-react-native';

export default function TopBar() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();

  return (
    <Fragment>
      <View className="flex flex-row items-center justify-between px-4 py-3">
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
        >
          <List size={24} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('DevToolsDatabaseInspector')}>
          <Image
            source={require('@/assets/logo/anything-llm.png')}
            className="h-8 w-32"
            resizeMode="contain"
          />
        </TouchableOpacity>
        <View className='w-[32px]' />
      </View>
      <View className="h-[1px] bg-white/10 w-[1000vw] left-[-50%]" />
    </Fragment>
  );
} 