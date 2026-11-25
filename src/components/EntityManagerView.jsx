import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ArrowRightLeft, Pencil, Search } from 'lucide-react';
import { PaginationBar } from './PaginationBar.jsx';

export const EntityManagerView = ({
  departments,
  batches,
  sectionsByDept,
  subjects,
  halls,
  faculty,
  students,
  onAddDepartment,
  onRenameDepartment,
  onDeleteDepartment,
  onAddBatch,
  onEditBatch,
  onDeleteBatch,
  onAddSubject,
  onDeleteSubject,
  onAddHall,
  onToggleHall,
  onDeleteHall,
  onAddFaculty,
  onToggleFaculty,
  onDeleteFaculty,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
}) => {
  const [activeTab, setActiveTab] = useState('students');

  // Student multi-level filters: Department -> Academic Batch -> Section + Search + Pagination
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterBatch, setFilterBatch] = useState('ALL');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(25);

  // Department, Batch & Section management inputs
  const [newDeptInput, setNewDeptInput] = useState('');
  const [editingDept, setEditingDept] = useState(null);
  const [renameDeptValue, setRenameDeptValue] = useState('');

  const [newBatchInput, setNewBatchInput] = useState('');
  const [editingBatch, setEditingBatch] = useState(null);
  const [renameBatchValue, setRenameBatchValue] = useState('');

  // Transfer / Edit student state
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editRegNo, setEditRegNo] = useState('');
  const [editStudentName, setEditStudentName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editBatch, setEditBatch] = useState('');

  // Form states
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subDept, setSubDept] = useState(departments[0] || 'BCA (AI & DS)');
  const [subDeptSearch, setSubDeptSearch] = useState('');
  const [subCount, setSubCount] = useState(50);

  const filteredSubDepts = useMemo(() => {
    const q = subDeptSearch.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.toLowerCase().includes(q));
  }, [departments, subDeptSearch]);

  const [hallNumber, setHallNumber] = useState('');
  const [hallBuilding, setHallBuilding] = useState('Main Academic Block');
  const [hallCapacity, setHallCapacity] = useState(60);

  const [facId, setFacId] = useState('');
  const [facName, setFacName] = useState('');
  const [facDept, setFacDept] = useState(departments[0] || 'BCA (AI & DS)');
  const [facMax, setFacMax] = useState(4);

  const [stuReg, setStuReg] = useState('');
  const [stuName, setStuName] = useState('');
  const [stuDept, setStuDept] = useState(departments[0] || 'BCA (AI & DS)');
  const [stuBatch, setStuBatch] = useState(batches[batches.length - 1] || '2025');

  React.useEffect(() => {
    if (departments.length > 0) {
      if (!departments.includes(subDept)) setSubDept(departments[0]);
      if (!departments.includes(facDept)) setFacDept(departments[0]);
      if (!departments.includes(stuDept)) {
        setStuDept(departments[0]);
      }
    }
  }, [departments, subDept, facDept, stuDept]);

  React.useEffect(() => {
    if (batches.length > 0 && !batches.includes(stuBatch)) {
      setStuBatch(batches[batches.length - 1]);
    }
  }, [batches, stuBatch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter((s) => {
      if (filterDept !== 'ALL' && s.department !== filterDept) return false;
      if (filterBatch !== 'ALL' && s.batch !== filterBatch) return false;
      if (!q) return true;
      return (
        String(s.regNo || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.department || '').toLowerCase().includes(q) ||
        String(s.section || '').toLowerCase().includes(q)
      );
    });
  }, [students, filterDept, filterBatch, studentSearch]);

  useEffect(() => {
    setStudentPage(1);
  }, [filterDept, filterBatch, studentSearch]);

  const paginatedStudents = useMemo(() => {
    const start = (studentPage - 1) * studentPageSize;
    return filteredStudents.slice(start, start + studentPageSize);
  }, [filteredStudents, studentPage, studentPageSize]);

  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!subCode.trim() || !subName.trim()) return;
    const ok = await onAddSubject({
      code: subCode.trim().toUpperCase(),
      name: subName.trim(),
      department: subDept,
      semester: 3,
      enrolledCount: Number(subCount) || 40,
    });
    if (ok !== false) {
      setSubCode('');
      setSubName('');
    }
  };

  const handleAddHall = async (e) => {
    e.preventDefault();
    if (!hallNumber.trim()) return;
    const ok = await onAddHall({
      hallNumber: hallNumber.trim().toUpperCase(),
      building: hallBuilding.trim() || 'Main Block',
      capacity: Number(hallCapacity) || 50,
      available: true,
    });
    if (ok !== false) {
      setHallNumber('');
    }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    if (!facName.trim()) return;
    const ok = await onAddFaculty({
      employeeId: facId.trim().toUpperCase() || `FAC-${Math.floor(200 + Math.random() * 700)}`,
      name: facName.trim(),
      department: facDept,
      designation: 'Assistant Prof.',
      available: true,
      maxDuties: Number(facMax) || 4,
    });
    if (ok !== false) {
      setFacId('');
      setFacName('');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!stuReg.trim() || !stuName.trim()) return;
    const ok = await onAddStudent({
      regNo: stuReg.trim().toUpperCase(),
      name: stuName.trim(),
      department: stuDept,
      section: (sectionsByDept[stuDept] || ['Section A'])[0] || 'Section A',
      batch: stuBatch,
      semester: 1,
      enrolledSubjectIds: subjects.slice(0, 1).map((s) => s.id),
    });
    if (ok !== false) {
      setStuReg('');
      setStuName('');
    }
  };

  const startEditStudent = (stu) => {
    setEditingStudentId(stu.id);
    setEditRegNo(stu.regNo);
    setEditStudentName(stu.name);
    setEditDept(stu.department);
    setEditSection(stu.section);
    setEditBatch(stu.batch);
  };

  const saveEditStudent = async (id) => {
    const ok = await onUpdateStudent(id, {
      regNo: editRegNo.trim().toUpperCase(),
      name: editStudentName.trim(),
      department: editDept,
      section: editSection,
      batch: editBatch,
    });
    if (ok !== false) {
      setEditingStudentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        {[
          { id: 'students', label: `Students & Batches (${students.length})` },
          { id: 'halls', label: `Examination Halls (${halls.length})` },
          { id: 'faculty', label: `Faculty (${faculty.length})` },
          { id: 'subjects', label: `Subjects & Exams (${subjects.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'students' && (
        <div className="space-y-4">
          {/* Department, Batch & Section Administration Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="new-dept" className="block text-xs font-medium text-slate-600 mb-1">
                  Add Department
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="new-dept"
                    type="text"
                    value={newDeptInput}
                    onChange={(e) => setNewDeptInput(e.target.value)}
                    placeholder="e.g. M.Sc. Data Science"
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-44"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (newDeptInput.trim()) {
                        const ok = await onAddDepartment(newDeptInput.trim());
                        if (ok !== false) setNewDeptInput('');
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    + Add Dept
                  </button>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200 hidden sm:block" />

              <div>
                <label htmlFor="new-batch" className="block text-xs font-medium text-slate-600 mb-1">
                  Add Academic Batch
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="new-batch"
                    type="text"
                    value={newBatchInput}
                    onChange={(e) => setNewBatchInput(e.target.value)}
                    placeholder="e.g. 2026"
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-24 font-mono"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (newBatchInput.trim()) {
                        const ok = await onAddBatch(newBatchInput.trim());
                        if (ok !== false) setNewBatchInput('');
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    + Add Batch
                  </button>
                </div>
              </div>
            </div>

            {/* Department Directory */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
              {departments.map((dept) => (
                <div key={dept} className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  {editingDept === dept ? (
                    <>
                      <input
                        type="text"
                        value={renameDeptValue}
                        onChange={(e) => setRenameDeptValue(e.target.value)}
                        className="px-1.5 py-0.5 border border-slate-300 rounded text-xs w-36 bg-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (renameDeptValue.trim()) {
                            const ok = await onRenameDepartment(dept, renameDeptValue.trim());
                            if (ok === false) return;
                          }
                          setEditingDept(null);
                        }}
                        className="text-blue-700 font-medium cursor-pointer"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-slate-800">{dept}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDept(dept);
                          setRenameDeptValue(dept);
                        }}
                        aria-label={`Edit department ${dept}`}
                        className="text-slate-400 hover:text-blue-700 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {departments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteDepartment(dept)}
                          aria-label={`Delete department ${dept}`}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Academic Batches Directory */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 mr-1">Batches:</span>
              {batches.map((b) => (
                <div key={b} className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
                  {editingBatch === b ? (
                    <>
                      <input
                        type="text"
                        value={renameBatchValue}
                        onChange={(e) => setRenameBatchValue(e.target.value)}
                        aria-label={`Rename batch ${b}`}
                        className="px-1.5 py-0.5 border border-slate-300 rounded text-xs w-20 bg-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (renameBatchValue.trim() && onEditBatch) {
                            const ok = await onEditBatch(b, renameBatchValue.trim());
                            if (ok === false) return;
                          }
                          setEditingBatch(null);
                        }}
                        className="text-blue-700 font-medium cursor-pointer font-sans"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-slate-800">{b}</span>
                      {onEditBatch && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBatch(b);
                            setRenameBatchValue(b);
                          }}
                          aria-label={`Edit batch ${b}`}
                          className="text-slate-400 hover:text-blue-700 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {onDeleteBatch && batches.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteBatch(b)}
                          aria-label={`Delete batch ${b}`}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Student Table + Multi-Level Filters (Department -> Batch -> Section) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search reg. no or name..."
                    aria-label="Search students by registration number or name"
                    data-testid="entity-student-search"
                    className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-48"
                  />
                </div>

                <select
                  value={filterDept}
                  onChange={(e) => {
                    setFilterDept(e.target.value);
                    setFilterBatch('ALL');
                  }}
                  aria-label="Filter students by department"
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">1. All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                <select
                  value={filterBatch}
                  onChange={(e) => {
                    setFilterBatch(e.target.value);
                  }}
                  aria-label="Filter students by batch"
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">2. All Batches</option>
                  {batches.map((b) => (
                    <option key={b} value={b}>
                      Batch {b}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Showing {filteredStudents.length} of {students.length} students
              </span>
            </div>

            <form onSubmit={handleAddStudent} className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="stu-reg" className="block text-xs font-medium text-slate-600 mb-1">Reg. Number</label>
                <input
                  id="stu-reg"
                  type="text"
                  value={stuReg}
                  onChange={(e) => setStuReg(e.target.value)}
                  placeholder="25AIDS012"
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-32 font-mono"
                />
              </div>
              <div>
                <label htmlFor="stu-name" className="block text-xs font-medium text-slate-600 mb-1">Student Name</label>
                <input
                  id="stu-name"
                  type="text"
                  value={stuName}
                  onChange={(e) => setStuName(e.target.value)}
                  placeholder="Ananya Krishnan"
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-44"
                />
              </div>
              <div>
                <label htmlFor="stu-dept" className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                <select
                  id="stu-dept"
                  value={stuDept}
                  onChange={(e) => {
                    setStuDept(e.target.value);
                  }}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="stu-batch" className="block text-xs font-medium text-slate-600 mb-1">Batch</label>
                <select
                  id="stu-batch"
                  value={stuBatch}
                  onChange={(e) => setStuBatch(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {batches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Register Student
              </button>
            </form>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Reg. Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Batch</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      No students found for the selected department, batch, and section.
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((stu) => {
                    const isEditing = editingStudentId === stu.id;
                    return (
                      <tr key={stu.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editRegNo}
                              onChange={(e) => setEditRegNo(e.target.value)}
                              aria-label={`Edit registration number for ${stu.regNo}`}
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white w-28 font-mono"
                            />
                          ) : (
                            stu.regNo
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-900">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editStudentName}
                              onChange={(e) => setEditStudentName(e.target.value)}
                              aria-label={`Edit student name for ${stu.regNo}`}
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white w-40"
                            />
                          ) : (
                            stu.name
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {isEditing ? (
                            <select
                              value={editDept}
                              onChange={(e) => {
                                setEditDept(e.target.value);
                                setEditSection((sectionsByDept[e.target.value] || ['Section A'])[0]);
                              }}
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {departments.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          ) : (
                            stu.department
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {isEditing ? (
                            <select
                              value={editSection}
                              onChange={(e) => setEditSection(e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {(sectionsByDept[editDept] || ['Section A']).map((sec) => (
                                <option key={sec} value={sec}>{sec}</option>
                              ))}
                            </select>
                          ) : (
                            stu.section
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs tabular-nums">
                          {isEditing ? (
                            <select
                              value={editBatch}
                              onChange={(e) => setEditBatch(e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {batches.map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          ) : (
                            stu.batch
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          {isEditing ? (
                            <button
                              onClick={() => saveEditStudent(stu.id)}
                              className="px-2.5 py-1 text-xs font-medium text-white bg-blue-700 rounded hover:bg-blue-800 mr-2 cursor-pointer"
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              onClick={() => startEditStudent(stu)}
                              aria-label={`Transfer or edit ${stu.regNo}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-blue-700 mr-1 cursor-pointer"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteStudent(stu.id)}
                            aria-label={`Delete student ${stu.regNo}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <PaginationBar
              totalItems={filteredStudents.length}
              page={studentPage}
              pageSize={studentPageSize}
              onPageChange={setStudentPage}
              onPageSizeChange={setStudentPageSize}
              itemLabel="students"
            />
          </div>
        </div>
      )}

      {activeTab === 'halls' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <form onSubmit={handleAddHall} className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="hall-num" className="block text-xs font-medium text-slate-600 mb-1">Hall Number</label>
              <input
                id="hall-num"
                type="text"
                value={hallNumber}
                onChange={(e) => setHallNumber(e.target.value)}
                placeholder="e.g. E-401"
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-32"
              />
            </div>
            <div>
              <label htmlFor="hall-bld" className="block text-xs font-medium text-slate-600 mb-1">Building</label>
              <input
                id="hall-bld"
                type="text"
                value={hallBuilding}
                onChange={(e) => setHallBuilding(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-48"
              />
            </div>
            <div>
              <label htmlFor="hall-cap" className="block text-xs font-medium text-slate-600 mb-1">Capacity</label>
              <input
                id="hall-cap"
                type="number"
                min={10}
                max={300}
                value={hallCapacity}
                onChange={(e) => setHallCapacity(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-24 font-mono"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Hall
            </button>
          </form>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Hall Number</th>
                <th className="py-3 px-4">Building</th>
                <th className="py-3 px-4 text-right">Seating Capacity</th>
                <th className="py-3 px-4">Availability</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {halls.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-medium text-slate-900">{h.hallNumber}</td>
                  <td className="py-2.5 px-4 text-slate-600">{h.building}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{h.capacity}</td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => onToggleHall(h.id)}
                      className={`text-xs font-medium cursor-pointer ${h.available ? 'text-emerald-700' : 'text-amber-700'}`}
                    >
                      {h.available ? 'Available (Click to disable)' : 'Unavailable (Click to enable)'}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => onDeleteHall(h.id)}
                      aria-label={`Delete hall ${h.hallNumber}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'faculty' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <form onSubmit={handleAddFaculty} className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="fac-id" className="block text-xs font-medium text-slate-600 mb-1">Employee ID</label>
              <input
                id="fac-id"
                type="text"
                value={facId}
                onChange={(e) => setFacId(e.target.value)}
                placeholder="FAC-110"
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-28"
              />
            </div>
            <div>
              <label htmlFor="fac-name" className="block text-xs font-medium text-slate-600 mb-1">Faculty Name</label>
              <input
                id="fac-name"
                type="text"
                value={facName}
                onChange={(e) => setFacName(e.target.value)}
                placeholder="Dr. Priya Nair"
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-48"
              />
            </div>
            <div>
              <label htmlFor="fac-dept" className="block text-xs font-medium text-slate-600 mb-1">Department</label>
              <select
                id="fac-dept"
                value={facDept}
                onChange={(e) => setFacDept(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fac-max" className="block text-xs font-medium text-slate-600 mb-1">Max Duties</label>
              <input
                id="fac-max"
                type="number"
                min={1}
                max={10}
                value={facMax}
                onChange={(e) => setFacMax(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-20 font-mono"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Faculty
            </button>
          </form>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-right">Max Duties</th>
                <th className="py-3 px-4">Availability</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {faculty.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-xs">{f.employeeId}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{f.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{f.department}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{f.maxDuties}</td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => onToggleFaculty(f.id)}
                      className={`text-xs font-medium cursor-pointer ${f.available ? 'text-emerald-700' : 'text-amber-700'}`}
                    >
                      {f.available ? 'Available' : 'On Leave'}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => onDeleteFaculty(f.id)}
                      aria-label={`Delete faculty ${f.name}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <form onSubmit={handleAddSubject} className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="sub-code" className="block text-xs font-medium text-slate-600 mb-1">Subject Code</label>
              <input
                id="sub-code"
                type="text"
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="AIDS405"
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-28"
              />
            </div>
            <div>
              <label htmlFor="sub-name" className="block text-xs font-medium text-slate-600 mb-1">Subject Name</label>
              <input
                id="sub-name"
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Cloud Computing"
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-52"
              />
            </div>
            <div>
              <label htmlFor="sub-dept" className="block text-xs font-medium text-slate-600 mb-1">Department</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={subDeptSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSubDeptSearch(val);
                    const q = val.trim().toLowerCase();
                    const matches = q
                      ? departments.filter((d) => d.toLowerCase().includes(q))
                      : departments;
                    if (matches.length > 0 && !matches.includes(subDept)) {
                      setSubDept(matches[0]);
                    }
                  }}
                  placeholder="Filter dept..."
                  aria-label="Search department for subject"
                  className="px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-28"
                />
                <select
                  id="sub-dept"
                  value={subDept}
                  onChange={(e) => setSubDept(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {filteredSubDepts.length === 0 ? (
                    <option value={subDept}>No matching department</option>
                  ) : (
                    filteredSubDepts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="sub-count" className="block text-xs font-medium text-slate-600 mb-1">Enrolled</label>
              <input
                id="sub-count"
                type="number"
                min={5}
                max={200}
                value={subCount}
                onChange={(e) => setSubCount(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white w-20 font-mono"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Subject &amp; Exam
            </button>
          </form>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Subject Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-right">Enrolled Students</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {subjects.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900">{s.code}</td>
                  <td className="py-2.5 px-4 text-slate-900">{s.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{s.department}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{s.enrolledCount}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => onDeleteSubject(s.id)}
                      aria-label={`Delete subject ${s.code}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
