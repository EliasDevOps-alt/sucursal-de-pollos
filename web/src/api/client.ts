import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'erp_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* almacenamiento no disponible: la sesión dura lo que la pestaña */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* idem */
    }
  },
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sesión expirada o usuario bloqueado: se vuelve al login.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      tokenStore.clear();
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Extrae el mensaje de error que envía NestJS (string o lista de validaciones). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const msg = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join('. ');
    if (msg) return msg;
    if (!error.response) return 'No se pudo conectar con el servidor';
  }
  return 'Ocurrió un error inesperado';
}
