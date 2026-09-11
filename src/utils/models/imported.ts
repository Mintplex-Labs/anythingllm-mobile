import uiStore from '@/store/UIStore';
import { HfGGUFQuant, HfGGUFRepoSummary } from '@/utils/api/hfGguf';

/**
 * GGUF models the user added from Hugging Face (outside of our catalog).
 *
 * The model id is `org/repo/file.gguf` so several quants of the same repo can
 * live side by side. `LlamaRnWrapper.determineGgufFilePath` resolves ids that end
 * in `.gguf` straight to `models/gguf/<id>`, which is exactly where
 * `resolveDestinationPathFromGGUFUrl` puts the download, so no extra lookup is needed.
 */
export type ImportedModel = {
  /** `org/repo/file.gguf` */
  modelId: string;
  /** `org/repo` */
  repoId: string;
  filename: string;
  quant: string | null;
  name: string;
  description: string;
  /** File size in bytes */
  size: number;
  downloadUrl: string;
  /** Hugging Face author/org, shown as the provider group */
  author: string;
  architecture?: string;
  params?: number;
  contextLength?: number;
  /** ISO date the user added it */
  addedAt: string;
};

export const IMPORTED_MODELS_STORAGE_KEY = 'hf_imported_models' as const;

export function importedModelId(repoId: string, filename: string) {
  return `${repoId}/${filename}`;
}

export function buildImportedModel(repo: HfGGUFRepoSummary, quant: HfGGUFQuant): ImportedModel {
  const quantLabel = quant.quant ? ` (${quant.quant})` : '';
  const specs = [
    repo.architecture,
    repo.contextLength ? `${Math.round(repo.contextLength / 1024)}k context` : null,
  ].filter(Boolean).join(' · ');

  return {
    modelId: importedModelId(repo.id, quant.filename),
    repoId: repo.id,
    filename: quant.filename,
    quant: quant.quant,
    name: `${repo.title}${quantLabel}`,
    description: `Added from Hugging Face (${repo.id}).${specs ? ` ${specs}.` : ''}`,
    size: quant.size,
    downloadUrl: quant.downloadUrl,
    author: repo.author,
    architecture: repo.architecture,
    params: repo.params,
    contextLength: repo.contextLength,
    addedAt: new Date().toISOString(),
  };
}

const ImportedModels = {
  async list(): Promise<ImportedModel[]> {
    const models = await uiStore.getFromStorage<ImportedModel[]>(IMPORTED_MODELS_STORAGE_KEY, []);
    return Array.isArray(models) ? models : [];
  },

  async has(modelId: string): Promise<boolean> {
    const models = await ImportedModels.list();
    return models.some(m => m.modelId === modelId);
  },

  /** Adds (or replaces) an imported model definition. */
  async add(model: ImportedModel): Promise<ImportedModel[]> {
    const models = (await ImportedModels.list()).filter(m => m.modelId !== model.modelId);
    models.push(model);
    await uiStore.setToStorage(IMPORTED_MODELS_STORAGE_KEY, models);
    return models;
  },

  async remove(modelId: string): Promise<ImportedModel[]> {
    const models = (await ImportedModels.list()).filter(m => m.modelId !== modelId);
    await uiStore.setToStorage(IMPORTED_MODELS_STORAGE_KEY, models);
    return models;
  },
};

export default ImportedModels;
