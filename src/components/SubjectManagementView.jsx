import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react';

export const SubjectManagementView = ({
  departments,
  subjects,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState(departments[0] || 'BCA (AI & DS)');
  const [semester, setSemester] = useState(3);
  const [enrolledCount, setEnrolledCount] = useState(50);

  React.useEffect(() => {
    if (departments.length > 0 && !departments.includes(department)) {
      setDepartment(departments[0]);
    }
  }, [departments, department]);

  const [filterDept, setFilterDept] = useState('ALL');
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({
    code: '',
    name: '',
    department: '',
    semester: 3,
    enrolledCount: 50,
  });

  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subjects.filter((s) => {
      if (filterDept !== 'ALL' && s.department !== filterDept) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    });
  }, [subjects, filterDept, search]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    const ok = await onAddSubject({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      department,
      semester: Number(semester) || 1,
      enrolledCount: Number(enrolledCount) || 40,
    });
    if (ok !== false) {
      setCode('');
      setName('');
    }
  };

  const startEdit = (sub) => {
    setEditingId(sub.id);
    setEditValues({
      code: sub.code,
      name: sub.name,
      department: sub.department,
      semester: sub.semester || 3,
      enrolledCount: sub.enrolledCount,
    });
  };

  const saveEdit = async (id) => {
    if (!editValues.code.trim() || !editValues.name.trim()) return;
    const ok = await onUpdateSubject(id, {
      code: editValues.code.trim().toUpperCase(),
      name: editValues.name.trim(),
      department: editValues.department,
      semester: Number(editValues.semester) || 1,
      enrolledCount: Number(editValues.enrolledCount) || 40,
    });
    if (ok !== false) {
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Subject Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Add New Subject</h2>
        <p className="text-xs text-slate-500 mb-4">
          Register a subject with its code, name, and associated department for exam scheduling.
        </p>

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sm-code" className="block text-xs font-medium text-slate-600 mb-1">
              Subject Code
            </label>
            <input
              id="sm-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. AIDS405"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-32 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label htmlFor="sm-name" className="block text-xs font-medium text-slate-600 mb-1">
              Subject Name
            </label>
            <input
              id="sm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Natural Language Processing"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="sm-dept" className="block text-xs font-medium text-slate-600 mb-1">
              Department
            </label>
            <select
              id="sm-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sm-sem" className="block text-xs font-medium text-slate-600 mb-1">
              Semester
            </label>
            <input
              id="sm-sem"
              type="number"
              min={1}
              max={8}
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-20 font-mono"
            />
          </div>

          <div>
            <label htmlFor="sm-enrolled" className="block text-xs font-medium text-slate-600 mb-1">
              Enrolled
            </label>
            <input
              id="sm-enrolled"
              type="number"
              min={5}
              max={300}
              value={enrolledCount}
              onChange={(e) => setEnrolledCount(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-24 font-mono"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Subject
          </button>
        </form>
      </div>

      {/* Subjects Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or subject..."
                aria-label="Search subjects"
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              aria-label="Filter subjects by department"
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {filteredSubjects.length} of {subjects.length} subjects
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Subject Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-right">Semester</th>
                <th className="py-3 px-4 text-right">Enrolled</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredSubjects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No subjects match the current filter.
                  </td>
                </tr>
              ) : (
                filteredSubjects.map((sub) => {
                  const isEditing = editingId === sub.id;
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.code}
                            onChange={(e) => setEditValues({ ...editValues, code: e.target.value })}
                            aria-label="Edit subject code"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-24 font-mono bg-white"
                          />
                        ) : (
                          sub.code
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.name}
                            onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                            aria-label="Edit subject name"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-56 bg-white"
                          />
                        ) : (
                          sub.name
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {isEditing ? (
                          <select
                            value={editValues.department}
                            onChange={(e) =>
                              setEditValues({ ...editValues, department: e.target.value })
                            }
                            aria-label="Edit subject department"
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                          >
                            {departments.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        ) : (
                          sub.department
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={editValues.semester}
                            onChange={(e) =>
                              setEditValues({ ...editValues, semester: Number(e.target.value) })
                            }
                            aria-label="Edit semester"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-16 font-mono bg-white text-right"
                          />
                        ) : (
                          sub.semester
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={5}
                            max={300}
                            value={editValues.enrolledCount}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                enrolledCount: Number(e.target.value),
                              })
                            }
                            aria-label="Edit enrolled count"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-20 font-mono bg-white text-right"
                          />
                        ) : (
                          sub.enrolledCount
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(sub.id)}
                              aria-label={`Save subject ${sub.code}`}
                              className="inline-flex items-center p-1.5 text-white bg-blue-700 hover:bg-blue-800 rounded mr-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel edit"
                              className="inline-flex items-center p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(sub)}
                              aria-label={`Edit subject ${sub.code}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-blue-700 mr-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSubject(sub.id)}
                              aria-label={`Delete subject ${sub.code}`}
                              className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
