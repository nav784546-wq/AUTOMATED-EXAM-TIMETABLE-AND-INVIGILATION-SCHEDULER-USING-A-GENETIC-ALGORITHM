# Technical Requirements and Dependencies

This document lists the verified technologies, software tools, runtime dependencies, database components, and system requirements used by **ExamGrid GA — Automated Exam Timetable & Invigilation Scheduler**.

---

## 1. Technology Stack Overview

### Frontend
- **HTML5 & CSS3**: Entry document (`index.html`) and global Tailwind stylesheet (`src/index.css`).
- **JavaScript (ES Modules) & TypeScript**: React application written in `.jsx` and `.js` modules, with TypeScript type-checking (`tsc --noEmit`) and Node TypeScript runner (`tsx`).
- **React 19 (`react`, `react-dom`)**: Component-driven Single Page Application (SPA) with custom hooks (`useExamEntities`, `useScheduleState`, `useToastConfirm`, `useFocusTrap`).
- **React Router DOM (`react-router-dom`)**: Client-side routing for `/` (protected dashboard) and `/reset-password` (public password recovery route).
- **Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`, `autoprefixer`)**: Utility-first styling compiled through Vite.
- **Lucide React (`lucide-react`)**: Vector icon set across navigation, cards, modals, and toolbars.
- **Recharts (`recharts`)**: Interactive department exam distribution bar charts with semester filters and cross-filtering.
- **Motion (`motion`)**: Smooth UI animations and transitions.
- **Document Export Libraries**:
  - `exceljs`: Multi-worksheet department-wise exam timetable `.xlsx` generation with frozen headers, AutoFilters, zebra striping, borders, and validated `DD-MM-YYYY` date cells.
  - `xlsx`: Multi-sheet hall seating allocation `.xlsx` workbook export.
  - `jspdf` & `jspdf-autotable`: Formatted PDF report generation for hall allocations.

### Backend & Compute Runtime
- **Node.js (v22+) + Express (`express`)**: Primary HTTP server (`server.ts`) listening on port `3000`. Mounts Vite dev middleware (or serves built `dist/` files in production), executes server-side Genetic Algorithm optimization via Node `worker_threads` (`src/workers/gaNodeWorker.mjs` on `POST /api/ga/optimize`), spawns the Python backend process, and proxies `/api/*` requests to Python on port `5000`.
- **Python 3 (v3.11+ recommended)**:
  - **Primary API Server (`backend/server.py`)**: Runs on port `5000` using the **Python 3 Standard Library only** (`http.server`, `sqlite3`, `json`, `urllib.parse`, `uuid`, `hashlib`, etc.)—no third-party `pip` packages are required for standard `npm run dev` execution.
  - **Optional ASGI Server (`backend/main.py`)**: Alternative FastAPI entry point using `fastapi`, `uvicorn`, and `pydantic` (only needed if launching FastAPI standalone via `uvicorn backend.main:app`).

### Database & Authentication
- **Firebase Cloud Firestore & Firebase Authentication (`firebase`)**:
  - Cloud-hosted persistent storage (project `gen-lang-client-0697181413`, named Firestore database `ai-studio-examgridgaautoma-4a80c519-b532-471f-bdc3-a3be0e580ca6`) with role-based security rules defined in `firestore.rules`.
  - Authentication providers supported in code: **Email/Password** (must be enabled in Firebase Console → Authentication → Sign-in method) and **Google OAuth** (`signInWithPopup`).
  - **17 Firestore Collections**: `departments`, `batches`, `sections`, `subjects`, `halls`, `faculty`, `students`, `subsections`, `schedules`, `timetables`, `conflictReports`, `hallAllocations`, `optimizationRuns`, `system`, `users`, `administrators`, `auditLogs`.
- **SQLite (`backend/examgrid.db`)**:
  - Embedded relational database managed by `backend/database.py` using Python's built-in `sqlite3` module (zero external DB server installation required).
  - Acts as the automatic local database when unauthenticated (e.g., `?autostart=1` local preview mode) and mirrors Firestore persistence writes as well as storing server-side audit logs and password-reset tokens.
  - **19 SQLite Tables**: `departments`, `batches`, `sections`, `subjects`, `halls`, `faculty`, `students`, `subsections`, `schedules`, `timetables`, `conflict_reports`, `hall_allocations`, `optimization_runs`, `metadata`, `password_reset_requests`, `admin_identity_links`, `password_reset_audit_logs`, `admin_accounts`, `system_audit_logs`.

---

## 2. Development Tools

- **Visual Studio Code (VS Code)**: Recommended code editor and integrated terminal.
- **Git & GitHub**: Version control and repository cloning.
- **Node.js & npm**: JavaScript runtime, package manager, and build orchestration (`v22.x` recommended; workspace verified on `v22.23.5`).
- **Python 3 (`python3`)**: Executes the local API and SQLite persistence server (`v3.11+` recommended; workspace verified on `3.11.2`).
- **Vite (`vite`)**: Fast frontend dev server and production bundler.
- **ESLint (`eslint`) & TypeScript (`typescript`)**: Static linting (`@firebase/eslint-plugin-security-rules`) and type checking (`npm run lint`).

---

## 3. Project Dependencies

### 3.1 Node.js Runtime Dependencies (`package.json`)

| Package | Version | Purpose |
|---|---|---|
| `react` | `^19.0.1` | Core UI component library |
| `react-dom` | `^19.0.1` | DOM rendering for React 19 |
| `react-router-dom` | `^7.18.6` | Client-side routing (`/` and `/reset-password`) |
| `firebase` | `^13.2.0` | Firebase Authentication and Cloud Firestore SDK |
| `express` | `^4.21.2` | Node HTTP server, Vite middleware host, `/api/ga/optimize`, and backend proxy |
| `dotenv` | `^17.2.3` | Loads environment variables from `.env` |
| `vite` | `^8.3.0` | Frontend development bundler and production build tool |
| `@vitejs/plugin-react` | `^6.1.1` | Official Vite plugin for React JSX transformation |
| `@tailwindcss/vite` | `^4.3.3` | Tailwind CSS v4 Vite integration |
| `lucide-react` | `^0.546.0` | UI icon library |
| `recharts` | `^3.10.1` | Interactive charts for exam distribution analytics |
| `motion` | `^12.23.24` | UI transition and layout animations |
| `exceljs` | `^4.4.0` | Styled `.xlsx` timetable workbook generation with validated dates |
| `xlsx` | `^0.18.5` | Multi-sheet hall allocation Excel export |
| `jspdf` | `^4.2.1` | Client-side PDF generation for hall seating reports |
| `jspdf-autotable` | `^5.0.9` | Structured table layout plugin for `jspdf` |
| `eslint` | `^10.15.0` | Code quality and rules linting |
| `@firebase/eslint-plugin-security-rules` | `^0.0.2` | Firestore security rule linting support |
| `@google/genai` | `^2.4.0` | Declared SDK dependency in `package.json` (the active scheduler, conflict evaluator, and exports run deterministically without AI API calls) |

### 3.2 Node.js Development Dependencies (`package.json`)

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^7.0.2` | TypeScript compiler used by `npm run lint` (`tsc --noEmit`) |
| `tsx` | `^4.21.0` | Executes `server.ts` directly in TypeScript for `dev` and `start` |
| `tailwindcss` | `^4.3.3` | Tailwind CSS framework core |
| `autoprefixer` | `^10.4.21` | CSS vendor prefixing |
| `esbuild` | `^0.25.0` | Fast JS/TS bundler underlying Vite/tsx |
| `@types/node` | `^22.14.0` | Node.js TypeScript type definitions |
| `@types/react` | `^19.3.0` | React TypeScript type definitions |
| `@types/react-dom` | `^19.3.0` | React DOM TypeScript type definitions |
| `@types/express` | `^4.17.21` | Express TypeScript type definitions |

**Installation command (all Node dependencies):**
```bash
npm install
```

### 3.3 Optional Python Dependencies (`backend/requirements.txt`)

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | `>=0.110.0` | Optional ASGI web framework (`backend/main.py`) |
| `uvicorn[standard]` | `>=0.28.0` | ASGI server for running `backend/main.py` standalone |
| `pydantic` | `>=2.6.0` | Request/response validation schemas for FastAPI mode |

> **Note:** The default `npm run dev` command launches `backend/server.py`, which uses only Python 3's built-in standard library. You only need `pip install -r backend/requirements.txt` if you choose to run `backend/main.py` directly via `uvicorn`.

---

## 4. System Requirements

### Hardware
- **RAM**: Minimum **4 GB** (8 GB recommended for smooth browser + Vite + Python execution and large Genetic Algorithm populations).
- **Disk Space**: At least **500 MB** free space (for `node_modules`, Python runtime, and SQLite database growth).
- **Processor**: Dual-core 64-bit CPU or better (multi-core CPU benefits Web Worker and Node `worker_threads` GA execution).

### Operating System & Software Versions
- **Operating System**: Windows 10 or Windows 11 (64-bit), macOS, or Linux.
- **Node.js**: `v20.x` or `v22.x` LTS (tested on `v22.23.5`) with `npm`.
- **Python**: `3.10` or `3.11+` (tested on `3.11.2`), accessible via the `python3` command on `PATH` (see `LOCAL_SETUP.md` for Windows `python3` setup).

### Browser Compatibility
- Google Chrome (latest 2 versions) — recommended
- Microsoft Edge (latest 2 versions)
- Mozilla Firefox (latest 2 versions)
- Apple Safari (latest 2 versions)
- Web Workers and JavaScript must be enabled.

### Internet Connectivity Requirements
- **During Installation**: Internet access is required to run `npm install` (and optional `pip install`).
- **During Runtime**:
  - **Firebase Sign-In & Cloud Sync**: Requires active internet connectivity to reach Firebase Authentication and Cloud Firestore.
  - **Offline / Local Mode (`?autostart=1`)**: Once dependencies are installed, the dashboard, Genetic Algorithm, Excel/PDF exports, and local SQLite persistence (`backend/examgrid.db`) operate entirely on `localhost` without requiring external internet access.
