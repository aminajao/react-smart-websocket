import { type ReactNode } from 'react';
import { useCustomWebSocket } from '../hooks/use-custom-web-socket';

export type DocumentVisibilityState = 'visible' | 'hidden';

export enum ReadyState {
  UNINSTANTIATED = -1,
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface UseCustomWebSocketReturn<
  TJsonMessage = unknown,
  TMessageData = string,
> {
  sendMessage: (message: string) => void;
  sendJsonMessage: (object: TJsonMessage) => void;
  lastMessage: MessageEvent<TMessageData> | null;
  lastJsonMessage: TJsonMessage | null;
  messageHistory: MessageEvent<TMessageData>[];
  readyState: ReadyState;
  connectionStatus: string;
  isConnected: boolean;
  getWebSocket: () => WebSocket | null;
  debugInfo: {
    url: string | null;
    attempts: number;
    lastError: string | null;
    visibilityState: DocumentVisibilityState;
    isPaused: boolean;
    isEnabled: boolean;
  };
  forceReconnect: () => void;
  disconnect: () => void;
  enable: () => void;
  disable: () => void;
  isEnabled: boolean;
}

export interface CustomWebSocketOptions {
  onOpen?: () => void;
  onClose?: (event?: CloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage?: (message: MessageEvent) => void;
  debug?: boolean;
  enableHeartbeat?: boolean;
  pauseOnHidden?: boolean;
  reconnectOnVisible?: boolean;
  /** Enable automatic reconnection on unexpected close. Defaults to `true`. */
  enableReconnect?: boolean;
}

export interface WebSocketConnection<
  TJsonMessage = unknown,
  TMessageData = string,
> extends UseCustomWebSocketReturn<TJsonMessage, TMessageData> {
  id: string;
  url: string | null;
  updateQueryParams: (
    params: Record<string, string | number | boolean>
  ) => void;
  clearQueryParams: () => void;
  currentParams: Record<string, string | number | boolean>;
}

export interface WebSocketManagerContextType {
  connections: Map<string, WebSocketConnection>;
  getConnection: (id: string) => WebSocketConnection | undefined;
}

export interface WebSocketConfig {
  id: string;
  baseUrl: string | null;
  initialQueryParams?: Record<string, string | number | boolean>;
  initialEnabled?: boolean;
  options?: Parameters<typeof useCustomWebSocket>[1];
}

export interface WebSocketManagerProviderProps {
  children: ReactNode;
  connections: WebSocketConfig[];
}
