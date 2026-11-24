import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConflictReportPayload,
  buildOptimizationRunPayload,
  buildScheduleMutationPlan,
  normalizeConflictsPayload,
  stripUndefinedDeep,
} from './firestorePayload.js';

const TIMESTAMP_TOKEN = { __serverTimestamp: true };

const ALLOWED_SCHEDULE_UPDATE_KEYS = new Set([
  'schedule',
  'bestFitness',
  'history',
  'conflicts',
  'convergedAtGeneration',
  'executionTimeMs',
  'scope',
  'updatedBy',
  'updatedAt',
]);

const ALLOWED_TIMETABLE_UPDATE_KEYS = new Set([
  'scheduleId',
  'entries',
  'scope',
  'updatedBy',
  'updatedAt',
]);

test('update on existing schedule and timetable preserves createdAt/createdBy and uses update mode', () => {
  const plan = buildScheduleMutationPlan({
    scheduleId: 'sched-26652a068bf9',
    timetableId: 'tt-sched-26652a068bf9',
    reportId: 'rep-123456',
    schedule: [
      {
        examId: 'exam-1',
        subjectCode: 'AIDS301',
        date: '2026-11-16',
        session: 'FN (09:30 - 12:30)',
        hasStudentClash: false,
        clashPeers: undefined,
      },
    ],
    conflicts: {
      studentClashes: 0,
      invigilatorConflicts: 0,
      capacityViolations: 0,
      hallDoubleBookings: 0,
      departmentWarnings: 1,
      totalHardViolations: 0,
      utilizationRate: 85.4,
      workloadStdDev: 0.5,
    },
    uid: 'user-123',
    timestampToken: TIMESTAMP_TOKEN,
    schedExists: true,
    schedExistingData: {
      id: 'sched-26652a068bf9',
      bestFitness: 990,
      history: [{ generation: 1, bestFitness: 990 }],
      convergedAtGeneration: 12,
      executionTimeMs: 42,
      scope: 'ALL',
    },
    ttExists: true,
    ttExistingData: {
      id: 'tt-sched-26652a068bf9',
      scheduleId: 'sched-26652a068bf9',
      scope: 'ALL',
    },
  });

  assert.equal(plan.scheduleMutation.mode, 'update');
  assert.equal(plan.timetableMutation.mode, 'update');
  assert.equal(plan.conflictReportMutation.mode, 'set');

  // Critical: update mutations must NEVER contain createdAt, createdBy, or id
  for (const forbidden of ['id', 'createdBy', 'createdAt']) {
    assert.equal(Object.hasOwn(plan.scheduleMutation.data, forbidden), false);
    assert.equal(Object.hasOwn(plan.timetableMutation.data, forbidden), false);
  }

  // Every updated key must be permitted by firestore.rules affectedKeys().hasOnly(...)
  for (const key of Object.keys(plan.scheduleMutation.data)) {
    assert.equal(
      ALLOWED_SCHEDULE_UPDATE_KEYS.has(key),
      true,
      `Unexpected schedule update key: ${key}`
    );
  }
  for (const key of Object.keys(plan.timetableMutation.data)) {
    assert.equal(
      ALLOWED_TIMETABLE_UPDATE_KEYS.has(key),
      true,
      `Unexpected timetable update key: ${key}`
    );
  }

  // Undefined fields must be stripped from schedule entries
  assert.equal(Object.hasOwn(plan.cleanSchedule[0], 'clashPeers'), false);
});

test('creates new documents with mode set when neither schedule nor timetable exists', () => {
  const plan = buildScheduleMutationPlan({
    scheduleId: 'sched-new1',
    timetableId: 'tt-sched-new1',
    reportId: 'rep-new1',
    schedule: [{ examId: 'exam-1', hasStudentClash: true }],
    conflicts: { studentClashes: 1, totalHardViolations: 1 },
    gaResult: {
      bestFitness: 500,
      history: [{ generation: 1, bestFitness: 500 }],
      convergedAtGeneration: 5,
      executionTimeMs: 120,
    },
    scope: 'SINGLE_DAY',
    uid: 'user-abc',
    timestampToken: TIMESTAMP_TOKEN,
    schedExists: false,
    ttExists: false,
  });

  assert.equal(plan.scheduleMutation.mode, 'set');
  assert.equal(plan.scheduleMutation.data.id, 'sched-new1');
  assert.equal(plan.scheduleMutation.data.createdBy, 'user-abc');
  assert.equal(plan.scheduleMutation.data.createdAt, TIMESTAMP_TOKEN);
  assert.equal(plan.scheduleMutation.data.scope, 'SINGLE_DAY');

  assert.equal(plan.timetableMutation.mode, 'set');
  assert.equal(plan.timetableMutation.data.id, 'tt-sched-new1');
  assert.equal(plan.timetableMutation.data.scheduleId, 'sched-new1');
  assert.equal(plan.timetableMutation.data.scope, 'SINGLE_DAY');

  assert.equal(plan.conflictReportMutation.data.flaggedItems.length, 1);
});

test('repairs legacy out-of-range fields during existing schedule update without breaking allowed keys', () => {
  const plan = buildScheduleMutationPlan({
    scheduleId: 'sched-legacy',
    timetableId: 'tt-sched-legacy',
    reportId: 'rep-legacy',
    schedule: [],
    conflicts: {
      studentClashes: -2,
      utilizationRate: 2500,
      workloadStdDev: Number.NaN,
    },
    uid: 'user-1',
    timestampToken: TIMESTAMP_TOKEN,
    schedExists: true,
    schedExistingData: {
      bestFitness: -9999999,
      convergedAtGeneration: 4.5,
      executionTimeMs: -10,
      scope: '',
    },
    ttExists: true,
    ttExistingData: {},
  });

  assert.equal(plan.scheduleMutation.mode, 'update');
  assert.equal(plan.scheduleMutation.data.bestFitness, -1000000);
  assert.equal(plan.scheduleMutation.data.convergedAtGeneration, 4);
  assert.equal(plan.scheduleMutation.data.executionTimeMs, 0);
  assert.equal(plan.scheduleMutation.data.scope, 'ALL');
  assert.equal(plan.timetableMutation.data.scope, 'ALL');

  for (const key of Object.keys(plan.scheduleMutation.data)) {
    assert.equal(ALLOWED_SCHEDULE_UPDATE_KEYS.has(key), true);
  }
  for (const key of Object.keys(plan.timetableMutation.data)) {
    assert.equal(ALLOWED_TIMETABLE_UPDATE_KEYS.has(key), true);
  }

  assert.equal(plan.cleanConflicts.studentClashes, 0);
  assert.equal(plan.cleanConflicts.utilizationRate, 1000);
  assert.equal(plan.cleanConflicts.workloadStdDev, 0);
});

test('stripUndefinedDeep and buildConflictReportPayload conform to rule schema', () => {
  const cleaned = stripUndefinedDeep({ a: 1, b: undefined, c: [{ x: 2, y: undefined }] });
  assert.deepEqual(cleaned, { a: 1, c: [{ x: 2 }] });

  const normalized = normalizeConflictsPayload({ studentClashes: 2, invigilatorConflicts: 1 });
  assert.equal(normalized.totalHardViolations, 3);

  const report = buildConflictReportPayload({
    reportId: 'rep-1',
    scheduleId: 'sched-1',
    schedule: [{ examId: 'e1', hasStudentClash: false }, { examId: 'e2', hasHallDoubleBooking: true }],
    conflicts: normalized,
    uid: 'uid-1',
    timestampToken: TIMESTAMP_TOKEN,
  });
  assert.equal(report.flaggedItems.length, 1);
  assert.equal(Object.hasOwn(report, 'departmentWarnings'), false);
});

const REQUIRED_OPTIMIZATION_RUN_KEYS = [
  'id',
  'scheduleId',
  'scope',
  'executionMode',
  'status',
  'bestFitness',
  'convergedAtGeneration',
  'executionTimeMs',
  'populationSize',
  'generations',
  'mutationRate',
  'crossoverRate',
  'constraintConfig',
  'conflicts',
  'constraintReport',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
];

test('buildOptimizationRunPayload conforms strictly to optimizationRuns firestore.rules schema', () => {
  const optimalRun = buildOptimizationRunPayload({
    runId: 'garun-opt1',
    scheduleId: 'sched-opt1',
    scope: 'ALL',
    executionMode: 'SERVER_WORKER',
    gaConfig: {
      populationSize: 50,
      generations: 60,
      mutationRate: 0.14,
      crossoverRate: 0.85,
      constraintConfig: { hardConstraintWeight: 1500, sameDayCohortPenalty: 30 },
    },
    gaResult: {
      bestFitness: 985.4,
      convergedAtGeneration: 24,
      executionTimeMs: 42,
      conflicts: { totalHardViolations: 0, utilizationRate: 82.5, workloadStdDev: 0.4 },
      constraintReport: { softMetrics: { sameDayCohortOverlaps: 0, hardPenalty: 0, softPenalty: 14.6 } },
    },
    uid: 'user-xyz',
    timestampToken: TIMESTAMP_TOKEN,
  });

  assert.deepEqual(Object.keys(optimalRun).sort(), [...REQUIRED_OPTIMIZATION_RUN_KEYS].sort());
  assert.equal(optimalRun.status, 'OPTIMAL');
  assert.equal(optimalRun.executionMode, 'SERVER_WORKER');
  assert.equal(optimalRun.constraintConfig.hardConstraintWeight, 1500);
  assert.equal(optimalRun.constraintReport.isFeasible, true);

  const conflictRun = buildOptimizationRunPayload({
    runId: 'garun-err1',
    scheduleId: 'sched-err1',
    gaConfig: {},
    gaResult: {
      conflicts: { studentClashes: 2 },
    },
    uid: 'user-xyz',
    timestampToken: TIMESTAMP_TOKEN,
  });
  assert.equal(conflictRun.status, 'CONFLICTS_REMAINING');
  assert.equal(conflictRun.conflicts.totalHardViolations, 2);
  assert.equal(conflictRun.constraintReport.isFeasible, false);
});
