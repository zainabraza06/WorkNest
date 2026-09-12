import { create } from 'zustand';

let nextId = 1;

export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone: 'info', duration: 5000, ...toast }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** toast({ title, description?, tone?: 'info' | 'success' | 'danger', to?: '/path' }) */
export const toast = (t) => useToastStore.getState().push(t);
