import axios from 'axios';

/**
 * Error classes for better error handling throughout the application
 */


/**
 * NetworkError - Used for connectivity-related errors
 * Examples: No internet connection, timeout, etc.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * AppCheckError - Used for Firebase App Check verification errors
 * Examples: App not installed from official store, verification failed, etc.
 */
export class AppCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppCheckError';
  }
}

/**
 * ServerError - Used for backend server errors
 * Examples: 500 errors, API unavailable, etc.
 */
export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
  }
}

/**
 * Standardized error state interface for consistent error handling across the app
 */
export interface ErrorState {
  code:
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'storage'
  | 'server'
  | 'unknown';
  service?: 'huggingface' | 'firebase' | 'localapi';
  message: string;
  context: 'search' | 'download' | 'modelDetails';
  recoverable: boolean;
  metadata?: {
    modelId?: string;
    [key: string]: any;
  };
}

/**
 * Helper function to create a standardized error state from any error
 */
export function createErrorState(
  error: unknown,
  context: ErrorState['context'],
  service?: ErrorState['service'],
  metadata?: ErrorState['metadata'],
): ErrorState {
  let code: ErrorState['code'] = 'unknown';
  let message = 'An unexpected error occurred';
  let recoverable = true;
  let errorService = service;

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;

    // Check URL to determine service if not explicitly provided
    if (!errorService) {
      const url = error.config?.url || '';
      if (url.includes('huggingface.co') || url.includes('hf.co')) {
        errorService = 'huggingface';
      }
    }

    if (statusCode === 401) {
      code = 'authentication';
      message =
        errorService === 'huggingface'
          ? context === 'search'
            ? 'Hugging Face authentication error: Invalid token'
            : 'Hugging Face authentication error: Token is missing or invalid'
          : 'Authentication error: Token is missing or invalid';
    } else if (statusCode === 403) {
      code = 'authorization';
      message =
        errorService === 'huggingface'
          ? 'Hugging Face authorization error: No permission to access this resource'
          : 'Authorization error: No permission to access this resource';
    } else if (statusCode && statusCode >= 500) {
      code = 'server';
      message =
        errorService === 'huggingface'
          ? 'Hugging Face server error: API server issue'
          : 'Server error: API server issue';
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      code = 'network';
      message =
        errorService === 'huggingface'
          ? 'Network timeout: Request to Hugging Face took too long to complete'
          : 'Network timeout: Request took too long to complete';
    } else if (error.code === 'ERR_NETWORK') {
      code = 'network';
      message =
        errorService === 'huggingface'
          ? 'Network error: Unable to connect to Hugging Face API'
          : 'Network error: Unable to connect to API';
    }
  } else if (error instanceof NetworkError) {
    code = 'network';
    message = error.message;
  } else if (error instanceof ServerError) {
    code = 'server';
    message = error.message;
  } else if (error instanceof Error) {
    // Handle error messages containing HTTP status codes (e.g., 'Client error: 403')
    if (typeof error.message === 'string') {
      const statusCodeMatch = error.message.match(
        /(?:Client error:|status:?)\s*(\d{3})/i,
      );
      if (statusCodeMatch) {
        const statusCode = parseInt(statusCodeMatch[1], 10);

        if (statusCode === 401) {
          code = 'authentication';
          message =
            errorService === 'huggingface'
              ? 'Hugging Face authentication error: Token is missing or invalid'
              : 'Authentication error: Token is missing or invalid';
        } else if (statusCode === 403) {
          code = 'authorization';
          message =
            errorService === 'huggingface'
              ? 'Hugging Face authorization error: No permission to access this resource'
              : 'Authorization error: No permission to access this resource';
        } else if (statusCode >= 500) {
          code = 'server';
          message =
            errorService === 'huggingface'
              ? 'Hugging Face server error: API server issue'
              : 'Server error: API server issue';
        }
      } else if (
        error.message.includes('storage') ||
        error.message.includes('space')
      ) {
        code = 'storage';
        message = error.message;
      } else {
        message = error.message;
      }
    } else {
      message = error.message;
    }
  }

  return {
    code,
    service: errorService,
    message,
    context,
    recoverable,
    metadata,
  };
}
