/**
 * Pure domain helpers for Single-Day Department-Wise Subject Selection.
 * Guarantees strictly one subject selected per department (no multi-select, no duplicates)
 * and enforces full department coverage before finalizing the single-day exam schedule.
 */

export function groupSubjectsByDepartment(departments = [], subjects = []) {
  const grouped = new Map();

  for (const dept of departments) {
    if (dept && !grouped.has(dept)) {
      grouped.set(dept, []);
    }
  }

  for (const sub of subjects) {
    if (!sub || !sub.department) continue;
    if (!grouped.has(sub.department)) {
      grouped.set(sub.department, []);
    }
    grouped.get(sub.department).push(sub);
  }

  return Array.from(grouped.entries()).map(([department, deptSubjects]) => ({
    department,
    subjects: [...deptSubjects].sort((a, b) =>
      String(a.code || '').localeCompare(String(b.code || ''))
    ),
  }));
}

export function selectSubjectForDepartment(
  selections = {},
  department,
  subjectId,
  subjects = []
) {
  if (!department) return { ...selections };

  const next = { ...selections };

  if (!subjectId) {
    delete next[department];
    return next;
  }

  // Enforce strictly single selection of a subject that belongs to this department
  const target = subjects.find(
    (s) => s.id === subjectId && s.department === department
  );

  if (!target) {
    return next;
  }

  // Overwrites any previous selection for this department, preventing multiple selections
  next[department] = target.id;
  return next;
}

export function buildSingleDaySelectionSummary(
  departments = [],
  subjects = [],
  selections = {}
) {
  const groups = groupSubjectsByDepartment(departments, subjects);
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));

  return groups.map(({ department, subjects: deptSubjects }) => {
    const rawSelection = selections[department];
    const selectedId = Array.isArray(rawSelection) ? null : rawSelection;
    const chosen = selectedId ? subjectsById.get(selectedId) : null;
    const isValidChoice = Boolean(chosen && chosen.department === department);

    let status = 'MISSING';
    if (deptSubjects.length === 0) {
      status = 'NO_SUBJECTS';
    } else if (isValidChoice) {
      status = 'SELECTED';
    }

    return {
      department,
      availableCount: deptSubjects.length,
      subjectId: isValidChoice ? chosen.id : null,
      subject: isValidChoice ? chosen : null,
      subjectCode: isValidChoice ? chosen.code : null,
      subjectName: isValidChoice ? chosen.name : null,
      semester: isValidChoice ? chosen.semester : null,
      batch: isValidChoice ? chosen.batch : null,
      section: isValidChoice ? chosen.section : null,
      enrolledCount: isValidChoice ? Number(chosen.enrolledCount || 0) : 0,
      status,
    };
  });
}

export function validateSingleDaySelections(
  departments = [],
  subjects = [],
  selections = {}
) {
  const summaryRows = buildSingleDaySelectionSummary(
    departments,
    subjects,
    selections
  );

  const missingDepartments = [];
  const departmentsWithoutSubjects = [];
  const invalidSelections = [];
  const selectedSubjectIds = [];
  const seenSubjectIds = new Set();
  const duplicateSubjectIds = [];

  for (const row of summaryRows) {
    const raw = selections[row.department];
    if (Array.isArray(raw)) {
      invalidSelections.push({
        department: row.department,
        reason: 'Multiple selections are not permitted within a single department.',
      });
    }

    if (row.status === 'NO_SUBJECTS') {
      departmentsWithoutSubjects.push(row.department);
    } else if (row.status === 'MISSING') {
      missingDepartments.push(row.department);
    } else if (row.subjectId) {
      if (seenSubjectIds.has(row.subjectId)) {
        duplicateSubjectIds.push(row.subjectId);
      } else {
        seenSubjectIds.add(row.subjectId);
        selectedSubjectIds.push(row.subjectId);
      }
    }
  }

  const coveredCount = summaryRows.filter((r) => r.status === 'SELECTED').length;
  const totalDepartments = summaryRows.length;
  const totalEnrolledStudents = summaryRows.reduce(
    (sum, r) => sum + r.enrolledCount,
    0
  );

  const isValid =
    totalDepartments > 0 &&
    missingDepartments.length === 0 &&
    departmentsWithoutSubjects.length === 0 &&
    invalidSelections.length === 0 &&
    duplicateSubjectIds.length === 0 &&
    coveredCount === totalDepartments;

  return {
    isValid,
    coveredCount,
    totalDepartments,
    missingDepartments,
    departmentsWithoutSubjects,
    invalidSelections,
    duplicateSubjectIds,
    selectedSubjectIds,
    totalEnrolledStudents,
    summaryRows,
  };
}

export function autoSelectFirstSubjectPerDepartment(
  departments = [],
  subjects = [],
  existingSelections = {}
) {
  const groups = groupSubjectsByDepartment(departments, subjects);
  let next = { ...existingSelections };

  for (const { department, subjects: deptSubjects } of groups) {
    const currentId = next[department];
    const currentValid = deptSubjects.some((s) => s.id === currentId);
    if (!currentValid && deptSubjects.length > 0) {
      next = selectSubjectForDepartment(
        next,
        department,
        deptSubjects[0].id,
        subjects
      );
    }
  }

  return next;
}
