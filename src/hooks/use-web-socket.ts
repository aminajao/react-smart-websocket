import { WebSocketConnection } from '../types';
import { useConnectionContext } from '../context/web-socket-provider';

/**
 * Get a specific WebSocket connection by id. Pass a type argument to opt into
 * typed messaging:
 *
 * ```ts
 * const { lastJsonMessage, sendJsonMessage } = useWebSocket<ChatMessage>('chat');
 * ```
 */
export const useWebSocket = <TJsonMessage = unknown, TMessageData = string>(
  connectionId: string
): WebSocketConnection<TJsonMessage, TMessageData> => {
  const connection = useConnectionContext(connectionId);

  if (!connection) {
    throw new Error(
      `WebSocket connection '${connectionId}' not found. ` +
        'Make sure the id matches a config passed to WebSocketManagerProvider ' +
        'and that the hook is called within the provider tree.'
    );
  }

  return connection as unknown as WebSocketConnection<
    TJsonMessage,
    TMessageData
  >;
};
