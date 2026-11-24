/**
 * Pure automated Quick Fix recommendation engine for resolving overlapping
 * student cohort exam times and department date/gap violations with minimal overall disruption.
 */

import { SESSION_ORDER, getShortSessionLabel, getSessionSortRank } from './conflictHeatmap.js';
import {
  buildEnrollmentMap,
  compareExamStudentOverlap,
  evaluateScheduleConflicts,
  normalizeSchedulingPolicy,
  validateDepartmentIndependence,
  validateMinimumExamGap,
  validateOneExamPerDepartmentPerDay,
} from './conflictEvaluator.js';

function examsShareCohortOrStudents(examA, examB, subjectMap, enrollmentMap, departments) {
  return compareExamStudentOverlap(examA, examB, {
    subjectMap,
    enrollmentMap,
    departments,
  }).isStudentClash;
}

function dayDistance(dateA = '', dateB = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateA) || !/^\d{4}-\d{2}-\d{2}$/.test(dateB)) {
    return 0;
  }
  const msA = Date.parse(`${dateA}T00:00:00Z`);
  const msB = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round(Math.abs(msA - msB) / 86400000);
}

function buildNextCalendarDates(existingDates = [], count = 6) {
  const validIso = existingDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (validIso.length === 0) return [];
  const last = new Date(`${validIso[validIso.length - 1]}T00:00:00Z`);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const next = new Date(last.getTime() + i * 86400000);
    out.push(next.toISOString().slice(0, 10));
  }
  return out;
}

export function suggestQuickFixesForExam({
  targetExam,
  schedule = [],
  subjects = [],
  students = [],
  halls = [],
  faculty = [],
  departments = [],
  policy = {},
  availableDates = [],
  maxSuggestions = 3,
} = {}) {
  if (!targetExam || !targetExam.examId) return [];

  const pol = normalizeSchedulingPolicy(policy);
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const enrollmentMap = buildEnrollmentMap(students);

  const configuredDateSet = new Set([
    ...availableDates.filter(Boolean),
    ...schedule.map((item) => item?.date).filter(Boolean),
  ]);
  const overflowCount = Math.max(6, pol.minGapDaysBetweenExams + 4);
  const overflowDates = buildNextCalendarDates(Array.from(configuredDateSet), overflowCount);
  const candidateDates = Array.from(
    new Set([...configuredDateSet, ...overflowDates])
  ).sort((a, b) => a.localeCompare(b));

  const otherExams = schedule.filter((item) => item.examId !== targetExam.examId);

  // Track baseline faculty duty counts across other exams for fair workload balancing
  const baseDutyCounts = new Map();
  for (const item of otherExams) {
    const fId = item.invigilatorId || item.facultyId;
    if (fId) baseDutyCounts.set(fId, (baseDutyCounts.get(fId) || 0) + 1);
  }

  const enrolledCount = Number(targetExam.enrolledCount || 0);
  const currentHallId = targetExam.hallId || '';
  const currentInvId = targetExam.invigilatorId || targetExam.facultyId || '';

  const candidates = [];

  for (const date of candidateDates) {
    const isOverflowDate = !configuredDateSet.has(date);

    for (const session of SESSION_ORDER) {
      if (date === targetExam.date && session === targetExam.session) {
        continue;
      }

      const slotExams = otherExams.filter(
        (item) => item.date === date && item.session === session
      );

      // 1. Check cohort & shared-student clashes in this candidate slot
      const clashingExams = slotExams.filter((peer) =>
        examsShareCohortOrStudents(targetExam, peer, subjectMap, enrollmentMap, departments)
      );
      const cohortClashCount = clashingExams.length;

      // Also check if this cohort already has an exam on the SAME date (different session)
      const sameDayCohortExams = otherExams.filter(
        (peer) =>
          peer.date === date &&
          peer.session !== session &&
          examsShareCohortOrStudents(targetExam, peer, subjectMap, enrollmentMap, departments)
      );
      const sameDayLoadForCohort = sameDayCohortExams.length > 0;

      // 1b. Evaluate department-wise 1-exam/day, minimum gap, and independence rules
      const proposedSchedule = [
        ...otherExams,
        {
          ...targetExam,
          date,
          session,
        },
      ];
      const onePerDayRes = validateOneExamPerDepartmentPerDay(proposedSchedule, {
        departments,
        subjects,
        policy: pol,
      });
      const minGapRes = validateMinimumExamGap(proposedSchedule, {
        departments,
        subjects,
        policy: pol,
      });
      const indepRes = validateDepartmentIndependence(proposedSchedule, {
        departments,
        subjects,
        policy: pol,
      });

      const targetId = targetExam.examId;
      const hasDeptSameDayViolation = onePerDayRes.violatingExamIds.includes(targetId);
      const hasDeptGapViolation = minGapRes.violatingExamIds.includes(targetId);
      const hasDeptIndependenceViolation = indepRes.violatingExamIds.includes(targetId);
      const deptPolicyViolations =
        (hasDeptSameDayViolation ? 1 : 0) +
        (hasDeptGapViolation ? 1 : 0) +
        (hasDeptIndependenceViolation ? 1 : 0);

      // 2. Evaluate hall availability (prefer keeping current hall)
      const busyHallIds = new Set(slotExams.map((e) => e.hallId).filter(Boolean));
      const availableHalls = halls.filter(
        (h) => h.available !== false && !busyHallIds.has(h.id) && Number(h.capacity || 0) >= enrolledCount
      );
      const currentHallObj = halls.find((h) => h.id === currentHallId);
      const canKeepCurrentHall =
        Boolean(currentHallObj) &&
        currentHallObj.available !== false &&
        !busyHallIds.has(currentHallObj.id) &&
        Number(currentHallObj.capacity || 0) >= enrolledCount;

      let chosenHall = null;
      let hallChanged = false;
      let hasHallIssue = false;

      if (canKeepCurrentHall) {
        chosenHall = currentHallObj;
      } else if (availableHalls.length > 0) {
        chosenHall = [...availableHalls].sort(
          (a, b) => Number(a.capacity || 0) - Number(b.capacity || 0)
        )[0];
        hallChanged = chosenHall.id !== currentHallId;
      } else {
        hasHallIssue = true;
        chosenHall = currentHallObj || {
          id: currentHallId,
          hallNumber: targetExam.hallNumber || 'Unassigned',
        };
      }

      // 3. Evaluate invigilator availability (prefer keeping current invigilator)
      const busyInvIds = new Set(
        slotExams.map((e) => e.invigilatorId || e.facultyId).filter(Boolean)
      );
      const availableFaculty = faculty.filter(
        (f) => f.available !== false && !busyInvIds.has(f.id)
      );
      const currentFacObj = faculty.find((f) => f.id === currentInvId);
      const canKeepCurrentInv =
        Boolean(currentFacObj) &&
        currentFacObj.available !== false &&
        !busyInvIds.has(currentFacObj.id);

      let chosenFac = null;
      let invigilatorChanged = false;
      let hasInvigilatorIssue = false;

      if (canKeepCurrentInv) {
        chosenFac = currentFacObj;
      } else if (availableFaculty.length > 0) {
        chosenFac = [...availableFaculty].sort((a, b) => {
          const dutyDiff =
            (baseDutyCounts.get(a.id) || 0) - (baseDutyCounts.get(b.id) || 0);
          if (dutyDiff !== 0) return dutyDiff;
          return String(a.name || '').localeCompare(String(b.name || ''));
        })[0];
        invigilatorChanged = chosenFac.id !== currentInvId;
      } else {
        hasInvigilatorIssue = true;
        chosenFac = currentFacObj || {
          id: currentInvId,
          name: targetExam.invigilatorName || 'Unassigned',
        };
      }

      // 4. Compute disruption score (lower = better)
      const hardPenalty =
        cohortClashCount * 10000 +
        deptPolicyViolations * 10000 +
        (hasHallIssue ? 5000 : 0) +
        (hasInvigilatorIssue ? 5000 : 0);

      const softPenalty =
        (hallChanged ? 30 : 0) +
        (invigilatorChanged ? 25 : 0) +
        (sameDayLoadForCohort ? 15 : 0) +
        slotExams.length * 5 +
        dayDistance(targetExam.date, date) * 2 +
        (isOverflowDate ? 120 : 0);

      const disruptionScore = hardPenalty + softPenalty;
      const isConflictFree =
        cohortClashCount === 0 &&
        deptPolicyViolations === 0 &&
        !hasHallIssue &&
        !hasInvigilatorIssue;

      const reasons = [];
      if (cohortClashCount === 0) {
        reasons.push('Eliminates student cohort time overlap');
      } else {
        reasons.push(
          `Still overlaps with ${cohortClashCount} cohort exam${cohortClashCount === 1 ? '' : 's'}`
        );
      }

      if (!hasHallIssue) {
        reasons.push(
          hallChanged
            ? `Reassigns hall to ${chosenHall.hallNumber} (free, cap ${chosenHall.capacity})`
            : `Keeps assigned hall ${chosenHall.hallNumber}`
        );
      } else {
        reasons.push('No available hall with sufficient capacity in this slot');
      }

      if (!hasInvigilatorIssue) {
        reasons.push(
          invigilatorChanged
            ? `Reassigns invigilator to ${chosenFac.name}`
            : `Keeps assigned invigilator ${chosenFac.name}`
        );
      } else {
        reasons.push('No free invigilator available in this slot');
      }

      if (hasDeptSameDayViolation) {
        reasons.push(`Violates 1-exam-per-day rule in ${targetExam.department || 'department'}`);
      } else if (hasDeptGapViolation) {
        reasons.push(
          `Violates min ${pol.minGapDaysBetweenExams}-day department gap in ${targetExam.department || 'department'}`
        );
      } else if (hasDeptIndependenceViolation) {
        reasons.push(`Multiple departments share date ${date} (disallowed by policy)`);
      } else if (!sameDayLoadForCohort && cohortClashCount === 0) {
        reasons.push(
          pol.minGapDaysBetweenExams > 0
            ? `Maintains >= ${pol.minGapDaysBetweenExams} complete gap days within ${targetExam.department || 'department'}`
            : `Cohort has no other exam on ${date}`
        );
      } else if (sameDayLoadForCohort && cohortClashCount === 0) {
        reasons.push(`Cohort already has an exam in the other session on ${date}`);
      }

      const changesNeeded = [];
      if (hallChanged) changesNeeded.push(`Hall → ${chosenHall.hallNumber}`);
      if (invigilatorChanged) changesNeeded.push(`Invigilator → ${chosenFac.name}`);

      const impactSummary = isConflictFree
        ? changesNeeded.length === 0
          ? 'Zero conflicts · Keeps hall & invigilator'
          : `Zero conflicts · ${changesNeeded.join(' · ')}`
        : 'Partial resolution (constraints remain)';

      candidates.push({
        id: `${targetExam.examId}::${date}::${session}`,
        examId: targetExam.examId,
        subjectCode: targetExam.subjectCode,
        subjectName: targetExam.subjectName,
        department: targetExam.department,
        fromDate: targetExam.date,
        fromSession: targetExam.session,
        fromShortSession: getShortSessionLabel(targetExam.session),
        toDate: date,
        toSession: session,
        toShortSession: getShortSessionLabel(session),
        hallId: chosenHall.id,
        hallNumber: chosenHall.hallNumber,
        hallChanged,
        invigilatorId: chosenFac.id,
        invigilatorName: chosenFac.name,
        invigilatorChanged,
        cohortClashCount,
        hasDeptSameDayViolation,
        hasDeptGapViolation,
        hasDeptIndependenceViolation,
        hasHallIssue,
        hasInvigilatorIssue,
        isConflictFree,
        sameDayLoadForCohort,
        slotExamLoad: slotExams.length,
        isOverflowDate,
        disruptionScore,
        impactSummary,
        reasons,
        applyPayload: {
          date,
          session,
          hallId: chosenHall.id,
          invigilatorId: chosenFac.id,
        },
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.disruptionScore !== b.disruptionScore) {
      return a.disruptionScore - b.disruptionScore;
    }
    const dateCmp = a.toDate.localeCompare(b.toDate);
    if (dateCmp !== 0) return dateCmp;
    return getSessionSortRank(a.toSession) - getSessionSortRank(b.toSession);
  });

  return candidates.slice(0, maxSuggestions);
}

export function buildCellQuickFixPlan({
  cell,
  schedule = [],
  subjects = [],
  students = [],
  halls = [],
  faculty = [],
  departments = [],
  policy = {},
  availableDates = [],
  maxPerExam = 3,
} = {}) {
  if (!cell || !cell.isConflict || !Array.isArray(cell.exams) || cell.exams.length === 0) {
    return {
      recommended: null,
      byExamId: new Map(),
      allOptions: [],
    };
  }

  const candidateExams = [...cell.exams];
  const byExamId = new Map();
  const allOptions = [];

  for (const exam of candidateExams) {
    const suggestions = suggestQuickFixesForExam({
      targetExam: exam,
      schedule,
      subjects,
      students,
      halls,
      faculty,
      departments,
      policy,
      availableDates,
      maxSuggestions: maxPerExam,
    });
    byExamId.set(exam.examId, suggestions);
    allOptions.push(...suggestions);
  }

  allOptions.sort((a, b) => {
    if (a.disruptionScore !== b.disruptionScore) {
      return a.disruptionScore - b.disruptionScore;
    }
    return String(a.subjectCode || '').localeCompare(String(b.subjectCode || ''));
  });

  return {
    recommended: allOptions[0] || null,
    byExamId,
    allOptions,
  };
}

/**
 * Sequentially builds a non-clashing batch resolution plan across all
 * conflicting exams in a schedule (without introducing new clashes or violating date/gap rules).
 */
export function buildBatchAutoResolvePlan({
  schedule = [],
  subjects = [],
  students = [],
  halls = [],
  faculty = [],
  departments = [],
  policy = {},
  availableDates = [],
  departmentFilter = 'ALL',
} = {}) {
  const pol = normalizeSchedulingPolicy(policy);
  const initialEval = evaluateScheduleConflicts(schedule, {
    faculty,
    subjects,
    students,
    halls,
    departments,
    policy: pol,
  });

  let workingSchedule = initialEval.schedule.map((item) => ({ ...item }));
  const hallMap = new Map(halls.map((h) => [h.id, h]));
  const facMap = new Map(faculty.map((f) => [f.id, f]));

  const changes = [];
  const unresolved = [];
  const processedExamIds = new Set();

  const maxIterations = Math.max(1, workingSchedule.length * 2);
  for (let step = 0; step < maxIterations; step++) {
    const evalState = evaluateScheduleConflicts(workingSchedule, {
      faculty,
      subjects,
      students,
      halls,
      departments,
      policy: pol,
    });
    workingSchedule = evalState.schedule;

    const conflictingExams = workingSchedule.filter((item) => {
      if (processedExamIds.has(item.examId)) return false;
      if (departmentFilter !== 'ALL' && item.department !== departmentFilter) return false;
      return (
        item.hasStudentClash ||
        item.hasHallDoubleBooking ||
        item.hasInvigilatorConflict ||
        item.hasCapacityIssue ||
        item.hasDepartmentDateViolation ||
        item.hasDepartmentGapViolation ||
        item.hasDepartmentIndependenceViolation
      );
    });

    if (conflictingExams.length === 0) break;

    let bestOption = null;
    let bestExam = null;

    for (const candidateExam of conflictingExams) {
      const suggestions = suggestQuickFixesForExam({
        targetExam: candidateExam,
        schedule: workingSchedule,
        subjects,
        students,
        halls,
        faculty,
        departments,
        policy: pol,
        availableDates,
        maxSuggestions: 1,
      });
      const top = suggestions[0];
      if (!top) continue;
      if (!bestOption || top.disruptionScore < bestOption.disruptionScore) {
        bestOption = top;
        bestExam = candidateExam;
      }
    }

    if (!bestOption || !bestExam) break;
    processedExamIds.add(bestExam.examId);

    const chosenHall = hallMap.get(bestOption.hallId);
    const chosenFac = facMap.get(bestOption.invigilatorId);

    const previousValues = {
      date: bestExam.date,
      session: bestExam.session,
      hallId: bestExam.hallId,
      invigilatorId: bestExam.invigilatorId || bestExam.facultyId || '',
    };

    workingSchedule = workingSchedule.map((item) =>
      item.examId === bestExam.examId
        ? {
            ...item,
            date: bestOption.toDate,
            session: bestOption.toSession,
            hallId: bestOption.hallId,
            hallNumber: chosenHall ? chosenHall.hallNumber : bestOption.hallNumber || item.hallNumber,
            hallCapacity: chosenHall ? chosenHall.capacity : item.hallCapacity,
            invigilatorId: bestOption.invigilatorId,
            invigilatorName: chosenFac ? chosenFac.name : bestOption.invigilatorName || item.invigilatorName,
            invigilatorDept: chosenFac ? chosenFac.department : item.invigilatorDept,
          }
        : item
    );

    if (!bestOption.isConflictFree) {
      unresolved.push({
        examId: bestExam.examId,
        subjectCode: bestExam.subjectCode,
        reason: bestOption.impactSummary,
      });
    }

    changes.push({
      examId: bestExam.examId,
      subjectCode: bestExam.subjectCode,
      subjectName: bestExam.subjectName,
      department: bestExam.department,
      fromDate: bestExam.date,
      fromSession: bestExam.session,
      fromShortSession: getShortSessionLabel(bestExam.session),
      toDate: bestOption.toDate,
      toSession: bestOption.toSession,
      toShortSession: bestOption.toShortSession,
      fromHallId: bestExam.hallId,
      fromHallNumber: bestExam.hallNumber,
      toHallId: bestOption.hallId,
      toHallNumber: chosenHall ? chosenHall.hallNumber : bestOption.hallNumber,
      hallChanged: bestOption.hallChanged,
      fromInvigilatorId: previousValues.invigilatorId,
      fromInvigilatorName: bestExam.invigilatorName,
      toInvigilatorId: bestOption.invigilatorId,
      toInvigilatorName: chosenFac ? chosenFac.name : bestOption.invigilatorName,
      invigilatorChanged: bestOption.invigilatorChanged,
      isConflictFree: bestOption.isConflictFree,
      impactSummary: bestOption.impactSummary,
      applyPayload: bestOption.applyPayload,
      previousValues,
    });
  }

  const finalEval = evaluateScheduleConflicts(workingSchedule, {
    faculty,
    subjects,
    students,
    halls,
    departments,
    policy: pol,
  });

  return {
    changes,
    unresolved,
    beforeConflicts: initialEval.conflicts,
    afterConflicts: finalEval.conflicts,
    proposedSchedule: finalEval.schedule,
  };
}
