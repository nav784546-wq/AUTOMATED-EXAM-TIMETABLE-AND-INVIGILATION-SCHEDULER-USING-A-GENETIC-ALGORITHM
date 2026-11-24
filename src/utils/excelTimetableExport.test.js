import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
  TIMETABLE_EXCEL_COLUMNS,
  exportDepartmentTimetableToExcel,
  formatExcelDateDDMMYYYY,
  generateTimetableExcelBuffer,
  parseScheduleDate,
  prepareTimetableExportRows,
  sanitizeWorksheetName,
  validateTimetableExportData,
} from './excelTimetableExport.js';
import { buildTimetableCSV } from './exportReport.js';

test('parseScheduleDate handles strings, JS Date, Firebase Timestamps, and avoids UTC shift', () => {
  assert.equal(formatExcelDateDDMMYYYY('2026-05-25'), '25-05-2026');
  assert.equal(formatExcelDateDDMMYYYY('2026-05-25T00:00:00.000Z'), '25-05-2026');
  assert.equal(formatExcelDateDDMMYYYY('24-04-2026'), '24-04-2026');
  assert.equal(formatExcelDateDDMMYYYY('26.05.2026'), '26-05-2026');
  assert.equal(formatExcelDateDDMMYYYY('2026/05/27'), '27-05-2026');

  // Firebase Timestamp with .toDate()
  const mockFirestoreTs = {
    toDate: () => new Date('2026-05-23T00:00:00.000Z'),
  };
  assert.equal(formatExcelDateDDMMYYYY(mockFirestoreTs), '23-05-2026');

  // Serialized Firestore Timestamp ({ seconds, nanoseconds } and { _seconds, _nanoseconds })
  const utcSeconds = Math.floor(Date.UTC(2026, 4, 26, 0, 0, 0) / 1000);
  assert.equal(formatExcelDateDDMMYYYY({ seconds: utcSeconds, nanoseconds: 0 }), '26-05-2026');
  assert.equal(formatExcelDateDDMMYYYY({ _seconds: utcSeconds, _nanoseconds: 0 }), '26-05-2026');

  // Invalid / empty values never yield "Invalid Date"
  assert.equal(parseScheduleDate(''), null);
  assert.equal(parseScheduleDate(null), null);
  assert.equal(parseScheduleDate('not-a-date'), null);
  assert.equal(formatExcelDateDDMMYYYY('Invalid Date'), '');
});

test('sanitizeWorksheetName enforces Excel 31-char limit, invalid character stripping, and uniqueness', () => {
  const used = new Set();
  const longName = 'B.Sc. Computer Science (B.Sc. CSE)';
  const tab1 = sanitizeWorksheetName(longName, used);
  assert.equal(tab1.length, 31);
  assert.equal(tab1, 'B.Sc. Computer Science (B.Sc. C');

  // Collision on same long prefix gets unique suffix within 31 chars
  const tab2 = sanitizeWorksheetName('B.Sc. Computer Science (B.Sc. IT)', used);
  assert.ok(tab2.length <= 31);
  assert.notEqual(tab1, tab2);

  // Invalid Excel characters stripped cleanly
  const tab3 = sanitizeWorksheetName('AI / ML : Lab [2026]*?', used);
  assert.equal(/[:\\/?*[\]]/.test(tab3), false);
});

test('generateTimetableExcelBuffer builds formatted B.COM sheet sorted chronologically with real DD-MM-YYYY Excel dates', async () => {
  const bcomSchedule = [
    {
      examId: 'ex-1',
      department: 'B.COM',
      subjectCode: 'COM101',
      subjectName: 'Tamil',
      section: 'Section A',
      batch: '2025',
      date: '2026-05-25',
      session: 'FN (09:30 - 12:30)',
    },
    {
      examId: 'ex-2',
      department: 'B.COM',
      subjectCode: 'COM102',
      subjectName: 'English',
      section: 'Section A',
      batch: '2025',
      examDate: { toDate: () => new Date('2026-04-24T00:00:00.000Z') },
      session: 'FN (09:30 - 12:30)',
    },
    {
      examId: 'ex-3',
      department: 'B.COM',
      subjectCode: 'COM103',
      subjectName: 'Maths',
      section: 'Section A',
      batch: '2025',
      examinationDate: '2026-05-26',
      session: 'AN (14:00 - 17:00)',
    },
    {
      examId: 'ex-4',
      department: 'B.COM',
      subjectCode: 'COM104',
      subjectName: 'Science',
      section: 'Section A',
      batch: '2025',
      scheduledDate: { seconds: Math.floor(Date.UTC(2026, 4, 27) / 1000), nanoseconds: 0 },
      session: 'FN (09:30 - 12:30)',
    },
    {
      examId: 'ex-5',
      department: 'B.COM',
      subjectCode: 'COM105',
      subjectName: 'Social',
      section: 'Section A',
      batch: '2025',
      date: '23-05-2026',
      session: 'FN (09:30 - 12:30)',
    },
    // Cancelled record should be excluded by default
    {
      examId: 'ex-cancelled',
      department: 'B.COM',
      subjectCode: 'COM999',
      subjectName: 'Cancelled Paper',
      date: '2026-05-28',
      session: 'FN',
      status: 'CANCELLED',
    },
  ];

  const { buffer, sheetNames, rowCount } = await generateTimetableExcelBuffer(
    bcomSchedule,
    ['B.COM'],
    {
      exportScope: 'CURRENT',
      currentDepartment: 'B.COM',
      institutionName: 'St. Xavier Autonomous College',
    }
  );

  assert.equal(rowCount, 5);
  assert.deepEqual(sheetNames, ['B.COM']);

  // Inspect generated workbook via ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('B.COM');
  assert.ok(ws, 'B.COM worksheet must exist');

  // Heading block & table headers
  assert.equal(ws.getCell('A1').value, 'St. Xavier Autonomous College');
  assert.equal(ws.getCell('A2').value, 'AUTOMATED EXAMINATION TIMETABLE');

  const headerRow = ws.getRow(5);
  TIMETABLE_EXCEL_COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    assert.equal(cell.value, col.header);
    assert.equal(cell.font.bold, true);
    assert.ok(cell.border?.top?.style);
  });

  // Frozen header + AutoFilter
  assert.equal(ws.views[0].state, 'frozen');
  assert.equal(ws.views[0].ySplit, 5);
  assert.ok(ws.autoFilter);

  // Chronological order check: 24-04-2026 (English), 23-05-2026 (Social), 25-05-2026 (Tamil), 26-05-2026 (Maths), 27-05-2026 (Science)
  const expectedOrder = [
    { sno: 1, subject: 'English', iso: '2026-04-24', session: 'FN', time: '09:30 - 12:30' },
    { sno: 2, subject: 'Social', iso: '2026-05-23', session: 'FN', time: '09:30 - 12:30' },
    { sno: 3, subject: 'Tamil', iso: '2026-05-25', session: 'FN', time: '09:30 - 12:30' },
    { sno: 4, subject: 'Maths', iso: '2026-05-26', session: 'AN', time: '14:00 - 17:00' },
    { sno: 5, subject: 'Science', iso: '2026-05-27', session: 'FN', time: '09:30 - 12:30' },
  ];

  expectedOrder.forEach((exp, idx) => {
    const row = ws.getRow(6 + idx);
    assert.equal(row.getCell(1).value, exp.sno);
    assert.equal(row.getCell(1).alignment.horizontal, 'center');
    assert.equal(row.getCell(2).value, 'B.COM');
    assert.equal(row.getCell(2).alignment.horizontal, 'left');
    assert.equal(row.getCell(6).value, exp.subject);
    assert.equal(row.getCell(6).alignment.horizontal, 'left');
    const dateCell = row.getCell(7);
    assert.ok(dateCell.value instanceof Date, 'Date cell must be a native Excel Date');
    assert.equal(dateCell.value.toISOString().slice(0, 10), exp.iso);
    assert.equal(dateCell.numFmt, 'dd-mm-yyyy');
    assert.equal(dateCell.alignment.horizontal, 'center');
    assert.equal(row.getCell(8).value, exp.session);
    assert.equal(row.getCell(8).alignment.horizontal, 'center');
    assert.equal(row.getCell(9).value, exp.time);
  });

  // Also verify SheetJS (XLSX) reads the formatted DD-MM-YYYY strings cleanly
  const xlsxWb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = xlsxWb.Sheets['B.COM'];
  assert.equal(sheet['G6'].w, '24-04-2026');
  assert.equal(sheet['G7'].w, '23-05-2026');
  assert.equal(sheet['G8'].w, '25-05-2026');
  assert.equal(sheet['G9'].w, '26-05-2026');
  assert.equal(sheet['G10'].w, '27-05-2026');
});

test('export ALL departments creates Consolidated Timetable + separate department worksheets without duplicates', async () => {
  const multiDeptSchedule = [
    {
      examId: 'e-1',
      department: 'BCA (AI & DS)',
      subjectCode: 'AIDS301',
      subjectName: 'Machine Learning',
      section: 'Section A',
      batch: '2024',
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
    },
    // Duplicate examId should be deduplicated
    {
      examId: 'e-1',
      department: 'BCA (AI & DS)',
      subjectCode: 'AIDS301',
      subjectName: 'Machine Learning',
      section: 'Section A',
      batch: '2024',
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
    },
    {
      examId: 'e-2',
      department: 'B.Sc. Computer Science (B.Sc. CSE)',
      subjectCode: 'CS201',
      subjectName: 'Data Structures',
      section: 'Section A',
      batch: '2025',
      date: '2026-11-16',
      session: 'AN (14:00 - 17:00)',
    },
    {
      examId: 'e-3',
      department: 'B.Tech',
      subjectCode: 'BT301',
      subjectName: 'Operating Systems',
      section: 'Section B',
      batch: '2024',
      date: '2026-11-18',
      session: 'FN (09:30 - 12:30)',
    },
  ];

  const allDepts = [
    'BCA (AI & DS)',
    'B.Sc. Computer Science (B.Sc. CSE)',
    'B.Tech',
  ];

  const { buffer, sheetNames, rowCount } = await generateTimetableExcelBuffer(
    multiDeptSchedule,
    allDepts,
    { exportScope: 'ALL' }
  );

  assert.equal(rowCount, 3);
  assert.equal(sheetNames[0], 'Consolidated Timetable');
  assert.equal(sheetNames.length, 4);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const consolidated = wb.getWorksheet('Consolidated Timetable');
  assert.equal(consolidated.getRow(6).getCell(8).value, 'FN');
  assert.equal(consolidated.getRow(7).getCell(8).value, 'AN');
  assert.equal(consolidated.getRow(8).getCell(2).value, 'B.Tech');
});

test('export SELECTED departments restricts Consolidated and tabs to chosen departments only', async () => {
  const schedule = [
    { examId: 's1', department: 'EEE', subjectCode: 'EE1', subjectName: 'Circuits', date: '2026-11-16', session: 'FN' },
    { examId: 's2', department: 'ECE', subjectCode: 'EC1', subjectName: 'Signals', date: '2026-11-17', session: 'FN' },
    { examId: 's3', department: 'B.Tech', subjectCode: 'BT1', subjectName: 'OS', date: '2026-11-18', session: 'AN' },
  ];

  const { sheetNames, rowCount } = await generateTimetableExcelBuffer(
    schedule,
    ['EEE', 'ECE', 'B.Tech'],
    {
      exportScope: 'SELECTED',
      selectedDepartments: ['EEE', 'B.Tech'],
    }
  );

  assert.equal(rowCount, 2);
  assert.deepEqual(sheetNames, ['Consolidated Timetable', 'EEE', 'B.Tech']);

  const prepared = prepareTimetableExportRows(schedule);
  assert.equal(prepared.length, 3);
});

test('buildTimetableCSV handles Firebase Timestamps and outputs DD-MM-YYYY dates', () => {
  const csv = buildTimetableCSV([
    {
      examId: 'c1',
      date: { toDate: () => new Date('2026-05-25T00:00:00.000Z') },
      session: 'FN (09:30 - 12:30)',
      subjectCode: 'COM101',
      subjectName: 'Tamil',
      department: 'B.COM',
      batch: '2025',
      section: 'Section A',
      enrolledCount: 60,
      hallNumber: 'A-101',
      hallCapacity: 60,
      invigilatorName: 'Dr. Rao',
      invigilatorDept: 'B.COM',
    },
  ]);
  assert.ok(csv.includes('25-05-2026'));
  assert.equal(csv.includes('[object Object]'), false);
});

test('validateTimetableExportData logs specific warnings for missing and Invalid Date objects and excludes corrupted rows', async () => {
  const loggedWarnings = [];
  const spyLogger = {
    warn: (msg) => loggedWarnings.push(msg),
  };

  const mixedSchedule = [
    {
      examId: 'ok-1',
      department: 'B.COM',
      subjectCode: 'COM101',
      subjectName: 'Tamil',
      date: '2026-05-25',
      session: 'FN',
    },
    {
      examId: 'bad-missing',
      department: 'B.COM',
      subjectCode: 'COM102',
      subjectName: 'English',
      date: '',
      session: 'FN',
    },
    {
      examId: 'bad-date-obj',
      department: 'B.COM',
      subjectCode: 'COM103',
      subjectName: 'Maths',
      date: new Date('not-a-date'),
      session: 'AN',
    },
    {
      examId: 'bad-ts',
      department: 'B.COM',
      subjectCode: 'COM104',
      subjectName: 'Science',
      examDate: { toDate: () => new Date('invalid') },
      session: 'FN',
    },
  ];

  const validation = validateTimetableExportData(mixedSchedule, ['B.COM'], {
    logger: spyLogger,
  });

  assert.equal(validation.isValid, true);
  assert.equal(validation.validRows.length, 1);
  assert.equal(validation.invalidExams.length, 3);
  assert.equal(loggedWarnings.length, 3);
  assert.ok(loggedWarnings[0].includes('English') && loggedWarnings[0].includes('missing examination date'));
  assert.ok(loggedWarnings[1].includes('Maths') && loggedWarnings[1].includes('Invalid Date'));
  assert.ok(loggedWarnings[2].includes('Science') && loggedWarnings[2].includes('Firebase Timestamp'));

  // Partial export produces clean workbook containing only the valid exam with zero corrupted cells
  const exported = await exportDepartmentTimetableToExcel(mixedSchedule, ['B.COM'], {
    exportScope: 'CURRENT',
    currentDepartment: 'B.COM',
    logger: spyLogger,
  });
  assert.equal(exported.rowCount, 1);
  assert.equal(exported.warnings.length, 3);
  assert.equal(exported.skippedInvalidExams.length, 3);
});

test('exportDepartmentTimetableToExcel prevents corrupted file generation when all exams lack valid dates or strictDateValidation is enabled', async () => {
  const loggedWarnings = [];
  const spyLogger = { warn: (msg) => loggedWarnings.push(msg) };

  await assert.rejects(
    () =>
      generateTimetableExcelBuffer(
        [
          {
            examId: 'bad-only',
            department: 'B.COM',
            subjectCode: 'COM101',
            subjectName: 'Tamil',
            date: new Date('invalid'),
            session: 'FN',
          },
        ],
        ['B.COM'],
        { logger: spyLogger }
      ),
    /Cannot generate Excel timetable: all 1 scheduled exam\(s\) lack a valid examination date/
  );
  assert.equal(loggedWarnings.length, 1);

  await assert.rejects(
    () =>
      exportDepartmentTimetableToExcel(
        [
          {
            examId: 'ok-1',
            department: 'B.COM',
            subjectCode: 'COM101',
            subjectName: 'Tamil',
            date: '2026-05-25',
            session: 'FN',
          },
          {
            examId: 'bad-2',
            department: 'B.COM',
            subjectCode: 'COM102',
            subjectName: 'English',
            date: 'Invalid Date',
            session: 'AN',
          },
        ],
        ['B.COM'],
        { strictDateValidation: true, logger: spyLogger }
      ),
    /Cannot generate Excel timetable: 1 scheduled exam\(s\) lack a valid examination date/
  );
});

