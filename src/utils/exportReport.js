import { extractRawScheduleDate, formatExcelDateDDMMYYYY } from './excelTimetableExport.js';

export function buildTimetableCSV(schedule) {
  const headers = [
    'Date',
    'Session',
    'Subject Code',
    'Subject Name',
    'Department',
    'Academic Year / Batch',
    'Section',
    'Enrolled Students',
    'Hall Number',
    'Hall Capacity',
    'Assigned Invigilator',
    'Invigilator Dept',
    'Status',
  ];

  const escapeCell = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = schedule.map((item) => {
    const hasConflict =
      item.hasStudentClash ||
      item.hasInvigilatorConflict ||
      item.hasCapacityIssue ||
      item.hasHallDoubleBooking;
    const rawDate = extractRawScheduleDate(item);
    const formattedDate = formatExcelDateDDMMYYYY(rawDate) || String(rawDate ?? '');

    return [
      formattedDate,
      item.session,
      item.subjectCode,
      item.subjectName,
      item.department,
      item.batch || '',
      item.section || '',
      item.enrolledCount,
      item.hallNumber,
      item.hallCapacity,
      item.invigilatorName,
      item.invigilatorDept,
      hasConflict ? 'Conflict Detected' : 'Conflict-Free',
    ]
      .map(escapeCell)
      .join(',');
  });

  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}

export function downloadTimetableCSV(schedule, filename = 'exam_timetable_report.csv') {
  const csv = buildTimetableCSV(schedule);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildSubjectSelectionSummaryCSV(
  summaryRows = [],
  { singleDayDate = '', singleDaySession = 'BOTH' } = {}
) {
  const headers = [
    'Exam Date',
    'Session Window',
    'Department',
    'Subject Code',
    'Selected Subject',
    'Semester',
    'Academic Year / Batch',
    'Section',
    'Enrolled Students',
    'Coverage Status',
  ];

  const escapeCell = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const sessionLabel =
    singleDaySession === 'BOTH'
      ? 'Both Sessions (FN & AN)'
      : singleDaySession;

  const formatStatus = (status) => {
    if (status === 'SELECTED') return 'Covered (1 Selected)';
    if (status === 'NO_SUBJECTS') return 'No Subjects Available';
    return 'Pending Selection';
  };

  const rows = summaryRows.map((row) =>
    [
      singleDayDate,
      sessionLabel,
      row.department,
      row.subjectCode || '',
      row.subjectName || 'No subject selected',
      row.status === 'SELECTED' && row.semester != null ? `Sem ${row.semester}` : '',
      row.status === 'SELECTED' ? row.batch || '' : '',
      row.status === 'SELECTED' ? row.section || '' : '',
      row.status === 'SELECTED' ? row.enrolledCount : 0,
      formatStatus(row.status),
    ]
      .map(escapeCell)
      .join(',')
  );

  return '\uFEFF' + [headers.map(escapeCell).join(','), ...rows].join('\n');
}

export function downloadSubjectSelectionSummaryCSV(
  summaryRows = [],
  { singleDayDate = '', singleDaySession = 'BOTH', filename } = {}
) {
  const targetFilename =
    filename ||
    `subject_selection_summary_${singleDayDate || 'schedule'}.csv`;
  const csv = buildSubjectSelectionSummaryCSV(summaryRows, {
    singleDayDate,
    singleDaySession,
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', targetFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

