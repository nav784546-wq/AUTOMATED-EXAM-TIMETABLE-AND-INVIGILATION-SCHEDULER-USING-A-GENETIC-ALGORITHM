import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Columns3,
  FileDown,
  Printer,
  RotateCcw,
} from 'lucide-react';
import {
  DEFAULT_PRINT_DOCUMENT_TITLE,
  DEFAULT_PRINT_INSTITUTION_NAME,
  downloadTimetablePDF,
  getPrintableColumns,
  preparePrintableTimetableData,
} from '../utils/timetablePrintPdf.js';

function PrintableTable({ rows, columns }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-[11px] sm:text-xs text-slate-900">
        <thead>
          <tr className="bg-slate-900 text-white">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`border border-slate-700 px-2.5 py-2 font-semibold whitespace-nowrap ${
                  col.align === 'center'
                    ? 'text-center'
                    : col.align === 'right'
                    ? 'text-right'
                    : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.examId}
              className="odd:bg-white even:bg-slate-50/80 print-avoid-break"
            >
              {columns.map((col) => {
                const value = row[col.key] ?? '—';
                const isMono =
                  col.key === 'sNo' ||
                  col.key === 'dateDisplay' ||
                  col.key === 'subjectCode' ||
                  col.key === 'batch';
                const isDate = col.key === 'dateDisplay';
                const isSubject = col.key === 'subjectName';

                return (
                  <td
                    key={col.key}
                    className={`border border-slate-300 px-2.5 py-2 align-middle ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                        ? 'text-right'
                        : 'text-left'
                    } ${isMono ? 'font-mono tabular-nums' : ''} ${
                      isDate ? 'font-semibold text-slate-950 whitespace-nowrap' : ''
                    } ${isSubject ? 'font-medium text-slate-950' : ''} ${
                      col.key === 'dayName' ||
                      col.key === 'sNo' ||
                      col.key === 'hallNumber' ||
                      col.key === 'sessionDisplay'
                        ? 'whitespace-nowrap'
                        : ''
                    }`}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintableSheetDocument({
  prepared,
  layoutMode,
  includeVenueAndInvigilator,
  pageBreakPerDepartment,
  institutionName,
  documentTitle,
  timetableConfirmed,
  orientation,
}) {
  const columns = useMemo(
    () =>
      getPrintableColumns({
        layoutMode,
        includeVenueAndInvigilator,
      }),
    [layoutMode, includeVenueAndInvigilator]
  );

  const paperMaxWidth =
    orientation === 'portrait' ? 'max-w-[820px]' : 'max-w-[1120px]';

  return (
    <article
      data-testid="printable-timetable-sheet"
      data-orientation={orientation}
      className={`mx-auto w-full ${paperMaxWidth} bg-white border border-slate-300 shadow-sm p-6 sm:p-8 text-slate-900 print:max-w-none print:border-0 print:shadow-none print:p-0`}
    >
      {/* Institutional Masthead */}
      <header className="border-b-2 border-slate-900 pb-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-950">
              {institutionName || DEFAULT_PRINT_INSTITUTION_NAME}
            </h2>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-blue-900 mt-0.5">
              {documentTitle || DEFAULT_PRINT_DOCUMENT_TITLE}
            </p>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-600 tabular-nums shrink-0">
            <div>
              Status:{' '}
              <span className="font-semibold text-slate-900">
                {timetableConfirmed ? 'Finalized Schedule' : 'Draft Schedule'}
              </span>
            </div>
            <div>Generated: {prepared.summary.generatedOn}</div>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
          <span>
            <strong className="font-semibold text-slate-900">Scope:</strong>{' '}
            {prepared.summary.departmentScopeLabel}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            |
          </span>
          <span>
            <strong className="font-semibold text-slate-900">Academic Batch:</strong>{' '}
            {prepared.summary.batchLabel}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            |
          </span>
          <span>
            <strong className="font-semibold text-slate-900">Window:</strong>{' '}
            <span className="font-mono tabular-nums">{prepared.summary.dateRangeLabel}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">
            |
          </span>
          <span>
            <strong className="font-semibold text-slate-900">Total Examinations:</strong>{' '}
            <span className="font-mono tabular-nums">{prepared.summary.totalExams}</span>
          </span>
        </div>
      </header>

      {/* Body Table(s) */}
      {layoutMode === 'consolidated' ? (
        <PrintableTable rows={prepared.rows} columns={columns} />
      ) : (
        <div className="space-y-6">
          {prepared.departmentGroups.map((group, idx) => (
            <section
              key={group.department}
              data-testid={`print-dept-section-${group.department}`}
              className={
                idx > 0 && pageBreakPerDepartment ? 'print-page-break pt-1' : ''
              }
            >
              <div className="flex items-baseline justify-between gap-2 pb-1.5 mb-2 border-b border-slate-300 print-heading-keep">
                <h3 className="font-display text-sm font-bold text-slate-950">
                  Department: {group.department}
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-600">
                  {group.rows.length}{' '}
                  {group.rows.length === 1 ? 'Examination' : 'Examinations'}
                </span>
              </div>
              <PrintableTable rows={group.rows} columns={columns} />
            </section>
          ))}
        </div>
      )}

      {/* Official Sign-off Footer */}
      <footer className="mt-10 pt-4 border-t border-slate-200 print-avoid-break">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-6 text-xs text-slate-700">
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-medium text-slate-900">
              Prepared By (Exam Cell)
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-medium text-slate-900">
              Verified By (Academic Coordinator)
            </div>
          </div>
          <div className="sm:text-right">
            <div className="border-t border-slate-400 pt-1.5 font-medium text-slate-900">
              Controller of Examinations
            </div>
          </div>
        </div>
      </footer>
    </article>
  );
}

export const PrintableTimetableView = ({
  schedule = [],
  allScheduleCount = 0,
  departmentFilter = 'ALL',
  batchFilter = 'ALL',
  timetableConfirmed = false,
  onClearFilters,
  compactPrintOnly = false,
}) => {
  const [layoutMode, setLayoutMode] = useState('department'); // 'department' | 'consolidated'
  const [includeVenueAndInvigilator, setIncludeVenueAndInvigilator] = useState(true);
  const [orientation, setOrientation] = useState('landscape'); // 'landscape' | 'portrait'
  const [pageBreakPerDepartment, setPageBreakPerDepartment] = useState(false);
  const [institutionName, setInstitutionName] = useState(DEFAULT_PRINT_INSTITUTION_NAME);
  const [documentTitle, setDocumentTitle] = useState(DEFAULT_PRINT_DOCUMENT_TITLE);
  const [pdfFeedback, setPdfFeedback] = useState(null);

  const prepared = useMemo(
    () =>
      preparePrintableTimetableData(schedule, {
        departmentFilter,
        academicBatch: batchFilter,
      }),
    [schedule, departmentFilter, batchFilter]
  );

  const handleDownloadPdf = () => {
    setPdfFeedback(null);
    try {
      const res = downloadTimetablePDF(schedule, {
        layoutMode,
        includeVenueAndInvigilator,
        orientation,
        pageBreakPerDepartment,
        institutionName,
        documentTitle,
        departmentFilter,
        academicBatch: batchFilter,
        timetableConfirmed,
      });
      setPdfFeedback({
        type: 'success',
        message: `Downloaded ${res.filename} (${res.rowCount} examinations).`,
      });
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to generate PDF export.',
      });
    }
  };

  if (compactPrintOnly) {
    if (prepared.rows.length === 0) return null;
    return (
      <div className="hidden print-only" data-testid="compact-print-only-sheet">
        <PrintableSheetDocument
          prepared={prepared}
          layoutMode="department"
          includeVenueAndInvigilator={true}
          pageBreakPerDepartment={false}
          institutionName={DEFAULT_PRINT_INSTITUTION_NAME}
          documentTitle={DEFAULT_PRINT_DOCUMENT_TITLE}
          timetableConfirmed={timetableConfirmed}
          orientation="landscape"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="printable-timetable-view">
      {/* Print & PDF Layout Configuration Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Grouping Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                data-testid="print-layout-department-btn"
                onClick={() => setLayoutMode('department')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  layoutMode === 'department'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Department-Wise
              </button>
              <button
                type="button"
                data-testid="print-layout-consolidated-btn"
                onClick={() => setLayoutMode('consolidated')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  layoutMode === 'consolidated'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Chronological
              </button>
            </div>

            {/* Format Preset Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                data-testid="print-preset-master-btn"
                onClick={() => setIncludeVenueAndInvigilator(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  includeVenueAndInvigilator
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" />
                Master Schedule
              </button>
              <button
                type="button"
                data-testid="print-preset-notice-btn"
                onClick={() => setIncludeVenueAndInvigilator(false)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  !includeVenueAndInvigilator
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Notice Board
              </button>
            </div>

            {/* Orientation Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                data-testid="print-orient-landscape-btn"
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  orientation === 'landscape'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Landscape
              </button>
              <button
                type="button"
                data-testid="print-orient-portrait-btn"
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  orientation === 'portrait'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Portrait
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="print-view-window-print-btn"
              disabled={prepared.rows.length === 0}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              data-testid="print-view-download-pdf-btn"
              disabled={prepared.rows.length === 0}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download PDF (.pdf)
            </button>
          </div>
        </div>

        {/* Editable Masthead Titles & Department Page-Break Option */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2.5 border-t border-slate-100">
          <div className="md:col-span-5">
            <label
              htmlFor="print-institution-input"
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Institution / Header Line
            </label>
            <input
              id="print-institution-input"
              type="text"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className={layoutMode === 'department' && prepared.departmentGroups.length > 1 ? 'md:col-span-4' : 'md:col-span-7'}>
            <label
              htmlFor="print-title-input"
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Timetable Document Title
            </label>
            <input
              id="print-title-input"
              type="text"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          {layoutMode === 'department' && prepared.departmentGroups.length > 1 && (
            <div className="md:col-span-3 pb-1.5">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  data-testid="print-page-break-checkbox"
                  checked={pageBreakPerDepartment}
                  onChange={(e) => setPageBreakPerDepartment(e.target.checked)}
                  className="rounded text-blue-700"
                />
                <span>New page per department</span>
              </label>
            </div>
          )}
        </div>

        {prepared.summary.invalidDateCount > 0 && (
          <div
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {prepared.summary.invalidDateCount} scheduled examination(s) omitted from the print layout because they lack a valid date.
          </div>
        )}

        {pdfFeedback && (
          <div
            role={pdfFeedback.type === 'error' ? 'alert' : 'status'}
            data-testid="print-pdf-feedback"
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              pdfFeedback.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {pdfFeedback.message}
          </div>
        )}
      </section>

      {/* Print Paper Preview or Empty State */}
      {prepared.rows.length === 0 ? (
        <div
          data-testid="printable-empty-state"
          className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3"
        >
          <p className="text-sm font-medium text-slate-800">
            No scheduled examinations available for print preview.
          </p>
          <p className="text-xs text-slate-500">
            {allScheduleCount > 0
              ? 'Adjust or clear your active filters to display scheduled examinations in the print layout.'
              : 'Run the Genetic Algorithm Scheduler or finalize a single-day schedule to generate an examination timetable.'}
          </p>
          {allScheduleCount > 0 && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Active Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-4 sm:p-6 print:bg-white print:border-0 print:p-0">
          <PrintableSheetDocument
            prepared={prepared}
            layoutMode={layoutMode}
            includeVenueAndInvigilator={includeVenueAndInvigilator}
            pageBreakPerDepartment={pageBreakPerDepartment}
            institutionName={institutionName}
            documentTitle={documentTitle}
            timetableConfirmed={timetableConfirmed}
            orientation={orientation}
          />
        </div>
      )}
    </div>
  );
};
