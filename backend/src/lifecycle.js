// Shared flag so health checks can report "draining" the moment SIGTERM arrives.
let shuttingDown = false;
export const isShuttingDown = () => shuttingDown;
export const beginShutdown = () => {
  shuttingDown = true;
};
