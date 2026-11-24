import {
  DEFAULT_SCHEDULING_POLICY,
  buildEnrollmentMap,
  compareExamStudentOverlap,
  normalizeSchedulingPolicy,
  parseExamDate,
  resolveDepartmentIdentity,
  validateCompleteExamTimetable,
} from './conflictEvaluator.js';

const SESSIONS = ['FN (09:30 - 12:30)', 'AN (14:00 - 17:00)'];

export const DEFAULT_CONSTRAINT_CONFIG = {
  hardConstraintWeight: 1000,
  workloadBalanceWeight: 15,
  sameDayCohortPenalty: 25,
  hallUtilizationWeight: 0.5,
  enforceMaxDuties: true,
  preventSameCohortDoubleExamPerDay: true,
  ...DEFAULT_SCHEDULING_POLICY,
};

function clampFinite(val, min, max, fallback) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

export function normalizeConstraintConfig(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const policy = normalizeSchedulingPolicy(src);
  return {
    hardConstraintWeight: clampFinite(
      src.hardConstraintWeight,
      100,
      10000,
      DEFAULT_CONSTRAINT_CONFIG.hardConstraintWeight
    ),
    workloadBalanceWeight: clampFinite(
      src.workloadBalanceWeight,
      0,
      200,
      DEFAULT_CONSTRAINT_CONFIG.workloadBalanceWeight
    ),
    sameDayCohortPenalty: clampFinite(
      src.sameDayCohortPenalty,
      0,
      500,
      DEFAULT_CONSTRAINT_CONFIG.sameDayCohortPenalty
    ),
    hallUtilizationWeight: clampFinite(
      src.hallUtilizationWeight,
      0,
      25,
      DEFAULT_CONSTRAINT_CONFIG.hallUtilizationWeight
    ),
    enforceMaxDuties:
      src.enforceMaxDuties === undefined
        ? DEFAULT_CONSTRAINT_CONFIG.enforceMaxDuties
        : Boolean(src.enforceMaxDuties),
    preventSameCohortDoubleExamPerDay:
      src.preventSameCohortDoubleExamPerDay === undefined
        ? DEFAULT_CONSTRAINT_CONFIG.preventSameCohortDoubleExamPerDay
        : Boolean(src.preventSameCohortDoubleExamPerDay),
    ...policy,
  };
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function subjectsShareStudents(subA, subB, enrollmentMap) {
  return compareExamStudentOverlap(subA, subB, { enrollmentMap }).isStudentClash;
}

function toDayNumber(dateStr, cache) {
  if (cache && cache.has(dateStr)) return cache.get(dateStr);
  const parsed = parseExamDate(dateStr);
  const val = parsed ? Math.round(parsed.ms / 86400000) : null;
  if (cache) cache.set(dateStr, val);
  return val;
}

function extendDatesIfNeeded(baseDates, effectiveExams, subjectsMap, departments, minGapDays, isSingleDay) {
  const cleanDates = Array.from(new Set((baseDates || []).filter(Boolean))).sort();
  if (isSingleDay || cleanDates.length === 0) {
    return cleanDates.length > 0 ? cleanDates : ['2026-11-16'];
  }

  const deptExamCounts = new Map();
  for (const exam of effectiveExams) {
    const sub = subjectsMap.get(exam.subjectId);
    const deptKey = sub
      ? resolveDepartmentIdentity(sub, departments, subjectsMap).key
      : 'general';
    deptExamCounts.set(deptKey, (deptExamCounts.get(deptKey) || 0) + 1);
  }

  const maxDeptExams = Math.max(1, ...Array.from(deptExamCounts.values()));
  const minRequiredSpanDays =
    maxDeptExams <= 1 ? 1 : (maxDeptExams - 1) * (minGapDays + 1) + 1;

  const validIso = [];
  for (const d of cleanDates) {
    const parsed = parseExamDate(d);
    if (parsed) validIso.push(parsed.iso);
  }
  validIso.sort();
  if (validIso.length === 0) return cleanDates;

  const existingSet = new Set(validIso);
  const out = [...validIso];
  const firstMs = parseExamDate(validIso[0]).ms;
  let lastMs = parseExamDate(validIso[validIso.length - 1]).ms;

  while (true) {
    const spanDays = Math.round((lastMs - firstMs) / 86400000) + 1;
    if (spanDays >= minRequiredSpanDays && out.length >= maxDeptExams) break;
    lastMs += 86400000;
    const nextIso = new Date(lastMs).toISOString().slice(0, 10);
    if (!existingSet.has(nextIso)) {
      existingSet.add(nextIso);
      out.push(nextIso);
    }
  }

  return out;
}

function pickSpacedDatesForDept(count, effectiveDates, minGapDays, onePerDay, allowSameDay) {
  if (count <= 0) return [];
  const sortedDates = [...effectiveDates].sort();
  if (!onePerDay || allowSameDay) {
    if (minGapDays <= 0) {
      return Array.from({ length: count }, () => randomChoice(sortedDates));
    }
  }

  const stepDays = minGapDays > 0 ? minGapDays + 1 : 1;
  const parsedDates = sortedDates.map((d) => ({ iso: d, parsed: parseExamDate(d) }));
  const startMax = Math.max(0, Math.min(2, parsedDates.length - 1));
  const startIdx = Math.floor(Math.random() * (startMax + 1));

  const picked = [];
  let lastDay = null;
  for (let idx = startIdx; idx < parsedDates.length && picked.length < count; idx++) {
    const { iso, parsed } = parsedDates[idx];
    if (lastDay === null || !parsed) {
      picked.push(iso);
      lastDay = parsed ? Math.round(parsed.ms / 86400000) : null;
    } else {
      const dayNum = Math.round(parsed.ms / 86400000);
      if (dayNum - lastDay >= stepDays) {
        picked.push(iso);
        lastDay = dayNum;
      }
    }
  }

  if (picked.length < count) {
    const used = new Set(picked);
    for (const { iso, parsed } of parsedDates) {
      if (picked.length >= count) break;
      if (used.has(iso)) continue;
      if (
        !parsed ||
        picked.every((p) => {
          const pp = parseExamDate(p);
          return !pp || Math.abs(Math.round(parsed.ms / 86400000) - Math.round(pp.ms / 86400000)) >= stepDays;
        })
      ) {
        picked.push(iso);
        used.add(iso);
      }
    }
  }

  while (picked.length < count) {
    picked.push(randomChoice(sortedDates));
  }
  return picked;
}

export function evaluateChromosome(
  chromosome,
  examsMap,
  subjectsMap,
  hallsMap,
  facultyMap,
  enrollmentMap,
  rawConstraintConfig = DEFAULT_CONSTRAINT_CONFIG,
  options = {}
) {
  const constraintConfig = normalizeConstraintConfig(rawConstraintConfig);
  const isSingleDay = Boolean(options?.isSingleDay);
  const departments = Array.isArray(options?.departments) ? options.departments : [];
  const dayCache = options?.dayCache instanceof Map ? options.dayCache : new Map();

  let studentClashes = 0;
  let invigilatorConflicts = 0;
  let capacityViolations = 0;
  let hallDoubleBookings = 0;
  let sameDayCohortOverlaps = 0;
  let departmentSameDayViolations = 0;
  let departmentGapViolations = 0;
  let departmentIndependenceViolations = 0;

  const geneFlags = chromosome.map(() => ({
    hasStudentClash: false,
    hasInvigilatorConflict: false,
    hasCapacityIssue: false,
    hasHallDoubleBooking: false,
    hasDepartmentDateViolation: false,
    hasDepartmentGapViolation: false,
    hasDepartmentIndependenceViolation: false,
  }));

  const facultyDutyCount = new Map();
  let totalEnrolled = 0;
  let totalCapacity = 0;

  const byDeptDate = new Map();
  const byDept = new Map();
  const deptsByDate = new Map();
  const indicesByDate = new Map();

  for (let i = 0; i < chromosome.length; i++) {
    const gene = chromosome[i];
    const exam = examsMap.get(gene.examId);
    const subject = exam ? subjectsMap.get(exam.subjectId) : undefined;
    const hall = hallsMap.get(gene.hallId);
    const fac = facultyMap.get(gene.invigilatorId);

    if (subject && hall) {
      totalEnrolled += subject.enrolledCount;
      totalCapacity += hall.capacity;
      if (!hall.available || hall.capacity < subject.enrolledCount) {
        capacityViolations++;
        geneFlags[i].hasCapacityIssue = true;
      }
    }

    if (fac) {
      facultyDutyCount.set(fac.id, (facultyDutyCount.get(fac.id) || 0) + 1);
      if (!fac.available) {
        invigilatorConflicts++;
        geneFlags[i].hasInvigilatorConflict = true;
      }
    }

    const dayNum = toDayNumber(gene.date, dayCache);
    if (dayNum !== null) {
      const deptKey = subject
        ? resolveDepartmentIdentity(subject, departments, subjectsMap).key
        : 'general';
      const dateIso = gene.date;
      const ddKey = `${deptKey}::${dateIso}`;
      if (!byDeptDate.has(ddKey)) byDeptDate.set(ddKey, []);
      byDeptDate.get(ddKey).push(i);

      if (!byDept.has(deptKey)) byDept.set(deptKey, []);
      byDept.get(deptKey).push({ idx: i, dayNum, session: gene.session });

      if (!deptsByDate.has(dateIso)) deptsByDate.set(dateIso, new Set());
      deptsByDate.get(dateIso).add(deptKey);

      if (!indicesByDate.has(dateIso)) indicesByDate.set(dateIso, []);
      indicesByDate.get(dateIso).push(i);
    }
  }

  for (let i = 0; i < chromosome.length; i++) {
    for (let j = i + 1; j < chromosome.length; j++) {
      const g1 = chromosome[i];
      const g2 = chromosome[j];
      if (g1.date !== g2.date) continue;

      const ex1 = examsMap.get(g1.examId);
      const ex2 = examsMap.get(g2.examId);
      const sub1 = ex1 ? subjectsMap.get(ex1.subjectId) : undefined;
      const sub2 = ex2 ? subjectsMap.get(ex2.subjectId) : undefined;
      const hasStudentOverlap = Boolean(
        sub1 && sub2 && subjectsShareStudents(sub1, sub2, enrollmentMap)
      );

      if (g1.session === g2.session) {
        if (g1.hallId === g2.hallId) {
          hallDoubleBookings++;
          geneFlags[i].hasHallDoubleBooking = true;
          geneFlags[j].hasHallDoubleBooking = true;
        }

        if (g1.invigilatorId === g2.invigilatorId) {
          invigilatorConflicts++;
          geneFlags[i].hasInvigilatorConflict = true;
          geneFlags[j].hasInvigilatorConflict = true;
        }

        if (hasStudentOverlap) {
          studentClashes++;
          geneFlags[i].hasStudentClash = true;
          geneFlags[j].hasStudentClash = true;
        }
      } else if (hasStudentOverlap) {
        // Same date, different session (FN & AN) for the same student cohort
        sameDayCohortOverlaps++;
      }
    }
  }

  // Hard Constraint 1: One examination per department per calendar date (unless overridden)
  const enforceOnePerDay =
    Boolean(constraintConfig.oneExamPerDeptPerDay) && !Boolean(constraintConfig.allowSameDayFnAnPerDept);
  if (enforceOnePerDay) {
    for (const idxs of byDeptDate.values()) {
      if (idxs.length > 1) {
        departmentSameDayViolations += idxs.length - 1;
        for (const idx of idxs) {
          geneFlags[idx].hasDepartmentDateViolation = true;
        }
      }
    }
  }

  // Hard Constraint 2: Minimum N complete days gap between consecutive exams of same department
  const effectiveMinGap = isSingleDay ? 0 : constraintConfig.minGapDaysBetweenExams;
  if (effectiveMinGap > 0) {
    const minDayDiff = effectiveMinGap + 1;
    for (const items of byDept.values()) {
      if (items.length <= 1) continue;
      items.sort((a, b) => a.dayNum - b.dayNum);
      for (let k = 1; k < items.length; k++) {
        const diff = items[k].dayNum - items[k - 1].dayNum;
        if (diff > 0 && diff < minDayDiff) {
          departmentGapViolations += 1;
          geneFlags[items[k - 1].idx].hasDepartmentGapViolation = true;
          geneFlags[items[k].idx].hasDepartmentGapViolation = true;
        }
      }
    }
  }

  // Hard Constraint 3: Optional strict prohibition on different departments sharing dates
  if (!constraintConfig.allowMultipleDeptsSameDate) {
    for (const [dateIso, deptSet] of deptsByDate.entries()) {
      if (deptSet.size > 1) {
        departmentIndependenceViolations += 1;
        for (const idx of indicesByDate.get(dateIso) || []) {
          geneFlags[idx].hasDepartmentIndependenceViolation = true;
        }
      }
    }
  }

  if (constraintConfig.enforceMaxDuties) {
    for (const [facId, count] of facultyDutyCount.entries()) {
      const fac = facultyMap.get(facId);
      if (fac && count > fac.maxDuties) {
        invigilatorConflicts += count - fac.maxDuties;
      }
    }
  }

  const availableFaculty = Array.from(facultyMap.values()).filter((f) => f.available);
  const counts = availableFaculty.map((f) => facultyDutyCount.get(f.id) || 0);
  const mean = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const variance =
    counts.length > 0
      ? counts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / counts.length
      : 0;
  const workloadStdDev = Math.sqrt(variance);

  const utilizationRate = totalCapacity > 0 ? Math.min(100, (totalEnrolled / totalCapacity) * 100) : 0;

  const totalHardViolations =
    studentClashes +
    invigilatorConflicts +
    capacityViolations +
    hallDoubleBookings +
    departmentSameDayViolations +
    departmentGapViolations +
    departmentIndependenceViolations;

  const effectiveSameDayPenalty =
    !isSingleDay && constraintConfig.preventSameCohortDoubleExamPerDay
      ? constraintConfig.sameDayCohortPenalty
      : 0;

  const hardPenalty = totalHardViolations * constraintConfig.hardConstraintWeight;
  const softPenalty =
    workloadStdDev * constraintConfig.workloadBalanceWeight +
    sameDayCohortOverlaps * effectiveSameDayPenalty +
    (100 - utilizationRate) * constraintConfig.hallUtilizationWeight;

  const fitness = Math.max(0, 1000 - hardPenalty - softPenalty);

  return {
    fitness,
    studentClashes,
    invigilatorConflicts,
    capacityViolations,
    hallDoubleBookings,
    sameDayCohortOverlaps,
    departmentSameDayViolations,
    departmentGapViolations,
    departmentIndependenceViolations,
    totalHardViolations,
    workloadStdDev,
    utilizationRate,
    hardPenalty,
    softPenalty,
    geneFlags,
  };
}

export function runGeneticAlgorithm(exams, subjects, halls, faculty, students, config = {}, options = {}) {
  const startTime = performance.now();
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  const shouldCancel = typeof options?.shouldCancel === 'function' ? options.shouldCancel : null;
  const departments = Array.isArray(options?.departments)
    ? options.departments
    : Array.isArray(config?.departments)
    ? config.departments
    : [];

  const populationSize = Math.max(4, Math.min(500, Math.floor(Number(config?.populationSize) || 40)));
  const generations = Math.max(
    1,
    Math.min(1000, Math.floor(Number(config?.generations ?? config?.maxGenerations) || 50))
  );
  const mutationRate = clampFinite(config?.mutationRate, 0, 1, 0.12);
  const crossoverRate = clampFinite(config?.crossoverRate, 0, 1, 0.8);
  const maxElitism = Math.min(10, Math.max(1, Math.floor(populationSize / 2)));
  const elitismCount = Math.max(
    1,
    Math.min(maxElitism, Math.floor(Number(config?.elitismCount) || 2))
  );
  const tournamentSize = Math.max(
    2,
    Math.min(10, populationSize, Math.floor(Number(config?.tournamentSize) || 3))
  );
  const earlyStopGenerations = Math.max(
    0,
    Math.min(500, Math.floor(Number(config?.earlyStopGenerations) || 0))
  );
  const constraintConfig = normalizeConstraintConfig(config?.constraintConfig);

  const availableHalls = halls.filter((h) => h.available !== false);
  const availableFaculty = faculty.filter((f) => f.available !== false);
  const configDates = Array.isArray(config?.availableDates) ? config.availableDates : [];
  const dates = configDates.length > 0 ? configDates : ['2026-11-16'];

  let targetSubjects = subjects;
  let targetStudents = students;
  let effectiveDates = dates;
  let effectiveSessions = SESSIONS;

  if (config.scope === 'SINGLE_DAY' && Array.isArray(config.selectedSubjectIds) && config.selectedSubjectIds.length > 0) {
    const selectedIdSet = new Set(config.selectedSubjectIds);
    targetSubjects = subjects.filter((s) => selectedIdSet.has(s.id));
    const singleDate = config.singleDayDate || dates[0];
    effectiveDates = [singleDate];
    if (config.singleDaySession && config.singleDaySession !== 'BOTH') {
      effectiveSessions = [config.singleDaySession];
    }
    targetStudents = students.filter((st) =>
      (st.enrolledSubjectIds || []).some((sid) => selectedIdSet.has(sid))
    );
  } else if (config.scope === 'SELECTED' && config.selectedDepartments && config.selectedDepartments.length > 0) {
    const deptSet = new Set(config.selectedDepartments);
    targetSubjects = subjects.filter((s) => deptSet.has(s.department));

    if (config.selectedCourses && config.selectedCourses.length > 0) {
      const courseSet = new Set(config.selectedCourses);
      targetSubjects = targetSubjects.filter((s) => courseSet.has(s.code) || courseSet.has(s.name));
    }
    if (config.selectedSections && config.selectedSections.length > 0) {
      const secSet = new Set(config.selectedSections);
      targetSubjects = targetSubjects.filter((s) => secSet.has(s.section));
    }
    if (config.selectedBatches && config.selectedBatches.length > 0) {
      const batchSet = new Set(config.selectedBatches);
      targetSubjects = targetSubjects.filter((s) => batchSet.has(s.batch));
    }

    targetStudents = students.filter((st) => {
      if (!deptSet.has(st.department)) return false;
      if (config.selectedBatches && config.selectedBatches.length > 0 && !config.selectedBatches.includes(st.batch)) return false;
      if (config.selectedSections && config.selectedSections.length > 0 && !config.selectedSections.includes(st.section)) return false;
      return true;
    });
  }

  const targetSubjectIds = new Set(targetSubjects.map((s) => s.id));
  const activeExams = exams.filter((e) => targetSubjectIds.has(e.subjectId));
  const effectiveExams = activeExams.length > 0 ? activeExams : exams;

  const examsMap = new Map(effectiveExams.map((e) => [e.id, e]));
  const subjectsMap = new Map(subjects.map((s) => [s.id, s]));
  const hallsMap = new Map(halls.map((h) => [h.id, h]));
  const facultyMap = new Map(faculty.map((f) => [f.id, f]));
  const enrollmentMap = buildEnrollmentMap(targetStudents);

  const hallPool = availableHalls.length > 0 ? availableHalls : halls;
  const facultyPool = availableFaculty.length > 0 ? availableFaculty : faculty;
  const isSingleDay = config.scope === 'SINGLE_DAY';
  const dayCache = new Map();

  effectiveDates = extendDatesIfNeeded(
    effectiveDates,
    effectiveExams,
    subjectsMap,
    departments,
    constraintConfig.minGapDaysBetweenExams,
    isSingleDay
  );

  // Pre-group exams by department for gap-compliant initialization
  const examsByDept = new Map();
  effectiveExams.forEach((exam, idx) => {
    const sub = subjectsMap.get(exam.subjectId);
    const deptKey = sub
      ? resolveDepartmentIdentity(sub, departments, subjectsMap).key
      : 'general';
    if (!examsByDept.has(deptKey)) examsByDept.set(deptKey, []);
    examsByDept.get(deptKey).push({ idx, exam });
  });

  const createRandomChromosome = () => {
    const genes = new Array(effectiveExams.length);

    if (isSingleDay) {
      effectiveExams.forEach((exam, idx) => {
        const subject = subjectsMap.get(exam.subjectId);
        const fittingHalls = subject
          ? hallPool.filter((h) => h.capacity >= subject.enrolledCount)
          : hallPool;
        const chosenHall =
          fittingHalls.length > 0 ? randomChoice(fittingHalls) : randomChoice(hallPool);
        genes[idx] = {
          examId: exam.id,
          date: effectiveDates[0],
          session: randomChoice(effectiveSessions),
          hallId: chosenHall.id,
          invigilatorId: randomChoice(facultyPool).id,
        };
      });
      return genes;
    }

    for (const deptEntries of examsByDept.values()) {
      const pickedDates = pickSpacedDatesForDept(
        deptEntries.length,
        effectiveDates,
        constraintConfig.minGapDaysBetweenExams,
        constraintConfig.oneExamPerDeptPerDay,
        constraintConfig.allowSameDayFnAnPerDept
      );
      deptEntries.forEach(({ idx, exam }, pos) => {
        const subject = subjectsMap.get(exam.subjectId);
        const fittingHalls = subject
          ? hallPool.filter((h) => h.capacity >= subject.enrolledCount)
          : hallPool;
        const chosenHall =
          fittingHalls.length > 0 ? randomChoice(fittingHalls) : randomChoice(hallPool);
        genes[idx] = {
          examId: exam.id,
          date: exam.preferredDate || pickedDates[pos],
          session: randomChoice(effectiveSessions),
          hallId: chosenHall.id,
          invigilatorId: randomChoice(facultyPool).id,
        };
      });
    }

    return genes;
  };

  let population = Array.from({ length: populationSize }, () =>
    createRandomChromosome()
  );

  const history = [];
  let globalBestChromosome = population[0];
  let globalBestEval = evaluateChromosome(
    globalBestChromosome,
    examsMap,
    subjectsMap,
    hallsMap,
    facultyMap,
    enrollmentMap,
    constraintConfig,
    { isSingleDay, departments, dayCache }
  );
  let convergedAtGeneration = 1;

  for (let gen = 1; gen <= generations; gen++) {
    if (shouldCancel && shouldCancel()) {
      const cancelErr = new Error('Genetic Algorithm optimization was cancelled.');
      cancelErr.cancelled = true;
      throw cancelErr;
    }

    const evaluated = population.map((chrom) => ({
      chrom,
      eval: evaluateChromosome(
        chrom,
        examsMap,
        subjectsMap,
        hallsMap,
        facultyMap,
        enrollmentMap,
        constraintConfig,
        { isSingleDay, departments, dayCache }
      ),
    }));

    evaluated.sort((a, b) => b.eval.fitness - a.eval.fitness);

    const bestInGen = evaluated[0];
    if (bestInGen.eval.fitness > globalBestEval.fitness) {
      globalBestChromosome = bestInGen.chrom;
      globalBestEval = bestInGen.eval;
      convergedAtGeneration = gen;
    }

    const avgFitness =
      evaluated.reduce((sum, item) => sum + item.eval.fitness, 0) / evaluated.length;

    history.push({
      generation: gen,
      bestFitness: Number(bestInGen.eval.fitness.toFixed(1)),
      avgFitness: Number(avgFitness.toFixed(1)),
      studentClashes: bestInGen.eval.studentClashes,
      invigilatorConflicts: bestInGen.eval.invigilatorConflicts,
      capacityViolations: bestInGen.eval.capacityViolations,
      departmentSameDayViolations: bestInGen.eval.departmentSameDayViolations,
      departmentGapViolations: bestInGen.eval.departmentGapViolations,
    });

    if (onProgress) {
      onProgress({
        generation: gen,
        totalGenerations: generations,
        percent: Math.round((gen / Math.max(1, generations)) * 100),
        bestFitness: Number(globalBestEval.fitness.toFixed(1)),
        avgFitness: Number(avgFitness.toFixed(1)),
        conflictCount: bestInGen.eval.totalHardViolations,
        studentClashes: bestInGen.eval.studentClashes,
        invigilatorConflicts: bestInGen.eval.invigilatorConflicts,
        capacityViolations: bestInGen.eval.capacityViolations,
        hallDoubleBookings: bestInGen.eval.hallDoubleBookings,
        departmentSameDayViolations: bestInGen.eval.departmentSameDayViolations,
        departmentGapViolations: bestInGen.eval.departmentGapViolations,
        sameDayCohortOverlaps: bestInGen.eval.sameDayCohortOverlaps,
      });
    }

    if (
      earlyStopGenerations > 0 &&
      globalBestEval.totalHardViolations === 0 &&
      gen - convergedAtGeneration >= earlyStopGenerations
    ) {
      break;
    }

    const nextPop = [];
    for (let e = 0; e < elitismCount; e++) {
      const eliteChrom = evaluated[e]?.chrom || evaluated[0].chrom;
      nextPop.push(eliteChrom.map((g) => ({ ...g })));
    }

    while (nextPop.length < populationSize) {
      const tournamentSelect = () => {
        let best = randomChoice(evaluated);
        for (let t = 1; t < tournamentSize; t++) {
          const contender = randomChoice(evaluated);
          if (contender.eval.fitness > best.eval.fitness) best = contender;
        }
        return best.chrom;
      };

      const parentA = tournamentSelect();
      const parentB = tournamentSelect();

      let child;
      if (Math.random() < crossoverRate && parentA.length > 1) {
        const split = Math.floor(Math.random() * parentA.length);
        child = [...parentA.slice(0, split), ...parentB.slice(split)].map((g) => ({ ...g }));
      } else {
        child = parentA.map((g) => ({ ...g }));
      }

      for (let i = 0; i < child.length; i++) {
        if (Math.random() < mutationRate) {
          const mutationType = Math.floor(Math.random() * 3);
          if (mutationType === 0) {
            child[i].date = randomChoice(effectiveDates);
            child[i].session = randomChoice(effectiveSessions);
          } else if (mutationType === 1) {
            const ex = examsMap.get(child[i].examId);
            const sub = ex ? subjectsMap.get(ex.subjectId) : undefined;
            const fitting = sub ? hallPool.filter((h) => h.capacity >= sub.enrolledCount) : hallPool;
            child[i].hallId = (fitting.length > 0 ? randomChoice(fitting) : randomChoice(hallPool)).id;
          } else {
            child[i].invigilatorId = randomChoice(facultyPool).id;
          }
        }
      }

      nextPop.push(child);
    }

    population = nextPop;
  }

  const rawSchedule = globalBestChromosome
    .map((gene, idx) => {
      const exam = examsMap.get(gene.examId);
      const subject = subjectsMap.get(exam.subjectId);
      const hall = hallsMap.get(gene.hallId);
      const fac = facultyMap.get(gene.invigilatorId);
      const flags = globalBestEval.geneFlags[idx];

      return {
        examId: exam.id,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        department: subject.department,
        ...(subject.departmentId ? { departmentId: subject.departmentId } : {}),
        batch: subject.batch,
        section: subject.section,
        semester: subject.semester,
        enrolledCount: subject.enrolledCount,
        date: gene.date,
        session: gene.session,
        hallId: hall.id,
        hallNumber: hall.hallNumber,
        hallCapacity: hall.capacity,
        invigilatorId: fac.id,
        invigilatorName: fac.name,
        invigilatorDept: fac.department,
        ...flags,
      };
    })
    .sort((a, b) =>
      a.date === b.date
        ? a.session === b.session
          ? String(a.subjectCode || '').localeCompare(String(b.subjectCode || ''))
          : a.session.localeCompare(b.session)
        : a.date.localeCompare(b.date)
    );

  const effectivePolicy = isSingleDay
    ? { ...constraintConfig, minGapDaysBetweenExams: 0 }
    : constraintConfig;

  const validation = validateCompleteExamTimetable(rawSchedule, {
    departments,
    subjects,
    students: targetStudents,
    halls,
    faculty,
    policy: effectivePolicy,
  });

  const conflicts = {
    ...validation.conflicts,
    utilizationRate: Number(globalBestEval.utilizationRate.toFixed(1)),
    workloadStdDev: Number(globalBestEval.workloadStdDev.toFixed(2)),
  };

  const constraintReport = {
    isFeasible: conflicts.totalHardViolations === 0,
    hardViolations: {
      studentClashes: conflicts.studentClashes,
      invigilatorConflicts: conflicts.invigilatorConflicts,
      capacityViolations: conflicts.capacityViolations,
      hallDoubleBookings: conflicts.hallDoubleBookings,
      departmentSameDayViolations: conflicts.departmentSameDayViolations,
      departmentGapViolations: conflicts.departmentGapViolations,
      departmentIndependenceViolations: conflicts.departmentIndependenceViolations,
      total: conflicts.totalHardViolations,
    },
    softMetrics: {
      workloadStdDev: conflicts.workloadStdDev,
      utilizationRate: conflicts.utilizationRate,
      sameDayCohortOverlaps: globalBestEval.sameDayCohortOverlaps,
      hardPenalty: Number(globalBestEval.hardPenalty.toFixed(1)),
      softPenalty: Number(globalBestEval.softPenalty.toFixed(1)),
    },
    validationWarnings: validation.warnings,
    departmentTimelines: validation.departmentTimelines,
    constraintConfigUsed: constraintConfig,
  };

  return {
    schedule: validation.schedule,
    bestFitness: Number(globalBestEval.fitness.toFixed(1)),
    history,
    conflicts,
    validation,
    constraintReport,
    constraintConfig,
    gaParametersUsed: {
      populationSize,
      generations,
      mutationRate,
      crossoverRate,
      elitismCount,
      tournamentSize,
      earlyStopGenerations,
    },
    convergedAtGeneration,
    executionTimeMs: Math.round(performance.now() - startTime),
  };
}
