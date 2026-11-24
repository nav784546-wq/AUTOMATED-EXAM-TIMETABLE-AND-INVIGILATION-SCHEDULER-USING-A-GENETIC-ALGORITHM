# Project Features Documentation

**ExamGrid GA — Automated Exam Timetable & Invigilation Scheduler** is an administrator dashboard for generating conflict-free examination schedules, optimizing faculty invigilation duties, allocating examination hall seating, dividing student cohorts into subsections, and exporting publication-ready reports.

---

## 1. User Roles, Authentication & Access Control

### Supported Roles
- **Super Administrator (`super_admin`)**: Full access to all scheduling, master data, exports, Administrator Management (create/promote/demote/suspend/remove admins), and the **Latest System Audit Logs** viewer.
- **Administrator / Examination Controller (`admin`)**: Full access to scheduling, conflict management, hall seating, master data, and reports; read-only notice on the Administrator Management role/audit controls.

### Authentication & Password Recovery Features
- **Login Screen (`LoginScreen.jsx`)**:
  - **Email & Password Sign-In**: Email input, password input, **Sign In** button. Displays actionable administrator setup notes if Firebase Email/Password sign-in is not yet enabled (`auth/operation-not-allowed`).
  - **Continue with Google**: One-click Google OAuth popup (`signInWithPopup`).
  - **Local Preview Bypass (`?autostart=1`)**: Appending `?autostart=1` to the URL starts a local Examination Controller session backed directly by SQLite without requiring cloud login.
- **Forgot Password (`ForgotPassword.jsx`)**:
  - Validates email, enforces a **60-second duplicate request cooldown**, generates a single-use **15-minute** reset tracking token (`password_reset_requests`), and triggers Firebase `sendPasswordResetEmail`.
- **Reset Password (`/reset-password`, `ResetPassword.jsx`)**:
  - Public route accepting Firebase `oobCode`, `mode`, and `resetToken` query parameters.
  - Verifies link validity before showing inputs, embeds the reusable **`PasswordStrengthMeter`** component (progress bar + 5 criteria: 8+ chars, uppercase, lowercase, number, special character + password confirmation match indicator), updates the password via `confirmPasswordReset`, consumes the reset token, writes an audit event, and redirects back to `/?reset=success`.

---

## 2. Dashboard Modules & Detailed Capabilities

### 2.1 Examination Control Overview (`overview`)
- **Primary KPI Cards**:
  1. `Schedule Integrity` (percentage of conflict-free scheduled exams).
  2. `Scheduled Exams` (count of generated/active exam slots).
  3. `Hall Utilization` (percentage of active classroom seating capacity used).
  4. `Pending Invigilations` (exams missing an assigned invigilator).
- **Metadata Summary Cards**: `Total Students`, `Active Departments`, `Total Faculty` (with duty distribution standard deviation $\sigma$), and `Available Classrooms`.
- **Interactive Analytics Chart**: Recharts bar chart (`Scheduled Exams Distribution by Department`) with **Semester Filter Pills** (`All Semesters`, `Sem 1`–`Sem 8`), clickable bars, and a `Quick Select` strip to cross-filter the schedule table.
- **Student Cohort Conflict Heatmap (`ConflictHeatmapWidget.jsx`)**:
  - Matrix plotting student cohorts (`Department · Batch · Semester` or `Department · Section`) against date + session (`FN`/`AN`) slots.
  - Color-coded cells: `clear` (0–1 exam), `warning` (parallel exams across disjoint sections marked `2*`), `conflict` (2 overlapping exams), `critical` (3+ overlapping exams).
  - Controls: **Conflicts Only** toggle, clickable cell detail inspector, **Quick Fix Assistant** (computes top 3 minimal-disruption alternative slots with **Apply Quick Fix**), and **Preview Auto-Resolve All** modal (**Confirm & Apply All** applies atomic multi-slot fixes).
- **Quick-View Schedule Table**: Search input, Department filter dropdown, **Locate in Heatmap** button per row, and navigation shortcuts to Visual Exam Scheduler and Conflict Report.

### 2.2 Genetic Algorithm Scheduler (`ga`)
- **3 Generation Scopes**:
  1. **Institution-Wide (All)**: Schedules all departments, courses, and sections together.
  2. **Department-Specific Scope**: Multi-select checkboxes for specific Departments, Courses/Subjects, Sections, and Batches.
  3. **Single-Day (1 Subject / Dept)** (`SingleDaySubjectSelector.jsx`): Radio-select exactly one subject per department, pick a target date and session (`BOTH`, `FN`, or `AN`), with **Auto-Select 1 per Dept**, **Clear All**, **Export Summary CSV**, and **Finalize Single-Day Examination Schedule** actions.
- **Genetic Algorithm Configuration Panel (`GAConfigurationPanel.jsx`)**:
  - **Quick Presets**: `Fast Preview`, `Balanced`, `Deep Search`, plus **Reset Defaults**.
  - **Core Hyperparameters**:
    - `Population Size` (10–300, default `40`)
    - `Maximum Generations` (10–500, default `50`)
    - `Mutation Rate` (1%–50%, default `12%`)
    - `Crossover Rate` (30%–100%, default `80%`)
    - `Elitism Count` (1–10, default `2`)
    - `Tournament k` (2–8, default `3`)
    - `Early Stop` stagnation generations (0–100, default `0`)
  - **Candidate Exam Dates Picker**: Add or remove valid `YYYY-MM-DD` examination dates.
  - **Execution Engine Toggle**: Switch between **Web Worker** (browser background thread via `gaWorker.js`) and **Server Worker** (Node.js `worker_threads` via `POST /api/ga/optimize`).
  - **Live Controls**: Workload estimator badge, live generation progress bar with **Cancel**, **Save Configuration**, and **Generate Timetable** button.
- **Constraint Rules & Optimization Weights**:
  - Sliders/inputs for `Hard Violation Penalty` (500–5000), `Faculty Fairness Weight` (0–60), `Same-Day Spread Penalty` (0–100), and `Hall Utilization Weight` (0–5).
  - Toggles: `Enforce Faculty Max-Duties Limit`, `Penalize Multiple Exams per Cohort on Same Date`.
- **Department-Wise Date Allocation & Gap Policy**:
  - `Min Complete Gap Days` (0–7, default `2`).
  - Policy checkboxes: `One examination per department per day`, `Department-wise independent scheduling`, `Allow FN & AN exams on same day within a department`, and `Allow different departments on the same date`.
- **Outputs**: SVG **Fitness Convergence Chart** (Best Fitness vs. Average Fitness per generation), 6 **Constraint Verification Summary** cards, and **Optimization Run History** with **Restore** and **Delete** buttons.

### 2.3 Visual Exam Scheduler (`exam-scheduler`)
- **View Modes**:
  - **Department-Wise View**: Groups examinations cleanly by department.
  - **Visual Date Grid**: Calendar matrix comparing `FN` (Forenoon) and `AN` (Afternoon) sessions per date.
  - **Single-Day Subject Mode**: Dedicated view for single-day departmental exams.
- **Filtering & Editing**:
  - Filter by Department, Batch, Date, and Conflicts Only.
  - Inline edit Date, Session (`FN`/`AN`), Hall, and Invigilator with real-time conflict checking and optional **Authorize Override** checkbox.
  - **Confirm & Finalize Timetable** action persists the finalized schedule.
- **Structured Excel Export (`excelTimetableExport.js`)**:
  - Export Scope selector (`ALL` departments, `CURRENT` filtered view, or `SELECTED` multi-checkbox departments).
  - **Date Validation Layer**: Parses `Date` objects, Firebase Timestamps (`toDate()` / `{seconds}`), ISO strings, and `DD-MM-YYYY` strings without UTC timezone drift. Logs explicit warnings and excludes rows with missing or `Invalid Date` values so workbooks are never corrupted.
  - **Workbook Structure**: Generates a `Consolidated Timetable` sheet plus individual department worksheets with institution/title header block, bold styled header row, frozen header row (row 5), AutoFilter enabled, visible borders, alternating row shading, real Excel Date serials formatted as `DD-MM-YYYY`, and center/left alignments.
  - Also includes **Export CSV** (`exportReport.js`) and **Print** actions.

### 2.4 Hall Seating Arrangement (`seating`)
- **Configuration Inputs**: `Exam Date`, `Session` (`FN`/`AN`), Department checkboxes, Allocation Target Rule (`50%`, `PERCENTAGE`, or `CUSTOM` per department/hall), `Max Departments per Hall` (default `2`), eligible Hall checkboxes (flags halls already booked for that date/session), and `Columns per Row` for seat grids.
- **Best-Fit Allocation Engine (`seatingAllocator.js`)**:
  - Groups students in ascending registration-number order (preserving leading zeros), minimizes wasted seats, consolidates remainders, and enforces maximum departments per hall.
  - Actions: **Preview Hall Allocation** and **Confirm & Save Hall Allocation**.
- **Student Hall Lookup**: Search by student Registration Number (`lookupStudentHallAllocation`) to immediately display assigned hall, building, seat number, and department.
- **4 Report Tabs**: `Combined Hall Report`, `Dept-Wise Report`, `Student Individual List` (paginated), and `Visual Seat Grid` (color-coded seat occupancy map).
- **Exports**: **Export PDF** (`jspdf` + `jspdf-autotable`), **Export Excel (.xlsx)** (`xlsx` 4-sheet workbook: `Summary`, `Dept-Wise Allocation`, `Combined Hall Report`, `Student Individual List`), and **Print Report**.

### 2.5 Conflict Report & Overrides (`conflicts`)
- Displays 6 violation KPI cards (student overlaps, hall double-bookings, capacity overflows, faculty double-bookings, faculty max-duty violations, and gap-policy violations).
- Displays policy and parallel-department advisories, **Show Conflicts Only / Show All Exams** toggle, inline invigilator override selector, and **Save Conflict Report**.

### 2.6 Subsection Division (`subsections`)
- Select a Department and target `Subsections` count (1–10 → `A`, `B`, `C`, …).
- Automatically sorts students alphabetically by registration number (preserving leading zeros), splits into balanced groups, flags duplicate/missing registration numbers, offers an **Approve & Rebalance** banner, and exports to **CSV** or **Print**.

### 2.7 Master Data Modules (`departments`, `subjects`, `halls`, `faculty`, `entities`)
- **Departments**: Add departments with initial sections, rename/delete departments (guarded against deleting the last department), and add/rename/delete sections with confirmation dialogs and **Undo** toast support.
- **Subjects**: Create, search, filter by department, inline edit (`Code`, `Name`, `Department`, `Semester`, `Enrolled`), and delete.
- **Halls**: Create, search, filter by status, click-to-toggle `Available`/`Unavailable`, inline edit (`Hall Number`, `Building`, `Seating Capacity`), and delete while tracking total active seating capacity.
- **Faculty**: Create, search, filter by department/status, click-to-toggle `Available`/`On Leave`, inline edit (`Employee ID`, `Full Name`, `Department`, `Email`, `Phone`, `Max Duties`), and delete.
- **Manage Data (`EntityManagerView`)**: Unified 4-tab view (`Students & Batches`, `Examination Halls`, `Faculty`, `Subjects & Exams`) with cascading Department → Batch → Section filters, paginated student table, new student registration, inline student **Transfer** (update regNo, name, department, batch, or section), and batch/section management.

### 2.8 Reports & Export (`reports`)
- Consolidated searchable and filterable (`Department`, `Batch`, `Section`, `Date`) master timetable table showing Conflict/Verified status badges and one-click **Print / PDF**, **Export CSV**, and **Export to Excel (.xlsx)** actions.

### 2.9 Administrator Management & Audit Logs (`admin-management`)
- **Administrator Account Controls (Super Admin only)**:
  - **Add Administrator** form (`Full Name`, `University Email`, `Access Role`: `admin` or `super_admin`).
  - Toggle role (**Make Super Admin** / **Set Admin**), toggle account status (**Suspend** / **Activate**), or **Remove** administrator (self-modification blocked for safety).
- **Latest System Audit Logs (`SystemAuditLogsSection.jsx`, Super Admin only)**:
  - 4 KPI cards (`Total Audit Events`, `Last 24 Hours`, `Successful Actions`, `Failed or Denied`).
  - Filter by **Category**, **Outcome**, and free-text **Search** with 15-row pagination.
  - Click any row to expand **Event Record Details** (`Source`, `Actor UID`, `Target Resource`, `Client IP`, and sanitized metadata).
  - Actions: **Refresh** and **Export CSV**.

---

## 3. Algorithms & Database Management

- **Genetic Algorithm Engine (`geneticAlgorithm.js` & `gaNodeWorker.mjs`)**: Evolves candidate exam schedules using tournament selection, crossover, mutation, elitism, hard-constraint penalties, faculty duty balancing, same-day cohort spread penalties, and configurable department gap-day policies.
- **Dual Persistence Layer (`persistenceService.js`)**:
  - **Cloud Firestore** when signed in via Firebase Authentication (with RBAC security rules in `firestore.rules`).
  - **Local SQLite (`backend/examgrid.db`)** via Python API (`backend/server.py`) for zero-config local execution, automatic write mirroring, password reset tracking, and system audit logs.
- **Safety UX**: Destructive edits/deletions trigger accessible modal confirmations (`ConfirmDialog`) and non-blocking Undo toasts (`useToastConfirm`).
