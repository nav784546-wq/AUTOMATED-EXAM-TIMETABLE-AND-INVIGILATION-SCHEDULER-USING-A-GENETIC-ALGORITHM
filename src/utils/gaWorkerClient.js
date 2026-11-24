import { runGeneticAlgorithm } from './geneticAlgorithm.js';

export class GACancelledError extends Error {
  constructor(message = 'Genetic Algorithm optimization was cancelled.') {
    super(message);
    this.name = 'GACancelledError';
    this.cancelled = true;
  }
}

/**
 * Runs runGeneticAlgorithm inside a dedicated Web Worker with live
 * per-generation progress callbacks and instant cancellation support.
 */
export function runGeneticAlgorithmAsync({
  exams,
  subjects,
  halls,
  faculty,
  students,
  departments = [],
  config,
  onProgress,
}) {
  if (typeof Worker === 'undefined') {
    const result = runGeneticAlgorithm(exams, subjects, halls, faculty, students, config, {
      departments,
      onProgress,
    });
    return {
      promise: Promise.resolve({ ...result, executionMode: 'SYNC_FALLBACK' }),
      cancel: () => {},
    };
  }

  let worker = null;
  let settled = false;
  let rejectFn = null;

  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    try {
      worker = new Worker(new URL('../workers/gaWorker.js', import.meta.url), {
        type: 'module',
      });
    } catch {
      try {
        const res = runGeneticAlgorithm(exams, subjects, halls, faculty, students, config, {
          departments,
          onProgress,
        });
        settled = true;
        resolve({ ...res, executionMode: 'SYNC_FALLBACK' });
      } catch (syncErr) {
        settled = true;
        reject(syncErr);
      }
      return;
    }

    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'progress') {
        if (typeof onProgress === 'function') {
          onProgress(msg.progress);
        }
      } else if (msg.type === 'complete') {
        if (!settled) {
          settled = true;
          worker?.terminate();
          resolve({
            ...msg.result,
            executionMode: msg.result?.executionMode || 'WEB_WORKER',
          });
        }
      } else if (msg.type === 'cancelled') {
        if (!settled) {
          settled = true;
          worker?.terminate();
          reject(new GACancelledError());
        }
      } else if (msg.type === 'error') {
        if (!settled) {
          settled = true;
          worker?.terminate();
          reject(new Error(msg.error || 'GA worker failed.'));
        }
      }
    };

    worker.onerror = (err) => {
      if (!settled) {
        settled = true;
        worker?.terminate();
        reject(new Error(err?.message || 'GA background worker crashed.'));
      }
    };

    worker.postMessage({
      type: 'start',
      payload: { exams, subjects, halls, faculty, students, departments, config },
    });
  });

  const cancel = () => {
    if (settled) return;
    settled = true;
    if (worker) {
      try {
        worker.postMessage({ type: 'cancel' });
      } catch {
        // ignore
      }
      worker.terminate();
      worker = null;
    }
    if (rejectFn) {
      rejectFn(new GACancelledError());
    }
  };

  return { promise, cancel };
}

/**
 * Executes GA constraint optimization on the Node Worker Service (/api/ga/optimize)
 * inside a dedicated worker_threads worker, returning a cancellable handle.
 */
export function runServerGAOptimization({
  exams,
  subjects,
  halls,
  faculty,
  students,
  departments = [],
  config,
}) {
  const controller = new AbortController();
  let cancelled = false;

  const promise = (async () => {
    try {
      const res = await fetch('/api/ga/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exams, subjects, halls, faculty, students, departments, config }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.detail || `Server worker failed (${res.status})`);
      }
      const data = await res.json();
      return {
        ...data,
        executionMode: data?.executionMode || 'SERVER_WORKER',
      };
    } catch (err) {
      if (cancelled || err?.name === 'AbortError') {
        throw new GACancelledError();
      }
      throw err;
    }
  })();

  const cancel = () => {
    cancelled = true;
    controller.abort();
  };

  return { promise, cancel };
}
