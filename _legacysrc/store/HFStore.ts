import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {fetchGGUFSpecs, fetchModelFilesDetails, fetchModels} from '../api/hf';

import {urls} from '../config';

import {hasEnoughSpace, hfAsModel} from '../utils';
import {ErrorState, createErrorState} from '../utils/errors';

import {HuggingFaceModel} from '../utils/types';

const RE_GGUF_SHARD_FILE =
  /^(?<prefix>.*?)-(?<shard>\d{5})-of-(?<total>\d{5})\.gguf$/;

// Service name for keychain storage
const HF_TOKEN_SERVICE = 'hf_token_service';

class HFStore {
  models: HuggingFaceModel[] = [];
  isLoading = false;
  error: ErrorState | null = null;
  nextPageLink: string | null = null;
  searchQuery = '';
  queryFilter = 'gguf,conversational';
  queryFull = true;
  queryConfig = true;
  hfToken: string | null = null;
  useHfToken: boolean = true; // Only applies when token is set

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'HFStore',
      properties: ['useHfToken'],
      storage: AsyncStorage,
    });

    // Load token from secure storage on initialization
    this.loadTokenFromSecureStorage();
  }

  // Load token from secure storage
  private async loadTokenFromSecureStorage() {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: HF_TOKEN_SERVICE,
      });

      if (credentials) {
        runInAction(() => {
          this.hfToken = credentials.password;
        });
      }
    } catch (error) {
      console.error('Failed to load token from secure storage:', error);
    }
  }

  get isTokenPresent(): boolean {
    return !!this.hfToken && this.hfToken.trim().length > 0;
  }

  get shouldUseToken(): boolean {
    return this.isTokenPresent && this.useHfToken;
  }

  setUseHfToken(useToken: boolean) {
    runInAction(() => {
      this.useHfToken = useToken;
    });
  }

  async setToken(token: string) {
    try {
      // Save token in secure storage
      await Keychain.setGenericPassword('hf_token', token, {
        service: HF_TOKEN_SERVICE,
      });

      runInAction(() => {
        this.hfToken = token;
      });
      return true;
    } catch (error) {
      console.error('Failed to save HF token:', error);
      return false;
    }
  }

  async clearToken() {
    try {
      // Remove token from secure storage
      await Keychain.resetGenericPassword({
        service: HF_TOKEN_SERVICE,
      });

      runInAction(() => {
        this.hfToken = null;
      });
      return true;
    } catch (error) {
      console.error('Failed to clear HF token:', error);
      return false;
    }
  }

  setSearchQuery(query: string) {
    this.searchQuery = query;
  }

  clearError() {
    this.error = null;
  }

  // Fetch the GGUF specs for a specific model,
  // such as number of parameters, context length, chat template, etc.
  async fetchAndSetGGUFSpecs(modelId: string) {
    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const specs = await fetchGGUFSpecs(modelId, authToken);
      const model = this.models.find(m => m.id === modelId);
      if (model) {
        runInAction(() => {
          model.specs = specs;
        });
      }
    } catch (error) {
      console.error('Failed to fetch GGUF specs:', error);
      runInAction(() => {
        this.error = createErrorState(error, 'modelDetails', 'huggingface');
      });
    }
  }

  private async updateSiblingsWithFileDetails(
    model: HuggingFaceModel,
    fileDetails: any[],
  ) {
    return Promise.all(
      model.siblings.map(async file => {
        const details = fileDetails.find(
          detail => detail.path === file.rfilename,
        );
        if (!details) {
          return {...file};
        }

        const enrichedFile = {
          ...file,
          size: details.size,
          oid: details.oid,
          lfs: details.lfs,
        };

        return {
          ...enrichedFile,
          canFitInStorage: await hasEnoughSpace(hfAsModel(model, enrichedFile)),
        };
      }),
    );
  }

  // Fetch the details (sizes, oid, lfs, ...) of the model files
  async fetchModelFileDetails(modelId: string) {
    try {
      console.log('Fetching model file details for', modelId);
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const fileDetails = await fetchModelFilesDetails(modelId, authToken);
      const model = this.models.find(m => m.id === modelId);

      if (!model) {
        return;
      }

      const updatedSiblings = await this.updateSiblingsWithFileDetails(
        model,
        fileDetails,
      );

      runInAction(() => {
        model.siblings = updatedSiblings;
      });
    } catch (error) {
      console.error('Error fetching model file sizes:', error);
      runInAction(() => {
        this.error = createErrorState(error, 'modelDetails', 'huggingface');
      });
    }
  }

  getModelById(id: string): HuggingFaceModel | null {
    return this.models.find(model => model.id === id) || null;
  }

  async fetchModelData(modelId: string) {
    try {
      await this.fetchAndSetGGUFSpecs(modelId);
      await this.fetchModelFileDetails(modelId);
    } catch (error) {
      console.error('Error fetching model data:', error);
      runInAction(() => {
        this.error = createErrorState(error, 'modelDetails', 'huggingface');
      });
    }
  }

  /** Filters out non-GGUF and sharded GGUF files from model siblings */
  private filterGGUFFiles(siblings: any[]) {
    return (
      siblings?.filter(sibling => {
        const filename = sibling.rfilename.toLowerCase();
        return filename.endsWith('.gguf') && !RE_GGUF_SHARD_FILE.test(filename);
      }) || []
    );
  }

  /** Adds download URLs to model files based on modelId */
  private addDownloadUrls(modelId: string, siblings: any[]) {
    return siblings.map(sibling => ({
      ...sibling,
      url: urls.modelDownloadFile(modelId, sibling.rfilename),
    }));
  }

  // Process the hf search results to:
  // - add the URL
  // - filter out non-gguf files from the siblings
  // - filter out sharded gguf files from the siblings
  private processSearchResults(models: HuggingFaceModel[]) {
    return models.map(model => {
      const filteredSiblings = this.filterGGUFFiles(model.siblings);
      const siblingsWithUrl = this.addDownloadUrls(model.id, filteredSiblings);

      return {
        ...model,
        url: urls.modelWebPage(model.id),
        siblings: siblingsWithUrl,
      };
    });
  }

  get hasMoreResults() {
    return this.nextPageLink !== null;
  }

  // Fetch the models from the Hugging Face API
  async fetchModels() {
    this.isLoading = true;
    this.error = null;

    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const {models, nextLink} = await fetchModels({
        search: this.searchQuery,
        limit: 10,
        sort: 'downloads',
        direction: '-1',
        filter: this.queryFilter,
        full: this.queryFull,
        config: this.queryConfig,
        authToken: authToken,
      });

      const modelsWithUrl = this.processSearchResults(models);

      runInAction(() => {
        this.models = modelsWithUrl;
        this.nextPageLink = nextLink;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
        this.nextPageLink = null;
        this.models = [];
      });
      // this need to be in a separate runInAction for the ui to render properly.
      runInAction(() => {
        this.error = createErrorState(error, 'search', 'huggingface');
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  // Fetch the next page of models
  async fetchMoreModels() {
    if (!this.nextPageLink || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const {models, nextLink} = await fetchModels({
        nextPageUrl: this.nextPageLink,
        authToken: authToken,
      });

      const modelsWithUrl = this.processSearchResults(models);

      runInAction(() => {
        modelsWithUrl.forEach(model => this.models.push(model));
        this.nextPageLink = nextLink;
      });
    } catch (error) {
      runInAction(() => {
        this.error = createErrorState(error, 'search', 'huggingface');
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }
}

export const hfStore = new HFStore();
