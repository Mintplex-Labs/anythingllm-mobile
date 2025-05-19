import axios from 'axios';

import {urls} from '../config';

import {
  GGUFSpecs,
  HuggingFaceModel,
  HuggingFaceModelsResponse,
  ModelFileDetails,
} from '../utils/types';

/**
 * Get information from all models in the Hub.
 * The response is paginated, use the Link header to get the next pages.
 *
 * search: Filter based on substrings for repos and their usernames, such as resnet or microsoft
 * author: Filter models by an author or organization, such as huggingface or microsoft
 * filter: Filter based on tags, such as text-classification or spacy.
 * sort: Property to use when sorting, such as downloads or author.
 * direction: Direction in which to sort, such as -1 for descending, and anything else for ascending.
 * limit: Limit the number of models fetched.
 * full: Whether to fetch most model data, such as all tags, the files, etc.
 * config: Whether to also fetch the repo config.
 *
 * @see https://huggingface.co/docs/api-reference/api-endpoints#get-models
 */
export async function fetchModels({
  search,
  author,
  filter,
  sort,
  direction,
  limit,
  full,
  config,
  nextPageUrl,
  authToken,
}: {
  search?: string;
  author?: string;
  filter?: string;
  sort?: string;
  direction?: string;
  limit?: number;
  full?: boolean;
  config?: boolean;
  nextPageUrl?: string;
  authToken?: string | null;
}): Promise<HuggingFaceModelsResponse> {
  try {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await axios.get(nextPageUrl || urls.modelsList(), {
      params: {
        search,
        author,
        filter,
        sort,
        direction,
        limit,
        full,
        config,
      },
      headers,
    });

    const linkHeader = response.headers.link;
    let nextLink = null;

    if (linkHeader) {
      const match = linkHeader.match(/<([^>]*)>/);
      if (match) {
        nextLink = match[1];
      }
    }

    return {
      models: response.data as HuggingFaceModel[],
      nextLink,
    };
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
}

/**
 * Fetches the details of the model's files. Mainly the size is used.
 * @param modelId - The ID of the model.
 * @param authToken - Optional authentication token for accessing private models
 * @returns An array of ModelFileDetails.
 */
export const fetchModelFilesDetails = async (
  modelId: string,
  authToken?: string | null,
): Promise<ModelFileDetails[]> => {
  const url = `${urls.modelTree(modelId)}?recursive=true`;

  try {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {headers});

    if (!response.ok) {
      throw new Error(`Error fetching model files: ${response.statusText}`);
    }

    const data: ModelFileDetails[] = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch model files:', error);
    throw error;
  }
};

/**
 * Fetches the specs of the GGUF for a specific model.
 * @param modelId - The ID of the model.
 * @param authToken - Optional authentication token for accessing private models
 * @returns The GGUF specs.
 */
export const fetchGGUFSpecs = async (
  modelId: string,
  authToken?: string | null,
): Promise<GGUFSpecs> => {
  const url = `${urls.modelSpecs(modelId)}?expand[]=gguf`;

  try {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {headers});

    if (!response.ok) {
      throw new Error(`Error fetching GGUF specs: ${response.statusText}`);
    }

    const data: GGUFSpecs = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch GGUF specs:', error);
    throw error;
  }
};
