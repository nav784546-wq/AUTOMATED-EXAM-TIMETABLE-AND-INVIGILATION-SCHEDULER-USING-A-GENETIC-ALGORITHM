# REST API Reference — ExamGrid GA

All `/api/*` endpoints are proxied by Node.js Express (`server.ts` on port `3000`) to the Python backend (`backend/server.py` on port `5000`). Responses return `application/json` (except CSV download routes). Duplicate natural keys return HTTP `409 Conflict`; missing required fields return HTTP `400 Bad Request`.

---

## 1. Health & Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health probe returning `{"status": "ok"}`. |
| `GET` | `/api/overview/stats` | Returns record counts (`totalStudents`, `activeDepartments`, `totalFaculty`, `totalHalls`, `scheduledExams`). |

---

## 2. Departments, Batches & Sections

| Method | Endpoint | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/departments` | — | List all departments sorted by name. |
| `POST` | `/api/departments` | `{ name, initialSections? }` | Create department and optional initial sections (`409` on duplicate). |
| `PUT` | `/api/departments/:id` | `{ name }` | Rename department and cascade to sections, subjects, faculty, students, subsections. |
| `DELETE` | `/api/departments/:id` | — | Delete department and its sections. |
| `GET` | `/api/batches` | — | List all academic batches. |
| `POST` | `/api/batches` | `{ name }` | Create academic batch (`409` on duplicate). |
| `PUT` | `/api/batches/:id` | `{ name }` | Rename batch and cascade to students and subjects. |
| `DELETE` | `/api/batches/:id` | — | Delete batch record. |
| `GET` | `/api/sections` | `?department=...` | List sections (optionally filtered by department). |
| `POST` | `/api/sections` | `{ department, name }` | Create section (`409` if duplicate within department). |
| `PUT` | `/api/sections/:id` | `{ name }` | Rename section and cascade to students and subjects. |
| `DELETE` | `/api/sections/:id` | — | Delete section record. |

---

## 3. Subjects, Halls, Faculty & Students

| Method | Endpoint | Body / Query | Description |
|---|---|---|---|
| `GET` | `/api/subjects` | `?department=...` | List subjects ordered by `code`. |
| `POST` | `/api/subjects` | `{ code, name, department, batch, section, semester, enrolledCount }` | Create subject (`409` on duplicate `code`). |
| `PUT` | `/api/subjects/:id` | Subject fields | Update subject (`409` if updated `code` conflicts). |
| `DELETE` | `/api/subjects/:id` | — | Delete subject. |
| `GET` | `/api/halls` | — | List examination halls ordered by `hallNumber`. |
| `POST` | `/api/halls` | `{ hallNumber, building, capacity, available }` | Create hall (`409` on duplicate `hallNumber`). |
| `PUT` | `/api/halls/:id` | Hall fields | Update hall details or toggle `available`. |
| `DELETE` | `/api/halls/:id` | — | Delete hall. |
| `GET` | `/api/faculty` | — | List faculty ordered by `name`. |
| `POST` | `/api/faculty` | `{ employeeId, name, department, designation, email, phone, available, maxDuties }` | Create faculty (`409` on duplicate `employeeId`). |
| `PUT` | `/api/faculty/:id` | Faculty fields | Update faculty profile or availability. |
| `DELETE` | `/api/faculty/:id` | — | Delete faculty member. |
| `GET` | `/api/students` | `?department=...` | List students ordered by `regNo`. |
| `POST` | `/api/students` | `{ regNo, name, department, section, batch, semester, enrolledSubjectIds }` | Register student (`409` on duplicate `regNo`). |
| `PUT` | `/api/students/:id` | Student fields | Update student or transfer department/section/batch. |
| `DELETE` | `/api/students/:id` | — | Delete student record. |

---

## 4. Subsections, GA Scheduler, Timetables, Seating & Conflict Reports

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/subsections/latest` | — | Retrieve latest 20 saved subsection division snapshots. |
| `POST` | `/api/subsections/divide` | `{ department, subsectionCount, applyToDatabase }` | Compute alphabetical subsection split; when `applyToDatabase: true`, updates `students.section` and saves snapshot in `subsections`. |
| `GET` | `/api/scheduler/latest` | — | Retrieve latest persisted schedule, fitness history, conflicts, and scope. |
| `POST` | `/api/scheduler/run` | GA config (`populationSize`, `generations`, `mutationRate`, `crossoverRate`, `availableDates`, `scope`, `selectedSubjectIds`, etc.) | Run Python Genetic Algorithm, compute conflicts, and persist to `schedules`, `timetables`, and `conflict_reports`. |
| `POST` | `/api/scheduler/save` | `{ scheduleId, schedule, bestFitness, history, conflicts, scope }` | Persist a client-generated timetable, schedule, and conflict report. |
| `PUT` | `/api/scheduler/update-exam` | `{ examId, date, session, hallId, invigilatorId }` | Update a scheduled exam slot, recalculate conflicts, and update `schedules`, `timetables`, and `conflict_reports`. |
| `POST` | `/api/scheduler/override-faculty` | `{ examId, facultyId }` | Reassign invigilator for an exam slot, recalculate conflicts, and save updated report. |
| `GET` | `/api/conflict-reports/latest` | — | Retrieve latest saved conflict analysis report. |
| `POST` | `/api/conflict-reports` | `{ scheduleId, schedule, conflicts }` | Compute and store a conflict report snapshot. |
| `POST` | `/api/seating/generate` | `{ columnsPerRow }` | Generate capacity-aware hall seating grid across registered students and available halls. |
| `GET` | `/api/reports/timetable.csv` | — | Download latest saved timetable as UTF-8 BOM CSV. |
