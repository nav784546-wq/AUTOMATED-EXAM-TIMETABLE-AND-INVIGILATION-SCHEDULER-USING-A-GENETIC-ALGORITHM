# ExamGrid GA — Documentation Index

**ExamGrid GA** is an automated examination timetable, hall allocation, subsection division, and faculty invigilation management platform powered by a Genetic Algorithm and backed by permanent Cloud Firestore and SQLite persistence.

---

## Documentation Directory

| Document | Description |
|---|---|
| [PRD.md](./PRD.md) | Product Requirements Document covering user personas, functional scope, and reliability guarantees. |
| [DESIGN.md](./DESIGN.md) | UI/UX design tokens, typography, color system, layout structure, and accessibility patterns. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System topology, React frontend modules, dual-layer persistence service, Express proxy, and Python engine. |
| [DATABASE.md](./DATABASE.md) | Cloud Firestore collections, hardened security rules, and SQLite relational schema. |
| [API.md](./API.md) | Complete REST API reference for `/api/*` endpoints. |

---

## Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Recharts, Lucide Icons
- **Server & Proxy**: Node.js, Express (`server.ts`, port `3000`)
- **Backend & Optimizer**: Python 3 (`backend/server.py`, port `5000`) + SQLite (`backend/examgrid.db`)
- **Cloud Database & Auth**: Firebase Authentication & Cloud Firestore (`firebase-applet-config.json`, `firestore.rules`)

---

## Local Development & Verification Commands

- **Install dependencies**: `npm install`
- **Run full-stack dev server**: `npm run dev` (starts Express on `:3000` and spawns Python backend on `:5000`)
- **Build production bundle**: `npm run build`
- **Type check**: `npm run lint` (`tsc --noEmit`)
- **Run unit tests**: `node --test src/utils/*.test.js`
- **Verify Python backend syntax**: `python3 -m py_compile backend/database.py backend/server.py backend/services/*.py`
