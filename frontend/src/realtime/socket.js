import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

let socket = null;
let socketToken = null;

/** One authenticated socket per session; reconnects automatically if the token changes. */
export function getSocket() {
  const token = useAuthStore.getState().token;
  if (!token) {
    disconnectSocket();
    return null;
  }
  if (socket && socketToken === token) return socket;

  socket?.disconnect();
  socket = io(import.meta.env.VITE_API_URL || undefined, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  socketToken = token;
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}

/** Subscribes to a socket event for the lifetime of the component. The handler can change freely. */
export function useSocketEvent(event, handler) {
  const token = useAuthStore((s) => s.token);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    const s = getSocket();
    if (!s) return undefined;
    const fn = (payload) => ref.current(payload);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event, token]);
}
