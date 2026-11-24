import { useCallback, useMemo, useState } from 'react';
import { persistenceService } from '../services/persistenceService.js';
import { logSystemAuditEvent } from '../services/auditService.js';
import {
  validateUniqueFacultyId,
  validateUniqueHallNumber,
  validateUniqueName,
  validateUniqueSection,
  validateUniqueStudentRegNo,
  validateUniqueSubjectCode,
} from '../utils/dataValidation.js';

export function useExamEntities({
  showSuccess,
  showError,
  requestDeleteConfirmation,
  actorEmail = '',
  actorUid = '',
}) {
  const [departmentRecords, setDepartmentRecords] = useState([]);
  const [batchRecords, setBatchRecords] = useState([]);
  const [sectionRecords, setSectionRecords] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [halls, setHalls] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [students, setStudents] = useState([]);
  const [subsectionRecords, setSubsectionRecords] = useState([]);
  const [hallAllocations, setHallAllocations] = useState([]);

  const setEntitiesFromHydration = useCallback((data) => {
    setDepartmentRecords(data.departments || []);
    setBatchRecords(data.batches || []);
    setSectionRecords(data.sections || []);
    setSubjects(data.subjects || []);
    setHalls(data.halls || []);
    setFaculty(data.faculty || []);
    setStudents(data.students || []);
    setSubsectionRecords(data.subsections || []);
    setHallAllocations(data.hallAllocations || []);
  }, []);

  const departments = useMemo(
    () => departmentRecords.map((d) => d.name),
    [departmentRecords]
  );

  const batches = useMemo(
    () => batchRecords.map((b) => b.name),
    [batchRecords]
  );

  const sectionsByDept = useMemo(() => {
    const map = {};
    departmentRecords.forEach((d) => {
      map[d.name] = [];
    });
    sectionRecords.forEach((sec) => {
      if (!map[sec.department]) {
        map[sec.department] = [];
      }
      if (!map[sec.department].includes(sec.name)) {
        map[sec.department].push(sec.name);
      }
    });
    return map;
  }, [departmentRecords, sectionRecords]);

  const exams = useMemo(
    () =>
      subjects.map((s) => ({
        id: `exam-${s.id}`,
        subjectId: s.id,
        durationMinutes: 180,
      })),
    [subjects]
  );

  // --- DEPARTMENTS ---
  const handleAddDepartment = useCallback(
    async (deptName, initialSecs = ['Section A', 'Section B']) => {
      const check = validateUniqueName(departmentRecords, deptName, 'Department');
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const res = await persistenceService.createDepartment(check.value, initialSecs);
        setDepartmentRecords((prev) =>
          [...prev, res.department].sort((a, b) => a.name.localeCompare(b.name))
        );
        if (Array.isArray(res.sections) && res.sections.length > 0) {
          setSectionRecords((prev) => [...prev, ...res.sections]);
        }
        showSuccess(`Department "${check.value}" saved to database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'DEPARTMENT_CREATED',
          summary: `Added academic department "${check.value}".`,
          actorEmail,
          actorUid,
          targetType: 'department',
          targetId: res?.department?.id || '',
          targetLabel: check.value,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [departmentRecords, showError, showSuccess, actorEmail, actorUid]
  );

  const handleRenameDepartment = useCallback(
    async (oldName, newName) => {
      const target = departmentRecords.find((d) => d.name === oldName);
      if (!target) {
        showError(`Department "${oldName}" was not found.`);
        return false;
      }
      const check = validateUniqueName(departmentRecords, newName, 'Department', target.id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        await persistenceService.renameDepartment(target.id, oldName, check.value, {
          sections: sectionRecords,
          subjects,
          faculty,
          students,
        });
        setDepartmentRecords((prev) =>
          prev
            .map((d) => (d.id === target.id ? { ...d, name: check.value } : d))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setSectionRecords((prev) =>
          prev.map((s) => (s.department === oldName ? { ...s, department: check.value } : s))
        );
        setStudents((prev) =>
          prev.map((s) => (s.department === oldName ? { ...s, department: check.value } : s))
        );
        setSubjects((prev) =>
          prev.map((s) => (s.department === oldName ? { ...s, department: check.value } : s))
        );
        setFaculty((prev) =>
          prev.map((f) => (f.department === oldName ? { ...f, department: check.value } : f))
        );
        showSuccess(`Department renamed to "${check.value}" and saved.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'DEPARTMENT_RENAMED',
          summary: `Renamed department "${oldName}" to "${check.value}".`,
          actorEmail,
          actorUid,
          targetType: 'department',
          targetId: target.id,
          targetLabel: check.value,
          metadata: { oldName, newName: check.value },
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [departmentRecords, sectionRecords, subjects, faculty, students, showError, showSuccess, actorEmail, actorUid]
  );

  const handleDeleteDepartment = useCallback(
    (deptName) => {
      const target = departmentRecords.find((d) => d.name === deptName);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Department',
        message: `Permanently delete department "${deptName}" and its section definitions from the database?`,
        onConfirm: async () => {
          try {
            const deptSections = sectionRecords.filter((s) => s.department === deptName);
            await persistenceService.deleteDepartment(target.id, deptSections);
            setDepartmentRecords((prev) => prev.filter((d) => d.id !== target.id));
            setSectionRecords((prev) => prev.filter((s) => s.department !== deptName));
            showSuccess(`Department "${deptName}" permanently deleted.`);
            void logSystemAuditEvent({
              category: 'academic_data',
              action: 'DEPARTMENT_DELETED',
              summary: `Deleted academic department "${deptName}".`,
              actorEmail,
              actorUid,
              targetType: 'department',
              targetId: target.id,
              targetLabel: deptName,
            });
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [departmentRecords, sectionRecords, requestDeleteConfirmation, showSuccess, showError, actorEmail, actorUid]
  );

  // --- BATCHES ---
  const handleAddBatch = useCallback(
    async (batchName) => {
      const check = validateUniqueName(batchRecords, batchName, 'Batch');
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const created = await persistenceService.createBatch(check.value);
        setBatchRecords((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        );
        showSuccess(`Batch "${check.value}" saved to database.`);
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [batchRecords, showError, showSuccess]
  );

  const handleEditBatch = useCallback(
    async (oldBatchName, newBatchName) => {
      const target = batchRecords.find((b) => b.name === oldBatchName);
      if (!target) {
        showError(`Batch "${oldBatchName}" was not found.`);
        return false;
      }
      const check = validateUniqueName(batchRecords, newBatchName, 'Batch', target.id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        await persistenceService.updateBatch(target.id, oldBatchName, check.value, {
          students,
          subjects,
        });
        setBatchRecords((prev) =>
          prev
            .map((b) => (b.id === target.id ? { ...b, name: check.value } : b))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setStudents((prev) =>
          prev.map((s) => (s.batch === oldBatchName ? { ...s, batch: check.value } : s))
        );
        setSubjects((prev) =>
          prev.map((s) => (s.batch === oldBatchName ? { ...s, batch: check.value } : s))
        );
        showSuccess(`Batch updated to "${check.value}".`);
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [batchRecords, students, subjects, showError, showSuccess]
  );

  const handleDeleteBatch = useCallback(
    (batchName) => {
      const target = batchRecords.find((b) => b.name === batchName);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Academic Batch',
        message: `Permanently delete batch "${batchName}" from the database?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteBatch(target.id);
            setBatchRecords((prev) => prev.filter((b) => b.id !== target.id));
            showSuccess(`Batch "${batchName}" deleted.`);
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [batchRecords, requestDeleteConfirmation, showSuccess, showError]
  );

  // --- SECTIONS ---
  const handleAddSection = useCallback(
    async (department, sectionName) => {
      const check = validateUniqueSection(sectionRecords, department, sectionName);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const created = await persistenceService.createSection(department, check.value);
        setSectionRecords((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        );
        showSuccess(`Section "${check.value}" added to ${department}.`);
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [sectionRecords, showError, showSuccess]
  );

  const handleRenameSection = useCallback(
    async (department, oldSec, newSec) => {
      const target = sectionRecords.find(
        (s) => s.department === department && s.name === oldSec
      );
      if (!target) {
        showError(`Section "${oldSec}" in ${department} was not found.`);
        return false;
      }
      const check = validateUniqueSection(sectionRecords, department, newSec, target.id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        await persistenceService.renameSection(target.id, department, oldSec, check.value, {
          students,
          subjects,
        });
        setSectionRecords((prev) =>
          prev
            .map((s) => (s.id === target.id ? { ...s, name: check.value } : s))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setStudents((prev) =>
          prev.map((s) =>
            s.department === department && s.section === oldSec
              ? { ...s, section: check.value }
              : s
          )
        );
        setSubjects((prev) =>
          prev.map((s) =>
            s.department === department && s.section === oldSec
              ? { ...s, section: check.value }
              : s
          )
        );
        showSuccess(`Section renamed to "${check.value}".`);
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [sectionRecords, students, subjects, showError, showSuccess]
  );

  const handleDeleteSection = useCallback(
    (department, sectionName) => {
      const target = sectionRecords.find(
        (s) => s.department === department && s.name === sectionName
      );
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Section',
        message: `Permanently delete "${sectionName}" from ${department}?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteSection(target.id);
            setSectionRecords((prev) => prev.filter((s) => s.id !== target.id));
            showSuccess(`Section "${sectionName}" deleted from ${department}.`);
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [sectionRecords, requestDeleteConfirmation, showSuccess, showError]
  );

  // --- SUBJECTS ---
  const handleAddSubject = useCallback(
    async (sub) => {
      const check = validateUniqueSubjectCode(subjects, sub.code);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const created = await persistenceService.createSubject({
          ...sub,
          code: check.value,
        });
        setSubjects((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
        showSuccess(`Subject ${created.code} saved to database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'SUBJECT_CREATED',
          summary: `Added subject ${created.code} (${created.name}).`,
          actorEmail,
          actorUid,
          targetType: 'subject',
          targetId: created.id || '',
          targetLabel: `${created.code} · ${created.department}`,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [subjects, showError, showSuccess, actorEmail, actorUid]
  );

  const handleUpdateSubject = useCallback(
    async (id, updates) => {
      const existing = subjects.find((s) => s.id === id);
      if (!existing) {
        showError('Subject not found.');
        return false;
      }
      const merged = { ...existing, ...updates };
      const check = validateUniqueSubjectCode(subjects, merged.code, id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const saved = await persistenceService.updateSubject(id, {
          ...merged,
          code: check.value,
        });
        setSubjects((prev) =>
          prev.map((s) => (s.id === id ? saved : s)).sort((a, b) => a.code.localeCompare(b.code))
        );
        showSuccess(`Subject ${saved.code} updated in database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'SUBJECT_UPDATED',
          summary: `Updated subject ${saved.code} (${saved.name}).`,
          actorEmail,
          actorUid,
          targetType: 'subject',
          targetId: id,
          targetLabel: saved.code,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [subjects, showError, showSuccess, actorEmail, actorUid]
  );

  const handleDeleteSubject = useCallback(
    (id) => {
      const target = subjects.find((s) => s.id === id);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Subject',
        message: `Permanently delete subject ${target.code} (${target.name}) from the database?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteSubject(id);
            setSubjects((prev) => prev.filter((s) => s.id !== id));
            showSuccess(`Subject ${target.code} deleted.`);
            void logSystemAuditEvent({
              category: 'academic_data',
              action: 'SUBJECT_DELETED',
              summary: `Deleted subject ${target.code} (${target.name}).`,
              actorEmail,
              actorUid,
              targetType: 'subject',
              targetId: id,
              targetLabel: target.code,
            });
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [subjects, requestDeleteConfirmation, showSuccess, showError, actorEmail, actorUid]
  );

  // --- HALLS ---
  const handleAddHall = useCallback(
    async (hall) => {
      const check = validateUniqueHallNumber(halls, hall.hallNumber);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const created = await persistenceService.createHall({
          ...hall,
          hallNumber: check.value,
        });
        setHalls((prev) =>
          [...prev, created].sort((a, b) => a.hallNumber.localeCompare(b.hallNumber))
        );
        showSuccess(`Hall ${created.hallNumber} saved to database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'HALL_CREATED',
          summary: `Added examination hall ${created.hallNumber} (${created.building}, cap ${created.capacity}).`,
          actorEmail,
          actorUid,
          targetType: 'hall',
          targetId: created.id || '',
          targetLabel: created.hallNumber,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [halls, showError, showSuccess, actorEmail, actorUid]
  );

  const handleUpdateHall = useCallback(
    async (id, updates) => {
      const existing = halls.find((h) => h.id === id);
      if (!existing) {
        showError('Examination hall not found.');
        return false;
      }
      const merged = { ...existing, ...updates };
      const check = validateUniqueHallNumber(halls, merged.hallNumber, id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const saved = await persistenceService.updateHall(id, {
          ...merged,
          hallNumber: check.value,
        });
        setHalls((prev) =>
          prev
            .map((h) => (h.id === id ? saved : h))
            .sort((a, b) => a.hallNumber.localeCompare(b.hallNumber))
        );
        showSuccess(`Hall ${saved.hallNumber} updated in database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'HALL_UPDATED',
          summary: `Updated examination hall ${saved.hallNumber} (available: ${saved.available ? 'yes' : 'no'}).`,
          actorEmail,
          actorUid,
          targetType: 'hall',
          targetId: id,
          targetLabel: saved.hallNumber,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [halls, showError, showSuccess, actorEmail, actorUid]
  );

  const handleToggleHall = useCallback(
    async (id) => {
      const existing = halls.find((h) => h.id === id);
      if (!existing) return false;
      return await handleUpdateHall(id, { available: !existing.available });
    },
    [halls, handleUpdateHall]
  );

  const handleDeleteHall = useCallback(
    (id) => {
      const target = halls.find((h) => h.id === id);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Examination Hall',
        message: `Permanently delete hall ${target.hallNumber} (${target.building}) from the database?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteHall(id);
            setHalls((prev) => prev.filter((h) => h.id !== id));
            showSuccess(`Hall ${target.hallNumber} deleted.`);
            void logSystemAuditEvent({
              category: 'academic_data',
              action: 'HALL_DELETED',
              summary: `Deleted examination hall ${target.hallNumber}.`,
              actorEmail,
              actorUid,
              targetType: 'hall',
              targetId: id,
              targetLabel: target.hallNumber,
            });
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [halls, requestDeleteConfirmation, showSuccess, showError, actorEmail, actorUid]
  );

  // --- FACULTY ---
  const handleAddFaculty = useCallback(
    async (fac) => {
      const check = validateUniqueFacultyId(faculty, fac.employeeId);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const created = await persistenceService.createFaculty({
          ...fac,
          employeeId: check.value,
        });
        setFaculty((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        showSuccess(`Faculty ${created.name} (${created.employeeId}) saved to database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'FACULTY_CREATED',
          summary: `Added faculty member ${created.name} (${created.employeeId}).`,
          actorEmail,
          actorUid,
          targetType: 'faculty',
          targetId: created.id || '',
          targetLabel: `${created.employeeId} · ${created.name}`,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [faculty, showError, showSuccess, actorEmail, actorUid]
  );

  const handleUpdateFaculty = useCallback(
    async (id, updates) => {
      const existing = faculty.find((f) => f.id === id);
      if (!existing) {
        showError('Faculty member not found.');
        return false;
      }
      const merged = { ...existing, ...updates };
      const check = validateUniqueFacultyId(faculty, merged.employeeId, id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const saved = await persistenceService.updateFaculty(id, {
          ...merged,
          employeeId: check.value,
        });
        setFaculty((prev) =>
          prev.map((f) => (f.id === id ? saved : f)).sort((a, b) => a.name.localeCompare(b.name))
        );
        showSuccess(`Faculty ${saved.name} updated in database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'FACULTY_UPDATED',
          summary: `Updated faculty member ${saved.name} (${saved.employeeId}).`,
          actorEmail,
          actorUid,
          targetType: 'faculty',
          targetId: id,
          targetLabel: saved.employeeId,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [faculty, showError, showSuccess, actorEmail, actorUid]
  );

  const handleToggleFaculty = useCallback(
    async (id) => {
      const existing = faculty.find((f) => f.id === id);
      if (!existing) return false;
      return await handleUpdateFaculty(id, { available: !existing.available });
    },
    [faculty, handleUpdateFaculty]
  );

  const handleDeleteFaculty = useCallback(
    (id) => {
      const target = faculty.find((f) => f.id === id);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Faculty Member',
        message: `Permanently delete ${target.name} (${target.employeeId}) from the database?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteFaculty(id);
            setFaculty((prev) => prev.filter((f) => f.id !== id));
            showSuccess(`Faculty ${target.name} deleted.`);
            void logSystemAuditEvent({
              category: 'academic_data',
              action: 'FACULTY_DELETED',
              summary: `Deleted faculty member ${target.name} (${target.employeeId}).`,
              actorEmail,
              actorUid,
              targetType: 'faculty',
              targetId: id,
              targetLabel: target.employeeId,
            });
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [faculty, requestDeleteConfirmation, showSuccess, showError, actorEmail, actorUid]
  );

  // --- STUDENTS ---
  const handleAddStudent = useCallback(
    async (stu) => {
      const check = validateUniqueStudentRegNo(students, stu.regNo);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const created = await persistenceService.createStudent({
          ...stu,
          regNo: check.value,
        });
        setStudents((prev) => [...prev, created].sort((a, b) => a.regNo.localeCompare(b.regNo)));
        showSuccess(`Student ${created.regNo} (${created.name}) saved to database.`);
        void logSystemAuditEvent({
          category: 'academic_data',
          action: 'STUDENT_CREATED',
          summary: `Added student record ${created.regNo} (${created.name}).`,
          actorEmail,
          actorUid,
          targetType: 'student',
          targetId: created.id || '',
          targetLabel: created.regNo,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [students, showError, showSuccess, actorEmail, actorUid]
  );

  const handleUpdateStudent = useCallback(
    async (id, updates) => {
      const existing = students.find((s) => s.id === id);
      if (!existing) {
        showError('Student record not found.');
        return false;
      }
      const merged = { ...existing, ...updates };
      const check = validateUniqueStudentRegNo(students, merged.regNo, id);
      if (!check.valid) {
        showError(check.error);
        return false;
      }
      try {
        const saved = await persistenceService.updateStudent(id, {
          ...merged,
          regNo: check.value,
        });
        setStudents((prev) =>
          prev.map((s) => (s.id === id ? saved : s)).sort((a, b) => a.regNo.localeCompare(b.regNo))
        );
        showSuccess(`Student ${saved.regNo} updated in database.`);
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [students, showError, showSuccess]
  );

  const handleDeleteStudent = useCallback(
    (id) => {
      const target = students.find((s) => s.id === id);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Student Record',
        message: `Permanently delete student ${target.regNo} (${target.name}) from the database?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteStudent(id);
            setStudents((prev) => prev.filter((s) => s.id !== id));
            showSuccess(`Student ${target.regNo} deleted.`);
            void logSystemAuditEvent({
              category: 'academic_data',
              action: 'STUDENT_DELETED',
              summary: `Deleted student ${target.regNo} (${target.name}).`,
              actorEmail,
              actorUid,
              targetType: 'student',
              targetId: id,
              targetLabel: target.regNo,
            });
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [students, requestDeleteConfirmation, showSuccess, showError, actorEmail, actorUid]
  );

  // --- SUBSECTION DIVISION ---
  const handleApproveSubsectionDivision = useCallback(
    async (department, subsectionCount, assignedStudents) => {
      try {
        const savedSub = await persistenceService.approveSubsectionDivision(
          department,
          subsectionCount,
          assignedStudents
        );
        const updatedMap = new Map(assignedStudents.map((s) => [s.id, s]));
        setStudents((prev) => prev.map((s) => (updatedMap.has(s.id) ? updatedMap.get(s.id) : s)));
        if (savedSub && savedSub.department) {
          setSubsectionRecords((prev) => [
            savedSub,
            ...prev.filter((r) => r.department !== department),
          ]);
        }
        showSuccess(`Subsection division for ${department} saved to database.`);
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'SUBSECTION_DIVIDED',
          summary: `Approved ${subsectionCount}-subsection division for ${department} (${assignedStudents.length} students).`,
          actorEmail,
          actorUid,
          targetType: 'subsection',
          targetId: savedSub?.id || '',
          targetLabel: department,
        });
        return true;
      } catch (err) {
        showError(err);
        return false;
      }
    },
    [showError, showSuccess, actorEmail, actorUid]
  );

  // --- HALL ALLOCATIONS ---
  const handleSaveHallAllocation = useCallback(
    async (plan) => {
      try {
        const saved = await persistenceService.saveHallAllocation(plan, hallAllocations);
        setHallAllocations((prev) => [
          saved,
          ...prev.filter((item) => item.id !== saved.id),
        ]);
        showSuccess(
          `Hall allocation for ${saved.examDate} (${saved.session}) saved to database (${saved.totalAllocated} students across ${saved.hallsRequired} hall${saved.hallsRequired === 1 ? '' : 's'}).`
        );
        void logSystemAuditEvent({
          category: 'scheduling',
          action: 'HALL_ALLOCATION_CONFIRMED',
          summary: `Confirmed seating hall allocation for ${saved.examDate} (${saved.session}): ${saved.totalAllocated} students across ${saved.hallsRequired} hall(s).`,
          actorEmail,
          actorUid,
          targetType: 'hall_allocation',
          targetId: saved.id || '',
          targetLabel: `${saved.examDate} (${saved.session})`,
        });
        return saved;
      } catch (err) {
        showError(err);
        return null;
      }
    },
    [hallAllocations, showSuccess, showError, actorEmail, actorUid]
  );

  const handleDeleteHallAllocation = useCallback(
    (id) => {
      const target = hallAllocations.find((item) => item.id === id);
      if (!target) return;
      requestDeleteConfirmation({
        title: 'Delete Saved Hall Allocation',
        message: `Permanently delete hall allocation for ${target.examDate} (${target.session}) covering ${target.totalAllocated} student(s)?`,
        onConfirm: async () => {
          try {
            await persistenceService.deleteHallAllocation(id);
            setHallAllocations((prev) => prev.filter((item) => item.id !== id));
            showSuccess(`Hall allocation for ${target.examDate} (${target.session}) deleted.`);
            void logSystemAuditEvent({
              category: 'scheduling',
              action: 'HALL_ALLOCATION_DELETED',
              summary: `Deleted hall allocation for ${target.examDate} (${target.session}).`,
              actorEmail,
              actorUid,
              targetType: 'hall_allocation',
              targetId: id,
              targetLabel: `${target.examDate} (${target.session})`,
            });
          } catch (err) {
            showError(err);
          }
        },
      });
    },
    [hallAllocations, requestDeleteConfirmation, showSuccess, showError, actorEmail, actorUid]
  );

  return {
    departmentRecords,
    batchRecords,
    sectionRecords,
    departments,
    batches,
    sectionsByDept,
    subjects,
    halls,
    faculty,
    students,
    setStudents,
    subsectionRecords,
    hallAllocations,
    exams,
    setEntitiesFromHydration,
    handleAddDepartment,
    handleRenameDepartment,
    handleDeleteDepartment,
    handleAddBatch,
    handleEditBatch,
    handleDeleteBatch,
    handleAddSection,
    handleRenameSection,
    handleDeleteSection,
    handleAddSubject,
    handleUpdateSubject,
    handleDeleteSubject,
    handleAddHall,
    handleUpdateHall,
    handleToggleHall,
    handleDeleteHall,
    handleAddFaculty,
    handleUpdateFaculty,
    handleToggleFaculty,
    handleDeleteFaculty,
    handleAddStudent,
    handleUpdateStudent,
    handleDeleteStudent,
    handleApproveSubsectionDivision,
    handleSaveHallAllocation,
    handleDeleteHallAllocation,
  };
}
