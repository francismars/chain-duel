/**
 * Config loader - socket URL for the game backend (marspay).
 * Legacy: the chain-duel Express app served /loadconfig and returned IP_SOCKET/PORT_SOCKET from its .env.
 * Marspay does not expose /loadconfig; use VITE_SOCKET_URL in .env to point directly at the socket server.
 */
export interface Config {
  IP: string;
  PORT: string;
}

function getStringEnv(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const v = env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : '';
}

/**
 * Load server configuration.
 * - If VITE_SOCKET_URL is set: use it (no API call).
 * - Else if VITE_PROXY_TARGET is set and is a ws/wss URL: use it as socket URL (no API call; marspay has no /loadconfig).
 * - Otherwise fetch /loadconfig (only when the legacy chain-duel Express server is running and proxied).
 */
export async function loadConfig(): Promise<Config> {
  const socketUrl = getStringEnv('VITE_SOCKET_URL');
  if (socketUrl) {
    return { IP: socketUrl, PORT: '' };
  }
  const proxyTarget = getStringEnv('VITE_PROXY_TARGET');
  if (proxyTarget && (proxyTarget.startsWith('ws://') || proxyTarget.startsWith('wss://'))) {
    return { IP: proxyTarget, PORT: '' };
  }

  try {
    const url = '/loadconfig';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.IP) {
      throw new Error('Invalid config response: missing IP');
    }
    const port = data.PORT != null && data.PORT !== '' ? String(data.PORT) : '';
    return { IP: data.IP, PORT: port };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error loading config');
  }
}
