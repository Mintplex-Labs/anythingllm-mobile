import uiStore from '@/store/UIStore';
import { HfGGUFQuant, HfGGUFRepoSummary } from '@/utils/api/hfGguf';
import i18n from '@/i18n';

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

/**
 * List description for an imported model, in the current UI language. Built when the list is shown
 * (see OnDeviceProvider.availableModels) so it follows language changes after the model was added.
 */
export function describeImportedModel(model: { repoId: string; architecture?: string; contextLength?: number }): string {
  const specs = [
    model.architecture,
    model.contextLength ? i18n.t('hf_import.context', { value: Math.round(model.contextLength / 1024) }) : null,
  ].filter(Boolean).join(' · ');
  return specs
    ? i18n.t('models.imported_description_specs', { repo: model.repoId, specs })
    : i18n.t('models.imported_description', { repo: model.repoId });
}

export function buildImportedModel(repo: HfGGUFRepoSummary, quant: HfGGUFQuant): ImportedModel {
  const quantLabel = quant.quant ? ` (${quant.quant})` : '';

  return {
    modelId: importedModelId(repo.id, quant.filename),
    repoId: repo.id,
    filename: quant.filename,
    quant: quant.quant,
    name: `${repo.title}${quantLabel}`,
    description: describeImportedModel({ repoId: repo.id, architecture: repo.architecture, contextLength: repo.contextLength }),
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
