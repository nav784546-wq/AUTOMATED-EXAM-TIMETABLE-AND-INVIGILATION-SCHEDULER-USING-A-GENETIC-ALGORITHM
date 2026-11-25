import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimetablePDFDocument,
  getDayOfWeekShort,
  getPrintableColumns,
  preparePrintableTimetableData,
} from './timetablePrintPdf.js';
import { parseScheduleDate } from './excelTimetableExport.js';

const SAMPLE_SCHEDULE = [
  {
    examId: 'ex-2',
    date: { toDate: () => new Date('2026-05-25T00:00:00.000Z') },
    session: 'AN (14:00 - 17:00)',
    subjectCode: 'COM202',
    subjectName: 'Corporate Accounting',
    department: 'B.COM',
    batch: '2026',
    hallNumber: 'H-102',
    invigilatorName: 'Dr. Kavitha',
  },
  {
    examId: 'ex-1',
    date: '2026-05-22',
    session: 'FN (09:30 - 12:30)',
    subjectCode: 'COM101',
    subjectName: 'Financial Accounting',
    department: 'B.COM',
    batch: '2026',
    hallNumber: 'H-101',
    invigilatorName: 'Prof. Rajesh',
  },
  {
    examId: 'ex-3',
    date: '2026-05-23',
    session: 'FN (09:30 - 12:30)',
    subjectCode: 'CS301',
    subjectName: 'Operating Systems',
    department: 'Computer Science',
    batch: '2025',
    hallNumber: 'H-204',
    invigilatorName: 'Dr. Meena',
  },
  {
    examId: 'ex-bad',
    date: 'Invalid Date',
    session: 'FN (09:30 - 12:30)',
    subjectCode: 'BAD999',
    subjectName: 'Corrupted Entry',
    department: 'B.COM',
  },
];

test('getDayOfWeekShort derives exact UTC weekday without timezone drift', () => {
  const fri = parseScheduleDate('2026-05-22'); // 22 May 2026 is Friday
  assert.equal(getDayOfWeekShort(fri), 'Fri');
  const mon = parseScheduleDate('2026-05-25'); // 25 May 2026 is Monday
  assert.equal(getDayOfWeekShort(mon), 'Mon');
});

test('preparePrintableTimetableData sorts chronologically, skips invalid dates, and groups by department', () => {
  const result = preparePrintableTimetableData(SAMPLE_SCHEDULE, {
    generatedAt: new Date('2026-05-10T00:00:00.000Z'),
  });

  assert.equal(result.summary.invalidDateCount, 1);
  assert.equal(result.summary.totalExams, 3);
  assert.equal(result.summary.departmentCount, 2);
  assert.equal(result.summary.dateRangeLabel, '22-05-2026 to 25-05-2026');
  assert.equal(result.summary.generatedOn, '10-05-2026');

  // Chronological order across all rows
  assert.deepEqual(
    result.rows.map((r) => [r.sNo, r.dateDisplay, r.subjectCode]),
    [
      [1, '22-05-2026', 'COM101'],
      [2, '23-05-2026', 'CS301'],
      [3, '25-05-2026', 'COM202'],
    ]
  );

  // Department-wise grouping resets serial numbers per department
  assert.equal(result.departmentGroups[0].department, 'B.COM');
  assert.deepEqual(
    result.departmentGroups[0].rows.map((r) => [r.sNo, r.dateDisplay, r.subjectCode]),
    [
      [1, '22-05-2026', 'COM101'],
      [2, '25-05-2026', 'COM202'],
    ]
  );
  assert.equal(result.departmentGroups[1].department, 'Computer Science');
  assert.equal(result.departmentGroups[1].rows[0].sNo, 1);
});

test('getPrintableColumns adapts cleanly for department vs consolidated and notice board modes', () => {
  const deptMasterCols = getPrintableColumns({
    layoutMode: 'department',
    includeVenueAndInvigilator: true,
  });
  assert.equal(deptMasterCols.some((c) => c.key === 'department'), false);
  assert.equal(deptMasterCols.some((c) => c.key === 'hallNumber'), true);
  assert.equal(deptMasterCols.some((c) => c.key === 'invigilatorName'), true);

  const consolidatedNoticeCols = getPrintableColumns({
    layoutMode: 'consolidated',
    includeVenueAndInvigilator: false,
  });
  assert.equal(consolidatedNoticeCols.some((c) => c.key === 'department'), true);
  assert.equal(consolidatedNoticeCols.some((c) => c.key === 'hallNumber'), false);
  assert.equal(consolidatedNoticeCols.some((c) => c.key === 'invigilatorName'), false);
});

test('buildTimetablePDFDocument generates valid PDF binary output in both layouts and throws on empty data', () => {
  const deptPdf = buildTimetablePDFDocument(SAMPLE_SCHEDULE, {
    layoutMode: 'department',
    includeVenueAndInvigilator: true,
    orientation: 'landscape',
    pageBreakPerDepartment: true,
    timetableConfirmed: true,
  });

  const deptBytes = deptPdf.doc.output('arraybuffer');
  assert.ok(deptBytes.byteLength > 1000, 'Department PDF should have non-trivial byte length');
  const headerText = new TextDecoder().decode(new Uint8Array(deptBytes).slice(0, 5));
  assert.equal(headerText, '%PDF-');
  assert.equal(deptPdf.doc.getNumberOfPages(), 2);

  const noticePdf = buildTimetablePDFDocument(SAMPLE_SCHEDULE, {
    layoutMode: 'consolidated',
    includeVenueAndInvigilator: false,
    orientation: 'portrait',
    departmentFilter: 'B.COM',
  });
  const noticeBytes = noticePdf.doc.output('arraybuffer');
  assert.ok(noticeBytes.byteLength > 1000);
  assert.match(noticePdf.filename, /^exam_timetable_b_com_.*\.pdf$/);

  assert.throws(
    () => buildTimetablePDFDocument([], { layoutMode: 'department' }),
    /no scheduled examinations/i
  );
});
