import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/upload.service.js', () => ({
  IMAGE_TRANSFORMS: { avatar: [], portfolio: [] },
  uploadBuffer: vi.fn(async (_buf, { folder }) => ({ url: `https://res.cloudinary.test/${folder}/1.jpg`, publicId: `worknest/${folder}/1` })),
  deleteAsset: vi.fn(async () => {}),
  signedUrl: vi.fn((id) => `https://signed.test/${id}`),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { env } = await import('../src/config/env.js');
const { matchesDeclaredType } = await import('../src/middleware/upload.js');
const { disconnectUserSockets } = await import('../src/socket/index.js');

afterEach(() => vi.restoreAllMocks());

describe('JWT algorithm is pinned', () => {
  it('accepts a normal session token', async () => {
    const { token } = await registerUser();
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(200);
  });

  it('rejects a token signed with a different algorithm, even with the right secret', async () => {
    const { user } = await registerUser();
    const forged = jwt.sign({ sub: user._id, role: user.role, tv: 0 }, env.JWT_SECRET, { algorithm: 'HS512' });
    expect((await api().get('/api/auth/me').set(bearer(forged))).status).toBe(401);
  });

  it('rejects an unsigned ("alg: none") token', async () => {
    const { user } = await registerUser();
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user._id, role: 'admin', tv: 0 })}.`;
    expect((await api().get('/api/auth/me').set(bearer(none))).status).toBe(401);
  });
});

describe('login does not reveal which emails exist', () => {
  it('does the same bcrypt work for an unknown email as for a wrong password', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    const res = await api().post('/api/auth/login').send({ email: `nobody-${Date.now()}@example.com`, password: 'password123' });
    expect(res.status).toBe(401);
    expect(compare).toHaveBeenCalled(); // without it, "no such account" answers ~100x faster and leaks existence
  });

  it('returns the identical message for an unknown email and a wrong password', async () => {
    const { user } = await registerUser();
    const unknown = await api().post('/api/auth/login').send({ email: `nobody-${Date.now()}@example.com`, password: 'password123' });
    const wrong = await api().post('/api/auth/login').send({ email: user.email, password: 'not-the-password1' });
    expect(unknown.body.message).toBe(wrong.body.message);
  });
});

describe('uploads are checked by content, not by the declared type', () => {
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

  it('recognises each allowed type by its leading bytes', () => {
    expect(matchesDeclaredType({ mimetype: 'image/png', buffer: PNG })).toBe(true);
    expect(matchesDeclaredType({ mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) })).toBe(true);
    expect(matchesDeclaredType({ mimetype: 'image/webp', buffer: Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1') })).toBe(true);
    expect(matchesDeclaredType({ mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') })).toBe(true);
  });

  it('rejects a file whose bytes do not match what it claims to be', () => {
    expect(matchesDeclaredType({ mimetype: 'image/png', buffer: Buffer.from('<script>alert(1)</script>') })).toBe(false);
    expect(matchesDeclaredType({ mimetype: 'image/png', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) })).toBe(false); // a JPEG labelled PNG
    expect(matchesDeclaredType({ mimetype: 'application/pdf', buffer: PNG })).toBe(false);
    expect(matchesDeclaredType({ mimetype: 'text/html', buffer: Buffer.from('<html>') })).toBe(false);
    expect(matchesDeclaredType({ mimetype: 'image/png', buffer: Buffer.alloc(0) })).toBe(false);
  });

  it('an avatar upload accepts a real PNG and rejects HTML labelled as a PNG', async () => {
    const { token } = await registerUser();
    const ok = await api().post('/api/users/me/avatar').set(bearer(token)).attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);

    const bad = await api()
      .post('/api/users/me/avatar')
      .set(bearer(token))
      .attach('avatar', Buffer.from('<html><script>steal()</script></html>'), { filename: 'me.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/do not match/i);
  });
});

describe('revoking sessions', () => {
  it('is safe to disconnect sockets when none are running (tests, scripts)', () => {
    expect(() => disconnectUserSockets('507f1f77bcf86cd799439011')).not.toThrow();
  });

  it('"sign out everywhere" still revokes the token', async () => {
    const { token } = await registerUser();
    expect((await api().post('/api/auth/logout-all').set(bearer(token))).status).toBe(200);
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });
});
