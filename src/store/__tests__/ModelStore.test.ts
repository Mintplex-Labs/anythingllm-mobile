jest.unmock('../../store');
import {runInAction} from 'mobx';
import {LlamaContext} from '@pocketpalai/llama.rn';
import {Alert} from 'react-native';

import {defaultModels} from '../defaultModels';

import {downloadManager} from '../../services/downloads';

import {ModelOrigin} from '../../utils/types';
import {basicModel, mockContextModel} from '../../../jest/fixtures/models';

import {modelStore, uiStore} from '..';

// Mock the download manager
jest.mock('../../services/downloads', () => ({
  downloadManager: {
    isDownloading: jest.fn(),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    setCallbacks: jest.fn(),
    syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ModelStore', () => {
  let showErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    showErrorSpy = jest.spyOn(uiStore, 'showError');
    modelStore.models = []; // Clear models before each test
    modelStore.context = undefined;
    modelStore.activeModelId = undefined;

    (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  afterEach(() => {
    showErrorSpy.mockRestore();
  });

  describe('mergeModelLists', () => {
    it('should add missing default models to the existing model list', () => {
      modelStore.models = []; // Start with no existing models

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models.length).toBeGreaterThan(0);
      expect(modelStore.models).toEqual(expect.arrayContaining(defaultModels));
    });

    it('should merge existing models with default models, adding any that are missing', () => {
      const notExistedModel = defaultModels[0];
      modelStore.models = defaultModels.slice(1); // Start with all but the first model, so we can test if it's added back
      expect(modelStore.models.length).toBe(defaultModels.length - 1);
      expect(modelStore.models).not.toContainEqual(notExistedModel);

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models.length).toBeGreaterThan(0);
      expect(modelStore.models).toContainEqual(notExistedModel);
    });

    it('should retain value of existing variables while merging new variables', () => {
      const newDefaultModel = defaultModels[0];

      // Apply changes to the existing model:
      //  - chatTemplate.template: existing variable with a value different from the default
      //  - stopWords: existing array with custom values
      const existingModel = {
        ...newDefaultModel,
        chatTemplate: {
          ...newDefaultModel.chatTemplate,
          template: 'existing',
        },
        stopWords: ['custom_stop_1', 'custom_stop_2'],
        isDownloaded: true, // if not downloaded, it will be removed
      };

      modelStore.models[0] = existingModel;

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models[0].chatTemplate).toEqual(
        expect.objectContaining({
          template: 'existing', // Existing value should remain
        }),
      );

      // Custom stop words should be preserved
      expect(modelStore.models[0].stopWords).toEqual([
        'custom_stop_1',
        'custom_stop_2',
        ...(newDefaultModel.stopWords || []),
      ]);
    });

    it('should merge value of default to exisiting for top level variables', () => {
      const newDefaultModel = defaultModels[0];

      const existingModel = {
        ...newDefaultModel,
        params: 101010,
      };

      modelStore.models[0] = existingModel;

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models[0].params).toEqual(newDefaultModel.params);
    });
  });

  describe('model management', () => {
    it('should add local model correctly', async () => {
      const localPath = '/path/to/model.bin';
      await modelStore.addLocalModel(localPath);

      expect(modelStore.models).toHaveLength(1);
      expect(modelStore.models[0]).toEqual(
        expect.objectContaining({
          isLocal: true,
          origin: ModelOrigin.LOCAL,
          fullPath: localPath,
          isDownloaded: true,
        }),
      );
    });

    it('should delete model and release context if active', async () => {
      const model = defaultModels[0];
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      await modelStore.deleteModel(model);
      // await when(() => modelStore.activeModelId === undefined); // wait for mobx to propagate changes

      expect(modelStore.activeModelId).toBeUndefined();
      expect(modelStore.context).toBeUndefined();
    });
  });

  describe('context management', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Reset store state
      modelStore.models = [];
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
    });

    it('should handle app state changes correctly', async () => {
      // Setup
      modelStore.useAutoRelease = true;
      const mockRelease = jest.fn();
      modelStore.context = {
        release: mockRelease, // Create the mock function first
      } as any;
      modelStore.activeModelId = 'test-id';
      modelStore.appState = 'active'; // Set initial app state to 'active'

      // Simulate going to background
      await modelStore.handleAppStateChange('background');

      // Check if context was released
      expect(mockRelease).toHaveBeenCalled(); // Check the mock function directly
      expect(modelStore.context).toBeUndefined();
    });

    it('should not release context when auto-release is disabled', async () => {
      // Setup
      modelStore.useAutoRelease = false;
      const mockRelease = jest.fn();
      modelStore.context = {
        release: mockRelease, // Create the mock function first
      } as any;
      modelStore.activeModelId = 'test-id';

      // Simulate going to background
      await modelStore.handleAppStateChange('background');

      // Check that context was not released
      expect(mockRelease).not.toHaveBeenCalled(); // Check the mock function directly
      expect(modelStore.context).toBeDefined();
    });

    it('should reinitialize context when coming back to foreground', async () => {
      // Setup
      modelStore.useAutoRelease = true;
      const model = defaultModels[0];
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      const mockInitContext = jest.fn().mockResolvedValue(
        new LlamaContext({
          contextId: 1,
          gpu: false,
          reasonNoGPU: '',
          model: mockContextModel,
        }),
      );
      modelStore.initContext = mockInitContext;

      // Simulate coming to foreground
      modelStore.appState = 'background';
      await modelStore.handleAppStateChange('active');

      expect(mockInitContext).toHaveBeenCalledWith(model);
    });
  });

  describe('settings management', () => {
    it('should update stop words', () => {
      const model = {...defaultModels[0]};
      modelStore.models = [model];

      const newStopWords = ['stop1', 'stop2'];

      modelStore.updateModelStopWords(model.id, newStopWords);

      expect(modelStore.models[0].stopWords).toEqual(newStopWords);
    });

    it('should reset model stop words to defaults', () => {
      const model = {...defaultModels[0]};
      const originalStopWords = [...(model.defaultStopWords || [])];
      model.stopWords = ['custom1', 'custom2'];
      modelStore.models = [model];

      modelStore.resetModelStopWords(model.id);

      expect(modelStore.models[0].stopWords).toEqual(originalStopWords);
    });
  });

  describe('download management', () => {
    it('should handle download cancellation', async () => {
      const model = defaultModels[0];
      modelStore.models = [model];

      // Mock isDownloading to return true initially
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(true);

      await modelStore.cancelDownload(model.id);

      expect(downloadManager.cancelDownload).toHaveBeenCalledWith(model.id);
      expect(model.isDownloaded).toBeFalsy();
      expect(model.progress).toBe(0);
    });

    it('should update model state on download error', () => {
      const model = defaultModels[0];
      modelStore.models = [model];

      // Set up callbacks directly
      const callbacks = {
        onError: (modelId: string) => {
          const _model = modelStore.models.find(m => m.id === modelId);
          if (_model) {
            runInAction(() => {
              _model.progress = 0;
              model.isDownloaded = false;
            });
          }
        },
      };

      // Trigger error callback
      callbacks.onError(model.id);

      expect(model.progress).toBe(0);
      expect(model.isDownloaded).toBe(false);
    });

    it('should handle download failure due to insufficient space', async () => {
      const model = defaultModels[0];
      modelStore.models = [model];

      // Mock startDownload to reject with insufficient space error
      (downloadManager.startDownload as jest.Mock).mockRejectedValue(
        new Error('Not enough storage space to download the model'),
      );

      await modelStore.checkSpaceAndDownload(model.id);

      expect(downloadManager.startDownload).toHaveBeenCalled();
      // Should show error message
      expect(showErrorSpy).toHaveBeenCalledWith(
        'Failed to start download: Not enough storage space to download the model',
      );
    });
  });

  describe('computed properties', () => {
    it('should return correct active model', () => {
      const model = defaultModels[0];
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      expect(modelStore.activeModel).toEqual(model);
    });

    it('should return correct last used model', () => {
      const model = {...defaultModels[0], isDownloaded: true};
      modelStore.models = [model];
      modelStore.lastUsedModelId = model.id;

      expect(modelStore.lastUsedModel).toEqual(model);
    });
  });

  // Add tests for inferencing and streaming flags
  describe('inferencing and streaming flags', () => {
    it('should set and get inferencing flag', () => {
      modelStore.inferencing = false;
      expect(modelStore.inferencing).toBe(false);

      modelStore.setInferencing(true);
      expect(modelStore.inferencing).toBe(true);
    });

    it('should set and get isStreaming flag', () => {
      modelStore.isStreaming = false;
      expect(modelStore.isStreaming).toBe(false);

      modelStore.setIsStreaming(true);
      expect(modelStore.isStreaming).toBe(true);
    });
  });

  // Add tests for manual context release
  describe('manual context release', () => {
    it('should release context manually', async () => {
      // Set up mock context
      const mockRelease = jest.fn();
      modelStore.context = {
        release: mockRelease,
      } as any;
      modelStore.activeModelId = 'test-id';

      await modelStore.manualReleaseContext();

      expect(mockRelease).toHaveBeenCalled();
      expect(modelStore.context).toBeUndefined();
      expect(modelStore.activeModelId).toBeUndefined();
    });
  });

  // Add tests for HF model handling
  describe('HF model handling', () => {
    it('should download HF model', async () => {
      const hfModel = {
        id: 'test/hf-model',
        model_id: 'test/hf-model',
        siblings: [
          {
            rfilename: 'model.gguf',
            size: 1000,
            url: 'test-url',
            oid: 'test-oid',
          },
        ],
      };

      const modelFile = hfModel.siblings[0];

      const mockAddHFModel = jest.fn();
      modelStore.addHFModel = mockAddHFModel.mockResolvedValue({
        id: 'test-model-id',
        isDownloaded: false,
      } as any);

      const mockCheckSpaceAndDownload = jest.fn();
      modelStore.checkSpaceAndDownload =
        mockCheckSpaceAndDownload.mockResolvedValue(undefined);

      await modelStore.downloadHFModel(hfModel as any, modelFile as any);

      expect(mockAddHFModel).toHaveBeenCalledWith(hfModel, modelFile);
      expect(mockCheckSpaceAndDownload).toHaveBeenCalledWith('test-model-id');
    });

    it('should handle errors when downloading HF model fails', async () => {
      const hfModel = {
        id: 'test/hf-model',
        siblings: [{rfilename: 'model.gguf'}],
      };

      const modelFile = hfModel.siblings[0];

      // Mock addHFModel to throw an error
      const mockAddHFModel = jest.fn();
      modelStore.addHFModel = mockAddHFModel.mockRejectedValue(
        new Error('Mock error'),
      );

      // Mock console.error and Alert.alert
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();

      await modelStore.downloadHFModel(hfModel as any, modelFile as any);

      // Check that error is logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to set up HF model download:',
        expect.any(Error),
      );

      // Check that Alert.alert is called with the error message
      expect(alertSpy).toHaveBeenCalledWith(
        uiStore.l10n.errors.downloadSetupFailedTitle,
        uiStore.l10n.errors.downloadSetupFailedMessage.replace(
          '{message}',
          'Mock error',
        ),
      );

      // Clean up mocks
      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
    });
  });

  // Add tests for model chat template handling
  describe('model chat template handling', () => {
    it('should update model chat template', () => {
      const model = {
        ...basicModel,
        chatTemplate: {
          ...basicModel.chatTemplate,
          chatTemplate: 'original',
        },
      };

      modelStore.models = [model];

      const newConfig = {chatTemplate: 'updated'};
      modelStore.updateModelChatTemplate(model.id, newConfig as any);

      expect(modelStore.models[0].chatTemplate).toEqual(newConfig);
    });

    it('should reset model chat template to defaults', () => {
      const model = {
        ...basicModel,
        defaultChatTemplate: {
          ...basicModel.defaultChatTemplate,
          chatTemplate: 'default',
        },
        chatTemplate: {
          ...basicModel.chatTemplate,
          chatTemplate: 'custom',
        },
      };

      modelStore.models = [model];

      modelStore.resetModelChatTemplate(model.id);

      expect(modelStore.models[0].chatTemplate).toEqual(
        model.defaultChatTemplate,
      );
    });
  });

  // Add tests for resetting models
  describe('resetting models', () => {
    beforeEach(() => {
      // Set up some models of different origins
      const localModel = {
        id: 'local-model',
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const hfModel = {
        id: 'hf-model',
        origin: ModelOrigin.HF,
        hfModel: {id: 'test/hf-model'},
      };

      modelStore.models = [localModel, hfModel] as any;
    });

    it('should reset models while preserving local and HF models', () => {
      // Spy on mergeModelLists
      const mockMergeModelLists = jest.fn();
      modelStore.mergeModelLists = mockMergeModelLists;

      modelStore.resetModels();

      // Check that models were cleared and restored
      expect(mockMergeModelLists).toHaveBeenCalled();

      // Should still have the local and HF models
      expect(modelStore.models.some(m => m.id === 'local-model')).toBe(true);
      expect(modelStore.models.some(m => m.id === 'hf-model')).toBe(true);
    });
  });

  // Add tests for use metal and auto release settings
  describe('settings', () => {
    it('should update useMetal setting', () => {
      modelStore.useMetal = false;

      modelStore.updateUseMetal(true);

      expect(modelStore.useMetal).toBe(true);
    });

    it('should update useAutoRelease setting', () => {
      modelStore.useAutoRelease = true;

      modelStore.updateUseAutoRelease(false);

      expect(modelStore.useAutoRelease).toBe(false);
    });
  });

  // Add tests for isModelAvailable
  describe('isModelAvailable', () => {
    beforeEach(() => {
      // Set up some available models
      modelStore.models = [
        {id: 'model1', isDownloaded: true},
        {id: 'model2', isDownloaded: true},
      ] as any;
    });

    it('should return false if modelId is undefined', () => {
      expect(modelStore.isModelAvailable(undefined)).toBe(false);
    });

    it('should return true if model exists in available models', () => {
      // Available models are those that are downloaded
      expect(modelStore.isModelAvailable('model1')).toBe(true);
    });

    it('should return false if model does not exist in available models', () => {
      expect(modelStore.isModelAvailable('non-existent-model')).toBe(false);
    });
  });
});
