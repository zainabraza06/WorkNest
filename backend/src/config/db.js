import dns from 'node:dns';
import mongoose from 'mongoose';

import { logger } from '../observability/logger.js';
import { env } from './env.js';

// A mongodb+srv:// URI needs a DNS SRV lookup, which some ISPs, VPNs and
// corporate resolvers refuse. Retry once through public resolvers before failing.
const SRV_DNS_ERROR = /querySrv|ECONNREFUSED|ESERVFAIL|ENOTFOUND|EAI_AGAIN|ETIMEOUT/i;
const FALLBACK_DNS = ['8.8.8.8', '1.1.1.1'];

export async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  const options = {
    serverSelectionTimeoutMS: 10_000,
    // Bounded pool: unbounded connections is how a traffic spike exhausts an Atlas tier's limit
    maxPoolSize: env.DB_MAX_POOL_SIZE,
    minPoolSize: 2,
    // Fail a stuck query instead of holding a request (and a pool slot) open forever
    socketTimeoutMS: 45_000,
    maxIdleTimeMS: 60_000,
  };

  try {
    await mongoose.connect(uri, options);
  } catch (err) {
    const isSrvLookupFailure = uri.startsWith('mongodb+srv://') && SRV_DNS_ERROR.test(err.message);
    if (!isSrvLookupFailure) throw err;

    logger.warn({ err: err.message, resolvers: FALLBACK_DNS }, 'DNS lookup for the Atlas cluster failed; retrying via public resolvers');
    dns.setServers([...new Set([...FALLBACK_DNS, ...dns.getServers()])]);
    await mongoose.connect(uri, options);
  }

  logger.info({ host: mongoose.connection.host, db: mongoose.connection.name }, 'MongoDB connected');

  // Driver-level events: the first sign of an Atlas failover or network partition
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
