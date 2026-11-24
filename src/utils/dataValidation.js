/**
 * Pure validation, ID generation, and conflict recalculation utilities
 * shared across Firestore and Python backend persistence layers.
 */

export function generateSafeId(prefix = 'rec') {
  const cleanPrefix = String(prefix || 'rec').replace(/[^a-zA-Z0-9_-]/g, '');
  const randomPart =
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return `${cleanPrefix}-${randomPart}`;
}

export function validateUniqueName(records = [], name, label = 'Record', excludeId = null) {
  const normalized = String(name || '').trim();
  if (!normalized) {
    return { valid: false, error: `${label} name is required.` };
  }
  const lower = normalized.toLowerCase();
  const dup = records.find((r) => {
    const rId = typeof r === 'string' ? r : r?.id;
    const rName = typeof r === 'string' ? r : r?.name;
    if (excludeId && rId === excludeId) return false;
    return String(rName || '').trim().toLowerCase() === lower;
  });
  if (dup) {
    return { valid: false, error: `${label} "${normalized}" already exists.` };
  }
  return { valid: true, value: normalized };
}

export function validateUniqueSection(sections = [], department, name, excludeId = null) {
  const cleanDept = String(department || '').trim();
  const cleanName = String(name || '').trim();
  if (!cleanDept || !cleanName) {
    return { valid: false, error: 'Department and section name are required.' };
  }
  const dup = sections.find((s) => {
    if (excludeId && s.id === excludeId) return false;
    return (
      String(s.department || '').trim().toLowerCase() === cleanDept.toLowerCase() &&
      String(s.name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
  });
  if (dup) {
    return {
      valid: false,
      error: `Section "${cleanName}" already exists in ${cleanDept}.`,
    };
  }
  return { valid: true, value: cleanName };
}

export function validateUniqueSubjectCode(subjects = [], code, excludeId = null) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: 'Subject code is required.' };
  }
  const dup = subjects.find((s) => {
    if (excludeId && s.id === excludeId) return false;
    return String(s.code || '').trim().toUpperCase() === clean;
  });
  if (dup) {
    return { valid: false, error: `Subject code "${clean}" already exists.` };
  }
  return { valid: true, value: clean };
}

export function validateUniqueHallNumber(halls = [], hallNumber, excludeId = null) {
  const clean = String(hallNumber || '').trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: 'Hall number is required.' };
  }
  const dup = halls.find((h) => {
    if (excludeId && h.id === excludeId) return false;
    return String(h.hallNumber || '').trim().toUpperCase() === clean;
  });
  if (dup) {
    return { valid: false, error: `Hall "${clean}" already exists.` };
  }
  return { valid: true, value: clean };
}

export function validateUniqueFacultyId(faculty = [], employeeId, excludeId = null) {
  const clean = String(employeeId || '').trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: 'Faculty employee ID is required.' };
  }
  const dup = faculty.find((f) => {
    if (excludeId && f.id === excludeId) return false;
    return String(f.employeeId || '').trim().toUpperCase() === clean;
  });
  if (dup) {
    return { valid: false, error: `Faculty ID "${clean}" already exists.` };
  }
  return { valid: true, value: clean };
}

export function validateUniqueStudentRegNo(students = [], regNo, excludeId = null) {
  const clean = String(regNo || '').trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: 'Student registration number is required.' };
  }
  const dup = students.find((s) => {
    if (excludeId && s.id === excludeId) return false;
    return String(s.regNo || '').trim().toUpperCase() === clean;
  });
  if (dup) {
    return {
      valid: false,
      error: `Registration number "${clean}" already exists.`,
    };
  }
  return { valid: true, value: clean };
}

import { evaluateScheduleConflicts } from './conflictEvaluator.js';

export function recalculateScheduleConflicts(
  schedule = [],
  faculty = [],
  { subjects = [], students = [], halls = [], departments = [], policy = {} } = {}
) {
  return evaluateScheduleConflicts(schedule, {
    faculty,
    subjects,
    students,
    halls,
    departments,
    policy,
  });
}

