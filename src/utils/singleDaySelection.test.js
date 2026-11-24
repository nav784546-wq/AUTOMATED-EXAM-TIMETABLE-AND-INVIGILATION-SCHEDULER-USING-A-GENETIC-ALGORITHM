import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupSubjectsByDepartment,
  selectSubjectForDepartment,
  validateSingleDaySelections,
  autoSelectFirstSubjectPerDepartment,
  buildSingleDaySelectionSummary,
} from './singleDaySelection.js';
import { buildSubjectSelectionSummaryCSV } from './exportReport.js';
import { INITIAL_DEPARTMENTS, INITIAL_SUBJECTS } from './seedData.js';

test('selectSubjectForDepartment enforces strictly one subject per department and prevents cross-dept selection', () => {
  let selections = {};

  // Select sub-1 for BCA (AI & DS)
  selections = selectSubjectForDepartment(
    selections,
    'BCA (AI & DS)',
    'sub-1',
    INITIAL_SUBJECTS
  );
  assert.equal(selections['BCA (AI & DS)'], 'sub-1');

  // Selecting sub-2 in the same department replaces sub-1 (no multiple selection)
  selections = selectSubjectForDepartment(
    selections,
    'BCA (AI & DS)',
    'sub-2',
    INITIAL_SUBJECTS
  );
  assert.equal(selections['BCA (AI & DS)'], 'sub-2');
  assert.equal(Object.keys(selections).length, 1);

  // Attempting to assign a subject from another department (sub-4 belongs to BCA (DT)) is ignored
  selections = selectSubjectForDepartment(
    selections,
    'BCA (AI & DS)',
    'sub-4',
    INITIAL_SUBJECTS
  );
  assert.equal(selections['BCA (AI & DS)'], 'sub-2');
});

test('validateSingleDaySelections requires every department to have exactly one selected subject', () => {
  const partial = {
    'BCA (AI & DS)': 'sub-1',
    'BCA (DT)': 'sub-4',
  };

  const partialResult = validateSingleDaySelections(
    INITIAL_DEPARTMENTS,
    INITIAL_SUBJECTS,
    partial
  );
  assert.equal(partialResult.isValid, false);
  assert.equal(partialResult.coveredCount, 2);
  assert.equal(partialResult.totalDepartments, 6);
  assert.deepEqual(partialResult.missingDepartments, [
    'B.Sc. Computer Science (B.Sc. CSE)',
    'B.Tech',
    'EEE',
    'ECE',
  ]);

  // Reject array (multi-select) injection
  const malformedResult = validateSingleDaySelections(
    INITIAL_DEPARTMENTS,
    INITIAL_SUBJECTS,
    {
      ...partial,
      'BCA (AI & DS)': ['sub-1', 'sub-2'],
    }
  );
  assert.equal(malformedResult.isValid, false);
  assert.equal(malformedResult.invalidSelections.length, 1);

  // Full coverage across all 6 departments succeeds
  const complete = autoSelectFirstSubjectPerDepartment(
    INITIAL_DEPARTMENTS,
    INITIAL_SUBJECTS,
    partial
  );
  const validResult = validateSingleDaySelections(
    INITIAL_DEPARTMENTS,
    INITIAL_SUBJECTS,
    complete
  );
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.coveredCount, 6);
  assert.equal(validResult.missingDepartments.length, 0);
  assert.equal(validResult.selectedSubjectIds.length, 6);
});

test('groupSubjectsByDepartment lists every department including empty ones', () => {
  const groups = groupSubjectsByDepartment(
    [...INITIAL_DEPARTMENTS, 'Civil Engineering'],
    INITIAL_SUBJECTS
  );
  assert.equal(groups.length, 7);
  const civil = groups.find((g) => g.department === 'Civil Engineering');
  assert.deepEqual(civil.subjects, []);

  const validation = validateSingleDaySelections(
    [...INITIAL_DEPARTMENTS, 'Civil Engineering'],
    INITIAL_SUBJECTS,
    autoSelectFirstSubjectPerDepartment(INITIAL_DEPARTMENTS, INITIAL_SUBJECTS)
  );
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.departmentsWithoutSubjects, ['Civil Engineering']);
});

test('buildSubjectSelectionSummaryCSV exports headers, selected and pending rows with CSV escaping', () => {
  const customDepts = ['BCA (AI & DS)', 'Arts, Humanities & "Media"'];
  const customSubjects = [
    INITIAL_SUBJECTS[0],
    {
      id: 'sub-art-1',
      code: 'ART101',
      name: 'Design, Aesthetics & "Color"',
      department: 'Arts, Humanities & "Media"',
      batch: '2025',
      section: 'Section A',
      semester: 1,
      enrolledCount: 40,
    },
  ];
  const selections = {
    'Arts, Humanities & "Media"': 'sub-art-1',
  };

  const summaryRows = buildSingleDaySelectionSummary(
    customDepts,
    customSubjects,
    selections
  );
  const csv = buildSubjectSelectionSummaryCSV(summaryRows, {
    singleDayDate: '2026-11-18',
    singleDaySession: 'FN (09:30 - 12:30)',
  });

  assert.ok(csv.startsWith('\uFEFFExam Date,Session Window,Department,Subject Code,Selected Subject'));
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes('2026-11-18,FN (09:30 - 12:30),BCA (AI & DS),,No subject selected,,,,0,Pending Selection'));
  assert.ok(lines[2].includes('"Arts, Humanities & ""Media"""'));
  assert.ok(lines[2].includes('"Design, Aesthetics & ""Color"""'));
  assert.ok(lines[2].includes('Covered (1 Selected)'));
});

