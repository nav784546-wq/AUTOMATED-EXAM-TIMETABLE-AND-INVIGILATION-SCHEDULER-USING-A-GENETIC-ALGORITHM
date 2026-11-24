# Database Schema & Security Specification — ExamGrid GA

ExamGrid GA uses **Cloud Firestore** (named database `ai-studio-examgridgaautoma-4a80c519-b532-471f-bdc3-a3be0e580ca6` in project `gen-lang-client-0697181413`) as its primary persistent cloud store and **SQLite** (`backend/examgrid.db`) as its persistent relational store for backend API operations.

---

## 1. Cloud Firestore Data Model (`firebase-blueprint.json`)

| Collection Path | Entity | Purpose & Key Fields |
|---|---|---|
| `/departments/{deptId}` | `Department` | `id`, `name`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` |
| `/batches/{batchId}` | `Batch` | `id`, `name`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` |
| `/sections/{sectionId}` | `Section` | `id`, `department`, `name`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt` |
| `/subjects/{subjectId}` | `Subject` | `id`, `code`, `name`, `department`, `batch`, `section`, `semester`, `enrolledCount`, audit fields |
| `/halls/{hallId}` | `Hall` | `id`, `hallNumber`, `building`, `capacity`, `available`, audit fields |
| `/faculty/{facultyId}` | `Faculty` | `id`, `employeeId`, `name`, `department`, `designation`, `email`, `phone`, `available`, `maxDuties`, audit fields |
| `/students/{studentId}` | `Student` | `id`, `regNo`, `name`, `department`, `section`, `batch`, `semester`, `enrolledSubjectIds[]`, audit fields |
| `/subsections/{subsectionId}` | `SubsectionAllocation` | `id`, `department`, `subsectionCount`, `totalStudents`, `assignments[]`, audit fields |
| `/schedules/{scheduleId}` | `Schedule` | `id`, `schedule[]`, `bestFitness`, `history[]`, `conflicts{}`, `convergedAtGeneration`, `executionTimeMs`, `scope`, audit fields |
| `/timetables/{timetableId}` | `Timetable` | `id`, `scheduleId`, `entries[]`, `scope`, audit fields |
| `/conflictReports/{reportId}` | `ConflictReport` | `id`, `scheduleId`, clash/violation counts, `utilizationRate`, `workloadStdDev`, `flaggedItems[]`, audit fields |
| `/system/{docId}` | `SystemState` | `initialized`, `updatedBy`, `updatedAt` (`system/bootstrap` prevents re-seeding; `system/connection` for health probe) |
| `/users/{userId}` | `UserProfile` | `uid`, `email`, `role` (`admin` \| `controller`), isolated per `request.auth.uid == userId` |

---

## 2. Firestore Security Rules (`firestore.rules`)

- **Default Deny**: `match /{document=**} { allow read, write: if false; }`
- **Account Gate (`isVerifiedAccount()`)**: Requires authenticated user with verified email (`email_verified == true`) or email/password provider (`sign_in_provider == 'password'`).
- **ID Validation (`isValidId`)**: All document IDs must match `^[a-zA-Z0-9_\-]+$` (1–128 chars).
- **Anti-Update-Gap Validators**: Standalone `isValid[Entity]` helpers enforce exact `hasAll` + `hasOnly` keys, data types, string lengths, numeric ranges, and `updatedBy == request.auth.uid`.
- **Immutable Audit Fields & Timestamps**: Updates enforce `incoming().id == existing().id`, immutable `createdBy`/`createdAt`, `updatedAt == request.time`, and strict `diff().affectedKeys().hasOnly(...)` allowlists.
- **PII Isolation**: `/users/{userId}` restricts `get`, `create`, and `update` strictly to `request.auth.uid == userId`.

---

## 3. SQLite Relational Schema (`backend/database.py`)

Stored persistently on disk at `backend/examgrid.db`.

| Table | Primary Key | Unique Constraints | Notes |
|---|---|---|---|
| `departments` | `id` | `name` | Cascading renames update `sections`, `subjects`, `faculty`, `students`, `subsections` |
| `batches` | `id` | `name` | Cascading renames update `students`, `subjects` |
| `sections` | `id` | `(department, name)` | Cascading renames update `students`, `subjects` |
| `subjects` | `id` | `code` | Stores `batch`, `section`, `semester`, `enrolled_count` |
| `halls` | `id` | `hall_number` | Stores `building`, `capacity`, `available` (`0` \| `1`) |
| `faculty` | `id` | `employee_id` | Stores `designation`, `email`, `phone`, `available`, `max_duties` |
| `students` | `id` | `reg_no` | Stores `enrolled_subject_ids` JSON array |
| `subsections` | `id` | — | Stores `assignments_json`, `subsection_count`, `total_students`, `created_at` |
| `schedules` | `id` | — | Stores `schedule_json`, `fitness`, `hard_conflicts`, `history_json`, `conflicts_json`, `scope` |
| `timetables` | `id` | — | Stores `schedule_id`, `entries_json`, `scope`, `updated_at` |
| `conflict_reports` | `id` | — | Stores violation breakdown, `utilization_rate`, `flagged_items_json`, `created_at` |
| `metadata` | `key` | `key` | Stores `seeded = '1'` so deleted records are never restored on restart |
