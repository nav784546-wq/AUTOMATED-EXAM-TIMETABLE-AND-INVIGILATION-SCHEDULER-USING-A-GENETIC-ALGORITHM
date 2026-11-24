/**
 * REST API client connecting the React frontend to the Python backend.
 * Propagates HTTP and validation errors directly so failed operations are never ignored.
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error || `Request failed with status ${res.status}`);
  }
  return await res.json();
}

export const api = {
  // Health
  checkHealth: () => request('/health'),

  // Overview
  getOverviewStats: () => request('/overview/stats'),

  // Departments
  getDepartments: () => request('/departments'),
  createDepartment: (dept) => request('/departments', { method: 'POST', body: JSON.stringify(dept) }),
  updateDepartment: (id, dept) => request(`/departments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(dept) }),
  deleteDepartment: (id) => request(`/departments/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Batches
  getBatches: () => request('/batches'),
  createBatch: (batch) => request('/batches', { method: 'POST', body: JSON.stringify(batch) }),
  updateBatch: (id, batch) => request(`/batches/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(batch) }),
  deleteBatch: (id) => request(`/batches/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Sections
  getSections: (department) => request(`/sections${department ? `?department=${encodeURIComponent(department)}` : ''}`),
  createSection: (section) => request('/sections', { method: 'POST', body: JSON.stringify(section) }),
  updateSection: (id, section) => request(`/sections/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(section) }),
  deleteSection: (id) => request(`/sections/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Subjects
  getSubjects: (department) => request(`/subjects${department ? `?department=${encodeURIComponent(department)}` : ''}`),
  createSubject: (sub) => request('/subjects', { method: 'POST', body: JSON.stringify(sub) }),
  updateSubject: (id, sub) => request(`/subjects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(sub) }),
  deleteSubject: (id) => request(`/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Halls
  getHalls: () => request('/halls'),
  createHall: (hall) => request('/halls', { method: 'POST', body: JSON.stringify(hall) }),
  updateHall: (id, hall) => request(`/halls/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(hall) }),
  deleteHall: (id) => request(`/halls/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Faculty
  getFaculty: () => request('/faculty'),
  createFaculty: (fac) => request('/faculty', { method: 'POST', body: JSON.stringify(fac) }),
  updateFaculty: (id, fac) => request(`/faculty/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(fac) }),
  deleteFaculty: (id) => request(`/faculty/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Students
  getStudents: (department) => request(`/students${department ? `?department=${encodeURIComponent(department)}` : ''}`),
  getStudentsSummary: () => request('/students/summary'),
  queryStudents: ({ department = 'ALL', batch = 'ALL', section = 'ALL', search = '', page = 1, pageSize = 25 } = {}) => {
    const qs = new URLSearchParams({
      department,
      batch,
      section,
      search,
      page: String(page),
      pageSize: String(pageSize),
    });
    return request(`/students/query?${qs.toString()}`);
  },
  createStudent: (stu) => request('/students', { method: 'POST', body: JSON.stringify(stu) }),
  updateStudent: (id, stu) => request(`/students/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(stu) }),
  deleteStudent: (id) => request(`/students/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Subsections
  getLatestSubsections: () => request('/subsections/latest'),
  divideSubsections: (department, subsectionCount, applyToDatabase = false) =>
    request('/subsections/divide', {
      method: 'POST',
      body: JSON.stringify({ department, subsectionCount, applyToDatabase }),
    }),

  // GA Scheduler & Timetables
  getSchedulingPolicy: () => request('/scheduler/policy'),
  updateSchedulingPolicy: (policy) =>
    request('/scheduler/policy', {
      method: 'PUT',
      body: JSON.stringify(policy || {}),
    }),
  getGAConfig: () => request('/scheduler/ga-config'),
  updateGAConfig: (config) =>
    request('/scheduler/ga-config', {
      method: 'PUT',
      body: JSON.stringify(config || {}),
    }),
  validateSchedule: (payload) =>
    request('/scheduler/validate', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  runGAScheduler: (config) =>
    request('/scheduler/run', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    }),
  saveSchedule: (payload) =>
    request('/scheduler/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getLatestSchedule: () => request('/scheduler/latest'),
  getScheduleById: (id) => request(`/schedules/${encodeURIComponent(id)}`),
  getOptimizationRuns: () => request('/optimization-runs'),
  saveOptimizationRun: (payload) =>
    request('/optimization-runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteOptimizationRun: (id) =>
    request(`/optimization-runs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateScheduledExam: (payload) =>
    request('/scheduler/update-exam', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  batchUpdateScheduledExams: (updates, options = {}) =>
    request('/scheduler/batch-update', {
      method: 'POST',
      body: JSON.stringify({
        updates,
        allowOverride: Boolean(options?.allowOverride),
        ...(options?.policy ? { policy: options.policy } : {}),
      }),
    }),
  overrideFacultyDuty: (examId, facultyId) =>
    request('/scheduler/override-faculty', {
      method: 'POST',
      body: JSON.stringify({ examId, facultyId }),
    }),

  // Conflict Reports
  getLatestConflictReport: () => request('/conflict-reports/latest'),
  saveConflictReport: (payload) =>
    request('/conflict-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Seating & Hall Allocations
  getHallAllocations: () => request('/hall-allocations'),
  generateHallAllocation: (payload) =>
    request('/hall-allocation/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  previewHallAllocation: (payload) =>
    request('/hall-allocation/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  confirmHallAllocation: (payload) =>
    request('/hall-allocation/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getHallAllocationReport: ({ allocationId, format = 'ALL', department = 'ALL', examDate, session } = {}) => {
    const qs = new URLSearchParams({ format, department });
    if (allocationId) qs.set('allocationId', allocationId);
    if (examDate) qs.set('examDate', examDate);
    if (session) qs.set('session', session);
    return request(`/hall-allocation/report?${qs.toString()}`);
  },
  lookupStudentHall: async (registrationNumber, { examDate, session } = {}) => {
    const qs = new URLSearchParams();
    if (examDate) qs.set('examDate', examDate);
    if (session) qs.set('session', session);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetch(
      `${API_BASE}/hall-allocation/student/${encodeURIComponent(String(registrationNumber || '').trim())}${queryStr}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      return {
        found: false,
        registrationNumber,
        assignments: [],
        error: data.error || 'No hall allocation found for this registration number.',
      };
    }
    if (!res.ok) {
      throw new Error(data.detail || data.error || `Request failed with status ${res.status}`);
    }
    return data;
  },
  saveHallAllocation: (payload) =>
    request('/hall-allocations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteHallAllocation: (id) =>
    request(`/hall-allocations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  generateSeatingPlan: (columnsPerRow = 6) =>
    request('/seating/generate', {
      method: 'POST',
      body: JSON.stringify({ columnsPerRow }),
    }),
};
