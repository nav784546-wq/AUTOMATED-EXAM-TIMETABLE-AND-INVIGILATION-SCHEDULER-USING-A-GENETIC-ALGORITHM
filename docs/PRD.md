# Product Requirements Document (PRD) — ExamGrid GA

## 1. Product Overview

**ExamGrid GA** is an administrator-first examination management and timetable optimization web application for higher-education institutions. It automates conflict-free examination scheduling, hall capacity assignment, invigilator duty allocation, department-wise alphabetical subsection division, and seating plan generation using a Genetic Algorithm (GA), backed by persistent Cloud Firestore and SQLite storage.

---

## 2. Target Users & Personas

- **Controller of Examinations (Primary Administrator)**: Configures academic structures, registers subjects/halls/faculty/students, executes GA timetable optimization, reviews conflict reports, performs manual overrides, and exports official records.
- **Department Examination Coordinator**: Manages department-specific sections, student transfers, subsection rebalancing, and single-day subject selection per department.

---

## 3. Core Functional Requirements

### 3.1 Authentication & Access Control
- Protected administrator workspace via Firebase Authentication (`LoginScreen` + `ProtectedRoute`):
  - Google Sign-In (`signInWithPopup`).
  - Email & Password authentication (Sign In & Sign Up).
- Unauthenticated local/test preview support via `?autostart=1` query flag backed by SQLite persistence.
- Clean Sign Out flow via `AuthContext.logout()`.

### 3.2 Real-Time Overview Dashboard
- **Summary Strip (`DashboardSummary`)**: Displays live counts for Total Scheduled Exams, Available Classrooms (`available / total`), Pending Invigilations (highlighting unassigned, conflicted, or on-leave duties), Total Students, Active Departments, and Total Faculty.
- **Optimization Health Cards**: Hall Utilization percentage, Active Invigilators count with workload standard deviation, and Schedule Integrity (`0 Clashes` or violation count + fitness score).
- **Department Distribution Chart (`DashboardWidget`)**: Interactive Recharts bar chart showing scheduled exam distribution and enrolled student totals per department with semester filter controls (`All Semesters`, `Sem 1`, `Sem 3`, `Sem 5`, etc.).
- **Live Assignments Preview Table**: Quick view of scheduled exams with one-click navigation to full reports or optimizer re-run.

### 3.3 Genetic Algorithm (GA) Scheduler
- Configurable GA parameters: Population Size, Generations, Mutation Rate, Crossover Rate, and Examination Date Pool.
- Scheduling Scopes:
  - **All Subjects (`ALL`)**: Optimizes across all active departments and subjects.
  - **Filtered Selection (`SELECTED`)**: Scope by Departments, Courses/Subjects, Sections, and Batches.
  - **Single-Day Examination (`SINGLE_DAY`)**: Enforces **strictly 1 subject per department** on a single chosen date (`FN`, `AN`, or `BOTH`), preventing duplicate selections within a department and blocking finalization until all departments are covered.
- Exports Single-Day Subject Selection Summary to CSV (`buildSubjectSelectionSummaryCSV`).
- Visualizes GA fitness convergence curve over generations (`recharts`).

### 3.4 Visual Exam Scheduler & Manual Overrides
- Filter scheduled exams by Department, Subject, Batch, Section, and Date.
- View modes:
  - **Date Grid**: Calendar matrix grouped by Exam Date and Session (`FN 09:30–12:30`, `AN 14:00–17:00`).
  - **Department-Wise**: Grouped tables per department.
  - **Single-Day Selection**: Inline department-wise subject picker (`SingleDaySubjectSelector`).
- Inline editing of individual exam slots (Date, Session, Hall, Invigilator) with immediate database persistence and real-time conflict recalculation.
- CSV export (`downloadTimetableCSV`) and Print/PDF support.

### 3.5 Department-Wise Subsection Division
- Divides students within a selected department into configurable alphabetical `A–Z` subsections (first name primary, remaining names secondary) while preserving registration numbers.
- Highlights when rebalancing is needed (`Approve & Rebalance`) and persists approved subsection assignments and snapshots directly to the database.
- Supports CSV export (`buildSubsectionCSV`) and print view.

### 3.6 Hall Seating Arrangement
- Allocates students across available examination halls according to configured columns per row (`generateSeatingPlan` / `/api/seating/generate`), honoring hall seating capacities and preventing duplicate seat assignments.

### 3.7 Conflict Report & Faculty Overrides
- Tracks 4 hard constraint categories:
  1. **Student Clashes** (same department/cohort scheduled concurrently)
  2. **Invigilator Conflicts** (faculty double-booked in the same slot or marked On Leave)
  3. **Capacity Violations** (enrolled student count exceeds hall capacity)
  4. **Hall Double-Bookings** (same hall assigned to multiple exams in one slot)
- Allows instant manual faculty override per exam slot (`onOverrideFaculty`), recalculates conflicts, and supports saving explicit Conflict Report snapshots (`Save Conflict Report`).

### 3.8 Academic Entity Administration
Full CRUD with duplicate prevention and confirmation dialogs (`ConfirmDialog`) across:
- **Departments & Sections** (`DepartmentManagementView`, `EntityManagerView`): Add, cascading rename, delete.
- **Academic Batches** (`EntityManagerView`): Add, cascading edit, delete.
- **Subjects** (`SubjectManagementView`, `EntityManagerView`): Code, name, department, semester, enrolled count.
- **Halls** (`HallManagementView`, `EntityManagerView`): Hall number, building, capacity, availability toggle.
- **Faculty** (`FacultyManagementView`, `EntityManagerView`): Employee ID, name, department, contact details, max duties, availability toggle.
- **Students** (`EntityManagerView`): Registration number, name, department, section, batch, inline transfer/edit, delete.

---

## 4. Non-Functional Requirements

- **Permanent Persistence**: Zero reliance on transient React state or `sessionStorage`. All writes await database confirmation before updating UI state; startup hydrates from database without resetting deleted records to seed data.
- **Data Integrity**: Strict uniqueness enforcement (`regNo`, subject `code`, `hallNumber`, `employeeId`, department `name`, batch `name`, section `name` per department).
- **Error Transparency**: Failed writes surface descriptive error banners and preserve form inputs so user work is not lost.
- **No Browser Native Popups**: Uses in-app confirmation modals (`ConfirmDialog`) and notification banners rather than `window.alert`/`window.confirm`/`window.open`.
