import React from 'react';

import {createDrawerNavigator} from '@react-navigation/drawer';
import {render, fireEvent, act} from '../../../../../jest/test-utils';

import {ModelNotLoadedMessage} from '../ModelNotLoadedMessage';

import {modelStore} from '../../../../store';

import {l10n} from '../../../../utils/l10n';
import {basicModel, modelsList} from '../../../../../jest/fixtures/models';

const Drawer = createDrawerNavigator();
const mockNavigate = jest.fn();

//jest.useFakeTimers();

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

const customRender = (ui, {...renderOptions} = {}) => {
  return render(
    <Drawer.Navigator useLegacyImplementation={false}>
      <Drawer.Screen name="Test" component={() => ui} />
    </Drawer.Navigator>,
    {...renderOptions, withNavigation: true},
  );
};

describe('ModelNotLoadedMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.models = modelsList;
    modelStore.lastUsedModelId = undefined;
    (modelStore.initContext as jest.Mock).mockReset();
  });

  it('renders correctly when no last used model exists', () => {
    const {getByText} = customRender(<ModelNotLoadedMessage />);
    expect(getByText(l10n.en.chat.pleaseLoadModel)).toBeTruthy();
  });

  it('renders correctly when last used model exists', () => {
    modelStore.lastUsedModelId = modelStore.models[0].id;
    const {getByText} = customRender(<ModelNotLoadedMessage />);

    expect(getByText(l10n.en.chat.readyToChat)).toBeTruthy();
    expect(getByText(l10n.en.chat.load)).toBeTruthy();
  });

  it('navigates to Models page when no last model exists', () => {
    const {getByText} = customRender(<ModelNotLoadedMessage />);

    fireEvent.press(getByText(l10n.en.chat.goToModels));

    expect(mockNavigate).toHaveBeenCalledWith('Models');
  });

  it('loads last used model when available', async () => {
    modelStore.lastUsedModelId = basicModel.id;
    (modelStore.initContext as jest.Mock).mockResolvedValue(undefined);

    const {getByText} = customRender(<ModelNotLoadedMessage />);

    await act(async () => {
      fireEvent.press(getByText(l10n.en.chat.load));
    });

    expect(modelStore.initContext).toHaveBeenCalledWith(basicModel);
  });

  it('handles model loading error correctly', async () => {
    modelStore.lastUsedModelId = basicModel.id;

    const mockError = new Error('Failed to load model');
    (modelStore.initContext as jest.Mock).mockRejectedValue(mockError);

    // TODO: is there a better way to test this that relying on console.log?
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const {getByText} = customRender(<ModelNotLoadedMessage />);

    await act(async () => {
      fireEvent.press(getByText(l10n.en.chat.load));
    });

    expect(modelStore.initContext).toHaveBeenCalledWith(basicModel);
    expect(consoleSpy).toHaveBeenCalledWith(`Error: ${mockError}`);

    consoleSpy.mockRestore();
  });

  it('updates last used model state on mount', async () => {
    modelStore.lastUsedModelId = basicModel.id;

    const {getByText} = customRender(<ModelNotLoadedMessage />);

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(getByText(l10n.en.chat.readyToChat)).toBeTruthy();
  });
});
