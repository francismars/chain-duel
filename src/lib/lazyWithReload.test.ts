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

  it('rethrows the next failure in the same tab without reloading again', async () => {
    const pending = start(() => Promise.reject(new Error('missing chunk')));
    await Promise.resolve();
    expect(reload).toHaveBeenCalledOnce();
    void pending;

    const error = new Error('still missing');
    await expect(start(() => Promise.reject(error))).rejects.toBe(error);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('returns the module when the loader succeeds', async () => {
    const mod = { default: Page };
    await expect(start(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.has(STORAGE_KEY_CHUNK_RELOAD)).toBe(false);
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
