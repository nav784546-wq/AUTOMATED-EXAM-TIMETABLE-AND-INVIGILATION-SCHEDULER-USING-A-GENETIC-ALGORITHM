import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_EXAM_DATES } from '../utils/seedData.js';
import { persistenceService } from '../services/persistenceService.js';
import { logSystemAuditEvent } from '../services/auditService.js';
import { api } from '../services/api.js';
import { recalculateScheduleConflicts } from '../utils/dataValidation.js';
import {
  normalizeSchedulingPolicy,
  validateCompleteExamTimetable,
} from '../utils/conflictEvaluator.js';
import { validateSingleDaySelections } from '../utils/singleDaySelection.js';
import {
  GACancelledError,
  runGeneticAlgorithmAsync,
  runServerGAOptimization,
} from '../utils/gaWorkerClient.js';
import { DEFAULT_CONSTRAINT_CONFIG } from '../utils/geneticAlgorithm.js';
import {
  DEFAULT_GA_PARAMETERS,
  normalizeGAParameters,
  validateGAParameters,
} from '../utils/gaConfig.js';

export const EMPTY_CONFLICTS = {
  studentClashes: 0,
  departmentWarnings: 0,
  invigilatorConflicts: 0,
  capacityViolations: 0,
  hallDoubleBookings: 0,
  departmentSameDayViolations: 0,
  departmentGapViolations: 0,
  departmentIndependenceViolations: 0,
  validationWarnings: [],
  departmentTimelines: {},
  totalHardViolations: 0,
  utilizationRate: 0,
  workloadStdDev: 0,
};

function applyUpdatesToSchedule(schedule, updatesList, halls, faculty) {
  const hallMap = new Map(halls.map((h) => [h.id, h]));
  const facMap = new Map(faculty.map((f) => [f.id, f]));
  const patchMap = new Map(updatesList.map((u) => [u.examId, u]));

  return schedule.map((item) => {
    const patch = patchMap.get(item.examId);
    if (!patch) return item;
    const selectedHall = patch.hallId ? hallMap.get(patch.hallId) : null;
    const selectedFac = patch.invigilatorId ? facMap.get(patch.invigilatorId) : null;
    return {
      ...item,
      date: patch.date || item.date,
      session: patch.session || item.session,
      hallId: patch.hallId || item.hallId,
      hallNumber: selectedHall ? selectedHall.hallNumber : item.hallNumber,
      hallCapacity: selectedHall ? selectedHall.capacity : item.hallCapacity,
      invigilatorId: patch.invigilatorId || item.invigilatorId,
      invigilatorName: selectedFac ? selectedFac.name : item.invigilatorName,
      invigilatorDept: selectedFac ? selectedFac.department : item.invigilatorDept,
    };
  });
}

export function useScheduleState({
  departmentRecords = [],
  departments,
  subjects,
  halls,
  faculty,
  students,
  exams,
  showSuccess,
  showError,
  onRequireGASetup,
  actorEmail = '',
  actorUid = '',
}) {
  const resolvedDepartments = useMemo(
    () => (departmentRecords && departmentRecords.length > 0 ? departmentRecords : departments),
    [departmentRecords, departments]
  );

  const [latestConflictReport, setLatestConflictReport] = useState(null);
  const [optimizationRuns, setOptimizationRuns] = useState([]);
  const [singleDaySelections, setSingleDaySelections] = useState({});
  const [singleDayDate, setSingleDayDate] = useState(DEFAULT_EXAM_DATES[0]);
  const [singleDaySession, setSingleDaySession] = useState('BOTH');
  const [timetableConfirmed, setTimetableConfirmed] = useState(false);

  const [isGARunning, setIsGARunning] = useState(false);
  const [gaProgress, setGaProgress] = useState(null);
  const activeWorkerRef = useRef(null);

  const [savedGAConfig, setSavedGAConfig] = useState(() =>
    normalizeGAParameters(DEFAULT_GA_PARAMETERS)
  );
  const [isSavingGAConfig, setIsSavingGAConfig] = useState(false);

  const [gaConfig, setGaConfig] = useState({
    ...DEFAULT_GA_PARAMETERS,
    constraintConfig: { ...DEFAULT_CONSTRAINT_CONFIG },
    scope: 'ALL',
    selectedDepartments: [],
    selectedCourses: [],
    selectedSections: [],
    selectedBatches: [],
    selectedSubjectIds: [],
    singleDayDate: DEFAULT_EXAM_DATES[0],
    singleDaySession: 'BOTH',
  });

  const [gaResult, setGaResult] = useState({
    scheduleId: null,
    schedule: [],
    bestFitness: 0,
    history: [],
    conflicts: EMPTY_CONFLICTS,
    constraintReport: null,
    convergedAtGeneration: 0,
    executionTimeMs: 0,
    scope: 'ALL',
  });

  const gaResultRef = useRef(gaResult);
  useEffect(() => {
    gaResultRef.current = gaResult;
  }, [gaResult]);

  const activePolicy = useMemo(() => {
    const base = normalizeSchedulingPolicy(gaConfig.constraintConfig);
    if ((gaResult.scope || gaConfig.scope) === 'SINGLE_DAY') {
      return { ...base, minGapDaysBetweenExams: 0 };
    }
    return base;
  }, [gaConfig.constraintConfig, gaConfig.scope, gaResult.scope]);

  const policyRef = useRef(activePolicy);
  useEffect(() => {
    policyRef.current = activePolicy;
  }, [activePolicy]);

  // Keep backend SQLite scheduling policy synchronized when policy sliders/toggles change
  const lastSyncedPolicyJson = useRef('');
  useEffect(() => {
    const base = normalizeSchedulingPolicy(gaConfig.constraintConfig);
    const json = JSON.stringify(base);
    if (!lastSyncedPolicyJson.current) {
      lastSyncedPolicyJson.current = json;
      return;
    }
    if (json !== lastSyncedPolicyJson.current) {
      lastSyncedPolicyJson.current = json;
      api.updateSchedulingPolicy(base).catch(() => {});
    }
  }, [gaConfig.constraintConfig]);

  useEffect(() => {
    return () => {
      if (activeWorkerRef.current?.cancel) {
        activeWorkerRef.current.cancel();
      }
    };
  }, []);

  const cancelGA = useCallback(() => {
    if (activeWorkerRef.current?.cancel) {
      activeWorkerRef.current.cancel();
      activeWorkerRef.current = null;
    }
    setIsGARunning(false);
    setGaProgress(null);
  }, []);

  const scheduleValidation = useMemo(
    () =>
      validateCompleteExamTimetable(gaResult.schedule || [], {
        departments: resolvedDepartments,
        subjects,
        students,
        halls,
        faculty,
        policy: activePolicy,
      }),
    [gaResult.schedule, resolvedDepartments, subjects, students, halls, faculty, activePolicy]
  );

  const hydrateScheduleFromData = useCallback(async (data) => {
    setLatestConflictReport(data.latestConflictReport || null);
    const hydratedRuns = Array.isArray(data.optimizationRuns) ? data.optimizationRuns : [];
    setOptimizationRuns(hydratedRuns);

    const hydratedPolicy = normalizeSchedulingPolicy(
      data.schedulingPolicy || hydratedRuns[0]?.constraintConfig || DEFAULT_CONSTRAINT_CONFIG
    );
    lastSyncedPolicyJson.current = JSON.stringify(hydratedPolicy);
    const hydratedGAConfig = normalizeGAParameters(data.gaConfig || DEFAULT_GA_PARAMETERS);
    setSavedGAConfig(hydratedGAConfig);
    setGaConfig((prev) => ({
      ...prev,
      ...hydratedGAConfig,
      constraintConfig: {
        ...prev.constraintConfig,
        ...hydratedPolicy,
      },
    }));

    const deptsForEval = data.departments || [];

    if (
      data.latestSchedule &&
      Array.isArray(data.latestSchedule.schedule) &&
      data.latestSchedule.schedule.length > 0
    ) {
      const effectiveEvalPolicy =
        data.latestSchedule.scope === 'SINGLE_DAY'
          ? { ...hydratedPolicy, minGapDaysBetweenExams: 0 }
          : hydratedPolicy;
      const recalculated = recalculateScheduleConflicts(
        data.latestSchedule.schedule,
        data.faculty || [],
        {
          subjects: data.subjects || [],
          students: data.students || [],
          halls: data.halls || [],
          departments: deptsForEval,
          policy: effectiveEvalPolicy,
        }
      );
      const matchingRun = hydratedRuns.find((r) => r.scheduleId === data.latestSchedule.scheduleId);
      setGaResult({
        ...data.latestSchedule,
        schedule: recalculated.schedule,
        conflicts: recalculated.conflicts,
        constraintReport: matchingRun?.constraintReport || data.latestSchedule.constraintReport || null,
      });
      setTimetableConfirmed(false);
      return;
    }

    if (
      (data.subjects || []).length > 0 &&
      (data.halls || []).length > 0 &&
      (data.faculty || []).length > 0
    ) {
      const initExams = data.subjects.map((s) => ({
        id: `exam-${s.id}`,
        subjectId: s.id,
        durationMinutes: 180,
      }));
      const initConfig = {
        ...hydratedGAConfig,
        constraintConfig: {
          ...DEFAULT_CONSTRAINT_CONFIG,
          ...hydratedPolicy,
        },
      };
      const { promise } = runGeneticAlgorithmAsync({
        exams: initExams,
        subjects: data.subjects,
        halls: data.halls,
        faculty: data.faculty,
        students: data.students || [],
        departments: deptsForEval,
        config: initConfig,
      });
      const initialRes = await promise;
      const recalculated = recalculateScheduleConflicts(
        initialRes.schedule,
        data.faculty || [],
        {
          subjects: data.subjects || [],
          students: data.students || [],
          halls: data.halls || [],
          departments: deptsForEval,
          policy: hydratedPolicy,
        }
      );
      const saved = await persistenceService.saveGeneratedSchedule(
        { ...initialRes, schedule: recalculated.schedule, conflicts: recalculated.conflicts },
        'ALL',
        { executionMode: initialRes.executionMode || 'WEB_WORKER', gaConfig: initConfig }
      );
      setGaResult({
        ...initialRes,
        schedule: recalculated.schedule,
        conflicts: recalculated.conflicts,
        scheduleId: saved.scheduleId,
        scope: 'ALL',
      });
      setTimetableConfirmed(false);
      if (saved.optimizationRun) {
        setOptimizationRuns((prev) => [saved.optimizationRun, ...prev]);
      }
      setLatestConflictReport({
        id: saved.reportId,
        scheduleId: saved.scheduleId,
        ...recalculated.conflicts,
      });
    }
  }, []);

  const runSchedulerWithConfig = useCallback(
    async (targetConfig) => {
      if (activeWorkerRef.current?.cancel) {
        activeWorkerRef.current.cancel();
      }

      const scope = targetConfig.scope || 'ALL';
      const executionMode = targetConfig.executionMode || 'WEB_WORKER';
      const basePolicy = normalizeSchedulingPolicy(targetConfig.constraintConfig);
      const evalPolicy =
        scope === 'SINGLE_DAY' ? { ...basePolicy, minGapDaysBetweenExams: 0 } : basePolicy;

      setIsGARunning(true);
      setTimetableConfirmed(false);
      setGaProgress({
        generation: 0,
        totalGenerations: targetConfig.generations || 50,
        percent: executionMode === 'SERVER_WORKER' ? 35 : 0,
        bestFitness: 0,
        conflictCount: 0,
        executionMode,
      });

      const handle =
        executionMode === 'SERVER_WORKER'
          ? runServerGAOptimization({
              exams,
              subjects,
              halls,
              faculty,
              students,
              departments: resolvedDepartments,
              config: targetConfig,
            })
          : runGeneticAlgorithmAsync({
              exams,
              subjects,
              halls,
              faculty,
              students,
              departments: resolvedDepartments,
              config: targetConfig,
              onProgress: (prog) => setGaProgress({ ...prog, executionMode }),
            });
      activeWorkerRef.current = handle;

      try {
        const next = await handle.promise;
        activeWorkerRef.current = null;
        const recalculated = recalculateScheduleConflicts(next.schedule, faculty, {
          subjects,
          students,
          halls,
          departments: resolvedDepartments,
          policy: evalPolicy,
        });
        const nextResult = {
          ...next,
          schedule: recalculated.schedule,
          conflicts: recalculated.conflicts,
          scope,
        };
        const saved = await persistenceService.saveGeneratedSchedule(nextResult, scope, {
          executionMode: next.executionMode || executionMode,
          gaConfig: targetConfig,
          policy: evalPolicy,
        });
        setGaResult({ ...nextResult, scheduleId: saved.scheduleId });
        if (saved.optimizationRun) {
          setOptimizationRuns((prev) =>
            [saved.optimizationRun, ...prev.filter((r) => r.id !== saved.optimizationRun.id)].slice(
              0,
              25
            )
          );
        }
        setLatestConflictReport({
          id: saved.reportId,
          scheduleId: saved.scheduleId,
          ...nextResult.conflicts,
        });
        showSuccess(
          `Timetable optimized (${next.executionMode === 'SERVER_WORKER' ? 'Server Worker' : 'Web Worker'}) and saved to database.`
        );
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'SCHEDULE_GENERATED',
          summary: `Executed GA scheduler (${scope}, ${next.executionMode || executionMode}) with ${nextResult.schedule?.length || 0} exam slots and ${nextResult.conflicts?.totalHardViolations ?? 0} hard conflict(s).`,
          actorEmail,
          actorUid,
          targetType: 'schedule',
          targetId: saved.scheduleId || '',
          targetLabel: `${scope} Timetable`,
          metadata: {
            fitness: Number(nextResult.bestFitness || 0),
            hardConflicts: Number(nextResult.conflicts?.totalHardViolations || 0),
          },
        });
        return true;
      } catch (err) {
        if (err instanceof GACancelledError || err?.cancelled) {
          showSuccess('Genetic Algorithm optimization cancelled.');
          return false;
        }
        showError(err);
        return false;
      } finally {
        activeWorkerRef.current = null;
        setIsGARunning(false);
        setGaProgress(null);
      }
    },
    [exams, subjects, halls, faculty, students, resolvedDepartments, showSuccess, showError, actorEmail, actorUid]
  );

  const handleRestoreOptimizationRun = useCallback(
    async (run) => {
      if (!run?.scheduleId) return false;
      try {
        const stored = await persistenceService.getScheduleById(run.scheduleId);
        if (!stored || !Array.isArray(stored.schedule)) {
          showError('Stored schedule for this optimization run could not be found.');
          return false;
        }
        const restoredScope = stored.scope || run.scope || 'ALL';
        const runPolicy = normalizeSchedulingPolicy(run.constraintConfig || policyRef.current);
        const evalPolicy =
          restoredScope === 'SINGLE_DAY' ? { ...runPolicy, minGapDaysBetweenExams: 0 } : runPolicy;
        const recalculated = recalculateScheduleConflicts(stored.schedule, faculty, {
          subjects,
          students,
          halls,
          departments: resolvedDepartments,
          policy: evalPolicy,
        });
        setGaResult({
          scheduleId: stored.scheduleId,
          schedule: recalculated.schedule,
          bestFitness: Number(stored.bestFitness ?? run.bestFitness ?? 0),
          history: (stored.history || []).map((h) => ({
            generation: h.generation,
            bestFitness: h.bestFitness ?? h.fitness ?? 0,
            avgFitness: h.avgFitness ?? h.fitness ?? 0,
          })),
          conflicts: recalculated.conflicts,
          constraintReport: run.constraintReport || null,
          convergedAtGeneration: Number(stored.convergedAtGeneration ?? run.convergedAtGeneration ?? 0),
          executionTimeMs: Number(stored.executionTimeMs ?? run.executionTimeMs ?? 0),
          scope: restoredScope,
        });
        setTimetableConfirmed(false);
        showSuccess(`Restored timetable from optimization run ${run.id}.`);
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'OPTIMIZATION_RUN_RESTORED',
          summary: `Restored timetable from optimization run ${run.id}.`,
          actorEmail,
          actorUid,
          targetType: 'optimization_run',
          targetId: run.id,
          targetLabel: run.scheduleId || run.id,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [faculty, halls, subjects, students, resolvedDepartments, showSuccess, showError, actorEmail, actorUid]
  );

  const handleDeleteOptimizationRun = useCallback(
    async (runId) => {
      if (!runId) return false;
      try {
        await persistenceService.deleteOptimizationRun(runId);
        setOptimizationRuns((prev) => prev.filter((r) => r.id !== runId));
        showSuccess(`Removed optimization run ${runId}.`);
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'OPTIMIZATION_RUN_DELETED',
          summary: `Removed saved optimization run ${runId}.`,
          actorEmail,
          actorUid,
          targetType: 'optimization_run',
          targetId: runId,
          targetLabel: runId,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [showSuccess, showError, actorEmail, actorUid]
  );

  const handleSaveGAConfig = useCallback(
    async (overrideConfig = null) => {
      const candidate = overrideConfig || gaConfig;
      const validation = validateGAParameters(candidate);
      if (!validation.isValid) {
        const firstErr = Object.values(validation.errors)[0] || 'Invalid Genetic Algorithm parameters.';
        showError(firstErr);
        return false;
      }

      const normalized = normalizeGAParameters(candidate);
      setIsSavingGAConfig(true);
      try {
        const persisted = await persistenceService.saveGAConfig(normalized);
        const finalConfig = normalizeGAParameters(persisted || normalized);
        setSavedGAConfig(finalConfig);
        setGaConfig((prev) => ({
          ...prev,
          ...finalConfig,
        }));
        showSuccess(
          `Saved Genetic Algorithm configuration (Pop ${finalConfig.populationSize}, Max Gen ${finalConfig.generations}, Mutation ${(finalConfig.mutationRate * 100).toFixed(0)}%).`
        );
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'GA_CONFIG_UPDATED',
          summary: `Updated GA configuration: population ${finalConfig.populationSize}, max generations ${finalConfig.generations}, mutation ${(finalConfig.mutationRate * 100).toFixed(0)}%, crossover ${(finalConfig.crossoverRate * 100).toFixed(0)}%, elitism ${finalConfig.elitismCount}, tournament ${finalConfig.tournamentSize}.`,
          actorEmail,
          actorUid,
          targetType: 'ga_config',
          targetId: 'ga_config',
          targetLabel: 'Genetic Algorithm Configuration',
          metadata: {
            populationSize: finalConfig.populationSize,
            generations: finalConfig.generations,
            mutationRate: finalConfig.mutationRate,
            crossoverRate: finalConfig.crossoverRate,
            elitismCount: finalConfig.elitismCount,
            tournamentSize: finalConfig.tournamentSize,
            earlyStopGenerations: finalConfig.earlyStopGenerations,
            executionMode: finalConfig.executionMode,
          },
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      } finally {
        setIsSavingGAConfig(false);
      }
    },
    [gaConfig, showSuccess, showError, actorEmail, actorUid]
  );

  const handleRunGA = useCallback(async () => {
    const validation = validateGAParameters(gaConfig);
    if (!validation.isValid) {
      const firstErr = Object.values(validation.errors)[0] || 'Fix invalid GA parameters before running.';
      showError(firstErr);
      return;
    }
    if (gaConfig.scope === 'SINGLE_DAY') {
      const singleDayCheck = validateSingleDaySelections(departments, subjects, singleDaySelections);
      if (!singleDayCheck.isValid) {
        if (onRequireGASetup) onRequireGASetup();
        showError('Select one subject per department before running the Single-Day scheduler.');
        return;
      }
      await runSchedulerWithConfig({
        ...gaConfig,
        scope: 'SINGLE_DAY',
        selectedSubjectIds: singleDayCheck.selectedSubjectIds,
        singleDayDate,
        singleDaySession,
      });
      return;
    }
    await runSchedulerWithConfig(gaConfig);
  }, [
    gaConfig,
    departments,
    subjects,
    singleDaySelections,
    singleDayDate,
    singleDaySession,
    runSchedulerWithConfig,
    onRequireGASetup,
    showError,
  ]);

  const handleFinalizeSingleDaySchedule = useCallback(
    async ({
      selectedSubjectIds,
      singleDayDate: targetDate,
      singleDaySession: targetSession,
    }) => {
      const validation = validateSingleDaySelections(departments, subjects, singleDaySelections);
      if (!validation.isValid) {
        showError('Every department must have exactly one selected subject.');
        return;
      }

      const nextConfig = {
        ...gaConfig,
        scope: 'SINGLE_DAY',
        selectedSubjectIds: selectedSubjectIds || validation.selectedSubjectIds,
        singleDayDate: targetDate || singleDayDate,
        singleDaySession: targetSession || singleDaySession,
      };
      setGaConfig(nextConfig);
      await runSchedulerWithConfig(nextConfig);
    },
    [
      departments,
      subjects,
      singleDaySelections,
      gaConfig,
      singleDayDate,
      singleDaySession,
      runSchedulerWithConfig,
      showError,
    ]
  );

  /**
   * Safely reverts a snapshot of exam slot edits without overwriting unrelated
   * manual edits made to other exams or newer edits to the same exam.
   */
  const undoQuickFixSnapshot = useCallback(
    async (snapshotEntries = []) => {
      if (!Array.isArray(snapshotEntries) || snapshotEntries.length === 0) return false;
      const currentState = gaResultRef.current;
      const currentSchedule = currentState.schedule || [];
      const currentById = new Map(currentSchedule.map((item) => [item.examId, item]));
      const currentPolicy = policyRef.current;

      const revertUpdates = [];
      let skippedCount = 0;

      for (const entry of snapshotEntries) {
        const cur = currentById.get(entry.examId);
        if (!cur) continue;
        const curInv = cur.invigilatorId || cur.facultyId || '';
        const expInv = entry.appliedValues.invigilatorId || '';
        const matchesApplied =
          cur.date === entry.appliedValues.date &&
          cur.session === entry.appliedValues.session &&
          cur.hallId === entry.appliedValues.hallId &&
          curInv === expInv;

        if (!matchesApplied) {
          skippedCount += 1;
          continue;
        }
        revertUpdates.push({
          examId: entry.examId,
          ...entry.previousValues,
        });
      }

      if (revertUpdates.length === 0) {
        showError('Cannot undo: affected exam slot was modified after the Quick Fix.');
        return false;
      }

      const modifiedSchedule = applyUpdatesToSchedule(
        currentSchedule,
        revertUpdates,
        halls,
        faculty
      );
      const recalculated = recalculateScheduleConflicts(modifiedSchedule, faculty, {
        subjects,
        students,
        halls,
        departments: resolvedDepartments,
        policy: currentPolicy,
      });

      try {
        const res = await persistenceService.batchUpdateScheduleSlots(
          currentState.scheduleId,
          recalculated.schedule,
          recalculated.conflicts,
          revertUpdates,
          { allowOverride: true, policy: currentPolicy }
        );
        const nextRawSched = res?.updatedSchedule || recalculated.schedule;
        const nextEval = recalculateScheduleConflicts(nextRawSched, faculty, {
          subjects,
          students,
          halls,
          departments: resolvedDepartments,
          policy: currentPolicy,
        });
        const nextId = res?.scheduleId || currentState.scheduleId;
        setGaResult((prev) => ({
          ...prev,
          scheduleId: nextId,
          schedule: nextEval.schedule,
          conflicts: nextEval.conflicts,
        }));
        setLatestConflictReport({
          scheduleId: nextId,
          ...nextEval.conflicts,
        });
        setTimetableConfirmed(false);
        showSuccess(
          skippedCount > 0
            ? `Reverted ${revertUpdates.length} Quick Fix change(s) (${skippedCount} newer manual edit preserved).`
            : `Reverted ${revertUpdates.length} Quick Fix change(s) and revalidated schedule.`
        );
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [halls, faculty, subjects, students, resolvedDepartments, showSuccess, showError]
  );

  const handleUpdateScheduledExam = useCallback(
    async (examId, updates, options = {}) => {
      const currentState = gaResultRef.current;
      const existingExam = (currentState.schedule || []).find((i) => i.examId === examId);
      if (!existingExam) {
        showError('Examination slot not found in active schedule.');
        return false;
      }

      const currentPolicy = policyRef.current;
      const allowOverride = Boolean(options?.allowOverride);

      const previousValues = {
        date: existingExam.date,
        session: existingExam.session,
        hallId: existingExam.hallId,
        invigilatorId: existingExam.invigilatorId || existingExam.facultyId || '',
      };

      const prevValidation = validateCompleteExamTimetable(currentState.schedule || [], {
        departments: resolvedDepartments,
        subjects,
        students,
        halls,
        faculty,
        policy: currentPolicy,
      });

      const modifiedSchedule = applyUpdatesToSchedule(
        currentState.schedule,
        [{ examId, ...updates }],
        halls,
        faculty
      );

      const nextValidation = validateCompleteExamTimetable(modifiedSchedule, {
        departments: resolvedDepartments,
        subjects,
        students,
        halls,
        faculty,
        policy: currentPolicy,
      });

      const deptViolationIds = new Set([
        ...(nextValidation.oneExamPerDay?.violatingExamIds || []),
        ...(nextValidation.minimumExamGap?.violatingExamIds || []),
        ...(nextValidation.departmentIndependence?.violatingExamIds || []),
      ]);
      const prevDeptCount =
        (prevValidation.conflicts?.departmentSameDayViolations || 0) +
        (prevValidation.conflicts?.departmentGapViolations || 0) +
        (prevValidation.conflicts?.departmentIndependenceViolations || 0);
      const nextDeptCount =
        (nextValidation.conflicts?.departmentSameDayViolations || 0) +
        (nextValidation.conflicts?.departmentGapViolations || 0) +
        (nextValidation.conflicts?.departmentIndependenceViolations || 0);

      const introducesDeptViolation =
        deptViolationIds.has(examId) || nextDeptCount > prevDeptCount;

      if (introducesDeptViolation && !allowOverride) {
        const allDeptViolations = [
          ...(nextValidation.oneExamPerDay?.violations || []),
          ...(nextValidation.minimumExamGap?.violations || []),
          ...(nextValidation.departmentIndependence?.violations || []),
        ];
        const matchingWarn =
          allDeptViolations.find((v) => (v.examIds || []).includes(examId))?.message ||
          nextValidation.warnings[0] ||
          'Invalid Schedule: Manual edit violates active department scheduling rules.';
        showError(matchingWarn);
        if (typeof options?.onValidationError === 'function') {
          options.onValidationError(matchingWarn, nextValidation);
        }
        return false;
      }

      const recalculated = recalculateScheduleConflicts(modifiedSchedule, faculty, {
        subjects,
        students,
        halls,
        departments: resolvedDepartments,
        policy: currentPolicy,
      });

      try {
        const res = await persistenceService.updateScheduleExamSlot(
          currentState.scheduleId,
          recalculated.schedule,
          recalculated.conflicts,
          examId,
          updates,
          { allowOverride, policy: currentPolicy }
        );
        const nextRawSched = res?.updatedSchedule || recalculated.schedule;
        const nextEval = recalculateScheduleConflicts(nextRawSched, faculty, {
          subjects,
          students,
          halls,
          departments: resolvedDepartments,
          policy: currentPolicy,
        });
        const nextId = res?.scheduleId || currentState.scheduleId;
        setGaResult((prev) => ({
          ...prev,
          scheduleId: nextId,
          schedule: nextEval.schedule,
          conflicts: nextEval.conflicts,
        }));
        setLatestConflictReport({
          scheduleId: nextId,
          ...nextEval.conflicts,
        });
        setTimetableConfirmed(false);

        if (options.isQuickFix) {
          const snapshot = [
            {
              examId,
              previousValues,
              appliedValues: {
                date: updates.date || previousValues.date,
                session: updates.session || previousValues.session,
                hallId: updates.hallId || previousValues.hallId,
                invigilatorId: updates.invigilatorId || previousValues.invigilatorId,
              },
            },
          ];
          showSuccess(
            `Quick Fix applied to ${existingExam.subjectCode || 'exam'} and saved to database.`,
            {
              undoLabel: 'Undo Quick Fix',
              onUndo: () => undoQuickFixSnapshot(snapshot),
            }
          );
        } else if (allowOverride && introducesDeptViolation) {
          showSuccess('Exam slot updated with authorized department policy override.');
        } else {
          showSuccess('Exam slot changes saved to database.');
        }
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showError(msg);
        if (typeof options?.onValidationError === 'function') {
          options.onValidationError(msg, nextValidation);
        }
        return false;
      }
    },
    [halls, faculty, subjects, students, resolvedDepartments, showSuccess, showError, undoQuickFixSnapshot]
  );

  const handleBatchUpdateScheduledExams = useCallback(
    async (changes = [], options = {}) => {
      if (!Array.isArray(changes) || changes.length === 0) return false;
      const currentState = gaResultRef.current;
      const currentPolicy = policyRef.current;

      const updatesList = changes.map((c) => ({
        examId: c.examId,
        ...c.applyPayload,
      }));

      const snapshot = changes.map((c) => ({
        examId: c.examId,
        previousValues: c.previousValues,
        appliedValues: c.applyPayload,
      }));

      const modifiedSchedule = applyUpdatesToSchedule(
        currentState.schedule,
        updatesList,
        halls,
        faculty
      );
      const recalculated = recalculateScheduleConflicts(modifiedSchedule, faculty, {
        subjects,
        students,
        halls,
        departments: resolvedDepartments,
        policy: currentPolicy,
      });

      try {
        const res = await persistenceService.batchUpdateScheduleSlots(
          currentState.scheduleId,
          recalculated.schedule,
          recalculated.conflicts,
          updatesList,
          { allowOverride: Boolean(options?.allowOverride), policy: currentPolicy }
        );
        const nextRawSched = res?.updatedSchedule || recalculated.schedule;
        const nextEval = recalculateScheduleConflicts(nextRawSched, faculty, {
          subjects,
          students,
          halls,
          departments: resolvedDepartments,
          policy: currentPolicy,
        });
        const nextId = res?.scheduleId || currentState.scheduleId;
        setGaResult((prev) => ({
          ...prev,
          scheduleId: nextId,
          schedule: nextEval.schedule,
          conflicts: nextEval.conflicts,
        }));
        setLatestConflictReport({
          scheduleId: nextId,
          ...nextEval.conflicts,
        });
        setTimetableConfirmed(false);

        showSuccess(
          `Batch Quick Fix applied ${changes.length} schedule change${changes.length === 1 ? '' : 's'} atomically.`,
          {
            undoLabel: 'Undo Batch Fix',
            onUndo: () => undoQuickFixSnapshot(snapshot),
          }
        );
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [halls, faculty, subjects, students, resolvedDepartments, showSuccess, showError, undoQuickFixSnapshot]
  );

  const handleOverrideFaculty = useCallback(
    async (examId, newFacultyId) => {
      const selectedFac = faculty.find((f) => f.id === newFacultyId);
      if (!selectedFac) return false;

      const currentState = gaResultRef.current;
      const currentPolicy = policyRef.current;
      const modifiedSchedule = applyUpdatesToSchedule(
        currentState.schedule,
        [{ examId, invigilatorId: newFacultyId }],
        halls,
        faculty
      );
      const recalculated = recalculateScheduleConflicts(modifiedSchedule, faculty, {
        subjects,
        students,
        halls,
        departments: resolvedDepartments,
        policy: currentPolicy,
      });
      try {
        const res = await persistenceService.overrideFacultyDuty(
          currentState.scheduleId,
          examId,
          newFacultyId,
          recalculated.schedule,
          recalculated.conflicts
        );
        const nextRawSched = res?.updatedSchedule || recalculated.schedule;
        const nextEval = recalculateScheduleConflicts(nextRawSched, faculty, {
          subjects,
          students,
          halls,
          departments: resolvedDepartments,
          policy: currentPolicy,
        });
        const nextId = res?.scheduleId || currentState.scheduleId;
        setGaResult((prev) => ({
          ...prev,
          scheduleId: nextId,
          schedule: nextEval.schedule,
          conflicts: nextEval.conflicts,
        }));
        setLatestConflictReport({
          scheduleId: nextId,
          ...nextEval.conflicts,
        });
        showSuccess(`Invigilator reassigned to ${selectedFac.name} and saved.`);
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'INVIGILATOR_OVERRIDDEN',
          summary: `Reassigned invigilator for ${examId} to ${selectedFac.name}.`,
          actorEmail,
          actorUid,
          targetType: 'exam_slot',
          targetId: examId,
          targetLabel: selectedFac.name,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [faculty, halls, subjects, students, resolvedDepartments, showSuccess, showError, actorEmail, actorUid]
  );

  const handleSaveConflictReport = useCallback(async () => {
    const currentState = gaResultRef.current;
    const currentPolicy = policyRef.current;
    try {
      const recalculated = recalculateScheduleConflicts(currentState.schedule, faculty, {
        subjects,
        students,
        halls,
        departments: resolvedDepartments,
        policy: currentPolicy,
      });
      const res = await persistenceService.saveConflictReport(
        currentState.scheduleId,
        recalculated.schedule,
        recalculated.conflicts
      );
      setLatestConflictReport({
        id: res?.reportId,
        scheduleId: currentState.scheduleId,
        ...recalculated.conflicts,
      });
      showSuccess('Conflict report saved to database.');
      void logSystemAuditEvent({
        category: 'scheduling',
        action: 'CONFLICT_REPORT_SAVED',
        summary: `Saved schedule conflict analysis report (${recalculated.conflicts?.totalHardViolations ?? 0} hard violations).`,
        actorEmail,
        actorUid,
        targetType: 'conflict_report',
        targetId: res?.reportId || '',
        targetLabel: currentState.scheduleId || 'Active Schedule',
      });
      return true;
    } catch (err) {
      showError(err);
      return false;
    }
  }, [faculty, subjects, students, halls, resolvedDepartments, showSuccess, showError, actorEmail, actorUid]);

  const handleConfirmFinalizeTimetable = useCallback(
    async ({ allowOverride = false } = {}) => {
      const currentState = gaResultRef.current;
      const currentPolicy = policyRef.current;
      const validation = validateCompleteExamTimetable(currentState.schedule || [], {
        departments: resolvedDepartments,
        subjects,
        students,
        halls,
        faculty,
        policy: currentPolicy,
      });

      if (!validation.isValid && !allowOverride) {
        const msg =
          validation.warnings[0] ||
          'Cannot finalize timetable until all department date, gap, and resource violations are resolved.';
        showError(msg);
        return false;
      }

      try {
        await api
          .saveSchedule({
            scheduleId: currentState.scheduleId,
            schedule: currentState.schedule,
            history: currentState.history,
            conflicts: validation.conflicts,
            bestFitness: currentState.bestFitness,
            convergedAtGeneration: currentState.convergedAtGeneration,
            executionTimeMs: currentState.executionTimeMs,
            scope: currentState.scope || 'ALL',
            policy: currentPolicy,
            strictValidation: true,
            allowOverride: Boolean(allowOverride),
          })
          .catch((err) => {
            if (String(err?.message || '').includes('Invalid Schedule')) {
              throw err;
            }
          });
        setTimetableConfirmed(true);
        showSuccess(
          allowOverride && !validation.isValid
            ? 'Timetable finalized with authorized administrator override.'
            : 'Timetable validated and finalized across all departments.'
        );
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'TIMETABLE_FINALIZED',
          summary: allowOverride && !validation.isValid
            ? 'Finalized examination timetable with administrator policy override.'
            : 'Validated and finalized examination timetable across all departments.',
          actorEmail,
          actorUid,
          targetType: 'schedule',
          targetId: currentState.scheduleId || '',
          targetLabel: currentState.scope || 'ALL',
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [resolvedDepartments, subjects, students, halls, faculty, showSuccess, showError, actorEmail, actorUid]
  );

  return {
    gaConfig,
    setGaConfig,
    savedGAConfig,
    isSavingGAConfig,
    handleSaveGAConfig,
    gaResult,
    activePolicy,
    scheduleValidation,
    timetableConfirmed,
    latestConflictReport,
    optimizationRuns,
    singleDaySelections,
    setSingleDaySelections,
    singleDayDate,
    setSingleDayDate,
    singleDaySession,
    setSingleDaySession,
    isGARunning,
    gaProgress,
    cancelGA,
    hydrateScheduleFromData,
    handleRunGA,
    handleFinalizeSingleDaySchedule,
    handleUpdateScheduledExam,
    handleBatchUpdateScheduledExams,
    handleOverrideFaculty,
    handleSaveConflictReport,
    handleConfirmFinalizeTimetable,
    handleRestoreOptimizationRun,
    handleDeleteOptimizationRun,
  };
}
