import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  Search,
  FilterX,
  Pencil,
  Crosshair,
  Eye,
  X,
  Clock,
  Loader2,
  Users,
} from 'lucide-react';
import { DashboardSummary } from './DashboardSummary.jsx';
import { DashboardWidget } from './DashboardWidget.jsx';
import { ConflictHeatmapWidget } from './ConflictHeatmapWidget.jsx';
import { PaginationBar } from './PaginationBar.jsx';
import { computeDashboardSummary } from '../utils/dashboardMetrics.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { getSessionBadgeClasses } from '../utils/sessionStyles.js';

const SESSIONS = ['FN (09:30 - 12:30)', 'AN (14:00 - 17:00)'];

function isAssignmentPending(row, facultyById) {
  const invId = row.invigilatorId || row.facultyId;
  if (!invId || !row.invigilatorName || row.invigilatorName === 'N/A') return true;
  if (row.hasInvigilatorConflict) return true;
  const fac = facultyById.get(invId);
  if (fac && !fac.available) return true;
  return false;
}

function hasAssignmentConflict(row) {
  return Boolean(
    row.hasStudentClash ||
      row.hasInvigilatorConflict ||
      row.hasCapacityIssue ||
      row.hasHallDoubleBooking ||
      row.hasDepartmentDateViolation ||
      row.hasDepartmentGapViolation ||
      row.hasDepartmentIndependenceViolation
  );
}

function QuickEditExamModal({
  exam,
  halls,
  faculty,
  saving,
  errorMessage,
  allowOverride,
  onToggleOverride,
  onSave,
  onClose,
}) {
  const [date, setDate] = useState(exam?.date || '');
  const [session, setSession] = useState(exam?.session || SESSIONS[0]);
  const [hallId, setHallId] = useState(exam?.hallId || '');
  const [invigilatorId, setInvigilatorId] = useState(
    exam?.invigilatorId || exam?.facultyId || ''
  );

  useEffect(() => {
    if (!exam) return;
    setDate(exam.date || '');
    setSession(exam.session || SESSIONS[0]);
    setHallId(exam.hallId || '');
    setInvigilatorId(exam.invigilatorId || exam.facultyId || '');
  }, [exam]);

  const modalRef = useFocusTrap({
    isOpen: Boolean(exam),
    onClose: () => {
      if (!saving) onClose();
    },
  });

  if (!exam) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(
      exam.examId,
      {
        date,
        session,
        hallId,
        invigilatorId,
      },
      { allowOverride }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-edit-exam-title"
        tabIndex={-1}
        data-testid="quick-edit-exam-modal"
        className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-xl focus:outline-none"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 id="quick-edit-exam-title" className="text-base font-semibold text-slate-900">
              Quick Edit Assignment
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {exam.subjectCode} · {exam.subjectName}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close quick edit dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label htmlFor="qe-date" className="block font-medium text-slate-700 mb-1">
              Exam Date
            </label>
            <input
              id="qe-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="qe-session" className="block font-medium text-slate-700 mb-1">
              Session
            </label>
            <select
              id="qe-session"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {SESSIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="qe-hall" className="block font-medium text-slate-700 mb-1">
              Examination Hall
            </label>
            <select
              id="qe-hall"
              value={hallId}
              onChange={(e) => setHallId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {halls.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.hallNumber} ({h.building}, Cap: {h.capacity}){h.available === false ? ' [Unavailable]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="qe-invigilator" className="block font-medium text-slate-700 mb-1">
              Assigned Invigilator
            </label>
            <select
              id="qe-invigilator"
              value={invigilatorId}
              onChange={(e) => setInvigilatorId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Unassigned</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.department}){f.available === false ? ' [On Leave]' : ''}
                </option>
              ))}
            </select>
          </div>

          {errorMessage && (
            <div
              data-testid="quick-edit-error-banner"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 space-y-2"
            >
              <div className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(allowOverride)}
                  onChange={(e) => onToggleOverride?.(e.target.checked)}
                  className="rounded text-red-700"
                />
                <span>Authorize policy override for this edit</span>
              </label>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="quick-edit-save-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Assignment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExamDetailsModal({ exam, students = [], onClose }) {
  const modalRef = useFocusTrap({
    isOpen: Boolean(exam),
    onClose,
  });

  const matchingStudents = useMemo(() => {
    if (!exam) return [];
    const byEnrolled = students.filter(
      (st) => Array.isArray(st.enrolledSubjectIds) && st.enrolledSubjectIds.includes(exam.subjectId)
    );
    if (byEnrolled.length > 0) return byEnrolled;
    return students.filter((st) => {
      if (exam.department && st.department !== exam.department) return false;
      if (exam.batch && st.batch && st.batch !== exam.batch) return false;
      if (exam.section && st.section && st.section !== exam.section) return false;
      return true;
    });
  }, [exam, students]);

  if (!exam) return null;

  const hasIssue = hasAssignmentConflict(exam);
  const issues = [];
  if (exam.hasStudentClash) issues.push('Student cohort timetable clash');
  if (exam.hasInvigilatorConflict) issues.push('Invigilator unavailable or double-booked');
  if (exam.hasCapacityIssue) issues.push('Enrolled students exceed hall seating capacity');
  if (exam.hasHallDoubleBooking) issues.push('Examination hall double-booked in this slot');
  if (exam.hasDepartmentDateViolation)
    issues.push('Multiple examinations scheduled in same department on this calendar date');
  if (exam.hasDepartmentGapViolation)
    issues.push('Minimum gap days between consecutive examinations of this department violated');
  if (exam.hasDepartmentIndependenceViolation)
    issues.push('Multiple departments scheduled on the same date (disallowed by active policy)');

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-details-title"
        tabIndex={-1}
        data-testid="exam-details-modal"
        className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[86vh] flex flex-col shadow-xl focus:outline-none"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h3 id="exam-details-title" className="text-base font-semibold text-slate-900">
              {exam.subjectCode} · {exam.subjectName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {exam.department}
              {exam.batch ? ` · Batch ${exam.batch}` : ''}
              {exam.semester ? ` · Sem ${exam.semester}` : ''}
              {exam.section ? ` · ${exam.section}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close exam details dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Scheduled Slot</div>
              <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {exam.date} · {exam.session}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Assigned Hall &amp; Occupancy</div>
              <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {exam.hallNumber} ({exam.enrolledCount} / {exam.hallCapacity} seats)
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Invigilator</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {exam.invigilatorName || 'Unassigned'}
                {exam.invigilatorDept ? ` · ${exam.invigilatorDept}` : ''}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Constraint Status</div>
              <div className="mt-0.5">
                {hasIssue ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5" /> Conflict Detected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified Slot
                  </span>
                )}
              </div>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 space-y-1">
              <div className="font-semibold">Active Violations:</div>
              {issues.map((msg) => (
                <div key={msg} className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-700" />
                Matching Student Roster ({matchingStudents.length})
              </span>
              {matchingStudents.length > 50 && (
                <span className="text-slate-500">Showing first 50 students</span>
              )}
            </div>
            {matchingStudents.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                No individual student records matched this subject/cohort. Enrolled count: {exam.enrolledCount}.
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-3">Reg. No</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Batch · Section</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchingStudents.slice(0, 50).map((stu) => (
                      <tr key={stu.id}>
                        <td className="py-1.5 px-3 font-mono text-slate-800">{stu.regNo}</td>
                        <td className="py-1.5 px-3 text-slate-900">{stu.name}</td>
                        <td className="py-1.5 px-3 text-slate-600">
                          Batch {stu.batch} · {stu.section}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 flex justify-end rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export const OverviewDashboard = ({
  gaResult,
  halls,
  faculty,
  students,
  departments,
  departmentRecords = [],
  subjects = [],
  policy = {},
  availableDates = [],
  isGARunning = false,
  onRunGA,
  onUpdateScheduledExam,
  onBatchApplyQuickFix,
  onNavigate,
}) => {
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [locateCellRequest, setLocateCellRequest] = useState(null);
  const [quickEditExam, setQuickEditExam] = useState(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [quickEditError, setQuickEditError] = useState('');
  const [quickEditAllowOverride, setQuickEditAllowOverride] = useState(false);
  const [detailsExam, setDetailsExam] = useState(null);

  const facultyById = useMemo(
    () => new Map(faculty.map((f) => [f.id, f])),
    [faculty]
  );

  const summaryStats = useMemo(
    () =>
      computeDashboardSummary({
        schedule: gaResult.schedule,
        halls,
        faculty,
        students,
        departments,
      }),
    [gaResult.schedule, halls, faculty, students, departments]
  );

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return gaResult.schedule.filter((row) => {
      if (selectedDepartment !== 'ALL' && row.department !== selectedDepartment) {
        return false;
      }

      const hasConflict = hasAssignmentConflict(row);
      const isPending = isAssignmentPending(row, facultyById);

      if (statusFilter === 'CONFLICT' && !hasConflict) return false;
      if (statusFilter === 'PENDING' && !isPending) return false;
      if (statusFilter === 'VERIFIED' && (hasConflict || isPending)) return false;

      if (!q) return true;
      return (
        String(row.subjectName || '').toLowerCase().includes(q) ||
        String(row.subjectCode || '').toLowerCase().includes(q) ||
        String(row.hallNumber || '').toLowerCase().includes(q) ||
        String(row.invigilatorName || '').toLowerCase().includes(q) ||
        String(row.department || '').toLowerCase().includes(q)
      );
    });
  }, [gaResult.schedule, selectedDepartment, statusFilter, searchQuery, facultyById]);

  useEffect(() => {
    setPage(1);
  }, [selectedDepartment, statusFilter, searchQuery]);

  const paginatedAssignments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, page, pageSize]);

  const handleLocateInHeatmap = (row) => {
    setLocateCellRequest({
      examId: row.examId,
      slotKey: `${row.date}|${row.session}`,
      nonce: Date.now(),
    });
    const el = document.querySelector('[data-testid="conflict-heatmap-widget"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSaveQuickEdit = async (examId, updates, opts = {}) => {
    if (!onUpdateScheduledExam) return;
    setQuickEditSaving(true);
    setQuickEditError('');
    try {
      const ok = await onUpdateScheduledExam(examId, updates, {
        allowOverride: Boolean(opts.allowOverride),
        onValidationError: (msg) => setQuickEditError(msg || 'Invalid assignment update.'),
      });
      if (ok !== false) {
        setQuickEditExam(null);
        setQuickEditError('');
        setQuickEditAllowOverride(false);
      }
    } finally {
      setQuickEditSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Consolidated Primary 4-KPI Row + Compact Metadata Strip */}
      <DashboardSummary
        totalStudents={summaryStats.totalStudents}
        activeDepartments={summaryStats.activeDepartments}
        scheduledExams={summaryStats.totalScheduledExams}
        totalFaculty={summaryStats.totalFaculty}
        availableClassrooms={summaryStats.availableClassrooms}
        totalClassrooms={summaryStats.totalClassrooms}
        pendingInvigilations={summaryStats.pendingInvigilations}
        hallUtilizationRate={gaResult.conflicts?.utilizationRate ?? 0}
        totalHardViolations={gaResult.conflicts?.totalHardViolations ?? 0}
        departmentWarnings={gaResult.conflicts?.departmentWarnings ?? 0}
        bestFitness={gaResult.bestFitness ?? 0}
        convergedAtGeneration={gaResult.convergedAtGeneration ?? 0}
        executionTimeMs={gaResult.executionTimeMs ?? 0}
        workloadStdDev={gaResult.conflicts?.workloadStdDev ?? 0}
      />

      {/* Synchronized Department Cross-Filter Indicator */}
      {selectedDepartment !== 'ALL' && (
        <div
          data-testid="active-department-filter-banner"
          className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Active Department Filter:</span>
            <span className="font-semibold bg-white border border-blue-200 px-2.5 py-0.5 rounded-md text-blue-800">
              {selectedDepartment}
            </span>
            <span className="text-blue-700 font-mono tabular-nums">
              ({filteredAssignments.length} matching assignment{filteredAssignments.length === 1 ? '' : 's'})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDepartment('ALL')}
            data-testid="clear-department-filter-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-800 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
            Clear Department Filter
          </button>
        </div>
      )}

      {/* Interactive Department Distribution Chart */}
      <DashboardWidget
        schedule={gaResult.schedule}
        departments={departments}
        subjects={subjects}
        selectedDepartment={selectedDepartment}
        onSelectDepartment={setSelectedDepartment}
      />

      {/* Synchronized Conflict Heatmap + Quick Fix & Batch Auto-Resolve */}
      <ConflictHeatmapWidget
        schedule={gaResult.schedule}
        subjects={subjects}
        students={students}
        halls={halls}
        faculty={faculty}
        departments={departmentRecords.length > 0 ? departmentRecords : departments}
        policy={policy}
        availableDates={availableDates}
        selectedDepartment={selectedDepartment}
        onSelectDepartment={setSelectedDepartment}
        locateCellRequest={locateCellRequest}
        onApplyQuickFix={onUpdateScheduledExam}
        onBatchApplyQuickFix={onBatchApplyQuickFix}
        onNavigate={onNavigate}
      />

      {/* Real-Time Room & Invigilation Assignments Table with Search, Filter, Actions & Pagination */}
      <div
        data-testid="overview-assignments-card"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Real-Time Room &amp; Invigilation Assignments
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live timetable allocations synchronized with department filters and conflict resolution
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                View Full Report
              </button>
              <button
                type="button"
                disabled={isGARunning}
                onClick={onRunGA}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {isGARunning ? 'Optimizing...' : 'Re-Run Optimizer'}
              </button>
            </div>
          </div>

          {/* Search & Status Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              <div className="relative flex-1 min-w-[210px] max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search subject, code, hall, invigilator..."
                  aria-label="Search assignments table"
                  data-testid="assignments-search-input"
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <label htmlFor="assignments-status-filter" className="sr-only">
                Filter assignments by status
              </label>
              <select
                id="assignments-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                data-testid="assignments-status-filter"
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Assignments</option>
                <option value="CONFLICT">Conflicts Only</option>
                <option value="VERIFIED">Verified Assignments</option>
                <option value="PENDING">Pending Assignments</option>
              </select>

              {(searchQuery || statusFilter !== 'ALL' || selectedDepartment !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setSelectedDepartment('ALL');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <FilterX className="w-3.5 h-3.5" />
                  Reset Filters
                </button>
              )}
            </div>

            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {filteredAssignments.length} of {gaResult.schedule.length} assignment(s)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Date &amp; Session</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4 text-right">Students</th>
                <th className="py-3 px-4">Hall</th>
                <th className="py-3 px-4 text-right">Capacity</th>
                <th className="py-3 px-4">Invigilator</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {paginatedAssignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    No room or invigilation assignments match the current search and filters.
                  </td>
                </tr>
              ) : (
                paginatedAssignments.map((row) => {
                  const hasIssue = hasAssignmentConflict(row);
                  const isPending = isAssignmentPending(row, facultyById);

                  return (
                    <tr
                      key={row.examId}
                      data-testid={`assignment-row-${row.subjectCode}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-medium text-slate-900 tabular-nums">
                          {row.date}
                        </div>
                        <span
                          className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[11px] font-semibold ${getSessionBadgeClasses(
                            row.session
                          )}`}
                        >
                          {row.session}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{row.subjectName}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {row.subjectCode} · {row.department}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.enrolledCount}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                        {row.hallNumber}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {row.hallCapacity}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900">{row.invigilatorName || 'Unassigned'}</div>
                        <div className="text-xs text-slate-500">{row.invigilatorDept || '—'}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {hasIssue ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Conflict
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setQuickEditError('');
                              setQuickEditAllowOverride(false);
                              setQuickEditExam(row);
                            }}
                            title="Quick edit date, session, hall, or invigilator"
                            aria-label={`Quick edit ${row.subjectCode}`}
                            data-testid={`quick-edit-btn-${row.subjectCode}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLocateInHeatmap(row)}
                            title="Locate slot in Conflict Heatmap"
                            aria-label={`Locate ${row.subjectCode} in heatmap`}
                            data-testid={`locate-heatmap-btn-${row.subjectCode}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Locate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailsExam(row)}
                            title="View full assignment details"
                            aria-label={`View details for ${row.subjectCode}`}
                            data-testid={`view-details-btn-${row.subjectCode}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">Details</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          totalItems={filteredAssignments.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="assignments"
        />
      </div>

      <QuickEditExamModal
        exam={quickEditExam}
        halls={halls}
        faculty={faculty}
        saving={quickEditSaving}
        errorMessage={quickEditError}
        allowOverride={quickEditAllowOverride}
        onToggleOverride={setQuickEditAllowOverride}
        onSave={handleSaveQuickEdit}
        onClose={() => {
          setQuickEditExam(null);
          setQuickEditError('');
          setQuickEditAllowOverride(false);
        }}
      />

      <ExamDetailsModal
        exam={detailsExam}
        students={students}
        onClose={() => setDetailsExam(null)}
      />
    </div>
  );
};
