jest.mock('@/store/UIStore', () => ({ __esModule: true, default: { session: new Map(), getFromStorage: jest.fn() } }));
jest.mock('@/utils/navigationRef', () => ({ resetToWhenReady: jest.fn() }));
jest.mock('@/utils/Notification', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/Telemetry', () => ({ __esModule: true, default: { logEvent: jest.fn(), CUSTOM_EVENTS: { ACTIONS: {} } } }));
jest.mock('react-native', () => ({ Linking: { addEventListener: jest.fn(), getInitialURL: jest.fn() } }));

import { parseDeepLink } from '@/utils/DeepLinks';

describe('parseDeepLink', () => {
  test('repo + file', () => {
    expect(parseDeepLink('anythingllm://pull-hf?repo=unsloth/Qwen3-4B-GGUF&file=Qwen3-4B-Q4_K_M.gguf'))
      .toEqual({ action: 'pull-hf', repo: 'unsloth/Qwen3-4B-GGUF', file: 'Qwen3-4B-Q4_K_M.gguf' });
  });
  test('model alias, encoded, nested filepath', () => {
    expect(parseDeepLink('anythingllm://pull-hf?model=unsloth%2FQwen3-4B-GGUF&filepath=sub%2Fdir%2Fq.gguf'))
      .toEqual({ action: 'pull-hf', repo: 'unsloth/Qwen3-4B-GGUF', file: 'q.gguf' });
  });
  test('full hf url as repo, no file', () => {
    expect(parseDeepLink('anythingllm://pull-hf?repo=https://huggingface.co/bartowski/x-GGUF/tree/main'))
      .toEqual({ action: 'pull-hf', repo: 'bartowski/x-GGUF', file: null });
  });
  test('triple slash form', () => {
    expect(parseDeepLink('anythingllm:///pull-hf?repo=a/b')?.repo).toBe('a/b');
  });
  test('rejects', () => {
    expect(parseDeepLink('anythingllm://pull-hf?repo=notarepo')).toBeNull();
    expect(parseDeepLink('anythingllm://other?repo=a/b')).toBeNull();
    expect(parseDeepLink('https://huggingface.co/a/b')).toBeNull();
    expect(parseDeepLink(null)).toBeNull();
  });
});
