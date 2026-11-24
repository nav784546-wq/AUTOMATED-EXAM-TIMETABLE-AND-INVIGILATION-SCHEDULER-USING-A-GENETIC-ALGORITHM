# System Architecture — ExamGrid GA

## 1. High-Level Topology

ExamGrid GA is a full-stack application combining a **React 19 + Vite** frontend, a **Node.js/Express** server (`server.ts` on port `3000`), a **Python HTTP API & Optimization Engine** (`backend/server.py` on port `5000`), and a **dual-layer persistence layer** backed by **Cloud Firestore** (primary when authenticated via Firebase Auth) and **SQLite** (`backend/examgrid.db`).

```
+-------------------------------------------------------------------+
| Browser Client (React 19 + Tailwind CSS v4 + Recharts)            |
|  - AuthContext (Firebase Auth: Google & Email/Password)           |
|  - persistenceService (Firestore Primary / REST API Fallback)     |
|  - Pure Domain Modules (GA, Seating, Subsection, Validation)      |
+-------------------+--------------------------------+--------------+
                    |                                |
                    | Authenticated                  | /api/* HTTP
                    v                                v
+-------------------------------+   +-------------------------------+
| Cloud Firestore               |   | Node.js Express (Port 3000)   |
| (gen-lang-client-0697181413)  |   |  - Vite dev / dist static     |
|  - Security Rules Enforced    |   |  - Hop-by-hop safe /api proxy |
|  - One-time system/bootstrap  |   +---------------+---------------+
+-------------------------------+                   | 127.0.0.1:5000
                                                    v
                                    +-------------------------------+
                                    | Python Backend (Port 5000)    |
                                    |  - CRUD & Cascade Endpoints   |
                                    |  - GA Optimizer & Conflicts   |
                                    |  - SQLite (backend/examgrid.db)|
                                    +-------------------------------+
```

---

## 2. Frontend Architecture (`src/`)

### 2.1 Core Entry & State Management
- `src/main.jsx`: Mounts `<App />` wrapped inside `<AuthProvider>`.
- `src/contexts/AuthContext.js`: Subscribes to `onAuthStateChanged`, exposing `user`, `loading`, `login`, `signup`, `loginWithGoogle`, and `logout`.
- `src/components/ProtectedRoute.jsx`: Gates application access behind authentication (or `?autostart=1` preview mode).
- `src/App.jsx`: Coordinates initial database hydration (`persistenceService.loadAllData()`), uniqueness validation (`src/utils/dataValidation.js`), DB-first mutation handlers, global status banners, and `<ConfirmDialog />`.

### 2.2 Dual-Layer Persistence (`src/services/persistenceService.js`)
- **When Firebase User Is Authenticated (`auth.currentUser != null`)**:
  - Reads and writes directly to Cloud Firestore named database (`ai-studio-examgridgaautoma-4a80c519-b532-471f-bdc3-a3be0e580ca6`) using atomic `writeBatch` operations for cascading renames, schedule + timetable + conflict report commits, and subsection approvals.
  - Verifies connectivity with `getDocFromServer(doc(db, 'system', 'connection'))`.
  - Runs one-time initialization via `system/bootstrap` only if `departments` is genuinely empty.
  - Wraps all Firestore errors in structured `FirestoreErrorInfo` JSON via `handleFirestoreError()`.
  - Mirrors writes best-effort to Python SQLite endpoints so local APIs remain synchronized.
- **When Operating Without Firebase Auth (e.g., `?autostart=1` local/automated mode)**:
  - Communicates directly with the Python REST API (`src/services/api.js` -> `/api/*` -> SQLite).

### 2.3 Pure Domain & Validation Modules (`src/utils/`)
Decoupled pure functions covered by Node unit tests (`node --test src/utils/*.test.js`):
- `geneticAlgorithm.js`: Client-side GA timetable optimizer (tournament selection, crossover, mutation, hard/soft fitness scoring, Single-Day scope).
- `dataValidation.js`: Safe ID generation (`generateSafeId`), case-insensitive uniqueness validators, and real-time `recalculateScheduleConflicts()`.
- `dashboardMetrics.js`: Summary KPI aggregation, semester extraction, and department exam distribution builders.
- `singleDaySelection.js`: Enforces one-subject-per-department constraint, readiness validation, and CSV export formatting.
- `subsectionDivision.js`: Alphabetical first-name-primary student partitioning (`A–Z`) and CSV export.
- `seatingAllocator.js`: Capacity-aware multi-hall grid seating allocation.

---

## 3. Proxy & Backend Architecture

### 3.1 Node.js Server (`server.ts`)
- Spawns `python3 backend/server.py` on `BACKEND_PORT` (default `5000`).
- Strips RFC hop-by-hop request/response headers (`connection`, `keep-alive`, `transfer-encoding`, `content-length`, etc.) before forwarding `/api/*` via Node `fetch()` with startup `ECONNREFUSED` retry backoff (`fetchWithStartupRetry`).
- Mounts Vite middleware in development (`NODE_ENV !== 'production'`) or serves built `dist/` assets in production.

### 3.2 Python Backend (`backend/`)
- `backend/server.py`: Standard-library `HTTPServer` (`ExamGridRequestHandler`) providing REST endpoints, uniqueness validation (`409 Conflict`), cascading updates across dependent tables, conflict recalculation (`compute_schedule_conflicts`), and CSV export.
- `backend/database.py`: Initializes SQLite schema (`backend/examgrid.db`), safely runs additive schema migrations (`PRAGMA table_info` / `ALTER TABLE`), and seeds initial records strictly once using a `metadata` table (`seeded = '1'`).
- `backend/services/`: Server-side `genetic_algorithm.py`, `seating.py`, and `subsection.py`.
