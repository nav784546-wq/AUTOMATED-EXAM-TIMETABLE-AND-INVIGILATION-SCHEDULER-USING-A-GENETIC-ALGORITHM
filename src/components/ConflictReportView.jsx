import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, UserCheck, Save, Info } from 'lucide-react';
import { PaginationBar } from './PaginationBar.jsx';
import { getSessionBadgeClasses } from '../utils/sessionStyles.js';

export const ConflictReportView = ({
  gaResult,
  faculty,
  latestSavedReport = null,
  onSaveConflictReport,
  onOverrideFaculty,
}) => {
  const [showAllExams, setShowAllExams] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const conflictRows = useMemo(() => {
    return gaResult.schedule.filter(
      (item) =>
        item.hasStudentClash ||
        item.hasInvigilatorConflict ||
        item.hasCapacityIssue ||
        item.hasHallDoubleBooking ||
        item.hasDepartmentDateViolation ||
        item.hasDepartmentGapViolation ||
        item.hasDepartmentIndependenceViolation
    );
  }, [gaResult.schedule]);

  const displayedRows = showAllExams ? gaResult.schedule : conflictRows;
  const deptWarnings = Number(gaResult.conflicts?.departmentWarnings || 0);
  const validationWarnings = Array.isArray(gaResult.conflicts?.validationWarnings)
    ? gaResult.conflicts.validationWarnings
    : [];

  useEffect(() => {
    setPage(1);
  }, [showAllExams, displayedRows.length]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return displayedRows.slice(start, start + pageSize);
  }, [displayedRows, page, pageSize]);

  const getViolationLabels = (item) => {
    const labels = [];
    if (item.hasStudentClash) labels.push('Student Clash');
    if (item.hasInvigilatorConflict) labels.push('Invigilator Conflict');
    if (item.hasCapacityIssue) labels.push('Hall Capacity Exceeded');
    if (item.hasHallDoubleBooking) labels.push('Hall Double-Booking');
    if (item.hasDepartmentDateViolation) labels.push('Same-Day Dept Violation');
    if (item.hasDepartmentGapViolation) labels.push('Min-Gap Violation');
    if (item.hasDepartmentIndependenceViolation) labels.push('Multi-Dept Date Violation');
    return labels;
  };

  return (
    <div className="space-y-6">
      {/* Conflict Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Student Clashes', count: gaResult.conflicts.studentClashes || 0 },
          { label: 'Invigilator Conflicts', count: gaResult.conflicts.invigilatorConflicts || 0 },
          { label: 'Capacity Violations', count: gaResult.conflicts.capacityViolations || 0 },
          { label: 'Hall Double-Bookings', count: gaResult.conflicts.hallDoubleBookings || 0 },
          { label: 'Same-Day Dept Violations', count: gaResult.conflicts.departmentSameDayViolations || 0 },
          { label: 'Min-Gap Violations', count: gaResult.conflicts.departmentGapViolations || 0 },
        ].map((stat) => {
          const ok = stat.count === 0;
          return (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500 mb-1">{stat.label}</div>
              <div className="flex items-center justify-between">
                <span className={`text-2xl font-bold font-mono tabular-nums ${ok ? 'text-slate-900' : 'text-red-700'}`}>
                  {stat.count}
                </span>
                {ok ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" /> Clear
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                    <AlertTriangle className="w-4 h-4" /> Action Needed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {validationWarnings.length > 0 && (
        <div
          data-testid="dept-date-validation-warnings"
          className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-900 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            Department Date &amp; Gap Policy Violations ({validationWarnings.length})
          </div>
          {validationWarnings.map((warn, idx) => (
            <div key={idx} className="pl-5">
              • {warn}
            </div>
          ))}
        </div>
      )}

      {deptWarnings > 0 && (
        <div
          data-testid="department-warnings-advisory"
          className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900"
        >
          <Info className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong className="font-semibold">Parallel Department Advisory ({deptWarnings}):</strong>{' '}
            Same-department examinations in disjoint batches, semesters, or sections share a time slot without overlapping student enrollments and are not counted as hard student clashes.
          </span>
        </div>
      )}

      {/* Conflict & Override Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Schedule Conflict Report &amp; Faculty Overrides
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {conflictRows.length === 0
                ? 'No constraint violations detected in the current timetable.'
                : `${conflictRows.length} exam(s) have constraint violations requiring review.`}
              {latestSavedReport && (
                <span className="ml-2 text-emerald-700 font-medium">
                  · Last saved report: {latestSavedReport.totalHardViolations ?? 0} violation(s)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onSaveConflictReport && (
              <button
                type="button"
                disabled={savingReport}
                onClick={async () => {
                  setSavingReport(true);
                  try {
                    await onSaveConflictReport();
                  } finally {
                    setSavingReport(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {savingReport ? 'Saving...' : 'Save Conflict Report'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAllExams((prev) => !prev)}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              {showAllExams ? 'Show Conflicts Only' : `Show All Exams (${gaResult.schedule.length})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Date &amp; Session</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Hall</th>
                <th className="py-3 px-4">Violations</th>
                <th className="py-3 px-4">Assigned Invigilator (Manual Override)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="w-5 h-5" />
                      Zero conflicts detected. All exams, halls, and invigilators are verified.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((item) => {
                  const labels = getViolationLabels(item);
                  return (
                    <tr key={item.examId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-medium text-slate-900 tabular-nums">
                          {item.date}
                        </div>
                        <span
                          className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[11px] font-semibold ${getSessionBadgeClasses(
                            item.session
                          )}`}
                        >
                          {item.session}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {item.subjectCode} · {item.subjectName}
                        </div>
                        <div className="text-xs text-slate-500">{item.department}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900">
                        {item.hallNumber} ({item.enrolledCount}/{item.hallCapacity})
                      </td>
                      <td className="py-3 px-4">
                        {labels.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {labels.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                          <select
                            value={item.invigilatorId}
                            onChange={(e) => onOverrideFaculty(item.examId, e.target.value)}
                            aria-label={`Override invigilator for ${item.subjectCode}`}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            {faculty.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name} ({f.department}){!f.available ? ' - On Leave' : ''}
                              </option>
                            ))}
                          </select>
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
          totalItems={displayedRows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="exams"
        />
      </div>
    </div>
  );
};
