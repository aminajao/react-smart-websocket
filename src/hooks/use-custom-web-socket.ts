import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CustomWebSocketOptions,
  DocumentVisibilityState,
  ReadyState,
  UseCustomWebSocketReturn,
} from '../types';

const CLOSE_CODE_INFO: Record<number, string> = {
  1000: '✅ Normal closure (intentional)',
  1001: '🔄 Going away (page unload/refresh)',
  1002: '❌ Protocol error',
  1003: '❌ Unsupported data type',
  1006: '⚠️ Abnormal closure (connection lost)',
  1007: '❌ Invalid frame payload data',
  1008: '❌ Policy violation',
  1009: '❌ Message too big',
  1010: '❌ Mandatory extension missing',
  1011: '💥 Server error',
  1012: '🔧 Service restart',
  1013: '⏳ Try again later',
  1014: '🌐 Bad gateway',
  1015: '🔒 TLS handshake failure',
};

const NO_RECONNECT_CODES = [1000, 1001];
const MAX_RECONNECT_ATTEMPTS = 5;
const STABILITY_THRESHOLD_MS = 5000;
const MAX_MESSAGE_HISTORY = 50;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 20000;

export const useCustomWebSocket = <
  TJsonMessage = unknown,
  TMessageData = string,
>(
  url: string | null,
  options: CustomWebSocketOptions = {},
  initialEnabled: boolean = true
): UseCustomWebSocketReturn<TJsonMessage, TMessageData> => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const lastError = useRef<string | null>(null);
  const connectionStartTime = useRef<number | null>(null);
  const stabilityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [readyState, setReadyState] = useState<ReadyState>(
    ReadyState.UNINSTANTIATED
  );
  const [lastMessage, setLastMessage] =
    useState<MessageEvent<TMessageData> | null>(null);
  const [lastJsonMessage, setLastJsonMessage] = useState<TJsonMessage | null>(
    null
  );
  const [messageHistory, setMessageHistory] = useState<
    MessageEvent<TMessageData>[]
  >([]);
  const [isEnabled, setIsEnabled] = useState(initialEnabled);

  const currentVisibilityState = useRef<DocumentVisibilityState>(
    typeof document !== 'undefined'
      ? (document.visibilityState as DocumentVisibilityState)
      : 'visible'
  );
  const wasConnectedBeforeHidden = useRef(false);

  const isManuallyDisconnectedRef = useRef(false);
  const [isManuallyDisconnected, setIsManuallyDisconnectedState] =
    useState(false);
  const setIsManuallyDisconnected = useCallback((value: boolean) => {
    isManuallyDisconnectedRef.current = value;
    setIsManuallyDisconnectedState(value);
  }, []);

  const isPausedRef = useRef(false);
  const [isPaused, setIsPausedState] = useState(false);
  const setPaused = useCallback((value: boolean) => {
    isPausedRef.current = value;
    setIsPausedState(value);
  }, []);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const debug = options.debug ?? false;
  const enableHeartbeat = options.enableHeartbeat ?? false;
  const pauseOnHidden = options.pauseOnHidden ?? true;
  const reconnectOnVisible = options.reconnectOnVisible ?? true;
  const enableReconnect = options.enableReconnect ?? true;

  const log = useMemo(() => {
    const noop = () => undefined;
    if (!debug) return { enabled: false, info: noop, warn: noop, error: noop };
    return {
      enabled: true,
      info: (...args: unknown[]) => console.log(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
    };
  }, [debug]);

  const logRef = useRef(log);
  logRef.current = log;

  const clearHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
    if (heartbeatTimeout.current) {
      clearTimeout(heartbeatTimeout.current);
      heartbeatTimeout.current = null;
    }
  }, []);

  const clearStabilityTimer = useCallback(() => {
    if (stabilityTimer.current) {
      clearTimeout(stabilityTimer.current);
      stabilityTimer.current = null;
    }
  }, []);

  const closeSocket = useCallback((code = 1000, reason = '') => {
    const ws = wsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close(code, reason);
    }
    wsRef.current = null;
  }, []);

  const connectRef = useRef<(() => void) | null>(null);

  const scheduleReconnect = useCallback((attemptNumber: number) => {
    if (reconnectTimer.current) return;
    const interval = Math.min(1000 * Math.pow(2, attemptNumber), 16000);
    logRef.current.info(
      `⏳ Reconnecting in ${interval}ms (attempt ${attemptNumber + 1}/${MAX_RECONNECT_ATTEMPTS})`
    );
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connectRef.current?.();
    }, interval);
  }, []);

  const connect = useCallback(() => {
    if (
      !url ||
      !isEnabledRef.current ||
      isManuallyDisconnectedRef.current ||
      isPausedRef.current
    )
      return;

    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    )
      return;

    logRef.current.info('🔌 Connecting...', { url });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      logRef.current.error('🚨 Failed to create WebSocket', err);
      return;
    }

    wsRef.current = ws;
    setReadyState(ReadyState.CONNECTING);

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      lastError.current = null;
      connectionStartTime.current = Date.now();
      setReadyState(ReadyState.OPEN);
      setPaused(false);

      clearStabilityTimer();
      stabilityTimer.current = setTimeout(() => {
        reconnectAttempts.current = 0;
        stabilityTimer.current = null;
      }, STABILITY_THRESHOLD_MS);

      if (enableHeartbeat) {
        heartbeatInterval.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
            heartbeatTimeout.current = setTimeout(() => {
              logRef.current.warn('💔 Heartbeat timeout - closing connection');
              ws.close(1000, 'Heartbeat timeout');
            }, HEARTBEAT_TIMEOUT_MS);
          }
        }, HEARTBEAT_INTERVAL_MS);
      }

      logRef.current.info('✅ WebSocket connected', {
        url,
        timestamp: new Date().toISOString(),
      });
      optionsRef.current.onOpen?.();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (wsRef.current !== ws) return;

      if (heartbeatTimeout.current) {
        clearTimeout(heartbeatTimeout.current);
        heartbeatTimeout.current = null;
      }

      const isPong =
        enableHeartbeat &&
        (event.data === 'pong' ||
          event.data === '{"type":"pong"}' ||
          (typeof event.data === 'string' &&
            event.data.includes('"type":"pong"')));

      if (!isPong) {
        const typedEvent = event as MessageEvent<TMessageData>;
        setLastMessage(typedEvent);
        setMessageHistory((prev) => {
          const next = [...prev, typedEvent];
          return next.length > MAX_MESSAGE_HISTORY
            ? next.slice(-MAX_MESSAGE_HISTORY)
            : next;
        });

        try {
          setLastJsonMessage(JSON.parse(event.data) as TJsonMessage);
        } catch {
          // not JSON — leave lastJsonMessage unchanged
        }

        logRef.current.info('📨 Message received:', {
          data: event.data,
          timestamp: new Date().toISOString(),
        });
      }

      optionsRef.current.onMessage?.(event);
    };

    ws.onerror = (error: Event) => {
      if (wsRef.current !== ws) return;
      lastError.current = `WebSocket error: ${error.type}`;

      logRef.current.error('🚨 WebSocket error:', {
        url,
        errorType: error.type,
        attempts: reconnectAttempts.current,
        timestamp: new Date().toISOString(),
      });
      optionsRef.current.onError?.(error);
    };

    ws.onclose = (event: CloseEvent) => {
      if (wsRef.current === ws) wsRef.current = null;

      clearStabilityTimer();
      clearHeartbeat();
      setReadyState(ReadyState.CLOSED);

      const connectionDuration = connectionStartTime.current
        ? Date.now() - connectionStartTime.current
        : 0;
      connectionStartTime.current = null;

      if (logRef.current.enabled) {
        console.log('❌ WebSocket closed', {
          url,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          connectionDuration: `${connectionDuration}ms`,
          timestamp: new Date().toISOString(),
        });
        const codeInfo =
          CLOSE_CODE_INFO[event.code] || `❓ Unknown (${event.code})`;
        console.log(`📋 Close reason: ${codeInfo}`);

        const wasUnexpected =
          !isManuallyDisconnectedRef.current && !isPausedRef.current;
        if (connectionDuration < 5000 && wasUnexpected) {
          console.warn('⚠️ Very short connection duration');
        }
      }

      optionsRef.current.onClose?.(event);

      const shouldSkip =
        !enableReconnect ||
        !isEnabledRef.current ||
        isManuallyDisconnectedRef.current ||
        isPausedRef.current ||
        NO_RECONNECT_CODES.includes(event.code);

      if (shouldSkip) return;

      reconnectAttempts.current += 1;
      if (reconnectAttempts.current <= MAX_RECONNECT_ATTEMPTS) {
        scheduleReconnect(reconnectAttempts.current - 1);
      } else {
        logRef.current.warn(
          `🚫 Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`
        );
      }
    };
  }, [
    url,
    enableHeartbeat,
    enableReconnect,
    clearHeartbeat,
    clearStabilityTimer,
    scheduleReconnect,
    setPaused,
  ]);

  connectRef.current = connect;

  useEffect(() => {
    const shouldBeConnected =
      !!url && isEnabled && !isManuallyDisconnected && !isPaused;

    if (shouldBeConnected) {
      connect();
    } else {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      closeSocket(1000, 'Connection not required');
      if (!isEnabled || isManuallyDisconnected) {
        setReadyState(ReadyState.CLOSED);
      }
    }

    return () => {
      clearStabilityTimer();
      clearHeartbeat();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, [
    url,
    isEnabled,
    isManuallyDisconnected,
    isPaused,
    connect,
    closeSocket,
    clearStabilityTimer,
    clearHeartbeat,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const nextState = document.visibilityState as DocumentVisibilityState;
      currentVisibilityState.current = nextState;
      logRef.current.info(`👁 Visibility: ${nextState}`);

      if (nextState === 'hidden' && pauseOnHidden) {
        wasConnectedBeforeHidden.current =
          wsRef.current?.readyState === WebSocket.OPEN;
        if (!wasConnectedBeforeHidden.current) return;
        setPaused(true);
        logRef.current.info('🙈 Tab hidden - closing WebSocket');
        closeSocket(1000, 'Tab hidden');
      } else if (nextState === 'visible' && reconnectOnVisible) {
        if (
          wasConnectedBeforeHidden.current &&
          isPausedRef.current &&
          isEnabledRef.current
        ) {
          setPaused(false);
          reconnectAttempts.current = 0;
          logRef.current.info('👀 Tab visible - reconnecting');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pauseOnHidden, reconnectOnVisible, closeSocket, setPaused]);

  const forceReconnect = useCallback(() => {
    logRef.current.info('🔄 Force reconnecting...');
    reconnectAttempts.current = 0;
    setIsManuallyDisconnected(false);
    setPaused(false);
    closeSocket(1000, 'Force reconnect');
    setTimeout(() => connectRef.current?.(), 0);
  }, [closeSocket, setPaused, setIsManuallyDisconnected]);

  const disconnect = useCallback(() => {
    logRef.current.info('🔌 Manually disconnecting...');
    wasConnectedBeforeHidden.current = false;
    setIsManuallyDisconnected(true);
    closeSocket(1000, 'Manual disconnect');
    setReadyState(ReadyState.CLOSED);
  }, [closeSocket, setIsManuallyDisconnected]);

  const enable = useCallback(() => {
    logRef.current.info('🟢 Enabling connection...');
    reconnectAttempts.current = 0;
    setIsManuallyDisconnected(false);
    setIsEnabled(true);
  }, [setIsManuallyDisconnected]);

  const disable = useCallback(() => {
    logRef.current.info('🔴 Disabling connection...');
    setIsEnabled(false);
    closeSocket(1000, 'Connection disabled');
    setReadyState(ReadyState.CLOSED);
  }, [closeSocket]);

  const connectionStatus = useMemo((): string => {
    if (!isEnabled) return 'Disabled';
    if (isPaused) return 'Paused (Hidden)';
    const statusMap: Record<ReadyState, string> = {
      [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
      [ReadyState.CONNECTING]: 'Connecting',
      [ReadyState.OPEN]: 'Connected',
      [ReadyState.CLOSING]: 'Closing',
      [ReadyState.CLOSED]: 'Closed',
    };
    return statusMap[readyState];
  }, [readyState, isEnabled, isPaused]);

  const isConnected = useMemo(
    () => readyState === ReadyState.OPEN && !isPaused && isEnabled,
    [readyState, isEnabled, isPaused]
  );

  const sendMessage = useCallback(
    (message: string): void => {
      const ws = wsRef.current;
      if (isConnected && ws) {
        ws.send(message);
        logRef.current.info('📤 Sent:', message);
      } else {
        logRef.current.warn(`❌ Cannot send - WebSocket is ${connectionStatus}`);
      }
    },
    [isConnected, connectionStatus]
  );

  const sendJsonMessage = useCallback(
    (object: TJsonMessage): void => {
      const ws = wsRef.current;
      if (isConnected && ws) {
        ws.send(JSON.stringify(object));
        logRef.current.info('📤 Sent JSON:', object);
      } else {
        logRef.current.warn(
          `❌ Cannot send JSON - WebSocket is ${connectionStatus}`
        );
      }
    },
    [isConnected, connectionStatus]
  );

  const getWebSocket = useCallback((): WebSocket | null => wsRef.current, []);

  return {
    sendMessage,
    sendJsonMessage,
    lastMessage,
    lastJsonMessage,
    messageHistory,
    readyState,
    connectionStatus,
    isConnected,
    getWebSocket,
    debugInfo: {
      url,
      attempts: reconnectAttempts.current,
      lastError: lastError.current,
      visibilityState: currentVisibilityState.current,
      isPaused,
      isEnabled,
    },
    forceReconnect,
    disconnect,
    enable,
    disable,
    isEnabled,
  };
};
