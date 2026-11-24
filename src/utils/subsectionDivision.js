/**
 * Pure utilities for Department-Wise Student Division into Subsections (A, B, C, ...),
 * Alphabetical A-Z sorting (first name primary, remaining names secondary),
 * Registration number preservation & validation, and CSV export.
 */

export function compareStudentNames(a, b) {
  const nameA = String(a?.name || '').trim().replace(/\s+/g, ' ');
  const nameB = String(b?.name || '').trim().replace(/\s+/g, ' ');

  const partsA = nameA.split(' ');
  const partsB = nameB.split(' ');

  const firstA = (partsA[0] || '').toLowerCase();
  const firstB = (partsB[0] || '').toLowerCase();

  const firstCmp = firstA.localeCompare(firstB, undefined, { sensitivity: 'base' });
  if (firstCmp !== 0) return firstCmp;

  const restA = partsA.slice(1).join(' ').toLowerCase();
  const restB = partsB.slice(1).join(' ').toLowerCase();
  return restA.localeCompare(restB, undefined, { sensitivity: 'base' });
}

export function getSubsectionLabels(count) {
  const safeCount = Math.max(1, Math.min(26, Math.floor(Number(count) || 1)));
  return Array.from({ length: safeCount }, (_, i) => String.fromCharCode(65 + i));
}

export function normalizeSubsectionLabel(section) {
  const raw = String(section || '').trim();
  if (!raw) return 'A';
  const match = raw.match(/^Section\s+([A-Z])$/i);
  if (match) return match[1].toUpperCase();
  return raw.toUpperCase();
}

export function validateStudentList(students) {
  const seenRegNos = new Map();
  const seenIds = new Set();
  const duplicateRegNos = [];
  const missingRegNos = [];
  const duplicateIds = [];

  for (const stu of students) {
    if (seenIds.has(stu.id)) {
      duplicateIds.push(stu.id);
    } else {
      seenIds.add(stu.id);
    }

    const regKey = String(stu.regNo || '').trim().toUpperCase();
    if (!regKey) {
      missingRegNos.push(stu.name || stu.id);
    } else if (seenRegNos.has(regKey)) {
      duplicateRegNos.push(regKey);
    } else {
      seenRegNos.set(regKey, stu.id);
    }
  }

  return {
    isValid: duplicateRegNos.length === 0 && missingRegNos.length === 0 && duplicateIds.length === 0,
    duplicateRegNos,
    missingRegNos,
    duplicateIds,
  };
}

export function divideDepartmentStudents(students, department, subsectionCount = 3) {
  const labels = getSubsectionLabels(subsectionCount);
  const deptStudents = students.filter((s) => s.department === department);

  // Deduplicate by regNo/id while preserving valid students
  const seenReg = new Set();
  const uniqueDeptStudents = [];
  for (const stu of deptStudents) {
    const regKey = String(stu.regNo || '').trim().toUpperCase();
    if (!regKey || seenReg.has(regKey)) continue;
    seenReg.add(regKey);
    uniqueDeptStudents.push(stu);
  }

  // Sort alphabetically A-Z by full name (first name primary, remaining names secondary)
  const sorted = [...uniqueDeptStudents].sort(compareStudentNames);

  const total = sorted.length;
  const k = labels.length;
  const baseSize = Math.floor(total / k);
  const remainder = total % k;

  const subsections = [];
  const assignedStudents = [];
  let cursor = 0;

  for (let i = 0; i < k; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    const label = labels[i];
    const slice = sorted.slice(cursor, cursor + size).map((stu) => ({
      ...stu,
      section: label,
    }));
    cursor += size;

    subsections.push({
      label,
      count: slice.length,
      students: slice,
    });
    assignedStudents.push(...slice);
  }

  return {
    department,
    totalStudents: total,
    subsectionCount: k,
    subsections,
    assignedStudents,
  };
}

export function buildSubsectionCSV(students, department, subsectionLabel = 'ALL') {
  const headers = ['S.No.', 'Student Name', 'Registration Number', 'Department', 'Subsection'];

  const escapeCell = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const filtered = students
    .filter((s) => s.department === department)
    .filter((s) =>
      subsectionLabel === 'ALL'
        ? true
        : normalizeSubsectionLabel(s.section) === normalizeSubsectionLabel(subsectionLabel)
    )
    .sort((a, b) => {
      const secA = normalizeSubsectionLabel(a.section);
      const secB = normalizeSubsectionLabel(b.section);
      if (secA !== secB) return secA.localeCompare(secB);
      return compareStudentNames(a, b);
    });

  const rows = filtered.map((stu, idx) =>
    [
      idx + 1,
      stu.name,
      stu.regNo,
      stu.department,
      normalizeSubsectionLabel(stu.section),
    ]
      .map(escapeCell)
      .join(',')
  );

  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}

