import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

export const DepartmentManagementView = ({
  departments,
  sectionsByDept,
  students,
  faculty,
  subjects,
  onAddDepartment,
  onRenameDepartment,
  onDeleteDepartment,
  onAddSection,
  onRenameSection,
  onDeleteSection,
}) => {
  const [newDeptName, setNewDeptName] = useState('');
  const [initialSections, setInitialSections] = useState('Section A, Section B');

  const [editingDept, setEditingDept] = useState(null);
  const [renameDeptValue, setRenameDeptValue] = useState('');

  const [sectionInputByDept, setSectionInputByDept] = useState({});
  const [editingSection, setEditingSection] = useState(null); // { dept, oldName }
  const [renameSectionValue, setRenameSectionValue] = useState('');

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    const trimmed = newDeptName.trim();
    if (!trimmed) return;
    const parsedSections = initialSections
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = await onAddDepartment(
      trimmed,
      parsedSections.length > 0 ? parsedSections : ['Section A', 'Section B']
    );
    if (ok !== false) {
      setNewDeptName('');
      setInitialSections('Section A, Section B');
    }
  };

  const handleAddSectionForDept = async (dept) => {
    const val = (sectionInputByDept[dept] || '').trim();
    if (!val) return;
    const ok = await onAddSection(dept, val);
    if (ok !== false) {
      setSectionInputByDept((prev) => ({ ...prev, [dept]: '' }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Department Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Add Academic Department</h2>
        <p className="text-xs text-slate-500 mb-4">
          Create a new department or degree program and define its initial sections.
        </p>

        <form onSubmit={handleCreateDepartment} className="flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-auto">
            <label htmlFor="dept-name-input" className="block text-xs font-medium text-slate-600 mb-1">
              Department / Program Name
            </label>
            <input
              id="dept-name-input"
              type="text"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="e.g. M.Sc. Data Science"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label htmlFor="dept-sections-input" className="block text-xs font-medium text-slate-600 mb-1">
              Initial Sections (comma-separated)
            </label>
            <input
              id="dept-sections-input"
              type="text"
              value={initialSections}
              onChange={(e) => setInitialSections(e.target.value)}
              placeholder="Section A, Section B"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Department
          </button>
        </form>
      </div>

      {/* Departments & Sections Directory */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Departments &amp; Sections ({departments.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage academic departments, rename programs, and add, edit, or remove sections.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {departments.map((dept) => {
            const sections = sectionsByDept[dept] || [];
            const studentCount = students.filter((s) => s.department === dept).length;
            const facultyCount = faculty.filter((f) => f.department === dept).length;
            const subjectCount = subjects.filter((s) => s.department === dept).length;
            const isEditingThisDept = editingDept === dept;

            return (
              <div key={dept} className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {isEditingThisDept ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameDeptValue}
                          onChange={(e) => setRenameDeptValue(e.target.value)}
                          aria-label={`Rename department ${dept}`}
                          className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-lg bg-white w-full sm:w-64"
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
                          aria-label="Save department name"
                          className="p-1.5 text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDept(null)}
                          aria-label="Cancel department rename"
                          className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">{dept}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                          {sections.length} sections · {studentCount} students · {facultyCount} faculty · {subjectCount} subjects
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isEditingThisDept && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDept(dept);
                          setRenameDeptValue(dept);
                        }}
                        aria-label={`Edit department ${dept}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    {departments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteDepartment(dept)}
                        aria-label={`Delete department ${dept}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Associated Sections */}
                <div className="flex flex-wrap items-center gap-2">
                  {sections.map((sec) => {
                    const isEditingSec =
                      editingSection &&
                      editingSection.dept === dept &&
                      editingSection.oldName === sec;

                    return (
                      <div
                        key={sec}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        {isEditingSec ? (
                          <>
                            <input
                              type="text"
                              value={renameSectionValue}
                              onChange={(e) => setRenameSectionValue(e.target.value)}
                              aria-label={`Rename section ${sec}`}
                              className="px-2 py-0.5 text-xs border border-slate-300 rounded bg-white w-24"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (renameSectionValue.trim()) {
                                  const ok = await onRenameSection(dept, sec, renameSectionValue.trim());
                                  if (ok === false) return;
                                }
                                setEditingSection(null);
                              }}
                              aria-label="Save section name"
                              className="text-blue-700 font-medium cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSection(null)}
                              aria-label="Cancel section rename"
                              className="text-slate-500 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-slate-800">{sec}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSection({ dept, oldName: sec });
                                setRenameSectionValue(sec);
                              }}
                              aria-label={`Edit section ${sec} in ${dept}`}
                              className="text-slate-400 hover:text-blue-700 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            {sections.length > 1 && (
                              <button
                                type="button"
                                onClick={() => onDeleteSection(dept, sec)}
                                aria-label={`Delete section ${sec} in ${dept}`}
                                className="text-slate-400 hover:text-red-600 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Inline Add Section */}
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      type="text"
                      value={sectionInputByDept[dept] || ''}
                      onChange={(e) =>
                        setSectionInputByDept((prev) => ({ ...prev, [dept]: e.target.value }))
                      }
                      placeholder="New section..."
                      aria-label={`New section for ${dept}`}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white w-28"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSectionForDept(dept)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      + Add Section
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
