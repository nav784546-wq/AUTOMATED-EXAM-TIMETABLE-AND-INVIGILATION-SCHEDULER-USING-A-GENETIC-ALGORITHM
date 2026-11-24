import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { api } from './api.js';
import {
  INITIAL_BATCHES,
  INITIAL_DEPARTMENTS,
  INITIAL_FACULTY,
  INITIAL_HALLS,
  INITIAL_SECTIONS_BY_DEPT,
  INITIAL_STUDENTS,
  INITIAL_SUBJECTS,
} from '../utils/seedData.js';
import { generateSafeId, recalculateScheduleConflicts } from '../utils/dataValidation.js';
import {
  buildConflictReportPayload,
  buildOptimizationRunPayload,
  buildScheduleMutationPlan,
  clampInt,
  clampStr,
  stripUndefinedDeep,
} from '../utils/firestorePayload.js';
import {
  allocateExamHalls,
  lookupStudentHallAllocation,
  validateHallAllocationPlan,
} from '../utils/seatingAllocator.js';
import { normalizeGAParameters } from '../utils/gaConfig.js';

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection() {
  try {
    if (!auth.currentUser) return;
    await getDocFromServer(doc(db, 'system', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

function isFirestoreActive() {
  return Boolean(auth.currentUser);
}

function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Authentication required for Firestore write.');
  }
  return uid;
}

async function commitChunkedOperations(ops, errorOpType, errorPath) {
  const CHUNK_SIZE = 450;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data);
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, errorOpType, errorPath);
    }
  }
}

function normalizeSubjectDoc(sub) {
  return {
    id: String(sub.id),
    code: clampStr(String(sub.code || '').toUpperCase(), 32, 'SUB001'),
    name: clampStr(sub.name, 200, 'Untitled Subject'),
    department: clampStr(sub.department, 160, 'General'),
    batch: clampStr(sub.batch, 64, '2024'),
    section: clampStr(sub.section, 64, 'Section A'),
    semester: clampInt(sub.semester, 1, 12, 1),
    enrolledCount: clampInt(sub.enrolledCount, 1, 2000, 50),
  };
}

function normalizeHallDoc(hall) {
  return {
    id: String(hall.id),
    hallNumber: clampStr(String(hall.hallNumber || '').toUpperCase(), 40, 'H-101'),
    building: clampStr(hall.building, 160, 'Main Academic Block'),
    capacity: clampInt(hall.capacity, 1, 5000, 60),
    available: Boolean(hall.available ?? true),
  };
}

function normalizeFacultyDoc(fac) {
  return {
    id: String(fac.id),
    employeeId: clampStr(String(fac.employeeId || '').toUpperCase(), 40, 'FAC-001'),
    name: clampStr(fac.name, 160, 'Faculty Member'),
    department: clampStr(fac.department, 160, 'General'),
    designation: clampStr(fac.designation, 120, 'Assistant Prof.'),
    email: clampStr(fac.email, 160, ''),
    phone: clampStr(fac.phone, 40, ''),
    available: Boolean(fac.available ?? true),
    maxDuties: clampInt(fac.maxDuties, 1, 50, 4),
  };
}

function normalizeStudentDoc(stu) {
  const enrolled = Array.isArray(stu.enrolledSubjectIds)
    ? stu.enrolledSubjectIds
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];
  return {
    id: String(stu.id),
    regNo: clampStr(String(stu.regNo || '').toUpperCase(), 40, 'REG-001'),
    name: clampStr(stu.name, 160, 'Student'),
    department: clampStr(stu.department, 160, 'General'),
    section: clampStr(stu.section, 64, 'Section A'),
    batch: clampStr(stu.batch, 64, '2024'),
    semester: clampInt(stu.semester, 1, 12, 1),
    enrolledSubjectIds: enrolled,
  };
}

async function seedFirestoreIfUninitialized() {
  const uid = requireUid();
  const bootstrapRef = doc(db, 'system', 'bootstrap');
  let bootstrapSnap;
  try {
    bootstrapSnap = await getDoc(bootstrapRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'system/bootstrap');
  }
  if (bootstrapSnap && bootstrapSnap.exists() && bootstrapSnap.data()?.initialized) {
    return;
  }

  // Only seed if departments collection is genuinely empty (never overwrite user data)
  let existingDepts;
  try {
    existingDepts = await getDocs(collection(db, 'departments'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'departments');
  }
  if (existingDepts && !existingDepts.empty) {
    try {
      await setDoc(bootstrapRef, {
        initialized: true,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'system/bootstrap');
    }
    return;
  }

  const batch = writeBatch(db);
  const stamp = {
    createdBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  INITIAL_DEPARTMENTS.forEach((deptName, idx) => {
    const id = `dept-${idx + 1}`;
    batch.set(doc(db, 'departments', id), { id, name: deptName, ...stamp });
  });

  INITIAL_BATCHES.forEach((bName, idx) => {
    const id = `b-${idx + 1}`;
    batch.set(doc(db, 'batches', id), { id, name: bName, ...stamp });
  });

  let secCounter = 1;
  Object.entries(INITIAL_SECTIONS_BY_DEPT).forEach(([deptName, secNames]) => {
    secNames.forEach((secName) => {
      const id = `sec-${secCounter++}`;
      batch.set(doc(db, 'sections', id), {
        id,
        department: deptName,
        name: secName,
        ...stamp,
      });
    });
  });

  INITIAL_SUBJECTS.forEach((sub) => {
    const clean = normalizeSubjectDoc(sub);
    batch.set(doc(db, 'subjects', clean.id), { ...clean, ...stamp });
  });

  INITIAL_HALLS.forEach((hall) => {
    const clean = normalizeHallDoc(hall);
    batch.set(doc(db, 'halls', clean.id), { ...clean, ...stamp });
  });

  INITIAL_FACULTY.forEach((fac) => {
    const clean = normalizeFacultyDoc(fac);
    batch.set(doc(db, 'faculty', clean.id), { ...clean, ...stamp });
  });

  INITIAL_STUDENTS.forEach((stu) => {
    const clean = normalizeStudentDoc(stu);
    batch.set(doc(db, 'students', clean.id), { ...clean, ...stamp });
  });

  batch.set(bootstrapRef, {
    initialized: true,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bootstrap-seed');
  }
}

async function fetchCollection(colName) {
  try {
    const snap = await getDocs(collection(db, colName));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colName);
  }
}

async function fetchLatestDoc(colName) {
  try {
    const q = query(collection(db, colName), orderBy('updatedAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colName);
  }
}

async function fetchRecentDocs(colName, maxCount = 25) {
  try {
    const q = query(collection(db, colName), orderBy('updatedAt', 'desc'), limit(maxCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colName);
  }
}

export const persistenceService = {
  async loadAllData() {
    if (isFirestoreActive()) {
      await testFirestoreConnection();
      await seedFirestoreIfUninitialized();

      const [
        departments,
        batches,
        sections,
        subjects,
        halls,
        faculty,
        students,
        subsections,
        hallAllocations,
        latestScheduleDoc,
        latestConflictReport,
        optimizationRuns,
        gaConfig,
      ] = await Promise.all([
        fetchCollection('departments'),
        fetchCollection('batches'),
        fetchCollection('sections'),
        fetchCollection('subjects'),
        fetchCollection('halls'),
        fetchCollection('faculty'),
        fetchCollection('students'),
        fetchCollection('subsections'),
        fetchCollection('hallAllocations'),
        fetchLatestDoc('schedules'),
        fetchLatestDoc('conflictReports'),
        fetchRecentDocs('optimizationRuns', 25),
        api.getGAConfig().catch(() => null),
      ]);

      departments.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      batches.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      sections.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      subjects.sort((a, b) => String(a.code).localeCompare(String(b.code)));
      halls.sort((a, b) => String(a.hallNumber).localeCompare(String(b.hallNumber)));
      faculty.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      students.sort((a, b) => String(a.regNo).localeCompare(String(b.regNo)));
      hallAllocations.sort((a, b) => String(b.examDate || '').localeCompare(String(a.examDate || '')));

      return {
        storageMode: 'firestore',
        departments,
        batches,
        sections,
        subjects,
        halls,
        faculty,
        students,
        subsections,
        hallAllocations,
        optimizationRuns,
        gaConfig: gaConfig ? normalizeGAParameters(gaConfig) : null,
        latestSchedule: latestScheduleDoc
          ? {
              scheduleId: latestScheduleDoc.id,
              schedule: latestScheduleDoc.schedule || [],
              bestFitness: Number(latestScheduleDoc.bestFitness || 0),
              history: latestScheduleDoc.history || [],
              conflicts: latestScheduleDoc.conflicts || {
                studentClashes: 0,
                invigilatorConflicts: 0,
                capacityViolations: 0,
                hallDoubleBookings: 0,
                totalHardViolations: 0,
                utilizationRate: 0,
                workloadStdDev: 0,
              },
              convergedAtGeneration: Number(latestScheduleDoc.convergedAtGeneration || 0),
              executionTimeMs: Number(latestScheduleDoc.executionTimeMs || 0),
              scope: latestScheduleDoc.scope || 'ALL',
            }
          : null,
        latestConflictReport,
      };
    }

    // Backend SQLite mode (used in local preview ?autostart=1 without Firebase sign-in)
    const [
      departments,
      batches,
      sections,
      subjects,
      halls,
      faculty,
      students,
      subsections,
      hallAllocations,
      latestSchedRes,
      latestReportRes,
      optimizationRuns,
      schedulingPolicy,
      gaConfig,
    ] = await Promise.all([
      api.getDepartments(),
      api.getBatches(),
      api.getSections(),
      api.getSubjects(),
      api.getHalls(),
      api.getFaculty(),
      api.getStudents(),
      api.getLatestSubsections().catch(() => []),
      api.getHallAllocations().catch(() => []),
      api.getLatestSchedule().catch(() => ({ hasSchedule: false })),
      api.getLatestConflictReport().catch(() => ({ hasReport: false })),
      api.getOptimizationRuns().catch(() => []),
      api.getSchedulingPolicy().catch(() => null),
      api.getGAConfig().catch(() => null),
    ]);

    let latestSchedule = null;
    if (latestSchedRes && latestSchedRes.hasSchedule && Array.isArray(latestSchedRes.schedule) && latestSchedRes.schedule.length > 0) {
      const effectivePolicy =
        latestSchedRes.scope === 'SINGLE_DAY' && schedulingPolicy
          ? { ...schedulingPolicy, minGapDaysBetweenExams: 0 }
          : schedulingPolicy || {};
      const recalculated = recalculateScheduleConflicts(latestSchedRes.schedule, faculty, {
        subjects,
        students,
        halls,
        departments,
        policy: effectivePolicy,
      });
      latestSchedule = {
        scheduleId: latestSchedRes.scheduleId,
        schedule: recalculated.schedule,
        bestFitness: Number(latestSchedRes.fitness || 0),
        history: (latestSchedRes.history || []).map((h) => ({
          generation: h.generation,
          bestFitness: h.fitness ?? h.bestFitness ?? 0,
          avgFitness: h.avgFitness ?? h.fitness ?? 0,
        })),
        conflicts: recalculated.conflicts,
        convergedAtGeneration: Number(latestSchedRes.convergedAtGeneration || 0),
        executionTimeMs: Number(latestSchedRes.executionTimeMs || 0),
        scope: latestSchedRes.scope || 'ALL',
      };
    }

    return {
      storageMode: 'sqlite',
      departments,
      batches,
      sections,
      subjects,
      halls,
      faculty,
      students,
      subsections,
      hallAllocations,
      optimizationRuns,
      schedulingPolicy,
      gaConfig: gaConfig ? normalizeGAParameters(gaConfig) : null,
      latestSchedule,
      latestConflictReport: latestReportRes?.hasReport ? latestReportRes : null,
    };
  },

  async saveGAConfig(gaConfig) {
    const normalized = normalizeGAParameters(gaConfig);
    return await api.updateGAConfig(normalized);
  },

  // --- DEPARTMENTS ---
  async createDepartment(name, initialSections = ['Section A', 'Section B']) {
    const cleanName = String(name || '').trim();
    const id = generateSafeId('dept');
    if (isFirestoreActive()) {
      const uid = requireUid();
      const batch = writeBatch(db);
      batch.set(doc(db, 'departments', id), {
        id,
        name: cleanName,
        createdBy: uid,
        updatedBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const createdSections = [];
      for (const secName of initialSections) {
        const cleanSec = String(secName || '').trim();
        if (!cleanSec) continue;
        const secId = generateSafeId('sec');
        batch.set(doc(db, 'sections', secId), {
          id: secId,
          department: cleanName,
          name: cleanSec,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        createdSections.push({ id: secId, department: cleanName, name: cleanSec });
      }
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `departments/${id}`);
      }
      api.createDepartment({ id, name: cleanName, initialSections }).catch(() => {});
      return { department: { id, name: cleanName }, sections: createdSections };
    }

    const res = await api.createDepartment({ id, name: cleanName, initialSections });
    return {
      department: { id: res.id, name: res.name },
      sections: res.sections || [],
    };
  },

  async renameDepartment(deptId, oldName, newName, { sections = [], subjects = [], faculty = [], students = [] }) {
    const cleanNew = String(newName || '').trim();
    if (isFirestoreActive()) {
      const uid = requireUid();
      const batch = writeBatch(db);
      batch.update(doc(db, 'departments', deptId), {
        name: cleanNew,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      sections
        .filter((s) => s.department === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'sections', s.id), {
            department: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      subjects
        .filter((s) => s.department === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'subjects', s.id), {
            department: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      faculty
        .filter((f) => f.department === oldName)
        .forEach((f) => {
          batch.update(doc(db, 'faculty', f.id), {
            department: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      students
        .filter((s) => s.department === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'students', s.id), {
            department: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `departments/${deptId}`);
      }
      api.updateDepartment(deptId, { name: cleanNew }).catch(() => {});
      return { id: deptId, name: cleanNew };
    }

    return await api.updateDepartment(deptId, { name: cleanNew });
  },

  async deleteDepartment(deptId, sectionRecordsToRemove = []) {
    if (isFirestoreActive()) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'departments', deptId));
      sectionRecordsToRemove.forEach((s) => {
        batch.delete(doc(db, 'sections', s.id));
      });
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `departments/${deptId}`);
      }
      api.deleteDepartment(deptId).catch(() => {});
      return;
    }

    await api.deleteDepartment(deptId);
  },

  // --- BATCHES ---
  async createBatch(name) {
    const cleanName = String(name || '').trim();
    const id = generateSafeId('batch');
    if (isFirestoreActive()) {
      const uid = requireUid();
      try {
        await setDoc(doc(db, 'batches', id), {
          id,
          name: cleanName,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `batches/${id}`);
      }
      api.createBatch({ id, name: cleanName }).catch(() => {});
      return { id, name: cleanName };
    }

    return await api.createBatch({ id, name: cleanName });
  },

  async updateBatch(batchId, oldName, newName, { students = [], subjects = [] }) {
    const cleanNew = String(newName || '').trim();
    if (isFirestoreActive()) {
      const uid = requireUid();
      const batch = writeBatch(db);
      batch.update(doc(db, 'batches', batchId), {
        name: cleanNew,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      students
        .filter((s) => s.batch === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'students', s.id), {
            batch: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      subjects
        .filter((s) => s.batch === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'subjects', s.id), {
            batch: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `batches/${batchId}`);
      }
      api.updateBatch(batchId, { name: cleanNew }).catch(() => {});
      return { id: batchId, name: cleanNew };
    }

    return await api.updateBatch(batchId, { name: cleanNew });
  },

  async deleteBatch(batchId) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'batches', batchId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `batches/${batchId}`);
      }
      api.deleteBatch(batchId).catch(() => {});
      return;
    }

    await api.deleteBatch(batchId);
  },

  // --- SECTIONS ---
  async createSection(department, name) {
    const cleanDept = String(department || '').trim();
    const cleanName = String(name || '').trim();
    const id = generateSafeId('sec');
    if (isFirestoreActive()) {
      const uid = requireUid();
      try {
        await setDoc(doc(db, 'sections', id), {
          id,
          department: cleanDept,
          name: cleanName,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `sections/${id}`);
      }
      api.createSection({ id, department: cleanDept, name: cleanName }).catch(() => {});
      return { id, department: cleanDept, name: cleanName };
    }

    return await api.createSection({ id, department: cleanDept, name: cleanName });
  },

  async renameSection(sectionId, department, oldName, newName, { students = [], subjects = [] }) {
    const cleanNew = String(newName || '').trim();
    if (isFirestoreActive()) {
      const uid = requireUid();
      const batch = writeBatch(db);
      batch.update(doc(db, 'sections', sectionId), {
        name: cleanNew,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      students
        .filter((s) => s.department === department && s.section === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'students', s.id), {
            section: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      subjects
        .filter((s) => s.department === department && s.section === oldName)
        .forEach((s) => {
          batch.update(doc(db, 'subjects', s.id), {
            section: cleanNew,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        });
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `sections/${sectionId}`);
      }
      api.updateSection(sectionId, { name: cleanNew }).catch(() => {});
      return { id: sectionId, department, name: cleanNew };
    }

    return await api.updateSection(sectionId, { name: cleanNew });
  },

  async deleteSection(sectionId) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'sections', sectionId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `sections/${sectionId}`);
      }
      api.deleteSection(sectionId).catch(() => {});
      return;
    }

    await api.deleteSection(sectionId);
  },

  // --- SUBJECTS ---
  async createSubject(sub) {
    const id = generateSafeId('sub');
    const clean = normalizeSubjectDoc({ ...sub, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      try {
        await setDoc(doc(db, 'subjects', id), {
          ...clean,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `subjects/${id}`);
      }
      api.createSubject(clean).catch(() => {});
      return clean;
    }

    return await api.createSubject(clean);
  },

  async updateSubject(id, fullSub) {
    const clean = normalizeSubjectDoc({ ...fullSub, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      const { id: _ignored, ...updatable } = clean;
      try {
        await updateDoc(doc(db, 'subjects', id), {
          ...updatable,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `subjects/${id}`);
      }
      api.updateSubject(id, clean).catch(() => {});
      return clean;
    }

    return await api.updateSubject(id, clean);
  },

  async deleteSubject(id) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'subjects', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `subjects/${id}`);
      }
      api.deleteSubject(id).catch(() => {});
      return;
    }

    await api.deleteSubject(id);
  },

  // --- HALLS ---
  async createHall(hall) {
    const id = generateSafeId('hall');
    const clean = normalizeHallDoc({ ...hall, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      try {
        await setDoc(doc(db, 'halls', id), {
          ...clean,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `halls/${id}`);
      }
      api.createHall(clean).catch(() => {});
      return clean;
    }

    return await api.createHall(clean);
  },

  async updateHall(id, fullHall) {
    const clean = normalizeHallDoc({ ...fullHall, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      const { id: _ignored, ...updatable } = clean;
      try {
        await updateDoc(doc(db, 'halls', id), {
          ...updatable,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `halls/${id}`);
      }
      api.updateHall(id, clean).catch(() => {});
      return clean;
    }

    return await api.updateHall(id, clean);
  },

  async deleteHall(id) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'halls', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `halls/${id}`);
      }
      api.deleteHall(id).catch(() => {});
      return;
    }

    await api.deleteHall(id);
  },

  // --- FACULTY ---
  async createFaculty(fac) {
    const id = generateSafeId('fac');
    const clean = normalizeFacultyDoc({ ...fac, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      try {
        await setDoc(doc(db, 'faculty', id), {
          ...clean,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `faculty/${id}`);
      }
      api.createFaculty(clean).catch(() => {});
      return clean;
    }

    return await api.createFaculty(clean);
  },

  async updateFaculty(id, fullFac) {
    const clean = normalizeFacultyDoc({ ...fullFac, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      const { id: _ignored, ...updatable } = clean;
      try {
        await updateDoc(doc(db, 'faculty', id), {
          ...updatable,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `faculty/${id}`);
      }
      api.updateFaculty(id, clean).catch(() => {});
      return clean;
    }

    return await api.updateFaculty(id, clean);
  },

  async deleteFaculty(id) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'faculty', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `faculty/${id}`);
      }
      api.deleteFaculty(id).catch(() => {});
      return;
    }

    await api.deleteFaculty(id);
  },

  // --- STUDENTS ---
  async createStudent(stu) {
    const id = generateSafeId('stu');
    const clean = normalizeStudentDoc({ ...stu, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      try {
        await setDoc(doc(db, 'students', id), {
          ...clean,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `students/${id}`);
      }
      api.createStudent(clean).catch(() => {});
      return clean;
    }

    return await api.createStudent(clean);
  },

  async updateStudent(id, fullStu) {
    const clean = normalizeStudentDoc({ ...fullStu, id });
    if (isFirestoreActive()) {
      const uid = requireUid();
      const { id: _ignored, ...updatable } = clean;
      try {
        await updateDoc(doc(db, 'students', id), {
          ...updatable,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `students/${id}`);
      }
      api.updateStudent(id, clean).catch(() => {});
      return clean;
    }

    return await api.updateStudent(id, clean);
  },

  async deleteStudent(id) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'students', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
      }
      api.deleteStudent(id).catch(() => {});
      return;
    }

    await api.deleteStudent(id);
  },

  // --- SUBSECTION DIVISION ---
  async approveSubsectionDivision(department, subsectionCount, assignedStudents) {
    const subId = generateSafeId('subsec');
    if (isFirestoreActive()) {
      const uid = requireUid();
      const ops = assignedStudents.map((stu) => ({
        type: 'update',
        ref: doc(db, 'students', stu.id),
        data: {
          section: clampStr(stu.section, 64, 'A'),
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        },
      }));
      const assignments = assignedStudents.slice(0, 5000).map((s) => ({
        studentId: s.id,
        regNo: s.regNo,
        name: s.name,
        subsection: s.section,
      }));
      ops.push({
        type: 'set',
        ref: doc(db, 'subsections', subId),
        data: {
          id: subId,
          department: clampStr(department, 160, 'General'),
          subsectionCount: clampInt(subsectionCount, 1, 26, 1),
          totalStudents: clampInt(assignedStudents.length, 0, 10000, 0),
          assignments,
          createdBy: uid,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
      await commitChunkedOperations(ops, OperationType.WRITE, `subsections/${subId}`);
      api.divideSubsections(department, subsectionCount, true).catch(() => {});
      return { id: subId, department, subsectionCount, totalStudents: assignedStudents.length, assignments };
    }

    return await api.divideSubsections(department, subsectionCount, true);
  },

  // --- SCHEDULES, TIMETABLES, OPTIMIZATION RUNS & CONFLICT REPORTS ---
  async saveGeneratedSchedule(gaResult, scope = 'ALL', runMeta = {}) {
    const hadExplicitId = Boolean(gaResult?.scheduleId);
    const scheduleId = gaResult?.scheduleId || generateSafeId('sched');
    const timetableId = `tt-${scheduleId}`;
    const reportId = generateSafeId('rep');
    const runId = generateSafeId('garun');
    const executionMode = runMeta?.executionMode || gaResult?.executionMode || 'WEB_WORKER';
    const gaConfig = runMeta?.gaConfig || {};

    if (isFirestoreActive()) {
      const uid = requireUid();
      const schedRef = doc(db, 'schedules', scheduleId);
      const ttRef = doc(db, 'timetables', timetableId);
      const runRef = doc(db, 'optimizationRuns', runId);

      let schedSnap = null;
      let ttSnap = null;
      if (hadExplicitId) {
        try {
          schedSnap = await getDoc(schedRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `schedules/${scheduleId}`);
        }
        try {
          ttSnap = await getDoc(ttRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `timetables/${timetableId}`);
        }
      }

      const plan = buildScheduleMutationPlan({
        scheduleId,
        timetableId,
        reportId,
        schedule: gaResult?.schedule || [],
        conflicts: gaResult?.conflicts || {},
        gaResult,
        scope,
        uid,
        timestampToken: serverTimestamp(),
        schedExists: Boolean(schedSnap?.exists()),
        schedExistingData: schedSnap?.exists() ? schedSnap.data() : null,
        ttExists: Boolean(ttSnap?.exists()),
        ttExistingData: ttSnap?.exists() ? ttSnap.data() : null,
      });

      const runPayload = buildOptimizationRunPayload({
        runId,
        scheduleId,
        scope,
        executionMode,
        gaConfig,
        gaResult,
        uid,
        timestampToken: serverTimestamp(),
      });

      const batch = writeBatch(db);
      if (plan.scheduleMutation.mode === 'update') {
        batch.update(schedRef, plan.scheduleMutation.data);
      } else {
        batch.set(schedRef, plan.scheduleMutation.data);
      }
      if (plan.timetableMutation.mode === 'update') {
        batch.update(ttRef, plan.timetableMutation.data);
      } else {
        batch.set(ttRef, plan.timetableMutation.data);
      }
      batch.set(doc(db, 'conflictReports', reportId), plan.conflictReportMutation.data);
      batch.set(runRef, runPayload);

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `schedules/${scheduleId}`);
      }

      const clientRun = {
        ...runPayload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      api.saveSchedule({ ...gaResult, scheduleId, scope }).catch(() => {});
      api.saveOptimizationRun(clientRun).catch(() => {});
      return { scheduleId, timetableId, reportId, optimizationRun: clientRun };
    }

    const runDoc = buildOptimizationRunPayload({
      runId,
      scheduleId,
      scope,
      executionMode,
      gaConfig,
      gaResult,
      uid: 'local',
      timestampToken: new Date().toISOString(),
    });
    await api.saveSchedule({ ...gaResult, scheduleId, scope });
    const savedRun = await api.saveOptimizationRun(runDoc).catch(() => runDoc);
    return { scheduleId, timetableId, reportId, optimizationRun: savedRun };
  },

  async getScheduleById(scheduleId) {
    if (!scheduleId) return null;
    if (isFirestoreActive()) {
      let snap;
      try {
        snap = await getDoc(doc(db, 'schedules', scheduleId));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `schedules/${scheduleId}`);
      }
      if (!snap || !snap.exists()) return null;
      const d = snap.data();
      return {
        scheduleId: snap.id,
        schedule: d.schedule || [],
        bestFitness: Number(d.bestFitness || 0),
        history: d.history || [],
        conflicts: d.conflicts || {},
        convergedAtGeneration: Number(d.convergedAtGeneration || 0),
        executionTimeMs: Number(d.executionTimeMs || 0),
        scope: d.scope || 'ALL',
      };
    }

    const res = await api.getScheduleById(scheduleId);
    if (!res || !res.hasSchedule) return null;
    return res;
  },

  async deleteOptimizationRun(runId) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'optimizationRuns', runId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `optimizationRuns/${runId}`);
      }
      api.deleteOptimizationRun(runId).catch(() => {});
      return;
    }
    await api.deleteOptimizationRun(runId);
  },

  async updateScheduleExamSlot(
    scheduleId,
    updatedSchedule,
    conflicts,
    examId,
    updates,
    options = {}
  ) {
    const extraPayload = {
      ...(options?.allowOverride ? { allowOverride: true } : {}),
      ...(options?.policy ? { policy: options.policy } : {}),
    };

    if (isFirestoreActive()) {
      const uid = requireUid();
      const targetId = scheduleId || generateSafeId('sched');
      const timetableId = `tt-${targetId}`;
      const reportId = generateSafeId('rep');

      const schedRef = doc(db, 'schedules', targetId);
      const ttRef = doc(db, 'timetables', timetableId);

      let schedSnap;
      try {
        schedSnap = await getDoc(schedRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `schedules/${targetId}`);
      }

      let ttSnap;
      try {
        ttSnap = await getDoc(ttRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `timetables/${timetableId}`);
      }

      const plan = buildScheduleMutationPlan({
        scheduleId: targetId,
        timetableId,
        reportId,
        schedule: updatedSchedule,
        conflicts,
        gaResult: null,
        scope: schedSnap?.exists() ? schedSnap.data()?.scope : 'ALL',
        uid,
        timestampToken: serverTimestamp(),
        schedExists: Boolean(schedSnap?.exists()),
        schedExistingData: schedSnap?.exists() ? schedSnap.data() : null,
        ttExists: Boolean(ttSnap?.exists()),
        ttExistingData: ttSnap?.exists() ? ttSnap.data() : null,
      });

      const batch = writeBatch(db);
      if (plan.scheduleMutation.mode === 'update') {
        batch.update(schedRef, plan.scheduleMutation.data);
      } else {
        batch.set(schedRef, plan.scheduleMutation.data);
      }

      if (plan.timetableMutation.mode === 'update') {
        batch.update(ttRef, plan.timetableMutation.data);
      } else {
        batch.set(ttRef, plan.timetableMutation.data);
      }

      batch.set(doc(db, 'conflictReports', reportId), plan.conflictReportMutation.data);

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `schedules/${targetId}`);
      }

      if (updates) {
        api.updateScheduledExam({ examId, ...updates, ...extraPayload }).catch(() => {});
      }
      return {
        scheduleId: targetId,
        updatedSchedule: plan.cleanSchedule,
        conflicts: plan.cleanConflicts,
      };
    }

    if (updates && scheduleId) {
      try {
        return await api.updateScheduledExam({ examId, ...updates, ...extraPayload });
      } catch (err) {
        if (!String(err.message || '').includes('No schedule found')) {
          throw err;
        }
      }
    }
    const newSchedId = scheduleId || generateSafeId('sched');
    await api.saveSchedule({
      scheduleId: newSchedId,
      schedule: updatedSchedule,
      conflicts,
      ...extraPayload,
    });
    return { success: true, scheduleId: newSchedId, updatedSchedule, conflicts };
  },

  async batchUpdateScheduleSlots(
    scheduleId,
    updatedSchedule,
    conflicts,
    updatesList = [],
    options = {}
  ) {
    if (isFirestoreActive()) {
      const res = await this.updateScheduleExamSlot(
        scheduleId,
        updatedSchedule,
        conflicts,
        null,
        null,
        options
      );
      if (Array.isArray(updatesList) && updatesList.length > 0) {
        api.batchUpdateScheduledExams(updatesList, options).catch(() => {});
      }
      return res;
    }

    if (Array.isArray(updatesList) && updatesList.length > 0 && scheduleId) {
      try {
        return await api.batchUpdateScheduledExams(updatesList, options);
      } catch (err) {
        if (!String(err.message || '').includes('No schedule found')) {
          throw err;
        }
      }
    }

    const newSchedId = scheduleId || generateSafeId('sched');
    await api.saveSchedule({
      scheduleId: newSchedId,
      schedule: updatedSchedule,
      conflicts,
      ...(options?.allowOverride ? { allowOverride: true } : {}),
      ...(options?.policy ? { policy: options.policy } : {}),
    });
    return { success: true, scheduleId: newSchedId, updatedSchedule, conflicts };
  },

  async overrideFacultyDuty(scheduleId, examId, facultyId, updatedSchedule, conflicts) {
    if (isFirestoreActive()) {
      return await this.updateScheduleExamSlot(scheduleId, updatedSchedule, conflicts, examId, null);
    }
    if (scheduleId) {
      try {
        return await api.overrideFacultyDuty(examId, facultyId);
      } catch (err) {
        if (!String(err.message || '').includes('No schedule found')) {
          throw err;
        }
      }
    }
    const newSchedId = scheduleId || generateSafeId('sched');
    await api.saveSchedule({
      scheduleId: newSchedId,
      schedule: updatedSchedule,
      conflicts,
    });
    return { success: true, scheduleId: newSchedId, updatedSchedule, conflicts };
  },

  async saveConflictReport(scheduleId, schedule, conflicts) {
    const targetSchedId = scheduleId || generateSafeId('sched');
    const reportId = generateSafeId('rep');

    if (isFirestoreActive()) {
      const uid = requireUid();
      const reportDoc = buildConflictReportPayload({
        reportId,
        scheduleId: targetSchedId,
        schedule,
        conflicts,
        uid,
        timestampToken: serverTimestamp(),
      });
      try {
        await setDoc(doc(db, 'conflictReports', reportId), reportDoc);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `conflictReports/${reportId}`);
      }
      api.saveConflictReport({ scheduleId: targetSchedId, schedule, conflicts }).catch(() => {});
      return { reportId };
    }

    return await api.saveConflictReport({ scheduleId: targetSchedId, schedule, conflicts });
  },

  // --- HALL ALLOCATIONS ---
  async previewHallAllocation(config) {
    if (isFirestoreActive()) {
      return allocateExamHalls(config);
    }
    return await api.previewHallAllocation(config);
  },

  async lookupStudentHall(registrationNumber, { examDate = null, session = null, records = [] } = {}) {
    if (isFirestoreActive()) {
      const matches = lookupStudentHallAllocation(registrationNumber, records, { examDate, session });
      return matches.length > 0
        ? {
            found: true,
            registrationNumber: matches[0].regNo,
            studentName: matches[0].studentName,
            department: matches[0].department,
            hallNumber: matches[0].hallNumber,
            building: matches[0].building,
            seatNumber: matches[0].seatNumber,
            assignments: matches,
          }
        : {
            found: false,
            registrationNumber,
            assignments: [],
            error: `No confirmed hall allocation found for registration number '${registrationNumber}'.`,
          };
    }
    return await api.lookupStudentHall(registrationNumber, { examDate, session });
  },

  async saveHallAllocation(plan, existingAllocations = []) {
    const allocId = plan?.id || generateSafeId('hallalloc');
    const targetPct = Math.max(1, Math.min(100, Number(plan?.targetPercentage) || 50));
    const maxDepts = Math.max(1, Number(plan?.maxDeptsPerHall) || 2);
    const resolvedTargetMode =
      String(plan?.targetMode || '').toUpperCase() === 'CUSTOM'
        ? 'CUSTOM'
        : `PERCENT_${targetPct}`;

    const compactSummaries = (plan?.hallSummaries || [])
      .filter((h) => h.allocated > 0)
      .slice(0, 500)
      .map((h) => ({
        hallId: String(h.hallId || ''),
        hallNumber: clampStr(h.hallNumber, 40, 'HALL'),
        building: clampStr(h.building, 160, 'Main Block'),
        capacity: clampInt(h.capacity, 0, 5000, 60),
        allocated: clampInt(h.allocated, 0, 5000, 0),
        remainingCapacity: clampInt(h.remainingCapacity, 0, 5000, 0),
        departmentBreakdown: (h.departmentBreakdown || []).map((b) => ({
          department: clampStr(b.department, 160, 'General'),
          count: clampInt(b.count, 0, 5000, 0),
          firstRegNo: clampStr(b.firstRegNo, 40, ''),
          lastRegNo: clampStr(b.lastRegNo, 40, ''),
          regNoRange: clampStr(b.regNoRange, 100, ''),
        })),
      }));

    const compactAllocations = (plan?.allocations || [])
      .slice(0, 5000)
      .map((a) => ({
        studentId: String(a.studentId || ''),
        regNo: clampStr(a.regNo, 40, ''),
        studentName: clampStr(a.studentName, 160, ''),
        department: clampStr(a.department, 160, 'General'),
        section: clampStr(a.section, 64, 'Section A'),
        batch: clampStr(a.batch, 64, '2024'),
        hallId: String(a.hallId || ''),
        hallNumber: clampStr(a.hallNumber, 40, 'HALL'),
        building: clampStr(a.building, 160, 'Main Block'),
        rowNumber: clampInt(a.rowNumber, 1, 500, 1),
        colNumber: clampInt(a.colNumber, 1, 100, 1),
        seatNumber: clampInt(a.seatNumber, 1, 5000, 1),
      }));

    // Strict schema matching firestore.rules isValidHallAllocation
    const firestoreDoc = stripUndefinedDeep({
      id: allocId,
      examDate: clampStr(plan?.examDate, 40, '2026-05-10'),
      session: clampStr(plan?.session, 16, 'FN'),
      selectedDepartments: (plan?.selectedDepartments || []).slice(0, 100).map((d) => clampStr(d, 160, '')),
      targetMode: clampStr(resolvedTargetMode, 32, 'PERCENT_50'),
      customTargetPerDept: clampInt(plan?.customTargetPerDept, 0, 5000, 0),
      totalStudents: clampInt(plan?.totalStudents, 0, 20000, 0),
      totalAllocated: clampInt(plan?.totalAllocated, 0, 20000, 0),
      hallsRequired: clampInt(plan?.hallsRequired, 0, 500, compactSummaries.length),
      remainingAvailableCapacity: clampInt(plan?.remainingAvailableCapacity, 0, 100000, 0),
      hallSummaries: compactSummaries,
      allocations: compactAllocations,
    });

    const fullRecord = {
      ...firestoreDoc,
      targetPercentage: targetPct,
      maxDeptsPerHall: maxDepts,
      selectedHallIds: Array.isArray(plan?.selectedHallIds) ? plan.selectedHallIds : [],
    };

    if (isFirestoreActive()) {
      const validation = validateHallAllocationPlan(fullRecord, existingAllocations);
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }

      const uid = requireUid();
      const allocRef = doc(db, 'hallAllocations', allocId);
      let snap = null;
      if (plan?.id) {
        try {
          snap = await getDoc(allocRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `hallAllocations/${allocId}`);
        }
      }
      if (snap?.exists()) {
        const { id: _id, ...updatable } = firestoreDoc;
        try {
          await updateDoc(allocRef, {
            ...updatable,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `hallAllocations/${allocId}`);
        }
      } else {
        try {
          await setDoc(allocRef, {
            ...firestoreDoc,
            createdBy: uid,
            updatedBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `hallAllocations/${allocId}`);
        }
      }
      api.confirmHallAllocation(fullRecord).catch(() => {});
      return fullRecord;
    }

    return await api.confirmHallAllocation(fullRecord);
  },

  async deleteHallAllocation(id) {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'hallAllocations', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `hallAllocations/${id}`);
      }
      api.deleteHallAllocation(id).catch(() => {});
      return;
    }

    await api.deleteHallAllocation(id);
  },
};
