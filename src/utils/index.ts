import { useCallback, useMemo, useState } from 'react';
import { useCustomWebSocket } from '../hooks/use-custom-web-socket';

export const buildUrlWithParams = (
  baseUrl: string,
  params: Record<string, string | number | boolean>
): string => {
  if (!baseUrl || Object.keys(params).length === 0) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  } catch {
    const queryString = Object.entries(params)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
      .join('&');

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${queryString}`;
  }
};

export const useWebSocketWithParams = (
  baseUrl: string | null,
  initialParams: Record<string, string | number | boolean> = {},
  options: Parameters<typeof useCustomWebSocket>[1] = {},
  initialEnabled: boolean = false
) => {
  const [queryParams, setQueryParams] = useState(initialParams);

  const fullUrl = useMemo(() => {
    if (!baseUrl) return null;
    return buildUrlWithParams(baseUrl, queryParams);
  }, [baseUrl, queryParams]);

  const webSocketData = useCustomWebSocket(fullUrl, options, initialEnabled);

  const updateQueryParams = useCallback(
    (newParams: Record<string, string | number | boolean>) => {
      setQueryParams((prev) => ({ ...prev, ...newParams }));
    },
    []
  );

  const clearQueryParams = useCallback(() => {
    setQueryParams({});
  }, []);

  return {
    ...webSocketData,
    updateQueryParams,
    clearQueryParams,
    currentParams: queryParams,
  };
};
