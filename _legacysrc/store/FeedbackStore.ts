import {makeAutoObservable} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {v4 as uuidv4} from 'uuid';

const FEEDBACK_ID_STORAGE_KEY = '@anythingllm/app_feedback_id';

/**
 * Manages a persistent ID for feedback submissions to:
 * - Prevent abuse while maintaining privacy
 * - Avoid using device-specific identifiers for privacy reasons
 */
class FeedbackStore {
  private _feedbackId: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.initializeFeedbackId();
  }

  /**
   * Initializes the feedback ID by:
   * 1. Checking if an ID already exists in storage
   * 2. If not, generating a new UUID and storing it
   */
  private async initializeFeedbackId() {
    try {
      const storedId = await AsyncStorage.getItem(FEEDBACK_ID_STORAGE_KEY);
      if (storedId) {
        this._feedbackId = storedId;
        return;
      }

      const newId = uuidv4();
      await AsyncStorage.setItem(FEEDBACK_ID_STORAGE_KEY, newId);
      this._feedbackId = newId;
    } catch (error) {
      console.error('Error initializing feedback ID:', error);
      // Generate a new ID if storage fails
      this._feedbackId = uuidv4();
    }
  }

  /**
   * Returns the feedback ID for this app installation.
   * If no ID exists (should never happen after initialization),
   * generates a new one as a fallback.
   */
  get feedbackId(): string {
    if (!this._feedbackId) {
      // If for some reason we don't have an ID, generate a new one
      this._feedbackId = uuidv4();
    }
    return this._feedbackId;
  }
}

export const feedbackStore = new FeedbackStore();
