import { useState, useCallback, useRef } from 'react';
import type { BrandConfig } from '@/configs';

export interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  isStreaming?: boolean;
  hasStreamed?: boolean;
  followUps?: string[];
}

interface UseChatStreamOptions {
  brand: string;
  apiUrl?: string;
  onMessageComplete?: (message: Message) => void;
}

const BCON_INTRO_LINE_REGEXES = [
  /^hi,?\s*i\s*(?:am|['’]m)\s*bcon'?s\s*ai strategist\.?$/i,
  /^hi,?\s*i\s*(?:am|['’]m)\s*proxe,\s*bcon'?s\s*ai marketing strategist\.?$/i,
  /^how can i help with your marketing today\??$/i,
  /^[a-z0-9 _.'-]{1,40}\s*,?\s*i\s*(?:am|['’]m)\s*bcon'?s\s*ai strategist\.?$/i,
  /^[a-z0-9 _.'-]{1,40}\s*,?\s*i\s*(?:am|['’]m)\s*proxe,\s*bcon'?s\s*ai marketing strategist\.?$/i,
];

const sanitizeAssistantText = (rawText: string, hasPriorAssistantMessage: boolean): string => {
  if (!rawText) return '';

  const withoutGenericGreeting = rawText
    .replace(/^(Hi there!|Hello!|Hey!|Hi!)\s*/gi, '')
    .replace(/^(Hi|Hello|Hey),?\s*/gi, '')
    .replace(/\[BUTTONS:[^\]]*\]/gi, '')
    // Never render leaked booking tool-call syntax. The streaming path yields
    // raw chunks (bypassing the server's cleanResponse), so strip it here too.
    .replace(/\b(check_availability|book_consultation)\s*\([^)]*\)/gi, '')
    .replace(/\b(check_availability|book_consultation)\b\s*:?\s*[^\n.]*/gi, '')
    .replace(/[—–]/g, '-')
    .trim();

  const normalized = withoutGenericGreeting
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!hasPriorAssistantMessage) {
    return normalized;
  }

  const strippedRepeatedIntro = normalized
    .replace(/\bhi,?\s*i\s*(?:am|['’]m)\s*bcon'?s\s*ai strategist\.?/gi, '')
    .replace(/\bhi,?\s*i\s*(?:am|['’]m)\s*proxe,\s*bcon'?s\s*ai marketing strategist\.?/gi, '')
    .replace(/\b[a-z0-9 _.'-]{1,40}\s*,?\s*i\s*(?:am|['’]m)\s*bcon'?s\s*ai strategist\.?/gi, '')
    .replace(/\b[a-z0-9 _.'-]{1,40}\s*,?\s*i\s*(?:am|['’]m)\s*proxe,\s*bcon'?s\s*ai marketing strategist\.?/gi, '')
    .replace(/\bi\s*(?:am|['’]m)\s*bcon'?s\s*ai strategist\.?/gi, '');
  const strippedRepeatedIdentity = strippedRepeatedIntro
    .replace(/\bi\s*(?:am|['’]m)\s*proxe,\s*bcon'?s\s*ai marketing strategist\.?/gi, '');

  const lines = strippedRepeatedIdentity
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[,\-:]\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean);

  const filtered = lines.filter(
    (line) => !BCON_INTRO_LINE_REGEXES.some((regex) => regex.test(line))
  );

  const cleaned = filtered.join('\n').trim();
  return cleaned || normalized;
};

export function useChatStream({ brand, apiUrl, onMessageComplete }: UseChatStreamOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageRef = useRef<Message | null>(null);
  const streamingQueueRef = useRef<string[]>([]);
  const isStreamingCharsRef = useRef<boolean>(false);
  // Raw (unsanitized) accumulator for the message currently streaming. Kept
  // separate from the displayed text so sanitizeAssistantText (which strips a
  // repeated greeting/intro) can be re-applied on every chunk instead of only
  // once at stream-end — otherwise the raw greeting flashes on screen for the
  // whole stream, then visibly vanishes the instant it completes.
  const rawStreamTextRef = useRef<string>('');

  const addUserMessage = useCallback((message: string) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: 'user',
      text: message,
    };
    setMessages((prev) => [...prev, userMessage]);
    return userMessage;
  }, []);

  const addAIMessage = useCallback((message: string) => {
    const aiMessage: Message = {
      id: `ai-${Date.now()}`,
      type: 'ai',
      text: message,
      isStreaming: false,
      hasStreamed: true,
      followUps: [],
    };
    setMessages((prev) => [...prev, aiMessage]);
    return aiMessage;
  }, []);

  const addStreamingAIMessage = useCallback((initialText: string = '') => {
    const aiMessage: Message = {
      id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: 'ai',
      text: initialText,
      isStreaming: true,
      hasStreamed: false,
      followUps: [],
    };
    setMessages((prev) => [...prev, aiMessage]);
    return aiMessage;
  }, []);

  const updateMessageText = useCallback((id: string, text: string) => {
    setMessages((prev) => prev.map((msg) => msg.id === id ? { ...msg, text } : msg));
  }, []);

  const finishMessage = useCallback((id: string) => {
    setMessages((prev) => prev.map((msg) => msg.id === id ? { ...msg, isStreaming: false, hasStreamed: true } : msg));
  }, []);

  const sendMessage = useCallback(async (
    message: string,
    messageCount: number = 0,
    usedButtons: string[] = [],
    metadata: Record<string, unknown> = {},
    skipUserMessage: boolean = false,
    displayMessage?: string
  ) => {
    // Cancel any ongoing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsLoading(true);
    setError(null);

    // Add user message (unless skipUserMessage is true)
    // Use displayMessage if provided, otherwise use message
    if (!skipUserMessage) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        type: 'user',
        text: displayMessage || message,
      };
      setMessages((prev) => [...prev, userMessage]);
    }

    // Create loading message
    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      type: 'ai',
      text: '',
      isStreaming: true,
      hasStreamed: false,
      followUps: [],
    };
    setMessages((prev) => [...prev, loadingMessage]);
    streamingMessageRef.current = loadingMessage;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Use explicit API URL if provided, otherwise check environment variable, fallback to relative path
      let apiEndpoint = apiUrl || process.env.NEXT_PUBLIC_API_URL || '/api/agent/web/chat';

      // If apiEndpoint is relative, make it absolute using current origin
      // This ensures it works correctly when widget is in an iframe
      if (typeof window !== 'undefined' && apiEndpoint.startsWith('/')) {
        apiEndpoint = `${window.location.origin}${apiEndpoint}`;
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          brand,
          messageCount,
          usedButtons,
          metadata,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      // Remove loading message
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessage.id));

      // Reset streaming queue for new message
      streamingQueueRef.current = [];
      isStreamingCharsRef.current = false;
      rawStreamTextRef.current = '';

      // Create streaming message
      const streamingMessage: Message = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        text: '',
        isStreaming: true,
        hasStreamed: false,
        followUps: [],
      };
      setMessages((prev) => [...prev, streamingMessage]);
      streamingMessageRef.current = streamingMessage;

      // Read stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete SSE messages (separated by \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.slice(6);

              if (!jsonStr || jsonStr.trim() === '') {
                continue; // Skip empty JSON strings
              }

              let data;
              try {
                data = JSON.parse(jsonStr);
              } catch (parseError) {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[useChatStream] Failed to parse JSON:', jsonStr.substring(0, 100));
                }
                continue; // Skip invalid JSON
              }

              // Ensure data is an object
              if (!data || typeof data !== 'object') {
                continue; // Skip non-object data
              }

              if (data.type === 'chunk') {
                // Process text chunks for smooth character-by-character streaming
                // Strict type checking to handle null or malformed data
                const newText = (typeof data.text === 'string') ? data.text : '';

                if (newText && typeof newText === 'string') {
                  // Add to queue for sequential character streaming
                  streamingQueueRef.current.push(newText);

                  // Start processing queue if not already processing
                  if (!isStreamingCharsRef.current) {
                    isStreamingCharsRef.current = true;

                    const processQueue = () => {
                      if (streamingQueueRef.current.length === 0) {
                        isStreamingCharsRef.current = false;
                        return;
                      }

                      const textToProcess = streamingQueueRef.current.shift();

                      // Safeguard against non-string data
                      if (typeof textToProcess !== 'string') {
                        // Skip invalid data and continue processing queue
                        setTimeout(processQueue, 0);
                        return;
                      }

                      const chars = textToProcess.split('');
                      let charIndex = 0;

                      const streamChars = () => {
                        if (charIndex < chars.length) {
                          // Process 2-4 characters at a time for natural streaming speed
                          const charsToAdd = chars.slice(charIndex, charIndex + Math.min(4, chars.length - charIndex)).join('');
                          charIndex += charsToAdd.length;

                          requestAnimationFrame(() => {
                            rawStreamTextRef.current += charsToAdd;

                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === streamingMessage.id
                                  ? (() => {
                                      const hasPriorAssistantMessage = prev.some(
                                        (existing) =>
                                          existing.id !== streamingMessage.id &&
                                          existing.type === 'ai' &&
                                          Boolean(existing.text?.trim())
                                      );

                                      // A repeated greeting, if the model emits one, is always
                                      // in the opening ~200 chars. Only pay for the multi-regex
                                      // sanitize pass while inside that window — re-running it
                                      // on the FULL accumulator every 2-4 chars for the rest of
                                      // a long message is O(n^2) work and was the actual cause
                                      // of the jittery/bursty streaming feel. Past the window,
                                      // fall back to a plain cheap append.
                                      const GREETING_CHECK_CHARS = 220;
                                      const nextDisplayText =
                                        rawStreamTextRef.current.length <= GREETING_CHECK_CHARS
                                          ? sanitizeAssistantText(rawStreamTextRef.current, hasPriorAssistantMessage)
                                          : (msg.text || '') + charsToAdd;
                                      return { ...msg, text: nextDisplayText };
                                    })()
                                  : msg
                              )
                            );

                            // Trigger scroll update for smooth streaming
                            if (streamingMessageRef.current) {
                              const event = new Event('message-updated');
                              window.dispatchEvent(event);
                            }

                            // Continue streaming if there are more characters in this chunk
                            if (charIndex < chars.length) {
                              setTimeout(streamChars, 0); // Stream characters immediately
                            } else {
                              // Move to next chunk in queue
                              setTimeout(processQueue, 0);
                            }
                          });
                        } else {
                          // Move to next chunk in queue
                          setTimeout(processQueue, 0);
                        }
                      };

                      streamChars();
                    };

                    processQueue();
                  }
                }
              } else if (data.type === 'followUps') {
                // Store followUps but they will only be displayed when hasStreamed is true
                const followUps = Array.isArray(data.followUps) ? data.followUps : [];
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === streamingMessage.id ? { ...msg, followUps: followUps } : msg
                  )
                );
              } else if (data.type === 'error') {
                const errorMessage = typeof data.error === 'string' ? data.error : 'Unknown error';
                setError(errorMessage);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === streamingMessage.id
                      ? {
                          ...msg,
                          isStreaming: false,
                          hasStreamed: true,
                          text: msg.text || `Error: ${errorMessage}`,
                        }
                      : msg
                  )
                );
              } else if (data.type === 'done') {
                // Stop streaming indicator immediately
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === streamingMessage.id ? { ...msg, isStreaming: false } : msg
                  )
                );

                // Wait for streaming queue to finish before marking as complete
                const checkAndComplete = () => {
                  // Check if queue is empty and no characters are being streamed
                  if (streamingQueueRef.current.length === 0 && !isStreamingCharsRef.current) {
                    // Capture the completed message OUTSIDE the setMessages updater
                    // so onMessageComplete can safely call other state setters.
                    // Calling setState from inside a setState updater is a React
                    // anti-pattern that silently drops the nested update.
                    let completedMessageForCallback: Message | null = null;

                    setMessages((prev) => {
                      const updated = prev.map((msg) => {
                        if (msg.id === streamingMessage.id) {
                          const hasPriorAssistantMessage = prev.some(
                            (existing) =>
                              existing.id !== streamingMessage.id &&
                              existing.type === 'ai' &&
                              Boolean(existing.text?.trim())
                          );
                          // Source from the raw accumulator, not msg.text — msg.text is
                          // already progressively sanitized (see chunk handler above), so
                          // re-deriving from raw here is the single source of truth.
                          const finalText = sanitizeAssistantText(
                            rawStreamTextRef.current || msg.text || '',
                            hasPriorAssistantMessage
                          );

                          const completedMessage: Message = {
                            ...msg,
                            isStreaming: false,
                            hasStreamed: true,
                            text: finalText,
                          };

                          completedMessageForCallback = completedMessage;
                          return completedMessage;
                        }
                        return msg;
                      });

                      streamingMessageRef.current = null;
                      return updated;
                    });

                    // Call onMessageComplete AFTER setMessages so any state
                    // updates it triggers are properly batched with setIsLoading.
                    if (completedMessageForCallback && onMessageComplete) {
                      onMessageComplete(completedMessageForCallback);
                    }
                    setIsLoading(false);
                  } else {
                    // Queue still processing, check again
                    setTimeout(checkAndComplete, 50);
                  }
                };

                // Start checking after a short delay to allow current chunk to process
                setTimeout(checkAndComplete, 100);
              }
            } catch (parseError) {
              // Log parse errors in development
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[useChatStream] Parse error:', parseError, 'Line:', trimmed);
              }
            }
          }
        }
      }

      setIsLoading(false);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Stream was cancelled, don't show error
        return;
      }

      setError(err.message || 'Failed to send message');
      setIsLoading(false);

      // Remove loading/streaming message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingMessage.id));

      // Add error message to chat
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        type: 'ai',
        text: `Error: ${err.message || 'Failed to send message. Please make sure the backend server is running.'}`,
        isStreaming: false,
        hasStreamed: true,
      }]);
    }
  }, [brand, apiUrl, onMessageComplete]);

  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setError(null);
    setIsLoading(false);
    streamingMessageRef.current = null;
    streamingQueueRef.current = [];
    isStreamingCharsRef.current = false;
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    addUserMessage,
    addAIMessage,
    addStreamingAIMessage,
    updateMessageText,
    finishMessage,
  };
}
