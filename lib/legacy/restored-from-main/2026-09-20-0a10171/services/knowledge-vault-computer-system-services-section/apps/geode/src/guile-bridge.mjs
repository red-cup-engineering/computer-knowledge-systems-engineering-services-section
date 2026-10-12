import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * guile-bridge.mjs — a bridge from Node to a long-lived Guile 3.0 process, evaluating Scheme
 * sent from Node and returning its result as data.
 *
 * ============================================================================================
 * TRUST BOUNDARY — read this before wiring this module to anything.
 * ============================================================================================
 * The Guile process this module drives (`src/scheme/bridge.scm`) evaluates whatever Scheme text
 * it is given in a single shared top-level environment, with full ambient authority: filesystem,
 * network, subprocess spawning — everything an ordinary `guile` invocation can do. NOTHING here
 * is sandboxed. `code` passed to `bridge.eval(code)` is trusted exactly as much as a shell
 * command would be.
 *
 * This bridge is for LOCALLY AUTHORED, TRUSTED EXTENSION CODE ONLY — the same trust level as
 * code committed to this repository. It must NEVER be wired so that an HTTP request body, a
 * search query, a URL parameter, or any other input that crossed a network boundary can reach
 * `eval()`'s `code` argument. Doing so would let a remote caller run arbitrary Scheme with this
 * process's full filesystem and network authority. If a use case needs to run untrusted code,
 * that is a different, harder problem — see `(ice-9 sandbox)`, which this module deliberately
 * does not use, precisely because the sandboxed and unsandboxed cases should not be confused
 * with each other by sharing one code path.
 *
 * ============================================================================================
 * PROCESS MODEL
 * ============================================================================================
 * One long-lived `guile` child process, spawned once and reused across calls, speaking a
 * length-prefixed request/response protocol over its stdin/stdout (see `bridge.scm`'s header
 * for the exact frame format). Reusing the process is what makes a Scheme `define` in one
 * `eval()` call visible to the next — this is load-bearing for the "load EAVT rows once, query
 * them many times" use case, and it is also why startup cost (measured separately, see the
 * module's spike report) matters only once per bridge lifetime, not once per query.
 *
 * Calls may be issued without waiting for the previous one to resolve: this module writes each
 * request frame as soon as `eval()` is called and matches responses back by id, but the Scheme
 * loop itself only ever handles one frame at a time (read, evaluate, respond, read the next), so
 * evaluation is still strictly serialized — pipelining only overlaps the write/read plumbing.
 *
 * ============================================================================================
 * FAILURE MODES
 * ============================================================================================
 * - A Scheme-level error (wrong-type-arg, unbound-variable, a user `(error ...)` call, etc.) is
 *   caught on the Scheme side and comes back as `{ ok: false, error }` — a resolved promise, not
 *   a rejected one, and the process is untouched.
 * - Non-termination (an infinite loop) is bounded two ways:
 *     1. A per-call SIGALRM installed on the Scheme side, which throws into the same catch as
 *        an ordinary error. This is best-effort: it relies on Guile's VM checking for pending
 *        signals at safe points, which happens even in a tight non-allocating loop (measured),
 *        but is not guaranteed against adversarial code that masks the signal or blocks in a
 *        non-yielding primitive.
 *     2. A Node-side wall-clock watchdog, set comfortably longer than the requested timeout. If
 *        it fires, this module SIGKILLs the child — a hard guarantee independent of anything the
 *        Scheme side does — and the next `eval()` call transparently spawns a fresh process
 *        (losing whatever was `define`d, which the caller can tell happened: the rejection is a
 *        distinct `GuileBridgeHardTimeoutError`).
 * - If the child exits on its own (crash, `(exit)` called from evaluated code, etc.), pending
 *   calls are rejected and the next `eval()` call spawns a fresh process.
 */

const DEFAULT_SCRIPT = fileURLToPath(new URL("./scheme/bridge.scm", import.meta.url));
const DEFAULT_TIMEOUT_MS = 5000;
const HARD_TIMEOUT_GRACE_MS = 2000;
const STDERR_TAIL_BYTES = 4096;

export class GuileBridgeError extends Error {}
export class GuileBridgeHardTimeoutError extends GuileBridgeError {}
export class GuileBridgeExitedError extends GuileBridgeError {}

function encodeFrame(obj) {
  const json = JSON.stringify(obj);
  const bytes = Buffer.byteLength(json, "utf8");
  return Buffer.concat([Buffer.from(`${bytes}\n`, "ascii"), Buffer.from(json, "utf8")]);
}

/** Incremental frame parser: feed it chunks, get back complete decoded frames as they land. */
function createFrameReader(onFrame) {
  let buffer = Buffer.alloc(0);
  return function feed(chunk) {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    for (;;) {
      const newline = buffer.indexOf(10);
      if (newline === -1) return;
      const lengthText = buffer.subarray(0, newline).toString("ascii");
      const length = Number(lengthText);
      if (!Number.isInteger(length) || length < 0) {
        throw new GuileBridgeError(`corrupt frame length prefix: ${JSON.stringify(lengthText)}`);
      }
      const frameEnd = newline + 1 + length;
      if (buffer.length < frameEnd) return; // wait for more data; partial reads never misparse
      const payload = buffer.subarray(newline + 1, frameEnd).toString("utf8");
      buffer = buffer.subarray(frameEnd);
      onFrame(JSON.parse(payload));
    }
  };
}

function tailOf(text, maxBytes) {
  return text.length > maxBytes ? text.slice(text.length - maxBytes) : text;
}

/**
 * Read a Linux process's resident set size in bytes from /proc/<pid>/status.
 * Diagnostic use only (memory measurement); returns null off Linux or if the process is gone.
 */
export function processRssBytes(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s*(\d+)\s*kB$/mu);
    return match ? Number(match[1]) * 1024 : null;
  } catch {
    return null;
  }
}

/**
 * Create a bridge to a long-lived Guile process. See the module doc comment above for the
 * trust boundary this bridge does and does not enforce — it enforces none; the caller must.
 *
 * @param {object} [options]
 * @param {string} [options.guileCommand] - executable to spawn, default "guile".
 * @param {string} [options.scriptPath] - path to the Scheme server loop, default bridge.scm.
 * @param {boolean} [options.autoCompile] - let Guile bytecode-cache the script (default false,
 *   i.e. this passes --no-auto-compile, trading a little steady-state eval speed for startup
 *   time that does not vary with cache state or write to the caller's ~/.cache/guile).
 * @param {number} [options.defaultTimeoutMs] - default per-eval timeout, 5000ms.
 */
export function createGuileBridge({
  guileCommand = "guile",
  scriptPath = DEFAULT_SCRIPT,
  autoCompile = false,
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let child = null;
  let nextId = 1;
  let stderrTail = "";
  // No Node-side call queue: guile's main-loop (bridge.scm) itself reads and fully handles one
  // frame — including writing its response — before reading the next, so writing several
  // request frames back to back is safe; Guile serializes the actual evaluation, and responses
  // come back in the same order, matched to their request by id. What DOES matter is that the
  // synchronous part of evalCode (spawn-if-needed, register in proc.bridgePending, write the
  // frame) happens entirely within one synchronous call, with no `await` in between — so that a
  // `close()` invoked immediately after an `eval()` call (no intervening await) is guaranteed to
  // see that request already registered on the right process, rather than racing a deferred
  // spawn. new Promise(executor) runs its executor synchronously, which is what makes this true.

  function args() {
    return autoCompile ? [scriptPath] : ["--no-auto-compile", scriptPath];
  }

  // Pending requests live on the process object that owns them (proc.bridgePending), not in one
  // bridge-wide map. This matters: a hard-killed process's 'exit' event fires asynchronously,
  // strictly after this module has already moved on and may have spawned a REPLACEMENT process
  // with its own in-flight request under the same numeric id space. Rejecting a shared map from
  // that stale 'exit' handler would reject the new process's live request out from under it.
  // Scoping pending per-process makes that impossible: an old process can only ever reject the
  // requests it itself was holding.
  function rejectPendingOf(proc, error) {
    for (const { reject, watchdog } of proc.bridgePending.values()) {
      clearTimeout(watchdog);
      reject(error);
    }
    proc.bridgePending.clear();
  }

  function spawnChild() {
    const proc = spawn(guileCommand, args(), { stdio: ["pipe", "pipe", "pipe"] });
    proc.bridgePending = new Map(); // id -> { resolve, reject, watchdog }
    const feed = createFrameReader((frame) => {
      const waiter = proc.bridgePending.get(frame.id);
      if (!waiter) return; // response to a request this process already gave up on
      proc.bridgePending.delete(frame.id);
      clearTimeout(waiter.watchdog);
      waiter.resolve(frame);
    });
    proc.stdout.on("data", feed);
    proc.stderr.on("data", (chunk) => {
      stderrTail = tailOf(stderrTail + chunk.toString("utf8"), STDERR_TAIL_BYTES);
    });
    proc.on("exit", (code, signal) => {
      if (child === proc) child = null;
      rejectPendingOf(proc, new GuileBridgeExitedError(
        `guile process exited (code=${code}, signal=${signal}) — recent stderr:\n${stderrTail}`));
    });
    proc.stdin.on("error", () => {}); // surfaced via 'exit' instead; avoid an unhandled EPIPE
    return proc;
  }

  function ensureAlive() {
    if (child === null) child = spawnChild();
    return child;
  }

  /**
   * Evaluate one or more top-level Scheme forms in the shared environment. Resolves even when
   * the Scheme side reported an error or timeout — see the module doc comment. Only rejects for
   * bridge-level failures: the hard watchdog killing the process, or the process exiting on its
   * own.
   *
   * @param {string} code - Scheme source, one or more top-level forms.
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - per-call timeout; 0 or negative disables it.
   * @returns {Promise<{ok: boolean, value: any, output: string, error: object|null}>}
   */
  function evalCode(code, { timeoutMs = defaultTimeoutMs } = {}) {
    const proc = ensureAlive();
    const id = nextId++;
    const timeoutSeconds = timeoutMs > 0 ? timeoutMs / 1000 : null;
    return new Promise((resolve, reject) => {
      const watchdog = timeoutMs > 0
        ? setTimeout(() => {
          proc.bridgePending.delete(id);
          if (child === proc) child = null;
          proc.kill("SIGKILL");
          reject(new GuileBridgeHardTimeoutError(
            `guile did not respond within ${timeoutMs + HARD_TIMEOUT_GRACE_MS}ms `
            + `(requested timeout ${timeoutMs}ms) — process killed, next call spawns a fresh one`));
        }, timeoutMs + HARD_TIMEOUT_GRACE_MS)
        : null;
      proc.bridgePending.set(id, { resolve, reject, watchdog });
      proc.stdin.write(encodeFrame({ id, op: "eval", code, timeoutSeconds }), (writeError) => {
        if (writeError && proc.bridgePending.has(id)) {
          proc.bridgePending.delete(id);
          if (watchdog) clearTimeout(watchdog);
          reject(new GuileBridgeError(`failed writing to guile stdin: ${writeError.message}`));
        }
      });
    });
  }

  async function ping() {
    return evalCode("'pong");
  }

  function close() {
    const proc = child;
    child = null;
    if (proc) {
      rejectPendingOf(proc, new GuileBridgeExitedError("bridge closed"));
      proc.stdin.end();
      proc.kill("SIGKILL");
    }
  }

  return Object.freeze({
    eval: evalCode,
    ping,
    close,
    get pid() { return child?.pid ?? null; },
    get rssBytes() { return child ? processRssBytes(child.pid) : null; },
  });
}
