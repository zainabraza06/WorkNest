import { api, unwrap } from '@/lib/api';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const offersApi = {
  create: (jobId, body) => unwrap(api.post(`/jobs/${jobId}/offers`, body)),
  list: (params) => unwrap(api.get('/offers', { params: clean(params) })),
  get: (id) => unwrap(api.get(`/offers/${id}`)),
  counter: (id, body) => unwrap(api.post(`/offers/${id}/counter`, body)),
  accept: (id) => unwrap(api.post(`/offers/${id}/accept`)),
  reject: (id, reason) => unwrap(api.post(`/offers/${id}/reject`, { reason })),
  withdraw: (id, reason) => unwrap(api.post(`/offers/${id}/withdraw`, { reason })),
  messages: (id, params) => unwrap(api.get(`/offers/${id}/messages`, { params: clean(params) })),
  send: (id, text) => unwrap(api.post(`/offers/${id}/messages`, { text })),
  markRead: (id) => unwrap(api.post(`/offers/${id}/read`)),
};

export const bookingsApi = {
  list: (params) => unwrap(api.get('/bookings', { params: clean(params) })),
  get: (id) => unwrap(api.get(`/bookings/${id}`)),
  startPayment: (id) => unwrap(api.post(`/bookings/${id}/payment`)),
  syncPayment: (id) => unwrap(api.post(`/bookings/${id}/payment/sync`)),
  start: (id) => unwrap(api.post(`/bookings/${id}/start`)),
  complete: (id) => unwrap(api.post(`/bookings/${id}/complete`)),
  cancel: (id, reason) => unwrap(api.post(`/bookings/${id}/cancel`, { reason })),
  dispute: (id, reason) => unwrap(api.post(`/bookings/${id}/dispute`, { reason })),
  // Work already under way takes both sides to call off
  requestCancellation: (id, reason) => unwrap(api.post(`/bookings/${id}/cancellation`, { reason })),
  answerCancellation: (id, accept, reason) => unwrap(api.post(`/bookings/${id}/cancellation/respond`, { accept, reason })),
};

export const reviewsApi = {
  create: (bookingId, body) => unwrap(api.post(`/bookings/${bookingId}/reviews`, body)),
  forUser: (userId, params) => unwrap(api.get(`/users/${userId}/reviews`, { params: clean(params) })),
};
