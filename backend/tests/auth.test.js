import { describe, expect, it } from 'vitest';
import { api, bearer, registerUser } from './helpers.js';

describe('auth', () => {
  it('registers a worker and never returns the password', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Ali Raza',
      email: 'ALI@Example.com',
      password: 'secret123',
      role: 'worker',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.user).toMatchObject({ email: 'ali@example.com', role: 'worker' });
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects invalid registration input with field details', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'A', email: 'nope', password: 'short', role: 'admin' });
    expect(res.status).toBe(400);
    const paths = res.body.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password', 'role']));
  });

  it('rejects duplicate emails', async () => {
    const { user } = await registerUser();
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Dup', email: user.email, password: 'password123', role: 'client' });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const { user, password } = await registerUser();

    const ok = await api().post('/api/auth/login').send({ email: user.email, password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTypeOf('string');

    const bad = await api().post('/api/auth/login').send({ email: user.email, password: 'wrongpass1' });
    expect(bad.status).toBe(401);

    const unknown = await api().post('/api/auth/login').send({ email: 'ghost@example.com', password });
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(bad.body.message);
  });

  it('returns the current user from /me and guards it', async () => {
    const { token, user } = await registerUser({ role: 'worker' });

    const res = await api().get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user._id).toBe(user._id);
    expect(res.body.data.profile).toBeNull();

    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(bearer('garbage'))).status).toBe(401);
  });

  it('changes password', async () => {
    const { token, user, password } = await registerUser();
    const res = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: password, newPassword: 'newpass456' });
    expect(res.status).toBe(200);

    const login = await api().post('/api/auth/login').send({ email: user.email, password: 'newpass456' });
    expect(login.status).toBe(200);
  });
});
