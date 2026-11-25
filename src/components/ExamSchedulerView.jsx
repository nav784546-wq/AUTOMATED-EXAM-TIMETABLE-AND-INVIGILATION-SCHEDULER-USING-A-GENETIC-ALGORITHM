import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Pencil,
  Check,
  X,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Download,
  Building2,
  BookOpen,
  LayoutGrid,
  ShieldCheck,
  ChevronDown,
  FileSpreadsheet,
} from 'lucide-react';
import { downloadTimetableCSV } from '../utils/exportReport.js';
import { exportDepartmentTimetableToExcel } from '../utils/excelTimetableExport.js';
import { SingleDaySubjectSelector } from './SingleDaySubjectSelector.jsx';
import { PrintableTimetableView } from './PrintableTimetableView.jsx';
import { PaginationBar } from './PaginationBar.jsx';
import {
  formatDisplayDate,
  parseExamDate,
  validateCompleteExamTimetable,
} from '../utils/conflictEvaluator.js';
import {
  getSessionBadgeClasses,
  getSessionColumnTintClasses,
  getSessionHeaderClasses,
} from '../utils/sessionStyles.js';

const SESSIONS = ['FN (09:30 - 12:30)', 'AN (14:00 - 17:00)'];

function shortSess(session = '') {
  const s = String(session || '').trim().toUpperCase();
  return s.startsWith('FN') ? 0 : s.startsWith('AN') ? 1 : 2;
}

export const ExamSchedulerView = ({
  departments,
  departmentRecords = [],
  batches,
  dates,
  halls,
  faculty,
  subjects = [],
  students = [],
  schedule,
  policy = {},
  scheduleValidation = null,
  timetableConfirmed = false,
  onConfirmFinalizeTimetable,
  onUpdateScheduledExam,
  singleDaySelections = {},
  onChangeSingleDaySelections,
  singleDayDate = '2026-11-16',
  onChangeSingleDayDate,
  singleDaySession = 'BOTH',
  onChangeSingleDaySession,
  onFinalizeSingleDaySchedule,
}) => {
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterBatch, setFilterBatch] = useState('ALL');
  const [filterSection, setFilterSection] = useState('ALL');
  const [filterSubject, setFilterSubject] = useState('ALL');
  const [filterDate, setFilterDate] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'department' | 'single-day' | 'print'

  const [editingExamId, setEditingExamId] = useState(null);
  const [editValues, setEditValues] = useState({
    date: '',
    session: SESSIONS[0],
    hallId: '',
    invigilatorId: '',
  });
  const [editError, setEditError] = useState('');
  const [editAllowOverride, setEditAllowOverride] = useState(false);

  const [authorizeFinalizeOverride, setAuthorizeFinalizeOverride] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [selectedExportDepts, setSelectedExportDepts] = useState([]);
  const [exportStatusMsg, setExportStatusMsg] = useState('');
  const [exportErrorMsg, setExportErrorMsg] = useState('');
  const [exportWarnings, setExportWarnings] = useState([]);
  const exportMenuRef = useRef(null);

  const exportDepartmentNames = useMemo(() => {
    const set = new Set();
    for (const d of departments || []) {
      const name = typeof d === 'string' ? d.trim() : String(d?.name || '').trim();
      if (name) set.add(name);
    }
    for (const item of schedule || []) {
      if (item?.department) set.add(String(item.department).trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [departments, schedule]);

  useEffect(() => {
    setSelectedExportDepts((prev) => {
      if (prev.length === 0) return exportDepartmentNames;
      const valid = prev.filter((d) => exportDepartmentNames.includes(d));
      return valid.length > 0 ? valid : exportDepartmentNames;
    });
  }, [exportDepartmentNames]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportMenuOpen(false);
      }
    };
    const handleEsc = (event) => {
      if (event.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [exportMenuOpen]);

  const resolvedValidation = useMemo(() => {
    if (scheduleValidation) return scheduleValidation;
    return validateCompleteExamTimetable(schedule || [], {
      departments: departmentRecords.length > 0 ? departmentRecords : departments,
      subjects,
      students,
      halls,
      faculty,
      policy,
    });
  }, [
    scheduleValidation,
    schedule,
    departmentRecords,
    departments,
    subjects,
    students,
    halls,
    faculty,
    policy,
  ]);

  const timelineMapByExamId = useMemo(() => {
    const map = new Map();
    const timelines = resolvedValidation?.departmentTimelines || {};
    for (const entries of Object.values(timelines)) {
      for (const entry of entries || []) {
        if (entry?.examId) map.set(entry.examId, entry);
      }
    }
    return map;
  }, [resolvedValidation]);

  // Extract unique subjects, sections, dates available in the current schedule
  const availableSubjects = useMemo(() => {
    const map = new Map();
    schedule.forEach((item) => {
      if (item.subjectCode && !map.has(item.subjectCode)) {
        map.set(item.subjectCode, `${item.subjectCode} - ${item.subjectName}`);
      }
    });
    return Array.from(map.entries());
  }, [schedule]);

  const availableSections = useMemo(() => {
    const set = new Set();
    schedule.forEach((item) => {
      if (item.section) set.add(item.section);
    });
    return Array.from(set).sort();
  }, [schedule]);

  const availableDates = useMemo(() => {
    const set = new Set(dates);
    schedule.forEach((item) => {
      if (item.date) set.add(item.date);
    });
    return Array.from(set).sort();
  }, [dates, schedule]);

  const filteredSchedule = useMemo(() => {
    return schedule.filter((item) => {
      if (filterDept !== 'ALL' && item.department !== filterDept) return false;
      if (filterBatch !== 'ALL' && item.batch && item.batch !== filterBatch) return false;
      if (filterSection !== 'ALL' && item.section !== filterSection) return false;
      if (filterSubject !== 'ALL' && item.subjectCode !== filterSubject) return false;
      if (filterDate !== 'ALL' && item.date !== filterDate) return false;
      return true;
    });
  }, [schedule, filterDept, filterBatch, filterSection, filterSubject, filterDate]);

  const [gridDatePage, setGridDatePage] = useState(1);
  const [gridDatesPerPage, setGridDatesPerPage] = useState(10);

  // Group filtered schedule chronologically by department for department-wise preview
  const departmentGrouped = useMemo(() => {
    const groups = new Map();
    filteredSchedule.forEach((item) => {
      const dept = item.department || 'General';
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept).push(item);
    });
    for (const items of groups.values()) {
      items.sort((a, b) => {
        const dA = parseExamDate(a.date)?.iso || String(a.date || '');
        const dB = parseExamDate(b.date)?.iso || String(b.date || '');
        if (dA !== dB) return dA.localeCompare(dB);
        return shortSess(a.session) - shortSess(b.session);
      });
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSchedule]);

  const filteredGridDates = useMemo(() => {
    if (filterDate !== 'ALL') return availableDates.filter((d) => d === filterDate);
    return availableDates;
  }, [availableDates, filterDate]);

  useEffect(() => {
    setGridDatePage(1);
  }, [filterDept, filterBatch, filterSection, filterSubject, filterDate]);

  const paginatedGridDates = useMemo(() => {
    const start = (gridDatePage - 1) * gridDatesPerPage;
    return filteredGridDates.slice(start, start + gridDatesPerPage);
  }, [filteredGridDates, gridDatePage, gridDatesPerPage]);

  const startEdit = (item) => {
    setEditingExamId(item.examId);
    setEditError('');
    setEditAllowOverride(false);
    setEditValues({
      date: item.date,
      session: item.session,
      hallId: item.hallId,
      invigilatorId: item.invigilatorId || item.facultyId || '',
    });
  };

  const cancelEdit = () => {
    setEditingExamId(null);
    setEditError('');
    setEditAllowOverride(false);
  };

  const saveEdit = async (examId) => {
    setEditError('');
    const ok = await onUpdateScheduledExam(examId, editValues, {
      allowOverride: editAllowOverride,
      onValidationError: (msg) => {
        setEditError(msg || 'Invalid schedule edit rejected by department policy.');
      },
    });
    if (ok !== false) {
      setEditingExamId(null);
      setEditError('');
      setEditAllowOverride(false);
    }
  };

  const handleFinalizeClick = async () => {
    if (!onConfirmFinalizeTimetable || finalizing) return;
    setFinalizing(true);
    try {
      await onConfirmFinalizeTimetable({ allowOverride: authorizeFinalizeOverride });
    } finally {
      setFinalizing(false);
    }
  };

  const deptSourceForExport = departmentRecords.length > 0 ? departmentRecords : departments;

  const runExcelExport = async (mode) => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    setExportStatusMsg('');
    setExportErrorMsg('');
    setExportWarnings([]);
    try {
      const baseData = mode === 'SELECTED' || mode === 'ALL_UNFILTERED' ? schedule : filteredSchedule;
      const options = {
        subjects,
        departments: deptSourceForExport,
        academicBatch: filterBatch !== 'ALL' ? filterBatch : undefined,
      };

      if (mode === 'CURRENT' && filterDept !== 'ALL') {
        options.exportScope = 'CURRENT';
        options.currentDepartment = filterDept;
      } else if (mode === 'SELECTED') {
        if (selectedExportDepts.length === 0) return;
        options.exportScope = 'SELECTED';
        options.selectedDepartments = selectedExportDepts;
      } else {
        options.exportScope = 'ALL';
      }

      const result = await exportDepartmentTimetableToExcel(
        baseData,
        deptSourceForExport,
        options
      );
      setExportMenuOpen(false);
      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        setExportWarnings(result.warnings);
      }
      setExportStatusMsg(
        `Exported ${result.rowCount} exam(s) across ${result.sheetNames.length} worksheet(s) (${result.filename})`
      );
    } catch (err) {
      setExportErrorMsg(
        err instanceof Error ? err.message : 'Unable to export Excel timetable.'
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const toggleExportDept = (deptName) => {
    setSelectedExportDepts((prev) =>
      prev.includes(deptName) ? prev.filter((d) => d !== deptName) : [...prev, deptName]
    );
  };

  const isScheduleValid = Boolean(resolvedValidation?.isValid);
  const validationWarnings = resolvedValidation?.warnings || [];
  const requiredGapDays = resolvedValidation?.policy?.minGapDaysBetweenExams ?? 2;

  return (
    <div className="space-y-6">
      {/* Timetable Policy Verification & Finalization Banner */}
      {schedule.length > 0 && (
        <div
          data-testid="timetable-validation-banner"
          className={`rounded-xl border p-4 shadow-sm no-print ${
            isScheduleValid
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-red-50 border-red-200 text-red-950'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {isScheduleValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Department-Wise Schedule Policy Verified</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>
                      Schedule Validation Failed ({validationWarnings.length} issue
                      {validationWarnings.length === 1 ? '' : 's'})
                    </span>
                  </>
                )}
                {timetableConfirmed && (
                  <span
                    data-testid="timetable-confirmed-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-700 text-white rounded-md"
                  >
                    <ShieldCheck className="w-3 h-3" /> Finalized
                  </span>
                )}
              </div>

              {isScheduleValid ? (
                <p className="text-xs text-emerald-800">
                  Every department follows 1 examination per calendar day (across FN &amp; AN) with at least{' '}
                  <strong className="font-mono">{requiredGapDays}</strong> complete intervening gap day
                  {requiredGapDays === 1 ? '' : 's'} between consecutive papers.
                </p>
              ) : (
                <div className="space-y-1 text-xs text-red-800" data-testid="validation-warning-list">
                  {validationWarnings.slice(0, 5).map((warn, idx) => (
                    <div key={idx} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <span>{warn}</span>
                    </div>
                  ))}
                  {validationWarnings.length > 5 && (
                    <div className="text-[11px] text-red-700 font-medium">
                      +{validationWarnings.length - 5} more violation(s) shown in Conflict Report.
                    </div>
                  )}
                </div>
              )}
            </div>

            {onConfirmFinalizeTimetable && (
              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                {!isScheduleValid && (
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-red-900 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="authorize-override-checkbox"
                      checked={authorizeFinalizeOverride}
                      onChange={(e) => setAuthorizeFinalizeOverride(e.target.checked)}
                      className="rounded text-red-700"
                    />
                    <span>Authorized Manual Override</span>
                  </label>
                )}
                <button
                  type="button"
                  data-testid="confirm-finalize-timetable-btn"
                  disabled={finalizing || (!isScheduleValid && !authorizeFinalizeOverride)}
                  onClick={handleFinalizeClick}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    isScheduleValid
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                      : authorizeFinalizeOverride
                      ? 'bg-amber-700 hover:bg-amber-800 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {finalizing
                    ? 'Finalizing...'
                    : timetableConfirmed
                    ? 'Re-Confirm Final Timetable'
                    : isScheduleValid
                    ? 'Confirm & Finalize Timetable'
                    : 'Finalize with Override'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Filter & View Mode Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Calendar className="w-4 h-4 text-blue-700" />
              Filter By:
            </span>

            {/* Department */}
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              aria-label="Filter exam grid by department"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Course / Subject */}
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              aria-label="Filter exam grid by course / subject"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 max-w-[180px] truncate"
            >
              <option value="ALL">All Courses/Subjects</option>
              {availableSubjects.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>

            {/* Academic Year / Batch */}
            <select
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              aria-label="Filter exam grid by batch"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="ALL">All Years/Batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>
                  Batch {b}
                </option>
              ))}
            </select>

            {/* Section */}
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              aria-label="Filter exam grid by section"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="ALL">All Sections</option>
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>

            {/* Date */}
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              aria-label="Filter exam grid by date"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 font-mono"
            >
              <option value="ALL">All Dates</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-lg max-w-full">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Date Grid
              </button>
              <button
                type="button"
                data-testid="view-mode-department-btn"
                onClick={() => setViewMode('department')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'department'
                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Department-Wise
              </button>
              <button
                type="button"
                onClick={() => setViewMode('single-day')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'single-day'
                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Single-Day Selection
              </button>
              <button
                type="button"
                data-testid="view-mode-print-btn"
                onClick={() => setViewMode('print')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  viewMode === 'print'
                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                Print View
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewMode !== 'print' && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / PDF
                </button>
              )}

              <div className="relative" ref={exportMenuRef}>
                <div className="inline-flex items-stretch rounded-lg overflow-hidden border border-blue-800 shadow-xs">
                  <button
                    type="button"
                    data-testid="export-excel-btn"
                    disabled={isExportingExcel || filteredSchedule.length === 0}
                    onClick={() => runExcelExport(filterDept !== 'ALL' ? 'CURRENT' : 'ALL')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    {isExportingExcel ? 'Exporting...' : 'Export to Excel'}
                  </button>
                  <button
                    type="button"
                    data-testid="export-excel-options-btn"
                    aria-label="Excel export options"
                    aria-expanded={exportMenuOpen}
                    onClick={() => setExportMenuOpen((prev) => !prev)}
                    className="inline-flex items-center px-2 py-1.5 text-xs font-medium text-white bg-blue-800 hover:bg-blue-900 border-l border-blue-600 cursor-pointer"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {exportMenuOpen && (
                  <div
                    data-testid="export-excel-menu"
                    className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 z-40 space-y-3 text-xs text-slate-700"
                  >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-semibold text-slate-900">Excel Timetable Export Options</span>
                    <button
                      type="button"
                      onClick={() => setExportMenuOpen(false)}
                      aria-label="Close export options"
                      className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      data-testid="export-all-depts-btn"
                      disabled={isExportingExcel || schedule.length === 0}
                      onClick={() => runExcelExport('ALL_UNFILTERED')}
                      className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <div className="font-semibold text-slate-900">Export All Departments (.xlsx)</div>
                      <div className="text-[11px] text-slate-500">
                        Consolidated Timetable + separate worksheet per department
                      </div>
                    </button>

                    <button
                      type="button"
                      data-testid="export-current-dept-btn"
                      disabled={isExportingExcel || filterDept === 'ALL' || filteredSchedule.length === 0}
                      onClick={() => runExcelExport('CURRENT')}
                      className="w-full text-left px-2.5 py-2 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-semibold text-slate-900">
                        Export Current Department (.xlsx)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {filterDept !== 'ALL'
                          ? `Selected filter: ${filterDept}`
                          : 'Choose a department in "Filter By" above to enable'}
                      </div>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Selected Departments</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSelectedExportDepts(exportDepartmentNames)}
                          className="text-blue-700 hover:underline cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedExportDepts([])}
                          className="text-slate-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {exportDepartmentNames.map((deptName) => (
                        <label
                          key={deptName}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedExportDepts.includes(deptName)}
                            onChange={() => toggleExportDept(deptName)}
                            className="rounded text-blue-700"
                          />
                          <span className="truncate text-slate-700">{deptName}</span>
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      data-testid="export-selected-depts-btn"
                      disabled={isExportingExcel || selectedExportDepts.length === 0 || schedule.length === 0}
                      onClick={() => runExcelExport('SELECTED')}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Selected ({selectedExportDepts.length}) (.xlsx)
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      data-testid="export-csv-fallback-btn"
                      onClick={() => {
                        downloadTimetableCSV(filteredSchedule, 'department_exam_timetable.csv');
                        setExportMenuOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded cursor-pointer"
                    >
                      Download Plain CSV (.csv)
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="text-slate-800 tabular-nums">{filteredSchedule.length}</strong> of{' '}
              <strong className="text-slate-800 tabular-nums">{schedule.length}</strong> scheduled examinations
            </span>
            {exportStatusMsg && (
              <span data-testid="excel-export-status" className="text-emerald-700 font-medium">
                {exportStatusMsg}
              </span>
            )}
            {exportErrorMsg && (
              <span
                role="alert"
                data-testid="excel-export-error"
                className="text-red-700 font-medium"
              >
                {exportErrorMsg}
              </span>
            )}
          </div>
          {(filterDept !== 'ALL' || filterBatch !== 'ALL' || filterSection !== 'ALL' || filterSubject !== 'ALL' || filterDate !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setFilterDept('ALL');
                setFilterBatch('ALL');
                setFilterSection('ALL');
                setFilterSubject('ALL');
                setFilterDate('ALL');
              }}
              className="text-xs text-blue-700 hover:underline font-medium cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>

        {exportWarnings.length > 0 && (
          <div
            role="status"
            data-testid="excel-export-warning"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1"
          >
            <div className="font-semibold">
              {exportWarnings.length} scheduled examination(s) skipped during Excel export due to invalid/missing dates:
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
              {exportWarnings.slice(0, 3).map((warn, idx) => (
                <li key={idx}>{warn}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* SINGLE-DAY DEPARTMENT SUBJECT SELECTION VIEW */}
      {viewMode === 'single-day' && (
        <SingleDaySubjectSelector
          departments={departments}
          subjects={subjects}
          selections={singleDaySelections}
          onChangeSelections={onChangeSingleDaySelections}
          singleDayDate={singleDayDate}
          onChangeSingleDayDate={onChangeSingleDayDate}
          singleDaySession={singleDaySession}
          onChangeSingleDaySession={onChangeSingleDaySession}
          onFinalizeSchedule={onFinalizeSingleDaySchedule}
        />
      )}

      {/* PRINT-FRIENDLY VIEW */}
      {viewMode === 'print' && (
        <PrintableTimetableView
          schedule={filteredSchedule}
          allScheduleCount={schedule.length}
          departmentFilter={filterDept}
          batchFilter={filterBatch}
          timetableConfirmed={timetableConfirmed}
          onClearFilters={() => {
            setFilterDept('ALL');
            setFilterBatch('ALL');
            setFilterSection('ALL');
            setFilterSubject('ALL');
            setFilterDate('ALL');
          }}
        />
      )}

      {/* DEPARTMENT-WISE VIEW */}
      {viewMode === 'department' && (
        <div className="space-y-6 no-print" data-testid="department-wise-schedule-view">
          {departmentGrouped.map(([dept, items]) => {
            const deptHasViolation = items.some(
              (item) =>
                item.hasDepartmentDateViolation ||
                item.hasDepartmentGapViolation ||
                item.hasDepartmentIndependenceViolation
            );
            return (
              <div
                key={dept}
                className={`bg-white border rounded-xl overflow-hidden shadow-sm ${
                  deptHasViolation ? 'border-red-300' : 'border-slate-200'
                }`}
              >
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700" />
                    <h3 className="text-sm font-bold text-slate-900">{dept}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {deptHasViolation ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded">
                        <AlertTriangle className="w-3.5 h-3.5" /> Date/Gap Violation
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Gap Compliant
                      </span>
                    )}
                    <span className="text-xs font-mono font-medium text-slate-600 bg-white px-2.5 py-0.5 rounded border border-slate-200">
                      {items.length} Exam(s) Scheduled
                    </span>
                  </div>
                </div>

                {editError && items.some((item) => item.examId === editingExamId) && (
                  <div
                    role="alert"
                    data-testid="inline-edit-validation-error"
                    className="bg-red-50 border-b border-red-200 px-5 py-3 text-xs text-red-900 flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className="inline-flex items-start gap-2 font-medium flex-1 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{editError}</span>
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-red-900 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={editAllowOverride}
                        onChange={(e) => setEditAllowOverride(e.target.checked)}
                        className="rounded text-red-700"
                      />
                      <span>Authorize Override on Next Save</span>
                    </label>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-medium">
                        <th className="py-2.5 px-4">Date &amp; Session</th>
                        <th className="py-2.5 px-4">Gap from Previous Exam</th>
                        <th className="py-2.5 px-4">Course / Subject</th>
                        <th className="py-2.5 px-4">Year / Batch · Sec</th>
                        <th className="py-2.5 px-4 text-right">Students</th>
                        <th className="py-2.5 px-4">Exam Hall</th>
                        <th className="py-2.5 px-4">Assigned Invigilator</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right no-print">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => {
                        const isEditing = editingExamId === item.examId;
                        const timelineInfo = timelineMapByExamId.get(item.examId);
                        let completeGapDays = timelineInfo?.completeGapDaysFromPrev ?? null;
                        if (completeGapDays === null && idx > 0) {
                          const prevMs = parseExamDate(items[idx - 1].date)?.ms;
                          const currMs = parseExamDate(item.date)?.ms;
                          if (prevMs !== undefined && currMs !== undefined) {
                            const diffDays = Math.round((currMs - prevMs) / 86400000);
                            completeGapDays = diffDays > 0 ? Math.max(0, diffDays - 1) : 0;
                          }
                        }

                        const hasDeptPolicyConflict = Boolean(
                          item.hasDepartmentDateViolation ||
                            item.hasDepartmentGapViolation ||
                            item.hasDepartmentIndependenceViolation
                        );
                        const hasConflict = Boolean(
                          item.hasStudentClash ||
                            item.hasInvigilatorConflict ||
                            item.hasCapacityIssue ||
                            item.hasHallDoubleBooking ||
                            hasDeptPolicyConflict
                        );

                        return (
                          <React.Fragment key={item.examId}>
                            <tr
                              data-testid={`dept-exam-row-${item.subjectCode}`}
                              className={hasConflict ? 'bg-red-50/40' : 'hover:bg-slate-50/70'}
                            >
                              <td className="py-3 px-3 font-mono whitespace-nowrap">
                                {isEditing ? (
                                  <div className="space-y-1.5 w-36">
                                    <input
                                      type="date"
                                      data-testid={`dept-edit-date-${item.subjectCode}`}
                                      value={editValues.date}
                                      onChange={(e) =>
                                        setEditValues({ ...editValues, date: e.target.value })
                                      }
                                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono"
                                    />
                                    <select
                                      data-testid={`dept-edit-session-${item.subjectCode}`}
                                      value={editValues.session}
                                      onChange={(e) =>
                                        setEditValues({ ...editValues, session: e.target.value })
                                      }
                                      className="block w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                    >
                                      {SESSIONS.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-semibold text-slate-900">
                                      {formatDisplayDate(item.date)}
                                    </div>
                                    <span
                                      className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold ${getSessionBadgeClasses(
                                        item.session
                                      )}`}
                                    >
                                      {item.session}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {idx === 0 || completeGapDays === null ? (
                                  <span className="font-mono text-slate-500">First Exam</span>
                                ) : item.hasDepartmentDateViolation ? (
                                  <span className="inline-flex items-center gap-1 font-medium text-red-700">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    Same Day (0 days)
                                  </span>
                                ) : item.hasDepartmentGapViolation ? (
                                  <span className="inline-flex items-center gap-1 font-medium text-red-700">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    {completeGapDays} complete day{completeGapDays === 1 ? '' : 's'} (Min {requiredGapDays})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-mono text-emerald-700">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    {completeGapDays} complete day{completeGapDays === 1 ? '' : 's'}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{item.subjectName}</div>
                                <div className="font-mono text-[11px] text-slate-500">
                                  {item.subjectCode}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                                {item.batch ? `Batch ${item.batch}` : '—'}
                                {item.section ? ` · ${item.section}` : ''}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                                {item.enrolledCount}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                {isEditing ? (
                                  <select
                                    value={editValues.hallId}
                                    onChange={(e) =>
                                      setEditValues({ ...editValues, hallId: e.target.value })
                                    }
                                    className="w-28 px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                  >
                                    {halls.map((h) => (
                                      <option key={h.id} value={h.id}>
                                        {h.hallNumber} ({h.capacity})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div>
                                    <span className="font-medium text-slate-900">{item.hallNumber}</span>
                                    <span className="text-[11px] text-slate-500">
                                      {' '}
                                      (Cap: {item.hallCapacity})
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                {isEditing ? (
                                  <select
                                    value={editValues.invigilatorId}
                                    onChange={(e) =>
                                      setEditValues({
                                        ...editValues,
                                        invigilatorId: e.target.value,
                                      })
                                    }
                                    className="w-44 max-w-[176px] px-2 py-1 text-xs border border-slate-300 rounded bg-white truncate"
                                  >
                                    {faculty.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        {f.name} ({f.department})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div>
                                    <span className="font-medium text-slate-900">
                                      {item.invigilatorName}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      {' '}
                                      · {item.invigilatorDept}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {hasConflict ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                    <AlertTriangle className="w-3.5 h-3.5" />{' '}
                                    {item.hasDepartmentDateViolation
                                      ? 'Same-Day Violation'
                                      : item.hasDepartmentGapViolation
                                      ? 'Gap Violation'
                                      : 'Conflict'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right no-print whitespace-nowrap">
                                {isEditing ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      data-testid={`dept-edit-save-${item.subjectCode}`}
                                      onClick={() => saveEdit(item.examId)}
                                      className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                      title="Save changes"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    data-testid={`dept-edit-btn-${item.subjectCode}`}
                                    onClick={() => startEdit(item)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded cursor-pointer font-medium"
                                  >
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                )}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISUAL DATE GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-36">Exam Date</th>
                  {SESSIONS.map((session) => (
                    <th key={session} className={`py-3 px-4 ${getSessionHeaderClasses(session)}`}>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-xs font-semibold ${getSessionBadgeClasses(
                          session
                        )}`}
                      >
                        {session}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedGridDates.map((date) => (
                  <tr key={date} className="align-top">
                    <td className="py-4 px-4 font-mono text-xs font-bold text-slate-900 bg-slate-50/50 whitespace-nowrap">
                      {date}
                    </td>
                    {SESSIONS.map((session) => {
                      const slotExams = filteredSchedule.filter(
                        (item) => item.date === date && item.session === session
                      );

                      return (
                        <td
                          key={session}
                          className={`py-3 px-4 min-w-[300px] ${getSessionColumnTintClasses(session)}`}
                        >
                          {slotExams.length === 0 ? (
                            <div className="py-4 px-3 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400 text-center">
                              No examination scheduled
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {slotExams.map((item) => {
                                const isEditing = editingExamId === item.examId;
                                const hasConflict =
                                  item.hasStudentClash ||
                                  item.hasInvigilatorConflict ||
                                  item.hasCapacityIssue ||
                                  item.hasHallDoubleBooking ||
                                  item.hasDepartmentDateViolation ||
                                  item.hasDepartmentGapViolation ||
                                  item.hasDepartmentIndependenceViolation;

                                return (
                                  <div
                                    key={item.examId}
                                    className={`p-3 rounded-lg border text-xs transition-all ${
                                      hasConflict
                                        ? 'bg-red-50/60 border-red-200'
                                        : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                      <div>
                                        <span className="font-semibold text-slate-900 text-xs">
                                          {item.subjectName}
                                        </span>
                                        <div className="font-mono text-[11px] text-slate-500">
                                          {item.subjectCode} · {item.department}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-200/80 text-slate-700">
                                          {item.enrolledCount} stus
                                        </span>
                                        {!isEditing && (
                                          <button
                                            type="button"
                                            onClick={() => startEdit(item)}
                                            className="p-1 rounded text-slate-500 hover:text-blue-700 hover:bg-slate-200 cursor-pointer no-print"
                                            title="Edit date/session/hall/invigilator"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Inline Editing Form */}
                                    {isEditing ? (
                                      <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
                                        <div>
                                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                            Date:
                                          </label>
                                          <input
                                            type="date"
                                            value={editValues.date}
                                            onChange={(e) =>
                                              setEditValues({ ...editValues, date: e.target.value })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                            Session:
                                          </label>
                                          <select
                                            value={editValues.session}
                                            onChange={(e) =>
                                              setEditValues({ ...editValues, session: e.target.value })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                          >
                                            {SESSIONS.map((s) => (
                                              <option key={s} value={s}>
                                                {s}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                            Hall:
                                          </label>
                                          <select
                                            value={editValues.hallId}
                                            onChange={(e) =>
                                              setEditValues({ ...editValues, hallId: e.target.value })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                          >
                                            {halls.map((h) => (
                                              <option key={h.id} value={h.id}>
                                                {h.hallNumber} ({h.capacity})
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                            Invigilator:
                                          </label>
                                          <select
                                            value={editValues.invigilatorId}
                                            onChange={(e) =>
                                              setEditValues({
                                                ...editValues,
                                                invigilatorId: e.target.value,
                                              })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                          >
                                            {faculty.map((f) => (
                                              <option key={f.id} value={f.id}>
                                                {f.name} ({f.department})
                                              </option>
                                            ))}
                                          </select>
                                        </div>

                                        {editError && (
                                          <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-900 space-y-1">
                                            <div className="font-medium">{editError}</div>
                                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={editAllowOverride}
                                                onChange={(e) =>
                                                  setEditAllowOverride(e.target.checked)
                                                }
                                                className="rounded text-red-700"
                                              />
                                              <span>Authorize Override</span>
                                            </label>
                                          </div>
                                        )}

                                        <div className="flex items-center gap-1.5 pt-1">
                                          <button
                                            type="button"
                                            onClick={() => saveEdit(item.examId)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded cursor-pointer"
                                          >
                                            <Check className="w-3 h-3" /> Save
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelEdit}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-200 hover:bg-slate-300 rounded cursor-pointer"
                                          >
                                            <X className="w-3 h-3" /> Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                                        <div>
                                          <span className="text-slate-400">Hall: </span>
                                          <span className="font-semibold text-slate-800">
                                            {item.hallNumber}
                                          </span>
                                          <span className="text-[10px] text-slate-400">
                                            {' '}
                                            ({item.hallCapacity})
                                          </span>
                                        </div>
                                        <div className="truncate">
                                          <span className="text-slate-400">Inv: </span>
                                          <span
                                            className="font-medium text-slate-800"
                                            title={item.invigilatorName}
                                          >
                                            {item.invigilatorName}
                                          </span>
                                        </div>
                                        {item.batch && (
                                          <div>
                                            <span className="text-slate-400">Batch: </span>
                                            <span className="text-slate-700">{item.batch}</span>
                                          </div>
                                        )}
                                        {item.section && (
                                          <div>
                                            <span className="text-slate-400">Sec: </span>
                                            <span className="text-slate-700">{item.section}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Conflict Flags if any */}
                                    {hasConflict && !isEditing && (
                                      <div className="mt-2 pt-1.5 border-t border-red-200 text-[10px] text-red-700 flex flex-col gap-0.5">
                                        {item.hasStudentClash && <span>• Student timetable overlap</span>}
                                        {item.hasInvigilatorConflict && <span>• Invigilator double-booking</span>}
                                        {item.hasCapacityIssue && <span>• Hall capacity exceeded</span>}
                                        {item.hasHallDoubleBooking && <span>• Hall double-booked</span>}
                                        {item.hasDepartmentDateViolation && (
                                          <span>• Multiple exams in same department on this date</span>
                                        )}
                                        {item.hasDepartmentGapViolation && (
                                          <span>• Minimum department exam gap violated</span>
                                        )}
                                        {item.hasDepartmentIndependenceViolation && (
                                          <span>• Multiple departments share this date</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredGridDates.length > 10 && (
            <PaginationBar
              totalItems={filteredGridDates.length}
              page={gridDatePage}
              pageSize={gridDatesPerPage}
              onPageChange={setGridDatePage}
              onPageSizeChange={setGridDatesPerPage}
              pageSizeOptions={[10, 25, 50]}
              itemLabel="exam dates"
            />
          )}
        </div>
      )}

      {viewMode !== 'print' && (
        <PrintableTimetableView
          compactPrintOnly
          schedule={filteredSchedule}
          allScheduleCount={schedule.length}
          departmentFilter={filterDept}
          batchFilter={filterBatch}
          timetableConfirmed={timetableConfirmed}
        />
      )}
    </div>
  );
};
