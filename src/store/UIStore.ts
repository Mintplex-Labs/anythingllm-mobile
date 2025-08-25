import { Appearance } from 'react-native';
import { makePersistable } from 'mobx-persist-store';
import { makeAutoObservable, runInAction } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeEventEmitter } from 'react-native';

type StorageKeys =
  'onboarding_welcome_completed' |
  'onboarding_model_selection_completed' |
  'onboarding_survey_completed' |
  'onboarding_data_handling_completed' |
  'llmPreference' |
  'tools' |
  'current_anythingllm_external_connection' |
  'anythingllm_external_connections';

export const GLOBAL_EVENTS = {
  REDIRECT: 'REDIRECT',
  CITATIONS_FOCUSED: 'CITATIONS_FOCUSED',
  SUBMIT_PROMPT: 'SUBMIT_PROMPT',
  REFRESH_WORKSPACES: 'REFRESH_WORKSPACES',
  CHAT_HISTORY_REFRESHED: 'CHAT_HISTORY_REFRESHED',
  MODEL_DOWNLOAD_STARTED: 'MODEL_DOWNLOAD_STARTED',
  MODEL_DOWNLOAD_COMPLETE: 'MODEL_DOWNLOAD_COMPLETE',
  ONBOARDING_COMPLETED: 'ONBOARDING_COMPLETED',
} as const;

export class UIStore {
  emitter: NativeEventEmitter;
  globalEvents = GLOBAL_EVENTS;

  static readonly GROUP_KEYS = {
    READY_TO_USE: 'ready_to_use',
    AVAILABLE_TO_DOWNLOAD: 'available_to_download',
  } as const;
  static readonly STORAGE_KEYS: StorageKeys[] = [
    'onboarding_welcome_completed',
    'onboarding_model_selection_completed',
    'onboarding_survey_completed',
    'onboarding_data_handling_completed',
    'llmPreference',
    'tools',
    'current_anythingllm_external_connection',
    'anythingllm_external_connections',
  ] as const;

  pageStates = {
    modelsScreen: {
      filters: [] as string[],
      expandedGroups: {
        [UIStore.GROUP_KEYS.READY_TO_USE]: true,
      },
    },
  };

  // This is a flag to auto-navigate to the chat page after loading a model
  autoNavigatetoChat = true;

  //colorScheme = useColorScheme();
  colorScheme: 'light' | 'dark' = Appearance.getColorScheme() ?? 'light';

  displayMemUsage = false;

  benchmarkShareDialog = {
    shouldShow: true,
  };

  storage = AsyncStorage;

  session = new Map<string, any>();

  showError(message: string) {
    // TODO: Implement error display logic (e.g., toast, alert, etc.)
    console.error(message);
  }

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'UIStore',
      properties: [
        'pageStates',
        'colorScheme',
        'autoNavigatetoChat',
        'displayMemUsage',
        'benchmarkShareDialog',
      ],
      storage: AsyncStorage,
    });

    this.emitter = new NativeEventEmitter();
  }

  async removeFromStorage(key: StorageKeys) {
    return this.storage.removeItem(key);
  }

  async getFromStorage<T>(key: StorageKeys, defaultValue: T): Promise<T> {
    return this.storage.getItem(key).then((value) => {
      if (value) return JSON.parse(value) as T;
      else return defaultValue as T;
    });
  }

  async setToStorage<T>(key: StorageKeys, value: T) {
    const result = await this.storage.setItem(key, JSON.stringify(value));
    this.emitter.emit(key, { details: value });
    return result;
  }

  async getAllFromStorage(): Promise<{ [key: string]: any }> {
    return this.storage.multiGet(UIStore.STORAGE_KEYS)
      .then((result) => {
        return result.map(([key, value]) => {
          return {
            [key]: value,
          };
        });
      });
  }

  setValue<T extends keyof typeof this.pageStates>(
    page: T,
    key: keyof (typeof this.pageStates)[T],
    value: any,
  ) {
    runInAction(() => {
      if (this.pageStates[page]) {
        this.pageStates[page][key] = value;
      } else {
        console.error(`Page '${page}' does not exist in pageStates`);
      }
    });
  }

  setColorScheme(colorScheme: 'light' | 'dark') {
    runInAction(() => {
      this.colorScheme = colorScheme;
    });
  }

  setAutoNavigateToChat(value: boolean) {
    runInAction(() => {
      this.autoNavigatetoChat = value;
    });
  }

  setDisplayMemUsage(value: boolean) {
    runInAction(() => {
      this.displayMemUsage = value;
    });
  }

  setBenchmarkShareDialogPreference(shouldShow: boolean) {
    runInAction(() => {
      this.benchmarkShareDialog.shouldShow = shouldShow;
    });
  }

  emitGlobalEvent(event: typeof GLOBAL_EVENTS[keyof typeof GLOBAL_EVENTS], details?: { path: string, params?: object }) {
    this.emitter.emit(event, { ...details });
  }

  async resetAllStorage() {
    return await this.storage.multiRemove(UIStore.STORAGE_KEYS);
  }

  setSessionKey(key: string, value: any, eventToEmit?: typeof GLOBAL_EVENTS[keyof typeof GLOBAL_EVENTS]) {
    this.session.set(key, value);
    if (eventToEmit) this.emitter.emit(eventToEmit, { details: value });
  }

  deleteSessionKey(key: string, eventToEmit?: typeof GLOBAL_EVENTS[keyof typeof GLOBAL_EVENTS]) {
    this.session.delete(key);
    if (eventToEmit) this.emitter.emit(eventToEmit);
  }
}

const uiStore = new UIStore();
export default uiStore;