import express from 'express';
import { spawn } from 'child_process';
import { Worker } from 'node:worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const PYTHON_PORT = Number(process.env.BACKEND_PORT || 5000);

const HOP_BY_HOP_REQ_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

const HOP_BY_HOP_RES_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
]);

// Start Python backend process in background on PYTHON_PORT
console.log('[Backend] Spawning Python backend server on port', PYTHON_PORT);
const pythonProcess = spawn('python3', ['backend/server.py'], {
  cwd: __dirname,
  env: { ...process.env, BACKEND_PORT: String(PYTHON_PORT) },
  stdio: 'inherit',
});

pythonProcess.on('error', (err) => {
  console.error('[Backend] Failed to start Python process:', err);
});

process.on('exit', () => {
  pythonProcess.kill();
});

async function fetchWithStartupRetry(url: string, init: RequestInit, retries = 6): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      lastErr = err;
      const code = err?.cause?.code || err?.code;
      if (code === 'ECONNREFUSED' && attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function runGaInWorkerThread(workerData: Record<string, unknown>, timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(__dirname, 'src', 'workers', 'gaNodeWorker.mjs');
    const worker = new Worker(workerPath, { workerData });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => {});
      reject(new Error('GA worker thread timed out.'));
    }, timeoutMs);

    worker.on('message', (msg: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (msg?.ok) {
        resolve(msg.result);
      } else {
        reject(new Error(msg?.error || 'GA worker thread execution failed.'));
      }
    });

    worker.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`GA worker thread exited unexpectedly with code ${code}.`));
      }
    });
  });
}

// Dedicated Node Worker Thread logic service for GA constraints & optimization
app.post('/api/ga/optimize', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    const body = req.body || {};
    let { exams, subjects, halls, faculty, students, departments, config = {} } = body;

    if (!Array.isArray(subjects) || !Array.isArray(halls) || !Array.isArray(faculty)) {
      const [subRes, hallRes, facRes, stuRes, deptRes] = await Promise.all([
        fetchWithStartupRetry(`http://127.0.0.1:${PYTHON_PORT}/api/subjects`, { method: 'GET' }),
        fetchWithStartupRetry(`http://127.0.0.1:${PYTHON_PORT}/api/halls`, { method: 'GET' }),
        fetchWithStartupRetry(`http://127.0.0.1:${PYTHON_PORT}/api/faculty`, { method: 'GET' }),
        fetchWithStartupRetry(`http://127.0.0.1:${PYTHON_PORT}/api/students`, { method: 'GET' }),
        fetchWithStartupRetry(`http://127.0.0.1:${PYTHON_PORT}/api/departments`, { method: 'GET' }),
      ]);
      subjects = await subRes.json();
      halls = await hallRes.json();
      faculty = await facRes.json();
      students = await stuRes.json();
      departments = await deptRes.json();
    }

    if (!Array.isArray(students)) students = [];
    if (!Array.isArray(departments)) departments = [];
    if (!Array.isArray(exams) || exams.length === 0) {
      exams = (subjects || []).map((s: any) => ({
        id: `exam-${s.id}`,
        subjectId: s.id,
        durationMinutes: 180,
      }));
    }

    if (subjects.length === 0 || halls.length === 0 || faculty.length === 0) {
      res.status(400).json({ error: 'Subjects, halls, and faculty are required to run GA optimization.' });
      return;
    }

    const normalizedConfig = {
      ...(config && typeof config === 'object' ? config : {}),
      availableDates:
        Array.isArray(config?.availableDates) && config.availableDates.length > 0
          ? config.availableDates
          : [
              '2026-11-16',
              '2026-11-17',
              '2026-11-18',
              '2026-11-19',
              '2026-11-20',
              '2026-11-21',
              '2026-11-22',
              '2026-11-23',
              '2026-11-24',
              '2026-11-25',
            ],
    };

    const result = await runGaInWorkerThread({
      exams,
      subjects,
      halls,
      faculty,
      students,
      departments,
      config: normalizedConfig,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[GA Worker Service] Error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Server GA worker optimization failed.',
    });
  }
});

// Proxy /api/* requests to Python backend
app.use('/api', async (req, res) => {
  const targetUrl = `http://127.0.0.1:${PYTHON_PORT}/api${req.url}`;
  try {
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP_REQ_HEADERS.has(lower)) continue;
      if (typeof val === 'string') {
        headers[key] = val;
      } else if (Array.isArray(val) && val.length > 0) {
        headers[key] = val.join(', ');
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length > 0) {
        init.body = Buffer.concat(chunks);
      }
    }

    const response = await fetchWithStartupRetry(targetUrl, init);
    res.status(response.status);
    response.headers.forEach((v, k) => {
      if (!HOP_BY_HOP_RES_HEADERS.has(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    });

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(`[Proxy] Failed to route ${req.method} ${req.originalUrl}:`, err);
    res.status(503).json({ error: 'Backend server starting up or unavailable', detail: String(err) });
  }
});

// Dev server: mount Vite middlewares
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  // Production static file serving
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ExamGrid] Full-stack application running at http://localhost:${PORT}`);
});
