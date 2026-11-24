/**
 * Pure conflict heatmap matrix builder for visualizing overlapping exam times
 * per student cohort across chronological exam time slots.
 */

import {
  buildEnrollmentMap,
  getSharedStudentCount,
  compareExamStudentOverlap,
} from './conflictEvaluator.js';

export const SESSION_ORDER = ['FN (09:30 - 12:30)', 'AN (14:00 - 17:00)'];

export function getShortSessionLabel(session = '') {
  const trimmed = String(session || '').trim();
  if (trimmed.toUpperCase().startsWith('FN')) return 'FN';
  if (trimmed.toUpperCase().startsWith('AN')) return 'AN';
  return trimmed.split(/\s+/)[0] || 'Slot';
}

export function getSessionSortRank(session = '') {
  const short = getShortSessionLabel(session).toUpperCase();
  if (short === 'FN') return 0;
  if (short === 'AN') return 1;
  return 2;
}

export function formatShortDept(department = '') {
  const clean = String(department || '').trim();
  if (!clean) return 'GEN';
  const parenMatch = clean.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    return `${clean.split('(')[0].trim()} (${parenMatch[1].trim()})`;
  }
  return clean;
}

export function buildCohortDescriptor(item = {}, subject = null, groupBy = 'cohort') {
  const department = item.department || subject?.department || 'General';
  const batch = item.batch || subject?.batch || '';
  const semester = item.semester ?? subject?.semester ?? '';
  const section = item.section || subject?.section || '';

  if (groupBy === 'department') {
    return {
      key: department,
      department,
      batch: '',
      semester: '',
      section: '',
      label: department,
      sublabel: 'All batches & semesters',
    };
  }

  if (groupBy === 'section') {
    const parts = [
      batch ? `Batch ${batch}` : null,
      semester !== '' && semester !== null ? `Sem ${semester}` : null,
      section || null,
    ].filter(Boolean);
    const key = `${department}|${batch}|${semester}|${section}`;
    return {
      key,
      department,
      batch,
      semester,
      section,
      label: department,
      sublabel: parts.join(' · ') || 'General Cohort',
    };
  }

  // 'cohort' -> Department + Batch + Semester
  const parts = [
    batch ? `Batch ${batch}` : null,
    semester !== '' && semester !== null ? `Sem ${semester}` : null,
  ].filter(Boolean);
  const key = `${department}|${batch}|${semester}`;
  return {
    key,
    department,
    batch,
    semester,
    section: '',
    label: department,
    sublabel: parts.join(' · ') || 'General Cohort',
  };
}

export function buildConflictHeatmapMatrix({
  schedule = [],
  subjects = [],
  students = [],
  departmentFilter = 'ALL',
  groupBy = 'cohort',
} = {}) {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const enrollmentMap = buildEnrollmentMap(students);

  // 1. Collect chronological time slots across all scheduled dates (both FN and AN for every scheduled date)
  const dateSet = new Set();
  const extraSessionsByDate = new Map();

  for (const item of schedule) {
    if (!item?.date) continue;
    dateSet.add(item.date);
    if (item.session && !SESSION_ORDER.includes(item.session)) {
      if (!extraSessionsByDate.has(item.date)) extraSessionsByDate.set(item.date, new Set());
      extraSessionsByDate.get(item.date).add(item.session);
    }
  }

  const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  const slots = [];
  for (const date of sortedDates) {
    const sessions = [
      ...SESSION_ORDER,
      ...Array.from(extraSessionsByDate.get(date) || []),
    ].sort((a, b) => {
      const rankDiff = getSessionSortRank(a) - getSessionSortRank(b);
      return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
    });
    for (const session of sessions) {
      slots.push({
        slotKey: `${date}|${session}`,
        date,
        session,
        shortSession: getShortSessionLabel(session),
      });
    }
  }

  // 2. Group schedule items by slotKey for cross-cohort shared-student detection
  const itemsBySlot = new Map();
  for (const item of schedule) {
    if (!item?.date || !item?.session) continue;
    const slotKey = `${item.date}|${item.session}`;
    if (!itemsBySlot.has(slotKey)) itemsBySlot.set(slotKey, []);
    itemsBySlot.get(slotKey).push(item);
  }

  // 3. Collect cohorts and assign cells
  const cohortMap = new Map();
  const cellExamsMap = new Map(); // `${cohortKey}::${slotKey}` -> item[]

  for (const item of schedule) {
    if (!item?.date || !item?.session) continue;
    const subject = item.subjectId ? subjectMap.get(item.subjectId) : null;
    const descriptor = buildCohortDescriptor(item, subject, groupBy);

    if (departmentFilter !== 'ALL' && descriptor.department !== departmentFilter) {
      continue;
    }

    if (!cohortMap.has(descriptor.key)) {
      cohortMap.set(descriptor.key, descriptor);
    }

    const slotKey = `${item.date}|${item.session}`;
    const cellKey = `${descriptor.key}::${slotKey}`;
    if (!cellExamsMap.has(cellKey)) cellExamsMap.set(cellKey, []);
    cellExamsMap.get(cellKey).push(item);
  }

  const cohorts = Array.from(cohortMap.values()).sort((a, b) => {
    const deptCmp = a.department.localeCompare(b.department);
    if (deptCmp !== 0) return deptCmp;
    const batchCmp = String(a.batch || '').localeCompare(String(b.batch || ''));
    if (batchCmp !== 0) return batchCmp;
    const semCmp = Number(a.semester || 0) - Number(b.semester || 0);
    if (semCmp !== 0) return semCmp;
    return String(a.section || '').localeCompare(String(b.section || ''));
  });

  let conflictCellCount = 0;
  let overlappingExamCount = 0;
  let affectedCohortCount = 0;
  let maxCellCount = 0;

  const rows = cohorts.map((cohort) => {
    let rowConflictCells = 0;
    let rowExamCount = 0;

    const cells = slots.map((slot) => {
      const cellKey = `${cohort.key}::${slot.slotKey}`;
      const exams = cellExamsMap.get(cellKey) || [];
      const count = exams.length;
      rowExamCount += count;
      if (count > maxCellCount) maxCellCount = count;

      const conflictReasons = [];
      const warningReasons = [];
      let sharedStudentOverlapCount = 0;
      const peerConflictExams = [];
      let pairHardClash = false;

      if (count > 1) {
        // Check pairwise overlap inside the cell using centralized evaluator
        let anyPairClashes = false;
        for (let i = 0; i < exams.length; i++) {
          for (let j = i + 1; j < exams.length; j++) {
            const cmp = compareExamStudentOverlap(exams[i], exams[j], {
              subjectMap,
              enrollmentMap,
            });
            if (cmp.isStudentClash) {
              anyPairClashes = true;
            }
          }
        }
        // Respect explicit hasStudentClash flag or genuine evaluator clash
        const cellExplicitFlag = exams.some((e) => Boolean(e.hasStudentClash));
        if (anyPairClashes || cellExplicitFlag) {
          pairHardClash = true;
          conflictReasons.push(
            `${count} simultaneous exams scheduled for ${cohort.label}${cohort.sublabel ? ` (${cohort.sublabel})` : ''}`
          );
        } else {
          warningReasons.push(
            `${count} parallel section exams in ${cohort.label}${cohort.sublabel ? ` (${cohort.sublabel})` : ''} (disjoint students)`
          );
        }
      }

      if (count > 0) {
        const slotExams = itemsBySlot.get(slot.slotKey) || [];
        for (const exam of exams) {
          if (exam.hasStudentClash && count <= 1) {
            conflictReasons.push(
              `${exam.subjectCode || exam.subjectName} flagged with student cohort clash in this slot`
            );
          }
          for (const peer of slotExams) {
            if (peer.examId === exam.examId) continue;
            const shared = getSharedStudentCount(exam.subjectId, peer.subjectId, enrollmentMap);
            if (shared > 0) {
              sharedStudentOverlapCount += shared;
              peerConflictExams.push(peer);
              conflictReasons.push(
                `${shared} enrolled student${shared === 1 ? '' : 's'} overlap with ${peer.subjectCode || peer.subjectName}`
              );
            }
          }
        }
      }

      const uniqueReasons = Array.from(new Set(conflictReasons));
      const uniqueWarnings = Array.from(new Set(warningReasons));
      const hasFlaggedClash = exams.some((e) => Boolean(e.hasStudentClash));
      const isConflict = pairHardClash || sharedStudentOverlapCount > 0 || (count > 0 && hasFlaggedClash);
      const isWarningOnly = !isConflict && uniqueWarnings.length > 0;

      let severity = 'empty';
      if (count > 0 && !isConflict && !isWarningOnly) {
        severity = 'clear';
      } else if (isWarningOnly) {
        severity = 'warning';
      } else if (isConflict && count >= 3) {
        severity = 'critical';
      } else if (isConflict) {
        severity = 'conflict';
      }

      if (isConflict) {
        rowConflictCells += 1;
        conflictCellCount += 1;
        overlappingExamCount += Math.max(count, count + peerConflictExams.length);
      }

      return {
        cellKey,
        cohortKey: cohort.key,
        cohortLabel: cohort.label,
        cohortSublabel: cohort.sublabel,
        slotKey: slot.slotKey,
        date: slot.date,
        session: slot.session,
        shortSession: slot.shortSession,
        exams,
        peerConflictExams,
        count,
        isConflict,
        isWarningOnly,
        severity,
        conflictReasons: uniqueReasons,
        warningReasons: uniqueWarnings,
        sharedStudentOverlapCount,
        totalEnrolled: exams.reduce((sum, ex) => sum + Number(ex.enrolledCount || 0), 0),
      };
    });

    if (rowConflictCells > 0) {
      affectedCohortCount += 1;
    }

    return {
      ...cohort,
      rowConflictCells,
      rowExamCount,
      hasConflict: rowConflictCells > 0,
      cells,
    };
  });

  const availableDepartments = Array.from(
    new Set(
      schedule
        .map((item) => item.department || subjectMap.get(item.subjectId)?.department)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  return {
    slots,
    rows,
    availableDepartments,
    summary: {
      totalCohorts: rows.length,
      totalSlots: slots.length,
      conflictCellCount,
      overlappingExamCount,
      affectedCohortCount,
      maxCellCount,
    },
  };
}
