import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
  Users,
  Wand2,
  Loader2,
  Sparkles,
  X,
  Info,
} from 'lucide-react';
import { buildConflictHeatmapMatrix } from '../utils/conflictHeatmap.js';
import {
  buildBatchAutoResolvePlan,
  buildCellQuickFixPlan,
} from '../utils/conflictQuickFix.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import {
  getSessionBadgeClasses,
  getSessionColumnTintClasses,
  getSessionHeaderClasses,
} from '../utils/sessionStyles.js';

function formatCompactDate(isoDate = '') {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function BatchQuickFixModal({
  open,
  plan,
  applying,
  onConfirm,
  onClose,
}) {
  const modalRef = useFocusTrap({
    isOpen: open,
    onClose: () => {
      if (!applying) onClose();
    },
  });

  if (!open || !plan) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !applying) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-resolve-title"
        tabIndex={-1}
        data-testid="batch-resolve-modal"
        className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-xl focus:outline-none"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-700" />
              <h3 id="batch-resolve-title" className="text-base font-semibold text-slate-900">
                Preview Batch Auto-Resolve All Conflicts
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Review sequential minimal-disruption slot changes before applying them atomically to the database.
            </p>
          </div>
          <button
            type="button"
            disabled={applying}
            onClick={onClose}
            aria-label="Close batch preview dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* Before -> After summary strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70">
              <div className="text-[11px] font-medium text-slate-500">Current Hard Violations</div>
              <div className="text-lg font-bold font-mono tabular-nums text-red-700 mt-0.5">
                {plan.beforeConflicts?.totalHardViolations ?? 0}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70">
              <div className="text-[11px] font-medium text-slate-500">Projected After Apply</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                  (plan.afterConflicts?.totalHardViolations ?? 0) === 0
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {plan.afterConflicts?.totalHardViolations ?? 0}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70">
              <div className="text-[11px] font-medium text-slate-500">Proposed Exam Moves</div>
              <div className="text-lg font-bold font-mono tabular-nums text-blue-700 mt-0.5">
                {plan.changes.length}
              </div>
            </div>
          </div>

          {plan.unresolved.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Partial Constraints Notice:</span>{' '}
                {plan.unresolved.length} exam(s) still require manual review ({plan.unresolved.map((u) => u.subjectCode).join(', ')}).
              </div>
            </div>
          )}

          {plan.changes.length === 0 ? (
            <div className="p-6 border border-dashed border-slate-200 rounded-lg text-center text-sm text-slate-600">
              No valid non-clashing batch moves could be generated automatically for the remaining slots.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Subject</th>
                    <th className="py-2.5 px-3">Current Slot</th>
                    <th className="py-2.5 px-3">Proposed Slot</th>
                    <th className="py-2.5 px-3">Allocation Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {plan.changes.map((chg) => {
                    const allocNotes = [];
                    if (chg.hallChanged) {
                      allocNotes.push(`Hall: ${chg.fromHallNumber} → ${chg.toHallNumber}`);
                    } else {
                      allocNotes.push(`Hall kept (${chg.toHallNumber || chg.fromHallNumber})`);
                    }
                    if (chg.invigilatorChanged) {
                      allocNotes.push(
                        `Invigilator: ${chg.fromInvigilatorName || 'Unassigned'} → ${chg.toInvigilatorName}`
                      );
                    }

                    return (
                      <tr key={chg.examId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-semibold text-slate-900">{chg.subjectCode}</div>
                          <div className="text-[11px] text-slate-500">{chg.subjectName}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-red-700 whitespace-nowrap">
                          <span>{formatCompactDate(chg.fromDate)}</span>{' '}
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getSessionBadgeClasses(
                              chg.fromShortSession
                            )}`}
                          >
                            {chg.fromShortSession}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                          <span>{formatCompactDate(chg.toDate)}</span>{' '}
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getSessionBadgeClasses(
                              chg.toShortSession
                            )}`}
                          >
                            {chg.toShortSession}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div>{allocNotes.join(' · ')}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{chg.impactSummary}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex items-center justify-end gap-2.5 rounded-b-xl">
          <button
            type="button"
            disabled={applying}
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={applying || plan.changes.length === 0}
            onClick={onConfirm}
            data-testid="confirm-batch-resolve-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {applying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Applying Batch Fix...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm &amp; Apply All ({plan.changes.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ConflictHeatmapWidget = ({
  schedule = [],
  subjects = [],
  students = [],
  halls = [],
  faculty = [],
  departments = [],
  policy = {},
  availableDates = [],
  selectedDepartment: controlledDepartment,
  onSelectDepartment,
  locateCellRequest = null,
  onApplyQuickFix,
  onBatchApplyQuickFix,
  onNavigate,
}) => {
  const [localDeptFilter, setLocalDeptFilter] = useState('ALL');
  const departmentFilter =
    controlledDepartment !== undefined ? controlledDepartment : localDeptFilter;

  const setDepartmentFilter = (nextDept) => {
    if (onSelectDepartment) {
      onSelectDepartment(nextDept);
    } else {
      setLocalDeptFilter(nextDept);
    }
    setSelectedCellKey(null);
  };

  const [groupBy, setGroupBy] = useState('cohort'); // 'cohort' | 'section'
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [selectedCellKey, setSelectedCellKey] = useState(null);
  const [selectedFixExamId, setSelectedFixExamId] = useState(null);
  const [applyingFixId, setApplyingFixId] = useState(null);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchPlan, setBatchPlan] = useState(null);
  const [batchApplying, setBatchApplying] = useState(false);

  const cellRefs = useRef(new Map());

  const matrix = useMemo(
    () =>
      buildConflictHeatmapMatrix({
        schedule,
        subjects,
        students,
        departmentFilter,
        groupBy,
      }),
    [schedule, subjects, students, departmentFilter, groupBy]
  );

  // Handle external "Locate in Heatmap" requests from the Assignments table
  useEffect(() => {
    if (!locateCellRequest) return;
    const allCells = matrix.rows.flatMap((row) => row.cells);
    const match = allCells.find((cell) => {
      if (locateCellRequest.examId && cell.exams.some((e) => e.examId === locateCellRequest.examId)) {
        return true;
      }
      if (locateCellRequest.cellKey && cell.cellKey === locateCellRequest.cellKey) {
        return true;
      }
      return false;
    });

    if (match) {
      if (showConflictsOnly && !match.isConflict) {
        setShowConflictsOnly(false);
      }
      setSelectedCellKey(match.cellKey);
      requestAnimationFrame(() => {
        const el = cellRefs.current.get(match.cellKey);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          el.focus({ preventScroll: true });
        }
      });
    }
  }, [locateCellRequest, matrix.rows, showConflictsOnly]);

  const visibleRows = useMemo(() => {
    if (!showConflictsOnly) return matrix.rows;
    return matrix.rows.filter((row) => row.hasConflict);
  }, [matrix.rows, showConflictsOnly]);

  // Keep selectedCellKey synced to an existing cell; prefer the first conflict cell if none selected
  const selectedCell = useMemo(() => {
    const allCells = matrix.rows.flatMap((row) => row.cells);
    if (selectedCellKey) {
      const found = allCells.find((c) => c.cellKey === selectedCellKey && c.count > 0);
      if (found) return found;
    }
    const firstConflict = allCells.find((c) => c.isConflict);
    if (firstConflict) return firstConflict;
    const firstWarning = allCells.find((c) => c.isWarningOnly);
    if (firstWarning) return firstWarning;
    return allCells.find((c) => c.count > 0) || null;
  }, [matrix.rows, selectedCellKey]);

  useEffect(() => {
    if (selectedCell && selectedCell.cellKey !== selectedCellKey && !selectedCellKey) {
      setSelectedCellKey(selectedCell.cellKey);
    }
  }, [selectedCell, selectedCellKey]);

  const quickFixPlan = useMemo(() => {
    if (!selectedCell?.isConflict) return null;
    return buildCellQuickFixPlan({
      cell: selectedCell,
      schedule,
      subjects,
      students,
      halls,
      faculty,
      departments,
      policy,
      availableDates,
      maxPerExam: 3,
    });
  }, [selectedCell, schedule, subjects, students, halls, faculty, departments, policy, availableDates]);

  const activeFixExamId = useMemo(() => {
    if (!selectedCell?.isConflict || !selectedCell.exams?.length) return null;
    const stillInCell = selectedCell.exams.some((e) => e.examId === selectedFixExamId);
    if (stillInCell) return selectedFixExamId;
    return quickFixPlan?.recommended?.examId || selectedCell.exams[0]?.examId || null;
  }, [selectedCell, selectedFixExamId, quickFixPlan]);

  const activeFixSuggestions = useMemo(() => {
    if (!quickFixPlan || !activeFixExamId) return [];
    return quickFixPlan.byExamId.get(activeFixExamId) || [];
  }, [quickFixPlan, activeFixExamId]);

  const handleApplyFixOption = async (option) => {
    if (!onApplyQuickFix || !option || applyingFixId) return;
    setApplyingFixId(option.id);
    try {
      const ok = await onApplyQuickFix(option.examId, option.applyPayload, {
        isQuickFix: true,
      });
      if (ok !== false && selectedCell) {
        setSelectedCellKey(`${selectedCell.cohortKey}::${option.toDate}|${option.toSession}`);
      }
    } finally {
      setApplyingFixId(null);
    }
  };

  const handleOpenBatchPreview = () => {
    const plan = buildBatchAutoResolvePlan({
      schedule,
      subjects,
      students,
      halls,
      faculty,
      departments,
      policy,
      availableDates,
      departmentFilter,
    });
    setBatchPlan(plan);
    setBatchModalOpen(true);
  };

  const handleConfirmBatchResolve = async () => {
    if (!onBatchApplyQuickFix || !batchPlan || batchPlan.changes.length === 0) return;
    setBatchApplying(true);
    try {
      const ok = await onBatchApplyQuickFix(batchPlan.changes);
      if (ok !== false) {
        setBatchModalOpen(false);
        setBatchPlan(null);
        setSelectedCellKey(null);
      }
    } finally {
      setBatchApplying(false);
    }
  };

  const { summary, slots, availableDepartments } = matrix;

  return (
    <section
      aria-label="Cohort Schedule Conflict Heatmap"
      data-testid="conflict-heatmap-widget"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-700" />
            <h2 className="text-base font-semibold text-slate-900">
              Student Cohort Conflict Heatmap
            </h2>
            {departmentFilter !== 'ALL' && (
              <span className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                {departmentFilter}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            <span>Overlapping exam times per student cohort across scheduled slots</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summary.totalCohorts} cohort{summary.totalCohorts === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {summary.totalSlots} slot{summary.totalSlots === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-mono tabular-nums font-semibold ${
                summary.conflictCellCount > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
              data-testid="heatmap-conflict-summary"
            >
              {summary.conflictCellCount > 0
                ? `${summary.conflictCellCount} conflict slot${summary.conflictCellCount === 1 ? '' : 's'}`
                : '0 overlapping slots'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {summary.conflictCellCount > 1 && onBatchApplyQuickFix && (
            <button
              type="button"
              onClick={handleOpenBatchPreview}
              data-testid="preview-auto-resolve-all-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Preview Auto-Resolve All
            </button>
          )}

          <label className="sr-only" htmlFor="heatmap-dept-filter">
            Filter heatmap by department
          </label>
          <select
            id="heatmap-dept-filter"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">All Departments</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="heatmap-groupby">
            Cohort grouping level
          </label>
          <select
            id="heatmap-groupby"
            value={groupBy}
            onChange={(e) => {
              setGroupBy(e.target.value);
              setSelectedCellKey(null);
            }}
            className="w-full sm:w-auto px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="cohort">Group: Dept · Batch · Sem</option>
            <option value="section">Group: Dept · Section</option>
          </select>

          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter conflict visibility"
          >
            <button
              type="button"
              onClick={() => setShowConflictsOnly(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !showConflictsOnly
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Cohorts
            </button>
            <button
              type="button"
              onClick={() => setShowConflictsOnly(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showConflictsOnly
                  ? 'bg-white text-red-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Conflicts Only ({summary.affectedCohortCount})
            </button>
          </div>
        </div>
      </div>

      {/* Explicit Multi-Signal Legend */}
      <div className="flex flex-wrap items-center gap-4 pb-3.5 mb-4 border-b border-slate-200 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Cell intensity:</span>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-6 h-5 rounded border border-slate-200 bg-slate-50 inline-flex items-center justify-center font-mono text-[10px] text-slate-400"
          >
            —
          </span>
          <span>No exam (0)</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-6 h-5 rounded border border-emerald-200 bg-emerald-50 inline-flex items-center justify-center font-mono text-[10px] font-semibold text-emerald-800"
          >
            1
          </span>
          <span>Clear slot (1 exam)</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-6 h-5 rounded border border-amber-300 bg-amber-50 inline-flex items-center justify-center font-mono text-[10px] font-semibold text-amber-900"
          >
            2*
          </span>
          <span>Parallel sections (disjoint)</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-6 h-5 rounded border-2 border-red-500 bg-red-100 inline-flex items-center justify-center font-mono text-[10px] font-bold text-red-900"
          >
            2
          </span>
          <span className="font-medium text-red-800">Cohort overlap (2 exams)</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-6 h-5 rounded border-2 border-red-800 bg-red-600 inline-flex items-center justify-center font-mono text-[10px] font-bold text-white"
          >
            3+
          </span>
          <span className="font-medium text-red-800">Severe overlap (3+ exams)</span>
        </div>
      </div>

      {/* Heatmap Matrix or Empty States */}
      {schedule.length === 0 ? (
        <div className="h-52 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-center px-4">
          <p className="text-sm font-medium text-slate-700">
            No generated timetable available for conflict mapping
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Run the Genetic Algorithm scheduler to populate time slots and inspect cohort overlaps.
          </p>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('ga')}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Open GA Scheduler
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="py-10 border border-dashed border-emerald-200 bg-emerald-50/40 rounded-lg flex flex-col items-center justify-center text-center px-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mb-2" />
          <p className="text-sm font-medium text-slate-800">
            No student cohort time overlaps found
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Every visible cohort has at most one conflicting examination per time slot.
          </p>
          {showConflictsOnly && (
            <button
              type="button"
              onClick={() => setShowConflictsOnly(false)}
              className="mt-3 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Show All Cohorts
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-slate-200 rounded-lg" data-testid="heatmap-grid-container">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-slate-50 py-2.5 px-3 text-xs font-semibold text-slate-700 border-r border-slate-200 min-w-[148px] sm:min-w-[190px] max-w-[165px] sm:max-w-[215px]"
                  >
                    Student Cohort
                  </th>
                  {slots.map((slot) => (
                    <th
                      key={slot.slotKey}
                      scope="col"
                      title={`${slot.date} · ${slot.session}`}
                      className={`py-2 px-1 text-center border-r last:border-r-0 border-slate-200 min-w-[74px] ${getSessionHeaderClasses(
                        slot.session
                      )}`}
                    >
                      <div className="font-mono text-[11px] font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                        {formatCompactDate(slot.date)}
                      </div>
                      <div className="mt-0.5 flex justify-center">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] font-semibold uppercase tracking-wide leading-none ${getSessionBadgeClasses(
                            slot.shortSession
                          )}`}
                        >
                          {slot.shortSession}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {visibleRows.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50/60">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white py-2 px-3 border-r border-slate-200 font-normal text-left align-middle min-w-[148px] sm:min-w-[190px] max-w-[165px] sm:max-w-[215px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-slate-900 leading-snug" title={row.label}>
                          {row.label}
                        </span>
                        {row.hasConflict && (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-red-700 tabular-nums shrink-0"
                            title={`${row.rowConflictCells} conflicting time slot(s)`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {row.rowConflictCells}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {row.sublabel} ·{' '}
                        <span className="font-mono tabular-nums">
                          {row.rowExamCount} exam{row.rowExamCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </th>

                    {row.cells.map((cell) => {
                      const isSelected = selectedCell?.cellKey === cell.cellKey;
                      const primaryCode = cell.exams[0]?.subjectCode || '';

                      let cellStyle =
                        'bg-slate-50/70 border border-slate-200/80 text-slate-400 hover:bg-slate-100';
                      if (cell.severity === 'clear') {
                        cellStyle =
                          'bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100';
                      } else if (cell.severity === 'warning') {
                        cellStyle =
                          'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100';
                      } else if (cell.severity === 'conflict') {
                        cellStyle =
                          'bg-red-100 border-2 border-red-500 text-red-950 hover:bg-red-200';
                      } else if (cell.severity === 'critical') {
                        cellStyle =
                          'bg-red-600 border-2 border-red-800 text-white hover:bg-red-700';
                      }

                      const ariaLabel =
                        cell.count === 0
                          ? `${row.label} ${row.sublabel} on ${cell.date} ${cell.shortSession}: no scheduled exams`
                          : cell.isConflict
                            ? `${row.label} ${row.sublabel} on ${cell.date} ${cell.shortSession}: ${cell.count} overlapping exams (Conflict)`
                            : cell.isWarningOnly
                              ? `${row.label} ${row.sublabel} on ${cell.date} ${cell.shortSession}: ${cell.count} parallel disjoint section exams`
                              : `${row.label} ${row.sublabel} on ${cell.date} ${cell.shortSession}: 1 exam (${primaryCode}, clear)`;

                      return (
                        <td
                          key={cell.cellKey}
                          className={`p-1 border-r last:border-r-0 border-slate-100 align-middle ${getSessionColumnTintClasses(
                            cell.session
                          )}`}
                        >
                          <button
                            ref={(el) => {
                              if (el) cellRefs.current.set(cell.cellKey, el);
                              else cellRefs.current.delete(cell.cellKey);
                            }}
                            type="button"
                            onClick={() => setSelectedCellKey(cell.cellKey)}
                            aria-label={ariaLabel}
                            aria-pressed={isSelected}
                            data-cell-key={cell.cellKey}
                            data-severity={cell.severity}
                            data-conflict={cell.isConflict ? 'true' : 'false'}
                            data-testid={`heatmap-cell-${cell.severity}`}
                            className={`w-full h-11 rounded-md px-1 flex flex-col items-center justify-center transition-colors cursor-pointer ${cellStyle} ${
                              isSelected ? 'ring-2 ring-blue-700 ring-offset-1' : ''
                            }`}
                          >
                            {cell.count === 0 ? (
                              <span className="font-mono text-xs">—</span>
                            ) : cell.isConflict ? (
                              <>
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold tabular-nums leading-none">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  {cell.count > 1 ? `${cell.count} Clash` : 'Clash'}
                                </span>
                                <span className="font-mono text-[10px] opacity-90 truncate max-w-[66px] mt-0.5 leading-none">
                                  {cell.count > 1
                                    ? `${primaryCode} +${cell.count - 1}`
                                    : primaryCode}
                                </span>
                              </>
                            ) : cell.isWarningOnly ? (
                              <>
                                <span className="font-mono text-[11px] font-semibold tabular-nums leading-none">
                                  {cell.count}*
                                </span>
                                <span className="font-mono text-[10px] opacity-85 truncate max-w-[66px] mt-0.5 leading-none">
                                  {primaryCode} +{cell.count - 1}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-mono text-xs font-semibold tabular-nums leading-none">
                                  1
                                </span>
                                <span className="font-mono text-[10px] opacity-85 truncate max-w-[66px] mt-0.5 leading-none">
                                  {primaryCode}
                                </span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interactive Selected Cell Detail Inspector */}
          {selectedCell && (
            <div
              className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-3"
              data-testid="heatmap-cell-inspector"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {selectedCell.isConflict ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Cohort Time Overlap Detected
                    </span>
                  ) : selectedCell.isWarningOnly ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                      <Info className="w-4 h-4 shrink-0" />
                      Parallel Disjoint Sections (No Student Overlap)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Conflict-Free Slot
                    </span>
                  )}
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="text-xs font-medium text-slate-900">
                    {selectedCell.cohortLabel}
                    {selectedCell.cohortSublabel ? ` (${selectedCell.cohortSublabel})` : ''}
                  </span>
                  <span className="text-slate-300" aria-hidden="true">·</span>
                  <span className="font-mono text-xs text-slate-600 tabular-nums inline-flex items-center gap-1.5">
                    <span>{selectedCell.date}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold ${getSessionBadgeClasses(
                        selectedCell.session
                      )}`}
                    >
                      {selectedCell.session}
                    </span>
                  </span>
                </div>

                {onNavigate && (
                  <div className="flex items-center gap-2">
                    {selectedCell.isConflict && (
                      <button
                        type="button"
                        onClick={() => onNavigate('conflicts')}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Review Conflict Report
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onNavigate('exam-scheduler')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {selectedCell.isConflict ? 'Resolve in Exam Scheduler' : 'Edit in Exam Scheduler'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {selectedCell.conflictReasons.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-900 space-y-1">
                  {selectedCell.conflictReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {Array.isArray(selectedCell.warningReasons) && selectedCell.warningReasons.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 text-xs text-amber-900 space-y-1">
                  {selectedCell.warningReasons.map((reason, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedCell.isConflict && onApplyQuickFix && activeFixSuggestions.length > 0 && (
                <div
                  data-testid="quick-fix-assistant"
                  className="border border-blue-200 bg-blue-50/40 rounded-lg p-3.5 sm:p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                        <Wand2 className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        <span>Quick Fix Assistant</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Best alternative slots ranked to resolve overlap with minimal disruption
                      </p>
                    </div>

                    {selectedCell.exams.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label
                          htmlFor="quick-fix-exam-select"
                          className="text-[11px] font-medium text-slate-600"
                        >
                          Reschedule:
                        </label>
                        <select
                          id="quick-fix-exam-select"
                          value={activeFixExamId || ''}
                          onChange={(e) => setSelectedFixExamId(e.target.value)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {selectedCell.exams.map((exam) => (
                            <option key={exam.examId} value={exam.examId}>
                              {exam.subjectCode} — {exam.subjectName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {activeFixSuggestions.map((option, idx) => {
                      const isBest = idx === 0;
                      const isApplying = applyingFixId === option.id;

                      return (
                        <div
                          key={option.id}
                          data-testid={isBest ? 'quick-fix-best-option' : `quick-fix-option-${idx}`}
                          className={`bg-white border rounded-lg px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isBest ? 'border-blue-300' : 'border-slate-200'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`font-semibold ${
                                  isBest ? 'text-blue-800' : 'text-slate-700'
                                }`}
                              >
                                {isBest ? 'Recommended' : `Option ${idx + 1}`}
                              </span>
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span className="font-mono font-semibold text-slate-900">
                                {option.subjectCode}
                              </span>
                              <span className="font-mono text-slate-500 tabular-nums inline-flex flex-wrap items-center gap-1">
                                <span>{option.fromDate}</span>
                                <span
                                  className={`inline-flex items-center px-1 py-0.5 rounded border text-[10px] font-semibold leading-none ${getSessionBadgeClasses(
                                    option.fromShortSession
                                  )}`}
                                >
                                  {option.fromShortSession}
                                </span>
                                <span>→</span>
                                <strong className="text-slate-900">{option.toDate}</strong>
                                <span
                                  className={`inline-flex items-center px-1 py-0.5 rounded border text-[10px] font-semibold leading-none ${getSessionBadgeClasses(
                                    option.toShortSession
                                  )}`}
                                >
                                  {option.toShortSession}
                                </span>
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                              <span
                                className={`inline-flex items-center gap-1 font-medium ${
                                  option.isConflictFree ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                {option.impactSummary}
                              </span>
                              {option.reasons[3] && (
                                <>
                                  <span className="text-slate-300" aria-hidden="true">·</span>
                                  <span>{option.reasons[3]}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={Boolean(applyingFixId)}
                            onClick={() => handleApplyFixOption(option)}
                            data-testid={isBest ? 'apply-quick-fix-btn' : `apply-quick-fix-btn-${idx}`}
                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 ${
                              isBest
                                ? 'bg-blue-700 text-white hover:bg-blue-800'
                                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {isApplying ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Applying...
                              </>
                            ) : isBest ? (
                              <>
                                <Wand2 className="w-3.5 h-3.5" />
                                Apply Quick Fix
                              </>
                            ) : (
                              'Apply'
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">Cohort / Section</th>
                      <th className="py-2 px-3">Hall</th>
                      <th className="py-2 px-3">Invigilator</th>
                      <th className="py-2 px-3 text-right">Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedCell.exams.map((exam) => (
                      <tr key={exam.examId} className="bg-white">
                        <td className="py-2 px-3">
                          <span className="font-mono font-semibold text-slate-900">{exam.subjectCode}</span>
                          <span className="text-slate-600 ml-2">{exam.subjectName}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {[
                            exam.batch ? `Batch ${exam.batch}` : null,
                            exam.semester ? `Sem ${exam.semester}` : null,
                            exam.section || null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || exam.department}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800">{exam.hallNumber || '—'}</td>
                        <td className="py-2 px-3 text-slate-700">{exam.invigilatorName || 'Unassigned'}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400" />
                            {exam.enrolledCount || 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {selectedCell.peerConflictExams.map((peer) => (
                      <tr key={`peer-${peer.examId}`} className="bg-red-50/40">
                        <td className="py-2 px-3">
                          <span className="font-mono font-semibold text-red-800">{peer.subjectCode}</span>
                          <span className="text-red-700 ml-2">{peer.subjectName} (Shared Student Peer)</span>
                        </td>
                        <td className="py-2 px-3 text-red-700">{peer.department}</td>
                        <td className="py-2 px-3 font-mono text-red-800">{peer.hallNumber || '—'}</td>
                        <td className="py-2 px-3 text-red-700">{peer.invigilatorName || 'Unassigned'}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-red-800">
                          {peer.enrolledCount || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <BatchQuickFixModal
        open={batchModalOpen}
        plan={batchPlan}
        applying={batchApplying}
        onConfirm={handleConfirmBatchResolve}
        onClose={() => setBatchModalOpen(false)}
      />
    </section>
  );
};
