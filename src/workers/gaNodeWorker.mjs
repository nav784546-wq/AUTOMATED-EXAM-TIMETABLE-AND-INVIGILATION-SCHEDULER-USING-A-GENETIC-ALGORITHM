import { parentPort, workerData } from 'node:worker_threads';
import { normalizeConstraintConfig, runGeneticAlgorithm } from '../utils/geneticAlgorithm.js';
import { evaluateScheduleConflicts } from '../utils/conflictEvaluator.js';

try {
  const {
    exams = [],
    subjects = [],
    halls = [],
    faculty = [],
    students = [],
    departments = [],
    config = {},
  } = workerData || {};

  const resolvedDepartments =
    departments && departments.length > 0
      ? departments
      : Array.isArray(config?.departments)
      ? config.departments
      : [];

  const result = runGeneticAlgorithm(exams, subjects, halls, faculty, students, config, {
    departments: resolvedDepartments,
  });

  const basePolicy = normalizeConstraintConfig(config?.constraintConfig);
  const evalPolicy =
    config?.scope === 'SINGLE_DAY' ? { ...basePolicy, minGapDaysBetweenExams: 0 } : basePolicy;

  const evaluated = evaluateScheduleConflicts(result.schedule, {
    faculty,
    subjects,
    students,
    halls,
    departments: resolvedDepartments,
    policy: evalPolicy,
  });

  parentPort?.postMessage({
    ok: true,
    result: {
      ...result,
      schedule: evaluated.schedule,
      conflicts: evaluated.conflicts,
      constraintReport: {
        ...result.constraintReport,
        isFeasible: evaluated.conflicts.totalHardViolations === 0,
        hardViolations: {
          studentClashes: evaluated.conflicts.studentClashes,
          invigilatorConflicts: evaluated.conflicts.invigilatorConflicts,
          capacityViolations: evaluated.conflicts.capacityViolations,
          hallDoubleBookings: evaluated.conflicts.hallDoubleBookings,
          departmentSameDayViolations: evaluated.conflicts.departmentSameDayViolations,
          departmentGapViolations: evaluated.conflicts.departmentGapViolations,
          departmentIndependenceViolations: evaluated.conflicts.departmentIndependenceViolations,
          total: evaluated.conflicts.totalHardViolations,
        },
        validationWarnings: evaluated.conflicts.validationWarnings,
        departmentTimelines: evaluated.conflicts.departmentTimelines,
      },
      executionMode: 'SERVER_WORKER',
    },
  });
} catch (err) {
  parentPort?.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err || 'Server GA worker failed.'),
  });
}
