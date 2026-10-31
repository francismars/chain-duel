import { describe, expect, it, vi } from 'vitest';
import {
  reconnectSocketOnVisible,
  type VisibleSocket,
} from './socketVisibility';

function fakeSocket(overrides: Partial<VisibleSocket> = {}): VisibleSocket {
  return {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

describe('reconnectSocketOnVisible', () => {
  it('does nothing while the tab is hidden', () => {
    const socket = fakeSocket();
    reconnectSocketOnVisible(socket, 'hidden');
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('connects a dropped socket when the tab returns', () => {
    const socket = fakeSocket({ connected: false });
    reconnectSocketOnVisible(socket, 'visible');
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it('leaves an open transport alone', () => {
    const socket = fakeSocket({
      connected: true,
      io: { engine: { transport: { ws: { readyState: 1 } } } },
    });
    reconnectSocketOnVisible(socket, 'visible');
    expect(socket.connect).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('replaces a transport that died while the phone was locked', () => {
    const socket = fakeSocket({
      connected: true,
      io: { engine: { transport: { ws: { readyState: 3 } } } },
    });
    reconnectSocketOnVisible(socket, 'visible');
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledOnce();
  });

  it('ignores a missing socket', () => {
    expect(() => reconnectSocketOnVisible(null, 'visible')).not.toThrow();
  });
});
