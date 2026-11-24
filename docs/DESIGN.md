# Design System & UX Specification — ExamGrid GA

## 1. Visual Identity & Aesthetic Direction

ExamGrid GA is designed as a crisp, high-clarity **Academic Operations Console** built with Tailwind CSS v4 (`@import "tailwindcss";`). The interface prioritizes dense tabular readability, unambiguous status hierarchy, and calm operational contrast over decorative clutter.

---

## 2. Color Palette

| Role | Token / Class | Usage |
|---|---|---|
| **App Canvas** | `bg-slate-50` | Main viewport background |
| **Card / Panel Surface** | `bg-white` with `border-slate-200` | Containers, tables, forms, modals |
| **Primary Brand / Action** | `bg-blue-700 hover:bg-blue-800` | Primary CTAs (`Run GA Scheduler`, `Save`, `Add`) |
| **Active Nav Highlight** | `bg-blue-50 text-blue-700` | Selected sidebar route |
| **Primary Ink** | `text-slate-900` | Headings, table primaries, KPI numbers |
| **Secondary Ink** | `text-slate-600` / `text-slate-500` | Labels, metadata, table subtext |
| **Success / Verified** | `emerald-50` / `emerald-200` / `emerald-700` | Conflict-free status, DB save confirmations |
| **Warning / Attention** | `amber-50` / `amber-200` / `amber-700` | On-leave faculty, rebalance prompts, pending duties |
| **Error / Violation** | `red-50` / `red-200` / `red-700` | Constraint conflicts, duplicate validation alerts, delete actions |

---

## 3. Typography

Defined in `src/index.css`:

- **Body & UI Controls**: `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`
- **Headings & Brand Display**: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif` (`.font-display`)
- **Codes, IDs, Dates & Metrics**: `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace` (`.font-mono` paired with `tabular-nums` for aligned columns and live KPIs)

---

## 4. Layout & Navigation Architecture

- **Persistent Left Sidebar (`w-64`, `shrink-0`)**:
  - Brand lockup (`ExamGrid GA` + `ShieldCheck` icon).
  - Single-click tab switching across 12 administrative modules (`Overview`, `GA Scheduler`, `Exam Scheduler`, `Seating Plan`, `Conflict Report`, `Subsection Division`, `Departments`, `Subjects`, `Halls`, `Faculty`, `Manage Data`, `Reports & Export`).
  - Bottom administrator profile block displaying signed-in email/title and `Sign Out` button.
- **Sticky Top Context Bar (`h-16`)**:
  - Breadcrumb header (`ExamGrid / <Active Page Title>`).
  - Global `Run GA Scheduler` primary trigger.
- **Main Content Area (`max-w-7xl mx-auto p-8`)**:
  - Top-level dismissible `role="alert"` notification banner for database confirmation or validation errors.
  - Responsive multi-column KPI strips (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` / `lg:grid-cols-4`).
  - Clean bordered data tables (`overflow-x-auto`) with inline editing controls.

---

## 5. Key Interaction Patterns

### 5.1 Confirmed Persistence Feedback
- Form submissions and inline edits disable or await async DB promises (`onAdd*`, `onUpdate*`, `onApprove*`).
- Inputs and edit states remain intact if a duplicate key or server error occurs so users can immediately fix their input.
- Success banners auto-dismiss after 4 seconds; error alerts persist until dismissed or superseded.

### 5.2 Destructive Action Guard (`ConfirmDialog`)
- All permanent deletions (Students, Departments, Batches, Sections, Subjects, Halls, Faculty) open a centered accessible modal (`role="dialog"`, `aria-modal="true"`) showing the exact target identifier and disabling action buttons with a spinner (`Loader2`) while the delete executes.

### 5.3 Print & Export Support
- `@media print` rules in `src/index.css` hide navigation sidebars, headers, and `.no-print` toolbars so timetables, seating layouts, and subsection rosters print cleanly on white paper.
- Standardized UTF-8 BOM CSV exports across Timetables, Single-Day Subject Summaries, and Subsection Rosters.
