import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConflictHeatmapMatrix,
  getShortSessionLabel,
} from './conflictHeatmap.js';

const sampleSubjects = [
  {
    id: 'sub-1',
    code: 'AIDS301',
    name: 'Machine Learning',
    department: 'BCA (AI & DS)',
    batch: '2024',
    semester: 3,
    section: 'Section A',
    enrolledCount: 45,
  },
  {
    id: 'sub-2',
    code: 'AIDS302',
    name: 'Neural Networks',
    department: 'BCA (AI & DS)',
    batch: '2024',
    semester: 3,
    section: 'Section B',
    enrolledCount: 42,
  },
  {
    id: 'sub-3',
    code: 'CS301',
    name: 'Operating Systems',
    department: 'B.Sc Computer Science',
    batch: '2024',
    semester: 3,
    section: 'Section A',
    enrolledCount: 50,
  },
  {
    id: 'sub-4',
    code: 'ELEC401',
    name: 'Open Elective AI',
    department: 'B.Com General',
    batch: '2023',
    semester: 5,
    section: 'Section A',
    enrolledCount: 30,
  },
];

test('getShortSessionLabel formats FN and AN cleanly', () => {
  assert.equal(getShortSessionLabel('FN (09:30 - 12:30)'), 'FN');
  assert.equal(getShortSessionLabel('AN (14:00 - 17:00)'), 'AN');
});

test('buildConflictHeatmapMatrix reports zero conflicts when cohorts occupy distinct slots', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 'sub-1',
      subjectCode: 'AIDS301',
      subjectName: 'Machine Learning',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section A',
      enrolledCount: 45,
      date: '2026-11-17',
      session: 'AN (14:00 - 17:00)',
      hallNumber: 'H101',
      invigilatorName: 'Dr. Rao',
      hasStudentClash: false,
    },
    {
      examId: 'ex-2',
      subjectId: 'sub-2',
      subjectCode: 'AIDS302',
      subjectName: 'Neural Networks',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section B',
      enrolledCount: 42,
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      hallNumber: 'H102',
      invigilatorName: 'Dr. Iyer',
      hasStudentClash: false,
    },
    {
      examId: 'ex-3',
      subjectId: 'sub-3',
      subjectCode: 'CS301',
      subjectName: 'Operating Systems',
      department: 'B.Sc Computer Science',
      batch: '2024',
      semester: 3,
      section: 'Section A',
      enrolledCount: 50,
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      hallNumber: 'H103',
      invigilatorName: 'Prof. Nair',
      hasStudentClash: false,
    },
  ];

  const matrix = buildConflictHeatmapMatrix({
    schedule,
    subjects: sampleSubjects,
    students: [],
  });

  // Chronological date ordering (2026-11-16 FN, AN, 2026-11-17 FN, AN)
  assert.equal(matrix.slots.length, 4);
  assert.equal(matrix.slots[0].slotKey, '2026-11-16|FN (09:30 - 12:30)');
  assert.equal(matrix.slots[1].slotKey, '2026-11-16|AN (14:00 - 17:00)');
  assert.equal(matrix.slots[2].slotKey, '2026-11-17|FN (09:30 - 12:30)');

  assert.equal(matrix.summary.totalCohorts, 2);
  assert.equal(matrix.summary.conflictCellCount, 0);
  assert.equal(matrix.summary.affectedCohortCount, 0);
});

test('buildConflictHeatmapMatrix flags red conflict cell when same student cohort has 2+ overlapping exams', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 'sub-1',
      subjectCode: 'AIDS301',
      subjectName: 'Machine Learning',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section A',
      enrolledCount: 45,
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      hallNumber: 'H101',
      invigilatorName: 'Dr. Rao',
      hasStudentClash: true,
    },
    {
      examId: 'ex-2',
      subjectId: 'sub-2',
      subjectCode: 'AIDS302',
      subjectName: 'Neural Networks',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      section: 'Section B',
      enrolledCount: 42,
      date: '2026-11-16',
      session: 'FN (09:30 - 12:30)',
      hallNumber: 'H102',
      invigilatorName: 'Dr. Iyer',
      hasStudentClash: true,
    },
  ];

  const matrix = buildConflictHeatmapMatrix({
    schedule,
    subjects: sampleSubjects,
    students: [],
  });

  assert.equal(matrix.summary.conflictCellCount, 1);
  assert.equal(matrix.summary.affectedCohortCount, 1);
  assert.equal(matrix.rows.length, 1);

  const conflictCell = matrix.rows[0].cells[0];
  assert.equal(conflictCell.isConflict, true);
  assert.equal(conflictCell.severity, 'conflict');
  assert.equal(conflictCell.count, 2);
  assert.equal(conflictCell.exams.length, 2);
  assert.ok(conflictCell.conflictReasons[0].includes('2 simultaneous exams'));
});

test('buildConflictHeatmapMatrix detects cross-cohort shared enrolled students in the same slot', () => {
  const schedule = [
    {
      examId: 'ex-1',
      subjectId: 'sub-1',
      subjectCode: 'AIDS301',
      subjectName: 'Machine Learning',
      department: 'BCA (AI & DS)',
      batch: '2024',
      semester: 3,
      enrolledCount: 45,
      date: '2026-11-16',
      session: 'AN (14:00 - 17:00)',
      hallNumber: 'H101',
    },
    {
      examId: 'ex-4',
      subjectId: 'sub-4',
      subjectCode: 'ELEC401',
      subjectName: 'Open Elective AI',
      department: 'B.Com General',
      batch: '2023',
      semester: 5,
      enrolledCount: 30,
      date: '2026-11-16',
      session: 'AN (14:00 - 17:00)',
      hallNumber: 'H201',
    },
  ];

  const students = [
    { id: 'stu-1', regNo: 'AI0001', enrolledSubjectIds: ['sub-1', 'sub-4'] },
    { id: 'stu-2', regNo: 'AI0002', enrolledSubjectIds: ['sub-1', 'sub-4'] },
  ];

  const matrix = buildConflictHeatmapMatrix({
    schedule,
    subjects: sampleSubjects,
    students,
  });

  assert.equal(matrix.summary.conflictCellCount, 2);
  assert.equal(matrix.summary.affectedCohortCount, 2);
  const firstConflictCell = matrix.rows[0].cells.find((c) => c.count > 0);
  assert.equal(firstConflictCell.isConflict, true);
  assert.equal(firstConflictCell.sharedStudentOverlapCount, 2);
});

test('buildConflictHeatmapMatrix handles empty schedule gracefully', () => {
  const matrix = buildConflictHeatmapMatrix({ schedule: [], subjects: [], students: [] });
  assert.equal(matrix.slots.length, 0);
  assert.equal(matrix.rows.length, 0);
  assert.equal(matrix.summary.conflictCellCount, 0);
});
