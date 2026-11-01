import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY_CHUNK_RELOAD } from '@/shared/constants/storageKeys';
import { lazyWithReload } from './lazyWithReload';

const captured = vi.hoisted(() => ({
  loaders: [] as Array<() => Promise<{ default: unknown }>>,
}));

vi.mock('react', () => ({
  lazy: (loader: () => Promise<{ default: unknown }>) => {
    captured.loaders.push(loader);
    return { $$typeof: Symbol.for('react.lazy') };
  },
}));

function Page() {
  return null;
}

describe('lazyWithReload', () => {
  const storage = new Map<string, string>();
  const reload = vi.fn();

  beforeEach(() => {
    storage.clear();
    captured.loaders.length = 0;
    reload.mockReset();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubGlobal('window', {
      location: { reload },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function start(loader: () => Promise<{ default: typeof Page }>) {
    lazyWithReload(loader);
    const run = captured.loaders.at(-1);
    if (!run) throw new Error('lazyWithReload did not register a loader');
    return run();
  }

  it('reloads once when the loader fails and leaves that import pending', async () => {
    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await Promise.resolve();

    expect(reload).toHaveBeenCalledOnce();
    expect(storage.get(STORAGE_KEY_CHUNK_RELOAD)).toBe('1');

    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('reloads only once when two loads fail in a row', async () => {
    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await Promise.resolve();
    expect(reload).toHaveBeenCalledOnce();
    void pending;

    const error = new Error('still missing');
    await expect(start(() => Promise.reject(error))).rejects.toBe(error);
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.get(STORAGE_KEY_CHUNK_RELOAD)).toBe('1');
  });

  it('returns the module when the loader succeeds', async () => {
    const mod = { default: Page };
    await expect(start(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.has(STORAGE_KEY_CHUNK_RELOAD)).toBe(false);
  });

  it('clears the reload flag after a chunk loads successfully', async () => {
    storage.set(STORAGE_KEY_CHUNK_RELOAD, '1');
    const mod = { default: Page };
    await expect(start(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.has(STORAGE_KEY_CHUNK_RELOAD)).toBe(false);
  });

  it('reloads again after a successful load has cleared the flag', async () => {
    storage.set(STORAGE_KEY_CHUNK_RELOAD, '1');
    await start(() => Promise.resolve({ default: Page }));
    expect(storage.has(STORAGE_KEY_CHUNK_RELOAD)).toBe(false);

    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await Promise.resolve();
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.get(STORAGE_KEY_CHUNK_RELOAD)).toBe('1');
    void pending;
  });

  it('keeps the flag when a chunk resolves after a reload was requested', async () => {
    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await Promise.resolve();
    void pending;
    expect(reload).toHaveBeenCalledOnce();

    await start(() => Promise.resolve({ default: Page }));
    expect(storage.get(STORAGE_KEY_CHUNK_RELOAD)).toBe('1');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('returns the module when clearing the flag throws', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => '1',
      setItem: () => {},
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    const mod = { default: Page };
    await expect(start(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
  });

  it('asks a waiting service worker to take control before reloading', async () => {
    const waiting = { postMessage: vi.fn() };
    const update = vi.fn(() => Promise.resolve());
    const listeners = new Set<() => void>();
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {},
        getRegistration: () =>
          Promise.resolve({
            update,
            waiting,
            installing: null,
          }),
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener);
        },
      },
    });
    vi.stubGlobal('window', {
      location: { reload, pathname: '/about' },
    });

    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await vi.waitFor(() => {
      expect(waiting.postMessage).toHaveBeenCalledWith({
        type: 'SKIP_WAITING',
      });
    });
    expect(update).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();

    for (const listener of listeners) listener();
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.get(STORAGE_KEY_CHUNK_RELOAD)).toBe('1');
    void pending;
  });

  it('reloads when the controlling worker has no update waiting', async () => {
    const update = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {},
        getRegistration: () =>
          Promise.resolve({
            update,
            waiting: null,
            installing: null,
          }),
      },
    });
    vi.stubGlobal('window', {
      location: { reload, pathname: '/about' },
    });

    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledOnce();
    });
    expect(update).toHaveBeenCalledOnce();
    void pending;
  });

  it('waits until an installing worker is waiting, then skips waiting', async () => {
    let onState: (() => void) | undefined;
    const installing = {
      state: 'installing',
      addEventListener: (_type: string, listener: () => void) => {
        onState = listener;
      },
      removeEventListener: () => {},
    };
    const waiting = { postMessage: vi.fn() };
    const registration = {
      update: vi.fn(() => Promise.resolve()),
      waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
      installing,
    };
    const listeners = new Set<() => void>();
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {},
        getRegistration: () => Promise.resolve(registration),
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: () => {},
      },
    });
    vi.stubGlobal('window', {
      location: { reload, pathname: '/about' },
    });

    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await vi.waitFor(() => {
      expect(onState).toBeTypeOf('function');
    });
    expect(reload).not.toHaveBeenCalled();
    registration.waiting = waiting;
    installing.state = 'installed';
    onState?.();
    await vi.waitFor(() => {
      expect(waiting.postMessage).toHaveBeenCalledWith({
        type: 'SKIP_WAITING',
      });
    });
    expect(reload).not.toHaveBeenCalled();
    for (const listener of listeners) listener();
    expect(reload).toHaveBeenCalledOnce();
    void pending;
  });

  it('reloads immediately during a live match', async () => {
    const update = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {},
        getRegistration: () =>
          Promise.resolve({
            update,
            waiting: { postMessage: vi.fn() },
            installing: null,
          }),
      },
    });
    vi.stubGlobal('window', {
      location: { reload, pathname: '/game' },
    });

    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await Promise.resolve();
    expect(reload).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    void pending;
  });

  it('reloads if the new worker never takes control', async () => {
    vi.useFakeTimers();
    try {
      const waiting = { postMessage: vi.fn() };
      vi.stubGlobal('navigator', {
        serviceWorker: {
          controller: {},
          getRegistration: () =>
            Promise.resolve({
              update: () => Promise.resolve(),
              waiting,
              installing: null,
            }),
          addEventListener: () => {},
          removeEventListener: () => {},
        },
      });
      vi.stubGlobal('window', {
        location: { reload, pathname: '/about' },
      });

      const pending = start(() => Promise.reject(new Error('missing chunk')));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(waiting.postMessage).toHaveBeenCalledWith({
        type: 'SKIP_WAITING',
      });
      expect(reload).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2999);
      expect(reload).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(reload).toHaveBeenCalledOnce();
      void pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reload while a new worker is still installing', async () => {
    vi.useFakeTimers();
    try {
      const stateListeners = new Set<() => void>();
      const installing = {
        state: 'installing',
        addEventListener: (_type: string, listener: () => void) => {
          stateListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          stateListeners.delete(listener);
        },
      };
      const waiting = { postMessage: vi.fn() };
      const registration = {
        update: () => Promise.resolve(),
        waiting: null as { postMessage: ReturnType<typeof vi.fn> } | null,
        installing,
      };
      const controllerListeners = new Set<() => void>();
      vi.stubGlobal('navigator', {
        serviceWorker: {
          controller: {},
          getRegistration: () => Promise.resolve(registration),
          addEventListener: (_type: string, listener: () => void) => {
            controllerListeners.add(listener);
          },
          removeEventListener: (_type: string, listener: () => void) => {
            controllerListeners.delete(listener);
          },
        },
      });
      vi.stubGlobal('window', {
        location: { reload, pathname: '/about' },
      });

      const pending = start(() => Promise.reject(new Error('missing chunk')));
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(3000);
      expect(reload).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(15_000);
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(reload).not.toHaveBeenCalled();
      expect(waiting.postMessage).not.toHaveBeenCalled();

      registration.waiting = waiting;
      installing.state = 'installed';
      for (const listener of stateListeners) listener();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(waiting.postMessage).toHaveBeenCalledWith({
        type: 'SKIP_WAITING',
      });
      expect(reload).not.toHaveBeenCalled();
      for (const listener of controllerListeners) listener();
      expect(reload).toHaveBeenCalledOnce();
      void pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rethrows when sessionStorage is blocked so a reload cannot loop', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    const error = new Error('missing chunk');
    await expect(start(() => Promise.reject(error))).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });
});
