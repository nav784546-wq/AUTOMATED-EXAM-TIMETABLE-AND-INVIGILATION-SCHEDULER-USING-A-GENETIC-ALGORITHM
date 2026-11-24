import ExcelJS from 'exceljs';

const EXCEL_INVALID_SHEET_CHARS_RE = /[:\\/?*[\]]/g;
const DEFAULT_INSTITUTION_NAME = 'ExamGrid GA — Examination Controller Portal';

const BORDER_COLOR = { argb: 'FFCBD5E1' };
const HEADER_BORDER_COLOR = { argb: 'FF1E3A8A' };
const THIN_CELL_BORDER = {
  top: { style: 'thin', color: BORDER_COLOR },
  left: { style: 'thin', color: BORDER_COLOR },
  bottom: { style: 'thin', color: BORDER_COLOR },
  right: { style: 'thin', color: BORDER_COLOR },
};
const HEADER_CELL_BORDER = {
  top: { style: 'thin', color: HEADER_BORDER_COLOR },
  left: { style: 'thin', color: HEADER_BORDER_COLOR },
  bottom: { style: 'medium', color: HEADER_BORDER_COLOR },
  right: { style: 'thin', color: HEADER_BORDER_COLOR },
};

export const TIMETABLE_EXCEL_COLUMNS = [
  { key: 'sno', header: 'S.No.', align: 'center', minWidth: 8, maxWidth: 10 },
  { key: 'department', header: 'Department', align: 'left', minWidth: 20, maxWidth: 38 },
  { key: 'courseProgramme', header: 'Course / Programme', align: 'left', minWidth: 18, maxWidth: 32 },
  { key: 'section', header: 'Section', align: 'center', minWidth: 12, maxWidth: 18 },
  { key: 'batch', header: 'Academic Batch', align: 'center', minWidth: 15, maxWidth: 20 },
  { key: 'subjectName', header: 'Subject Name', align: 'left', minWidth: 28, maxWidth: 46 },
  { key: 'examDate', header: 'Examination Date', align: 'center', minWidth: 18, maxWidth: 20 },
  { key: 'session', header: 'Session', align: 'center', minWidth: 11, maxWidth: 14 },
  { key: 'examTime', header: 'Examination Time', align: 'center', minWidth: 18, maxWidth: 24 },
];

function pad2(num) {
  return String(num).padStart(2, '0');
}

function buildParsedDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }

  const y4 = String(y).padStart(4, '0');
  const m2 = pad2(m);
  const d2 = pad2(d);

  return {
    year: y,
    month: m,
    day: d,
    iso: `${y4}-${m2}-${d2}`,
    display: `${d2}-${m2}-${y4}`,
    excelDate: new Date(utcMs),
  };
}

function parseDateInstanceSafely(dt) {
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
  // Preserve exact calendar date: prefer UTC for midnight-UTC ISO/Timestamp dates,
  // and local calendar fields if explicitly constructed at local midnight in non-UTC timezones.
  const isUtcMidnight =
    dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0;
  const isLocalMidnight =
    dt.getHours() === 0 && dt.getMinutes() === 0 && dt.getSeconds() === 0;

  if (!isUtcMidnight && isLocalMidnight) {
    return buildParsedDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return buildParsedDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Parses examination dates from strings (YYYY-MM-DD, ISO timestamps, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY),
 * JS Date objects, Firebase Timestamps (.toDate() or {seconds/_seconds}), or epoch/Excel serial numbers
 * without introducing local-timezone day shifts.
 */
export function parseScheduleDate(dateVal) {
  if (dateVal === null || dateVal === undefined || dateVal === '') return null;

  // Firebase Timestamp or Date-like object
  if (typeof dateVal === 'object') {
    if (typeof dateVal.toDate === 'function') {
      try {
        return parseDateInstanceSafely(dateVal.toDate());
      } catch {
        return null;
      }
    }
    if (dateVal instanceof Date) {
      return parseDateInstanceSafely(dateVal);
    }
    const rawSeconds = Number.isFinite(dateVal.seconds)
      ? dateVal.seconds
      : Number.isFinite(dateVal._seconds)
      ? dateVal._seconds
      : null;
    if (rawSeconds !== null) {
      const nanos = Number.isFinite(dateVal.nanoseconds)
        ? dateVal.nanoseconds
        : Number.isFinite(dateVal._nanoseconds)
        ? dateVal._nanoseconds
        : 0;
      const dt = new Date(rawSeconds * 1000 + Math.floor(nanos / 1e6));
      return buildParsedDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    return null;
  }

  // Numeric epoch (ms/s) or Excel serial date
  if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
    if (dateVal > 20000 && dateVal < 100000) {
      const excelEpochUtc = Date.UTC(1899, 11, 30, 0, 0, 0, 0);
      const dt = new Date(excelEpochUtc + Math.round(dateVal) * 86400000);
      return buildParsedDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    if (dateVal > 1e9 && dateVal < 1e11) {
      const dt = new Date(dateVal * 1000);
      return buildParsedDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    if (dateVal >= 1e11) {
      const dt = new Date(dateVal);
      return buildParsedDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    return null;
  }

  const raw = String(dateVal).trim();
  if (!raw || raw === '[object Object]' || raw.toLowerCase() === 'invalid date') return null;

  // YYYY-MM-DD or YYYY/MM/DD (with optional ISO time suffix)
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return buildParsedDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/);
  if (dmyMatch) {
    return buildParsedDate(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
  }

  // Fallback RFC/HTTP date string
  const parsedMs = Date.parse(raw);
  if (Number.isFinite(parsedMs)) {
    const dt = new Date(parsedMs);
    return buildParsedDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  return null;
}

export function formatExcelDateDDMMYYYY(dateVal) {
  const parsed = parseScheduleDate(dateVal);
  if (parsed) return parsed.display;
  return '';
}

export function extractRawScheduleDate(item = {}) {
  if (!item || typeof item !== 'object') return null;
  const candidates = [
    item.date,
    item.examDate,
    item.examinationDate,
    item.scheduledDate,
    item.exam_date,
  ];
  for (const cand of candidates) {
    if (cand !== undefined && cand !== null && cand !== '') return cand;
  }
  return null;
}

export function extractSessionDetails(sessionVal, item = {}) {
  const rawSession = String(sessionVal ?? item?.session ?? item?.examSession ?? '').trim();
  const upper = rawSession.toUpperCase();

  let sessionCode = rawSession || '—';
  let sessionRank = 2;
  if (upper.startsWith('FN') || upper.includes('FORENOON') || upper.includes('MORNING')) {
    sessionCode = 'FN';
    sessionRank = 0;
  } else if (upper.startsWith('AN') || upper.includes('AFTERNOON')) {
    sessionCode = 'AN';
    sessionRank = 1;
  }

  let examTime = String(item?.examTime || item?.timeSlot || item?.time || '').trim();
  if (!examTime && rawSession) {
    const parenMatch = rawSession.match(/\(([^)]+)\)/);
    if (parenMatch && /\d{1,2}:\d{2}/.test(parenMatch[1])) {
      examTime = parenMatch[1].trim();
    } else {
      const rangeMatch = rawSession.match(
        /(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
      );
      if (rangeMatch) {
        examTime = rangeMatch[1].trim();
      }
    }
  }

  if (!examTime) {
    if (sessionCode === 'FN') examTime = '09:30 - 12:30';
    else if (sessionCode === 'AN') examTime = '14:00 - 17:00';
  }

  return { sessionCode, examTime, sessionRank };
}

export function sanitizeWorksheetName(rawName, usedNames = new Set()) {
  let cleaned = String(rawName ?? '')
    .replace(EXCEL_INVALID_SHEET_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim();

  if (!cleaned || cleaned.toLowerCase() === 'history') {
    cleaned = 'Department';
  }

  let base = cleaned.slice(0, 31).replace(/'+$/g, '').trim() || 'Department';
  let candidate = base;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    const maxBaseLen = Math.max(1, 31 - suffix.length);
    candidate = `${base.slice(0, maxBaseLen).trim()}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function buildLookupMaps(departmentData, options = {}) {
  const deptById = new Map();
  const deptByName = new Map();
  const subjectById = new Map();
  const subjectByCode = new Map();

  const deptList = Array.isArray(departmentData)
    ? departmentData
    : Array.isArray(departmentData?.departments)
    ? departmentData.departments
    : Array.isArray(options?.departments)
    ? options.departments
    : [];

  for (const d of deptList) {
    if (typeof d === 'string' && d.trim()) {
      const name = d.trim();
      deptByName.set(name.toLowerCase(), name);
    } else if (d && typeof d === 'object') {
      const id = String(d.id || '').trim();
      const name = String(d.name || d.departmentName || '').trim();
      if (id && name) deptById.set(id.toLowerCase(), name);
      if (name) deptByName.set(name.toLowerCase(), name);
    }
  }

  const subjectList = Array.isArray(options?.subjects)
    ? options.subjects
    : Array.isArray(departmentData?.subjects)
    ? departmentData.subjects
    : [];

  for (const s of subjectList) {
    if (!s || typeof s !== 'object') continue;
    if (s.id) subjectById.set(String(s.id), s);
    if (s.code) subjectByCode.set(String(s.code).trim().toUpperCase(), s);
  }

  return { deptById, deptByName, subjectById, subjectByCode };
}

function isCancelledOrInvalidRecord(item, { includeCancelled = false } = {}) {
  if (!item || typeof item !== 'object') return true;
  if (item.deleted === true || item.isDeleted === true) return true;
  if (!includeCancelled) {
    const status = String(item.status || '').trim().toUpperCase();
    if (
      item.cancelled === true ||
      item.isCancelled === true ||
      item.unsaved === true ||
      status === 'CANCELLED' ||
      status === 'CANCELED' ||
      status === 'DELETED' ||
      status === 'DRAFT'
    ) {
      return true;
    }
  }
  return false;
}

function describeInvalidDateReason(rawDate) {
  if (rawDate === null || rawDate === undefined || rawDate === '') {
    return { code: 'MISSING_DATE', label: 'missing examination date' };
  }
  if (rawDate instanceof Date) {
    if (Number.isNaN(rawDate.getTime())) {
      return { code: 'INVALID_DATE_OBJECT', label: "an 'Invalid Date' Date object" };
    }
    return { code: 'OUT_OF_RANGE_DATE', label: `out-of-range Date (${rawDate.toISOString()})` };
  }
  if (typeof rawDate === 'object') {
    if (typeof rawDate.toDate === 'function') {
      try {
        const converted = rawDate.toDate();
        if (!(converted instanceof Date) || Number.isNaN(converted.getTime())) {
          return { code: 'INVALID_FIREBASE_TIMESTAMP', label: "a Firebase Timestamp resolving to 'Invalid Date'" };
        }
      } catch {
        return { code: 'INVALID_FIREBASE_TIMESTAMP', label: 'a Firebase Timestamp that failed conversion' };
      }
    }
    return { code: 'INVALID_DATE_OBJECT', label: 'an unrecognized date object' };
  }
  const str = String(rawDate).trim();
  if (!str) {
    return { code: 'MISSING_DATE', label: 'missing examination date' };
  }
  if (str.toLowerCase() === 'invalid date') {
    return { code: 'INVALID_DATE_STRING', label: "literal 'Invalid Date' value" };
  }
  return { code: 'UNPARSEABLE_DATE', label: `unrecognized date value "${str}"` };
}

function isRecordInExportScope(department, options = {}) {
  const requestedScope = String(options?.exportScope || '').toUpperCase();
  const currentDept = String(options?.currentDepartment || '').trim();
  const selectedDepts = Array.isArray(options?.selectedDepartments)
    ? options.selectedDepartments.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (requestedScope === 'CURRENT' && currentDept && currentDept !== 'ALL') {
    return department.toLowerCase() === currentDept.toLowerCase();
  }
  if (requestedScope === 'SELECTED' && selectedDepts.length > 0) {
    return selectedDepts.includes(department.toLowerCase());
  }
  if (!requestedScope) {
    if (selectedDepts.length > 0) {
      return selectedDepts.includes(department.toLowerCase());
    }
    if (currentDept && currentDept !== 'ALL') {
      return department.toLowerCase() === currentDept.toLowerCase();
    }
  }
  return true;
}

function normalizeCandidateRecords(scheduleData = [], departmentData = [], options = {}) {
  const rawList = Array.isArray(scheduleData)
    ? scheduleData
    : Array.isArray(scheduleData?.schedule)
    ? scheduleData.schedule
    : [];

  const { deptById, deptByName, subjectById, subjectByCode } = buildLookupMaps(
    departmentData,
    options
  );

  const includeCancelled = Boolean(options?.includeCancelled);
  const seenKeys = new Set();
  const validRows = [];
  const invalidExams = [];
  const warnings = [];
  let totalChecked = 0;

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (isCancelledOrInvalidRecord(item, { includeCancelled })) continue;

    const matchedSubject =
      (item.subjectId && subjectById.get(String(item.subjectId))) ||
      (item.subjectCode && subjectByCode.get(String(item.subjectCode).trim().toUpperCase())) ||
      null;

    const rawDept = String(
      item.department ||
        (item.departmentId && deptById.get(String(item.departmentId).toLowerCase())) ||
        matchedSubject?.department ||
        ''
    ).trim();

    const department =
      deptByName.get(rawDept.toLowerCase()) ||
      deptById.get(rawDept.toLowerCase()) ||
      rawDept ||
      'General';

    if (!isRecordInExportScope(department, options)) continue;

    const subjectCode = String(item.subjectCode || matchedSubject?.code || '').trim();
    const subjectName = String(
      item.subjectName || item.subject || matchedSubject?.name || ''
    ).trim();
    if (!subjectName && !subjectCode) continue;

    totalChecked += 1;
    const rawDate = extractRawScheduleDate(item);
    const parsedDate = parseScheduleDate(rawDate);

    if (!parsedDate || !(parsedDate.excelDate instanceof Date) || Number.isNaN(parsedDate.excelDate.getTime())) {
      const reason = describeInvalidDateReason(rawDate);
      const examLabel = subjectName || subjectCode || item.examId || `row-${i + 1}`;
      const codeSuffix = subjectCode && subjectName ? ` (${subjectCode})` : '';
      const message = `[Excel Timetable Export] Scheduled exam "${examLabel}"${codeSuffix} in department "${department}" has ${reason.label} and cannot be exported.`;
      invalidExams.push({
        examId: item.examId || `row-${i + 1}`,
        subjectCode,
        subjectName: subjectName || subjectCode,
        department,
        rawDate: rawDate instanceof Date && Number.isNaN(rawDate.getTime()) ? 'Invalid Date' : rawDate ?? null,
        reasonCode: reason.code,
        message,
      });
      warnings.push(message);
      continue;
    }

    const { sessionCode, examTime, sessionRank } = extractSessionDetails(item.session, item);
    const section = String(item.section || matchedSubject?.section || '').trim();
    const batch = String(item.batch || item.academicYear || matchedSubject?.batch || '').trim();
    const courseProgramme = String(
      item.courseName ||
        item.course ||
        item.programme ||
        item.program ||
        subjectCode ||
        department
    ).trim();

    const dedupeKey = item.examId
      ? `id:${item.examId}`
      : `${department}|${subjectCode}|${subjectName}|${section}|${batch}|${parsedDate.iso}|${sessionCode}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    validRows.push({
      examId: item.examId || `row-${i + 1}`,
      department,
      courseProgramme,
      subjectCode,
      subjectName: subjectName || subjectCode,
      section,
      batch,
      parsedDate,
      dateIso: parsedDate.iso,
      dateDisplay: parsedDate.display,
      sessionCode,
      sessionRank,
      examTime,
      hallNumber: String(item.hallNumber || '').trim(),
      invigilatorName: String(item.invigilatorName || '').trim(),
    });
  }

  // Chronological order by examination date, then session (FN -> AN), then department/batch/section/subject
  validRows.sort((a, b) => {
    if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
    if (a.sessionRank !== b.sessionRank) return a.sessionRank - b.sessionRank;
    const deptCmp = a.department.localeCompare(b.department);
    if (deptCmp !== 0) return deptCmp;
    const batchCmp = a.batch.localeCompare(b.batch);
    if (batchCmp !== 0) return batchCmp;
    const secCmp = a.section.localeCompare(b.section);
    if (secCmp !== 0) return secCmp;
    return a.subjectName.localeCompare(b.subjectName);
  });

  return { validRows, invalidExams, warnings, totalChecked };
}

/**
 * Validates scheduled examination dates prior to workbook creation.
 * Logs specific warnings for every exam lacking a valid date (missing, 'Invalid Date', malformed Timestamp)
 * and prevents corrupted or empty Excel file generation.
 */
export function validateTimetableExportData(scheduleData = [], departmentData = [], options = {}) {
  const { validRows, invalidExams, warnings, totalChecked } = normalizeCandidateRecords(
    scheduleData,
    departmentData,
    options
  );

  const logger = options?.logger === null ? null : options?.logger || console;
  if (logger && typeof logger.warn === 'function') {
    for (const msg of warnings) {
      logger.warn(msg);
    }
  }

  const strictDateValidation = Boolean(options?.strictDateValidation);
  const hasInvalidDates = invalidExams.length > 0;
  const isValid = validRows.length > 0 && (!strictDateValidation || !hasInvalidDates);

  let blockingError = '';
  if (strictDateValidation && hasInvalidDates) {
    blockingError = `Cannot generate Excel timetable: ${invalidExams.length} scheduled exam(s) lack a valid examination date. ${warnings[0]}`;
  } else if (validRows.length === 0) {
    blockingError = hasInvalidDates
      ? `Cannot generate Excel timetable: all ${invalidExams.length} scheduled exam(s) lack a valid examination date. ${warnings[0]}`
      : 'Cannot generate Excel timetable: no valid scheduled examinations found for export.';
  }

  return {
    isValid,
    validRows,
    invalidExams,
    warnings,
    hasInvalidDates,
    totalChecked,
    blockingError,
  };
}

export function prepareTimetableExportRows(scheduleData = [], departmentData = [], options = {}) {
  return normalizeCandidateRecords(scheduleData, departmentData, options).validRows;
}

function resolveScopedRowsAndDepartments(rows, departmentData, options = {}) {
  const requestedScope = String(options?.exportScope || '').toUpperCase();
  const currentDept = String(options?.currentDepartment || '').trim();
  const selectedDepts = Array.isArray(options?.selectedDepartments)
    ? options.selectedDepartments.map((d) => String(d || '').trim()).filter(Boolean)
    : [];

  let effectiveScope = requestedScope;
  if (!effectiveScope) {
    if (selectedDepts.length > 0) effectiveScope = 'SELECTED';
    else if (currentDept && currentDept !== 'ALL') effectiveScope = 'CURRENT';
    else effectiveScope = 'ALL';
  }

  let scopedRows = rows;
  let targetDepartmentOrder = [];

  if (effectiveScope === 'CURRENT' && currentDept && currentDept !== 'ALL') {
    const key = currentDept.toLowerCase();
    scopedRows = rows.filter((r) => r.department.toLowerCase() === key);
    targetDepartmentOrder = [
      scopedRows[0]?.department || currentDept,
    ];
  } else if (effectiveScope === 'SELECTED' && selectedDepts.length > 0) {
    const selectedSet = new Set(selectedDepts.map((d) => d.toLowerCase()));
    scopedRows = rows.filter((r) => selectedSet.has(r.department.toLowerCase()));
    const present = new Set();
    for (const r of scopedRows) {
      if (!present.has(r.department.toLowerCase())) {
        present.add(r.department.toLowerCase());
        targetDepartmentOrder.push(r.department);
      }
    }
    if (targetDepartmentOrder.length === 0) {
      targetDepartmentOrder = [...selectedDepts];
    }
  } else {
    const seen = new Set();
    const deptList = Array.isArray(departmentData)
      ? departmentData
      : Array.isArray(departmentData?.departments)
      ? departmentData.departments
      : [];
    const fromDb = deptList
      .map((d) => (typeof d === 'string' ? d.trim() : String(d?.name || '').trim()))
      .filter(Boolean);

    for (const r of scopedRows) {
      const k = r.department.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        targetDepartmentOrder.push(r.department);
      }
    }
    // Preserve alphabetical department ordering across tabs while respecting dynamic DB departments
    targetDepartmentOrder.sort((a, b) => a.localeCompare(b));
    if (targetDepartmentOrder.length === 0 && fromDb.length > 0) {
      targetDepartmentOrder = [...fromDb].sort((a, b) => a.localeCompare(b));
    }
  }

  return { effectiveScope, scopedRows, targetDepartmentOrder };
}

function populateTimetableWorksheet(worksheet, rows, meta = {}) {
  const totalCols = TIMETABLE_EXCEL_COLUMNS.length;
  const institutionName = String(meta.institutionName || DEFAULT_INSTITUTION_NAME).trim();
  const departmentLabel = String(meta.departmentLabel || 'All Departments').trim();
  const batchValues = Array.from(new Set(rows.map((r) => r.batch).filter(Boolean))).sort();
  const batchLabel =
    String(meta.academicBatch || '').trim() ||
    (batchValues.length > 0 ? batchValues.join(', ') : 'All Batches');
  const exportedOn = formatExcelDateDDMMYYYY(meta.exportedAt || new Date());

  // Heading block (Rows 1..4; table header begins immediately at Row 5 with no blank rows)
  const titleRow = worksheet.addRow([institutionName]);
  worksheet.mergeCells(1, 1, 1, totalCols);
  titleRow.height = 26;
  titleRow.getCell(1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

  const subtitleRow = worksheet.addRow(['AUTOMATED EXAMINATION TIMETABLE']);
  worksheet.mergeCells(2, 1, 2, totalCols);
  subtitleRow.height = 22;
  subtitleRow.getCell(1).font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: 'FF1E3A8A' } };
  subtitleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

  const scopeRow = worksheet.addRow([
    `Examination Schedule   |   Department: ${departmentLabel}   |   Academic Year / Batch: ${batchLabel}`,
  ]);
  worksheet.mergeCells(3, 1, 3, totalCols);
  scopeRow.height = 20;
  scopeRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
  scopeRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  scopeRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  const summaryRow = worksheet.addRow([
    `Total Scheduled Examinations: ${rows.length}   |   Date Format: DD-MM-YYYY   |   Generated: ${exportedOn}`,
  ]);
  worksheet.mergeCells(4, 1, 4, totalCols);
  summaryRow.height = 18;
  summaryRow.getCell(1).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF475569' } };
  summaryRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  summaryRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  for (let c = 1; c <= totalCols; c++) {
    summaryRow.getCell(c).border = { bottom: { style: 'thin', color: BORDER_COLOR } };
  }

  // Row 5: Table Column Headings
  const headerRowIndex = 5;
  const headerRow = worksheet.addRow(TIMETABLE_EXCEL_COLUMNS.map((col) => col.header));
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    const colDef = TIMETABLE_EXCEL_COLUMNS[colNumber - 1];
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = {
      horizontal: colDef.align,
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = HEADER_CELL_BORDER;
  });

  // Track max text width per column for clean auto-sizing
  const colMaxLengths = TIMETABLE_EXCEL_COLUMNS.map((c) => c.header.length + 3);

  // Row 6+: Data rows (no blank rows or merged cells inside the data table)
  rows.forEach((item, idx) => {
    const rowValues = [
      idx + 1,
      item.department,
      item.courseProgramme,
      item.section || '—',
      item.batch || '—',
      item.subjectName,
      item.parsedDate ? item.parsedDate.excelDate : item.dateDisplay || '',
      item.sessionCode,
      item.examTime || '—',
    ];

    const dataRow = worksheet.addRow(rowValues);
    dataRow.height = 21;
    const isEvenStripe = idx % 2 === 1;
    const rowBg = isEvenStripe ? 'FFF8FAFC' : 'FFFFFFFF';

    dataRow.eachCell((cell, colNumber) => {
      const colDef = TIMETABLE_EXCEL_COLUMNS[colNumber - 1];
      cell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: colDef.key === 'examDate',
        color: { argb: 'FF0F172A' },
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.alignment = { horizontal: colDef.align, vertical: 'middle' };
      cell.border = THIN_CELL_BORDER;

      if (colDef.key === 'examDate' && item.parsedDate) {
        cell.numFmt = 'dd-mm-yyyy';
      }

      const displayLen =
        colDef.key === 'examDate'
          ? 12
          : String(rowValues[colNumber - 1] ?? '').length;
      if (displayLen + 3 > colMaxLengths[colNumber - 1]) {
        colMaxLengths[colNumber - 1] = displayLen + 3;
      }
    });
  });

  // Set balanced column widths
  TIMETABLE_EXCEL_COLUMNS.forEach((colDef, i) => {
    const col = worksheet.getColumn(i + 1);
    col.width = Math.max(colDef.minWidth, Math.min(colDef.maxWidth, colMaxLengths[i]));
  });

  // Freeze table header row & enable Excel AutoFilter
  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];
  worksheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex + Math.max(rows.length, 1), column: totalCols },
  };
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

function assertWorkbookIntegrityBeforeWrite(workbook) {
  if (!workbook || !Array.isArray(workbook.worksheets) || workbook.worksheets.length === 0) {
    throw new Error('Cannot serialize Excel workbook: no worksheets were created.');
  }

  const dateColIndex = TIMETABLE_EXCEL_COLUMNS.findIndex((c) => c.key === 'examDate') + 1;
  for (const ws of workbook.worksheets) {
    if (ws.rowCount <= 5) {
      throw new Error(`Cannot serialize Excel workbook: worksheet "${ws.name}" contains no scheduled examinations.`);
    }
    for (let r = 6; r <= ws.rowCount; r++) {
      const cell = ws.getRow(r).getCell(dateColIndex);
      const val = cell.value;
      if (
        !(val instanceof Date) ||
        Number.isNaN(val.getTime()) ||
        cell.numFmt !== 'dd-mm-yyyy'
      ) {
        throw new Error(
          `Cannot serialize Excel workbook: corrupted examination date cell detected at "${ws.name}" row ${r}.`
        );
      }
    }
  }
}

/**
 * Builds an ExcelJS Workbook containing either:
 *  - A Consolidated Timetable sheet + individual per-department sheets (for multi-dept / ALL exports), or
 *  - A single focused department sheet (when exporting 1 selected/current department).
 * Runs pre-write date validation first and prevents corrupted/empty workbook creation.
 */
export function buildDepartmentTimetableWorkbook(
  scheduleData = [],
  departmentData = [],
  options = {}
) {
  const validation = validateTimetableExportData(scheduleData, departmentData, options);
  if (validation.warnings.length > 0 && typeof options?.onValidationWarning === 'function') {
    options.onValidationWarning(validation.warnings, validation);
  }
  if (!validation.isValid) {
    throw new Error(
      validation.blockingError ||
        'Cannot generate Excel timetable due to missing or invalid examination dates.'
    );
  }

  const allRows = validation.validRows;
  const { effectiveScope, scopedRows, targetDepartmentOrder } = resolveScopedRowsAndDepartments(
    allRows,
    departmentData,
    options
  );

  if (scopedRows.length === 0) {
    throw new Error(
      'Cannot generate Excel workbook: no valid scheduled examinations matched the selected department scope.'
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ExamGrid GA';
  workbook.created = options?.exportedAt instanceof Date ? options.exportedAt : new Date();
  workbook.modified = workbook.created;

  const usedSheetNames = new Set();
  const createdSheets = [];

  const shouldIncludeConsolidated =
    options?.includeConsolidated === true ||
    (options?.includeConsolidated !== false &&
      (effectiveScope === 'ALL' || targetDepartmentOrder.length > 1));

  if (shouldIncludeConsolidated) {
    const consolidatedName = sanitizeWorksheetName('Consolidated Timetable', usedSheetNames);
    const ws = workbook.addWorksheet(consolidatedName);
    populateTimetableWorksheet(ws, scopedRows, {
      ...options,
      departmentLabel:
        targetDepartmentOrder.length === 1
          ? targetDepartmentOrder[0]
          : effectiveScope === 'SELECTED'
          ? `${targetDepartmentOrder.length} Selected Departments`
          : 'All Departments (Consolidated)',
    });
    createdSheets.push(consolidatedName);
  }

  for (const deptName of targetDepartmentOrder) {
    const deptRows = scopedRows.filter(
      (r) => r.department.toLowerCase() === deptName.toLowerCase()
    );
    if (deptRows.length === 0) continue;

    const sheetName = sanitizeWorksheetName(deptName, usedSheetNames);
    const ws = workbook.addWorksheet(sheetName);
    populateTimetableWorksheet(ws, deptRows, {
      ...options,
      departmentLabel: deptName,
    });
    createdSheets.push(sheetName);
  }

  if (createdSheets.length === 0) {
    const fallbackName = sanitizeWorksheetName('Consolidated Timetable', usedSheetNames);
    const ws = workbook.addWorksheet(fallbackName);
    populateTimetableWorksheet(ws, scopedRows, {
      ...options,
      departmentLabel:
        options?.currentDepartment && options.currentDepartment !== 'ALL'
          ? options.currentDepartment
          : 'All Departments',
    });
    createdSheets.push(fallbackName);
  }

  assertWorkbookIntegrityBeforeWrite(workbook);

  return {
    workbook,
    rows: scopedRows,
    sheetNames: createdSheets,
    departmentsExported: targetDepartmentOrder,
    exportScope: effectiveScope,
    warnings: validation.warnings,
    skippedInvalidExams: validation.invalidExams,
    validation,
  };
}

export async function generateTimetableExcelBuffer(
  scheduleData = [],
  departmentData = [],
  options = {}
) {
  const built = buildDepartmentTimetableWorkbook(scheduleData, departmentData, options);
  assertWorkbookIntegrityBeforeWrite(built.workbook);
  const buffer = await built.workbook.xlsx.writeBuffer();
  return {
    buffer,
    rowCount: built.rows.length,
    ...built,
  };
}

function buildDefaultExcelFilename(exportScope, departmentsExported) {
  const todayStamp = formatExcelDateDDMMYYYY(new Date());
  if (departmentsExported.length === 1 && exportScope !== 'ALL') {
    const slug = departmentsExported[0]
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return `exam_timetable_${slug || 'department'}_${todayStamp}.xlsx`;
  }
  return `exam_timetable_department_wise_${todayStamp}.xlsx`;
}

export async function exportDepartmentTimetableToExcel(
  scheduleData = [],
  departmentData = [],
  options = {}
) {
  const {
    buffer,
    rows,
    sheetNames,
    departmentsExported,
    exportScope,
    warnings,
    skippedInvalidExams,
    validation,
  } = await generateTimetableExcelBuffer(scheduleData, departmentData, options);

  const filename =
    options?.filename || buildDefaultExcelFilename(exportScope, departmentsExported);

  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    filename,
    sheetNames,
    rowCount: rows.length,
    departmentsExported,
    exportScope,
    warnings,
    skippedInvalidExams,
    validation,
  };
}
