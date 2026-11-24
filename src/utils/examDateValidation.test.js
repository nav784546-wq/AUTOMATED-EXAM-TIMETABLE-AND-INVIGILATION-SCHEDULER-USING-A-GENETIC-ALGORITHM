import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCHEDULING_POLICY,
  normalizeSchedulingPolicy,
  validateCompleteExamTimetable,
  validateDepartmentIndependence,
  validateMinimumExamGap,
  validateOneExamPerDepartmentPerDay,
} from './conflictEvaluator.js';
import { runGeneticAlgorithm } from './geneticAlgorithm.js';
import { buildBatchAutoResolvePlan } from './conflictQuickFix.js';
import { recalculateScheduleConflicts } from './dataValidation.js';

const departments = [
  { id: 'dept-aids', name: 'BCA (AI & DS)' },
  { id: 'dept-dt', name: 'BCA (DT)' },
  { id: 'dept-cs', name: 'B.Sc. Computer Science' },
];

const halls = [
  { id: 'h1', hallNumber: 'A-101', capacity: 60, available: true },
  { id: 'h2', hallNumber: 'A-102', capacity: 60, available: true },
  { id: 'h3', hallNumber: 'A-103', capacity: 60, available: true },
];

const faculty = [
  { id: 'f1', name: 'Prof. One', department: 'ECE', available: true, maxDuties: 8 },
  { id: 'f2', name: 'Prof. Two', department: 'MECH', available: true, maxDuties: 8 },
  { id: 'f3', name: 'Prof. Three', department: 'CIVIL', available: true, maxDuties: 8 },
];

function makeExam({
  examId,
  subjectId,
  subjectCode,
  subjectName,
  department,
  departmentId,
  date,
  session = 'FN (09:30 - 12:30)',
  hallId = 'h1',
  invigilatorId = 'f1',
  section = 'Section A',
}) {
  return {
    examId,
    subjectId,
    subjectCode,
    subjectName,
    department,
    ...(departmentId ? { departmentId } : {}),
    batch: '2024',
    semester: 3,
    section,
    enrolledCount: 40,
    date,
    session,
    hallId,
    hallCapacity: 60,
    invigilatorId,
  };
}

test('1. One exam per day per department: rejects Tamil FN + English AN on same date', () => {
  const schedule = [
    makeExam({
      examId: 'ex1',
      subjectId: 's1',
      subjectCode: 'TAM101',
      subjectName: 'Tamil',
      department: 'BCA (AI & DS)',
      departmentId: 'dept-aids',
      date: '2026-11-17',
      session: 'FN (09:30 - 12:30)',
      hallId: 'h1',
      invigilatorId: 'f1',
    }),
    makeExam({
      examId: 'ex2',
      subjectId: 's2',
      subjectCode: 'ENG101',
      subjectName: 'English',
      department: 'BCA (AI & DS)',
      departmentId: 'dept-aids',
      date: '2026-11-17',
      session: 'AN (14:00 - 17:00)',
      hallId: 'h2',
      invigilatorId: 'f2',
    }),
  ];

  const oneDay = validateOneExamPerDepartmentPerDay(schedule, { departments });
  assert.equal(oneDay.valid, false);
  assert.equal(oneDay.count, 1);
  assert.match(oneDay.violations[0].message, /Only one examination per day per department is allowed/);

  const full = validateCompleteExamTimetable(schedule, { departments, halls, faculty });
  assert.equal(full.isValid, false);
  assert.equal(full.canFinalize, false);
  assert.equal(full.conflicts.departmentSameDayViolations, 1);
});

test('2 & 3. Mandatory minimum two-day gap: rejects Nov 17 + Nov 18 and Nov 17 + Nov 19', () => {
  const nov18 = [
    makeExam({
      examId: 'ex1',
      subjectId: 's1',
      subjectCode: 'TAM101',
      subjectName: 'Tamil',
      department: 'BCA (AI & DS)',
      date: '2026-11-17',
    }),
    makeExam({
      examId: 'ex2',
      subjectId: 's2',
      subjectCode: 'ENG101',
      subjectName: 'English',
      department: 'BCA (AI & DS)',
      date: '2026-11-18',
    }),
  ];
  const res18 = validateMinimumExamGap(nov18, { departments });
  assert.equal(res18.valid, false);
  assert.equal(res18.count, 1);
  assert.equal(
    res18.violations[0].message,
    'Invalid Schedule: BCA (AI & DS) has Tamil (TAM101) on 17.11.2026 and English (ENG101) on 18.11.2026. A minimum of two complete days between examinations is required.'
  );

  const nov19 = [
    nov18[0],
    makeExam({
      examId: 'ex2',
      subjectId: 's2',
      subjectCode: 'ENG101',
      subjectName: 'English',
      department: 'BCA (AI & DS)',
      date: '2026-11-19',
      session: 'AN (14:00 - 17:00)',
    }),
  ];
  const res19 = validateMinimumExamGap(nov19, { departments });
  assert.equal(res19.valid, false);
  assert.equal(res19.violations[0].actualCompleteGapDays, 1);
});

test('4 & 5. Mandatory minimum two-day gap: accepts Nov 17 + Nov 20 (2 gap days) and 17/21/25/29 (3 gap days)', () => {
  const exactTwo = [
    makeExam({
      examId: 'ex1',
      subjectId: 's1',
      subjectCode: 'TAM101',
      subjectName: 'Tamil',
      department: 'BCA (AI & DS)',
      date: '2026-11-17',
    }),
    makeExam({
      examId: 'ex2',
      subjectId: 's2',
      subjectCode: 'ENG101',
      subjectName: 'English',
      department: 'BCA (AI & DS)',
      date: '2026-11-20',
    }),
  ];
  const fullExact = validateCompleteExamTimetable(exactTwo, { departments, halls, faculty });
  assert.equal(fullExact.isValid, true);
  assert.equal(fullExact.canFinalize, true);
  assert.equal(fullExact.departmentTimelines['BCA (AI & DS)'][1].completeGapDaysFromPrev, 2);

  const threeDayPattern = [
    makeExam({ examId: 'ex1', subjectId: 's1', subjectCode: 'TAM101', subjectName: 'Tamil', department: 'BCA (AI & DS)', date: '2026-11-17' }),
    makeExam({ examId: 'ex2', subjectId: 's2', subjectCode: 'ENG101', subjectName: 'English', department: 'BCA (AI & DS)', date: '2026-11-21' }),
    makeExam({ examId: 'ex3', subjectId: 's3', subjectCode: 'MAT101', subjectName: 'Mathematics', department: 'BCA (AI & DS)', date: '2026-11-25' }),
    makeExam({ examId: 'ex4', subjectId: 's4', subjectCode: 'CS101', subjectName: 'Computer Science', department: 'BCA (AI & DS)', date: '2026-11-29' }),
  ];
  const fullThree = validateCompleteExamTimetable(threeDayPattern, { departments, halls, faculty });
  assert.equal(fullThree.isValid, true);
  assert.deepEqual(
    fullThree.departmentTimelines['BCA (AI & DS)'].slice(1).map((t) => t.completeGapDaysFromPrev),
    [3, 3, 3]
  );
});

test('6 & 7. Independent department scheduling: different departments may share Nov 17 while maintaining own >=2 day gaps', () => {
  const schedule = [
    makeExam({ examId: 'a1', subjectId: 'sa1', subjectCode: 'AIDS1', subjectName: 'Tamil', department: 'BCA (AI & DS)', departmentId: 'dept-aids', date: '2026-11-17', hallId: 'h1', invigilatorId: 'f1' }),
    makeExam({ examId: 'a2', subjectId: 'sa2', subjectCode: 'AIDS2', subjectName: 'English', department: 'BCA (AI & DS)', departmentId: 'dept-aids', date: '2026-11-20', hallId: 'h1', invigilatorId: 'f1' }),
    makeExam({ examId: 'b1', subjectId: 'sb1', subjectCode: 'DT1', subjectName: 'Tamil', department: 'BCA (DT)', departmentId: 'dept-dt', date: '2026-11-17', hallId: 'h2', invigilatorId: 'f2' }),
    makeExam({ examId: 'b2', subjectId: 'sb2', subjectCode: 'DT2', subjectName: 'English', department: 'BCA (DT)', departmentId: 'dept-dt', date: '2026-11-21', hallId: 'h2', invigilatorId: 'f2' }),
  ];

  const full = validateCompleteExamTimetable(schedule, { departments, halls, faculty });
  assert.equal(full.isValid, true);
  assert.equal(full.departmentIndependence.sharedDates.length, 1);

  const disallowShared = validateDepartmentIndependence(schedule, {
    departments,
    policy: normalizeSchedulingPolicy({ allowMultipleDeptsSameDate: false }),
  });
  assert.equal(disallowShared.valid, false);
  assert.equal(disallowShared.count, 1);
});

test('8. Canonical department identity: case/whitespace aliases share dept identity via departmentId across sections', () => {
  const schedule = [
    makeExam({ examId: 'ex1', subjectId: 's1', subjectCode: 'MAT101', subjectName: 'Mathematics', department: ' bca (ai & ds) ', departmentId: 'dept-aids', date: '2026-11-17', section: 'Section A', hallId: 'h1', invigilatorId: 'f1' }),
    makeExam({ examId: 'ex2', subjectId: 's2', subjectCode: 'ENG101', subjectName: 'English', department: 'BCA (AI & DS)', departmentId: 'dept-aids', date: '2026-11-19', section: 'Section B', hallId: 'h2', invigilatorId: 'f2' }),
  ];
  const res = recalculateScheduleConflicts(schedule, faculty, {
    halls,
    departments,
    policy: DEFAULT_SCHEDULING_POLICY,
  });
  assert.equal(res.conflicts.departmentGapViolations, 1);
  assert.equal(res.schedule[0].hasDepartmentGapViolation, true);
  assert.equal(res.schedule[1].hasDepartmentGapViolation, true);
});

test('9. Shared enrolled students across departments in same date+session rejected', () => {
  const students = [{ id: 'stu-1', regNo: '24A001', enrolledSubjectIds: ['s1', 's2'] }];
  const schedule = [
    makeExam({ examId: 'ex1', subjectId: 's1', subjectCode: 'AIDS1', subjectName: 'Elective 1', department: 'BCA (AI & DS)', date: '2026-11-17', hallId: 'h1', invigilatorId: 'f1' }),
    makeExam({ examId: 'ex2', subjectId: 's2', subjectCode: 'DT1', subjectName: 'Elective 2', department: 'BCA (DT)', date: '2026-11-17', hallId: 'h2', invigilatorId: 'f2' }),
  ];
  const full = validateCompleteExamTimetable(schedule, { departments, halls, faculty, students });
  assert.equal(full.isValid, false);
  assert.equal(full.conflicts.studentClashes, 2);
});

test('10. JS GA + Batch Auto-Resolve honor 1-exam/day & min 2-day gap per department', () => {
  const subjects = [
    { id: 's1', code: 'AIDS1', name: 'Tamil', department: 'BCA (AI & DS)', departmentId: 'dept-aids', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 40 },
    { id: 's2', code: 'AIDS2', name: 'English', department: 'BCA (AI & DS)', departmentId: 'dept-aids', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 40 },
    { id: 's3', code: 'AIDS3', name: 'Math', department: 'BCA (AI & DS)', departmentId: 'dept-aids', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 40 },
    { id: 's4', code: 'DT1', name: 'Tamil', department: 'BCA (DT)', departmentId: 'dept-dt', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 35 },
    { id: 's5', code: 'DT2', name: 'English', department: 'BCA (DT)', departmentId: 'dept-dt', batch: '2024', semester: 3, section: 'Section A', enrolledCount: 35 },
  ];
  const exams = subjects.map((s) => ({ id: `ex-${s.id}`, subjectId: s.id }));

  const gaRes = runGeneticAlgorithm(
    exams,
    subjects,
    halls,
    faculty,
    [],
    {
      populationSize: 30,
      generations: 45,
      availableDates: ['2026-11-16', '2026-11-17', '2026-11-18'],
      constraintConfig: DEFAULT_SCHEDULING_POLICY,
    },
    { departments }
  );

  assert.equal(gaRes.conflicts.totalHardViolations, 0);
  assert.equal(gaRes.conflicts.departmentSameDayViolations, 0);
  assert.equal(gaRes.conflicts.departmentGapViolations, 0);
  assert.equal(gaRes.validation.canFinalize, true);

  // Also test Quick Fix Batch Auto-Resolve fixes an invalid manual gap
  const broken = [
    makeExam({ examId: 'ex1', subjectId: 's1', subjectCode: 'AIDS1', subjectName: 'Tamil', department: 'BCA (AI & DS)', departmentId: 'dept-aids', date: '2026-11-17', hallId: 'h1', invigilatorId: 'f1' }),
    makeExam({ examId: 'ex2', subjectId: 's2', subjectCode: 'AIDS2', subjectName: 'English', department: 'BCA (AI & DS)', departmentId: 'dept-aids', date: '2026-11-18', hallId: 'h2', invigilatorId: 'f2' }),
  ];
  const plan = buildBatchAutoResolvePlan({
    schedule: broken,
    subjects,
    halls,
    faculty,
    departments,
    policy: DEFAULT_SCHEDULING_POLICY,
    availableDates: ['2026-11-17', '2026-11-18', '2026-11-19'],
  });
  assert.ok(plan.beforeConflicts.departmentGapViolations > 0);
  assert.equal(plan.afterConflicts.totalHardViolations, 0);
  assert.equal(plan.afterConflicts.departmentGapViolations, 0);
});
