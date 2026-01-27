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

export function useChatStream({ brand, apiUrl, onMessageComplete }: UseChatStreamOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageRef = useRef<Message | null>(null);
  const streamingQueueRef = useRef<string[]>([]);
  const isStreamingCharsRef = useRef<boolean>(false);

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
      // apiUrl from config is already the full path (e.g., '/api/chat'), not a base URL
      let apiEndpoint = apiUrl || process.env.NEXT_PUBLIC_API_URL || '/api/chat';
      
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
                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === streamingMessage.id
                                  ? { ...msg, text: (msg.text || '') + charsToAdd }
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
                              setTimeout(streamChars, 15); // Small delay for visible streaming effect
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
                    setMessages((prev) => {
                      const updated = prev.map((msg) => {
                        if (msg.id === streamingMessage.id) {
                          const finalText = msg.text
                            ?.replace(/^(Hi there!|Hello!|Hey!|Hi!)\s*/gi, '')
                            .replace(/^(Hi|Hello|Hey),?\s*/gi, '')
                            .trim() || '';
                          
                          const completedMessage: Message = {
                            ...msg,
                            isStreaming: false,
                            hasStreamed: true,
                            text: finalText,
                          };
                          
                          if (onMessageComplete) {
                            onMessageComplete(completedMessage);
                          }
                          
                          return completedMessage;
                        }
                        return msg;
                      });
                      
                      streamingMessageRef.current = null;
                      return updated;
                    });
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
        text: `Error: ${err.message || 'Failed to send message. Please make sure the backend server is running on port 3001.'}`,
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
  };
}

