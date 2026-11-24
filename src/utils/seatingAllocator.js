/**
 * Intelligent Examination Hall Allocation & Student Seating Planner.
 *
 * Implements:
 * 1. Department-wise student distribution (max 2 departments per hall, ~50% or custom target per dept/hall)
 * 2. Sequential ascending registration number allocation preserving leading zeros (e.g. 0001-0010)
 * 3. Best-Fit minimum-hall selection & remainder consolidation without exceeding capacity or 2-dept cap
 * 4. Date/session hall reservation awareness and insufficient-capacity diagnostics
 * 5. Student-friendly report builders (Dept-Wise, Combined Hall, Individual Student List)
 */

export function compareRegNoAsc(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function formatRegNoRange(firstRegNo, lastRegNo) {
  if (!firstRegNo) return '—';
  if (!lastRegNo || firstRegNo === lastRegNo) return String(firstRegNo);
  return `${firstRegNo}–${lastRegNo}`;
}

function deduplicateAndSortStudents(students) {
  const seenRegNos = new Set();
  const seenIds = new Set();
  const uniqueSorted = [];

  const sortedCopy = [...(students || [])].sort((a, b) => compareRegNoAsc(a.regNo, b.regNo));
  for (const stu of sortedCopy) {
    const regKey = String(stu.regNo || '').trim().toUpperCase();
    const idKey = stu.id ? String(stu.id) : '';
    if (!regKey || seenRegNos.has(regKey)) continue;
    if (idKey && seenIds.has(idKey)) continue;
    seenRegNos.add(regKey);
    if (idKey) seenIds.add(idKey);
    uniqueSorted.push({
      ...stu,
      regNo: String(stu.regNo).trim(),
      department: String(stu.department || 'General').trim(),
      name: String(stu.name || '').trim(),
      section: String(stu.section || 'Section A').trim(),
      batch: String(stu.batch || '2024').trim(),
    });
  }
  return uniqueSorted;
}

function resolveTargetPercentage(targetMode, targetPercentage) {
  if (targetPercentage !== undefined && targetPercentage !== null && targetPercentage !== '') {
    const n = Number(targetPercentage);
    if (Number.isFinite(n)) return Math.max(1, Math.min(100, Math.round(n)));
  }
  const m = String(targetMode || '').trim().toUpperCase().match(/^PERCENT_(\d+)$/);
  if (m) return Math.max(1, Math.min(100, Number(m[1])));
  return 50;
}

/**
 * Allocates selected departments' students into non-reserved available halls.
 */
export function allocateExamHalls({
  students = [],
  halls = [],
  selectedDepartments = [],
  examDate = '',
  session = 'FN',
  targetMode = 'PERCENT_50', // 'PERCENT_50' | 'PERCENTAGE' | 'CUSTOM'
  targetPercentage = null,
  customTargetPerDept = 30,
  maxDeptsPerHall = 2,
  selectedHallIds = null,
  reservedHallIds = [],
  columnsPerRow = 5,
} = {}) {
  const cols = Math.max(1, Number(columnsPerRow) || 5);
  const maxDepts = Math.max(1, Math.floor(Number(maxDeptsPerHall) || 2));
  const pct = resolveTargetPercentage(targetMode, targetPercentage);
  const normalizedMode =
    String(targetMode || '').toUpperCase() === 'CUSTOM' ? 'CUSTOM' : `PERCENT_${pct}`;

  const reservedSet = new Set((reservedHallIds || []).map((x) => String(x)));
  const selectedHallSet = Array.isArray(selectedHallIds)
    ? new Set(selectedHallIds.map((x) => String(x)))
    : null;

  const uniqueStudents = deduplicateAndSortStudents(students);
  const deptSelectionSet =
    Array.isArray(selectedDepartments) && selectedDepartments.length > 0
      ? new Set(selectedDepartments)
      : null;

  const eligibleStudents = deptSelectionSet
    ? uniqueStudents.filter((s) => deptSelectionSet.has(s.department))
    : uniqueStudents;

  // Group ascending-sorted students per department
  const deptStudentsMap = new Map();
  for (const stu of eligibleStudents) {
    if (!deptStudentsMap.has(stu.department)) {
      deptStudentsMap.set(stu.department, []);
    }
    deptStudentsMap.get(stu.department).push(stu);
  }

  const orderedDeptNames = deptSelectionSet
    ? Array.from(new Set(selectedDepartments)).filter((d) => (deptStudentsMap.get(d)?.length || 0) > 0)
    : Array.from(deptStudentsMap.keys()).sort((a, b) => a.localeCompare(b));

  // Target per department per hall (configurable % of class strength, default 50%, or custom count)
  const deptStates = orderedDeptNames.map((deptName, orderIndex) => {
    const list = deptStudentsMap.get(deptName) || [];
    const total = list.length;
    const rawTarget =
      normalizedMode === 'CUSTOM'
        ? Math.max(1, Math.floor(Number(customTargetPerDept) || 1))
        : Math.max(1, Math.ceil(total * (pct / 100)));
    const target = Math.min(total, rawTarget);
    return {
      department: deptName,
      orderIndex,
      students: list,
      total,
      target,
      remaining: total,
    };
  });

  // Partition halls into unavailable, reserved, unselected, and eligible
  const sortedHalls = [...(halls || [])].sort((a, b) =>
    compareRegNoAsc(a.hallNumber, b.hallNumber)
  );
  const eligibleHalls = [];
  const reservedHalls = [];
  const unavailableHalls = [];
  const unselectedHalls = [];

  for (const h of sortedHalls) {
    const cap = Math.max(0, Number(h.capacity) || 0);
    const hallIdStr = String(h.id ?? h.hallNumber ?? '');
    const hallNumStr = String(h.hallNumber ?? '');
    const isReserved = reservedSet.has(hallIdStr) || reservedSet.has(hallNumStr);
    const isSelected = selectedHallSet
      ? selectedHallSet.has(hallIdStr) || selectedHallSet.has(hallNumStr)
      : true;

    if (!h.available || cap <= 0) {
      unavailableHalls.push({ ...h, capacity: cap });
    } else if (isReserved) {
      reservedHalls.push({ ...h, capacity: cap });
    } else if (!isSelected) {
      unselectedHalls.push({ ...h, capacity: cap });
    } else {
      eligibleHalls.push({ ...h, capacity: cap });
    }
  }

  const unusedHalls = [...eligibleHalls];
  const hallPlans = [];

  const tryConsolidateSmallRemainders = () => {
    let absorbedAny = false;
    for (const dept of deptStates) {
      if (dept.remaining <= 0 || dept.remaining >= dept.target) continue;
      for (const plan of hallPlans) {
        const existingSlot = plan.slots.find((s) => s.department === dept.department);
        if (!existingSlot) continue;
        const used = plan.slots.reduce((sum, s) => sum + s.count, 0);
        const free = plan.hall.capacity - used;
        if (free >= dept.remaining) {
          existingSlot.count += dept.remaining;
          dept.remaining = 0;
          absorbedAny = true;
          break;
        }
      }
    }
    return absorbedAny;
  };

  // PASS 1: Plan counts per (hall, department) using Best-Fit minimum hall utilization.
  // Never exceeds hall capacity and never puts more than maxDeptsPerHall departments in one hall.
  while (unusedHalls.length > 0 && deptStates.some((d) => d.remaining > 0)) {
    if (tryConsolidateSmallRemainders() && !deptStates.some((d) => d.remaining > 0)) {
      break;
    }

    const activeDepts = deptStates
      .filter((d) => d.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining || a.orderIndex - b.orderIndex);

    if (activeDepts.length === 0) break;

    const chosenDepts = activeDepts.slice(0, maxDepts);
    const wants = chosenDepts.map((d) => Math.min(d.remaining, d.target));
    const desiredTotal = wants.reduce((sum, w) => sum + w, 0);

    // Best-Fit: pick smallest unused hall with capacity >= desiredTotal;
    // otherwise pick largest unused hall to minimize total number of halls required.
    let chosenIdx = -1;
    let bestCap = Infinity;
    for (let i = 0; i < unusedHalls.length; i++) {
      const cap = unusedHalls[i].capacity;
      if (cap >= desiredTotal && cap < bestCap) {
        bestCap = cap;
        chosenIdx = i;
      }
    }
    if (chosenIdx === -1) {
      let maxCap = -1;
      for (let i = 0; i < unusedHalls.length; i++) {
        if (unusedHalls[i].capacity > maxCap) {
          maxCap = unusedHalls[i].capacity;
          chosenIdx = i;
        }
      }
    }

    const chosenHall = unusedHalls.splice(chosenIdx, 1)[0];
    const slots = [];
    let remCap = chosenHall.capacity;

    for (let i = 0; i < chosenDepts.length; i++) {
      if (remCap <= 0) break;
      const deptObj = chosenDepts[i];
      const take = Math.min(wants[i], remCap);
      if (take > 0) {
        slots.push({
          department: deptObj.department,
          orderIndex: deptObj.orderIndex,
          count: take,
        });
        deptObj.remaining -= take;
        remCap -= take;
      }
    }

    if (slots.length > 0) {
      hallPlans.push({ hall: chosenHall, slots });
    }
  }

  // PASS 2: Remainder consolidation into already-allocated halls with spare capacity,
  // preserving <= maxDepts departments per hall and never exceeding hall capacity.
  for (const dept of deptStates) {
    if (dept.remaining <= 0) continue;

    // First try halls already hosting this department
    for (const plan of hallPlans) {
      if (dept.remaining <= 0) break;
      const existingSlot = plan.slots.find((s) => s.department === dept.department);
      if (!existingSlot) continue;
      const used = plan.slots.reduce((sum, s) => sum + s.count, 0);
      const free = plan.hall.capacity - used;
      if (free <= 0) continue;
      const add = Math.min(dept.remaining, free);
      existingSlot.count += add;
      dept.remaining -= add;
    }

    // Next try halls hosting fewer than maxDepts departments with spare capacity
    if (dept.remaining > 0) {
      for (const plan of hallPlans) {
        if (dept.remaining <= 0) break;
        if (plan.slots.length >= maxDepts) continue;
        if (plan.slots.some((s) => s.department === dept.department)) continue;
        const used = plan.slots.reduce((sum, s) => sum + s.count, 0);
        const free = plan.hall.capacity - used;
        if (free <= 0) continue;
        const add = Math.min(dept.remaining, free);
        plan.slots.push({
          department: dept.department,
          orderIndex: dept.orderIndex,
          count: add,
        });
        dept.remaining -= add;
      }
    }
  }

  // PASS 3: Sort allocated halls cleanly by hallNumber ascending and slice each department's
  // regNo-ordered list sequentially so ranges remain continuous and gap-free across halls.
  hallPlans.sort((a, b) => compareRegNoAsc(a.hall.hallNumber, b.hall.hallNumber));

  const deptCursors = new Map(deptStates.map((d) => [d.department, 0]));
  const allocations = [];
  const usedHallSummaries = [];

  for (const plan of hallPlans) {
    const orderedSlots = [...plan.slots].sort((a, b) => a.orderIndex - b.orderIndex);
    let countInHall = 0;
    const departmentBreakdown = [];

    for (const slot of orderedSlots) {
      const deptState = deptStates.find((d) => d.department === slot.department);
      const start = deptCursors.get(slot.department) || 0;
      const slice = deptState.students.slice(start, start + slot.count);
      deptCursors.set(slot.department, start + slice.length);

      for (const stu of slice) {
        const rowNumber = Math.floor(countInHall / cols) + 1;
        const colNumber = (countInHall % cols) + 1;
        const seatNumber = countInHall + 1;
        allocations.push({
          studentId: stu.id,
          regNo: stu.regNo,
          studentName: stu.name,
          department: stu.department,
          section: stu.section,
          batch: stu.batch,
          hallId: plan.hall.id,
          hallNumber: plan.hall.hallNumber,
          building: plan.hall.building,
          rowNumber,
          colNumber,
          seatNumber,
        });
        countInHall++;
      }

      if (slice.length > 0) {
        const firstRegNo = slice[0].regNo;
        const lastRegNo = slice[slice.length - 1].regNo;
        departmentBreakdown.push({
          department: slot.department,
          count: slice.length,
          firstRegNo,
          lastRegNo,
          regNoRange: formatRegNoRange(firstRegNo, lastRegNo),
        });
      }
    }

    usedHallSummaries.push({
      hallId: plan.hall.id,
      hallNumber: plan.hall.hallNumber,
      building: plan.hall.building,
      capacity: plan.hall.capacity,
      allocated: countInHall,
      remainingCapacity: Math.max(0, plan.hall.capacity - countInHall),
      departmentBreakdown,
      isUsed: countInHall > 0,
      isReserved: false,
    });
  }

  const usedHallIds = new Set(usedHallSummaries.map((h) => h.hallId));
  const idleEligibleHalls = eligibleHalls
    .filter((h) => !usedHallIds.has(h.id))
    .map((h) => ({
      hallId: h.id,
      hallNumber: h.hallNumber,
      building: h.building,
      capacity: h.capacity,
      allocated: 0,
      remainingCapacity: h.capacity,
      departmentBreakdown: [],
      isUsed: false,
      isReserved: false,
    }));

  const hallSummaries = [...usedHallSummaries, ...idleEligibleHalls].sort((a, b) =>
    compareRegNoAsc(a.hallNumber, b.hallNumber)
  );

  // Unallocated students (if total capacity or maxDepts constraints exhausted halls)
  const unallocatedStudents = [];
  for (const d of deptStates) {
    const cursor = deptCursors.get(d.department) || 0;
    if (cursor < d.students.length) {
      unallocatedStudents.push(...d.students.slice(cursor));
    }
  }

  const totalEligibleCapacity = eligibleHalls.reduce((s, h) => s + h.capacity, 0);
  const totalAllocated = allocations.length;
  const remainingAvailableCapacity = Math.max(0, totalEligibleCapacity - totalAllocated);
  const shortfallSeats = unallocatedStudents.length;

  let additionalHallsRequired = 0;
  if (shortfallSeats > 0) {
    const referenceCap =
      eligibleHalls.length > 0
        ? Math.max(
            1,
            Math.round(totalEligibleCapacity / eligibleHalls.length)
          )
        : 60;
    additionalHallsRequired = Math.ceil(shortfallSeats / referenceCap);
  }

  return {
    examDate,
    session,
    selectedDepartments: orderedDeptNames,
    targetMode: normalizedMode,
    targetPercentage: pct,
    customTargetPerDept: normalizedMode === 'CUSTOM' ? Math.max(1, Number(customTargetPerDept) || 1) : null,
    maxDeptsPerHall: maxDepts,
    selectedHallIds: eligibleHalls.map((h) => h.id),
    totalStudents: eligibleStudents.length,
    totalAllocated,
    hallsRequired: usedHallSummaries.length,
    totalEligibleHalls: eligibleHalls.length,
    totalEligibleCapacity,
    remainingAvailableCapacity,
    shortfallSeats,
    additionalHallsRequired,
    reservedHalls,
    unavailableHalls,
    unselectedHalls,
    departmentTargets: deptStates.map((d) => ({
      department: d.department,
      totalStudents: d.total,
      targetPerHall: d.target,
      allocated: deptCursors.get(d.department) || 0,
      unallocated: Math.max(0, d.total - (deptCursors.get(d.department) || 0)),
    })),
    allocations,
    hallSummaries,
    allocatedHalls: usedHallSummaries,
    unallocatedStudents,
    columnsPerRow: cols,
  };
}

/**
 * Validates plan integrity and cross-allocation conflicts for the same (examDate, session).
 */
export function validateHallAllocationPlan(plan, existingSessionAllocations = []) {
  const errors = [];
  const maxDepts = Math.max(1, Number(plan?.maxDeptsPerHall) || 2);
  const allocId = String(plan?.id || '');
  const examDate = String(plan?.examDate || '').trim();
  const session = String(plan?.session || '').trim();

  const seenStudents = new Set();
  const dupStudents = [];
  for (const a of plan?.allocations || []) {
    const key = String(a.regNo || '').trim().toUpperCase();
    if (!key) continue;
    if (seenStudents.has(key)) dupStudents.push(a.regNo);
    seenStudents.add(key);
  }
  if (dupStudents.length > 0) {
    errors.push(`Duplicate student assignments in plan: ${dupStudents.slice(0, 5).join(', ')}.`);
  }

  for (const hs of plan?.hallSummaries || []) {
    if ((hs.allocated || 0) <= 0) continue;
    if (hs.capacity > 0 && hs.allocated > hs.capacity) {
      errors.push(`Hall ${hs.hallNumber} exceeds capacity (${hs.allocated}/${hs.capacity}).`);
    }
    if ((hs.departmentBreakdown || []).length > maxDepts) {
      errors.push(`Hall ${hs.hallNumber} mixes ${hs.departmentBreakdown.length} departments (max ${maxDepts}).`);
    }
  }

  const currentHallIds = new Set(
    (plan?.hallSummaries || [])
      .filter((hs) => (hs.allocated || 0) > 0 && hs.hallId)
      .map((hs) => String(hs.hallId))
  );
  const conflictingHalls = [];
  const conflictingStudents = [];

  for (const existing of existingSessionAllocations || []) {
    if (allocId && String(existing.id || '') === allocId) continue;
    if (String(existing.examDate || '').trim() !== examDate) continue;
    if (String(existing.session || '').trim() !== session) continue;

    for (const hs of existing.hallSummaries || []) {
      if ((hs.allocated || 0) > 0 && hs.hallId && currentHallIds.has(String(hs.hallId))) {
        conflictingHalls.push(hs.hallNumber || hs.hallId);
      }
    }
    for (const a of existing.allocations || []) {
      const regKey = String(a.regNo || '').trim().toUpperCase();
      if (regKey && seenStudents.has(regKey)) {
        conflictingStudents.push(a.regNo);
      }
    }
  }

  if (conflictingHalls.length > 0) {
    errors.push(`Hall(s) ${Array.from(new Set(conflictingHalls)).join(', ')} already allocated for ${examDate} (${session}).`);
  }
  if (conflictingStudents.length > 0) {
    errors.push(`Student(s) ${Array.from(new Set(conflictingStudents)).slice(0, 5).join(', ')} already assigned a hall for ${examDate} (${session}).`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    conflictingHalls: Array.from(new Set(conflictingHalls)),
    conflictingStudents: Array.from(new Set(conflictingStudents)),
  };
}

/**
 * Looks up a student's hall assignment(s) across saved/active hall allocation records.
 */
export function lookupStudentHallAllocation(
  registrationNumber,
  records = [],
  { examDate = null, session = null } = {}
) {
  const target = String(registrationNumber || '').trim().toUpperCase();
  if (!target) return [];
  const matches = [];
  for (const rec of records || []) {
    if (examDate && String(rec.examDate || '') !== String(examDate)) continue;
    if (session && String(rec.session || '') !== String(session)) continue;
    for (const stu of rec.allocations || []) {
      if (String(stu.regNo || '').trim().toUpperCase() === target) {
        matches.push({
          allocationId: rec.id || null,
          examDate: rec.examDate || '',
          session: rec.session || '',
          regNo: stu.regNo,
          studentName: stu.studentName,
          department: stu.department,
          section: stu.section || '',
          batch: stu.batch || '',
          hallId: stu.hallId,
          hallNumber: stu.hallNumber,
          building: stu.building || '',
          seatNumber: stu.seatNumber,
          rowNumber: stu.rowNumber,
          colNumber: stu.colNumber,
        });
      }
    }
  }
  return matches;
}

/**
 * Report Format A: Department-Wise Hall Allocation Report
 * Columns: [Examination Hall, Department, Registration Number Range, Students]
 */
export function buildDepartmentWiseHallReportRows(plan, departmentFilter = 'ALL') {
  const rows = [];
  const halls = (plan?.hallSummaries || []).filter((h) => h.allocated > 0);
  for (const hall of halls) {
    for (const breakdown of hall.departmentBreakdown || []) {
      if (departmentFilter && departmentFilter !== 'ALL' && breakdown.department !== departmentFilter) {
        continue;
      }
      rows.push({
        hallId: hall.hallId,
        hallNumber: hall.hallNumber,
        building: hall.building,
        department: breakdown.department,
        firstRegNo: breakdown.firstRegNo,
        lastRegNo: breakdown.lastRegNo,
        regNoRange: breakdown.regNoRange,
        studentCount: breakdown.count,
        hallCapacity: hall.capacity,
      });
    }
  }
  return rows;
}

/**
 * Report Format B: Combined Department Hall Allocation Report
 * Each department assigned to a hall renders on its own row under the hall grouping.
 */
export function buildCombinedHallReportRows(plan) {
  const rows = [];
  const halls = (plan?.hallSummaries || []).filter((h) => h.allocated > 0);
  for (const hall of halls) {
    const parts = hall.departmentBreakdown || [];
    parts.forEach((breakdown, index) => {
      rows.push({
        hallId: hall.hallId,
        hallNumber: hall.hallNumber,
        building: hall.building,
        department: breakdown.department,
        firstRegNo: breakdown.firstRegNo,
        lastRegNo: breakdown.lastRegNo,
        regNoRange: breakdown.regNoRange,
        studentCount: breakdown.count,
        hallTotalAllocated: hall.allocated,
        hallCapacity: hall.capacity,
        isFirstDeptInHall: index === 0,
        deptCountInHall: parts.length,
      });
    });
  }
  return rows;
}

/**
 * Report Format C: Student Individual Hall Allocation List
 * Columns: [S.No., Registration Number, Student Name, Department, Examination Hall]
 */
export function buildIndividualStudentHallRows(plan) {
  const list = [...(plan?.allocations || [])].sort(
    (a, b) =>
      compareRegNoAsc(a.hallNumber, b.hallNumber) ||
      a.department.localeCompare(b.department) ||
      compareRegNoAsc(a.regNo, b.regNo)
  );
  return list.map((item, idx) => ({
    sNo: idx + 1,
    studentId: item.studentId,
    regNo: item.regNo,
    studentName: item.studentName,
    department: item.department,
    section: item.section || '',
    batch: item.batch || '',
    hallId: item.hallId,
    hallNumber: item.hallNumber,
    building: item.building || '',
    seatNumber: item.seatNumber,
    rowNumber: item.rowNumber,
  }));
}

/**
 * Legacy helper retained for general full-pool seating plan compatibility.
 */
export function generateSeatingPlan(students, halls, columnsPerRow = 6) {
  const cols = Math.max(1, Number(columnsPerRow) || 6);
  const uniqueSorted = deduplicateAndSortStudents(students);

  const deptQueues = new Map();
  for (const stu of uniqueSorted) {
    const dept = stu.department || 'General';
    if (!deptQueues.has(dept)) deptQueues.set(dept, []);
    deptQueues.get(dept).push(stu);
  }

  let orderedStudents = [];
  const deptKeys = Array.from(deptQueues.keys());

  if (deptKeys.length > 1) {
    const interleaved = [];
    let remaining = uniqueSorted.length;
    while (remaining > 0) {
      for (const dept of deptKeys) {
        const queue = deptQueues.get(dept);
        if (queue && queue.length > 0) {
          interleaved.push(queue.shift());
          remaining--;
        }
      }
    }
    orderedStudents = interleaved;
  } else {
    orderedStudents = [...uniqueSorted].sort((a, b) => {
      const secA = String(a.section || 'A');
      const secB = String(b.section || 'A');
      if (secA !== secB) return secA.localeCompare(secB);
      return compareRegNoAsc(a.regNo, b.regNo);
    });
  }

  const activeHalls = halls.filter((h) => h.available && h.capacity > 0);
  const allocations = [];
  const hallSummaries = [];

  let cursor = 0;
  for (const hall of activeHalls) {
    const cap = hall.capacity;
    let countInHall = 0;

    while (cursor < orderedStudents.length && countInHall < cap) {
      const stu = orderedStudents[cursor];
      const rowNumber = Math.floor(countInHall / cols) + 1;
      const colNumber = (countInHall % cols) + 1;
      const seatNumber = countInHall + 1;

      allocations.push({
        studentId: stu.id,
        regNo: stu.regNo,
        studentName: stu.name,
        department: stu.department,
        section: stu.section || 'Section A',
        batch: stu.batch || '2024',
        hallId: hall.id,
        hallNumber: hall.hallNumber,
        building: hall.building,
        rowNumber,
        colNumber,
        seatNumber,
      });

      countInHall++;
      cursor++;
    }

    hallSummaries.push({
      hallId: hall.id,
      hallNumber: hall.hallNumber,
      building: hall.building,
      capacity: cap,
      allocated: countInHall,
    });
  }

  const unallocatedStudents = orderedStudents.slice(cursor);

  return {
    allocations,
    hallSummaries,
    unallocatedStudents,
    totalAllocated: allocations.length,
    columnsPerRow: cols,
  };
}
