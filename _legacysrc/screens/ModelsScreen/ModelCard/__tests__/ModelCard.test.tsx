import React from 'react';
import {Linking} from 'react-native';

import {createDrawerNavigator} from '@react-navigation/drawer';

import {render, fireEvent, waitFor, act} from '../../../../../jest/test-utils';
import {
  basicModel,
  downloadedModel,
  downloadingModel,
  largeMemoryModel,
} from '../../../../../jest/fixtures/models';

import {ModelCard} from '../ModelCard';

import {downloadManager} from '../../../../services/downloads';

import {modelStore, uiStore} from '../../../../store';

import {l10n} from '../../../../utils/l10n';

const Drawer = createDrawerNavigator();

jest.useFakeTimers(); // Mock all timers

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockImplementation(() => Promise.resolve()),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  canOpenURL: jest.fn().mockImplementation(() => Promise.resolve(true)),
  getInitialURL: jest.fn().mockImplementation(() => Promise.resolve(null)),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

const customRender = (ui, {...renderOptions} = {}) => {
  return render(
    <Drawer.Navigator useLegacyImplementation={false}>
      <Drawer.Screen name="Chat" component={() => ui} />
    </Drawer.Navigator>,
    {...renderOptions, withNavigation: true},
  );
};

describe('ModelCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders model details correctly', async () => {
    const {getByText} = customRender(<ModelCard model={basicModel} />);
    await waitFor(() => {
      expect(getByText(basicModel.name)).toBeTruthy();
    });
  });

  it('handles memory warning correctly', async () => {
    const {getByText, getByTestId, queryByText, queryByTestId} = customRender(
      <ModelCard model={largeMemoryModel} />,
    );

    // If the model is downloaded and the device is low on memory, the warning should be displayed.
    await waitFor(() => {
      expect(getByText(l10n.en.memory.shortWarning)).toBeTruthy();
      expect(queryByTestId('memory-warning-snackbar')).toBeNull();
    });

    // Snackbar
    fireEvent.press(getByTestId('memory-warning-button'));
    await waitFor(() => {
      expect(getByText(l10n.en.common.dismiss)).toBeTruthy();
      expect(queryByTestId('memory-warning-snackbar')).toBeTruthy();
    });
    act(() => {
      fireEvent.press(getByText(l10n.en.common.dismiss));
    });
    await waitFor(() => {
      expect(queryByText(l10n.en.common.dismiss)).toBeNull();
      expect(queryByTestId('memory-warning-snackbar')).toBeNull();
    });
  }, 10000);

  it('handles download overlay and download button correctly', async () => {
    if (!jest.isMockFunction(modelStore.checkSpaceAndDownload)) {
      jest.spyOn(modelStore, 'checkSpaceAndDownload');
    }

    const {getByTestId, queryByTestId} = customRender(
      <ModelCard model={basicModel} />,
    );

    await waitFor(() => {
      expect(getByTestId('download-button')).toBeTruthy();
      expect(queryByTestId('download-progress-bar')).toBeNull();
    });
    const downloadButton = getByTestId('download-button');

    act(() => {
      fireEvent.press(downloadButton);
    });

    expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
      basicModel.id,
    );
  });

  it('progress bar is shown when downloading', async () => {
    // Mock the isDownloading method to return true for the downloadingModel
    (downloadManager.isDownloading as jest.Mock).mockImplementation(modelId => {
      return modelId === downloadingModel.id;
    });

    // Mock the getDownloadProgress method to return a progress value
    (downloadManager.getDownloadProgress as jest.Mock).mockImplementation(
      modelId => {
        return modelId === downloadingModel.id ? 50 : 0; // 50% progress
      },
    );

    const {getByTestId, queryByTestId, rerender} = render(
      <ModelCard model={basicModel} />,
    );

    await waitFor(() => {
      expect(getByTestId('download-button')).toBeTruthy();
      expect(queryByTestId('download-progress-bar')).toBeNull();
    });

    rerender(<ModelCard model={downloadingModel} />);

    await waitFor(() => {
      expect(getByTestId('download-progress-bar')).toBeTruthy();
    });
  });

  it('opens the HuggingFace URL when the icon button is pressed', () => {
    const {getByTestId} = customRender(<ModelCard model={basicModel} />);

    const openButton = getByTestId('open-huggingface-url');
    fireEvent.press(openButton);

    expect(Linking.openURL).toHaveBeenCalledWith(basicModel.hfUrl);
  });

  it('handles model load correctly', async () => {
    const {getByTestId} = customRender(<ModelCard model={downloadedModel} />);

    expect(getByTestId('load-button')).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId('load-button'));
    });

    expect(modelStore.initContext).toHaveBeenCalledWith(downloadedModel);
    expect(mockNavigate).not.toHaveBeenCalled();

    uiStore.autoNavigatetoChat = true;
    act(() => {
      fireEvent.press(getByTestId('load-button'));
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Chat');
    });
  });

  it('handles model offload', async () => {
    const {getByTestId} = customRender(
      <ModelCard model={downloadedModel} activeModelId={downloadedModel.id} />,
    );

    expect(getByTestId('offload-button')).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId('offload-button'));
    });

    expect(modelStore.manualReleaseContext).toHaveBeenCalled();
  });
});
