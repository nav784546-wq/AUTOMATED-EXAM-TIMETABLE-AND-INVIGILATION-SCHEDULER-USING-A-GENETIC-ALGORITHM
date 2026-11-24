import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateExamHalls,
  buildCombinedHallReportRows,
  buildDepartmentWiseHallReportRows,
  buildIndividualStudentHallRows,
  generateSeatingPlan,
  lookupStudentHallAllocation,
  validateHallAllocationPlan,
} from './seatingAllocator.js';
import { INITIAL_HALLS, INITIAL_STUDENTS } from './seedData.js';

function makeStudents(dept, count, prefix = '', options = {}) {
  const start = options.start ?? 1;
  const section = options.section ?? 'Section A';
  const batch = options.batch ?? '2024';
  return Array.from({ length: count }, (_, idx) => {
    const num = String(start + idx).padStart(4, '0');
    return {
      id: `${dept.replace(/\s+/g, '')}-${start + idx}`,
      regNo: `${prefix}${num}`,
      name: `${dept} Student ${start + idx}`,
      department: dept,
      section,
      batch,
      semester: 3,
    };
  });
}

test('generateSeatingPlan allocates all unique students without exceeding hall capacity', () => {
  const result = generateSeatingPlan(INITIAL_STUDENTS, INITIAL_HALLS, 5);

  assert.equal(result.totalAllocated, INITIAL_STUDENTS.length);
  assert.equal(result.unallocatedStudents.length, 0);

  const regNos = new Set(result.allocations.map((a) => a.regNo));
  assert.equal(regNos.size, INITIAL_STUDENTS.length);

  for (const summary of result.hallSummaries) {
    assert.ok(summary.allocated <= summary.capacity);
  }
});

test('generateSeatingPlan distributes across multiple halls when capacity is exceeded', () => {
  const smallHalls = [
    { id: 'h1', hallNumber: 'H-1', building: 'Block A', capacity: 4, available: true },
    { id: 'h2', hallNumber: 'H-2', building: 'Block A', capacity: 4, available: true },
    { id: 'h3', hallNumber: 'H-3', building: 'Block A', capacity: 4, available: true },
  ];

  const result = generateSeatingPlan(INITIAL_STUDENTS, smallHalls, 2);
  assert.equal(result.totalAllocated, INITIAL_STUDENTS.length);
  assert.equal(result.hallSummaries[0].allocated, 4);
  assert.equal(result.hallSummaries[1].allocated, 4);
  assert.equal(result.hallSummaries[2].allocated, INITIAL_STUDENTS.length - 8);
  assert.equal(result.allocations[0].rowNumber, 1);
  assert.equal(result.allocations[0].seatNumber, 1);
  assert.equal(result.allocations[2].rowNumber, 2);
});

test('allocateExamHalls single department sequential leading-zero ranges (60 students, target 10)', () => {
  const students = makeStudents('BCA (AI & DS)', 60);
  // Reverse input order to verify sorting
  const shuffled = [...students].reverse();
  const halls = [
    { id: 'h1', hallNumber: 'Room 101', building: 'Block A', capacity: 30, available: true },
    { id: 'h2', hallNumber: 'Room 102', building: 'Block A', capacity: 30, available: true },
    { id: 'h3', hallNumber: 'Room 103', building: 'Block A', capacity: 30, available: true },
    { id: 'h4', hallNumber: 'Room 104', building: 'Block A', capacity: 30, available: true },
    { id: 'h5', hallNumber: 'Room 105', building: 'Block A', capacity: 30, available: true },
    { id: 'h6', hallNumber: 'Room 106', building: 'Block A', capacity: 30, available: true },
  ];

  const plan = allocateExamHalls({
    students: shuffled,
    halls,
    selectedDepartments: ['BCA (AI & DS)'],
    targetMode: 'CUSTOM',
    customTargetPerDept: 10,
  });

  assert.equal(plan.totalStudents, 60);
  assert.equal(plan.totalAllocated, 60);
  assert.equal(plan.unallocatedStudents.length, 0);
  assert.equal(plan.hallsRequired, 6);

  const deptRows = buildDepartmentWiseHallReportRows(plan);
  assert.deepEqual(
    deptRows.map((r) => ({ hall: r.hallNumber, range: r.regNoRange, count: r.studentCount })),
    [
      { hall: 'Room 101', range: '0001–0010', count: 10 },
      { hall: 'Room 102', range: '0011–0020', count: 10 },
      { hall: 'Room 103', range: '0021–0030', count: 10 },
      { hall: 'Room 104', range: '0031–0040', count: 10 },
      { hall: 'Room 105', range: '0041–0050', count: 10 },
      { hall: 'Room 106', range: '0051–0060', count: 10 },
    ]
  );
});

test('allocateExamHalls defaults to 50% target per dept/hall and never leaves remaining students unallocated', () => {
  const dept1 = makeStudents('BCA (AI & DS)', 60, 'AI');
  const dept2 = makeStudents('BCA (DT)', 40, 'DT');
  const halls = [
    { id: 'h1', hallNumber: 'Room 101', building: 'Block A', capacity: 60, available: true },
    { id: 'h2', hallNumber: 'Room 102', building: 'Block A', capacity: 60, available: true },
    { id: 'h3', hallNumber: 'Room 103', building: 'Block A', capacity: 60, available: true },
  ];

  const plan = allocateExamHalls({
    students: [...dept1, ...dept2],
    halls,
    selectedDepartments: ['BCA (AI & DS)', 'BCA (DT)'],
    targetMode: 'PERCENT_50',
  });

  assert.equal(plan.totalStudents, 100);
  assert.equal(plan.totalAllocated, 100);
  assert.equal(plan.unallocatedStudents.length, 0);
  assert.equal(plan.hallsRequired, 2);

  for (const h of plan.allocatedHalls) {
    assert.ok(h.departmentBreakdown.length <= 2);
    assert.ok(h.allocated <= h.capacity);
  }

  const combinedRows = buildCombinedHallReportRows(plan);
  assert.deepEqual(
    combinedRows.map((r) => ({
      hall: r.hallNumber,
      dept: r.department,
      range: r.regNoRange,
      count: r.studentCount,
    })),
    [
      { hall: 'Room 101', dept: 'BCA (AI & DS)', range: 'AI0001–AI0030', count: 30 },
      { hall: 'Room 101', dept: 'BCA (DT)', range: 'DT0001–DT0020', count: 20 },
      { hall: 'Room 102', dept: 'BCA (AI & DS)', range: 'AI0031–AI0060', count: 30 },
      { hall: 'Room 102', dept: 'BCA (DT)', range: 'DT0021–DT0040', count: 20 },
    ]
  );
});

test('allocateExamHalls caps departments per hall at configurable limit across 4 departments & deduplicates students', () => {
  const s1 = makeStudents('Dept A', 10, 'A');
  const s2 = makeStudents('Dept B', 10, 'B');
  const s3 = makeStudents('Dept C', 10, 'C');
  const s4 = makeStudents('Dept D', 10, 'D');
  const duplicate = { ...s1[0], id: 'dup-id' };

  const halls = [
    { id: 'h1', hallNumber: 'H-1', building: 'Main', capacity: 30, available: true },
    { id: 'h2', hallNumber: 'H-2', building: 'Main', capacity: 30, available: true },
    { id: 'h3', hallNumber: 'H-3', building: 'Main', capacity: 30, available: true },
    { id: 'h4', hallNumber: 'H-4', building: 'Main', capacity: 30, available: true },
  ];

  const plan = allocateExamHalls({
    students: [...s1, duplicate, ...s2, ...s3, ...s4],
    halls,
    selectedDepartments: ['Dept A', 'Dept B', 'Dept C', 'Dept D'],
    maxDeptsPerHall: 2,
  });

  assert.equal(plan.totalStudents, 40);
  assert.equal(plan.totalAllocated, 40);

  for (const h of plan.allocatedHalls) {
    assert.ok(h.departmentBreakdown.length <= 2, `${h.hallNumber} exceeded 2 departments`);
    assert.ok(h.allocated <= h.capacity);
  }

  const individual = buildIndividualStudentHallRows(plan);
  assert.equal(individual.length, 40);
  assert.equal(new Set(individual.map((r) => r.regNo)).size, 40);
});

test('allocateExamHalls remainder consolidation uses single large hall continuously & absorbs <10 remainders without opening extra hall', () => {
  const s1 = makeStudents('BCA (AI & DS)', 65, 'AI');
  const s2 = makeStudents('BCA (DT)', 45, 'DT');
  const halls = [
    { id: 'h1', hallNumber: 'H-1', building: 'Main', capacity: 60, available: true },
    { id: 'h2', hallNumber: 'H-2', building: 'Main', capacity: 60, available: true },
    { id: 'h3', hallNumber: 'H-3', building: 'Main', capacity: 60, available: true },
  ];

  const plan = allocateExamHalls({
    students: [...s1, ...s2],
    halls,
    selectedDepartments: ['BCA (AI & DS)', 'BCA (DT)'],
    targetMode: 'CUSTOM',
    customTargetPerDept: 30,
  });

  assert.equal(plan.totalAllocated, 110);
  assert.equal(plan.hallsRequired, 2);
  assert.equal(plan.remainingAvailableCapacity, 70);
});

test('allocateExamHalls handles mixed hall capacities (30, 50, 100), configurable percentage, and selectedHallIds', () => {
  const s1 = makeStudents('Dept A', 60, 'A');
  const s2 = makeStudents('Dept B', 40, 'B');
  const halls = [
    { id: 'h30', hallNumber: 'H-30', building: 'Main', capacity: 30, available: true },
    { id: 'h50', hallNumber: 'H-50', building: 'Main', capacity: 50, available: true },
    { id: 'h100', hallNumber: 'H-100', building: 'Main', capacity: 100, available: true },
  ];

  const plan = allocateExamHalls({
    students: [...s1, ...s2],
    halls,
    selectedDepartments: ['Dept A', 'Dept B'],
    targetPercentage: 50,
  });
  assert.equal(plan.hallsRequired, 2);
  assert.deepEqual(
    plan.allocatedHalls.map((h) => h.hallNumber),
    ['H-50', 'H-100']
  );

  // Selected halls filter excludes H-30 and H-50, leaving only H-100
  const onlyAudi = allocateExamHalls({
    students: [...s1, ...s2],
    halls,
    selectedDepartments: ['Dept A', 'Dept B'],
    selectedHallIds: ['h100'],
  });
  assert.equal(onlyAudi.hallsRequired, 1);
  assert.equal(onlyAudi.allocatedHalls[0].hallNumber, 'H-100');
  assert.equal(onlyAudi.totalAllocated, 100);
});

test('allocateExamHalls excludes reserved & unavailable halls and computes insufficient capacity warning', () => {
  const s1 = makeStudents('BCA (AI & DS)', 50, 'AI');
  const halls = [
    { id: 'h1', hallNumber: 'R-101', building: 'Main', capacity: 30, available: true },
    { id: 'h2', hallNumber: 'R-102', building: 'Main', capacity: 30, available: true },
    { id: 'h3', hallNumber: 'R-103', building: 'Main', capacity: 40, available: false },
  ];

  const plan = allocateExamHalls({
    students: s1,
    halls,
    selectedDepartments: ['BCA (AI & DS)'],
    reservedHallIds: ['h1'],
  });

  assert.equal(plan.reservedHalls.length, 1);
  assert.equal(plan.unavailableHalls.length, 1);
  assert.equal(plan.totalEligibleCapacity, 30);
  assert.equal(plan.totalAllocated, 30);
  assert.equal(plan.shortfallSeats, 20);
  assert.equal(plan.additionalHallsRequired, 1);
  assert.equal(plan.unallocatedStudents[0].regNo, 'AI0031');
});

test('validateHallAllocationPlan detects duplicate students & hall double-booking within same (date, session) while allowing distinct sessions', () => {
  const s1 = makeStudents('BCA', 20, '24BCA');
  const halls = [
    { id: 'h1', hallNumber: 'R-101', building: 'Main', capacity: 40, available: true },
  ];

  const fnPlan = allocateExamHalls({
    students: s1,
    halls,
    selectedDepartments: ['BCA'],
    examDate: '2026-11-17',
    session: 'FN',
  });
  fnPlan.id = 'alloc-fn';

  const anPlan = allocateExamHalls({
    students: s1,
    halls,
    selectedDepartments: ['BCA'],
    examDate: '2026-11-17',
    session: 'AN',
  });
  anPlan.id = 'alloc-an';

  assert.equal(validateHallAllocationPlan(anPlan, [fnPlan]).isValid, true);

  const dupFn = { ...fnPlan, id: 'alloc-fn-2' };
  const conflict = validateHallAllocationPlan(dupFn, [fnPlan]);
  assert.equal(conflict.isValid, false);
  assert.ok(conflict.conflictingHalls.includes('R-101'));
  assert.ok(conflict.conflictingStudents.includes('24BCA0001'));

  const found = lookupStudentHallAllocation('24BCA0005', [fnPlan, anPlan], {
    examDate: '2026-11-17',
    session: 'AN',
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].session, 'AN');
  assert.equal(found[0].hallNumber, 'R-101');
});
