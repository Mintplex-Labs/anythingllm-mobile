import { HF_DOMAIN, urls } from './constants';
import { ModelFileDetails } from '@/utils/types';

/**
 * Helpers for browsing GGUF repositories on the Hugging Face Hub so users can
 * bring any GGUF quant on-device, not just the ones in our catalog.
 *
 * Public endpoints used (no auth token required for public repos):
 *  - GET /api/models?filter=gguf&search=...      search repos that carry the `gguf` tag
 *  - GET /api/models/{repo}?expand[]=gguf&...    repo metadata + GGUF header info
 *  - GET /api/models/{repo}/tree/main?recursive  files with sizes
 *  - GET /{repo}/resolve/main/{file}             download url (used by the model manager)
 *
 * @see https://huggingface.co/docs/hub/api
 */

export type HfGGUFRepoSummary = {
  /** `org/model` */
  id: string;
  author: string;
  /** Humanised repo name, eg. "Qwen3.5 2B" */
  title: string;
  downloads: number;
  likes: number;
  /** True when the repo requires accepting terms - we cannot download these without a token. */
  gated: boolean;
  /** GGUF header info when the hub has parsed it */
  architecture?: string;
  /** Total parameter count reported by the GGUF header */
  params?: number;
  contextLength?: number;
  pipelineTag?: string;
  lastModified?: string;
};

export type HfGGUFQuant = {
  /** Path inside the repo, may include a subfolder (bartowski style repos). */
  path: string;
  /** Just the file name */
  filename: string;
  /** Quantization label parsed from the file name, eg. Q4_K_M, IQ4_XS, UD-Q4_K_XL, BF16 */
  quant: string | null;
  size: number;
  downloadUrl: string;
};

export type HfGGUFRepo = {
  repo: HfGGUFRepoSummary;
  quants: HfGGUFQuant[];
};

export class HfGGUFError extends Error {
  code: 'not_found' | 'gated' | 'no_gguf' | 'network' | 'invalid';
  constructor(code: HfGGUFError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Accepts anything a user is likely to paste and returns the `org/model` repo id, or null.
 *  - unsloth/Qwen3.5-2B-GGUF
 *  - https://huggingface.co/unsloth/Qwen3.5-2B-GGUF
 *  - https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/tree/main
 *  - hf.co/unsloth/Qwen3.5-2B-GGUF
 */
export function parseHfRepoId(input: string): string | null {
  if (!input) return null;
  let value = input.trim();
  if (!value) return null;

  value = value
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?(huggingface\.co|hf\.co)\//i, '')
    .replace(/^\/+/, '');

  // Drop anything after the repo id (tree/main, blob/..., resolve/..., ?query, #hash)
  value = value.split(/[?#]/)[0];
  const parts = value.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [org, repo] = parts;
  const segment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!segment.test(org) || !segment.test(repo)) return null;
  return `${org}/${repo}`;
}

/** True when the input looks like a repo id / url rather than a free-text search. */
export function looksLikeHfRepoId(input: string) {
  return parseHfRepoId(input) !== null && /\//.test(input.trim());
}

/**
 * Turns a repo name like "Qwen_Qwen3.5-2B-GGUF" or "gemma-3-1b-it-GGUF" into "Qwen Qwen3.5 2B" / "Gemma 3 1b it".
 */
export function humanizeRepoName(repoId: string) {
  const repo = repoId.split('/').pop() || repoId;
  return repo
    .replace(/[-_.]?gguf$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

const QUANT_REGEX = /(UD-)?(I?Q\d(?:_[A-Z0-9]+)*|BF16|F16|F32|MXFP4(?:_[A-Z0-9]+)*)/i;

/** Extracts the quantization label from a gguf file name, eg. "Qwen3.5-2B-UD-Q4_K_XL.gguf" -> "UD-Q4_K_XL". */
export function parseQuantLabel(filename: string): string | null {
  const base = filename.replace(/\.gguf$/i, '');
  const match = base.match(QUANT_REGEX);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Only single-file text model weights are loadable by us. Skip:
 *  - vision projector files (mmproj-*.gguf) that pair with a text model
 *  - sharded weights (*-00001-of-00003.gguf) since we download a single file
 *  - anything that is not a .gguf
 */
function isLoadableGGUF(path: string) {
  const name = path.split('/').pop() || path;
  if (!/\.gguf$/i.test(name)) return false;
  if (/^mmproj/i.test(name) || /mmproj/i.test(name)) return false;
  if (/-\d{5}-of-\d{5}\.gguf$/i.test(name)) return false;
  return true;
}

/** The hub reports `gated` as `false`, or a string such as "auto" / "manual" when access must be requested. */
const isGated = (value: unknown) => value === true || typeof value === 'string';

async function hfFetch(url: string): Promise<Response> {
  try {
    return await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new HfGGUFError('network', 'Could not reach Hugging Face. Check your internet connection and try again.');
  }
}

function throwForStatus(response: Response, repoId: string): never {
  // The hub answers 401 for private, gated *and* non-existent repos so it does not leak repo names.
  if (response.status === 401 || response.status === 403) {
    throw new HfGGUFError('gated', `"${repoId}" was not found, or it is private or gated. Only public, ungated repos can be downloaded.`);
  }
  if (response.status === 404) throw new HfGGUFError('not_found', `"${repoId}" was not found on Hugging Face.`);
  throw new HfGGUFError('network', `Hugging Face returned an error (${response.status}). Try again later.`);
}

/**
 * Loads a repo's metadata and every downloadable GGUF quant it contains.
 * Throws an `HfGGUFError` with a user-presentable message on failure.
 */
export async function fetchGGUFRepo(input: string): Promise<HfGGUFRepo> {
  const repoId = parseHfRepoId(input);
  if (!repoId) throw new HfGGUFError('invalid', 'Enter a Hugging Face model id like "unsloth/Qwen3.5-2B-GGUF" or paste the model page url.');

  const expand = ['gguf', 'gated', 'downloads', 'likes', 'author', 'pipeline_tag', 'lastModified', 'private']
    .map(field => `expand[]=${field}`)
    .join('&');

  const [infoRes, treeRes] = await Promise.all([
    hfFetch(`${urls.modelSpecs(repoId)}?${expand}`),
    hfFetch(`${urls.modelTree(repoId)}?recursive=true`),
  ]);
  if (!infoRes.ok) throwForStatus(infoRes, repoId);
  if (!treeRes.ok) throwForStatus(treeRes, repoId);

  const info = await infoRes.json();
  const tree = (await treeRes.json()) as ModelFileDetails[];

  const quants: HfGGUFQuant[] = tree
    .filter(file => file.type === 'file' && isLoadableGGUF(file.path))
    .map(file => {
      const filename = file.path.split('/').pop() || file.path;
      return {
        path: file.path,
        filename,
        quant: parseQuantLabel(filename),
        size: file.lfs?.size ?? file.size ?? 0,
        downloadUrl: urls.modelDownloadFile(repoId, file.path),
      };
    })
    .sort((a, b) => a.size - b.size);

  if (!quants.length) {
    throw new HfGGUFError('no_gguf', `"${repoId}" has no downloadable GGUF files. Look for a "-GGUF" version of this model, usually published by unsloth, bartowski or lmstudio-community.`);
  }

  const gated = isGated(info.gated);
  const repo: HfGGUFRepoSummary = {
    id: info.id || repoId,
    author: info.author || repoId.split('/')[0],
    title: humanizeRepoName(info.id || repoId),
    downloads: info.downloads ?? 0,
    likes: info.likes ?? 0,
    gated,
    architecture: info.gguf?.architecture,
    params: info.gguf?.total,
    contextLength: info.gguf?.context_length,
    pipelineTag: info.pipeline_tag,
    lastModified: info.lastModified,
  };

  return { repo, quants };
}

export type HfGGUFSearchResult = {
  id: string;
  author: string;
  title: string;
  downloads: number;
  likes: number;
  gated: boolean;
  pipelineTag?: string;
};

/**
 * Searches the hub for repos tagged `gguf` matching the query, most downloaded first.
 */
export async function searchGGUFRepos(query: string, limit = 20): Promise<HfGGUFSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    search: q,
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: String(limit),
  });
  const response = await hfFetch(`${urls.modelsList()}?${params.toString()}`);
  if (!response.ok) throw new HfGGUFError('network', `Hugging Face search failed (${response.status}). Try again later.`);

  const results = (await response.json()) as any[];
  return results.map(item => ({
    id: item.id,
    author: item.author || String(item.id).split('/')[0],
    title: humanizeRepoName(item.id),
    downloads: item.downloads ?? 0,
    likes: item.likes ?? 0,
    gated: isGated(item.gated),
    pipelineTag: item.pipeline_tag,
  }));
}

export const hfRepoWebUrl = (repoId: string) => `${HF_DOMAIN}/${repoId}`;
