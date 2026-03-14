import { useEffect } from 'react';

interface SessionSocket {
  on: (
    event: 'session',
    cb: (payload: { sessionID: string; userID: string }) => void
  ) => void;
  off: (
    event: 'session',
    cb: (payload: { sessionID: string; userID: string }) => void
  ) => void;
}

export function useSessionPersistence(socket: SessionSocket | null) {
  useEffect(() => {
    if (!socket) return;
    const onSession = ({ sessionID }: { sessionID: string; userID: string }) => {
      sessionStorage.setItem('sessionID', sessionID);
    };
    socket.on('session', onSession);
    return () => socket.off('session', onSession);
  }, [socket]);
}
