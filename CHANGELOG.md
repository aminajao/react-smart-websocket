# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-07-11

### Added
- `useCustomWebSocket` — core hook with native WebSocket lifecycle management
- Visibility-aware pause/resume via the Page Visibility API
- Exponential backoff reconnection capped at 5 attempts
- Stability timer to prevent flapping connections resetting the retry counter
- Optional ping/pong heartbeat
- `enable`, `disable`, `disconnect`, and `forceReconnect` connection controls
- Structured debug logging behind a `debug` flag
- `WebSocketManagerProvider` for managing multiple named connections
- Per-connection React contexts for render isolation
- External store pattern for `useWebSocketManager` monitoring
- `useWebSocket(id)` consumer hook with full TypeScript generic support
- Query parameter management via `updateQueryParams` and `clearQueryParams`
