import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

interface GenieModuleInterface {
  loadModel(): Promise<boolean>;
  generateResponse(prompt: string): Promise<void>;
  addListener(eventType: string): EmitterSubscription;
  removeListeners(count: number): void;
  ping(): Promise<string>;
}

const { GenieModule } = NativeModules as { GenieModule: GenieModuleInterface };

class GenieWrapper {
  private eventEmitter: NativeEventEmitter;
  private tokenListener: EmitterSubscription | null;

  constructor() {
    this.eventEmitter = new NativeEventEmitter(GenieModule);
    this.tokenListener = null;
  }

  async ping(): Promise<string> {
    try {
      const result = await GenieModule.ping();
      return result;
    } catch (error) {
      console.error('Failed to ping:', error);
      throw error;
    }
  } 

  async loadModel(): Promise<boolean> {
    try {
      return await GenieModule.loadModel();
    } catch (error) {
      console.error('Failed to initialize model:', error);
      throw error;
    }
  }

  async generateResponse(prompt: string, onToken: (token: string) => void): Promise<void> {
    if (!onToken) {
      throw new Error('onToken callback is required');
    }

    // Remove any existing listener
    if (this.tokenListener) {
      this.tokenListener.remove();
    }

    // Set up new listener
    this.tokenListener = this.eventEmitter.addListener(
      'onTokenGenerated',
      (event: { token: string }) => {
        onToken(event.token);
      }
    );

    try {
      await GenieModule.generateResponse(prompt);
    } catch (error) {
      console.error('Failed to generate response:', error);
      throw error;
    }
  }

  cleanup(): void {
    if (this.tokenListener) {
      this.tokenListener.remove();
      this.tokenListener = null;
    }
  }
}

export default new GenieWrapper(); 