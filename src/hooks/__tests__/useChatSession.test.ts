import {LlamaContext} from '@pocketpalai/llama.rn';
import {renderHook, act} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {
  mockBasicModel,
  mockContextModel,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';

import {chatSessionStore, modelStore} from '../../store';

import {l10n} from '../../utils/l10n';
import {assistant} from '../../utils/chat';
import {ChatMessage} from '../../utils/types';

const mockAssistant = {
  id: 'h3o3lc5xj',
};

beforeEach(() => {
  jest.clearAllMocks();
  modelStore.context = new LlamaContext({
    contextId: 1,
    gpu: false,
    reasonNoGPU: '',
    model: mockContextModel,
  });
});
modelStore.models = modelsList;

const applyChatTemplateSpy = jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

describe('useChatSession', () => {
  beforeEach(() => {
    applyChatTemplateSpy.mockClear();
  });

  it('should send a message and update the chat session', async () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalled();
    expect(modelStore.context?.completion).toHaveBeenCalled();
  });

  it('should handle model not loaded scenario', async () => {
    modelStore.context = undefined;
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, assistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // TODO: fix this test:         "text": "Model not loaded. Please initialize the model.",
    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith({
      author: assistant,
      createdAt: expect.any(Number),
      id: expect.any(String),
      text: l10n.en.chat.modelNotLoaded,
      type: 'text',
      metadata: {system: true},
    });
  });

  it('should handle general errors during completion', async () => {
    const errorMessage = 'Some general error';
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockRejectedValueOnce(new Error(errorMessage));
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `Completion failed: ${errorMessage}`,
        author: assistant,
      }),
    );
  });

  it('should buffer and flush tokens correctly', async () => {
    const timings = {token_per_second: '1'};

    // Mock the updateMessageToken function to track the tokens
    const originalUpdateMessageToken = chatSessionStore.updateMessageToken;
    const mockUpdateMessageToken = jest
      .fn()
      .mockImplementation(
        async (
          data: any,
          createdAt: number,
          id: string,
          sessionId: string,
          context: any,
        ) => {
          return originalUpdateMessageToken.call(
            chatSessionStore,
            data,
            createdAt,
            id,
            sessionId,
            context,
          );
        },
      );
    chatSessionStore.updateMessageToken = mockUpdateMessageToken;

    // Mock the completion function to call onData with tokens
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation((_params, onData) => {
          onData({token: 'Hello'});
          onData({token: ', '});
          onData({token: 'world!'});
          return Promise.resolve({timings: timings, usage: {}});
        });
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Wait for all promises to resolve and throttling to complete
    // This is necessary because throttling is time-based
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    // Verify that updateMessageToken was called at least once
    expect(mockUpdateMessageToken).toHaveBeenCalled();

    // Get all the calls to updateMessageToken
    const calls = mockUpdateMessageToken.mock.calls;

    // Due to throttling, the tokens might be batched differently
    // What's important is that all the content is there
    const allTokens = calls.map(call => call[0].token).join('');

    expect(allTokens).toContain('Hello');
    expect(allTokens).toContain(', ');
    expect(allTokens).toContain('world!');

    // Restore the original function
    chatSessionStore.updateMessageToken = originalUpdateMessageToken;

    expect(chatSessionStore.updateMessage).toHaveBeenCalled();

    const expectedMetadata = {timings: timings, copyable: true};

    const matchingCall = (
      chatSessionStore.updateMessage as jest.Mock
    ).mock.calls.find(
      ([, , {metadata}]) =>
        metadata && metadata.timings && metadata.copyable === true,
    );

    expect(matchingCall).toBeDefined();
    expect(matchingCall[2].metadata).toEqual(expectedMetadata);
  });

  it('should reset the conversation', () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    result.current.handleResetConversation();

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        text: l10n.en.chat.conversationReset,
        author: assistant,
      }),
    );
  });

  it('should not stop completion when inferencing is false', () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    result.current.handleStopPress();

    expect(modelStore.context?.stopCompletion).not.toHaveBeenCalled();
  });

  it('should set inferencing correctly during send', async () => {
    let resolveCompletion: (value: any) => void;
    const completionPromise = new Promise(resolve => {
      resolveCompletion = resolve;
    });

    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation(() => completionPromise);
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    const sendPromise = act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(modelStore.inferencing).toBe(true);

    await act(async () => {
      resolveCompletion!({timings: {total: 100}, usage: {}});
      await sendPromise;
    });
    expect(modelStore.inferencing).toBe(false);
  });

  test.each([
    {systemPrompt: undefined, shouldInclude: false, description: 'undefined'},
    {systemPrompt: '', shouldInclude: false, description: 'empty string'},
    {systemPrompt: '   ', shouldInclude: false, description: 'whitespace-only'},
    {
      systemPrompt: 'You are a helpful assistant',
      shouldInclude: true,
      description: 'valid prompt',
    },
    {
      systemPrompt: '  Trimmed prompt  ',
      shouldInclude: true,
      description: 'prompt with whitespace',
    },
  ])(
    'should handle system prompt for $description',
    async ({systemPrompt, shouldInclude}) => {
      const testModel = {
        ...mockBasicModel,
        id: 'test-model',
        chatTemplate: {...mockBasicModel.chatTemplate, systemPrompt},
      };

      modelStore.models = [testModel];
      modelStore.setActiveModel(testModel.id);

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      if (shouldInclude && systemPrompt) {
        expect(applyChatTemplateSpy).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: systemPrompt,
            }),
          ]),
          expect.any(Object),
          expect.any(Object),
        );
      } else {
        const call = applyChatTemplateSpy.mock.calls[0];
        const messages = call[0] as ChatMessage[];
        expect(messages.some(msg => msg.role === 'system')).toBe(false);
      }
    },
  );
});
