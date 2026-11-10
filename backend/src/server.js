import http from 'node:http';

import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { beginShutdown } from './lifecycle.js';
import { logger } from './observability/logger.js';
import { captureException, flushSentry, initSentry } from './observability/sentry.js';
import { initSocket } from './socket/index.js';

initSentry();

async function start() {
  await connectDB(env.MONGODB_URI);

  const app = createApp();
  const server = http.createServer(app);
  const io = initSocket(server);

  // Slow-loris protection and sane keep-alive behind a load balancer. The LB's idle timeout is
  // usually 60s: ours must be longer or it reuses sockets we already closed, which shows up as
  // intermittent 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 60_000;

  server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'WorkNest API listening'));

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutdown requested, draining');

    // Fail readiness first so the load balancer stops sending new requests, then finish the
    // in-flight ones. Without this order a deploy drops requests that were already accepted.
    beginShutdown();

    const force = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    force.unref();

    try {
      await new Promise((resolve) => io.close(resolve));
      await new Promise((resolve) => server.close(resolve));
      await disconnectDB();
      await flushSentry();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// A rejected promise nobody awaited means state we no longer understand. Log it with context
// and let the platform restart us; swallowing it silently is how corrupted state survives.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
  captureException(reason);
});
process.on('uncaughtException', async (err) => {
  logger.fatal({ err }, 'uncaught exception, exiting');
  captureException(err);
  await flushSentry();
  process.exit(1);
});

start().catch(async (err) => {
  logger.fatal({ err }, 'failed to start server');
  captureException(err);
  await flushSentry();
  process.exit(1);
});
