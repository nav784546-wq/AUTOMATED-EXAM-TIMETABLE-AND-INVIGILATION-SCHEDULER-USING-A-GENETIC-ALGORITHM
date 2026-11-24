import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react';

export const HallManagementView = ({
  halls,
  onAddHall,
  onUpdateHall,
  onToggleHall,
  onDeleteHall,
}) => {
  const [hallNumber, setHallNumber] = useState('');
  const [building, setBuilding] = useState('Main Academic Block');
  const [capacity, setCapacity] = useState(60);
  const [available, setAvailable] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({
    hallNumber: '',
    building: '',
    capacity: 60,
    available: true,
  });

  const filteredHalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return halls.filter((h) => {
      if (statusFilter === 'AVAILABLE' && !h.available) return false;
      if (statusFilter === 'UNAVAILABLE' && h.available) return false;
      if (!q) return true;
      return (
        h.hallNumber.toLowerCase().includes(q) ||
        h.building.toLowerCase().includes(q)
      );
    });
  }, [halls, search, statusFilter]);

  const totalCapacity = useMemo(
    () => halls.filter((h) => h.available).reduce((sum, h) => sum + h.capacity, 0),
    [halls]
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!hallNumber.trim()) return;
    const ok = await onAddHall({
      hallNumber: hallNumber.trim().toUpperCase(),
      building: building.trim() || 'Main Academic Block',
      capacity: Number(capacity) || 50,
      available,
    });
    if (ok !== false) {
      setHallNumber('');
    }
  };

  const startEdit = (hall) => {
    setEditingId(hall.id);
    setEditValues({
      hallNumber: hall.hallNumber,
      building: hall.building,
      capacity: hall.capacity,
      available: hall.available,
    });
  };

  const saveEdit = async (id) => {
    if (!editValues.hallNumber.trim()) return;
    const ok = await onUpdateHall(id, {
      hallNumber: editValues.hallNumber.trim().toUpperCase(),
      building: editValues.building.trim() || 'Main Academic Block',
      capacity: Number(editValues.capacity) || 50,
      available: editValues.available,
    });
    if (ok !== false) {
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Hall Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add Examination Hall</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure hall numbers, seating capacity, and availability for automated allocation.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Active Capacity: <span className="font-semibold text-slate-900">{totalCapacity}</span> seats
          </div>
        </div>

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="hm-number" className="block text-xs font-medium text-slate-600 mb-1">
              Hall Number
            </label>
            <input
              id="hm-number"
              type="text"
              value={hallNumber}
              onChange={(e) => setHallNumber(e.target.value)}
              placeholder="e.g. E-401"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-32 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="hm-building" className="block text-xs font-medium text-slate-600 mb-1">
              Building / Block
            </label>
            <input
              id="hm-building"
              type="text"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="Main Academic Block"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="hm-capacity" className="block text-xs font-medium text-slate-600 mb-1">
              Seating Capacity
            </label>
            <input
              id="hm-capacity"
              type="number"
              min={10}
              max={500}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white w-28 font-mono"
            />
          </div>

          <div>
            <label htmlFor="hm-avail" className="block text-xs font-medium text-slate-600 mb-1">
              Status
            </label>
            <select
              id="hm-avail"
              value={available ? 'AVAILABLE' : 'UNAVAILABLE'}
              onChange={(e) => setAvailable(e.target.value === 'AVAILABLE')}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="AVAILABLE">Available</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Hall
          </button>
        </form>
      </div>

      {/* Halls Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search hall or building..."
                aria-label="Search examination halls"
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter halls by availability"
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available Only</option>
              <option value="UNAVAILABLE">Unavailable Only</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {filteredHalls.length} of {halls.length} halls
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Hall Number</th>
                <th className="py-3 px-4">Building / Block</th>
                <th className="py-3 px-4 text-right">Seating Capacity</th>
                <th className="py-3 px-4">Availability</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredHalls.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No examination halls match the current filter.
                  </td>
                </tr>
              ) : (
                filteredHalls.map((hall) => {
                  const isEditing = editingId === hall.id;
                  return (
                    <tr key={hall.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.hallNumber}
                            onChange={(e) =>
                              setEditValues({ ...editValues, hallNumber: e.target.value })
                            }
                            aria-label="Edit hall number"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-24 font-mono bg-white"
                          />
                        ) : (
                          hall.hallNumber
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.building}
                            onChange={(e) =>
                              setEditValues({ ...editValues, building: e.target.value })
                            }
                            aria-label="Edit building"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-48 bg-white"
                          />
                        ) : (
                          hall.building
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={10}
                            max={500}
                            value={editValues.capacity}
                            onChange={(e) =>
                              setEditValues({ ...editValues, capacity: Number(e.target.value) })
                            }
                            aria-label="Edit seating capacity"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-20 font-mono bg-white text-right"
                          />
                        ) : (
                          hall.capacity
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
                            <option value="UNAVAILABLE">Unavailable</option>
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleHall(hall.id)}
                            className={`text-xs font-medium cursor-pointer ${
                              hall.available ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {hall.available ? 'Available' : 'Unavailable'}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(hall.id)}
                              aria-label={`Save hall ${hall.hallNumber}`}
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
                              onClick={() => startEdit(hall)}
                              aria-label={`Edit hall ${hall.hallNumber}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-blue-700 mr-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteHall(hall.id)}
                              aria-label={`Delete hall ${hall.hallNumber}`}
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
