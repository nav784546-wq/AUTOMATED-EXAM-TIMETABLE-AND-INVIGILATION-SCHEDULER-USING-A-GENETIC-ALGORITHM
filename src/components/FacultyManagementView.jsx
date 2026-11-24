import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react';

export const FacultyManagementView = ({
  departments,
  faculty,
  onAddFaculty,
  onUpdateFaculty,
  onToggleFaculty,
  onDeleteFaculty,
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState(departments[0] || 'BCA (AI & DS)');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [maxDuties, setMaxDuties] = useState(4);
  const [available, setAvailable] = useState(true);

  React.useEffect(() => {
    if (departments.length > 0 && !departments.includes(department)) {
      setDepartment(departments[0]);
    }
  }, [departments, department]);

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterAvail, setFilterAvail] = useState('ALL');

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({
    name: '',
    department: '',
    email: '',
    phone: '',
    maxDuties: 4,
    available: true,
  });

  const filteredFaculty = useMemo(() => {
    const q = search.trim().toLowerCase();
    return faculty.filter((f) => {
      if (filterDept !== 'ALL' && f.department !== filterDept) return false;
      if (filterAvail === 'AVAILABLE' && !f.available) return false;
      if (filterAvail === 'UNAVAILABLE' && f.available) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.employeeId.toLowerCase().includes(q) ||
        (f.email || '').toLowerCase().includes(q)
      );
    });
  }, [faculty, search, filterDept, filterAvail]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await onAddFaculty({
      employeeId: employeeId.trim().toUpperCase() || `FAC-${Math.floor(200 + Math.random() * 700)}`,
      name: name.trim(),
      department,
      designation: 'Assistant Prof.',
      email: email.trim() || `${name.trim().toLowerCase().replace(/\s+/g, '.')}@university.edu`,
      phone: phone.trim() || '+91 98400 00000',
      maxDuties: Number(maxDuties) || 4,
      available,
    });
    if (ok !== false) {
      setEmployeeId('');
      setName('');
      setEmail('');
      setPhone('');
    }
  };

  const startEdit = (fac) => {
    setEditingId(fac.id);
    setEditValues({
      name: fac.name,
      department: fac.department,
      email: fac.email || '',
      phone: fac.phone || '',
      maxDuties: fac.maxDuties,
      available: fac.available,
    });
  };

  const saveEdit = async (id) => {
    if (!editValues.name.trim()) return;
    const ok = await onUpdateFaculty(id, {
      name: editValues.name.trim(),
      department: editValues.department,
      email: editValues.email.trim(),
      phone: editValues.phone.trim(),
      maxDuties: Number(editValues.maxDuties) || 4,
      available: editValues.available,
    });
    if (ok !== false) {
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Faculty Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Add Faculty Member</h2>
        <p className="text-xs text-slate-500 mb-4">
          Register faculty details, contact information, and invigilation duty availability.
        </p>

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="fm-id" className="block text-xs font-medium text-slate-600 mb-1">
              Employee ID
            </label>
            <input
              id="fm-id"
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="FAC-110"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-28 font-mono"
            />
          </div>

          <div>
            <label htmlFor="fm-name" className="block text-xs font-medium text-slate-600 mb-1">
              Full Name
            </label>
            <input
              id="fm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Priya Nair"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-48"
            />
          </div>

          <div>
            <label htmlFor="fm-dept" className="block text-xs font-medium text-slate-600 mb-1">
              Department
            </label>
            <select
              id="fm-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fm-email" className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <input
              id="fm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="priya.nair@university.edu"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-48"
            />
          </div>

          <div>
            <label htmlFor="fm-phone" className="block text-xs font-medium text-slate-600 mb-1">
              Phone
            </label>
            <input
              id="fm-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98401 11209"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-36 font-mono"
            />
          </div>

          <div>
            <label htmlFor="fm-max" className="block text-xs font-medium text-slate-600 mb-1">
              Max Duties
            </label>
            <input
              id="fm-max"
              type="number"
              min={1}
              max={10}
              value={maxDuties}
              onChange={(e) => setMaxDuties(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-20 font-mono"
            />
          </div>

          <div>
            <label htmlFor="fm-avail" className="block text-xs font-medium text-slate-600 mb-1">
              Availability
            </label>
            <select
              id="fm-avail"
              value={available ? 'AVAILABLE' : 'UNAVAILABLE'}
              onChange={(e) => setAvailable(e.target.value === 'AVAILABLE')}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="AVAILABLE">Available</option>
              <option value="UNAVAILABLE">On Leave</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Faculty
          </button>
        </form>
      </div>

      {/* Faculty Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, ID, email..."
                aria-label="Search faculty"
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              aria-label="Filter faculty by department"
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              value={filterAvail}
              onChange={(e) => setFilterAvail(e.target.value)}
              aria-label="Filter faculty by availability"
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available Only</option>
              <option value="UNAVAILABLE">On Leave Only</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {filteredFaculty.length} of {faculty.length} faculty
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Faculty Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Contact Info</th>
                <th className="py-3 px-4 text-right">Max Duties</th>
                <th className="py-3 px-4">Availability</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredFaculty.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No faculty members match the current filter.
                  </td>
                </tr>
              ) : (
                filteredFaculty.map((fac) => {
                  const isEditing = editingId === fac.id;
                  return (
                    <tr key={fac.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900">
                        {fac.employeeId}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.name}
                            onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                            aria-label="Edit faculty name"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-44 bg-white"
                          />
                        ) : (
                          fac.name
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {isEditing ? (
                          <select
                            value={editValues.department}
                            onChange={(e) =>
                              setEditValues({ ...editValues, department: e.target.value })
                            }
                            aria-label="Edit faculty department"
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                          >
                            {departments.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        ) : (
                          fac.department
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="email"
                              value={editValues.email}
                              onChange={(e) =>
                                setEditValues({ ...editValues, email: e.target.value })
                              }
                              aria-label="Edit faculty email"
                              className="px-2 py-1 text-xs border border-slate-300 rounded w-44 bg-white block"
                            />
                            <input
                              type="text"
                              value={editValues.phone}
                              onChange={(e) =>
                                setEditValues({ ...editValues, phone: e.target.value })
                              }
                              aria-label="Edit faculty phone"
                              className="px-2 py-1 text-xs border border-slate-300 rounded w-44 bg-white font-mono block"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs text-slate-900">{fac.email}</div>
                            <div className="text-xs text-slate-500 font-mono">{fac.phone}</div>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={editValues.maxDuties}
                            onChange={(e) =>
                              setEditValues({ ...editValues, maxDuties: Number(e.target.value) })
                            }
                            aria-label="Edit max duties"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-16 font-mono bg-white text-right"
                          />
                        ) : (
                          fac.maxDuties
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {isEditing ? (
                          <select
                            value={editValues.available ? 'AVAILABLE' : 'UNAVAILABLE'}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                available: e.target.value === 'AVAILABLE',
                              })
                            }
                            aria-label="Edit availability"
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                          >
                            <option value="AVAILABLE">Available</option>
                            <option value="UNAVAILABLE">On Leave</option>
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleFaculty(fac.id)}
                            className={`text-xs font-medium cursor-pointer ${
                              fac.available ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {fac.available ? 'Available' : 'On Leave'}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(fac.id)}
                              aria-label={`Save faculty ${fac.name}`}
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
                              onClick={() => startEdit(fac)}
                              aria-label={`Edit faculty ${fac.name}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-blue-700 mr-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteFaculty(fac.id)}
                              aria-label={`Delete faculty ${fac.name}`}
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
