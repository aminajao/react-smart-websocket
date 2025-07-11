import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  WebSocketConfig,
  WebSocketConnection,
  WebSocketManagerContextType,
  WebSocketManagerProviderProps,
} from '../types';
import { useWebSocketWithParams } from '../utils';

// Per-connection context registry — each connection id gets its own context so
// a message on connection "a" never re-renders consumers of connection "b".
const connectionContextMap = new Map<
  string,
  React.Context<WebSocketConnection | null>
>();

const getConnectionContext = (
  id: string
): React.Context<WebSocketConnection | null> => {
  let ctx = connectionContextMap.get(id);
  if (!ctx) {
    ctx = createContext<WebSocketConnection | null>(null);
    ctx.displayName = `WebSocket(${id})`;
    connectionContextMap.set(id, ctx);
  }
  return ctx;
};

// External store for useWebSocketManager — lives outside React state so
// updating it never causes slot re-renders, preserving render isolation.
type StoreListener = () => void;

interface ConnectionStore {
  connections: Map<string, WebSocketConnection>;
  set: (id: string, connection: WebSocketConnection) => void;
  remove: (id: string) => void;
  getConnection: (id: string) => WebSocketConnection | undefined;
  subscribe: (listener: StoreListener) => () => void;
}

const createConnectionStore = (): ConnectionStore => {
  const connections = new Map<string, WebSocketConnection>();
  const listeners = new Set<StoreListener>();
  const emit = () => listeners.forEach((l) => l());

  return {
    connections,
    set: (id, connection) => {
      connections.set(id, connection);
      emit();
    },
    remove: (id) => {
      if (connections.delete(id)) emit();
    },
    getConnection: (id) => connections.get(id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const WebSocketStoreContext = createContext<ConnectionStore | null>(null);

interface WebSocketSlotProps {
  config: WebSocketConfig;
  store: ConnectionStore;
  children: React.ReactNode;
}

// Each slot owns one stable hook call, keeping hook count fixed per component
// and allowing the connections list to change without violating Rules of Hooks.
const WebSocketSlot: React.FC<WebSocketSlotProps> = ({
  config,
  store,
  children,
}) => {
  const webSocketData = useWebSocketWithParams(
    config.baseUrl,
    config.initialQueryParams || {},
    config.options || {},
    config.initialEnabled ?? false
  );

  const connection: WebSocketConnection = useMemo(
    () => ({ ...webSocketData, id: config.id, url: webSocketData.debugInfo.url }),
    [webSocketData, config.id]
  );

  const ConnectionContext = getConnectionContext(config.id);

  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    store.set(config.id, connectionRef.current);
  }, [
    store,
    config.id,
    webSocketData.readyState,
    webSocketData.lastMessage,
    webSocketData.lastJsonMessage,
    webSocketData.isEnabled,
    webSocketData.isConnected,
    webSocketData.connectionStatus,
    webSocketData.messageHistory,
    webSocketData.currentParams,
  ]);

  useEffect(() => {
    return () => store.remove(config.id);
  }, [store, config.id]);

  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
};

export const WebSocketManagerProvider: React.FC<
  WebSocketManagerProviderProps
> = ({ children, connections: connectionConfigs }) => {
  const storeRef = useRef<ConnectionStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createConnectionStore();
  }
  const store = storeRef.current;

  if (process.env.NODE_ENV !== 'production') {
    const ids = connectionConfigs.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      console.warn(
        '[react-smart-websocket] Duplicate connection ids detected. Each WebSocketConfig.id must be unique.'
      );
    }
  }

  return (
    <WebSocketStoreContext.Provider value={store}>
      {connectionConfigs.reduceRight<React.ReactNode>(
        (nested, config) => (
          <WebSocketSlot key={config.id} config={config} store={store}>
            {nested}
          </WebSocketSlot>
        ),
        children
      )}
    </WebSocketStoreContext.Provider>
  );
};

export const useWebSocketManager = (): WebSocketManagerContextType => {
  const store = useContext(WebSocketStoreContext);
  if (!store) {
    throw new Error(
      'useWebSocketManager must be used within a WebSocketManagerProvider'
    );
  }

  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);
  useEffect(() => store.subscribe(forceUpdate), [store]);

  return {
    connections: store.connections,
    getConnection: store.getConnection,
  };
};

export const useConnectionContext = (
  connectionId: string
): WebSocketConnection | null => {
  const ConnectionContext = getConnectionContext(connectionId);
  return useContext(ConnectionContext);
};
