const IS_DEV = import.meta.env.DEV;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function write(level: LogLevel, scope: string, ...args: unknown[]) {
  if (!IS_DEV && level !== 'error') return;
  const prefix = `[${scope}]`;
  if (level === 'debug') {
    console.debug(prefix, ...args);
    return;
  }
  if (level === 'info') {
    console.info(prefix, ...args);
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, ...args);
    return;
  }
  console.error(prefix, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => write('debug', scope, ...args),
    info: (...args: unknown[]) => write('info', scope, ...args),
    warn: (...args: unknown[]) => write('warn', scope, ...args),
    error: (...args: unknown[]) => write('error', scope, ...args),
  };
}
