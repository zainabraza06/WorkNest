import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    // Token expired or revoked: drop the session so route guards send the user to login
    if (status === 401 && useAuthStore.getState().token && !error.config?.url?.includes('/auth/login')) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(normalizeError(error));
  },
);

export class ApiRequestError extends Error {
  constructor(message, { status, details } = {}) {
    super(message);
    this.status = status;
    this.details = details ?? [];
  }

  /** { 'budget.max': 'Maximum must be…' } — handy for mapping onto form fields */
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

function normalizeError(error) {
  if (!error.response) {
    return new ApiRequestError(
      error.code === 'ECONNABORTED' ? 'The server took too long to respond.' : 'Unable to reach the server. Check your connection.',
      { status: 0 },
    );
  }
  const { status, data } = error.response;
  return new ApiRequestError(data?.message ?? 'Something went wrong', { status, details: data?.details });
}

/** Unwraps the `{ success, data }` envelope. */
export const unwrap = (promise) => promise.then((res) => res.data.data);
