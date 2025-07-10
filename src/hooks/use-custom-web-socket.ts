import { CustomWebSocketOptions, UseCustomWebSocketReturn } from '../types';

// Implementation coming in the next commit.
export declare const useCustomWebSocket: <
  TJsonMessage = unknown,
  TMessageData = string,
>(
  url: string | null,
  options?: CustomWebSocketOptions,
  initialEnabled?: boolean
) => UseCustomWebSocketReturn<TJsonMessage, TMessageData>;
