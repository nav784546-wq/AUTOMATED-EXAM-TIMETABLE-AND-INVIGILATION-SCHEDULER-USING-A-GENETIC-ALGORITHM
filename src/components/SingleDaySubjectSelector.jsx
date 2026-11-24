import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Building2,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Wand2,
  Download,
} from 'lucide-react';
import {
  groupSubjectsByDepartment,
  selectSubjectForDepartment,
  validateSingleDaySelections,
  autoSelectFirstSubjectPerDepartment,
} from '../utils/singleDaySelection.js';
import { downloadSubjectSelectionSummaryCSV } from '../utils/exportReport.js';

const SINGLE_DAY_SESSIONS = [
  { value: 'BOTH', label: 'Both Sessions (FN & AN on Same Day)' },
  { value: 'FN (09:30 - 12:30)', label: 'Forenoon Only — FN (09:30 - 12:30)' },
  { value: 'AN (14:00 - 17:00)', label: 'Afternoon Only — AN (14:00 - 17:00)' },
];

export const SingleDaySubjectSelector = ({
  departments = [],
  subjects = [],
  selections = {},
  onChangeSelections,
  singleDayDate = '2026-11-16',
  onChangeSingleDayDate,
  singleDaySession = 'BOTH',
  onChangeSingleDaySession,
  onFinalizeSchedule,
}) => {
  const [finalizedNotice, setFinalizedNotice] = useState(null);

  const departmentGroups = useMemo(
    () => groupSubjectsByDepartment(departments, subjects),
    [departments, subjects]
  );

  const validation = useMemo(
    () => validateSingleDaySelections(departments, subjects, selections),
    [departments, subjects, selections]
  );

  const handleSelectSubject = (department, subjectId) => {
    setFinalizedNotice(null);
    const next = selectSubjectForDepartment(
      selections,
      department,
      subjectId,
      subjects
    );
    onChangeSelections(next);
  };

  const handleClearDepartment = (department) => {
    setFinalizedNotice(null);
    const next = selectSubjectForDepartment(selections, department, null, subjects);
    onChangeSelections(next);
  };

  const handleAutoSelect = () => {
    setFinalizedNotice(null);
    const next = autoSelectFirstSubjectPerDepartment(
      departments,
      subjects,
      selections
    );
    onChangeSelections(next);
  };

  const handleClearAll = () => {
    setFinalizedNotice(null);
    onChangeSelections({});
  };

  const handleFinalize = () => {
    if (!validation.isValid) return;
    onFinalizeSchedule({
      selectedSubjectIds: validation.selectedSubjectIds,
      selections,
      singleDayDate,
      singleDaySession,
      summaryRows: validation.summaryRows,
    });
    setFinalizedNotice({
      date: singleDayDate,
      count: validation.selectedSubjectIds.length,
      totalStudents: validation.totalEnrolledStudents,
    });
  };

  return (
    <div className="space-y-6" data-testid="single-day-subject-selector">
      {/* Configuration & Coverage Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-700" />
              Single-Day Department Subject Selection
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              All departments conduct their examination on the same day. Select strictly one subject per department before finalizing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoSelect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Auto-Select 1 per Dept
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear All
            </button>
          </div>
        </div>

        {/* Single Exam Day & Session Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="single-day-exam-date"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Single Examination Date
            </label>
            <input
              id="single-day-exam-date"
              type="date"
              value={singleDayDate}
              onChange={(e) => {
                setFinalizedNotice(null);
                onChangeSingleDayDate(e.target.value);
              }}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="single-day-exam-session"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Exam Day Session Window
            </label>
            <select
              id="single-day-exam-session"
              value={singleDaySession}
              onChange={(e) => {
                setFinalizedNotice(null);
                onChangeSingleDaySession(e.target.value);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {SINGLE_DAY_SESSIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <div
              className={`px-3.5 py-2 rounded-lg border text-xs flex items-center justify-between ${
                validation.isValid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <span className="font-medium flex items-center gap-1.5">
                {validation.isValid ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                Department Coverage
              </span>
              <span className="font-mono font-bold tabular-nums">
                {validation.coveredCount} / {validation.totalDepartments}
              </span>
            </div>
          </div>
        </div>

        {/* Missing departments warning */}
        {!validation.isValid && (
          <div
            role="alert"
            className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1"
          >
            {validation.missingDepartments.length > 0 && (
              <div>
                <span className="font-semibold">Pending department selection: </span>
                <span>{validation.missingDepartments.join(', ')}</span>
              </div>
            )}
            {validation.departmentsWithoutSubjects.length > 0 && (
              <div>
                <span className="font-semibold">Departments with no available subjects: </span>
                <span>{validation.departmentsWithoutSubjects.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {finalizedNotice && (
          <div
            role="status"
            className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Finalized single-day examination schedule for{' '}
              <strong className="font-mono">{finalizedNotice.date}</strong>:{' '}
              <strong className="font-mono tabular-nums">{finalizedNotice.count}</strong>{' '}
              departments scheduled (
              <strong className="font-mono tabular-nums">{finalizedNotice.totalStudents}</strong>{' '}
              students). Review hall &amp; invigilator assignments in Exam Scheduler.
            </span>
          </div>
        )}
      </div>

      {/* Department-Wise Subject Selection Cards (Strictly 1 Subject per Department) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {departmentGroups.map(({ department, subjects: deptSubjects }) => {
          const selectedId = selections[department] || '';
          const selectedSub = deptSubjects.find((s) => s.id === selectedId);
          const groupName = `single-day-dept-${department.replace(/[^a-zA-Z0-9]/g, '-')}`;

          return (
            <div
              key={department}
              data-testid={`dept-subject-card-${department}`}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
            >
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                  <h4 className="text-sm font-semibold text-slate-900 truncate">
                    {department}
                  </h4>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {selectedSub ? (
                    <>
                      <span className="text-emerald-700 font-medium font-mono">
                        {selectedSub.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleClearDepartment(department)}
                        className="text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <span className="text-amber-700 font-medium">
                      Select 1 subject
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 flex-1">
                {deptSubjects.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                    No subjects available in this department. Add a subject in the Subjects tab first.
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label={`Select one subject for ${department}`}
                    className="space-y-2"
                  >
                    {deptSubjects.map((sub) => {
                      const isSelected = selectedId === sub.id;
                      return (
                        <label
                          key={sub.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/70 border-blue-400'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                          }`}
                        >
                          <input
                            type="radio"
                            name={groupName}
                            value={sub.id}
                            checked={isSelected}
                            onChange={() => handleSelectSubject(department, sub.id)}
                            className="mt-0.5 accent-blue-700 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900 truncate">
                                {sub.name}
                              </span>
                              <span className="font-mono text-xs font-medium text-blue-700 shrink-0">
                                {sub.code}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>Sem {sub.semester}</span>
                              <span aria-hidden="true">·</span>
                              <span>Batch {sub.batch}</span>
                              {sub.section && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{sub.section}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {sub.enrolledCount} students
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Department-Wise Summary & Finalization */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-700" />
              Department-Wise Selected Subjects Summary
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Date: <span className="font-mono font-medium text-slate-700">{singleDayDate}</span>{' '}
              · <span className="font-mono tabular-nums">{validation.coveredCount}</span> of{' '}
              <span className="font-mono tabular-nums">{validation.totalDepartments}</span>{' '}
              departments ready ·{' '}
              <span className="font-mono tabular-nums">{validation.totalEnrolledStudents}</span>{' '}
              total students
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={validation.summaryRows.length === 0}
              onClick={() =>
                downloadSubjectSelectionSummaryCSV(validation.summaryRows, {
                  singleDayDate,
                  singleDaySession,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                validation.summaryRows.length === 0
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Export Summary CSV
            </button>

            <button
              type="button"
              disabled={!validation.isValid}
              onClick={handleFinalize}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                validation.isValid
                  ? 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Finalize Single-Day Examination Schedule
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-medium">
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Subject Code</th>
                <th className="py-2.5 px-4">Selected Subject</th>
                <th className="py-2.5 px-4">Sem / Batch</th>
                <th className="py-2.5 px-4 text-right">Students</th>
                <th className="py-2.5 px-4">Coverage Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {validation.summaryRows.map((row) => (
                <tr key={row.department} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {row.department}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-700">
                    {row.subjectCode || '—'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-800">
                    {row.subjectName || 'No subject selected'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {row.status === 'SELECTED'
                      ? `Sem ${row.semester} · Batch ${row.batch}`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800">
                    {row.status === 'SELECTED' ? row.enrolledCount : '—'}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {row.status === 'SELECTED' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Covered (1 Selected)
                      </span>
                    ) : row.status === 'NO_SUBJECTS' ? (
                      <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        No Subjects Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Pending Selection
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
