import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Linking,
} from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import Clipboard from '@react-native-clipboard/clipboard';
import DeviceInfo from 'react-native-device-info';
import {
  ArrowLeft,
  ArrowSquareOut,
  ClipboardText,
  DownloadSimple,
  Lock,
  MagnifyingGlass,
  Warning,
  X,
} from 'phosphor-react-native';
import {
  fetchGGUFRepo,
  HfGGUFError,
  HfGGUFQuant,
  HfGGUFRepo,
  HfGGUFSearchResult,
  hfRepoWebUrl,
  looksLikeHfRepoId,
  searchGGUFRepos,
} from '@/utils/api/hfGguf';
import { buildImportedModel, ImportedModel, importedModelId } from '@/utils/models/imported';
import { formatBytes, formatNumber } from '@/utils/formatters';
import { findIconByModelName } from '@/components/MonoProviderIcon';

/**
 * Lets the user paste a Hugging Face repo id / url (or search the hub) and pick
 * one of the repo's GGUF quants to download and run on-device.
 *
 * Rendering is done with `FlatList` so it can live inside the model picker bottom sheet.
 */

type Props = {
  /** Prefill the input, eg. with the text the user typed in the model search box. */
  initialQuery?: string;
  /** Called when the user picks a quant. Should kick off the download and return whether it started. */
  onDownload: (model: ImportedModel) => Promise<boolean> | boolean;
  /** Ids (`org/repo/file.gguf`) that are already installed or already in the list. */
  installedModelIds?: string[];
  /** Download currently in progress (url) so we can disable other rows */
  activeDownloadUrl?: string | null;
  downloadProgress?: number;
  onBack: () => void;
  onInputFocus?: () => void;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'repo'; data: HfGGUFRepo }
  | { kind: 'search'; query: string; results: HfGGUFSearchResult[] };

/**
 * Same budget used by `useMemoryCheck`: llama.cpp needs the weights in memory plus
 * some headroom for the KV cache, so anything above ~65% of device RAM is flagged.
 */
function memoryBudgetBytes() {
  try {
    const total = DeviceInfo.getTotalMemorySync();
    if (!total) return null;
    return Math.min(total * 0.65, total - 1.2e9);
  } catch {
    return null;
  }
}
const estimatedRuntimeBytes = (fileSize: number) => 0.43e9 + 0.92 * fileSize;

export default function HuggingFaceImport({
  initialQuery = '',
  onDownload,
  installedModelIds = [],
  activeDownloadUrl,
  downloadProgress = 0,
  onBack,
  onInputFocus,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const requestId = useRef(0);
  const memoryBudget = useMemo(memoryBudgetBytes, []);
  const installed = useMemo(() => new Set(installedModelIds), [installedModelIds]);

  const lookup = useCallback(async (input: string) => {
    const value = input.trim();
    if (!value) return;
    Keyboard.dismiss();
    const id = ++requestId.current;
    setStatus({ kind: 'loading' });

    try {
      if (looksLikeHfRepoId(value)) {
        const data = await fetchGGUFRepo(value);
        if (requestId.current !== id) return;
        setStatus({ kind: 'repo', data });
      } else {
        const results = await searchGGUFRepos(value);
        if (requestId.current !== id) return;
        setStatus({ kind: 'search', query: value, results });
      }
    } catch (error: any) {
      if (requestId.current !== id) return;
      const message = error instanceof HfGGUFError ? error.message : 'Something went wrong talking to Hugging Face.';
      setStatus({ kind: 'error', message });
    }
  }, []);

  // Auto-run when opened with a query already typed in the model search box.
  useEffect(() => {
    if (initialQuery.trim()) lookup(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pasteFromClipboard = async () => {
    const text = (await Clipboard.getString())?.trim();
    if (!text) return;
    setQuery(text);
    lookup(text);
  };

  const openRepo = (repoId: string) => {
    setQuery(repoId);
    lookup(repoId);
  };

  const header = (
    <View className="w-full" style={{ gap: 12 }}>
      <View className="flex flex-row items-center" style={{ gap: 8 }}>
        <TouchableOpacity onPress={onBack} hitSlop={10} className="p-1">
          <ArrowLeft size={22} color="white" weight="bold" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white text-base font-semibold">Add a model from Hugging Face</Text>
          <Text className="text-[#9F9FA0] text-xs">
            Paste a model id or url, or search. Any public GGUF quant can be downloaded and run on this device.
          </Text>
        </View>
      </View>

      <View className="flex flex-row items-center bg-[#27282A] rounded-lg px-3">
        <MagnifyingGlass size={18} weight="bold" color="white" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => lookup(query)}
          onFocus={onInputFocus}
          placeholder="unsloth/Qwen3.5-2B-GGUF"
          placeholderTextColor="#9F9FA0"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 h-[40px] ml-2 text-white"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => { setQuery(''); setStatus({ kind: 'idle' }); }} hitSlop={8}>
            <X size={18} color="white" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={pasteFromClipboard} hitSlop={8}>
            <ClipboardText size={18} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={() => lookup(query)}
        disabled={!query.trim() || status.kind === 'loading'}
        className={`rounded-lg py-2.5 items-center ${!query.trim() ? 'bg-white/10' : 'bg-white'}`}>
        <Text className={`text-sm font-medium ${!query.trim() ? 'text-[#9F9FA0]' : 'text-black'}`}>
          {looksLikeHfRepoId(query) ? 'Show GGUF files' : 'Search Hugging Face'}
        </Text>
      </TouchableOpacity>

      {status.kind === 'loading' && <ActivityIndicator color="white" style={{ marginTop: 16 }} />}

      {status.kind === 'error' && (
        <View className="flex flex-row items-start bg-red-500/15 rounded-lg p-3" style={{ gap: 8 }}>
          <Warning size={18} color="#fca5a5" weight="bold" />
          <Text className="text-red-200 text-sm flex-1">{status.message}</Text>
        </View>
      )}

      {status.kind === 'repo' && <RepoHeader repo={status.data.repo} />}

      {status.kind === 'search' && (
        <Text className="text-[#9F9FA0] text-xs">
          {status.results.length
            ? `GGUF repos matching "${status.query}", most downloaded first. Tap one to see its files.`
            : `No GGUF repos found for "${status.query}".`}
        </Text>
      )}

      {status.kind === 'idle' && (
        <Text className="text-[#9F9FA0] text-xs leading-5">
          Tip: most models have a GGUF version under a name ending in "-GGUF" from unsloth, bartowski or lmstudio-community.
          Smaller quants (Q4_K_M and below) run best on phones. Gated or private models are not supported.
        </Text>
      )}
    </View>
  );

  const items: Array<{ key: string; kind: 'quant'; quant: HfGGUFQuant } | { key: string; kind: 'result'; result: HfGGUFSearchResult }> =
    status.kind === 'repo'
      ? status.data.quants.map(quant => ({ key: quant.path, kind: 'quant' as const, quant }))
      : status.kind === 'search'
        ? status.results.map(result => ({ key: result.id, kind: 'result' as const, result }))
        : [];

  return (
    <BottomSheetFlatList
      data={items}
      keyExtractor={item => item.key}
      className="w-full"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 10 }}
      renderItem={({ item }) => {
        if (item.kind === 'result') return <SearchResultRow result={item.result} onPress={() => openRepo(item.result.id)} />;
        if (status.kind !== 'repo') return null;

        const { repo } = status.data;
        const modelId = importedModelId(repo.id, item.quant.filename);
        const runtimeEstimate = estimatedRuntimeBytes(item.quant.size);
        return (
          <QuantRow
            quant={item.quant}
            isInstalled={installed.has(modelId)}
            isDownloading={activeDownloadUrl === item.quant.downloadUrl}
            downloadProgress={downloadProgress}
            disabled={!!activeDownloadUrl && activeDownloadUrl !== item.quant.downloadUrl}
            exceedsMemory={memoryBudget !== null && runtimeEstimate > memoryBudget}
            gated={repo.gated}
            onPress={() => onDownload(buildImportedModel(repo, item.quant))}
          />
        );
      }}
    />
  );
}

function RepoHeader({ repo }: { repo: HfGGUFRepo['repo'] }) {
  const MonoIcon = findIconByModelName(repo.id);
  const facts = [
    repo.architecture,
    repo.params ? `${formatNumber(repo.params, 1, true, false)} params` : null,
    repo.contextLength ? `${Math.round(repo.contextLength / 1024)}k context` : null,
    `${formatNumber(repo.downloads, 1, true, false)} downloads`,
  ].filter(Boolean);

  return (
    <View className="bg-[#2A2A2E] rounded-xl p-4" style={{ gap: 6 }}>
      <View className="flex flex-row items-center" style={{ gap: 10 }}>
        {MonoIcon && (
          <View className="w-[34px] h-[34px] rounded-lg justify-center items-center bg-white">
            <MonoIcon width={22} height={22} color="#000" style={{}} />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-white text-base font-medium" numberOfLines={1}>{repo.title}</Text>
          <Text className="text-[#9F9FA0] text-xs" numberOfLines={1}>{repo.id}</Text>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(hfRepoWebUrl(repo.id))} hitSlop={8}>
          <ArrowSquareOut size={18} color="#9F9FA0" />
        </TouchableOpacity>
      </View>
      {facts.length > 0 && <Text className="text-[#9F9FA0] text-xs">{facts.join(' · ')}</Text>}
      {repo.gated && (
        <View className="flex flex-row items-center" style={{ gap: 6 }}>
          <Lock size={14} color="#fcd34d" weight="bold" />
          <Text className="text-yellow-200 text-xs flex-1">
            This repo is gated. Downloads need a Hugging Face login, which is not supported yet.
          </Text>
        </View>
      )}
    </View>
  );
}

function SearchResultRow({ result, onPress }: { result: HfGGUFSearchResult; onPress: () => void }) {
  const MonoIcon = findIconByModelName(result.id);
  return (
    <TouchableOpacity onPress={onPress} className="w-full p-4 rounded-xl bg-[#2A2A2E] flex-row items-center" style={{ gap: 10 }}>
      <View className="w-[38px] h-[38px] rounded-lg justify-center items-center bg-white">
        {MonoIcon
          ? <MonoIcon width={24} height={24} color="#000" style={{}} />
          : <Text className="text-black text-base font-semibold">{result.title.charAt(0)}</Text>}
      </View>
      <View className="flex-1">
        <Text className="text-white text-base font-medium" numberOfLines={1}>{result.title}</Text>
        <Text className="text-[#9F9FA0] text-xs" numberOfLines={1}>
          {result.id} · {formatNumber(result.downloads, 1, true, false)} downloads
        </Text>
      </View>
      {result.gated && <Lock size={16} color="#fcd34d" weight="bold" />}
    </TouchableOpacity>
  );
}

function QuantRow({
  quant,
  isInstalled,
  isDownloading,
  downloadProgress,
  disabled,
  exceedsMemory,
  gated,
  onPress,
}: {
  quant: HfGGUFQuant;
  isInstalled: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  disabled: boolean;
  exceedsMemory: boolean;
  gated: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || gated}
      style={{ opacity: disabled || gated ? 0.5 : 1 }}
      className="w-full p-4 rounded-xl bg-[#2A2A2E] flex-row items-center justify-between">
      <View className="flex-1" style={{ gap: 2 }}>
        <View className="flex flex-row items-center" style={{ gap: 8 }}>
          <Text className="text-white text-base font-medium">{quant.quant ?? 'GGUF'}</Text>
          {isInstalled && (
            <View className="rounded-full px-2 py-0.5 bg-[#6ce9a6]/20">
              <Text className="text-[#6ce9a6] text-[10px] font-medium">Installed</Text>
            </View>
          )}
          {exceedsMemory && !isInstalled && (
            <View className="rounded-full px-2 py-0.5 bg-yellow-500/30">
              <Text className="text-yellow-200 text-[10px] font-medium">May not fit in memory</Text>
            </View>
          )}
        </View>
        <Text className="text-[#9F9FA0] text-xs" numberOfLines={1}>{quant.path}</Text>
        <Text className="text-[#9F9FA0] text-xs">{formatBytes(quant.size)}</Text>
      </View>
      {isDownloading ? (
        <View className="flex-row items-center gap-2 ml-4">
          <View className="w-[80px] h-[4px] bg-[#323235] rounded-full overflow-hidden">
            <View className="h-full bg-[#6ce9a6] rounded-full" style={{ width: `${downloadProgress}%` }} />
          </View>
          <Text className="text-xs text-white min-w-[32px]">{downloadProgress}%</Text>
        </View>
      ) : (
        <View className="w-[24px] h-[24px] justify-center items-center ml-4">
          <DownloadSimple size={24} color="#ffffff" weight="bold" />
        </View>
      )}
    </TouchableOpacity>
  );
}
