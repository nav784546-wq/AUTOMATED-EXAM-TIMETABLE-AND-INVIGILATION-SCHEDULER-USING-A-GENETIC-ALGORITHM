import { runGeneticAlgorithm } from '../utils/geneticAlgorithm.js';

let cancelled = false;

self.onmessage = (event) => {
  const { type, payload } = event.data || {};
  if (type === 'cancel') {
    cancelled = true;
    return;
  }
  if (type !== 'start') return;

  cancelled = false;
  try {
    const { exams, subjects, halls, faculty, students, departments, config, jobId } = payload || {};
    const result = runGeneticAlgorithm(exams, subjects, halls, faculty, students, config, {
      departments: departments || config?.departments || [],
      shouldCancel: () => cancelled,
      onProgress: (progress) => {
        self.postMessage({ type: 'progress', jobId, progress });
      },
    });
    self.postMessage({
      type: 'complete',
      jobId,
      result: {
        ...result,
        executionMode: 'WEB_WORKER',
      },
    });
  } catch (err) {
    if (err?.cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err || 'GA execution failed.'),
    });
  }
};
