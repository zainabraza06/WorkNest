import { api, unwrap } from '@/lib/api';

/** Drops undefined / empty values so they don't end up as `?q=` in the URL. */
const clean = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)),
  );

const toForm = (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
    else if (v !== undefined) fd.append(k, v);
  }
  return fd;
};

export const authApi = {
  register: (body) => unwrap(api.post('/auth/register', body)),
  login: (body) => unwrap(api.post('/auth/login', body)),
  me: () => unwrap(api.get('/auth/me')),
  changePassword: (body) => unwrap(api.patch('/auth/password', body)),
};

export const usersApi = {
  updateMe: (body) => unwrap(api.patch('/users/me', body)),
  uploadAvatar: (file) => unwrap(api.post('/users/me/avatar', toForm({ avatar: file }))),
  reviews: (userId, params) => unwrap(api.get(`/users/${userId}/reviews`, { params: clean(params) })),
};

export const workersApi = {
  search: (params) => unwrap(api.get('/workers', { params: clean(params) })),
  get: (userId) => unwrap(api.get(`/workers/${userId}`)),
  getMine: () => unwrap(api.get('/workers/me')),
  create: (body) => unwrap(api.post('/workers/me', body)),
  update: (body) => unwrap(api.patch('/workers/me', body)),
  addPortfolio: (files, captions = []) => unwrap(api.post('/workers/me/portfolio', toForm({ images: files, captions }))),
  removePortfolio: (imageId) => unwrap(api.delete(`/workers/me/portfolio/${imageId}`)),
  submitId: (file) => unwrap(api.post('/workers/me/id-verification', toForm({ document: file }))),
};

export const clientsApi = {
  get: (userId) => unwrap(api.get(`/clients/${userId}`)),
  getMine: () => unwrap(api.get('/clients/me')),
  create: (body) => unwrap(api.post('/clients/me', body)),
  update: (body) => unwrap(api.patch('/clients/me', body)),
};

export const rankingApi = {
  // Labels a search result so the ranker can be trained on real outcomes.
  // Deliberately fire-and-forget: analytics must never surface an error to the user.
  logEvent: (body) => api.post('/ranking/events', body).catch(() => {}),
};

export const priceApi = {
  // AI fair-price guidance for a job or a worker's rate
  suggest: (params) => unwrap(api.get('/price/suggest', { params: clean(params) })),
};

export const jobsApi = {
  list: (params) => unwrap(api.get('/jobs', { params: clean(params) })),
  mine: (params) => unwrap(api.get('/jobs/mine', { params: clean(params) })),
  get: (id) => unwrap(api.get(`/jobs/${id}`)),
  create: (body) => unwrap(api.post('/jobs', body)),
  update: (id, body) => unwrap(api.patch(`/jobs/${id}`, body)),
  cancel: (id, reason) => unwrap(api.post(`/jobs/${id}/cancel`, { reason })),
};
