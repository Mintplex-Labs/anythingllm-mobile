import React, {useContext} from 'react';
import {Button, Paragraph, ProgressBar, Text} from 'react-native-paper';
import {modelStore} from '../../store';
import {Model} from '../../utils/types';
import {useTheme} from '../../hooks';
import {View} from 'react-native';
import {createStyles} from './styles';
import {useNavigation} from '@react-navigation/native';
import {observer} from 'mobx-react';
import {L10nContext} from '../../utils';

export const ModelNotAvailable = observer(
  ({model, closeSheet}: {model?: Model; closeSheet: () => void}) => {
    const theme = useTheme();
    const navigation = useNavigation<any>();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const isPalModelDownloaded = modelStore.isModelAvailable(model?.id);
    const defaultModel = modelStore.models.find(m => m.id === model?.id);

    const isDownloading = defaultModel
      ? modelStore.isDownloading(defaultModel.id)
      : false;
    const downloadProgress = (defaultModel?.progress || 0) / 100;
    const downloadSpeed = defaultModel?.downloadSpeed;

    const hasAnyDownloadedModel = modelStore.availableModels.length > 0;

    const handleDownloadModel = async (modelToDownload: Model) => {
      if (modelToDownload.hfModel) {
        await modelStore.downloadHFModel(
          modelToDownload.hfModel!,
          modelToDownload.hfModelFile!,
        );
      } else {
        await modelStore.checkSpaceAndDownload(modelToDownload.id);
      }
    };

    const handleNavigateToModels = () => {
      closeSheet();
      navigation.navigate('Models');
    };

    if (!hasAnyDownloadedModel && !model) {
      return (
        <View style={styles.modelNotDownloaded}>
          <Text style={{color: theme.colors.error}}>
            {l10n.components.modelNotAvailable.noModelsDownloaded}
          </Text>
          <Button onPress={handleNavigateToModels} mode="contained-tonal">
            {l10n.components.modelNotAvailable.downloadAModel}
          </Button>
        </View>
      );
    }
    if (model && !isPalModelDownloaded) {
      return (
        <View style={styles.modelNotDownloaded}>
          {isDownloading ? (
            <>
              <ProgressBar
                testID="download-progress-bar"
                progress={downloadProgress}
                color={theme.colors.tertiary}
                style={styles.progressBar}
              />
              {downloadSpeed && <Paragraph>{downloadSpeed}</Paragraph>}
            </>
          ) : (
            <Text style={{color: theme.colors.error}}>
              {l10n.components.modelNotAvailable.defaultModelNotDownloaded}
            </Text>
          )}

          <Button
            onPress={() =>
              isDownloading
                ? modelStore.cancelDownload(model.id)
                : handleDownloadModel(model)
            }
            mode="contained-tonal">
            {isDownloading
              ? l10n.components.modelNotAvailable.cancelDownload
              : l10n.components.modelNotAvailable.download}
          </Button>
        </View>
      );
    }
    return null;
  },
);
