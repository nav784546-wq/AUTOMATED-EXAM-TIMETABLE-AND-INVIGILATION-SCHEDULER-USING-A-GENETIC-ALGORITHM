/**
 * Pure Firestore payload sanitization & create-vs-update mutation builders.
 * Ensures all outgoing writes strictly satisfy firestore.rules & firebase-blueprint.json
 * constraints (immutable createdBy/createdAt preservation on update, numeric bounds,
 * array caps, and removal of undefined fields).
 */

export function clampInt(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

export function clampNum(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function clampStr(value, maxLen, fallback = '') {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

export function stripUndefinedDeep(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) {
      out[k] = stripUndefinedDeep(v);
    }
  }
  return out;
}

export function normalizeConflictsPayload(conflicts = {}) {
  const studentClashes = clampInt(conflicts?.studentClashes, 0, 10000, 0);
  const invigilatorConflicts = clampInt(conflicts?.invigilatorConflicts, 0, 10000, 0);
  const capacityViolations = clampInt(conflicts?.capacityViolations, 0, 10000, 0);
  const hallDoubleBookings = clampInt(conflicts?.hallDoubleBookings, 0, 10000, 0);
  const departmentWarnings = clampInt(conflicts?.departmentWarnings, 0, 10000, 0);
  const departmentSameDayViolations = clampInt(conflicts?.departmentSameDayViolations, 0, 10000, 0);
  const departmentGapViolations = clampInt(conflicts?.departmentGapViolations, 0, 10000, 0);
  const departmentIndependenceViolations = clampInt(conflicts?.departmentIndependenceViolations, 0, 10000, 0);
  const computedHard =
    studentClashes +
    invigilatorConflicts +
    capacityViolations +
    hallDoubleBookings +
    departmentSameDayViolations +
    departmentGapViolations +
    departmentIndependenceViolations;
  const totalHardViolations = clampInt(
    conflicts?.totalHardViolations ?? computedHard,
    0,
    70000,
    computedHard
  );
  const utilizationRate = clampNum(conflicts?.utilizationRate, 0, 1000, 0);
  const workloadStdDev = clampNum(conflicts?.workloadStdDev, 0, 1000, 0);

  return {
    studentClashes,
    invigilatorConflicts,
    capacityViolations,
    hallDoubleBookings,
    departmentWarnings,
    departmentSameDayViolations,
    departmentGapViolations,
    departmentIndependenceViolations,
    totalHardViolations,
    utilizationRate,
    workloadStdDev,
  };
}

export function buildFlaggedItems(schedule = []) {
  return stripUndefinedDeep(
    (Array.isArray(schedule) ? schedule : [])
      .filter(
        (item) =>
          item &&
          (item.hasStudentClash ||
            item.hasInvigilatorConflict ||
            item.hasCapacityIssue ||
            item.hasHallDoubleBooking ||
            item.hasDepartmentDateViolation ||
            item.hasDepartmentGapViolation ||
            item.hasDepartmentIndependenceViolation)
      )
      .slice(0, 1000)
  );
}

export function buildConflictReportPayload({
  reportId,
  scheduleId,
  schedule = [],
  conflicts = {},
  uid,
  timestampToken,
}) {
  const cleanConflicts = normalizeConflictsPayload(conflicts);
  return {
    id: String(reportId),
    scheduleId: clampStr(scheduleId, 128, 'sched-unknown'),
    studentClashes: cleanConflicts.studentClashes,
    invigilatorConflicts: cleanConflicts.invigilatorConflicts,
    capacityViolations: cleanConflicts.capacityViolations,
    hallDoubleBookings: cleanConflicts.hallDoubleBookings,
    totalHardViolations: cleanConflicts.totalHardViolations,
    utilizationRate: cleanConflicts.utilizationRate,
    workloadStdDev: cleanConflicts.workloadStdDev,
    flaggedItems: buildFlaggedItems(schedule),
    createdBy: uid,
    updatedBy: uid,
    createdAt: timestampToken,
    updatedAt: timestampToken,
  };
}

/**
 * Builds rule-compliant create (`set`) or partial `update` mutations for
 * `schedules/{scheduleId}`, `timetables/{timetableId}`, and `conflictReports/{reportId}`.
 *
 * Critical invariant: When `schedExists` or `ttExists` is true, `mode: 'update'`
 * MUST NEVER include `id`, `createdBy`, or `createdAt` so Firestore's immortal-field
 * and `affectedKeys().hasOnly(...)` security rules are satisfied.
 */
export function buildScheduleMutationPlan({
  scheduleId,
  timetableId,
  reportId,
  schedule = [],
  conflicts = {},
  gaResult = null,
  scope = 'ALL',
  uid,
  timestampToken,
  schedExists = false,
  schedExistingData = null,
  ttExists = false,
  ttExistingData = null,
}) {
  const cleanSchedule = stripUndefinedDeep((Array.isArray(schedule) ? schedule : []).slice(0, 1000));
  const cleanConflicts = normalizeConflictsPayload(conflicts);
  const resolvedScope = clampStr(
    scope || schedExistingData?.scope || ttExistingData?.scope || 'ALL',
    32,
    'ALL'
  );

  let scheduleMutation;
  if (schedExists) {
    const existing = schedExistingData || {};
    const updateData = {
      schedule: cleanSchedule,
      conflicts: cleanConflicts,
      updatedBy: uid,
      updatedAt: timestampToken,
    };

    if (gaResult) {
      if (gaResult.bestFitness !== undefined) {
        updateData.bestFitness = clampNum(gaResult.bestFitness, -1000000, 1000000, 0);
      }
      if (Array.isArray(gaResult.history)) {
        updateData.history = stripUndefinedDeep(gaResult.history.slice(0, 500));
      }
      if (gaResult.convergedAtGeneration !== undefined) {
        updateData.convergedAtGeneration = clampInt(gaResult.convergedAtGeneration, 0, 10000, 0);
      }
      if (gaResult.executionTimeMs !== undefined) {
        updateData.executionTimeMs = clampNum(gaResult.executionTimeMs, 0, 600000, 0);
      }
      if (scope) {
        updateData.scope = resolvedScope;
      }
    }

    // Repair any legacy out-of-range fields on existing doc so post-merge isValidSchedule(incoming()) passes
    if (
      updateData.bestFitness === undefined &&
      (typeof existing.bestFitness !== 'number' ||
        !Number.isFinite(existing.bestFitness) ||
        existing.bestFitness < -1000000 ||
        existing.bestFitness > 1000000)
    ) {
      updateData.bestFitness = clampNum(existing.bestFitness, -1000000, 1000000, 0);
    }
    if (
      updateData.history === undefined &&
      (!Array.isArray(existing.history) || existing.history.length > 500)
    ) {
      updateData.history = Array.isArray(existing.history)
        ? stripUndefinedDeep(existing.history.slice(0, 500))
        : [];
    }
    if (
      updateData.convergedAtGeneration === undefined &&
      (!Number.isInteger(existing.convergedAtGeneration) ||
        existing.convergedAtGeneration < 0 ||
        existing.convergedAtGeneration > 10000)
    ) {
      updateData.convergedAtGeneration = clampInt(existing.convergedAtGeneration, 0, 10000, 0);
    }
    if (
      updateData.executionTimeMs === undefined &&
      (typeof existing.executionTimeMs !== 'number' ||
        !Number.isFinite(existing.executionTimeMs) ||
        existing.executionTimeMs < 0 ||
        existing.executionTimeMs > 600000)
    ) {
      updateData.executionTimeMs = clampNum(existing.executionTimeMs, 0, 600000, 0);
    }
    if (
      updateData.scope === undefined &&
      (typeof existing.scope !== 'string' || existing.scope.length < 1 || existing.scope.length > 32)
    ) {
      updateData.scope = resolvedScope;
    }

    scheduleMutation = { mode: 'update', data: updateData };
  } else {
    scheduleMutation = {
      mode: 'set',
      data: {
        id: String(scheduleId),
        schedule: cleanSchedule,
        bestFitness: clampNum(gaResult?.bestFitness, -1000000, 1000000, 0),
        history: stripUndefinedDeep(
          Array.isArray(gaResult?.history) ? gaResult.history.slice(0, 500) : []
        ),
        conflicts: cleanConflicts,
        convergedAtGeneration: clampInt(gaResult?.convergedAtGeneration, 0, 10000, 0),
        executionTimeMs: clampNum(gaResult?.executionTimeMs, 0, 600000, 0),
        scope: resolvedScope,
        createdBy: uid,
        updatedBy: uid,
        createdAt: timestampToken,
        updatedAt: timestampToken,
      },
    };
  }

  let timetableMutation;
  if (ttExists) {
    const existingTt = ttExistingData || {};
    const updateData = {
      scheduleId: String(scheduleId),
      entries: cleanSchedule,
      updatedBy: uid,
      updatedAt: timestampToken,
    };
    if (
      typeof existingTt.scope !== 'string' ||
      existingTt.scope.length < 1 ||
      existingTt.scope.length > 32 ||
      (gaResult && scope)
    ) {
      updateData.scope = resolvedScope;
    }
    timetableMutation = { mode: 'update', data: updateData };
  } else {
    timetableMutation = {
      mode: 'set',
      data: {
        id: String(timetableId),
        scheduleId: String(scheduleId),
        entries: cleanSchedule,
        scope: resolvedScope,
        createdBy: uid,
        updatedBy: uid,
        createdAt: timestampToken,
        updatedAt: timestampToken,
      },
    };
  }

  const conflictReportMutation = {
    mode: 'set',
    data: buildConflictReportPayload({
      reportId,
      scheduleId,
      schedule: cleanSchedule,
      conflicts: cleanConflicts,
      uid,
      timestampToken,
    }),
  };

  return {
    scheduleMutation,
    timetableMutation,
    conflictReportMutation,
    cleanSchedule,
    cleanConflicts,
  };
}

export function normalizeConstraintConfigPayload(config = {}) {
  return {
    hardConstraintWeight: clampNum(config?.hardConstraintWeight, 100, 10000, 1000),
    workloadBalanceWeight: clampNum(config?.workloadBalanceWeight, 0, 200, 15),
    sameDayCohortPenalty: clampNum(config?.sameDayCohortPenalty, 0, 500, 25),
    hallUtilizationWeight: clampNum(config?.hallUtilizationWeight, 0, 25, 0.5),
    enforceMaxDuties: config?.enforceMaxDuties === undefined ? true : Boolean(config.enforceMaxDuties),
    preventSameCohortDoubleExamPerDay:
      config?.preventSameCohortDoubleExamPerDay === undefined
        ? true
        : Boolean(config.preventSameCohortDoubleExamPerDay),
    oneExamPerDeptPerDay:
      config?.oneExamPerDeptPerDay === undefined ? true : Boolean(config.oneExamPerDeptPerDay),
    minGapDaysBetweenExams: clampInt(config?.minGapDaysBetweenExams, 0, 14, 2),
    independentDeptScheduling:
      config?.independentDeptScheduling === undefined
        ? true
        : Boolean(config.independentDeptScheduling),
    allowSameDayFnAnPerDept:
      config?.allowSameDayFnAnPerDept === undefined
        ? false
        : Boolean(config.allowSameDayFnAnPerDept),
    allowMultipleDeptsSameDate:
      config?.allowMultipleDeptsSameDate === undefined
        ? true
        : Boolean(config.allowMultipleDeptsSameDate),
  };
}

export function buildOptimizationRunPayload({
  runId,
  scheduleId,
  scope = 'ALL',
  executionMode = 'WEB_WORKER',
  gaConfig = {},
  gaResult = {},
  uid,
  timestampToken,
}) {
  const cleanConflicts = normalizeConflictsPayload(gaResult?.conflicts || {});
  const cleanConstraintConfig = normalizeConstraintConfigPayload(
    gaResult?.constraintConfig || gaConfig?.constraintConfig || {}
  );
  const rawReport = gaResult?.constraintReport || {};
  const cleanConstraintReport = stripUndefinedDeep({
    isFeasible: cleanConflicts.totalHardViolations === 0,
    hardViolations: {
      studentClashes: cleanConflicts.studentClashes,
      invigilatorConflicts: cleanConflicts.invigilatorConflicts,
      capacityViolations: cleanConflicts.capacityViolations,
      hallDoubleBookings: cleanConflicts.hallDoubleBookings,
      departmentSameDayViolations: cleanConflicts.departmentSameDayViolations,
      departmentGapViolations: cleanConflicts.departmentGapViolations,
      departmentIndependenceViolations: cleanConflicts.departmentIndependenceViolations,
      total: cleanConflicts.totalHardViolations,
    },
    softMetrics: {
      workloadStdDev: cleanConflicts.workloadStdDev,
      utilizationRate: cleanConflicts.utilizationRate,
      sameDayCohortOverlaps: clampInt(rawReport?.softMetrics?.sameDayCohortOverlaps, 0, 10000, 0),
      hardPenalty: clampNum(rawReport?.softMetrics?.hardPenalty, 0, 100000000, 0),
      softPenalty: clampNum(rawReport?.softMetrics?.softPenalty, 0, 100000000, 0),
    },
    constraintConfigUsed: cleanConstraintConfig,
  });

  const status = cleanConflicts.totalHardViolations === 0 ? 'OPTIMAL' : 'CONFLICTS_REMAINING';

  return {
    id: String(runId),
    scheduleId: clampStr(scheduleId, 128, 'sched-unknown'),
    scope: clampStr(scope, 32, 'ALL'),
    executionMode: clampStr(executionMode, 32, 'WEB_WORKER'),
    status,
    bestFitness: clampNum(gaResult?.bestFitness, -1000000, 1000000, 0),
    convergedAtGeneration: clampInt(gaResult?.convergedAtGeneration, 0, 10000, 0),
    executionTimeMs: clampNum(gaResult?.executionTimeMs, 0, 600000, 0),
    populationSize: clampInt(gaConfig?.populationSize, 1, 1000, 40),
    generations: clampInt(gaConfig?.generations, 1, 10000, 50),
    mutationRate: clampNum(gaConfig?.mutationRate, 0, 1, 0.12),
    crossoverRate: clampNum(gaConfig?.crossoverRate, 0, 1, 0.8),
    constraintConfig: cleanConstraintConfig,
    conflicts: cleanConflicts,
    constraintReport: cleanConstraintReport,
    createdBy: uid,
    updatedBy: uid,
    createdAt: timestampToken,
    updatedAt: timestampToken,
  };
}
