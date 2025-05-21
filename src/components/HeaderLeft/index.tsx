import React from 'react';
import { TouchableOpacity } from 'react-native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import useTheme from '@/hooks/useTheme';
import { styles } from './styles';
// import { MenuIcon } from '../../assets/icons';

export default function HeaderLeft() {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<any>>();

  return (
    <TouchableOpacity
      style={[styles.menuIcon]}
      onPress={() => navigation.openDrawer()}>
      {/* <MenuIcon stroke={theme.colors.primary} /> */}
    </TouchableOpacity>
  );
};
