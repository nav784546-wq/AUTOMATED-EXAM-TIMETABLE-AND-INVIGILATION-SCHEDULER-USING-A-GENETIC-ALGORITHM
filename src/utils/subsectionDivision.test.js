import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStudentNames,
  divideDepartmentStudents,
  validateStudentList,
  buildSubsectionCSV,
} from './subsectionDivision.js';

test('compareStudentNames sorts by first name primary and remaining names secondary', () => {
  const list = [
    { name: 'Karthik R', regNo: '103' },
    { name: 'Arun Kumar', regNo: '101' },
    { name: 'Arun Anand', regNo: '104' },
    { name: 'Divya S', regNo: '102' },
  ];
  const sorted = [...list].sort(compareStudentNames);
  assert.deepEqual(
    sorted.map((s) => s.name),
    ['Arun Anand', 'Arun Kumar', 'Divya S', 'Karthik R']
  );
  // Registration numbers stay bound to their students
  assert.deepEqual(
    sorted.map((s) => s.regNo),
    ['104', '101', '102', '103']
  );
});

test('divideDepartmentStudents divides 90 students into 3 equal subsections of 30 alphabetically', () => {
  const students = Array.from({ length: 90 }, (_, i) => ({
    id: `s-${i + 1}`,
    name: `Student ${String(90 - i).padStart(2, '0')}`,
    regNo: String(101 + i),
    department: 'BCA (AI & DS)',
    section: 'A',
  }));

  const result = divideDepartmentStudents(students, 'BCA (AI & DS)', 3);
  assert.equal(result.totalStudents, 90);
  assert.equal(result.subsections.length, 3);
  assert.equal(result.subsections[0].label, 'A');
  assert.equal(result.subsections[0].count, 30);
  assert.equal(result.subsections[1].label, 'B');
  assert.equal(result.subsections[1].count, 30);
  assert.equal(result.subsections[2].label, 'C');
  assert.equal(result.subsections[2].count, 30);

  // First student alphabetically should be Student 01
  assert.equal(result.subsections[0].students[0].name, 'Student 01');
  assert.equal(result.subsections[0].students[0].section, 'A');
  assert.equal(result.subsections[1].students[0].section, 'B');
  assert.equal(result.subsections[2].students[0].section, 'C');
});

test('validateStudentList detects duplicate and missing registration numbers', () => {
  const students = [
    { id: '1', name: 'Arun', regNo: '101' },
    { id: '2', name: 'Divya', regNo: '101' },
    { id: '3', name: 'Karthik', regNo: '' },
  ];
  const report = validateStudentList(students);
  assert.equal(report.isValid, false);
  assert.deepEqual(report.duplicateRegNos, ['101']);
  assert.deepEqual(report.missingRegNos, ['Karthik']);
});

test('buildSubsectionCSV outputs S.No., Student Name, Registration Number, Department, Subsection', () => {
  const students = [
    { id: '1', name: 'Karthik R', regNo: '103', department: 'BCA (AI & DS)', section: 'A' },
    { id: '2', name: 'Arun Kumar', regNo: '101', department: 'BCA (AI & DS)', section: 'A' },
    { id: '3', name: 'Divya S', regNo: '102', department: 'BCA (AI & DS)', section: 'A' },
  ];
  const csv = buildSubsectionCSV(students, 'BCA (AI & DS)', 'A');
  const lines = csv.replace('\uFEFF', '').split('\n');
  assert.equal(lines[0], 'S.No.,Student Name,Registration Number,Department,Subsection');
  assert.equal(lines[1], '1,Arun Kumar,101,BCA (AI & DS),A');
  assert.equal(lines[2], '2,Divya S,102,BCA (AI & DS),A');
  assert.equal(lines[3], '3,Karthik R,103,BCA (AI & DS),A');
});

