# Project Structure Documentation

This document describes the folder hierarchy, entry points, source modules, configuration files, and database components of **ExamGrid GA — Automated Exam Timetable & Invigilation Scheduler**.

---

## 1. Root Directory Layout

```text
/
├── .env.example                 # Template for environment variables
├── .gitignore                   # Git exclusion rules (node_modules, dist, .env, etc.)
├── FEATURES.md                  # Detailed feature & module reference
├── LOCAL_SETUP.md               # Step-by-step Windows installation & run guide
├── PROJECT_STRUCTURE.md         # This directory & architecture guide
├── README.md                    # Main project overview and quick start
├── REQUIREMENTS.md              # Tech stack, exact dependency versions & system specs
├── USER_GUIDE.md                # Non-technical step-by-step dashboard manual
├── bun.lock                     # Lockfile artifact
├── eslint.config.js             # ESLint configuration (JS/JSX + Firebase rules)
├── firebase-applet-config.json  # Firebase project & Firestore database connection config
├── firebase-blueprint.json      # Firestore entity & schema blueprint specification
├── firestore.rules              # Cloud Firestore RBAC and data validation security rules
├── index.html                   # SPA HTML entry point (page title, meta tags, #root mount)
├── metadata.json                # Application metadata (name, description, capabilities)
├── package.json                 # Node.js scripts and npm dependency manifest
├── server.ts                    # Primary Node/Express entry point (port 3000)
├── tsconfig.json                # TypeScript compiler configuration
├── vite.config.ts               # Vite + React + Tailwind v4 configuration
├── backend/                     # Python API server, SQLite database & backend services
├── docs/                        # Reference architecture, PRD, API, and design docs
├── scripts/                     # Verification & utility scripts
└── src/                         # React frontend source code, workers, services & tests
```

---

## 2. Entry Points & Server Files

| File | Role |
|---|---|
| `index.html` | HTML5 shell loading `/src/main.jsx` into `<div id="root">`. |
| `src/main.jsx` | Frontend React entry point; wraps `App` inside `BrowserRouter` and `AuthProvider`. |
| `src/App.jsx` | Main router (`/`, `/reset-password`), `?autostart=1` handling, 13-tab sidebar layout, Undo/Confirm integration, and active view switching. |
| `server.ts` | Primary server entry point (`npm run dev` / `npm start`). Starts Express on port `3000`, mounts Vite dev middleware (or static `dist/` in production), handles `POST /api/ga/optimize` via Node `worker_threads`, spawns `python3 backend/server.py`, and proxies `/api/*` requests to port `5000`. |
| `backend/server.py` | Zero-dependency Python HTTP API server (port `5000`) serving CRUD endpoints, hall allocation, subsection division, password reset tokens, admin management, and system audit logs backed by SQLite. |
| `backend/main.py` | Optional FastAPI ASGI entry point mirroring backend routes (for use with `uvicorn` and `backend/requirements.txt`). |

---

## 3. Frontend Directories (`src/`)

### `src/contexts/`
- `AuthContext.js`: React Context exposing `currentUser`, `adminProfile`, `isSuperAdmin`, auth loading state, login/logout helpers, and password-reset action wrappers.

### `src/components/`
Core UI views and reusable widgets:
- **Authentication & Guards**:
  - `ProtectedRoute.jsx`: Guards the main dashboard route; renders `LoginScreen` unless authenticated or `?autostart=1` is active.
  - `LoginScreen.jsx`: Email/Password login, Google Sign-In popup, Forgot Password link, and Firebase `auth/operation-not-allowed` administrator note.
  - `src/components/auth/ForgotPassword.jsx`: Password reset request modal/view with 60-second duplicate-request cooldown and 15-minute reset token creation.
  - `src/components/auth/ResetPassword.jsx`: Public `/reset-password` screen validating Firebase `oobCode` + `resetToken`, showing `PasswordStrengthMeter`, calling `confirmPasswordReset`, logging audit records, and redirecting to login.
  - `src/components/auth/PasswordStrengthMeter.jsx`: Reusable 5-rule password complexity meter (length ≥ 8, uppercase, lowercase, number, special character) with segmented bar and status text.
- **Overview & Conflict Analytics**:
  - `OverviewDashboard.jsx`, `DashboardSummary.jsx`, `DashboardWidget.jsx`: 4 KPI cards, 4 metadata summary metrics, interactive Recharts bar chart with semester filter pills, and quick schedule table.
  - `ConflictHeatmapWidget.jsx`: Student cohort × date/session conflict matrix, severity legend, `Conflicts Only` filter, cell inspector, Quick Fix Assistant (top 3 minimal-disruption slot suggestions), and Preview Auto-Resolve All modal.
- **Scheduling & Optimization**:
  - `GASchedulerView.jsx`: Genetic Algorithm scheduler with 3 scope tabs (`Institution-Wide`, `Department-Specific`, `Single-Day`), live progress bar, SVG fitness convergence chart, constraint weights, department gap policy controls, verification summary, and optimization run history.
  - `GAConfigurationPanel.jsx`: Presets (`Fast Preview`, `Balanced`, `Deep Search`), numeric/slider controls for population size, generations, mutation/crossover rates, elitism, tournament size, early stop, candidate dates, and Web Worker vs. Server Worker selector.
  - `SingleDaySubjectSelector.jsx`: Department radio-selection UI for picking exactly one subject per department for single-day exams.
  - `ExamSchedulerView.jsx`: Visual Exam Scheduler supporting Department-Wise, Visual Date Grid (`FN`/`AN`), and Single-Day views, inline slot editing with override authorization, `Confirm & Finalize Timetable`, and Excel/CSV/Print exports.
  - `ConflictReportView.jsx`: Violation summary cards, parallel-department advisories, inline invigilator override controls, and conflict report persistence.
- **Hall Seating & Student Organization**:
  - `SeatingArrangementView.jsx`: Hall capacity allocation configurator, Best-Fit preview/save, student hall lookup by registration number, 4 report tabs (`Combined Hall Report`, `Dept-Wise Report`, `Student Individual List`, `Visual Seat Grid`), and PDF/Excel/Print exports.
  - `SubsectionDivisionView.jsx`: Alphabetical subsection division (`A`, `B`, `C`, ...) preserving registration numbers, duplicate/missing validation warnings, rebalance approval banner, and CSV/Print export.
- **Master Data & Exports**:
  - `DepartmentManagementView.jsx`, `SubjectManagementView.jsx`, `HallManagementView.jsx`, `FacultyManagementView.jsx`: Dedicated CRUD modules with search, filters, inline editing, availability toggles, and deletion confirmations.
  - `EntityManagerView.jsx`: Unified 4-tab master data console (`Students & Batches`, `Examination Halls`, `Faculty`, `Subjects & Exams`) with cascading Department → Batch → Section filters and inline student transfers.
  - `ReportsExportView.jsx`: Consolidated timetable search/filter view with Print/PDF, CSV, and multi-sheet Excel export.
- **Administration & Shared UI**:
  - `AdministratorManagementView.jsx`: Super Admin role/status management console and identity banner.
  - `SystemAuditLogsSection.jsx`: Filterable, paginated system audit log table with expandable JSON/metadata inspector and CSV export (Super Admin access only).
  - `ConfirmDialog.jsx`, `DashboardSkeleton.jsx`, `PaginationBar.jsx`: Accessible confirmation modal, loading skeleton, and pagination bar.

### `src/hooks/`
- `useExamEntities.js`: Manages master entity state (`departments`, `batches`, `sections`, `subjects`, `halls`, `faculty`, `students`, `subsections`) with Firestore/API loading and persistence.
- `useScheduleState.js`: Manages schedules, timetables, conflict reports, hall allocations, optimization runs, GA config, and rollback snapshots.
- `useToastConfirm.js`: Provides non-blocking toast notifications with Undo support and accessible confirmation dialog state.
- `useFocusTrap.js`: Keyboard focus trapping (`Tab` / `Escape`) inside modals.

### `src/services/`
- `api.js`: Fetch client wrappers for `/api/*` endpoints.
- `authService.js`: Firebase Auth operations (`signInWithEmailAndPassword`, Google popup, password reset confirmation) and admin role lookup.
- `auditService.js`: Client-side helper to record and query password reset and system audit log events.
- `persistenceService.js`: Dual-mode persistence layer saving to Cloud Firestore (when signed in) and mirroring to `/api/*` SQLite endpoints (or operating purely via `/api/*` when unauthenticated).

### `src/utils/` & `src/workers/`
- **Core Algorithms & Evaluators**:
  - `geneticAlgorithm.js`, `gaConfig.js`, `gaWorkerClient.js`: Pure JS Genetic Algorithm engine, configuration validator/presets, and worker dispatcher (`gaWorker.js` in browser or `/api/ga/optimize` on Node).
  - `seatingAllocator.js`: Best-Fit multi-hall seating allocation engine and student hall lookup.
  - `subsectionDivision.js`: Alphabetical student sorting and balanced subsection splitter.
  - `conflictEvaluator.js`, `conflictHeatmap.js`, `conflictQuickFix.js`: Schedule validation, cohort matrix computation, and atomic conflict quick-fix / auto-resolve logic.
  - `singleDaySelection.js`, `dashboardMetrics.js`, `dataValidation.js`, `seedData.js`.
- **Exports & Audit Utilities**:
  - `excelTimetableExport.js`: `exceljs` multi-sheet department timetable exporter with strict `DD-MM-YYYY` validation and Firebase Timestamp parsing.
  - `exportHallAllocation.js`: `xlsx` & `jspdf` exporters for hall seating allocations.
  - `exportReport.js`: CSV timetable & subsection exporters.
  - `auditLogs.js`, `authErrors.js`, `firestorePayload.js`, `sessionStyles.js`.
- **Unit Tests (`src/utils/*.test.js`)**:
  - 17 `node:test` unit test suites covering GA scheduling, date validation, Excel export formatting, seating allocation, conflict evaluation/quick-fix, heatmap, subsection division, audit logs, and auth helpers.

---

## 4. Backend Directory (`backend/`)

- `backend/database.py`: Initializes SQLite (`backend/examgrid.db`), creates all 19 tables, and seeds default departments, batches, sections, subjects, halls, faculty, students, and sample schedule data.
- `backend/models.py`: Data validation models and schemas.
- `backend/services/`:
  - `genetic_algorithm.py`: Python GA scheduling module.
  - `hall_allocation_service.py` & `seating.py`: Hall capacity & seating allocation services.
  - `subsection.py`: Subsection splitting service.
  - `exam_date_validation.py`: Server-side exam date validation service.
  - `password_reset_service.py`: Token issuance, 60-second cooldown, single-use expiry (15 min), and validation.
  - `audit_log_service.py`: Centralized recording and querying of `password_reset_audit_logs` and `system_audit_logs`.
- `backend/tests/`: Python `unittest` suites (`test_audit_log_service.py`, `test_exam_date_validation.py`, `test_hall_allocation_service.py`, `test_password_reset_service.py`).

---

## 5. Configuration, Firebase & Reference Files

- **`package.json` & `tsconfig.json`**: Define scripts (`dev`, `start`, `build`, `preview`, `clean`, `lint`) and TypeScript compiler options.
- **`vite.config.ts`**: Configures React plugin, Tailwind v4 plugin, and `DISABLE_HMR` flag support.
- **`eslint.config.js`**: ESLint configuration for React/JS and Firebase security rules.
- **`.env.example`**: Documents optional environment variables (`GEMINI_API_KEY`, `APP_URL`). Note that all scheduling, conflict checking, and export features work without external AI keys.
- **`firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules`**: Specify the Firebase project, named Firestore database ID, schema blueprint, and strict role-based security rules.
- **`src/firebase.js`**: Initializes Firebase App, Auth, and Firestore SDK using `firebase-applet-config.json`.
- **`docs/`**: Contains supplementary design and specification documents (`API.md`, `ARCHITECTURE.md`, `DATABASE.md`, `DESIGN.md`, `PRD.md`, `Readme.md`).
- **`scripts/verify_firebase_auth.mjs`**: Utility script to verify Firebase Authentication configuration.
