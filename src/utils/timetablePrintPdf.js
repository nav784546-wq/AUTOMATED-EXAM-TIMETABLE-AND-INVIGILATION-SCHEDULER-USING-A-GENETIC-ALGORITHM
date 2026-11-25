import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  extractRawScheduleDate,
  extractSessionDetails,
  formatExcelDateDDMMYYYY,
  parseScheduleDate,
} from './excelTimetableExport.js';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DEFAULT_PRINT_INSTITUTION_NAME =
  'ExamGrid GA — Office of the Controller of Examinations';
export const DEFAULT_PRINT_DOCUMENT_TITLE = 'Automated Examination Timetable';

export function getDayOfWeekShort(parsedDate) {
  if (!parsedDate || !(parsedDate.excelDate instanceof Date) || Number.isNaN(parsedDate.excelDate.getTime())) {
    return '—';
  }
  return WEEKDAY_SHORT[parsedDate.excelDate.getUTCDay()] || '—';
}

function isExportableRow(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.deleted === true || item.isDeleted === true) return false;
  const status = String(item.status || '').trim().toUpperCase();
  if (
    item.cancelled === true ||
    item.isCancelled === true ||
    status === 'CANCELLED' ||
    status === 'CANCELED' ||
    status === 'DELETED'
  ) {
    return false;
  }
  return Boolean(item.subjectName || item.subject || item.subjectCode);
}

/**
 * Normalizes scheduled exam entries for print-friendly table display and PDF generation.
 * Preserves exact DD-MM-YYYY calendar dates without UTC day-shift, sorts chronologically,
 * and groups by department when needed.
 */
export function preparePrintableTimetableData(schedule = [], options = {}) {
  const list = Array.isArray(schedule) ? schedule : [];
  const normalized = [];
  let invalidDateCount = 0;

  for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];
    if (!isExportableRow(item)) continue;

    const rawDate = extractRawScheduleDate(item);
    const parsedDate = parseScheduleDate(rawDate);
    if (!parsedDate) {
      invalidDateCount += 1;
      continue;
    }

    const { sessionCode, examTime, sessionRank } = extractSessionDetails(item.session, item);
    const department = String(item.department || 'General').trim() || 'General';
    const subjectCode = String(item.subjectCode || '').trim();
    const subjectName = String(item.subjectName || item.subject || subjectCode || 'Untitled Course').trim();
    const batch = String(item.batch || item.academicYear || '').trim();
    const section = String(item.section || '').trim();
    const hallNumber = String(item.hallNumber || '').trim();
    const invigilatorName = String(item.invigilatorName || '').trim();
    const invigilatorDept = String(item.invigilatorDept || '').trim();
    const enrolledCount = Number.isFinite(Number(item.enrolledCount)) ? Number(item.enrolledCount) : 0;
    const hallCapacity = Number.isFinite(Number(item.hallCapacity)) ? Number(item.hallCapacity) : 0;
    const hasConflict = Boolean(
      item.hasStudentClash ||
        item.hasInvigilatorConflict ||
        item.hasCapacityIssue ||
        item.hasHallDoubleBooking ||
        item.hasDepartmentDateViolation ||
        item.hasDepartmentGapViolation ||
        item.hasDepartmentIndependenceViolation
    );

    normalized.push({
      examId: item.examId || `print-row-${idx + 1}`,
      dateIso: parsedDate.iso,
      dateDisplay: parsedDate.display,
      dayName: getDayOfWeekShort(parsedDate),
      sessionCode,
      sessionRank,
      examTime: examTime || (sessionCode === 'FN' ? '09:30 - 12:30' : sessionCode === 'AN' ? '14:00 - 17:00' : '—'),
      sessionDisplay:
        sessionCode !== '—' && examTime ? `${sessionCode} (${examTime})` : sessionCode,
      subjectCode: subjectCode || '—',
      subjectName,
      department,
      batch: batch || '—',
      rawBatch: batch,
      section: section || '—',
      rawSection: section,
      enrolledCount,
      hallNumber: hallNumber || '—',
      hallCapacity,
      invigilatorName: invigilatorName || '—',
      invigilatorDept,
      hasConflict,
    });
  }

  normalized.sort((a, b) => {
    if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
    if (a.sessionRank !== b.sessionRank) return a.sessionRank - b.sessionRank;
    const deptCmp = a.department.localeCompare(b.department);
    if (deptCmp !== 0) return deptCmp;
    const batchCmp = a.batch.localeCompare(b.batch);
    if (batchCmp !== 0) return batchCmp;
    return a.subjectName.localeCompare(b.subjectName);
  });

  const rows = normalized.map((row, index) => ({
    ...row,
    sNo: index + 1,
  }));

  const deptMap = new Map();
  for (const row of rows) {
    if (!deptMap.has(row.department)) deptMap.set(row.department, []);
    deptMap.get(row.department).push(row);
  }

  const departmentGroups = Array.from(deptMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([department, items]) => ({
      department,
      rows: items.map((item, idx) => ({
        ...item,
        sNo: idx + 1,
      })),
    }));

  const uniqueDates = Array.from(new Set(rows.map((r) => r.dateIso))).sort();
  const dateRangeLabel =
    uniqueDates.length === 0
      ? 'No Dates Scheduled'
      : uniqueDates.length === 1
      ? formatExcelDateDDMMYYYY(uniqueDates[0])
      : `${formatExcelDateDDMMYYYY(uniqueDates[0])} to ${formatExcelDateDDMMYYYY(
          uniqueDates[uniqueDates.length - 1]
        )}`;

  const uniqueBatches = Array.from(new Set(rows.map((r) => r.rawBatch).filter(Boolean))).sort();
  const batchLabel =
    options?.academicBatch && options.academicBatch !== 'ALL'
      ? `Batch ${options.academicBatch}`
      : uniqueBatches.length > 0
      ? uniqueBatches.map((b) => `Batch ${b}`).join(', ')
      : 'All Batches';

  const departmentScopeLabel =
    options?.departmentFilter && options.departmentFilter !== 'ALL'
      ? options.departmentFilter
      : departmentGroups.length === 1
      ? departmentGroups[0].department
      : `All Departments (${departmentGroups.length})`;

  const generatedOn = formatExcelDateDDMMYYYY(options?.generatedAt || new Date());

  return {
    rows,
    departmentGroups,
    summary: {
      totalExams: rows.length,
      departmentCount: departmentGroups.length,
      dateRangeLabel,
      batchLabel,
      departmentScopeLabel,
      invalidDateCount,
      generatedOn,
    },
  };
}

/**
 * Returns the column definitions shared between the printable HTML view and the jsPDF AutoTable export.
 */
export function getPrintableColumns({
  layoutMode = 'department',
  includeVenueAndInvigilator = true,
  includeDepartmentColumn,
} = {}) {
  const showDept =
    typeof includeDepartmentColumn === 'boolean'
      ? includeDepartmentColumn
      : layoutMode !== 'department';

  const cols = [
    { key: 'sNo', header: 'S.No.', align: 'center', pdfWidth: 30 },
    { key: 'dateDisplay', header: 'Exam Date', align: 'center', pdfWidth: 66 },
    { key: 'dayName', header: 'Day', align: 'center', pdfWidth: 34 },
    { key: 'sessionDisplay', header: 'Session & Time', align: 'left', pdfWidth: 108 },
    { key: 'subjectCode', header: 'Course Code', align: 'left', pdfWidth: 66 },
    { key: 'subjectName', header: 'Subject Name', align: 'left', pdfWidth: undefined },
  ];

  if (showDept) {
    cols.push({ key: 'department', header: 'Department', align: 'left', pdfWidth: 96 });
  }

  cols.push({ key: 'batch', header: 'Batch', align: 'center', pdfWidth: 52 });

  if (includeVenueAndInvigilator) {
    cols.push(
      { key: 'hallNumber', header: 'Hall', align: 'center', pdfWidth: 54 },
      { key: 'invigilatorName', header: 'Invigilator', align: 'left', pdfWidth: 102 }
    );
  }

  return cols;
}

function buildSafePdfFilename(summary, layoutMode, departmentFilter) {
  const today = formatExcelDateDDMMYYYY(new Date()) || 'timetable';
  if (departmentFilter && departmentFilter !== 'ALL') {
    const slug = String(departmentFilter)
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return `exam_timetable_${slug || 'dept'}_${today}.pdf`;
  }
  const modeSlug = layoutMode === 'department' ? 'department_wise' : 'chronological';
  return `exam_timetable_${modeSlug}_${today}.pdf`;
}

/**
 * Generates a formatted A4 PDF document (Portrait or Landscape) of the examination timetable.
 */
export function buildTimetablePDFDocument(schedule = [], options = {}) {
  const layoutMode = options?.layoutMode === 'consolidated' ? 'consolidated' : 'department';
  const includeVenueAndInvigilator = options?.includeVenueAndInvigilator !== false;
  const orientation =
    options?.orientation === 'portrait' || options?.orientation === 'landscape'
      ? options.orientation
      : includeVenueAndInvigilator
      ? 'landscape'
      : 'portrait';
  const pageBreakPerDepartment = Boolean(options?.pageBreakPerDepartment);
  const institutionName =
    String(options?.institutionName || DEFAULT_PRINT_INSTITUTION_NAME).trim() ||
    DEFAULT_PRINT_INSTITUTION_NAME;
  const documentTitle =
    String(options?.documentTitle || DEFAULT_PRINT_DOCUMENT_TITLE).trim() ||
    DEFAULT_PRINT_DOCUMENT_TITLE;
  const timetableConfirmed = Boolean(options?.timetableConfirmed);

  const prepared = preparePrintableTimetableData(schedule, options);
  if (prepared.rows.length === 0) {
    throw new Error('Cannot generate PDF: no scheduled examinations with valid dates match the current view.');
  }

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 36;

  const drawMasthead = (deptSubtitle = null) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(15, 23, 42);
    doc.text(institutionName, marginX, 38);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text(documentTitle.toUpperCase(), marginX, 55);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const scopeText = deptSubtitle
      ? `Department: ${deptSubtitle}   |   ${prepared.summary.batchLabel}`
      : `Scope: ${prepared.summary.departmentScopeLabel}   |   ${prepared.summary.batchLabel}`;
    doc.text(scopeText, marginX, 71);

    const metaText = `Schedule Window: ${prepared.summary.dateRangeLabel}   |   Total Papers: ${prepared.summary.totalExams}   |   Status: ${
      timetableConfirmed ? 'Finalized' : 'Draft Schedule'
    }   |   Generated: ${prepared.summary.generatedOn}`;
    doc.text(metaText, marginX, 84);

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.25);
    doc.line(marginX, 92, pageWidth - marginX, 92);

    return 108;
  };

  const renderTable = (rows, columns, startY) => {
    const head = [columns.map((c) => c.header)];
    const body = rows.map((row) => columns.map((c) => String(row[c.key] ?? '—')));

    const columnStyles = {};
    columns.forEach((col, idx) => {
      columnStyles[idx] = {
        halign: col.align || 'left',
        ...(col.pdfWidth ? { cellWidth: col.pdfWidth } : {}),
        ...(col.key === 'sNo' || col.key === 'dateDisplay' || col.key === 'subjectCode'
          ? { font: 'courier' }
          : {}),
        ...(col.key === 'dateDisplay' ? { fontStyle: 'bold' } : {}),
      };
    });

    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX, top: 36, bottom: 48 },
      head,
      body,
      theme: 'grid',
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: orientation === 'portrait' ? 8 : 8.5,
        cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.5,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        lineColor: [15, 23, 42],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles,
    });

    return doc.lastAutoTable.finalY;
  };

  if (layoutMode === 'consolidated') {
    const startY = drawMasthead();
    const columns = getPrintableColumns({
      layoutMode: 'consolidated',
      includeVenueAndInvigilator,
    });
    renderTable(prepared.rows, columns, startY);
  } else {
    const columns = getPrintableColumns({
      layoutMode: 'department',
      includeVenueAndInvigilator,
    });
    let cursorY = drawMasthead();

    prepared.departmentGroups.forEach((group, groupIdx) => {
      if (groupIdx > 0 && pageBreakPerDepartment) {
        doc.addPage();
        cursorY = drawMasthead(group.department);
      } else if (groupIdx > 0 && cursorY > pageHeight - 130) {
        doc.addPage();
        cursorY = 44;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${group.department}  (${group.rows.length} ${group.rows.length === 1 ? 'Examination' : 'Examinations'})`,
        marginX,
        cursorY
      );

      const endY = renderTable(group.rows, columns, cursorY + 6);
      cursorY = endY + 20;
    });
  }

  // Official Controller signature line at end of final page if space permits
  const finalY = doc.lastAutoTable?.finalY || pageHeight - 100;
  let sigY = finalY + 34;
  if (sigY > pageHeight - 55) {
    doc.addPage();
    sigY = 72;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.75);
  const sigWidth = 140;
  doc.line(marginX, sigY, marginX + sigWidth, sigY);
  doc.line(pageWidth - marginX - sigWidth, sigY, pageWidth - marginX, sigY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Prepared By (Exam Cell)', marginX, sigY + 12);
  doc.text('Controller of Examinations', pageWidth - marginX - sigWidth, sigY + 12);

  // Page numbering footer across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${documentTitle} · Generated ${prepared.summary.generatedOn}`,
      marginX,
      pageHeight - 20
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 20,
      { align: 'right' }
    );
  }

  return {
    doc,
    prepared,
    filename: buildSafePdfFilename(
      prepared.summary,
      layoutMode,
      options?.departmentFilter
    ),
  };
}

export function downloadTimetablePDF(schedule = [], options = {}) {
  const { doc, prepared, filename } = buildTimetablePDFDocument(schedule, options);
  doc.save(filename);
  return {
    filename,
    rowCount: prepared.rows.length,
    departmentCount: prepared.departmentGroups.length,
    invalidDateCount: prepared.summary.invalidDateCount,
  };
}
