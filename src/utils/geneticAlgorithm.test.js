import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONSTRAINT_CONFIG,
  evaluateChromosome,
  normalizeConstraintConfig,
  runGeneticAlgorithm,
} from './geneticAlgorithm.js';
import { buildEnrollmentMap } from './conflictEvaluator.js';
import { buildTimetableCSV } from './exportReport.js';
import {
  DEFAULT_EXAM_DATES,
  INITIAL_EXAMS,
  INITIAL_FACULTY,
  INITIAL_HALLS,
  INITIAL_STUDENTS,
  INITIAL_SUBJECTS,
} from './seedData.js';

test('Genetic Algorithm produces a conflict-free schedule on multi-department seed data', () => {
  const result = runGeneticAlgorithm(
    INITIAL_EXAMS,
    INITIAL_SUBJECTS,
    INITIAL_HALLS,
    INITIAL_FACULTY,
    INITIAL_STUDENTS,
    {
      populationSize: 40,
      generations: 50,
      mutationRate: 0.12,
      crossoverRate: 0.8,
      availableDates: DEFAULT_EXAM_DATES,
    }
  );

  assert.equal(result.schedule.length, INITIAL_EXAMS.length);
  assert.equal(result.conflicts.totalHardViolations, 0);
  assert.equal(result.conflicts.studentClashes, 0);
  assert.equal(result.conflicts.invigilatorConflicts, 0);
  assert.equal(result.conflicts.capacityViolations, 0);
  assert.equal(result.conflicts.hallDoubleBookings, 0);
  assert.equal(result.history.length, 50);
  assert.ok(result.bestFitness > 900);
  assert.equal(result.constraintReport.isFeasible, true);
  assert.equal(result.constraintReport.hardViolations.total, 0);
  assert.deepEqual(result.constraintReport.constraintConfigUsed, DEFAULT_CONSTRAINT_CONFIG);
});

test('buildTimetableCSV formats headers and rows properly', () => {
  const result = runGeneticAlgorithm(
    INITIAL_EXAMS,
    INITIAL_SUBJECTS,
    INITIAL_HALLS,
    INITIAL_FACULTY,
    INITIAL_STUDENTS,
    {
      populationSize: 30,
      generations: 30,
      mutationRate: 0.1,
      crossoverRate: 0.8,
      availableDates: DEFAULT_EXAM_DATES,
    }
  );

  const csv = buildTimetableCSV(result.schedule);
  const lines = csv.split('\n');
  assert.equal(lines.length, INITIAL_EXAMS.length + 1);
  assert.ok(lines[0].includes('Subject Code'));
  assert.ok(lines[0].includes('Assigned Invigilator'));
});

test('Genetic Algorithm supports SINGLE_DAY scope with one subject per department on a single date', () => {
  const selectedIds = ['sub-1', 'sub-4', 'sub-5', 'sub-6', 'sub-7', 'sub-8'];
  const result = runGeneticAlgorithm(
    INITIAL_EXAMS,
    INITIAL_SUBJECTS,
    INITIAL_HALLS,
    INITIAL_FACULTY,
    INITIAL_STUDENTS,
    {
      populationSize: 40,
      generations: 50,
      mutationRate: 0.12,
      crossoverRate: 0.8,
      availableDates: DEFAULT_EXAM_DATES,
      scope: 'SINGLE_DAY',
      selectedSubjectIds: selectedIds,
      singleDayDate: '2026-11-18',
      singleDaySession: 'BOTH',
    }
  );

  assert.equal(result.schedule.length, 6);
  assert.ok(result.schedule.every((item) => item.date === '2026-11-18'));
  assert.equal(result.conflicts.totalHardViolations, 0);
});

test('evaluateChromosome penalizes same-day cohort overlaps and respects enforceMaxDuties toggle', () => {
  const exams = [
    { id: 'ex-1', subjectId: 'sub-a' },
    { id: 'ex-2', subjectId: 'sub-b' },
  ];
  const subjects = [
    { id: 'sub-a', code: 'CS101', name: 'A', department: 'CSE', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 40 },
    { id: 'sub-b', code: 'CS102', name: 'B', department: 'CSE', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 40 },
  ];
  const halls = [
    { id: 'h-1', hallNumber: 'H1', capacity: 60, available: true },
    { id: 'h-2', hallNumber: 'H2', capacity: 60, available: true },
  ];
  const faculty = [
    { id: 'f-1', name: 'F1', available: true, maxDuties: 1 },
    { id: 'f-2', name: 'F2', available: true, maxDuties: 1 },
  ];
  const students = [
    { id: 's-1', regNo: '24CS001', enrolledSubjectIds: ['sub-a', 'sub-b'] },
  ];

  const examsMap = new Map(exams.map((e) => [e.id, e]));
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  const hallsMap = new Map(halls.map((h) => [h.id, h]));
  const facultyMap = new Map(faculty.map((f) => [f.id, f]));
  const enrollmentMap = buildEnrollmentMap(students);

  // Two exams for same student on the same date (FN & AN) with same faculty (exceeds maxDuties=1)
  const chrom = [
    { examId: 'ex-1', date: '2026-11-16', session: 'FN (09:30 - 12:30)', hallId: 'h-1', invigilatorId: 'f-1' },
    { examId: 'ex-2', date: '2026-11-16', session: 'AN (14:00 - 17:00)', hallId: 'h-2', invigilatorId: 'f-1' },
  ];

  const strictEval = evaluateChromosome(
    chrom,
    examsMap,
    subjectsMap,
    hallsMap,
    facultyMap,
    enrollmentMap,
    normalizeConstraintConfig({
      enforceMaxDuties: true,
      sameDayCohortPenalty: 40,
      allowSameDayFnAnPerDept: true,
    })
  );
  assert.equal(strictEval.sameDayCohortOverlaps, 1);
  assert.equal(strictEval.invigilatorConflicts, 1);

  const relaxedEval = evaluateChromosome(
    chrom,
    examsMap,
    subjectsMap,
    hallsMap,
    facultyMap,
    enrollmentMap,
    normalizeConstraintConfig({
      enforceMaxDuties: false,
      preventSameCohortDoubleExamPerDay: false,
      allowSameDayFnAnPerDept: true,
    })
  );
  assert.equal(relaxedEval.invigilatorConflicts, 0);
  assert.ok(relaxedEval.fitness > strictEval.fitness);
});

test('runGeneticAlgorithm spreads overlapping cohort exams across separate dates when enabled', () => {
  const exams = [
    { id: 'ex-1', subjectId: 'sub-1' },
    { id: 'ex-2', subjectId: 'sub-2' },
  ];
  const subjects = [
    { id: 'sub-1', code: 'CS201', name: 'DSA', department: 'CSE', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 45 },
    { id: 'sub-2', code: 'CS202', name: 'DBMS', department: 'CSE', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 45 },
  ];
  const halls = [
    { id: 'h-1', hallNumber: 'A-101', capacity: 60, available: true },
    { id: 'h-2', hallNumber: 'A-102', capacity: 60, available: true },
  ];
  const faculty = [
    { id: 'f-1', name: 'Prof A', department: 'CSE', available: true, maxDuties: 3 },
    { id: 'f-2', name: 'Prof B', department: 'CSE', available: true, maxDuties: 3 },
  ];
  const students = [
    { id: 'stu-1', regNo: '24CS001', enrolledSubjectIds: ['sub-1', 'sub-2'] },
  ];

  const result = runGeneticAlgorithm(exams, subjects, halls, faculty, students, {
    populationSize: 40,
    generations: 60,
    mutationRate: 0.15,
    crossoverRate: 0.8,
    availableDates: ['2026-11-16', '2026-11-17', '2026-11-18'],
    constraintConfig: {
      sameDayCohortPenalty: 80,
      preventSameCohortDoubleExamPerDay: true,
    },
  });

  assert.equal(result.conflicts.totalHardViolations, 0);
  assert.equal(result.constraintReport.softMetrics.sameDayCohortOverlaps, 0);
  assert.notEqual(result.schedule[0].date, result.schedule[1].date);
});

test('runGeneticAlgorithm applies custom elitismCount, tournamentSize, and earlyStopGenerations', () => {
  const result = runGeneticAlgorithm(
    INITIAL_EXAMS,
    INITIAL_SUBJECTS,
    INITIAL_HALLS,
    INITIAL_FACULTY,
    INITIAL_STUDENTS,
    {
      populationSize: 25,
      generations: 60,
      mutationRate: 0.14,
      crossoverRate: 0.85,
      elitismCount: 4,
      tournamentSize: 5,
      earlyStopGenerations: 6,
      availableDates: DEFAULT_EXAM_DATES,
    }
  );

  assert.deepEqual(result.gaParametersUsed, {
    populationSize: 25,
    generations: 60,
    mutationRate: 0.14,
    crossoverRate: 0.85,
    elitismCount: 4,
    tournamentSize: 5,
    earlyStopGenerations: 6,
  });
  assert.equal(result.conflicts.totalHardViolations, 0);
  assert.ok(result.history.length <= 60);
  assert.ok(result.history.length >= 1);
});

