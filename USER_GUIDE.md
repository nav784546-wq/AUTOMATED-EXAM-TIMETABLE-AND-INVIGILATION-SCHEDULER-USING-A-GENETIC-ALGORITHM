# Dashboard User Guide

Welcome to **ExamGrid GA — Automated Exam Timetable & Invigilation Scheduler**. This step-by-step guide explains how to log in, manage academic records, generate conflict-free exam schedules, allocate seating halls, and download reports—no technical background required.

---

## 1. Accessing and Logging In

1. Open your browser (Chrome or Edge recommended) and go to `http://localhost:3000` (or your organization's hosted URL).
2. On the **Login Screen**, choose one of three ways to enter:
   - **Email & Password**: Enter your administrator email and password, then click **Sign In**.
   - **Continue with Google**: Click **Continue with Google** and pick your institutional Google account in the popup window.
   - **Local Mode (`?autostart=1`)**: If running locally without cloud login configured, open `http://localhost:3000/?autostart=1` to launch immediately as the local Examination Controller.

### Resetting a Forgotten Password
1. On the Login Screen, click **Forgot Password?**.
2. Enter your registered email address and click **Send Reset Link**. (To prevent spam, requests have a 60-second cooldown, and reset links remain valid for 15 minutes.)
3. Open the link in your email. You will land on the **Reset Password** page (`/reset-password`).
4. Type a new password. The **Password Strength Meter** checks 5 rules in real time:
   - At least 8 characters
   - At least one uppercase letter (`A–Z`)
   - At least one lowercase letter (`a–z`)
   - At least one number (`0–9`)
   - At least one special character (e.g., `!@#$%`)
5. Re-enter the password in **Confirm Password**, click **Update Password**, and wait for automatic redirection back to Login.

---

## 2. Understanding the Dashboard Layout

- **Left Sidebar**: Lists all 12 workspace modules organized by workflow:
  1. **Overview** — Health metrics, charts, and the Student Cohort Conflict Heatmap.
  2. **GA Scheduler** — Automated Genetic Algorithm timetable generator.
  3. **Visual Exam Scheduler** — Department/grid timetable editor and structured Excel export.
  4. **Hall Seating** — Room capacity allocation, student seat lookup, and visual seat maps.
  5. **Conflict Report** — Detailed clash breakdown and invigilator override controls.
  6. **Departments** — Manage academic departments and class sections.
  7. **Subjects** — Manage exam courses, semester tags, and enrollment counts.
  8. **Halls** — Manage classrooms/halls, seating capacities, and availability.
  9. **Faculty** — Manage invigilators, duty caps, and leave status.
  10. **Manage Data** — Unified console for Students, Batches, Halls, Faculty, and Subjects.
  11. **Reports & Export** — Searchable master export hub.
  12. **Admin Management** — Manage administrator accounts and view System Audit Logs (Super Admin only).
- **Top Header & Notifications**: Displays your signed-in role badge (`Super Administrator` or `Administrator`), **Sign Out** button, and temporary **Undo** banners when you delete or modify items.

---

## 3. Managing Academic Records (Step-by-Step)

Before generating a timetable, ensure your academic data is up to date.

### Adding, Editing, and Deleting Records
1. **Departments (`Departments` tab)**:
   - Enter a department name and click **Add Department**.
   - Use the edit (pencil) icon to rename a department, or the trash icon to remove one (requires confirmation in the popup dialog).
2. **Subjects (`Subjects` tab)**:
   - Enter **Subject Code**, **Subject Name**, **Department**, **Semester**, and **Enrolled** student count, then click **Add Subject**.
   - Use the search bar or department dropdown to locate a subject, click **Edit** to update enrollment or semester, or click **Delete**.
3. **Examination Halls (`Halls` tab)**:
   - Add a **Hall Number** (e.g., `A-101`), **Building**, and **Seating Capacity**.
   - Click the status badge (`Available` / `Unavailable`) directly in the table to temporarily take a hall offline for maintenance without deleting it.
4. **Faculty Invigilators (`Faculty` tab)**:
   - Add **Employee ID**, **Full Name**, **Department**, **Email**, **Phone**, and **Max Duties**.
   - Click the status pill (`Available` / `On Leave`) to exclude faculty members who are on leave before scheduling.
5. **Students & Transfers (`Manage Data` → `Students & Batches` tab)**:
   - Use the **Department → Batch → Section** filters or the search box to find students.
   - To add a student, fill in **Registration Number**, **Full Name**, **Department**, **Batch**, and **Section**, then click **Register Student**.
   - To move a student to another section or batch, click **Transfer** on their row, change the fields inline, and click **Save**.

> **Tip:** Whenever you delete an item, a toast banner appears at the bottom with an **Undo** button in case you change your mind.

---

## 4. Generating an Automated Exam Timetable

### Option A: Using the GA Scheduler (`GA Scheduler` tab)
1. **Choose a Scheduling Scope**:
   - **Institution-Wide (All)**: Schedules every department and subject together.
   - **Department-Specific Scope**: Check only the departments, subjects, sections, or batches you want to schedule.
   - **Single-Day (1 Subject / Dept)**: Pick a single date and session (`BOTH`, `FN`, or `AN`), select one subject per department (or click **Auto-Select 1 per Dept**), and click **Finalize Single-Day Examination Schedule**.
2. **Configure Candidate Exam Dates**:
   - Under **Exam Date Pool**, add all valid examination dates (`YYYY-MM-DD`) and remove holidays.
3. **Adjust Algorithm & Gap Policies**:
   - Pick a preset (**Fast Preview**, **Balanced**, or **Deep Search**) or fine-tune **Population Size**, **Maximum Generations**, and **Mutation Rate**.
   - Set **Min Complete Gap Days** (default `2` days between exams for the same cohort) and check whether multiple departments may share dates or whether `FN` and `AN` exams are allowed on the same day.
   - Click **Save Configuration** to remember your settings.
4. **Run Optimization**:
   - Click **Generate Timetable**. Watch the live progress bar and **Fitness Convergence Chart**. You can click **Cancel** at any time.
   - Previous runs are saved in **Optimization Run History**, where you can click **Restore** to bring back an earlier result.

### Option B: Reviewing & Fine-Tuning (`Visual Exam Scheduler` & `Overview`)
1. Open **Visual Exam Scheduler** and switch between **Department-Wise View**, **Visual Date Grid** (`FN` vs. `AN`), or **Single-Day Subject Mode**.
2. To change an exam manually, edit its **Date**, **Session**, **Hall**, or **Invigilator** directly in the row. If a change creates a clash, the system flags it immediately—check **Authorize Override** only if you intentionally approve the exception.
3. Click **Confirm & Finalize Timetable** when satisfied.
4. On the **Overview** tab, inspect the **Student Cohort Conflict Heatmap**:
   - Click any yellow, orange, or red cell to view overlapping exams.
   - Use **Quick Fix Assistant** to view the top 3 conflict-free slot moves and click **Apply Quick Fix**, or click **Preview Auto-Resolve All** to fix all detectable overlaps in one step.

---

## 5. Allocating Examination Halls & Looking Up Seats

1. Open the **Hall Seating** tab.
2. Select an **Exam Date** and **Session** (`FN` or `AN`).
3. Check the **Departments** sitting for exams in that slot, choose a **Target Rule** (e.g., `50%` two-department split or `CUSTOM` capacities), set **Max Departments per Hall** (default `2`), and select available halls. (Halls already reserved for another exam in that slot are clearly marked.)
4. Click **Preview Hall Allocation** to calculate seat ranges automatically in ascending registration-number order.
5. Review the 4 result tabs:
   - **Combined Hall Report**: Hall-by-hall breakdown across departments.
   - **Dept-Wise Report**: Where each department's students are seated.
   - **Student Individual List**: Individual student seat assignments.
   - **Visual Seat Grid**: Color-coded seat layout map.
6. Click **Confirm & Save Hall Allocation** to lock in the plan.
7. **Quick Student Lookup**: Type any student's **Registration Number** in the lookup box to instantly see their hall, building, and seat number.

---

## 6. Generating Reports & Exporting Files

### Exporting the Exam Timetable to Excel (`.xlsx`)
1. Go to **Visual Exam Scheduler** (or **Reports & Export**).
2. In **Visual Exam Scheduler**, choose your **Export Scope** (`All Departments`, `Current View`, or `Selected Departments`).
3. Click **Export to Excel (.xlsx)**.
4. Open the downloaded `.xlsx` file in Microsoft Excel or LibreOffice Calc:
   - You will see a **Consolidated Timetable** sheet plus separate tabs for each department.
   - Dates are formatted clearly as **`DD-MM-YYYY`** with frozen column headers, borders, alternating row shading, and Excel filters ready to use.

### Exporting Hall Seating & General Reports
- **Hall Seating (`Hall Seating` tab)**: Click **Export PDF** (formatted printable notice boards), **Export Excel (.xlsx)** (4-sheet workbook), or **Print Report**.
- **Master Reports (`Reports & Export` tab)**: Filter by Department, Batch, Section, or Date, then click **Export to Excel (.xlsx)**, **Export CSV**, or **Print / PDF**.

---

## 7. Practical Example Workflow

1. **Setup**: Open **Departments** and **Halls** to verify all 6 departments and 6 halls are marked `Available`.
2. **Schedule**: Go to **GA Scheduler**, select **Balanced** preset, set **Min Complete Gap Days** to `2`, and click **Generate Timetable**.
3. **Verify**: Open **Overview** → **Student Cohort Conflict Heatmap**. Confirm there are zero red cells (or click **Preview Auto-Resolve All** → **Confirm & Apply All**).
4. **Finalize & Export**: Go to **Visual Exam Scheduler**, click **Confirm & Finalize Timetable**, then click **Export to Excel (.xlsx)** to distribute department-wise schedules.
5. **Seating**: Go to **Hall Seating**, select the first exam date + `FN`, select the scheduled departments, click **Preview Hall Allocation**, save it, and click **Export PDF** to post outside exam rooms.

---

## 8. Common Errors & How to Fix Them

| Message / Issue | Cause | How to Resolve |
|---|---|---|
| *"Email/Password sign-in is not enabled"* | Email/Password provider is turned off in Firebase Console. | Either click **Continue with Google**, use `?autostart=1` locally, or ask a Firebase admin to enable **Email/Password** under Firebase Console → Authentication → Sign-in method. |
| *"Invalid or expired password reset link"* | The reset link is older than 15 minutes or was already used. | Return to Login, click **Forgot Password?**, wait if the 60-second cooldown is active, and request a fresh link. |
| *"Wait X seconds before requesting another reset"* | Duplicate reset protection cooldown (60 seconds). | Wait for the countdown to finish before requesting another reset email. |
| Missing/skipped exam rows in Excel export warning | One or more scheduled exams lacked a valid date. | Open **Visual Exam Scheduler**, assign a valid date to the flagged exam(s), save, and re-export to Excel. |
| Hall shows *"Already reserved for this Date/Session"* | Another hall allocation already exists for that room in the same `FN`/`AN` slot. | Choose a different available hall or adjust the existing allocation for that date and session. |
| *"Access Restricted"* in **Admin Management** | Logged in as a standard `Administrator` instead of `Super Administrator`. | Ask a `Super Administrator` to update roles or review **Latest System Audit Logs**. |
| Changes not saving in offline preview | Python backend server (`port 5000`) is not running. | Ensure you started the app via `npm run dev` (check `LOCAL_SETUP.md`) so both Node and Python servers are running. |
