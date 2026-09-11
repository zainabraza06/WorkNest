import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();
export const api = () => request(app);

let counter = 0;

export async function registerUser(overrides = {}) {
  counter += 1;
  const body = {
    name: `Test User ${counter}`,
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'password123',
    role: 'client',
    ...overrides,
  };
  const res = await api().post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.token, user: res.body.data.user, password: body.password };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
