import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Building2,
  BookOpen,
  Layers,
  Users,
  Calendar,
  SlidersHorizontal,
  RotateCcw,
  Trash2,
  History,
} from 'lucide-react';
import { SingleDaySubjectSelector } from './SingleDaySubjectSelector.jsx';
import { GAConfigurationPanel } from './GAConfigurationPanel.jsx';
import { validateSingleDaySelections } from '../utils/singleDaySelection.js';
import { DEFAULT_CONSTRAINT_CONFIG } from '../utils/geneticAlgorithm.js';
import { DEFAULT_GA_PARAMETERS } from '../utils/gaConfig.js';

export const GASchedulerView = ({
  config,
  savedConfig = DEFAULT_GA_PARAMETERS,
  isSavingConfig = false,
  onSaveConfig,
  onChangeConfig,
  gaResult,
  optimizationRuns = [],
  onRestoreOptimizationRun,
  onDeleteOptimizationRun,
  onRunGA,
  isGARunning = false,
  gaProgress = null,
  onCancelGA,
  departments = [],
  subjects = [],
  students = [],
  batches = ['2023', '2024', '2025'],
  sectionsByDept = {},
  singleDaySelections = {},
  onChangeSingleDaySelections,
  singleDayDate = '2026-11-16',
  onChangeSingleDayDate,
  singleDaySession = 'BOTH',
  onChangeSingleDaySession,
  onFinalizeSingleDaySchedule,
}) => {
  const [busyRunId, setBusyRunId] = useState(null);
  const constraintConfig = {
    ...DEFAULT_CONSTRAINT_CONFIG,
    ...(config.constraintConfig || {}),
  };

  const updateConstraint = (patch) => {
    onChangeConfig({
      ...config,
      constraintConfig: {
        ...constraintConfig,
        ...patch,
      },
    });
  };
  const isSelectedScope = config.scope === 'SELECTED';
  const isSingleDayScope = config.scope === 'SINGLE_DAY';

  const singleDayValidation = useMemo(
    () => validateSingleDaySelections(departments, subjects, singleDaySelections),
    [departments, subjects, singleDaySelections]
  );

  const selectedDepts = useMemo(() => {
    return Array.isArray(config.selectedDepartments) ? config.selectedDepartments : [];
  }, [config.selectedDepartments]);

  const selectedCourses = useMemo(() => {
    return Array.isArray(config.selectedCourses) ? config.selectedCourses : [];
  }, [config.selectedCourses]);

  const selectedSections = useMemo(() => {
    return Array.isArray(config.selectedSections) ? config.selectedSections : [];
  }, [config.selectedSections]);

  const selectedBatches = useMemo(() => {
    return Array.isArray(config.selectedBatches) ? config.selectedBatches : [];
  }, [config.selectedBatches]);

  // Available subjects matching selected departments
  const availableSubjects = useMemo(() => {
    if (selectedDepts.length === 0) return subjects;
    const deptSet = new Set(selectedDepts);
    return subjects.filter((s) => deptSet.has(s.department));
  }, [subjects, selectedDepts]);

  // Available sections matching selected departments
  const availableSections = useMemo(() => {
    const list = new Set();
    const depts = selectedDepts.length > 0 ? selectedDepts : departments;
    for (const d of depts) {
      const secs = sectionsByDept[d] || ['Section A', 'Section B'];
      secs.forEach((s) => list.add(s));
    }
    return Array.from(list);
  }, [selectedDepts, departments, sectionsByDept]);

  // Filtered student count
  const matchingStudentsCount = useMemo(() => {
    if (!isSelectedScope || selectedDepts.length === 0) return students.length;
    const deptSet = new Set(selectedDepts);
    return students.filter((st) => {
      if (!deptSet.has(st.department)) return false;
      if (selectedBatches.length > 0 && !selectedBatches.includes(st.batch)) return false;
      if (selectedSections.length > 0 && !selectedSections.includes(st.section)) return false;
      return true;
    }).length;
  }, [isSelectedScope, selectedDepts, selectedBatches, selectedSections, students]);

  // Toggle department
  const toggleDepartment = (dept) => {
    const next = selectedDepts.includes(dept)
      ? selectedDepts.filter((d) => d !== dept)
      : [...selectedDepts, dept];
    onChangeConfig({
      ...config,
      selectedDepartments: next,
    });
  };

  const selectAllDepartments = () => {
    onChangeConfig({
      ...config,
      selectedDepartments: [...departments],
    });
  };

  const clearDepartments = () => {
    onChangeConfig({
      ...config,
      selectedDepartments: [],
    });
  };

  // Toggle course
  const toggleCourse = (code) => {
    const next = selectedCourses.includes(code)
      ? selectedCourses.filter((c) => c !== code)
      : [...selectedCourses, code];
    onChangeConfig({
      ...config,
      selectedCourses: next,
    });
  };

  // Toggle section
  const toggleSection = (sec) => {
    const next = selectedSections.includes(sec)
      ? selectedSections.filter((s) => s !== sec)
      : [...selectedSections, sec];
    onChangeConfig({
      ...config,
      selectedSections: next,
    });
  };

  // Toggle batch
  const toggleBatch = (b) => {
    const next = selectedBatches.includes(b)
      ? selectedBatches.filter((item) => item !== b)
      : [...selectedBatches, b];
    onChangeConfig({
      ...config,
      selectedBatches: next,
    });
  };

  const history = gaResult.history || [];
  const maxFit = Math.max(...history.map((h) => h.bestFitness), 1000);
  const minFit = Math.min(...history.map((h) => h.avgFitness), 0);
  const range = Math.max(1, maxFit - minFit);

  const width = 640;
  const height = 220;
  const padX = 40;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const toPoints = (key) =>
    history
      .map((h, idx) => {
        const x = padX + (idx / Math.max(1, history.length - 1)) * plotW;
        const y = padY + plotH - ((h[key] - minFit) / range) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="space-y-6">
      {/* Scope Selector: Institution-Wide vs Department-Specific */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-700 shrink-0" />
              Examination Timetable Generation Scope
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose whether to generate the timetable for the entire institution, specific departments, or one subject per department on a single day.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg max-w-full self-start xl:self-auto">
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, scope: 'ALL' })}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                !isSelectedScope && !isSingleDayScope
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Institution-Wide (All)
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeConfig({
                  ...config,
                  scope: 'SELECTED',
                  selectedDepartments:
                    selectedDepts.length > 0 ? selectedDepts : [departments[0] || 'BCA (AI & DS)'],
                })
              }
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                isSelectedScope
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Department-Specific Scope
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeConfig({
                  ...config,
                  scope: 'SINGLE_DAY',
                  singleDayDate,
                  singleDaySession,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${
                isSingleDayScope
                  ? 'bg-white text-blue-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Single-Day (1 Subject / Dept)
            </button>
          </div>
        </div>

        {isSingleDayScope && (
          <div className="pt-2">
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
          </div>
        )}

        {/* Department-Specific Selection Controls */}
        {isSelectedScope && (
          <div className="space-y-4 pt-1">
            {/* Department Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  Select Department(s)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllDepartments}
                    className="text-xs text-blue-700 hover:underline font-medium cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={clearDepartments}
                    className="text-xs text-slate-500 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => {
                  const checked = selectedDepts.includes(dept);
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => toggleDepartment(dept)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                        checked
                          ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold ring-1 ring-blue-300'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="rounded text-blue-700 pointer-events-none"
                      />
                      {dept}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Course / Subject Filtering */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-slate-500" />
                  Courses &amp; Subjects in Selected Department(s)
                </label>
                {selectedCourses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ ...config, selectedCourses: [] })}
                    className="text-xs text-slate-500 hover:underline cursor-pointer"
                  >
                    Reset ({selectedCourses.length} selected)
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                {availableSubjects.map((sub) => {
                  const checked =
                    selectedCourses.length === 0 || selectedCourses.includes(sub.code);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => toggleCourse(sub.code)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                        checked && selectedCourses.length > 0
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-semibold'
                          : checked
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      <span className="font-mono">{sub.code}</span>
                      <span className="text-slate-500">· {sub.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section & Batch Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  Sections
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableSections.map((sec) => {
                    const checked =
                      selectedSections.length === 0 || selectedSections.includes(sec);
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => toggleSection(sec)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-all cursor-pointer ${
                          checked && selectedSections.length > 0
                            ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {sec}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  Academic Years / Batches
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {batches.map((b) => {
                    const checked =
                      selectedBatches.length === 0 || selectedBatches.includes(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleBatch(b)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-all cursor-pointer ${
                          checked && selectedBatches.length > 0
                            ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        Batch {b}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Scope Summary Badge */}
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg flex flex-wrap items-center justify-between text-xs text-blue-900 gap-2">
              <span className="font-medium">
                Scope Summary: {selectedDepts.length} department(s) selected ·{' '}
                {availableSubjects.length} subject(s) queued · ~{matchingStudentsCount} eligible students
              </span>
              <span className="text-slate-500">
                Single-dept = section/regNo order; Multi-dept = department shuffling
              </span>
            </div>
          </div>
        )}
      </div>

      {/* GA Configuration Panel & Fitness Convergence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 min-w-0">
          <GAConfigurationPanel
            config={config}
            savedConfig={savedConfig}
            onChangeConfig={onChangeConfig}
            onSaveConfig={onSaveConfig}
            isSavingConfig={isSavingConfig}
            onRunGA={() => {
              if (isSingleDayScope) {
                if (!singleDayValidation.isValid || !onFinalizeSingleDaySchedule) return;
                onFinalizeSingleDaySchedule({
                  selectedSubjectIds: singleDayValidation.selectedSubjectIds,
                  selections: singleDaySelections,
                  singleDayDate,
                  singleDaySession,
                  summaryRows: singleDayValidation.summaryRows,
                });
                return;
              }
              onRunGA();
            }}
            onCancelGA={onCancelGA}
            isGARunning={isGARunning}
            gaProgress={gaProgress}
            subjectCount={availableSubjects.length}
            runButtonDisabled={isSingleDayScope && !singleDayValidation.isValid}
            runButtonLabel={
              isGARunning
                ? 'Optimizing Timetable...'
                : isSingleDayScope
                ? singleDayValidation.isValid
                  ? 'Finalize Single-Day Timetable'
                  : `Select 1 Subject per Dept (${singleDayValidation.coveredCount}/${singleDayValidation.totalDepartments})`
                : isSelectedScope
                ? `Generate ${selectedDepts.length > 0 ? selectedDepts.length : 'Selected'} Dept Timetable`
                : 'Generate Institution-Wide Timetable'
            }
          />
        </div>

        <div className="lg:col-span-7 min-w-0 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Fitness Convergence</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Best vs. population average fitness across {config.generations} generations
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-blue-700 inline-block" /> Best Fitness
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-slate-400 inline-block" /> Avg Fitness
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
              <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#E2E8F0" strokeWidth="1" />
              <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#E2E8F0" strokeWidth="1" />
              <polyline
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                points={toPoints('avgFitness')}
              />
              <polyline
                fill="none"
                stroke="#1D4ED8"
                strokeWidth="2.5"
                points={toPoints('bestFitness')}
              />
              <text x={padX - 6} y={padY + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                {Math.round(maxFit)}
              </text>
              <text x={padX - 6} y={height - padY} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                {Math.round(minFit)}
              </text>
              <text x={padX} y={height - 6} className="fill-slate-400 text-[10px] font-mono">
                Gen 1
              </text>
              <text x={width - padX} y={height - 6} textAnchor="end" className="fill-slate-400 text-[10px] font-mono">
                Gen {history.length}
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* GA Constraint Rules & Penalty Weights */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-700" />
              Constraint Rules &amp; Optimization Weights
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tune hard violation penalties and soft scheduling objectives used by both the Web Worker and Server Worker Service.
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateConstraint({ ...DEFAULT_CONSTRAINT_CONFIG })}
            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
          >
            Reset Constraint Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-700">
              <label htmlFor="cc-hard">Hard Violation Penalty</label>
              <span className="font-mono tabular-nums">{constraintConfig.hardConstraintWeight}</span>
            </div>
            <input
              id="cc-hard"
              type="range"
              min={500}
              max={5000}
              step={250}
              value={constraintConfig.hardConstraintWeight}
              onChange={(e) => updateConstraint({ hardConstraintWeight: Number(e.target.value) })}
              className="w-full accent-blue-700"
            />
            <p className="text-[11px] text-slate-500">Clashes, double-bookings, capacity breaches</p>
          </div>

          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-700">
              <label htmlFor="cc-workload">Faculty Fairness Weight</label>
              <span className="font-mono tabular-nums">{constraintConfig.workloadBalanceWeight}</span>
            </div>
            <input
              id="cc-workload"
              type="range"
              min={0}
              max={60}
              step={5}
              value={constraintConfig.workloadBalanceWeight}
              onChange={(e) => updateConstraint({ workloadBalanceWeight: Number(e.target.value) })}
              className="w-full accent-blue-700"
            />
            <p className="text-[11px] text-slate-500">Balances invigilation duties (StdDev)</p>
          </div>

          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-700">
              <label htmlFor="cc-sameday">Same-Day Spread Penalty</label>
              <span className="font-mono tabular-nums">{constraintConfig.sameDayCohortPenalty}</span>
            </div>
            <input
              id="cc-sameday"
              type="range"
              min={0}
              max={100}
              step={5}
              value={constraintConfig.sameDayCohortPenalty}
              onChange={(e) => updateConstraint({ sameDayCohortPenalty: Number(e.target.value) })}
              className="w-full accent-blue-700"
            />
            <p className="text-[11px] text-slate-500">Avoids 2 exams on same day for a cohort</p>
          </div>

          <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-700">
              <label htmlFor="cc-util">Hall Utilization Weight</label>
              <span className="font-mono tabular-nums">{constraintConfig.hallUtilizationWeight}</span>
            </div>
            <input
              id="cc-util"
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={constraintConfig.hallUtilizationWeight}
              onChange={(e) => updateConstraint({ hallUtilizationWeight: Number(e.target.value) })}
              className="w-full accent-blue-700"
            />
            <p className="text-[11px] text-slate-500">Prefers tighter room-to-class capacity fit</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-slate-700">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={constraintConfig.enforceMaxDuties}
              onChange={(e) => updateConstraint({ enforceMaxDuties: e.target.checked })}
              className="rounded text-blue-700"
            />
            <span>Enforce Faculty Max-Duties Limit</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={constraintConfig.preventSameCohortDoubleExamPerDay}
              onChange={(e) =>
                updateConstraint({ preventSameCohortDoubleExamPerDay: e.target.checked })
              }
              className="rounded text-blue-700"
            />
            <span>Penalize Multiple Exams per Cohort on Same Date</span>
          </label>
        </div>

        {/* Department-Wise Examination Date Allocation Policy */}
        <div
          data-testid="dept-scheduling-policy-section"
          className="pt-4 border-t border-slate-200 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Department-Wise Date Allocation &amp; Gap Policy
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Enforces independent per-department schedules across FN &amp; AN sessions with mandatory intervening gap days.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="policy-min-gap-days"
                className="text-xs font-medium text-slate-700 whitespace-nowrap"
              >
                Min Complete Gap Days:
              </label>
              <select
                id="policy-min-gap-days"
                data-testid="policy-min-gap-select"
                value={constraintConfig.minGapDaysBetweenExams ?? 2}
                onChange={(e) =>
                  updateConstraint({ minGapDaysBetweenExams: Number(e.target.value) })
                }
                className="px-2.5 py-1 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((days) => (
                  <option key={days} value={days}>
                    {days} day{days === 1 ? '' : 's'} {days === 2 ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
              <input
                type="checkbox"
                data-testid="policy-one-exam-per-day"
                checked={Boolean(constraintConfig.oneExamPerDeptPerDay)}
                onChange={(e) => updateConstraint({ oneExamPerDeptPerDay: e.target.checked })}
                className="mt-0.5 rounded text-blue-700"
              />
              <div>
                <div className="font-semibold text-slate-800">
                  One examination per department per day
                </div>
                <div className="text-[11px] text-slate-500">
                  Blocks scheduling two subjects in the same department on one calendar date.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
              <input
                type="checkbox"
                data-testid="policy-independent-dept"
                checked={Boolean(constraintConfig.independentDeptScheduling)}
                onChange={(e) =>
                  updateConstraint({ independentDeptScheduling: e.target.checked })
                }
                className="mt-0.5 rounded text-blue-700"
              />
              <div>
                <div className="font-semibold text-slate-800">
                  Department-wise independent scheduling
                </div>
                <div className="text-[11px] text-slate-500">
                  Each department maintains its own date gaps without blocking other departments.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
              <input
                type="checkbox"
                data-testid="policy-allow-same-day-fn-an"
                checked={Boolean(constraintConfig.allowSameDayFnAnPerDept)}
                onChange={(e) =>
                  updateConstraint({ allowSameDayFnAnPerDept: e.target.checked })
                }
                className="mt-0.5 rounded text-blue-700"
              />
              <div>
                <div className="font-semibold text-slate-800">
                  Allow FN &amp; AN exams on same day within a department
                </div>
                <div className="text-[11px] text-slate-500">
                  Disabled by default so FN and AN cannot bypass the 1-exam-per-day limit.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
              <input
                type="checkbox"
                data-testid="policy-allow-multi-dept-same-date"
                checked={Boolean(constraintConfig.allowMultipleDeptsSameDate)}
                onChange={(e) =>
                  updateConstraint({ allowMultipleDeptsSameDate: e.target.checked })
                }
                className="mt-0.5 rounded text-blue-700"
              />
              <div>
                <div className="font-semibold text-slate-800">
                  Allow different departments on the same date
                </div>
                <div className="text-[11px] text-slate-500">
                  Enabled by default; shared halls, invigilators, and enrolled students remain checked.
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Constraint Verification Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Constraint Verification Summary</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              Same-Day Overlaps:{' '}
              <strong className="text-slate-900">
                {gaResult.constraintReport?.softMetrics?.sameDayCohortOverlaps ?? 0}
              </strong>
            </span>
            <span>·</span>
            <span>
              Workload StdDev:{' '}
              <strong className="text-slate-900">
                {gaResult.conflicts?.workloadStdDev ?? 0}
              </strong>
            </span>
            <span>·</span>
            <span>
              Hall Fit:{' '}
              <strong className="text-slate-900">
                {gaResult.conflicts?.utilizationRate ?? 0}%
              </strong>
            </span>
            <span>·</span>
            <span>
              Converged Gen{' '}
              <strong className="text-slate-900">{gaResult.convergedAtGeneration || 0}</strong> (
              {gaResult.executionTimeMs || 0}ms)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Student Timetable Clashes', count: gaResult.conflicts?.studentClashes || 0 },
            { label: 'Invigilator Conflicts', count: gaResult.conflicts?.invigilatorConflicts || 0 },
            { label: 'Hall Capacity Violations', count: gaResult.conflicts?.capacityViolations || 0 },
            { label: 'Hall Double-Bookings', count: gaResult.conflicts?.hallDoubleBookings || 0 },
            { label: 'Same-Day Dept Violations', count: gaResult.conflicts?.departmentSameDayViolations || 0 },
            { label: 'Min-Gap Violations', count: gaResult.conflicts?.departmentGapViolations || 0 },
          ].map((item) => {
            const ok = item.count === 0;
            return (
              <div key={item.label} className="border border-slate-200 rounded-lg p-4">
                <div className="text-xs font-medium text-slate-500 mb-1">{item.label}</div>
                <div className="flex items-center justify-between">
                  <span className={`text-xl font-bold font-mono tabular-nums ${ok ? 'text-slate-900' : 'text-red-700'}`}>
                    {item.count}
                  </span>
                  {ok ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" /> Pass
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                      <AlertTriangle className="w-4 h-4" /> Violation
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {Array.isArray(gaResult.conflicts?.validationWarnings) &&
          gaResult.conflicts.validationWarnings.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 text-xs text-red-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                Department Schedule Validation Warnings
              </div>
              {gaResult.conflicts.validationWarnings.map((warn, idx) => (
                <div key={idx} className="pl-5">
                  • {warn}
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Stored Optimization Runs (Firestore / Database History) */}
      <div
        data-testid="optimization-runs-section"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-blue-700" />
              Stored Optimization Runs
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Persisted GA worker runs with constraint configurations, convergence metrics, and restorable timetables.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {optimizationRuns.length} run{optimizationRuns.length === 1 ? '' : 's'} stored
          </span>
        </div>

        {optimizationRuns.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No optimization runs stored yet. Run the Genetic Algorithm above to persist a run to the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-semibold">Run / Schedule ID</th>
                  <th className="py-3 px-4 font-semibold">Engine</th>
                  <th className="py-3 px-4 font-semibold">Scope</th>
                  <th className="py-3 px-4 font-semibold">Fitness</th>
                  <th className="py-3 px-4 font-semibold">Hard / Same-Day</th>
                  <th className="py-3 px-4 font-semibold">Runtime</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {optimizationRuns.map((run) => {
                  const isActive = run.scheduleId === gaResult.scheduleId;
                  const hardCount = run.conflicts?.totalHardViolations ?? 0;
                  const sameDayCount =
                    run.constraintReport?.softMetrics?.sameDayCohortOverlaps ?? 0;
                  const isBusy = busyRunId === run.id;
                  return (
                    <tr
                      key={run.id}
                      className={isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'}
                    >
                      <td className="py-3 px-4 font-mono text-slate-800">
                        <div className="font-semibold">{run.id}</div>
                        <div className="text-[11px] text-slate-500">{run.scheduleId}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {run.executionMode === 'SERVER_WORKER' ? 'Server Worker' : 'Web Worker'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{run.scope || 'ALL'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900">
                        {Number(run.bestFitness || 0).toFixed(1)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <span className={hardCount === 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                          {hardCount} hard
                        </span>
                        <span className="text-slate-400"> · </span>
                        <span className="text-slate-600">{sameDayCount} same-day</span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {run.executionTimeMs || 0}ms · Gen {run.convergedAtGeneration || 0}/
                        {run.generations || 50}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {onRestoreOptimizationRun && (
                          <button
                            type="button"
                            disabled={isActive || isBusy}
                            onClick={async () => {
                              setBusyRunId(run.id);
                              try {
                                await onRestoreOptimizationRun(run);
                              } finally {
                                setBusyRunId(null);
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                              isActive
                                ? 'bg-blue-50 border-blue-200 text-blue-700 cursor-default'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <RotateCcw className="w-3 h-3" />
                            {isActive ? 'Active' : 'Restore'}
                          </button>
                        )}
                        {onDeleteOptimizationRun && (
                          <button
                            type="button"
                            disabled={isBusy}
                            aria-label={`Delete run ${run.id}`}
                            onClick={async () => {
                              setBusyRunId(run.id);
                              try {
                                await onDeleteOptimizationRun(run.id);
                              } finally {
                                setBusyRunId(null);
                              }
                            }}
                            className="inline-flex items-center p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
