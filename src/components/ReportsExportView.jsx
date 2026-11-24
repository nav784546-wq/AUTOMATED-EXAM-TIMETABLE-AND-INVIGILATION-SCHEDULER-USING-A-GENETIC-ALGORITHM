import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { downloadTimetableCSV } from '../utils/exportReport.js';
import {
  exportDepartmentTimetableToExcel,
  formatExcelDateDDMMYYYY,
} from '../utils/excelTimetableExport.js';
import { getSessionBadgeClasses } from '../utils/sessionStyles.js';

export const ReportsExportView = ({ gaResult }) => {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [exportFeedback, setExportFeedback] = useState(null);

  const schedule = gaResult.schedule || [];

  const availableDepts = useMemo(() => {
    return Array.from(new Set(schedule.map((r) => r.department).filter(Boolean))).sort();
  }, [schedule]);

  const availableBatches = useMemo(() => {
    return Array.from(new Set(schedule.map((r) => r.batch).filter(Boolean))).sort();
  }, [schedule]);

  const availableSections = useMemo(() => {
    return Array.from(new Set(schedule.map((r) => r.section).filter(Boolean))).sort();
  }, [schedule]);

  const availableDates = useMemo(() => {
    return Array.from(new Set(schedule.map((r) => r.date).filter(Boolean))).sort();
  }, [schedule]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedule.filter((row) => {
      if (deptFilter !== 'ALL' && row.department !== deptFilter) return false;
      if (batchFilter !== 'ALL' && row.batch && row.batch !== batchFilter) return false;
      if (sectionFilter !== 'ALL' && row.section && row.section !== sectionFilter) return false;
      if (dateFilter !== 'ALL' && row.date !== dateFilter) return false;
      if (!q) return true;
      return (
        row.subjectCode.toLowerCase().includes(q) ||
        row.subjectName.toLowerCase().includes(q) ||
        row.hallNumber.toLowerCase().includes(q) ||
        row.invigilatorName.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q)
      );
    });
  }, [schedule, search, deptFilter, batchFilter, sectionFilter, dateFilter]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course, hall, invigilator..."
              aria-label="Search timetable report"
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">All Departments</option>
            {availableDepts.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {/* Batch / Academic Year Filter */}
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            aria-label="Filter by academic year batch"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">All Academic Years</option>
            {availableBatches.map((b) => (
              <option key={b} value={b}>
                Batch {b}
              </option>
            ))}
          </select>

          {/* Section Filter */}
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label="Filter by section"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">All Sections</option>
            {availableSections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by exam date"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
          >
            <option value="ALL">All Exam Dates</option>
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => downloadTimetableCSV(filteredRows, 'examgrid_full_timetable.csv')}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            data-testid="reports-export-excel-btn"
            disabled={filteredRows.length === 0}
            onClick={async () => {
              setExportFeedback(null);
              try {
                const res = await exportDepartmentTimetableToExcel(filteredRows, availableDepts, {
                  exportScope: deptFilter !== 'ALL' ? 'CURRENT' : 'ALL',
                  currentDepartment: deptFilter,
                  academicBatch: batchFilter !== 'ALL' ? batchFilter : undefined,
                });
                if (res.warnings?.length) {
                  setExportFeedback({
                    type: 'warning',
                    message: `${res.warnings.length} exam(s) skipped due to missing/invalid dates: ${res.warnings[0]}`,
                  });
                }
              } catch (err) {
                setExportFeedback({
                  type: 'error',
                  message: err instanceof Error ? err.message : 'Excel export failed validation.',
                });
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export to Excel (.xlsx)
          </button>
        </div>
        {exportFeedback && (
          <div
            role={exportFeedback.type === 'error' ? 'alert' : 'status'}
            className={`w-full rounded-lg border px-3 py-2 text-xs ${
              exportFeedback.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {exportFeedback.message}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Examination Timetable &amp; Invigilation Duty Report
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredRows.length} of {schedule.length} scheduled examinations · Utilization{' '}
              <span className="font-mono tabular-nums">{gaResult.conflicts?.utilizationRate || 0}%</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Session</th>
                <th className="py-3 px-4">Course Code</th>
                <th className="py-3 px-4">Subject Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Year / Batch</th>
                <th className="py-3 px-4">Section</th>
                <th className="py-3 px-4 text-right">Students</th>
                <th className="py-3 px-4">Hall</th>
                <th className="py-3 px-4 text-right">Capacity</th>
                <th className="py-3 px-4">Invigilator</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    No scheduled examinations match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.examId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {formatExcelDateDDMMYYYY(row.date) || row.date}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[11px] font-semibold ${getSessionBadgeClasses(
                          row.session
                        )}`}
                      >
                        {row.session}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{row.subjectCode}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{row.subjectName}</td>
                    <td className="py-3 px-4 text-slate-700">{row.department}</td>
                    <td className="py-3 px-4 text-slate-600">{row.batch || '—'}</td>
                    <td className="py-3 px-4 text-slate-600">{row.section || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                      {row.enrolledCount}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{row.hallNumber}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">{row.hallCapacity}</td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900">{row.invigilatorName}</span>
                      <span className="text-slate-400"> ({row.invigilatorDept})</span>
                    </td>
                    <td className="py-3 px-4">
                      {row.hasStudentClash || row.hasInvigilatorConflict || row.hasCapacityIssue || row.hasHallDoubleBooking ? (
                        <span className="inline-flex items-center gap-1 text-red-700 font-medium">Conflict</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">Verified</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
