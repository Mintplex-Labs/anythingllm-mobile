import React, {useContext} from 'react';
import {View} from 'react-native';

import {Title, Text, Chip, Tooltip} from 'react-native-paper';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';
import {ModelFileCard} from './ModelFileCard';

import {HuggingFaceModel} from '../../../../utils/types';
import {
  extractHFModelTitle,
  formatNumber,
  L10nContext,
  timeAgo,
} from '../../../../utils';

interface DetailsViewProps {
  hfModel: HuggingFaceModel;
}

export const DetailsView = ({hfModel}: DetailsViewProps) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  return (
    <View style={styles.content}>
      <Text variant="headlineSmall" style={styles.modelAuthor}>
        {hfModel.author}
      </Text>
      <Tooltip title={hfModel.id}>
        <Text
          ellipsizeMode="middle"
          numberOfLines={1}
          variant="headlineSmall"
          style={styles.modelTitle}>
          {extractHFModelTitle(hfModel.id)}
        </Text>
      </Tooltip>
      <View style={styles.modelStats}>
        <Chip icon="clock" compact style={styles.stat}>
          {timeAgo(hfModel.lastModified, l10n, 'long')}
        </Chip>
        <Chip icon="download" compact style={styles.stat}>
          {formatNumber(hfModel.downloads, 0)}
        </Chip>
        <Chip icon="heart" compact style={styles.stat}>
          {formatNumber(hfModel.likes, 0)}
        </Chip>
        {hfModel.trendingScore > 20 && (
          <Chip icon="trending-up" style={styles.stat} compact mode="outlined">
            🔥
          </Chip>
        )}
      </View>
      <Title style={styles.sectionTitle}>{l10n.models.details.title}</Title>
      {hfModel.siblings.map((file, index) => (
        <ModelFileCard key={index} modelFile={file} hfModel={hfModel} />
      ))}
    </View>
  );
};
