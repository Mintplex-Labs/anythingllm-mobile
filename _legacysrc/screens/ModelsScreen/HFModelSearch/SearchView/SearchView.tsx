import React, {useState, useEffect, useContext} from 'react';
import {Keyboard, Platform, TouchableOpacity, View} from 'react-native';

import {observer} from 'mobx-react';
import {Text, Chip, Button} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {KeyboardAwareScrollView} from 'react-native-keyboard-controller';
import {BottomSheetFlatList, BottomSheetView} from '@gorhom/bottom-sheet';

import {Divider, Searchbar} from '../../../../components';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';

import {hfStore} from '../../../../store';

import {HuggingFaceModel} from '../../../../utils/types';
import {
  extractHFModelTitle,
  formatNumber,
  timeAgo,
  L10nContext,
} from '../../../../utils';

interface SearchViewProps {
  testID?: string;
  onModelSelect: (model: HuggingFaceModel) => void;
  onChangeSearchQuery: (query: string) => void;
}

export const SearchView = observer(
  ({testID, onModelSelect, onChangeSearchQuery}: SearchViewProps) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const l10n = useContext(L10nContext);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
      const keyboardWillShow = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        () => setKeyboardVisible(true),
      );
      const keyboardWillHide = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setKeyboardVisible(false),
      );

      return () => {
        keyboardWillShow.remove();
        keyboardWillHide.remove();
      };
    }, []);

    const styles = createStyles(theme, keyboardVisible ? 0 : insets.bottom);
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearchChange = (query: string) => {
      setSearchQuery(query);
      onChangeSearchQuery(query);
    };

    const renderItem = ({item}: {item: HuggingFaceModel}) => (
      <TouchableOpacity key={item.id} onPress={() => onModelSelect(item)}>
        <Text variant="labelMedium" style={styles.modelAuthor}>
          {item.author}
        </Text>
        <Text style={styles.modelName}>{extractHFModelTitle(item.id)}</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Icon
              name="clock-outline"
              size={12}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="labelSmall" style={styles.statText}>
              {timeAgo(item.lastModified, l10n, 'short')}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Icon
              name="download-outline"
              size={12}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="labelSmall" style={styles.statText}>
              {formatNumber(item.downloads)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Icon
              name="heart-outline"
              size={12}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="labelSmall" style={styles.statText}>
              {formatNumber(item.likes)}
            </Text>
          </View>
          {Boolean(item.gated) && (
            <Chip compact mode="outlined" textStyle={styles.gatedChipText}>
              <Icon name="lock" size={12} color={theme.colors.primary} />{' '}
              {l10n.components.hfTokenSheet.gatedModelIndicator}
            </Chip>
          )}
        </View>
        <Divider style={styles.divider} />
      </TouchableOpacity>
    );

    // Renders the appropriate empty state based on loading, error or no results
    const renderEmptyState = observer(() => {
      if (hfStore.isLoading) {
        console.log('renderEmptyState Loading');
        return null;
      }

      if (hfStore.error) {
        return (
          <View style={styles.emptyStateContainer}>
            <Icon
              name="alert-circle-outline"
              size={24}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={styles.noResultsText}>
              {l10n.models.search.errorOccurred}
            </Text>
            <Text style={styles.errorText}>{hfStore.error.message}</Text>
            {hfStore.error.code === 'authentication' && (
              <Text style={styles.errorHintText}>
                {l10n.components.hfTokenSheet.searchErrorHint}
              </Text>
            )}
            {hfStore.error.code === 'authentication' && hfStore.useHfToken && (
              <Button
                mode="outlined"
                style={styles.disableTokenButton}
                onPress={() => {
                  hfStore.setUseHfToken(false);
                  hfStore.clearError();
                  hfStore.fetchModels();
                }}>
                {l10n.components.hfTokenSheet.disableAndRetry}
              </Button>
            )}
          </View>
        );
      }

      if (searchQuery.length > 0) {
        return (
          <Text style={styles.noResultsText}>
            {l10n.models.search.noResults}
          </Text>
        );
      }

      return null;
    });

    return (
      <BottomSheetView style={styles.contentContainer} testID={testID}>
        <BottomSheetFlatList
          data={hfStore.models}
          keyExtractor={(item: HuggingFaceModel) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          renderScrollComponent={props => (
            <KeyboardAwareScrollView bottomOffset={100} {...props} />
          )}
          onEndReached={() => {
            hfStore.fetchMoreModels();
          }}
          onEndReachedThreshold={0.3}
          maintainVisibleContentPosition={
            hfStore.models.length > 0
              ? {
                  minIndexForVisible: 0,
                }
              : null
          }
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={observer(() =>
            hfStore.isLoading ? (
              <Text style={styles.loadingMoreText}>
                {l10n.models.search.loadingMore}
              </Text>
            ) : null,
          )}
        />
        <Searchbar
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder={l10n.models.search.searchPlaceholder}
          containerStyle={styles.searchbarContainer}
        />
      </BottomSheetView>
    );
  },
);
