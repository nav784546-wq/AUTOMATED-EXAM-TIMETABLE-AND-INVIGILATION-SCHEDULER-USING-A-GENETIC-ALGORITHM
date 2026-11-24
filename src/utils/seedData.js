export const INITIAL_DEPARTMENTS = [
  'BCA (AI & DS)',
  'BCA (DT)',
  'B.Sc. Computer Science (B.Sc. CSE)',
  'B.Tech',
  'EEE',
  'ECE',
];

export const INITIAL_BATCHES = ['2023', '2024', '2025'];

export const INITIAL_SECTIONS_BY_DEPT = {
  'BCA (AI & DS)': ['Section A', 'Section B', 'Section C'],
  'BCA (DT)': ['Section A', 'Section B'],
  'B.Sc. Computer Science (B.Sc. CSE)': ['Section A', 'Section B'],
  'B.Tech': ['Section A', 'Section B'],
  'EEE': ['Section A', 'Section B'],
  'ECE': ['Section A', 'Section B'],
};

export const INITIAL_SUBJECTS = [
  { id: 'sub-1', code: 'AIDS301', name: 'Machine Learning Foundations', department: 'BCA (AI & DS)', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 58 },
  { id: 'sub-2', code: 'AIDS302', name: 'Data Wrangling & Visualization', department: 'BCA (AI & DS)', batch: '2024', section: 'Section B', semester: 3, enrolledCount: 56 },
  { id: 'sub-3', code: 'AIDS501', name: 'Deep Learning & Neural Nets', department: 'BCA (AI & DS)', batch: '2023', section: 'Section A', semester: 5, enrolledCount: 52 },
  { id: 'sub-4', code: 'DT301', name: 'Design Thinking & Prototyping', department: 'BCA (DT)', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 48 },
  { id: 'sub-5', code: 'CS201', name: 'Data Structures & Algorithms', department: 'B.Sc. Computer Science (B.Sc. CSE)', batch: '2025', section: 'Section A', semester: 1, enrolledCount: 62 },
  { id: 'sub-6', code: 'BT301', name: 'Operating Systems', department: 'B.Tech', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 64 },
  { id: 'sub-7', code: 'EE302', name: 'Power Systems & Machines', department: 'EEE', batch: '2024', section: 'Section A', semester: 3, enrolledCount: 50 },
  { id: 'sub-8', code: 'EC304', name: 'Digital Signal Processing', department: 'ECE', batch: '2024', section: 'Section B', semester: 3, enrolledCount: 46 },
];

export const INITIAL_HALLS = [
  { id: 'hall-1', hallNumber: 'A-101', building: 'Main Academic Block', capacity: 60, available: true },
  { id: 'hall-2', hallNumber: 'A-102', building: 'Main Academic Block', capacity: 60, available: true },
  { id: 'hall-3', hallNumber: 'B-201', building: 'Science & Tech Wing', capacity: 100, available: true },
  { id: 'hall-4', hallNumber: 'B-202', building: 'Science & Tech Wing', capacity: 45, available: true },
  { id: 'hall-5', hallNumber: 'C-301', building: 'Computing Block', capacity: 70, available: true },
  { id: 'hall-6', hallNumber: 'D-105', building: 'Auditorium Hall', capacity: 120, available: true },
];

export const INITIAL_FACULTY = [
  { id: 'fac-1', employeeId: 'FAC-101', name: 'Dr. Arvind Krishnan', department: 'BCA (AI & DS)', designation: 'Professor', email: 'arvind.k@university.edu', phone: '+91 98401 11201', available: true, maxDuties: 4 },
  { id: 'fac-2', employeeId: 'FAC-102', name: 'Prof. Meera Nair', department: 'BCA (AI & DS)', designation: 'Associate Prof.', email: 'meera.nair@university.edu', phone: '+91 98401 11202', available: true, maxDuties: 4 },
  { id: 'fac-3', employeeId: 'FAC-103', name: 'Dr. Rajeshwar Rao', department: 'BCA (DT)', designation: 'Professor', email: 'rajeshwar.r@university.edu', phone: '+91 98401 11203', available: true, maxDuties: 4 },
  { id: 'fac-4', employeeId: 'FAC-104', name: 'Prof. Ananya Sharma', department: 'B.Sc. Computer Science (B.Sc. CSE)', designation: 'Assistant Prof.', email: 'ananya.s@university.edu', phone: '+91 98401 11204', available: true, maxDuties: 4 },
  { id: 'fac-5', employeeId: 'FAC-105', name: 'Dr. Vikramaditya Sen', department: 'B.Tech', designation: 'Professor', email: 'vikram.sen@university.edu', phone: '+91 98401 11205', available: true, maxDuties: 4 },
  { id: 'fac-6', employeeId: 'FAC-106', name: 'Prof. Kavitha Menon', department: 'EEE', designation: 'Assistant Prof.', email: 'kavitha.m@university.edu', phone: '+91 98401 11206', available: true, maxDuties: 4 },
  { id: 'fac-7', employeeId: 'FAC-107', name: 'Dr. Suresh Babu', department: 'ECE', designation: 'Associate Prof.', email: 'suresh.b@university.edu', phone: '+91 98401 11207', available: true, maxDuties: 4 },
  { id: 'fac-8', employeeId: 'FAC-108', name: 'Prof. Deepika Iyer', department: 'B.Tech', designation: 'Assistant Prof.', email: 'deepika.i@university.edu', phone: '+91 98401 11208', available: true, maxDuties: 4 },
];

export const INITIAL_STUDENTS = [
  { id: 'stu-1', regNo: '24AIDS001', name: 'Aarav Patel', department: 'BCA (AI & DS)', section: 'Section A', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-1'] },
  { id: 'stu-2', regNo: '24AIDS002', name: 'Diya Reddy', department: 'BCA (AI & DS)', section: 'Section A', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-1'] },
  { id: 'stu-3', regNo: '24AIDS045', name: 'Sneha Kulkarni', department: 'BCA (AI & DS)', section: 'Section B', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-2'] },
  { id: 'stu-4', regNo: '24AIDS088', name: 'Karthik Subramanian', department: 'BCA (AI & DS)', section: 'Section C', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-2'] },
  { id: 'stu-5', regNo: '23AIDS014', name: 'Rohan Verma', department: 'BCA (AI & DS)', section: 'Section A', batch: '2023', semester: 5, enrolledSubjectIds: ['sub-3'] },
  { id: 'stu-6', regNo: '24DT008', name: 'Nikhil Deshmukh', department: 'BCA (DT)', section: 'Section A', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-4'] },
  { id: 'stu-7', regNo: '25CS003', name: 'Varun Malhotra', department: 'B.Sc. Computer Science (B.Sc. CSE)', section: 'Section A', batch: '2025', semester: 1, enrolledSubjectIds: ['sub-5'] },
  { id: 'stu-8', regNo: '24BT011', name: 'Ishita Banerjee', department: 'B.Tech', section: 'Section A', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-6'] },
  { id: 'stu-9', regNo: '24EE019', name: 'Siddharth Gupta', department: 'EEE', section: 'Section A', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-7'] },
  { id: 'stu-10', regNo: '24EC022', name: 'Pooja Joshi', department: 'ECE', section: 'Section B', batch: '2024', semester: 3, enrolledSubjectIds: ['sub-8'] },
];

export const INITIAL_EXAMS = INITIAL_SUBJECTS.map((sub, idx) => ({
  id: `exam-${idx + 1}`,
  subjectId: sub.id,
  durationMinutes: 180,
}));

export const DEFAULT_EXAM_DATES = [
  '2026-11-16',
  '2026-11-17',
  '2026-11-18',
  '2026-11-19',
  '2026-11-20',
  '2026-11-21',
  '2026-11-22',
  '2026-11-23',
  '2026-11-24',
  '2026-11-25',
];
