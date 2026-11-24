/**
 * Single Source of Truth for Examination Schedule & Department Date Conflict Evaluation.
 *
 * Used across:
 *  - Genetic Algorithm fitness evaluation (geneticAlgorithm.js)
 *  - Post-edit conflict recalculation (dataValidation.js)
 *  - Conflict Heatmap matrix (conflictHeatmap.js)
 *  - Quick Fix & Batch Auto-Resolve planner (conflictQuickFix.js)
 *  - Conflict Report, Exam Scheduler Preview & Overview Schedule Integrity KPI
 *
 * Key invariants:
 *  1. One Examination Per Day Per Department (unless allowSameDayFnAnPerDept or oneExamPerDeptPerDay=false).
 *  2. Minimum N Complete Calendar Days Gap between consecutive exams of the same department
 *     (|D_{i+1} - D_i| >= minGapDaysBetweenExams + 1; default minGapDaysBetweenExams = 2 => diff >= 3).
 *  3. Department-Wise Independent Scheduling: distinct departments can share dates unless
 *     allowMultipleDeptsSameDate=false, subject to hall, invigilator, and student enrollment checks.
 *  4. Actual student clashes require overlapping student enrollment records (enrolledSubjectIds)
 *     or matching cohort constraints (department + batch + semester + overlapping section).
 */

export const DEFAULT_SCHEDULING_POLICY = {
  oneExamPerDeptPerDay: true,
  minGapDaysBetweenExams: 2,
  independentDeptScheduling: true,
  allowSameDayFnAnPerDept: false,
  allowMultipleDeptsSameDate: true,
};

export function normalizeSchedulingPolicy(policy = {}) {
  const src = policy && typeof policy === 'object' ? policy : {};

  const pickBool = (camel, snake, fallback) => {
    if (src[camel] !== undefined && src[camel] !== null) return Boolean(src[camel]);
    if (src[snake] !== undefined && src[snake] !== null) return Boolean(src[snake]);
    return fallback;
  };

  const rawGap =
    src.minGapDaysBetweenExams !== undefined
      ? src.minGapDaysBetweenExams
      : src.min_gap_days_between_exams;
  const parsedGap = Number(rawGap);
  const minGapDaysBetweenExams = Number.isFinite(parsedGap)
    ? Math.max(0, Math.min(14, Math.floor(parsedGap)))
    : DEFAULT_SCHEDULING_POLICY.minGapDaysBetweenExams;

  return {
    oneExamPerDeptPerDay: pickBool(
      'oneExamPerDeptPerDay',
      'one_exam_per_dept_per_day',
      DEFAULT_SCHEDULING_POLICY.oneExamPerDeptPerDay
    ),
    minGapDaysBetweenExams,
    independentDeptScheduling: pickBool(
      'independentDeptScheduling',
      'independent_dept_scheduling',
      DEFAULT_SCHEDULING_POLICY.independentDeptScheduling
    ),
    allowSameDayFnAnPerDept: pickBool(
      'allowSameDayFnAnPerDept',
      'allow_same_day_fn_an_per_dept',
      DEFAULT_SCHEDULING_POLICY.allowSameDayFnAnPerDept
    ),
    allowMultipleDeptsSameDate: pickBool(
      'allowMultipleDeptsSameDate',
      'allow_multiple_depts_same_date',
      DEFAULT_SCHEDULING_POLICY.allowMultipleDeptsSameDate
    ),
  };
}

export function parseExamDate(dateVal) {
  if (dateVal && typeof dateVal === 'object') {
    let dt = null;
    if (typeof dateVal.toDate === 'function') {
      try {
        dt = dateVal.toDate();
      } catch {
        dt = null;
      }
    } else if (dateVal instanceof Date) {
      dt = dateVal;
    } else if (Number.isFinite(dateVal.seconds) || Number.isFinite(dateVal._seconds)) {
      const secs = Number.isFinite(dateVal.seconds) ? dateVal.seconds : dateVal._seconds;
      dt = new Date(secs * 1000);
    }
    if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return { iso: `${y}-${m}-${d}`, ms: Date.UTC(y, dt.getUTCMonth(), dt.getUTCDate()) };
    }
    return null;
  }

  const raw = String(dateVal ?? '').trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
    const dt = new Date(ms);
    if (
      dt.getUTCFullYear() === Number(y) &&
      dt.getUTCMonth() === Number(m) - 1 &&
      dt.getUTCDate() === Number(d)
    ) {
      return { iso: `${y}-${m}-${d}`, ms };
    }
    return null;
  }
  const dmyMatch = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
    const dt = new Date(ms);
    if (
      dt.getUTCFullYear() === Number(y) &&
      dt.getUTCMonth() === Number(m) - 1 &&
      dt.getUTCDate() === Number(d)
    ) {
      return { iso: `${y}-${m}-${d}`, ms };
    }
  }
  return null;
}

export function formatDisplayDate(dateVal) {
  const parsed = parseExamDate(dateVal);
  if (!parsed) return String(dateVal ?? '').trim();
  const [y, m, d] = parsed.iso.split('-');
  return `${d}.${m}.${y}`;
}

function shortSessionLabel(session = '') {
  const s = String(session || '').trim().toUpperCase();
  if (s.startsWith('FN')) return 'FN';
  if (s.startsWith('AN')) return 'AN';
  return s.split(/\s+/)[0] || 'SLOT';
}

function sessionRank(session = '') {
  const short = shortSessionLabel(session);
  if (short === 'FN') return 0;
  if (short === 'AN') return 1;
  return 2;
}

function buildDepartmentLookup(departments = []) {
  const byId = new Map();
  const byName = new Map();
  for (const d of departments || []) {
    if (d && typeof d === 'object') {
      const id = String(d.id || '').trim();
      const name = String(d.name || '').trim();
      if (id && name) {
        const entry = { key: id.toLowerCase(), display: name };
        byId.set(id.toLowerCase(), entry);
        byName.set(name.toLowerCase(), entry);
      } else if (name) {
        const entry = { key: name.toLowerCase(), display: name };
        byName.set(name.toLowerCase(), entry);
      }
    } else if (typeof d === 'string' && d.trim()) {
      const name = d.trim();
      byName.set(name.toLowerCase(), { key: name.toLowerCase(), display: name });
    }
  }
  return { byId, byName };
}

export function resolveDepartmentIdentity(
  item = {},
  departments = [],
  subjectMap = null,
  lookupCache = null
) {
  const { byId, byName } = lookupCache || buildDepartmentLookup(departments);
  const sub = item?.subjectId && subjectMap ? subjectMap.get(item.subjectId) : null;
  const deptId = String(item?.departmentId || sub?.departmentId || '').trim();
  const deptName = String(item?.department || sub?.department || '').trim();

  if (deptId && byId.has(deptId.toLowerCase())) {
    const found = byId.get(deptId.toLowerCase());
    return { key: found.key, display: deptName || found.display };
  }
  if (deptName && byName.has(deptName.toLowerCase())) {
    return byName.get(deptName.toLowerCase());
  }
  if (deptId) {
    return { key: deptId.toLowerCase(), display: deptName || deptId };
  }
  if (deptName) {
    return { key: deptName.toLowerCase(), display: deptName };
  }
  return { key: 'general', display: 'General' };
}

function formatSubjectLabel(item = {}, subjectMap = null) {
  const sub = item?.subjectId && subjectMap ? subjectMap.get(item.subjectId) : null;
  const name = String(item?.subjectName || sub?.name || '').trim();
  const code = String(item?.subjectCode || sub?.code || '').trim();
  if (name && code) return `${name} (${code})`;
  return name || code || String(item?.examId || 'Exam');
}

function examUid(item, fallbackIdx) {
  return String(item?.examId || item?.id || item?.subjectId || `idx-${fallbackIdx}`);
}

export function buildEnrollmentMap(students = []) {
  const map = new Map();
  for (const student of students) {
    if (!student) continue;
    const studentKey = student.id || student.regNo;
    if (!studentKey) continue;
    const enrolled = Array.isArray(student.enrolledSubjectIds)
      ? student.enrolledSubjectIds
      : [];
    for (const subId of enrolled) {
      if (!subId) continue;
      if (!map.has(subId)) map.set(subId, new Set());
      map.get(subId).add(studentKey);
    }
  }
  return map;
}

export function getSharedStudentCount(subjectIdA, subjectIdB, enrollmentMap) {
  if (!subjectIdA || !subjectIdB || subjectIdA === subjectIdB || !enrollmentMap) {
    return 0;
  }
  const setA = enrollmentMap.get(subjectIdA);
  const setB = enrollmentMap.get(subjectIdB);
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;

  // Iterate smaller set for O(min(|A|, |B|)) performance
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let count = 0;
  for (const stuKey of smaller) {
    if (larger.has(stuKey)) count += 1;
  }
  return count;
}

function normalizeStr(val) {
  return String(val ?? '').trim();
}

function normalizeLower(val) {
  return normalizeStr(val).toLowerCase();
}

function normalizeSectionToken(sec) {
  const clean = normalizeLower(sec);
  if (!clean) return '';
  return clean.replace(/^section\s+/i, '').trim();
}

/**
 * Evaluates whether two exam items (or subject descriptors) in the SAME
 * (date, session) time slot have a genuine student clash vs. a soft
 * department-level parallel scheduling warning.
 */
export function compareExamStudentOverlap(
  examA,
  examB,
  { subjectMap = null, enrollmentMap = null, departments = [], deptLookup = null } = {}
) {
  if (!examA || !examB) {
    return { isStudentClash: false, isDepartmentWarning: false, sharedStudentCount: 0, reason: '' };
  }
  const idA = examA.examId || examA.id;
  const idB = examB.examId || examB.id;
  if (idA && idB && idA === idB) {
    return { isStudentClash: false, isDepartmentWarning: false, sharedStudentCount: 0, reason: '' };
  }

  const subIdA = examA.subjectId || (examA.code ? examA.id : null);
  const subIdB = examB.subjectId || (examB.code ? examB.id : null);
  const subA = subIdA && subjectMap ? subjectMap.get(subIdA) : null;
  const subB = subIdB && subjectMap ? subjectMap.get(subIdB) : null;

  const sharedStudentCount = getSharedStudentCount(subIdA, subIdB, enrollmentMap);
  if (sharedStudentCount > 0) {
    return {
      isStudentClash: true,
      isDepartmentWarning: false,
      sharedStudentCount,
      reason: `${sharedStudentCount} enrolled student${sharedStudentCount === 1 ? '' : 's'} overlap`,
    };
  }

  const lookup = deptLookup || buildDepartmentLookup(departments);
  const deptA = resolveDepartmentIdentity(examA, departments, subjectMap, lookup).key;
  const deptB = resolveDepartmentIdentity(examB, departments, subjectMap, lookup).key;

  if (!deptA || !deptB || deptA !== deptB) {
    return { isStudentClash: false, isDepartmentWarning: false, sharedStudentCount: 0, reason: '' };
  }

  const batchA = normalizeLower(examA.batch || subA?.batch);
  const batchB = normalizeLower(examB.batch || subB?.batch);
  const semA = normalizeStr(examA.semester ?? subA?.semester);
  const semB = normalizeStr(examB.semester ?? subB?.semester);
  const secA = normalizeSectionToken(examA.section || subA?.section);
  const secB = normalizeSectionToken(examB.section || subB?.section);

  const batchCompatible = !batchA || !batchB || batchA === batchB;
  const semCompatible = !semA || !semB || semA === semB;
  const secCompatible = !secA || !secB || secA === secB;

  if (batchCompatible && semCompatible && secCompatible) {
    return {
      isStudentClash: true,
      isDepartmentWarning: false,
      sharedStudentCount: 0,
      reason: 'Same department cohort & section overlap',
    };
  }

  // Same department at the same time, but disjoint batches, semesters, or sections
  return {
    isStudentClash: false,
    isDepartmentWarning: true,
    sharedStudentCount: 0,
    reason: 'Same department scheduled in parallel (disjoint cohorts)',
  };
}

export function validateOneExamPerDepartmentPerDay(
  schedule = [],
  { departments = [], subjects = [], policy = {} } = {}
) {
  const pol = normalizeSchedulingPolicy(policy);
  const subjectMap = new Map((subjects || []).filter((s) => s?.id).map((s) => [s.id, s]));
  const lookup = buildDepartmentLookup(departments);

  if (!pol.oneExamPerDeptPerDay || pol.allowSameDayFnAnPerDept) {
    return {
      valid: true,
      enabled: false,
      violations: [],
      violatingExamIds: [],
      count: 0,
    };
  }

  const grouped = new Map();
  for (let idx = 0; idx < (schedule || []).length; idx++) {
    const item = schedule[idx];
    if (!item || typeof item !== 'object') continue;
    const parsed = parseExamDate(item.date);
    if (!parsed) continue;
    const dept = resolveDepartmentIdentity(item, departments, subjectMap, lookup);
    const groupKey = `${dept.key}::${parsed.iso}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push({ idx, item, dept, parsed });
  }

  const violations = [];
  const violatingExamIds = new Set();

  const sortedEntries = Array.from(grouped.values()).sort((a, b) =>
    a[0].parsed.iso.localeCompare(b[0].parsed.iso)
  );

  for (const entries of sortedEntries) {
    if (entries.length <= 1) continue;
    entries.sort((a, b) => {
      const rDiff = sessionRank(a.item.session) - sessionRank(b.item.session);
      if (rDiff !== 0) return rDiff;
      return examUid(a.item, a.idx).localeCompare(examUid(b.item, b.idx));
    });

    const deptDisplay = entries[0].dept.display;
    const dateFmt = formatDisplayDate(entries[0].parsed.iso);
    const isoDate = entries[0].parsed.iso;

    for (const entry of entries) {
      violatingExamIds.add(examUid(entry.item, entry.idx));
    }

    for (let i = 0; i < entries.length - 1; i++) {
      const a = entries[i];
      const b = entries[i + 1];
      const subA = formatSubjectLabel(a.item, subjectMap);
      const subB = formatSubjectLabel(b.item, subjectMap);
      const sessA = shortSessionLabel(a.item.session);
      const sessB = shortSessionLabel(b.item.session);

      violations.push({
        type: 'ONE_EXAM_PER_DAY',
        departmentKey: a.dept.key,
        department: deptDisplay,
        date: isoDate,
        displayDate: dateFmt,
        examIds: [examUid(a.item, a.idx), examUid(b.item, b.idx)],
        subjects: [subA, subB],
        sessions: [sessA, sessB],
        message: `Invalid Schedule: ${deptDisplay} has ${subA} (${sessA}) and ${subB} (${sessB}) on ${dateFmt}. Only one examination per day per department is allowed.`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    enabled: true,
    violations,
    violatingExamIds: Array.from(violatingExamIds).sort(),
    count: violations.length,
  };
}

export function validateMinimumExamGap(
  schedule = [],
  { departments = [], subjects = [], policy = {} } = {}
) {
  const pol = normalizeSchedulingPolicy(policy);
  const minGap = pol.minGapDaysBetweenExams;
  const minDayDiff = minGap + 1;
  const subjectMap = new Map((subjects || []).filter((s) => s?.id).map((s) => [s.id, s]));
  const lookup = buildDepartmentLookup(departments);

  const byDept = new Map();
  for (let idx = 0; idx < (schedule || []).length; idx++) {
    const item = schedule[idx];
    if (!item || typeof item !== 'object') continue;
    const parsed = parseExamDate(item.date);
    if (!parsed) continue;
    const dept = resolveDepartmentIdentity(item, departments, subjectMap, lookup);
    if (!byDept.has(dept.key)) byDept.set(dept.key, []);
    byDept.get(dept.key).push({ idx, item, dept, parsed });
  }

  const violations = [];
  const violatingExamIds = new Set();
  const departmentTimelines = {};

  const sortedDeptLists = Array.from(byDept.values()).sort((a, b) =>
    a[0].dept.display.localeCompare(b[0].dept.display)
  );

  for (const entries of sortedDeptLists) {
    entries.sort((a, b) => {
      if (a.parsed.ms !== b.parsed.ms) return a.parsed.ms - b.parsed.ms;
      const rDiff = sessionRank(a.item.session) - sessionRank(b.item.session);
      if (rDiff !== 0) return rDiff;
      return examUid(a.item, a.idx).localeCompare(examUid(b.item, b.idx));
    });

    const deptDisplay = entries[0].dept.display;
    const timeline = [];

    for (let i = 0; i < entries.length; i++) {
      const curr = entries[i];
      let completeGapDaysFromPrev = null;
      let dayDiffFromPrev = null;
      let gapValid = true;

      if (i > 0) {
        const prev = entries[i - 1];
        dayDiffFromPrev = Math.round((curr.parsed.ms - prev.parsed.ms) / 86400000);
        completeGapDaysFromPrev = dayDiffFromPrev > 0 ? Math.max(0, dayDiffFromPrev - 1) : 0;

        if (minGap > 0 && dayDiffFromPrev > 0 && dayDiffFromPrev < minDayDiff) {
          gapValid = false;
          const eidPrev = examUid(prev.item, prev.idx);
          const eidCurr = examUid(curr.item, curr.idx);
          violatingExamIds.add(eidPrev);
          violatingExamIds.add(eidCurr);

          const subA = formatSubjectLabel(prev.item, subjectMap);
          const subB = formatSubjectLabel(curr.item, subjectMap);
          const d1Fmt = formatDisplayDate(prev.parsed.iso);
          const d2Fmt = formatDisplayDate(curr.parsed.iso);
          const reqPhrase =
            minGap === 2
              ? 'A minimum of two complete days between examinations is required.'
              : `A minimum of ${minGap} complete day${minGap === 1 ? '' : 's'} between examinations is required.`;

          violations.push({
            type: 'MINIMUM_GAP',
            departmentKey: curr.dept.key,
            department: deptDisplay,
            examIds: [eidPrev, eidCurr],
            subjects: [subA, subB],
            dates: [prev.parsed.iso, curr.parsed.iso],
            displayDates: [d1Fmt, d2Fmt],
            actualCompleteGapDays: completeGapDaysFromPrev,
            requiredCompleteGapDays: minGap,
            message: `Invalid Schedule: ${deptDisplay} has ${subA} on ${d1Fmt} and ${subB} on ${d2Fmt}. ${reqPhrase}`,
          });
        }
      }

      const sub = curr.item.subjectId ? subjectMap.get(curr.item.subjectId) : null;
      timeline.push({
        examId: examUid(curr.item, curr.idx),
        subjectCode: curr.item.subjectCode || sub?.code || '',
        subjectName: curr.item.subjectName || sub?.name || '',
        date: curr.parsed.iso,
        displayDate: formatDisplayDate(curr.parsed.iso),
        session: curr.item.session,
        shortSession: shortSessionLabel(curr.item.session),
        completeGapDaysFromPrev,
        dayDiffFromPrev,
        gapValid,
      });
    }

    departmentTimelines[deptDisplay] = timeline;
  }

  return {
    valid: violations.length === 0,
    requiredGapDays: minGap,
    violations,
    violatingExamIds: Array.from(violatingExamIds).sort(),
    count: violations.length,
    departmentTimelines,
  };
}

export function validateDepartmentIndependence(
  schedule = [],
  { departments = [], subjects = [], policy = {} } = {}
) {
  const pol = normalizeSchedulingPolicy(policy);
  const subjectMap = new Map((subjects || []).filter((s) => s?.id).map((s) => [s.id, s]));
  const lookup = buildDepartmentLookup(departments);

  const deptsByDate = new Map();
  const itemsByDate = new Map();

  for (let idx = 0; idx < (schedule || []).length; idx++) {
    const item = schedule[idx];
    if (!item || typeof item !== 'object') continue;
    const parsed = parseExamDate(item.date);
    if (!parsed) continue;
    const dept = resolveDepartmentIdentity(item, departments, subjectMap, lookup);
    if (!deptsByDate.has(parsed.iso)) deptsByDate.set(parsed.iso, new Map());
    deptsByDate.get(parsed.iso).set(dept.key, dept.display);
    if (!itemsByDate.has(parsed.iso)) itemsByDate.set(parsed.iso, []);
    itemsByDate.get(parsed.iso).push({ idx, item });
  }

  const sharedDates = Array.from(deptsByDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([, map]) => map.size > 1)
    .map(([iso, map]) => ({
      date: iso,
      displayDate: formatDisplayDate(iso),
      departments: Array.from(map.values()).sort(),
      departmentCount: map.size,
    }));

  if (pol.allowMultipleDeptsSameDate) {
    return {
      valid: true,
      independentDeptScheduling: pol.independentDeptScheduling,
      allowMultipleDeptsSameDate: true,
      sharedDates,
      violations: [],
      violatingExamIds: [],
      count: 0,
    };
  }

  const violations = [];
  const violatingExamIds = new Set();

  for (const entry of sharedDates) {
    for (const { idx, item } of itemsByDate.get(entry.date) || []) {
      violatingExamIds.add(examUid(item, idx));
    }
    violations.push({
      type: 'MULTIPLE_DEPARTMENTS_SAME_DATE',
      date: entry.date,
      displayDate: entry.displayDate,
      departments: entry.departments,
      message: `Invalid Schedule: Multiple departments (${entry.departments.join(', ')}) are scheduled on ${entry.displayDate}, which is disallowed by policy.`,
    });
  }

  return {
    valid: violations.length === 0,
    independentDeptScheduling: pol.independentDeptScheduling,
    allowMultipleDeptsSameDate: false,
    sharedDates,
    violations,
    violatingExamIds: Array.from(violatingExamIds).sort(),
    count: violations.length,
  };
}

export function validateCompleteExamTimetable(
  schedule = [],
  { departments = [], subjects = [], students = [], halls = [], faculty = [], policy = {} } = {}
) {
  const pol = normalizeSchedulingPolicy(policy);
  const oneExamPerDay = validateOneExamPerDepartmentPerDay(schedule, {
    departments,
    subjects,
    policy: pol,
  });
  const minimumExamGap = validateMinimumExamGap(schedule, {
    departments,
    subjects,
    policy: pol,
  });
  const departmentIndependence = validateDepartmentIndependence(schedule, {
    departments,
    subjects,
    policy: pol,
  });

  const evaluated = evaluateScheduleConflicts(schedule, {
    faculty,
    subjects,
    students,
    halls,
    departments,
    policy: pol,
  });

  const resourceViolations = [];
  if (evaluated.conflicts.studentClashes > 0) {
    resourceViolations.push({
      type: 'STUDENT_CLASH',
      count: evaluated.conflicts.studentClashes,
      message: `Invalid Schedule: ${evaluated.conflicts.studentClashes} exam slot(s) have student cohort or enrollment overlaps.`,
    });
  }
  if (evaluated.conflicts.hallDoubleBookings > 0) {
    resourceViolations.push({
      type: 'HALL_DOUBLE_BOOKING',
      count: evaluated.conflicts.hallDoubleBookings,
      message: `Invalid Schedule: ${evaluated.conflicts.hallDoubleBookings} exam slot(s) have double-booked examination halls.`,
    });
  }
  if (evaluated.conflicts.capacityViolations > 0) {
    resourceViolations.push({
      type: 'CAPACITY_VIOLATION',
      count: evaluated.conflicts.capacityViolations,
      message: `Invalid Schedule: ${evaluated.conflicts.capacityViolations} exam slot(s) exceed hall capacity or use an unavailable hall.`,
    });
  }
  if (evaluated.conflicts.invigilatorConflicts > 0) {
    resourceViolations.push({
      type: 'INVIGILATOR_CONFLICT',
      count: evaluated.conflicts.invigilatorConflicts,
      message: `Invalid Schedule: ${evaluated.conflicts.invigilatorConflicts} exam slot(s) have invigilator double-bookings or unavailable faculty.`,
    });
  }

  const violations = [
    ...oneExamPerDay.violations,
    ...minimumExamGap.violations,
    ...departmentIndependence.violations,
    ...resourceViolations,
  ];
  const warnings = violations.map((v) => v.message).filter(Boolean);
  const violatingExamIds = Array.from(
    new Set([
      ...oneExamPerDay.violatingExamIds,
      ...minimumExamGap.violatingExamIds,
      ...departmentIndependence.violatingExamIds,
      ...evaluated.schedule
        .filter(
          (item) =>
            item.hasStudentClash ||
            item.hasInvigilatorConflict ||
            item.hasCapacityIssue ||
            item.hasHallDoubleBooking
        )
        .map((item, idx) => examUid(item, idx)),
    ])
  ).sort();

  const isValid = violations.length === 0;

  return {
    isValid,
    canFinalize: isValid,
    policy: pol,
    oneExamPerDay,
    minimumExamGap,
    departmentIndependence,
    violations,
    warnings,
    violatingExamIds,
    departmentTimelines: minimumExamGap.departmentTimelines,
    conflicts: evaluated.conflicts,
    schedule: evaluated.schedule,
  };
}

export function computeWorkloadStdDev(schedule = [], faculty = []) {
  const dutyCount = new Map();
  for (const item of schedule) {
    const invId = item?.invigilatorId || item?.facultyId;
    if (invId) {
      dutyCount.set(invId, (dutyCount.get(invId) || 0) + 1);
    }
  }

  const availableFaculty = faculty.filter((f) => f?.available !== false);
  const pool = availableFaculty.length > 0 ? availableFaculty : faculty;
  if (pool.length === 0) {
    const counts = Array.from(dutyCount.values());
    if (counts.length === 0) return 0;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / counts.length;
    return Number(Math.sqrt(variance).toFixed(2));
  }

  const counts = pool.map((f) => dutyCount.get(f.id) || 0);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / counts.length;
  return Number(Math.sqrt(variance).toFixed(2));
}

/**
 * Authoritative conflict evaluation for a full examination schedule.
 * Returns enriched schedule items with conflict booleans & soft warnings,
 * plus the consolidated conflicts summary object.
 */
export function evaluateScheduleConflicts(
  schedule = [],
  { faculty = [], subjects = [], students = [], halls = [], departments = [], policy = {} } = {}
) {
  const pol = normalizeSchedulingPolicy(policy);
  const facMap = new Map(faculty.map((f) => [f.id, f]));
  const hallMap = new Map(halls.map((h) => [h.id, h]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const deptLookup = buildDepartmentLookup(departments);
  const enrollmentMap = buildEnrollmentMap(students);

  const hallSlotCounts = new Map();
  const invSlotCounts = new Map();
  const facultyDutyCount = new Map();
  const itemsBySlot = new Map();

  for (let idx = 0; idx < schedule.length; idx++) {
    const item = schedule[idx];
    const slot = `${item.date || ''}|${item.session || ''}`;
    if (!itemsBySlot.has(slot)) itemsBySlot.set(slot, []);
    itemsBySlot.get(slot).push({ item, idx });

    if (item.hallId) {
      const hKey = `${slot}|${item.hallId}`;
      hallSlotCounts.set(hKey, (hallSlotCounts.get(hKey) || 0) + 1);
    }

    const invId = item.invigilatorId || item.facultyId;
    if (invId) {
      const iKey = `${slot}|${invId}`;
      invSlotCounts.set(iKey, (invSlotCounts.get(iKey) || 0) + 1);
      facultyDutyCount.set(invId, (facultyDutyCount.get(invId) || 0) + 1);
    }
  }

  // Pairwise check within each time slot for student clashes & department warnings
  const studentClashByIdx = new Array(schedule.length).fill(false);
  const deptWarningByIdx = new Array(schedule.length).fill(false);
  const clashPeersByIdx = Array.from({ length: schedule.length }, () => []);

  for (const slotEntries of itemsBySlot.values()) {
    for (let a = 0; a < slotEntries.length; a++) {
      for (let b = a + 1; b < slotEntries.length; b++) {
        const entryA = slotEntries[a];
        const entryB = slotEntries[b];
        const overlap = compareExamStudentOverlap(entryA.item, entryB.item, {
          subjectMap,
          enrollmentMap,
          departments,
          deptLookup,
        });
        if (overlap.isStudentClash) {
          studentClashByIdx[entryA.idx] = true;
          studentClashByIdx[entryB.idx] = true;
          clashPeersByIdx[entryA.idx].push({
            examId: entryB.item.examId,
            subjectCode: entryB.item.subjectCode,
            reason: overlap.reason,
          });
          clashPeersByIdx[entryB.idx].push({
            examId: entryA.item.examId,
            subjectCode: entryA.item.subjectCode,
            reason: overlap.reason,
          });
        } else if (overlap.isDepartmentWarning) {
          deptWarningByIdx[entryA.idx] = true;
          deptWarningByIdx[entryB.idx] = true;
        }
      }
    }
  }

  const onePerDayRes = validateOneExamPerDepartmentPerDay(schedule, {
    departments,
    subjects,
    policy: pol,
  });
  const minGapRes = validateMinimumExamGap(schedule, {
    departments,
    subjects,
    policy: pol,
  });
  const indepRes = validateDepartmentIndependence(schedule, {
    departments,
    subjects,
    policy: pol,
  });

  const sameDaySet = new Set(onePerDayRes.violatingExamIds);
  const gapSet = new Set(minGapRes.violatingExamIds);
  const indepSet = new Set(indepRes.violatingExamIds);

  let studentClashes = 0;
  let invigilatorConflicts = 0;
  let capacityViolations = 0;
  let hallDoubleBookings = 0;
  let departmentWarnings = 0;
  let totalEnrolled = 0;
  let totalCapacity = 0;

  const updatedSchedule = schedule.map((item, idx) => {
    const slot = `${item.date || ''}|${item.session || ''}`;
    const invId = item.invigilatorId || item.facultyId;
    const fac = facMap.get(invId);
    const hall = hallMap.get(item.hallId);
    const uid = examUid(item, idx);

    const enrolled = Number(item.enrolledCount ?? subjectMap.get(item.subjectId)?.enrolledCount ?? 0);
    const capacity = Number(item.hallCapacity ?? hall?.capacity ?? 0);

    const hasStudentClash = studentClashByIdx[idx];
    const hasDepartmentWarning = !hasStudentClash && deptWarningByIdx[idx];
    const hasHallDoubleBooking = Boolean(
      item.hallId && (hallSlotCounts.get(`${slot}|${item.hallId}`) || 0) > 1
    );
    const hasCapacityIssue =
      (capacity > 0 && enrolled > capacity) || Boolean(hall && hall.available === false);
    const hasInvigilatorConflict = Boolean(
      (invId && (invSlotCounts.get(`${slot}|${invId}`) || 0) > 1) ||
        (fac && fac.available === false)
    );
    const hasDepartmentDateViolation = sameDaySet.has(uid);
    const hasDepartmentGapViolation = gapSet.has(uid);
    const hasDepartmentIndependenceViolation = indepSet.has(uid);

    if (hasStudentClash) studentClashes += 1;
    if (hasDepartmentWarning) departmentWarnings += 1;
    if (hasInvigilatorConflict) invigilatorConflicts += 1;
    if (hasCapacityIssue) capacityViolations += 1;
    if (hasHallDoubleBooking) hallDoubleBookings += 1;

    totalEnrolled += enrolled;
    totalCapacity += capacity;

    return {
      ...item,
      hasStudentClash,
      hasDepartmentWarning,
      hasInvigilatorConflict,
      hasCapacityIssue,
      hasHallDoubleBooking,
      hasDepartmentDateViolation,
      hasDepartmentGapViolation,
      hasDepartmentIndependenceViolation,
      clashPeers: clashPeersByIdx[idx],
    };
  });

  const departmentSameDayViolations = onePerDayRes.count;
  const departmentGapViolations = minGapRes.count;
  const departmentIndependenceViolations = indepRes.count;
  const validationWarnings = [
    ...onePerDayRes.violations.map((v) => v.message),
    ...minGapRes.violations.map((v) => v.message),
    ...indepRes.violations.map((v) => v.message),
  ];

  const totalHardViolations =
    studentClashes +
    invigilatorConflicts +
    capacityViolations +
    hallDoubleBookings +
    departmentSameDayViolations +
    departmentGapViolations +
    departmentIndependenceViolations;

  const utilizationRate =
    totalCapacity > 0
      ? Number(Math.min(100, (totalEnrolled / totalCapacity) * 100).toFixed(1))
      : 0;

  const workloadStdDev = computeWorkloadStdDev(schedule, faculty);

  return {
    schedule: updatedSchedule,
    conflicts: {
      studentClashes,
      invigilatorConflicts,
      capacityViolations,
      hallDoubleBookings,
      departmentWarnings,
      departmentSameDayViolations,
      departmentGapViolations,
      departmentIndependenceViolations,
      validationWarnings,
      departmentTimelines: minGapRes.departmentTimelines,
      totalHardViolations,
      utilizationRate,
      workloadStdDev,
    },
  };
}
