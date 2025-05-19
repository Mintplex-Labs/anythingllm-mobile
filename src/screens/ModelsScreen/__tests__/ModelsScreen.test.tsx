import React from 'react';
import {Alert} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import {fireEvent, render, waitFor, act} from '../../../../jest/test-utils';

import {ModelsScreen} from '../ModelsScreen';

import {modelStore} from '../../../store';

jest.useFakeTimers();

describe('ModelsScreen', () => {
  beforeEach(() => {
    //(useTheme as jest.Mock).mockReturnValue(mockTheme);
    jest.clearAllMocks();
  });

  it('renders correctly', async () => {
    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });
    expect(getByTestId('flat-list')).toBeTruthy();
    expect(getByTestId('fab-group')).toBeTruthy();
  });

  it('refreshes models on pull-to-refresh', async () => {
    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });

    const flatList = getByTestId('flat-list');
    const refreshControl = flatList.props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    expect(modelStore.refreshDownloadStatuses).toHaveBeenCalled();
  });

  it('opens HF model search when the HF FAB is pressed', async () => {
    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const hfFab = getByTestId('hf-fab', {includeHiddenElements: true});
      expect(hfFab).toBeTruthy();
    });
    const hfFab = getByTestId('hf-fab', {includeHiddenElements: true});

    await act(async () => {
      fireEvent.press(hfFab);
    });

    // Verify HFModelSearch is rendered
    await waitFor(() => {
      const hfModelSearch = getByTestId('hf-model-search-view');
      expect(hfModelSearch).toBeTruthy();
    });
  });

  it('adds a local model when the plus FAB is pressed', async () => {
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      if (addLocalModelButton) {
        fireEvent.press(addLocalModelButton);
      }
    });

    await waitFor(() => {
      expect(DocumentPicker.pick).toHaveBeenCalled();
      expect(RNFS.copyFile).toHaveBeenCalledWith(
        '/mock/file/path',
        '/path/to/documents/models/local/mockModelFile.bin',
      );
      expect(modelStore.addLocalModel).toHaveBeenCalledWith(
        '/path/to/documents/models/local/mockModelFile.bin',
      );
    });
  });

  it('shows a confirmation alert if file already exists and replaces it', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    jest.spyOn(Alert, 'alert').mockImplementation((_, __, buttons) => {
      buttons![0].onPress!();
    });

    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      fireEvent.press(addLocalModelButton);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        '/path/to/documents/models/local/mockModelFile.bin',
      );
      expect(RNFS.copyFile).toHaveBeenCalled();
      expect(modelStore.addLocalModel).toHaveBeenCalled();
    });
  });

  it('does not replace or copy the file when user cancels the action', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    jest.spyOn(Alert, 'alert').mockImplementation((_, __, buttons) => {
      // pressing "Cancel"
      buttons![2].onPress!();
    });

    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });
    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      fireEvent.press(addLocalModelButton);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
      expect(RNFS.unlink).not.toHaveBeenCalled(); // File should not be unlinked (deleted)
      expect(RNFS.copyFile).not.toHaveBeenCalled(); // File should not be copied
      expect(modelStore.addLocalModel).not.toHaveBeenCalled(); // Model should not be added
    });
  });

  it('keeps both files when user chooses to keep both', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(true); // File already exists
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    jest.spyOn(Alert, 'alert').mockImplementation((_, __, buttons) => {
      // pressing "Keep Both"
      buttons![1].onPress!();
    });

    let counter = 1;
    (RNFS.exists as jest.Mock).mockImplementation(async path => {
      if (path.includes(`mockModelFile_${counter}.bin`)) {
        return false; // Ensure new file doesn't exist
      }
      return true; // Original file exists
    });

    const {getByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      fireEvent.press(addLocalModelButton);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
      expect(RNFS.unlink).not.toHaveBeenCalled(); // Original file should not be deleted
      expect(RNFS.copyFile).toHaveBeenCalledWith(
        '/mock/file/path',
        `/path/to/documents/models/local/mockModelFile_${counter}.bin`,
      );
      expect(modelStore.addLocalModel).toHaveBeenCalledWith(
        `/path/to/documents/models/local/mockModelFile_${counter}.bin`,
      );
    });
  });

  // TODO: fix this test
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('hides reset dialog on cancel', async () => {
    const {getByTestId, queryByTestId} = render(<ModelsScreen />, {
      withNavigation: true,
    });

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const resetFab = getByTestId('reset-fab', {includeHiddenElements: true});
      expect(resetFab).toBeTruthy();
    });
    const resetFab = getByTestId('reset-fab', {includeHiddenElements: true});

    await act(async () => {
      fireEvent.press(resetFab);
    });

    // Wait for dialog to be visible
    await waitFor(() => {
      expect(getByTestId('reset-dialog')).toBeTruthy();
    });

    // Press cancel button
    const cancelButton = getByTestId('cancel-reset-button');
    await act(async () => {
      fireEvent.press(cancelButton);
    });

    // Wait for dialog to be hidden
    await waitFor(
      () => {
        expect(queryByTestId('reset-dialog')).toBeNull();
      },
      {
        timeout: 10000,
      },
    );
  }, 15000);
});
