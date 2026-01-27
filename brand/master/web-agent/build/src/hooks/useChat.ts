import { useCallback } from 'react';
import { useChatStream, type Message } from './useChatStream';

interface UseChatOptions {
  brand: string;
  apiUrl?: string;
  onMessageComplete?: (message: Message) => void;
}

export function useChat({ brand, apiUrl, onMessageComplete }: UseChatOptions) {
  const { messages, isLoading, error, sendMessage, clearMessages, addUserMessage, addAIMessage } = useChatStream({
    brand,
    apiUrl,
    onMessageComplete,
  });

  const sendMessageWithMetadata = useCallback(
    (
      message: string,
      messageCount: number = 0,
      usedButtons: string[] = [],
      metadata: Record<string, unknown> = {},
      skipUserMessage: boolean = false,
      displayMessage?: string
    ) => sendMessage(message, messageCount, usedButtons, metadata, skipUserMessage, displayMessage),
    [sendMessage]
  );

  const handleQuickButton = useCallback(
    (buttonText: string, messageCount: number = 0, usedButtons: string[] = []) => {
      sendMessage(buttonText, messageCount, usedButtons);
    },
    [sendMessage]
  );

  const handleFollowUp = useCallback(
    (followUpText: string, messageCount: number) => {
      sendMessage(followUpText, messageCount);
    },
    [sendMessage]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage: sendMessageWithMetadata,
    handleQuickButton,
    handleFollowUp,
    clearMessages,
    addUserMessage,
    addAIMessage,
  };
}

