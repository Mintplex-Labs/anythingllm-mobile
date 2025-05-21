import React, {useRef, useCallback} from 'react';

import {toJS} from 'mobx';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';

import {randId} from '../utils';
import {L10nContext} from '../utils';
import {chatSessionStore, modelStore, palStore} from '../store';

import {MessageType, User} from '../utils/types';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {
  CompletionParams,
  toApiCompletionParams,
} from '../utils/completionTypes';
import {
  applyChatTemplate,
  convertToChatMessages,
  removeThinkingParts,
} from '../utils/chat';

export const useChatSession = (
  currentMessageInfo: React.MutableRefObject<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>,
  user: User,
  assistant: User,
) => {
  const l10n = React.useContext(L10nContext);
  const conversationIdRef = useRef<string>(randId());

  // Time-based batch processing
  // Token queue for accumulating tokens
  const tokenQueue = useRef<
    Array<{token: string; createdAt: number; id: string; sessionId: string}>
  >([]);
  const isProcessingTokens = useRef(false);
  const isMounted = useRef(true); // we use Drawer.Navigator, so the screen won't unmount. Not sure how useful this is.
  const batchTimer = useRef<NodeJS.Timeout | null>(null);
  const batchTimeout = 100; // Process batch every 100ms

  // Process all accumulated tokens in a batch
  const processTokenBatch = useCallback(async () => {
    if (isProcessingTokens.current || tokenQueue.current.length === 0) {
      return;
    }

    isProcessingTokens.current = true;
    batchTimer.current = null;

    try {
      // Take all accumulated tokens
      const tokensToProcess = [...tokenQueue.current];
      tokenQueue.current = [];
      const context = modelStore.context;

      if (context && tokensToProcess.length > 0) {
        // Group tokens by message ID
        const messageUpdates: Record<string, string> = {};

        tokensToProcess.forEach(({token, id}) => {
          messageUpdates[id] = (messageUpdates[id] || '') + token;
        });

        // Update each message in a single operation
        for (const [id, combinedToken] of Object.entries(messageUpdates)) {
          try {
            await chatSessionStore.updateMessageToken(
              {token: combinedToken},
              tokensToProcess[0].createdAt, // Use first token's timestamp
              id,
              tokensToProcess[0].sessionId, // Use first token's session
              context,
            );
          } catch (error) {
            console.error('Error updating message token batch:', error);
          }
        }
      }
    } finally {
      isProcessingTokens.current = false;

      // Schedule next batch if there are new tokens
      if (tokenQueue.current.length > 0) {
        if (isMounted.current) {
          // Normal case - component is mounted, schedule next batch
          if (!batchTimer.current) {
            batchTimer.current = setTimeout(processTokenBatch, batchTimeout);
          }
        } else {
          // Component is unmounted but we still have tokens - process immediately
          // This ensures all tokens are saved even after navigation
          processTokenBatch();
        }
      }
    }
  }, [batchTimeout]);

  // Add token to queue and schedule processing
  const queueToken = useCallback(
    (token: string, createdAt: number, id: string, sessionId: string) => {
      // Add token to queue
      tokenQueue.current.push({token, createdAt, id, sessionId});

      // Schedule processing if not already scheduled
      if (!batchTimer.current && isMounted.current) {
        batchTimer.current = setTimeout(processTokenBatch, batchTimeout);
      }
    },
    [processTokenBatch, batchTimeout],
  );

  // Cleanup on unmount
  // In Drawer.Navigator, the screen won't unmount. Not sure how useful this is.
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      // Process any remaining tokens immediately instead of waiting for the timer
      if (tokenQueue.current.length > 0 && !isProcessingTokens.current) {
        // Force process the remaining tokens
        processTokenBatch();
      }

      // After a short delay to allow processing to complete, clean up
      setTimeout(() => {
        isMounted.current = false;
        // Clear any pending timer
        if (batchTimer.current) {
          clearTimeout(batchTimer.current);
          batchTimer.current = null;
        }
      }, 500); // Give 500ms for processing to complete
    };
  }, [processTokenBatch]);

  const addMessage = async (message: MessageType.Any) => {
    await chatSessionStore.addMessageToCurrentSession(message);
  };

  const addSystemMessage = async (text: string, metadata = {}) => {
    const textMessage: MessageType.Text = {
      author: assistant,
      createdAt: Date.now(),
      id: randId(),
      text,
      type: 'text',
      metadata: {system: true, ...metadata},
    };
    await addMessage(textMessage);
  };

  const handleSendPress = async (message: MessageType.PartialText) => {
    const context = modelStore.context;
    if (!context) {
      await addSystemMessage(l10n.chat.modelNotLoaded);
      return;
    }

    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      id: '', // Will be set by the database
      text: message.text,
      type: 'text',
      metadata: {
        contextId: context.id,
        conversationId: conversationIdRef.current,
        copyable: true,
      },
    };
    await addMessage(textMessage);
    modelStore.setInferencing(true);
    modelStore.setIsStreaming(false);
    chatSessionStore.setIsGenerating(true);

    // Keep screen awake during completion
    try {
      activateKeepAwake();
    } catch (error) {
      console.error('Failed to activate keep awake during chat:', error);
      // Continue with chat even if keep awake fails
    }

    const activeSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    let systemPrompt = '';
    if (activeSession?.activePalId) {
      const pal = palStore.pals.find(p => p.id === activeSession.activePalId);
      if (pal?.systemPrompt) {
        systemPrompt = pal.systemPrompt;
      }
    }

    const getSystemMessage = () => {
      // If no system prompt is available at all, return empty array
      if (
        !systemPrompt &&
        !modelStore.activeModel?.chatTemplate?.systemPrompt?.trim()
      ) {
        return [];
      }

      // Prefer custom system prompt, fall back to template's system prompt
      const finalSystemPrompt =
        systemPrompt ||
        modelStore.activeModel?.chatTemplate?.systemPrompt ||
        '';

      if (finalSystemPrompt?.trim() === '') {
        return [];
      }
      return [
        {
          role: 'system' as 'system',
          content: finalSystemPrompt,
        },
      ];
    };

    const chatMessages = [
      ...getSystemMessage(),
      ...convertToChatMessages([
        textMessage,
        ...chatSessionStore.currentSessionMessages.filter(
          msg => msg.id !== textMessage.id,
        ),
      ]),
    ];

    let prompt = await applyChatTemplate(
      chatMessages,
      modelStore.activeModel ?? null,
      context,
    );

    // Get the completion settings from the session
    const sessionCompletionSettings = toJS(activeSession?.completionSettings);

    // If the user has disabled including thinking parts in the context, remove them
    // Default to true if not specified
    const includeThinkingInContext =
      (sessionCompletionSettings as CompletionParams)
        ?.include_thinking_in_context !== false;
    if (!includeThinkingInContext) {
      prompt =
        typeof prompt === 'string' ? removeThinkingParts(prompt) : prompt;
    }

    const stopWords = toJS(modelStore.activeModel?.stopWords);

    // Create completion params with app-specific properties
    const completionParamsWithAppProps = {
      ...sessionCompletionSettings,
      prompt,
      stop: stopWords,
    } as CompletionParams;

    // Strip app-specific properties before passing to llama.rn
    const cleanCompletionParams = toApiCompletionParams(
      completionParamsWithAppProps,
    );

    const createdAt = Date.now();
    const newMessage = await chatSessionRepository.addMessageToSession(
      chatSessionStore.activeSessionId!,
      {
        author: assistant,
        createdAt: createdAt,
        id: '',
        text: '',
        type: 'text',
        metadata: {
          contextId: context.id,
          conversationId: conversationIdRef.current,
          copyable: true,
        },
      },
    );
    currentMessageInfo.current = {
      createdAt,
      id: newMessage.id,
      sessionId: chatSessionStore.activeSessionId!,
    };

    try {
      const result = await context.completion(cleanCompletionParams, data => {
        if (data.token && currentMessageInfo.current) {
          if (!modelStore.isStreaming) {
            modelStore.setIsStreaming(true);
          }

          // Queue each token individually for processing
          queueToken(
            data.token,
            currentMessageInfo.current.createdAt,
            currentMessageInfo.current.id,
            currentMessageInfo.current.sessionId,
          );
        }
      });

      // No need to flush remaining tokens as each token is processed individually
      // Just wait for the queue to finish processing
      while (tokenQueue.current.length > 0 || isProcessingTokens.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Update only the metadata in the database
      // The text is already being updated with each token
      await chatSessionStore.updateMessage(
        currentMessageInfo.current.id,
        currentMessageInfo.current.sessionId,
        {
          metadata: {timings: result.timings, copyable: true},
        },
      );
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
    } catch (error) {
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('network')) {
        // TODO: This can be removed. We don't use network for chat.
        await addSystemMessage(l10n.common.networkError);
      } else {
        await addSystemMessage(`${l10n.chat.completionFailed}${errorMessage}`);
      }
    } finally {
      // Always try to deactivate keep awake in finally block
      try {
        deactivateKeepAwake();
      } catch (error) {
        console.error('Failed to deactivate keep awake after chat:', error);
      }
    }
  };

  const handleResetConversation = async () => {
    conversationIdRef.current = randId();
    await addSystemMessage(l10n.chat.conversationReset);
  };

  const handleStopPress = async () => {
    const context = modelStore.context;
    if (modelStore.inferencing && context) {
      context.stopCompletion();
    }
    // Wait for any queued tokens to finish processing
    if (tokenQueue.current.length > 0 || isProcessingTokens.current) {
      try {
        // Wait for the queue to finish processing
        while (tokenQueue.current.length > 0 || isProcessingTokens.current) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        console.error('Error when stopping completion:', error);
      }
    }
    modelStore.setInferencing(false);
    modelStore.setIsStreaming(false);
    // Deactivate keep awake when stopping completion
    try {
      deactivateKeepAwake();
    } catch (error) {
      console.error(
        'Failed to deactivate keep awake after stopping chat:',
        error,
      );
    }
  };

  return {
    handleSendPress,
    handleResetConversation,
    handleStopPress,
  };
};
