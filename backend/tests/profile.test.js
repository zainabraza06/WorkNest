import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/upload.service.js', () => {
  let n = 0;
  return {
    IMAGE_TRANSFORMS: { avatar: [], portfolio: [] },
    uploadBuffer: vi.fn(async (_buf, { folder }) => {
      n += 1;
      return { url: `https://res.cloudinary.test/${folder}/${n}.jpg`, publicId: `worknest/${folder}/${n}` };
    }),
    deleteAsset: vi.fn(async () => {}),
    signedUrl: vi.fn((id) => `https://signed.test/${id}`),
  };
});

const { api, bearer, registerUser } = await import('./helpers.js');
const { User } = await import('../src/models/index.js');

const workerBody = {
  headline: 'Licensed electrician, 8 years',
  bio: 'Wiring, DB boards, UPS installation and fault finding.',
  categories: ['electrical'],
  skills: ['Wiring', 'UPS installation', 'wiring'],
  experienceYears: 8,
  rates: { daily: 3500, monthly: 60000 },
  location: { lat: 31.5204, lng: 74.3587 },
  city: 'Lahore',
  availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }],
};

const png = Buffer.from('89504e470d0a1a0a', 'hex');

describe('worker profile', () => {
  let worker;
  beforeEach(async () => {
    worker = await registerUser({ role: 'worker' });
  });

  it('creates, reads and updates a worker profile', async () => {
    const created = await api().post('/api/workers/me').set(bearer(worker.token)).send(workerBody);
    expect(created.status).toBe(201);
    expect(created.body.data.location.coordinates).toEqual([74.3587, 31.5204]);
    expect(created.body.data.skills).toEqual(['wiring', 'ups installation']);

    const dup = await api().post('/api/workers/me').set(bearer(worker.token)).send(workerBody);
    expect(dup.status).toBe(409);

    const patched = await api()
      .patch('/api/workers/me')
      .set(bearer(worker.token))
      .send({ rates: { daily: 4000 }, isAvailable: false });
    expect(patched.status).toBe(200);
    expect(patched.body.data.rates.daily).toBe(4000);
    expect(patched.body.data.isAvailable).toBe(false);

    const me = await api().get('/api/auth/me').set(bearer(worker.token));
    expect(me.body.data.profile.headline).toBe(workerBody.headline);
  });

  it('validates profile input', async () => {
    const res = await api()
      .post('/api/workers/me')
      .set(bearer(worker.token))
      .send({ ...workerBody, categories: [], rates: { daily: 3000, monthly: 100 }, city: 'Atlantis' });
    expect(res.status).toBe(400);
    const paths = res.body.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['categories', 'rates.monthly', 'city']));
  });

  it('blocks clients from worker endpoints', async () => {
    const client = await registerUser({ role: 'client' });
    const res = await api().post('/api/workers/me').set(bearer(client.token)).send(workerBody);
    expect(res.status).toBe(403);
  });

  it('hides the ID document on the public profile', async () => {
    await api().post('/api/workers/me').set(bearer(worker.token)).send(workerBody);
    const idRes = await api()
      .post('/api/workers/me/id-verification')
      .set(bearer(worker.token))
      .attach('document', png, { filename: 'cnic.png', contentType: 'image/png' });
    expect(idRes.status).toBe(201);
    expect(idRes.body.data.status).toBe('pending');

    const pub = await api().get(`/api/workers/${worker.user._id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.idVerification).toBeUndefined();
    expect(pub.body.data.idVerified).toBe(false);
    expect(pub.body.data.user.name).toBe(worker.user.name);
  });

  it('lets an admin verify an ID', async () => {
    await api().post('/api/workers/me').set(bearer(worker.token)).send(workerBody);
    await api()
      .post('/api/workers/me/id-verification')
      .set(bearer(worker.token))
      .attach('document', png, { filename: 'cnic.png', contentType: 'image/png' });

    const admin = await registerUser({ role: 'client' });
    await User.updateOne({ _id: admin.user._id }, { role: 'admin' });

    const doc = await api().get(`/api/workers/${worker.user._id}/id-document`).set(bearer(admin.token));
    expect(doc.status).toBe(200);
    expect(doc.body.data.url).toContain('signed.test');

    const decision = await api()
      .patch(`/api/workers/${worker.user._id}/id-verification`)
      .set(bearer(admin.token))
      .send({ status: 'verified' });
    expect(decision.status).toBe(200);

    const pub = await api().get(`/api/workers/${worker.user._id}`);
    expect(pub.body.data.idVerified).toBe(true);
  });

  it('adds and removes portfolio images, rejecting bad file types', async () => {
    await api().post('/api/workers/me').set(bearer(worker.token)).send(workerBody);

    const added = await api()
      .post('/api/workers/me/portfolio')
      .set(bearer(worker.token))
      .field('captions', 'DB board rewiring')
      .attach('images', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('images', png, { filename: 'b.png', contentType: 'image/png' });
    expect(added.status).toBe(201);
    expect(added.body.data).toHaveLength(2);
    expect(added.body.data[0].caption).toBe('DB board rewiring');

    const bad = await api()
      .post('/api/workers/me/portfolio')
      .set(bearer(worker.token))
      .attach('images', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(400);

    const removed = await api()
      .delete(`/api/workers/me/portfolio/${added.body.data[0]._id}`)
      .set(bearer(worker.token));
    expect(removed.status).toBe(200);
    expect(removed.body.data).toHaveLength(1);
  });

  it('returns 404 for unknown workers and 400 for malformed ids', async () => {
    expect((await api().get('/api/workers/64b7f0000000000000000000')).status).toBe(404);
    expect((await api().get('/api/workers/not-an-id')).status).toBe(400);
  });
});

describe('client profile & user', () => {
  it('creates and updates a client profile', async () => {
    const client = await registerUser({ role: 'client' });
    const created = await api()
      .post('/api/clients/me')
      .set(bearer(client.token))
      .send({ location: { lat: 24.8607, lng: 67.0011 }, city: 'Karachi', address: 'Clifton Block 5' });
    expect(created.status).toBe(201);

    const patched = await api().patch('/api/clients/me').set(bearer(client.token)).send({ about: 'Family of four' });
    expect(patched.body.data.about).toBe('Family of four');

    const worker = await registerUser({ role: 'worker' });
    const pub = await api().get(`/api/clients/${client.user._id}`).set(bearer(worker.token));
    expect(pub.status).toBe(200);
    expect(pub.body.data.address).toBeUndefined();
    expect(pub.body.data.location).toBeUndefined();
  });

  it('updates name and uploads an avatar', async () => {
    const user = await registerUser();
    const res = await api().patch('/api/users/me').set(bearer(user.token)).send({ name: 'Sana Iqbal' });
    expect(res.body.data.name).toBe('Sana Iqbal');

    const avatar = await api()
      .post('/api/users/me/avatar')
      .set(bearer(user.token))
      .attach('avatar', png, { filename: 'me.png', contentType: 'image/png' });
    expect(avatar.status).toBe(200);
    expect(avatar.body.data.avatar.url).toContain('avatars');
  });
});
