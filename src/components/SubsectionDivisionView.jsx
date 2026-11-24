import React, { useMemo, useState, useEffect } from 'react';
import {
  Users,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';
import {
  compareStudentNames,
  divideDepartmentStudents,
  normalizeSubsectionLabel,
  validateStudentList,
  buildSubsectionCSV,
} from '../utils/subsectionDivision.js';
import { PaginationBar } from './PaginationBar.jsx';

export function SubsectionDivisionView({
  students,
  departments,
  subsectionRecords = [],
  onApproveSubsection,
  onUpdateStudents,
}) {
  const deptNames = useMemo(() => {
    const fromDepts = (departments || [])
      .map((d) => (typeof d === 'string' ? d : d?.name || d?.departmentName))
      .filter(Boolean);
    const fromStudents = Array.from(new Set(students.map((s) => s.department).filter(Boolean)));
    return Array.from(new Set([...fromDepts, ...fromStudents]));
  }, [departments, students]);

  const [selectedDept, setSelectedDept] = useState(deptNames[0] || '');
  const [subsectionCount, setSubsectionCount] = useState(3);
  const [selectedSubsection, setSelectedSubsection] = useState('ALL');
  const [approvalNotice, setApprovalNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!selectedDept && deptNames.length > 0) {
      setSelectedDept(deptNames[0]);
    }
  }, [deptNames, selectedDept]);

  const deptStudents = useMemo(
    () => students.filter((s) => s.department === selectedDept),
    [students, selectedDept]
  );

  const validation = useMemo(() => validateStudentList(deptStudents), [deptStudents]);

  const previewDivision = useMemo(
    () => divideDepartmentStudents(students, selectedDept, subsectionCount),
    [students, selectedDept, subsectionCount]
  );

  const needsRebalance = useMemo(() => {
    const previewMap = new Map(
      previewDivision.assignedStudents.map((s) => [s.id, normalizeSubsectionLabel(s.section)])
    );
    return deptStudents.some(
      (s) => normalizeSubsectionLabel(s.section) !== previewMap.get(s.id)
    );
  }, [deptStudents, previewDivision]);

  const displayedStudents = useMemo(() => {
    return deptStudents
      .filter((s) =>
        selectedSubsection === 'ALL'
          ? true
          : normalizeSubsectionLabel(s.section) === selectedSubsection
      )
      .sort((a, b) => {
        const secA = normalizeSubsectionLabel(a.section);
        const secB = normalizeSubsectionLabel(b.section);
        if (secA !== secB) return secA.localeCompare(secB);
        return compareStudentNames(a, b);
      });
  }, [deptStudents, selectedSubsection]);

  useEffect(() => {
    setPage(1);
  }, [selectedDept, selectedSubsection]);

  const paginatedStudents = useMemo(() => {
    const start = (page - 1) * pageSize;
    return displayedStudents.slice(start, start + pageSize);
  }, [displayedStudents, page, pageSize]);

  const actualSubsectionCounts = useMemo(() => {
    const counts = new Map();
    for (const s of deptStudents) {
      const label = normalizeSubsectionLabel(s.section);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));
  }, [deptStudents]);

  const latestSavedForDept = useMemo(() => {
    return (subsectionRecords || []).find((r) => r.department === selectedDept) || null;
  }, [subsectionRecords, selectedDept]);

  const handleApproveRebalance = async () => {
    setIsSaving(true);
    try {
      if (onApproveSubsection) {
        const ok = await onApproveSubsection(
          selectedDept,
          subsectionCount,
          previewDivision.assignedStudents
        );
        if (ok === false) return;
      } else if (onUpdateStudents) {
        const updatedMap = new Map(previewDivision.assignedStudents.map((s) => [s.id, s]));
        const nextStudents = students.map((s) => (updatedMap.has(s.id) ? updatedMap.get(s.id) : s));
        onUpdateStudents(nextStudents);
      }
      setSelectedSubsection('ALL');
      setApprovalNotice(
        `Saved & Approved: ${selectedDept} (${previewDivision.totalStudents} students) divided into ${subsectionCount} alphabetical subsection(s).`
      );
      setTimeout(() => setApprovalNotice(''), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const csv = buildSubsectionCSV(students, selectedDept, selectedSubsection);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeDept = selectedDept.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const suffix =
      selectedSubsection === 'ALL' ? 'all_subsections' : `subsection_${selectedSubsection}`;
    link.setAttribute('download', `${safeDept}_${suffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Controls & Summary Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-700" />
              Department-Wise Subsection Division
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Divide department students into alphabetical A–Z subsections while preserving registration numbers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Department
              </label>
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSelectedSubsection('ALL');
                }}
                className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {deptNames.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Subsections (A, B, C...)
              </label>
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={subsectionCount}
                  onChange={(e) =>
                    setSubsectionCount(
                      Math.max(1, Math.min(10, Number(e.target.value) || 1))
                    )
                  }
                  className="w-20 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex items-end gap-2 pt-5">
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>
        </div>

        {/* Approval Notice */}
        {approvalNotice && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {approvalNotice}
          </div>
        )}

        {/* Rebalance Approval Banner */}
        {needsRebalance && (
          <div className="mt-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <span className="font-semibold">Administrator Approval Required:</span>{' '}
                {selectedDept} has{' '}
                <span className="font-semibold tabular-nums">{deptStudents.length}</span>{' '}
                students. Rebalance into{' '}
                <span className="font-semibold tabular-nums">{subsectionCount}</span>{' '}
                alphabetical subsection(s)?
              </div>
            </div>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleApproveRebalance}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
              {isSaving ? 'Saving...' : 'Approve & Rebalance'}
            </button>
          </div>
        )}

        {/* Validation Warning */}
        {!validation.isValid && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-sm text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Validation Warning:
              {validation.duplicateRegNos.length > 0 &&
                ` Duplicate RegNo(s): ${validation.duplicateRegNos.join(', ')}.`}
              {validation.missingRegNos.length > 0 &&
                ` Missing RegNo for: ${validation.missingRegNos.join(', ')}.`}
            </span>
          </div>
        )}
      </div>

      {/* Subsection Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setSelectedSubsection('ALL')}
          className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
            selectedSubsection === 'ALL'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-medium text-slate-500">All Subsections</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {deptStudents.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Alphabetical A–Z</div>
        </button>

        {actualSubsectionCounts.map((sub) => (
          <button
            type="button"
            key={sub.label}
            onClick={() => setSelectedSubsection(sub.label)}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              selectedSubsection === sub.label
                ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium text-slate-500">Subsection {sub.label}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {sub.count}
            </div>
            <div className="text-xs text-slate-500 mt-1">Alphabetical A–Z</div>
          </button>
        ))}
      </div>

      {/* Student Roster Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {selectedDept} —{' '}
            {selectedSubsection === 'ALL'
              ? 'All Subsections'
              : `Subsection ${selectedSubsection}`}{' '}
            (<span className="tabular-nums">{displayedStudents.length}</span> students)
          </h3>
          <span className="text-xs text-slate-500">
            {latestSavedForDept
              ? `Saved allocation: ${latestSavedForDept.subsectionCount} subsection(s)`
              : 'Sorted Alphabetically (First Name Primary)'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-20">S.No.</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Registration Number</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 w-28">Subsection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {displayedStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No students found in this department/subsection.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((stu, idx) => (
                  <tr key={stu.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-slate-500 tabular-nums">
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{stu.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums">
                      {stu.regNo}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{stu.department}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-blue-700">
                      {normalizeSubsectionLabel(stu.section)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          totalItems={displayedStudents.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="students"
        />
      </div>
    </div>
  );
}
