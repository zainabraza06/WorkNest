import dns from 'node:dns';
import mongoose from 'mongoose';

// A mongodb+srv:// URI needs a DNS SRV lookup, which some ISPs, VPNs and
// corporate resolvers refuse. Retry once through public resolvers before failing.
const SRV_DNS_ERROR = /querySrv|ECONNREFUSED|ESERVFAIL|ENOTFOUND|EAI_AGAIN|ETIMEOUT/i;
const FALLBACK_DNS = ['8.8.8.8', '1.1.1.1'];

export async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  const options = { serverSelectionTimeoutMS: 10000 };

  try {
    await mongoose.connect(uri, options);
  } catch (err) {
    const isSrvLookupFailure = uri.startsWith('mongodb+srv://') && SRV_DNS_ERROR.test(err.message);
    if (!isSrvLookupFailure) throw err;

    console.warn(`DNS lookup for the Atlas cluster failed (${err.message}); retrying via ${FALLBACK_DNS.join(', ')}`);
    dns.setServers([...new Set([...FALLBACK_DNS, ...dns.getServers()])]);
    await mongoose.connect(uri, options);
  }

  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
