import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Grid3X3,
  Loader2,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  allocateExamHalls,
  buildCombinedHallReportRows,
  buildDepartmentWiseHallReportRows,
  buildIndividualStudentHallRows,
  lookupStudentHallAllocation,
} from '../utils/seatingAllocator.js';
import {
  downloadHallAllocationExcel,
  downloadHallAllocationPDF,
} from '../utils/exportHallAllocation.js';
import { DEFAULT_EXAM_DATES } from '../utils/seedData.js';
import { PaginationBar } from './PaginationBar.jsx';
import { getSessionBadgeClasses, isForenoonSession } from '../utils/sessionStyles.js';
import { persistenceService } from '../services/persistenceService.js';

const SESSIONS = [
  { value: 'FN', label: 'FN (09:30 - 12:30)' },
  { value: 'AN', label: 'AN (14:00 - 17:00)' },
];

export const SeatingArrangementView = ({
  departments = [],
  students = [],
  halls = [],
  schedule = [],
  availableDates = DEFAULT_EXAM_DATES,
  hallAllocations = [],
  onSaveHallAllocation,
  onDeleteHallAllocation,
  showError,
}) => {
  // Derive known exam dates from GA config, schedule, and saved hall allocations
  const dateOptions = useMemo(() => {
    const set = new Set([
      ...(availableDates || []),
      ...(schedule || []).map((s) => s.date).filter(Boolean),
      ...(hallAllocations || []).map((a) => a.examDate).filter(Boolean),
    ]);
    return Array.from(set).sort();
  }, [availableDates, schedule, hallAllocations]);

  const deptOptions = useMemo(() => {
    if (departments && departments.length > 0) return departments;
    return Array.from(new Set(students.map((s) => s.department).filter(Boolean))).sort();
  }, [departments, students]);

  const studentCountsByDept = useMemo(() => {
    const counts = new Map();
    for (const s of students) {
      const d = s.department || 'General';
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    return counts;
  }, [students]);

  const [examDate, setExamDate] = useState(dateOptions[0] || '2026-05-10');
  const [session, setSession] = useState('FN');
  const [selectedDepts, setSelectedDepts] = useState(() => deptOptions.slice(0, 2));
  const [targetMode, setTargetMode] = useState('PERCENTAGE'); // 'PERCENTAGE' | 'CUSTOM'
  const [targetPercentage, setTargetPercentage] = useState(50);
  const [customTarget, setCustomTarget] = useState(10);
  const [maxDeptsPerHall, setMaxDeptsPerHall] = useState(2);
  const [selectedHallIds, setSelectedHallIds] = useState(null); // null => auto-all eligible halls
  const [reserveTimetableHalls, setReserveTimetableHalls] = useState(false);
  const [columnsPerRow, setColumnsPerRow] = useState(5);

  const [draftPreview, setDraftPreview] = useState(null);
  const [activeSavedId, setActiveSavedId] = useState(() => hallAllocations[0]?.id || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [lookupRegNo, setLookupRegNo] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [reportTab, setReportTab] = useState('COMBINED'); // 'DEPT_WISE' | 'COMBINED' | 'INDIVIDUAL' | 'VISUAL'
  const [deptReportFilter, setDeptReportFilter] = useState('ALL');
  const [selectedHall, setSelectedHall] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [hallPage, setHallPage] = useState(1);

  // Sync default department selection when departments hydrate
  useEffect(() => {
    if (selectedDepts.length === 0 && deptOptions.length > 0) {
      setSelectedDepts(deptOptions.slice(0, Math.min(2, deptOptions.length)));
    }
  }, [deptOptions, selectedDepts.length]);

  // Keep activeSavedId synced with hydrated/deleted records
  useEffect(() => {
    if (activeSavedId && !hallAllocations.some((a) => a.id === activeSavedId)) {
      setActiveSavedId(hallAllocations[0]?.id || null);
    } else if (!activeSavedId && hallAllocations.length > 0 && !draftPreview) {
      setActiveSavedId(hallAllocations[0].id);
    }
  }, [hallAllocations, activeSavedId, draftPreview]);

  const activeSavedAllocation = useMemo(
    () => hallAllocations.find((a) => a.id === activeSavedId) || null,
    [hallAllocations, activeSavedId]
  );

  // Compute reserved halls for the currently configured (examDate, session)
  const reservationContext = useMemo(() => {
    const reservedByAllocations = new Set();
    const reservedHallLabels = [];

    for (const saved of hallAllocations) {
      if (saved.examDate === examDate && saved.session === session) {
        for (const hs of saved.hallSummaries || []) {
          if (hs.allocated > 0 && hs.hallId) {
            reservedByAllocations.add(String(hs.hallId));
            reservedHallLabels.push({
              hallNumber: hs.hallNumber,
              reason: `Allocated (${(saved.selectedDepartments || []).join(', ')})`,
            });
          }
        }
      }
    }

    const reservedByTimetable = new Set();
    if (reserveTimetableHalls) {
      const selSet = new Set(selectedDepts);
      for (const item of schedule || []) {
        if (
          item.date === examDate &&
          item.session === session &&
          item.hallId &&
          !selSet.has(item.department)
        ) {
          reservedByTimetable.add(String(item.hallId));
          if (!reservedByAllocations.has(String(item.hallId))) {
            reservedHallLabels.push({
              hallNumber: item.hallNumber,
              reason: `Timetable (${item.department})`,
            });
          }
        }
      }
    }

    const combinedIds = Array.from(new Set([...reservedByAllocations, ...reservedByTimetable]));
    return {
      reservedHallIds: combinedIds,
      reservedHallLabels,
    };
  }, [hallAllocations, schedule, examDate, session, reserveTimetableHalls, selectedDepts]);

  const eligibleHallChoices = useMemo(() => {
    const resSet = new Set(reservationContext.reservedHallIds);
    return (halls || []).filter(
      (h) => h.available && (Number(h.capacity) || 0) > 0 && !resSet.has(String(h.id))
    );
  }, [halls, reservationContext.reservedHallIds]);

  const effectiveSelectedHallIds = useMemo(() => {
    if (selectedHallIds === null) {
      return eligibleHallChoices.map((h) => String(h.id));
    }
    const eligibleSet = new Set(eligibleHallChoices.map((h) => String(h.id)));
    return selectedHallIds.filter((id) => eligibleSet.has(String(id)));
  }, [selectedHallIds, eligibleHallChoices]);

  // Live instant baseline plan if nothing saved or previewed yet
  const liveFallbackPlan = useMemo(() => {
    return allocateExamHalls({
      students,
      halls,
      selectedDepartments: selectedDepts.length > 0 ? selectedDepts : deptOptions,
      examDate,
      session,
      targetMode: targetMode === 'CUSTOM' ? 'CUSTOM' : `PERCENT_${targetPercentage}`,
      targetPercentage,
      customTargetPerDept: customTarget,
      maxDeptsPerHall,
      selectedHallIds: selectedHallIds === null ? null : effectiveSelectedHallIds,
      reservedHallIds: reservationContext.reservedHallIds,
      columnsPerRow,
    });
  }, [
    students,
    halls,
    selectedDepts,
    deptOptions,
    examDate,
    session,
    targetMode,
    targetPercentage,
    customTarget,
    maxDeptsPerHall,
    selectedHallIds,
    effectiveSelectedHallIds,
    reservationContext.reservedHallIds,
    columnsPerRow,
  ]);

  const activePlan = draftPreview || activeSavedAllocation || liveFallbackPlan;
  const isPreviewMode = Boolean(draftPreview);
  const isPersistedMode = !draftPreview && Boolean(activeSavedAllocation);

  // Report datasets derived from activePlan
  const deptWiseRows = useMemo(
    () => buildDepartmentWiseHallReportRows(activePlan, deptReportFilter),
    [activePlan, deptReportFilter]
  );

  const combinedRows = useMemo(
    () => buildCombinedHallReportRows(activePlan),
    [activePlan]
  );

  const individualRows = useMemo(
    () => buildIndividualStudentHallRows(activePlan),
    [activePlan]
  );

  const filteredIndividualRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return individualRows.filter((item) => {
      if (selectedHall !== 'ALL' && item.hallNumber !== selectedHall) return false;
      if (!q) return true;
      return (
        item.regNo.toLowerCase().includes(q) ||
        item.studentName.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.hallNumber.toLowerCase().includes(q)
      );
    });
  }, [individualRows, selectedHall, search]);

  useEffect(() => {
    setPage(1);
    setHallPage(1);
  }, [selectedHall, search, activePlan]);

  const paginatedIndividualRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredIndividualRows.slice(start, start + pageSize);
  }, [filteredIndividualRows, page, pageSize]);

  const visibleHalls = useMemo(
    () =>
      (activePlan?.hallSummaries || []).filter((h) =>
        selectedHall === 'ALL' ? h.allocated > 0 : h.hallNumber === selectedHall
      ),
    [activePlan, selectedHall]
  );

  const hallsPerPage = 2;
  const paginatedHalls = useMemo(() => {
    if (selectedHall !== 'ALL' || visibleHalls.length <= hallsPerPage) return visibleHalls;
    const start = (hallPage - 1) * hallsPerPage;
    return visibleHalls.slice(start, start + hallsPerPage);
  }, [visibleHalls, selectedHall, hallPage]);

  const toggleDept = (deptName) => {
    setSelectedDepts((prev) =>
      prev.includes(deptName) ? prev.filter((d) => d !== deptName) : [...prev, deptName]
    );
  };

  const toggleHallSelection = (hallId) => {
    const idStr = String(hallId);
    const current = new Set(effectiveSelectedHallIds);
    if (current.has(idStr)) {
      current.delete(idStr);
    } else {
      current.add(idStr);
    }
    setSelectedHallIds(Array.from(current));
  };

  const handleGeneratePreview = async () => {
    if (selectedDepts.length === 0) {
      if (showError) showError('Select at least one department to generate a hall allocation.');
      return;
    }
    const totalEligible = students.filter((s) => selectedDepts.includes(s.department)).length;
    if (totalEligible === 0) {
      if (showError) showError('The selected department(s) currently have 0 registered students.');
      return;
    }

    const configPayload = {
      students,
      halls,
      selectedDepartments: selectedDepts,
      examDate,
      session,
      targetMode: targetMode === 'CUSTOM' ? 'CUSTOM' : `PERCENT_${targetPercentage}`,
      targetPercentage,
      customTargetPerDept: customTarget,
      maxDeptsPerHall,
      selectedHallIds: selectedHallIds === null ? null : effectiveSelectedHallIds,
      reservedHallIds: reservationContext.reservedHallIds,
      columnsPerRow,
    };

    setIsGenerating(true);
    try {
      const plan = await persistenceService.previewHallAllocation(configPayload);
      setDraftPreview(plan);
      setDeptReportFilter('ALL');
      setSelectedHall('ALL');
      setReportTab('COMBINED');
    } catch {
      const fallback = allocateExamHalls(configPayload);
      setDraftPreview(fallback);
      setDeptReportFilter('ALL');
      setSelectedHall('ALL');
      setReportTab('COMBINED');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmAndSave = async () => {
    if (!draftPreview || !onSaveHallAllocation) return;
    setIsSaving(true);
    try {
      const saved = await onSaveHallAllocation(draftPreview);
      if (saved) {
        setDraftPreview(null);
        setActiveSavedId(saved.id);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSaved = (allocId) => {
    setDraftPreview(null);
    setActiveSavedId(allocId);
    setDeptReportFilter('ALL');
    setSelectedHall('ALL');
  };

  const handleStudentLookup = async (e) => {
    if (e) e.preventDefault();
    const reg = lookupRegNo.trim();
    if (!reg) {
      setLookupResult(null);
      return;
    }
    setIsLookingUp(true);
    try {
      // Check active preview or live plan first if not persisted, otherwise query backend / saved records
      const previewMatches = draftPreview
        ? lookupStudentHallAllocation(reg, [draftPreview])
        : [];
      if (previewMatches.length > 0) {
        setLookupResult({
          found: true,
          source: 'preview',
          registrationNumber: previewMatches[0].regNo,
          assignments: previewMatches,
        });
        return;
      }

      const res = await persistenceService.lookupStudentHall(reg, {
        records: hallAllocations,
      });
      if (res?.found) {
        setLookupResult({ ...res, source: 'saved' });
        return;
      }

      // Fall back to searching activePlan if no saved records matched yet
      const activeMatches = activePlan ? lookupStudentHallAllocation(reg, [activePlan]) : [];
      if (activeMatches.length > 0) {
        setLookupResult({
          found: true,
          source: isPersistedMode ? 'saved' : 'preview',
          registrationNumber: activeMatches[0].regNo,
          assignments: activeMatches,
        });
      } else {
        setLookupResult({
          found: false,
          registrationNumber: reg,
          assignments: [],
          error: res?.error || `No hall assignment found for registration number "${reg}".`,
        });
      }
    } catch (err) {
      const localMatches = lookupStudentHallAllocation(
        reg,
        draftPreview ? [draftPreview, ...hallAllocations] : hallAllocations.length > 0 ? hallAllocations : [activePlan].filter(Boolean)
      );
      if (localMatches.length > 0) {
        setLookupResult({
          found: true,
          source: 'local',
          registrationNumber: localMatches[0].regNo,
          assignments: localMatches,
        });
      } else {
        setLookupResult({
          found: false,
          registrationNumber: reg,
          assignments: [],
          error: err?.message || `No hall assignment found for registration number "${reg}".`,
        });
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  const exportScopeForPdf =
    reportTab === 'DEPT_WISE'
      ? 'DEPT_WISE'
      : reportTab === 'INDIVIDUAL'
      ? 'INDIVIDUAL'
      : 'ALL';

  return (
    <div className="space-y-5">
      {/* Print-Only Formal Examination Header */}
      <div className="hidden print-only border-b-2 border-slate-900 pb-4 mb-4">
        <h1 className="text-xl font-bold text-slate-900">Examination Hall Allocation Notice</h1>
        <p className="text-sm text-slate-700 mt-1">
          Exam Date: <span className="font-mono font-semibold">{activePlan?.examDate || examDate}</span>{' '}
          · Session: <span className="font-semibold">{activePlan?.session || session}</span>{' '}
          · Total Students: <span className="font-mono font-semibold">{activePlan?.totalAllocated || 0}</span>{' '}
          · Halls Used: <span className="font-mono font-semibold">{activePlan?.hallsRequired || 0}</span>
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Departments: {(activePlan?.selectedDepartments || []).join(', ') || 'All Departments'}
        </p>
      </div>

      {/* Allocation Configuration & Session Rules */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Intelligent Hall Allocation Planner
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Max {maxDeptsPerHall} department{maxDeptsPerHall > 1 ? 's' : ''} per hall · Sequential registration ranges preserving leading zeros · Automatic reserved-hall exclusion
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(draftPreview || activeSavedAllocation) && (
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGeneratePreview}
                data-testid="regenerate-hall-allocation-btn"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            )}
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGeneratePreview}
              data-testid="generate-hall-preview-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Preview Hall Allocation
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label htmlFor="alloc-exam-date" className="block text-xs font-medium text-slate-700 mb-1">
              Exam Date
            </label>
            <select
              id="alloc-exam-date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="alloc-session" className="block text-xs font-medium text-slate-700 mb-1">
              Exam Session
            </label>
            <select
              id="alloc-session"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {SESSIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="alloc-target-mode" className="block text-xs font-medium text-slate-700 mb-1">
              Allocation Split Rule
            </label>
            <select
              id="alloc-target-mode"
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="PERCENTAGE">% of Class Strength</option>
              <option value="CUSTOM">Custom Students / Hall</option>
            </select>
          </div>

          {targetMode === 'CUSTOM' ? (
            <div>
              <label htmlFor="alloc-custom-target" className="block text-xs font-medium text-slate-700 mb-1">
                Students per Dept / Hall
              </label>
              <input
                id="alloc-custom-target"
                type="number"
                min={1}
                max={500}
                value={customTarget}
                onChange={(e) => setCustomTarget(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="alloc-target-pct" className="block text-xs font-medium text-slate-700 mb-1">
                Target Allocation (%)
              </label>
              <input
                id="alloc-target-pct"
                type="number"
                min={10}
                max={100}
                step={5}
                value={targetPercentage}
                onChange={(e) =>
                  setTargetPercentage(Math.max(1, Math.min(100, Number(e.target.value) || 50)))
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
              />
            </div>
          )}

          <div>
            <label htmlFor="alloc-max-depts" className="block text-xs font-medium text-slate-700 mb-1">
              Max Depts per Hall
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="alloc-max-depts"
                type="number"
                min={1}
                max={6}
                value={maxDeptsPerHall}
                onChange={(e) =>
                  setMaxDeptsPerHall(Math.max(1, Math.min(6, Number(e.target.value) || 2)))
                }
                aria-label="Maximum departments per hall"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
              />
              <select
                id="cols-per-row"
                value={columnsPerRow}
                onChange={(e) => setColumnsPerRow(Number(e.target.value))}
                aria-label="Visual Grid Seats per Row"
                title="Visual Grid Seats / Row"
                className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
              >
                <option value={4}>4/row</option>
                <option value={5}>5/row</option>
                <option value={6}>6/row</option>
                <option value={8}>8/row</option>
              </select>
            </div>
          </div>
        </div>

        {/* Multi-Department Selector */}
        <div className="pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-slate-700">
              Departments Appearing ({selectedDepts.length} selected)
            </span>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDepts([...deptOptions])}
                className="text-blue-700 hover:text-blue-900 font-medium cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedDepts([])}
                className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {deptOptions.map((dept) => {
              const checked = selectedDepts.includes(dept);
              const count = studentCountsByDept.get(dept) || 0;
              return (
                <label
                  key={dept}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'bg-blue-50/70 border-blue-300 text-slate-900'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDept(dept)}
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span className="truncate font-medium">{dept}</span>
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 shrink-0">
                    {count} stu
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Select Available Examination Halls */}
        <div className="pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-slate-700">
              Available Examination Halls ({effectiveSelectedHallIds.length} / {eligibleHallChoices.length} selected)
            </span>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setSelectedHallIds(null)}
                className="text-blue-700 hover:text-blue-900 font-medium cursor-pointer"
              >
                Use All Available
              </button>
              <button
                type="button"
                onClick={() => setSelectedHallIds([])}
                className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                Clear Halls
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {halls.map((h) => {
              const idStr = String(h.id);
              const isReserved = reservationContext.reservedHallIds.includes(idStr);
              const isAvail = Boolean(h.available) && (Number(h.capacity) || 0) > 0;
              const disabled = !isAvail || isReserved;
              const checked = !disabled && effectiveSelectedHallIds.includes(idStr);

              return (
                <label
                  key={h.id}
                  title={
                    !isAvail
                      ? 'Hall unavailable'
                      : isReserved
                      ? `Already allocated for ${examDate} (${session})`
                      : `${h.hallNumber} · ${h.building} (${h.capacity} seats)`
                  }
                  className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                    disabled
                      ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                      : checked
                      ? 'bg-emerald-50/60 border-emerald-300 text-slate-900 cursor-pointer'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={checked}
                      onChange={() => toggleHallSelection(h.id)}
                      className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    <span className="font-mono font-semibold truncate">{h.hallNumber}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                    {isReserved ? 'Resv' : !isAvail ? 'Off' : `${h.capacity}`}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Reservation & Timetable Conflict Awareness Footer */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reserveTimetableHalls}
              onChange={(e) => setReserveTimetableHalls(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Exclude halls occupied by other departments in Exam Timetable for {examDate} ({session})</span>
          </label>
          <span className="font-mono tabular-nums text-slate-500">
            Reserved halls for {examDate} {session}: {reservationContext.reservedHallIds.length}
          </span>
        </div>
      </section>

      {/* Quick Student Registration Number -> Hall Lookup */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 no-print">
        <form onSubmit={handleStudentLookup} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <MapPin className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="font-semibold text-slate-900">Find Student Hall</span>
            <span className="text-slate-500 hidden sm:inline">
              Lookup hall &amp; seat by registration number
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 sm:flex-initial sm:min-w-[320px] justify-end">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={lookupRegNo}
                onChange={(e) => setLookupRegNo(e.target.value)}
                placeholder="Enter Reg. No (e.g. 24AIDS001)"
                aria-label="Lookup student hall by registration number"
                data-testid="student-hall-lookup-input"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              disabled={isLookingUp || !lookupRegNo.trim()}
              data-testid="student-hall-lookup-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              {isLookingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Find Hall
            </button>
          </div>
        </form>

        {lookupResult && (
          <div
            data-testid="student-hall-lookup-result"
            className={`mt-3 p-3 rounded-lg border text-xs ${
              lookupResult.found
                ? 'bg-emerald-50/70 border-emerald-200 text-slate-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            {lookupResult.found ? (
              <div className="space-y-1.5">
                {lookupResult.assignments.map((a, idx) => (
                  <div key={`${a.examDate}-${a.session}-${a.hallNumber}-${idx}`} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-blue-800">{a.regNo}</span>
                      <span className="font-medium">{a.studentName}</span>
                      <span className="text-slate-500">({a.department})</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                        <Building2 className="w-3.5 h-3.5" />
                        Hall {a.hallNumber}
                        {a.building ? ` · ${a.building}` : ''}
                      </span>
                      <span className="text-slate-600">
                        Row {a.rowNumber} · Seat {a.seatNumber}
                      </span>
                      <span className="text-slate-500">
                        {a.examDate} ({a.session})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span>{lookupResult.error}</span>
            )}
          </div>
        )}
      </section>

      {/* Saved Confirmed Allocations Bar */}
      {hallAllocations.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Session Hall Allocations ({hallAllocations.length})
            </h3>
            {isPersistedMode && activeSavedAllocation && onDeleteHallAllocation && (
              <button
                type="button"
                onClick={() => onDeleteHallAllocation(activeSavedAllocation.id)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Active Record
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {hallAllocations.map((saved) => {
              const isSelected = !draftPreview && activeSavedId === saved.id;
              return (
                <button
                  key={saved.id}
                  type="button"
                  onClick={() => handleSelectSaved(saved.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-mono font-semibold">{saved.examDate}</span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] font-semibold ${
                      isSelected
                        ? isForenoonSession(saved.session)
                          ? 'bg-violet-500/30 text-violet-100 border-violet-300/60'
                          : 'bg-slate-700 text-slate-100 border-slate-600'
                        : getSessionBadgeClasses(saved.session)
                    }`}
                  >
                    {saved.session}
                  </span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span className="font-mono tabular-nums">{saved.totalAllocated} stu</span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span className="font-mono tabular-nums">{saved.hallsRequired} halls</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Draft Preview Confirmation Banner OR Active Summary Strip */}
      {isPreviewMode ? (
        <section
          data-testid="hall-allocation-preview-panel"
          className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 space-y-4 no-print"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                <span>
                  Hall Allocation Preview — {draftPreview.examDate} · {draftPreview.session}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Departments: {(draftPreview.selectedDepartments || []).join(', ')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftPreview(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                Discard Preview
              </button>
              <button
                type="button"
                disabled={isSaving || draftPreview.totalAllocated === 0}
                onClick={handleConfirmAndSave}
                data-testid="confirm-save-hall-allocation-btn"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Confirm &amp; Save Allocation
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <div className="text-slate-500">Total Students</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {draftPreview.totalAllocated}
                <span className="text-xs font-normal text-slate-400"> / {draftPreview.totalStudents}</span>
              </div>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <div className="text-slate-500">Halls Required</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {draftPreview.hallsRequired}
              </div>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <div className="text-slate-500">Remaining Capacity</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {draftPreview.remainingAvailableCapacity} seats
              </div>
            </div>
            <div className="bg-white border border-blue-100 rounded-lg p-3">
              <div className="text-slate-500">Dept Target / Hall</div>
              <div className="text-sm font-semibold text-slate-900 mt-1">
                {draftPreview.targetMode === 'CUSTOM'
                  ? `${draftPreview.customTargetPerDept} students/hall`
                  : `${draftPreview.targetPercentage || targetPercentage}% per dept`}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Max {draftPreview.maxDeptsPerHall || maxDeptsPerHall} dept(s)/hall
              </div>
            </div>
          </div>

          {draftPreview.departmentTargets?.length > 0 && (
            <div className="text-xs text-slate-700 flex flex-wrap gap-x-5 gap-y-1">
              {draftPreview.departmentTargets.map((dt) => (
                <span key={dt.department}>
                  <strong className="font-medium text-slate-900">{dt.department}:</strong>{' '}
                  <span className="font-mono tabular-nums">
                    {dt.allocated}/{dt.totalStudents} allocated
                  </span>{' '}
                  (target {dt.targetPerHall}/hall)
                </span>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Session</div>
            <div className="text-sm font-semibold font-mono text-slate-900 mt-1">
              {activePlan?.examDate || examDate} · {activePlan?.session || session}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {isPersistedMode ? 'Saved in database' : 'Live auto-preview'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Allocated Students</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {activePlan?.totalAllocated ?? 0}
              <span className="text-xs font-normal text-slate-400"> / {activePlan?.totalStudents ?? 0}</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Halls Used</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {activePlan?.hallsRequired ?? 0}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Remaining Free Seats</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {activePlan?.remainingAvailableCapacity ?? 0}
            </div>
          </div>
        </section>
      )}

      {/* Insufficient Hall Capacity Warning */}
      {(activePlan?.shortfallSeats > 0 || activePlan?.unallocatedStudents?.length > 0) && (
        <div
          role="alert"
          data-testid="insufficient-capacity-alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-sm text-amber-900"
        >
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">
              Insufficient Examination Hall Capacity for Complete Allocation
            </div>
            <p className="text-xs text-amber-800">
              {activePlan.unallocatedStudents.length} student(s) could not be allocated across the{' '}
              {activePlan.totalEligibleHalls ?? 0} non-reserved available hall(s) (total capacity:{' '}
              {activePlan.totalEligibleCapacity ?? 0} seats). Estimated additional halls required:{' '}
              <strong className="font-mono">{activePlan.additionalHallsRequired || 1}</strong> hall(s)
              or <strong className="font-mono">{activePlan.shortfallSeats || activePlan.unallocatedStudents.length}</strong> more seats.
            </p>
          </div>
        </div>
      )}

      {/* Hall Occupancy Summary Strip */}
      {(activePlan?.hallSummaries || []).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 no-print">
          {activePlan.hallSummaries.map((h) => (
            <div
              key={h.hallId}
              className={`border rounded-xl p-3.5 ${
                h.allocated > 0
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-50/70 border-slate-200/80 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="font-mono font-semibold text-slate-900">{h.hallNumber}</span>
                <Grid3X3 className={`w-3.5 h-3.5 ${h.allocated > 0 ? 'text-blue-700' : 'text-slate-300'}`} />
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {h.allocated}{' '}
                <span className="text-xs font-normal text-slate-400">/ {h.capacity}</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {h.departmentBreakdown?.length > 0
                  ? `${h.departmentBreakdown.length} dept${h.departmentBreakdown.length > 1 ? 's' : ''} · ${h.building}`
                  : `Unused · ${h.building}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Format Selector & Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Hall Allocation Report Views">
            {[
              { id: 'COMBINED', label: 'Combined Hall Report' },
              { id: 'DEPT_WISE', label: 'Department-Wise Report' },
              { id: 'INDIVIDUAL', label: 'Student Individual List' },
              { id: 'VISUAL', label: 'Visual Seat Layout' },
            ].map((tab) => {
              const active = reportTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setReportTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                downloadHallAllocationPDF(activePlan, exportScopeForPdf, {
                  examDate,
                  session,
                  departmentFilter: deptReportFilter,
                })
              }
              disabled={!activePlan || activePlan.totalAllocated === 0}
              data-testid="export-hall-pdf-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={() =>
                downloadHallAllocationExcel(activePlan, {
                  examDate,
                  session,
                  departmentFilter: deptReportFilter,
                })
              }
              disabled={!activePlan || activePlan.totalAllocated === 0}
              data-testid="export-hall-excel-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!activePlan || activePlan.totalAllocated === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          </div>
        </div>

        {/* Report Format B: Combined Department Hall Allocation */}
        {reportTab === 'COMBINED' && (
          <div>
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Combined Department Hall Allocation Report
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each examination hall hosts at most {activePlan?.maxDeptsPerHall || maxDeptsPerHall} department{(activePlan?.maxDeptsPerHall || maxDeptsPerHall) > 1 ? 's' : ''} with continuous ascending registration ranges.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {activePlan?.hallsRequired ?? 0} halls · {activePlan?.totalAllocated ?? 0} students
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Examination Hall</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Registration Number Range</th>
                    <th className="py-3 px-4 text-right">Students</th>
                    <th className="py-3 px-4 text-right">Hall Occupancy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {combinedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        Select departments with students and click Preview Hall Allocation to generate room assignments.
                      </td>
                    </tr>
                  ) : (
                    combinedRows.map((row, idx) => (
                      <tr
                        key={`${row.hallId}-${row.department}-${idx}`}
                        className={`hover:bg-slate-50 ${
                          row.isFirstDeptInHall && idx > 0 ? 'border-t-2 border-slate-200' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                          {row.isFirstDeptInHall ? (
                            <div>
                              <span>{row.hallNumber}</span>
                              {row.building && (
                                <span className="block font-sans font-normal text-[11px] text-slate-500">
                                  {row.building}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">↳ {row.hallNumber}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">{row.department}</td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700">
                          {row.regNoRange}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                          {row.studentCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                          {row.isFirstDeptInHall
                            ? `${row.hallTotalAllocated} / ${row.hallCapacity}`
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report Format A: Department-Wise Hall Allocation */}
        {reportTab === 'DEPT_WISE' && (() => {
          const singleDeptOnly =
            deptReportFilter !== 'ALL' || (activePlan?.selectedDepartments || []).length <= 1;
          return (
            <div>
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Department-Wise Hall Allocation Report
                    {singleDeptOnly && (deptReportFilter !== 'ALL' || activePlan?.selectedDepartments?.[0])
                      ? ` — ${deptReportFilter !== 'ALL' ? deptReportFilter : activePlan.selectedDepartments[0]}`
                      : ''}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Student-facing room notice showing hall number and continuous registration number range.
                  </p>
                </div>
                <select
                  value={deptReportFilter}
                  onChange={(e) => setDeptReportFilter(e.target.value)}
                  aria-label="Filter department-wise report"
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white no-print"
                >
                  <option value="ALL">All Selected Departments</option>
                  {(activePlan?.selectedDepartments || deptOptions).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="py-3 px-4">Examination Hall</th>
                      {!singleDeptOnly && <th className="py-3 px-4">Department</th>}
                      <th className="py-3 px-4">Registration Number Range</th>
                      <th className="py-3 px-4 text-right">Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {deptWiseRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={singleDeptOnly ? 3 : 4}
                          className="py-8 text-center text-sm text-slate-500"
                        >
                          No hall allocations match the selected department.
                        </td>
                      </tr>
                    ) : (
                      deptWiseRows.map((row, idx) => (
                        <tr key={`${row.hallId}-${row.department}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                            {row.hallNumber}
                            {row.building && (
                              <span className="ml-2 font-sans font-normal text-slate-500">
                                ({row.building})
                              </span>
                            )}
                          </td>
                          {!singleDeptOnly && (
                            <td className="py-3 px-4 text-slate-800">{row.department}</td>
                          )}
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700">
                            {row.regNoRange}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                            {row.studentCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Report Format C: Student Individual Hall Allocation List */}
        {reportTab === 'INDIVIDUAL' && (
          <div>
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Student Individual Hall Allocation List
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showing {filteredIndividualRows.length} of {individualRows.length} allocated student(s)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search reg. no, name, dept..."
                    aria-label="Search individual student hall allocation"
                    className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <select
                  value={selectedHall}
                  onChange={(e) => setSelectedHall(e.target.value)}
                  aria-label="Filter individual student list by hall"
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">All Allocated Halls</option>
                  {(activePlan?.hallSummaries || [])
                    .filter((h) => h.allocated > 0)
                    .map((h) => (
                      <option key={h.hallId} value={h.hallNumber}>
                        Hall {h.hallNumber} ({h.allocated}/{h.capacity})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4 text-right">S.No.</th>
                    <th className="py-3 px-4">Registration Number</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Examination Hall</th>
                    <th className="py-3 px-4 text-right">Seat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredIndividualRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                        No student hall assignments match the current filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedIndividualRows.map((row) => (
                      <tr key={`${row.hallNumber}-${row.regNo}-${row.sNo}`} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                          {row.sNo}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-blue-700">
                          {row.regNo}
                        </td>
                        <td className="py-2.5 px-4 text-slate-900">{row.studentName}</td>
                        <td className="py-2.5 px-4 text-slate-600">{row.department}</td>
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900">
                          {row.hallNumber}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          R{row.rowNumber} · S{row.seatNumber}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <PaginationBar
              totalItems={filteredIndividualRows.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="students"
            />
          </div>
        )}

        {/* Visual Seat Grid Map */}
        {reportTab === 'VISUAL' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Visual Hall Seating Layout
                </h3>
                <select
                  value={selectedHall}
                  onChange={(e) => setSelectedHall(e.target.value)}
                  aria-label="Filter visual seat layout by hall"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white no-print"
                >
                  <option value="ALL">All Allocated Halls</option>
                  {(activePlan?.hallSummaries || [])
                    .filter((h) => h.allocated > 0)
                    .map((h) => (
                      <option key={h.hallId} value={h.hallNumber}>
                        Hall {h.hallNumber} ({h.allocated}/{h.capacity})
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" />
                  Filled Seat
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-50 border border-dashed border-slate-300 inline-block" />
                  Empty Seat
                </span>
              </div>
            </div>

            {paginatedHalls.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No allocated halls to display.
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedHalls.map((hall) => {
                  const hallSeats = (activePlan?.allocations || []).filter(
                    (a) => a.hallNumber === hall.hallNumber
                  );
                  const seatByNumber = new Map(hallSeats.map((s) => [s.seatNumber, s]));
                  const totalSeats = hall.capacity;

                  return (
                    <div
                      key={hall.hallId}
                      className="border border-slate-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">
                            Hall {hall.hallNumber} · {hall.building}
                          </h4>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {hall.allocated} filled · {hall.capacity - hall.allocated} empty · {hall.capacity} total seats
                            {hall.departmentBreakdown?.length > 0 &&
                              ` · ${hall.departmentBreakdown
                                .map((b) => `${b.department} (${b.regNoRange})`)
                                .join(' + ')}`}
                          </p>
                        </div>
                      </div>

                      <div
                        className="grid gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
                        }}
                      >
                        {Array.from({ length: totalSeats }, (_, idx) => {
                          const seatNo = idx + 1;
                          const occupant = seatByNumber.get(seatNo);

                          if (occupant) {
                            return (
                              <div
                                key={seatNo}
                                title={`${occupant.regNo} - ${occupant.studentName} (${occupant.department})`}
                                className="p-2 rounded-lg border border-blue-200 bg-blue-50/70 text-xs"
                              >
                                <div className="flex items-center justify-between font-mono text-[11px] font-semibold text-blue-800">
                                  <span>S{seatNo}</span>
                                  <span>R{occupant.rowNumber}</span>
                                </div>
                                <div className="font-mono text-[11px] font-medium text-slate-900 truncate mt-0.5">
                                  {occupant.regNo}
                                </div>
                                <div className="text-[10px] text-slate-600 truncate">
                                  {occupant.department}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={seatNo}
                              className="p-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-400"
                            >
                              <div className="font-mono text-[11px]">S{seatNo}</div>
                              <div className="text-[10px] mt-0.5">Empty</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedHall === 'ALL' && visibleHalls.length > hallsPerPage && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <PaginationBar
                  totalItems={visibleHalls.length}
                  page={hallPage}
                  pageSize={hallsPerPage}
                  onPageChange={setHallPage}
                  itemLabel="halls"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
