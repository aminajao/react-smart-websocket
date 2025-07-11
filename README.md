# react-smart-websocket

Smart WebSocket hooks for React with visibility-aware reconnection and multi-connection management.

## Features

- **Zero dependencies** — built on the native browser WebSocket API
- **Visibility-aware** — automatically pauses when the tab is hidden, reconnects when visible
- **Resilient reconnection** — exponential backoff with a stability timer to prevent infinite retries
- **Multi-connection manager** — manage multiple named WebSocket connections from a single provider
- **Render isolation** — per-connection contexts ensure a message on one connection never re-renders consumers of another
- **Heartbeat** — optional ping/pong keepalive
- **Full TypeScript support** — generic message types throughout
- **Debug mode** — structured logging behind a flag, zero cost when off

---

## Installation

```bash
npm install react-smart-websocket
```

---

## Quick start

### Single connection

```tsx
import { useCustomWebSocket } from 'react-smart-websocket';

function Chat() {
  const { sendJsonMessage, lastJsonMessage, isConnected } = useCustomWebSocket(
    'wss://example.com/chat',
    { debug: true }
  );

  return (
    <button disabled={!isConnected} onClick={() => sendJsonMessage({ text: 'Hello' })}>
      Send
    </button>
  );
}
```

### Multiple connections

```tsx
import { WebSocketManagerProvider, useWebSocket } from 'react-smart-websocket';

const connections = [
  { id: 'chat', baseUrl: 'wss://example.com/chat', initialEnabled: true },
  { id: 'notifications', baseUrl: 'wss://example.com/notifications', initialEnabled: true },
];

function App() {
  return (
    <WebSocketManagerProvider connections={connections}>
      <Chat />
      <Notifications />
    </WebSocketManagerProvider>
  );
}

function Chat() {
  const { sendJsonMessage, lastJsonMessage, isConnected } = useWebSocket('chat');
  // ...
}

function Notifications() {
  const { lastJsonMessage } = useWebSocket('notifications');
  // ...
}
```

---

## API

### `useCustomWebSocket(url, options?, initialEnabled?)`

The core low-level hook.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | `string \| null` | — | WebSocket URL. Pass `null` to skip connecting. |
| `options` | `CustomWebSocketOptions` | `{}` | Hook options (see below). |
| `initialEnabled` | `boolean` | `true` | Whether to connect immediately on mount. |

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `debug` | `boolean` | `false` | Enable structured console logging. |
| `enableHeartbeat` | `boolean` | `false` | Send ping/pong every 10s, close on 20s timeout. |
| `pauseOnHidden` | `boolean` | `true` | Close the socket when the tab becomes hidden. |
| `reconnectOnVisible` | `boolean` | `true` | Reconnect when the tab becomes visible again. |
| `enableReconnect` | `boolean` | `true` | Reconnect automatically on unexpected close. |
| `onOpen` | `() => void` | — | Called when the connection opens. |
| `onClose` | `(event?) => void` | — | Called when the connection closes. |
| `onError` | `(error) => void` | — | Called on error. |
| `onMessage` | `(message) => void` | — | Called on every incoming message. |

#### Returns

| Property | Type | Description |
|---|---|---|
| `sendMessage` | `(message: string) => void` | Send a raw string message. |
| `sendJsonMessage` | `(object: T) => void` | Serialize and send a JSON message. |
| `lastMessage` | `MessageEvent \| null` | The most recent message event. |
| `lastJsonMessage` | `T \| null` | The most recent parsed JSON message. |
| `messageHistory` | `MessageEvent[]` | Last 50 messages. |
| `readyState` | `ReadyState` | Current connection state. |
| `connectionStatus` | `string` | Human-readable connection status. |
| `isConnected` | `boolean` | `true` when open, enabled, and not paused. |
| `getWebSocket` | `() => WebSocket \| null` | Access the underlying socket. |
| `debugInfo` | `object` | Internal state snapshot for debugging. |
| `forceReconnect` | `() => void` | Close and immediately reconnect. |
| `disconnect` | `() => void` | Manually close and disable reconnection. |
| `enable` | `() => void` | Enable the connection (connects if a URL is set). |
| `disable` | `() => void` | Disable and close the connection. |
| `isEnabled` | `boolean` | Whether the connection is currently enabled. |

---

### `WebSocketManagerProvider`

Wrap your app (or a subtree) to manage multiple named connections.

```tsx
<WebSocketManagerProvider connections={WebSocketConfig[]}>
  {children}
</WebSocketManagerProvider>
```

#### `WebSocketConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | — | Unique identifier for this connection. |
| `baseUrl` | `string \| null` | — | WebSocket base URL. |
| `initialQueryParams` | `Record<string, string \| number \| boolean>` | `{}` | Initial query parameters appended to the URL. |
| `initialEnabled` | `boolean` | `false` | Whether to connect immediately. |
| `options` | `CustomWebSocketOptions` | `{}` | Hook options (same as `useCustomWebSocket`). |

---

### `useWebSocket(id)`

Read a named connection inside the provider tree.

```ts
const { lastJsonMessage, sendJsonMessage, isConnected } = useWebSocket<MyMessage>('chat');
```

Throws if the `id` is not registered in the provider.

---

### `useWebSocketManager()`

Monitor all active connections. Re-renders when any connection changes.

```ts
const { connections, getConnection } = useWebSocketManager();
```

---

### `ReadyState`

```ts
enum ReadyState {
  UNINSTANTIATED = -1,
  CONNECTING     = 0,
  OPEN           = 1,
  CLOSING        = 2,
  CLOSED         = 3,
}
```

---

## License

MIT
