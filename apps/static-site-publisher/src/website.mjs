import { watch as watchFileTree } from 'node:fs';
import { connect as connectSocket } from 'node:net';
import { startNativeApplication as startHttpServer } from '@red-cup-engineering/computer-web-server/native-application';
import { build } from './build.mjs';
import { createVictorApplication } from './runtime.mjs';

async function assayListenerAcceptance(running, timeoutMs = 1_000) {
  const address = running.address;
  if (typeof address !== 'object' || address === null) return;
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connectSocket({ host: address.address, port: address.port });
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', reject);
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error('VICTOR server did not accept a connection after binding', { cause: lastError });
}

/**
 * Form one downstream website from VICTOR's catalog, projections, application
 * composition, and upstream HTTP server. Consumers should use this boundary
 * instead of reconstructing VICTOR's CLI lifecycle from lower services.
 */
export async function createVictorWebsite(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('VICTOR website options must be an object');
  }
  const {
    applications,
    runtime: runtimeOptions = {},
    ...buildOptions
  } = options;
  if (!runtimeOptions || typeof runtimeOptions !== 'object' || Array.isArray(runtimeOptions)) {
    throw new TypeError('VICTOR website runtime options must be an object');
  }
  if (!buildOptions.reader && (typeof buildOptions.contentDir !== 'string' || !buildOptions.contentDir)) {
    throw new TypeError('VICTOR website requires contentDir or a content reader');
  }

  let currentBuild = await build(buildOptions);
  const application = await createVictorApplication(currentBuild, applications, runtimeOptions);
  const watchers = new Map();
  let running;
  let closed = false;
  let rebuildTail = Promise.resolve();
  let rebuildTimer;
  let lastRebuildError;

  const website = {
    application,
    getBuild: () => currentBuild,
    get port() { return running?.port; },
    get address() { return running?.address; },
    get lastRebuildError() { return lastRebuildError; },

    rebuild(overrides = {}) {
      if (closed) return Promise.reject(new Error('VICTOR website is closed'));
      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
        return Promise.reject(new TypeError('VICTOR rebuild overrides must be an object'));
      }
      rebuildTail = rebuildTail.catch(() => undefined).then(async () => {
        const nextBuild = await build({ ...buildOptions, ...overrides });
        application.updateBuild(nextBuild);
        currentBuild = nextBuild;
        lastRebuildError = undefined;
        return nextBuild;
      });
      return rebuildTail;
    },

    watch({ paths, debounceMs = 150, onRebuild, onError } = {}) {
      if (closed) throw new Error('VICTOR website is closed');
      if (!Number.isSafeInteger(debounceMs) || debounceMs < 0) {
        throw new TypeError('VICTOR website debounceMs must be a non-negative safe integer');
      }
      const selected = paths ?? [buildOptions.contentDir, buildOptions.publicDir].filter(Boolean);
      if (!Array.isArray(selected) || selected.some((path) => typeof path !== 'string' || !path)) {
        throw new TypeError('VICTOR website watch paths must be non-empty path strings');
      }
      for (const path of selected) {
        if (watchers.has(path)) continue;
        const watcher = watchFileTree(path, { recursive: true }, () => {
          clearTimeout(rebuildTimer);
          rebuildTimer = setTimeout(() => {
            website.rebuild().then(
              (result) => onRebuild?.(result),
              (error) => {
                lastRebuildError = error;
                onError?.(error);
              },
            );
          }, debounceMs);
        });
        watchers.set(path, watcher);
      }
      return website;
    },

    async start(serverOptions = {}) {
      if (closed) throw new Error('VICTOR website is closed');
      if (running) throw new Error('VICTOR website is already serving');
      running = await startHttpServer(application, serverOptions);
      await assayListenerAcceptance(running);
      return Object.freeze({ port: running.port, address: running.address });
    },

    async close(grace = 10_000) {
      if (closed) return;
      closed = true;
      clearTimeout(rebuildTimer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      if (running) await running.close(grace);
    },
  };

  return website;
}

/** Build and start a downstream VICTOR website through the shared server. */
export async function serveVictorWebsite(options, serverOptions = {}) {
  const website = await createVictorWebsite(options);
  try {
    await website.start(serverOptions);
    return website;
  } catch (error) {
    await website.close(0);
    throw error;
  }
}
