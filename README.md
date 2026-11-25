# ExamGrid GA — Automated Exam Timetable & Invigilation Scheduler

**ExamGrid GA** is a full-stack administrator dashboard built to automate conflict-free university examination timetabling, optimize faculty invigilation duties, plan multi-department hall seating arrangements, and export formatted Excel, PDF, and CSV reports.

---

## 1. Project Objectives

- Eliminate student examination clashes, classroom double-bookings, and hall capacity overflows automatically.
- Balance invigilation workloads fairly across available faculty members while respecting max-duty limits and leave statuses.
- Support flexible scheduling modes: institution-wide timetables, department-specific subsets, and single-day departmental exams.
- Provide instant visual conflict analytics (cohort heatmap + one-click/auto-resolve fixes) and fine-grained manual override controls.
- Generate publication-ready, department-wise Excel (`.xlsx`), PDF, and CSV reports with validated `DD-MM-YYYY` examination dates.

---

## 2. Key Features

- **Genetic Algorithm Exam Scheduler**: Configurable population size, generations, mutation/crossover rates, elitism, tournament selection, hard/soft penalty weights, department gap-day policies, live convergence chart, and background execution via Browser Web Workers or Node `worker_threads`.
- **Visual Exam Scheduler & Structured Excel Export**: Department-wise, Visual Date Grid (`FN`/`AN`), and Single-Day views with inline editing, override authorization, pre-export date validation, and multi-worksheet `.xlsx` reports (`exceljs`).
- **Student Cohort Conflict Heatmap & Quick-Fix Assistant**: Interactive cohort × date/session conflict matrix with severity levels, top-3 minimal-disruption slot suggestions, and atomic **Auto-Resolve All**.
- **Hall Seating Allocation & Visual Seat Maps**: Best-Fit multi-hall seating preserving ascending registration numbers, student seat lookup, visual seat grids, and 4-sheet `.xlsx` / PDF exports.
- **Master Data & RBAC Administration**: Full CRUD for Departments, Sections, Batches, Subjects, Halls, Faculty, and Students; Firebase Authentication (Email/Password + Google), secure `/reset-password` flow with `PasswordStrengthMeter`, and Super Admin **Latest System Audit Logs**.

---

## 3. Technologies Used

- **Frontend**: React 19, Vite 8, React Router DOM 7, Tailwind CSS v4, Recharts, Lucide React, Motion
- **Exports**: `exceljs`, `xlsx`, `jspdf`, `jspdf-autotable`
- **Middleware / Compute Server**: Node.js (v22+), Express 4, TypeScript (`tsx`), Node `worker_threads`
- **Backend API**: Python 3 (`http.server` standard library in `backend/server.py`; optional FastAPI ASGI entry point in `backend/main.py`)
- **Databases & Auth**: Cloud Firestore + Firebase Authentication (`firebase` SDK) and local SQLite (`backend/examgrid.db`)

---

## 4. System Requirements

- **OS**: Windows 10/11 (64-bit), macOS, or Linux
- **RAM**: Minimum 4 GB (8 GB recommended)
- **Software**: Node.js `v20+` (`v22 LTS` recommended), Python `3.10+` (`3.11+` recommended, available as `python3` on `PATH`), Git
- **Browser**: Modern Chrome, Edge, Firefox, or Safari

---

## 5. Installation & Local Execution

1. **Clone the repository & install Node dependencies**:
   ```bash
   git clone <REPOSITORY_URL>
   cd <REPOSITORY_FOLDER>
   npm install
   ```
2. **Prepare environment variables**:
   ```bash
   cp .env.example .env
   ```
   *(On Windows Command Prompt, use `copy .env.example .env`. Make sure `python3` resolves on your Windows `PATH`—see [LOCAL_SETUP.md](./LOCAL_SETUP.md).)*
3. **Start the full-stack development server**:
   ```bash
   npm run dev
   ```
4. **Open in your browser**:
   - **Authenticated Login**: `http://localhost:3000`
   - **Local SQLite Preview Mode**: `http://localhost:3000/?autostart=1`

### Useful Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Starts Express + Vite (port `3000`) and spawns Python SQLite API (port `5000`) |
| `npm run build` | Builds the production frontend bundle into `dist/` |
| `npm start` | Runs the server (`tsx server.ts`) |
| `npm run lint` | Runs TypeScript checks (`tsc --noEmit`) |
| `node --test src/utils/*.test.js` | Runs frontend algorithm and export unit tests |
| `python3 -m unittest discover -s backend/tests` | Runs Python backend unit tests |

---

## 6. Dashboard Usage & Database Overview

- Navigate through the 12 sidebar tabs (**Overview**, **GA Scheduler**, **Visual Exam Scheduler**, **Hall Seating**, **Conflict Report**, **Departments**, **Subjects**, **Halls**, **Faculty**, **Manage Data**, **Reports & Export**, and **Admin Management**).
- **Dual Persistence**: When signed in via Firebase Authentication, changes sync to Cloud Firestore (17 collections protected by `firestore.rules`) and mirror to the local Python API. When running locally via `?autostart=1`, data persists directly in `backend/examgrid.db` (19 SQLite tables seeded with sample academic data on first launch).

---

## 7. Complete Documentation Index

| Document | Description |
|---|---|
| [FEATURES.md](./FEATURES.md) | Complete module-by-module feature specification, inputs, actions, algorithms, and RBAC details |
| [USER_GUIDE.md](./USER_GUIDE.md) | Non-technical step-by-step instructions, workflows, export guides, and error troubleshooting |
| [LOCAL_SETUP.md](./LOCAL_SETUP.md) | Detailed Windows setup, `python3` PATH configuration, VS Code workflow, and troubleshooting |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | Full list of frontend/backend technologies, exact dependency versions, and system requirements |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | Annotated folder hierarchy, entry points, services, hooks, workers, and configuration files |
