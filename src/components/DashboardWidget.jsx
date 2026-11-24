import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { BarChart3, FilterX } from 'lucide-react';
import {
  buildDepartmentExamDistribution,
  getAvailableSemesters,
} from '../utils/dashboardMetrics.js';

function DepartmentTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs">
      <div className="font-semibold text-slate-900 mb-1">{data.department}</div>
      <div className="flex items-center justify-between gap-6 text-slate-600">
        <span>Scheduled Exams</span>
        <span className="font-mono font-semibold text-blue-700 tabular-nums">
          {data.scheduledExams}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6 text-slate-600 mt-0.5">
        <span>Enrolled Students</span>
        <span className="font-mono font-medium text-slate-900 tabular-nums">
          {data.enrolledStudents}
        </span>
      </div>
      <div className="text-[10px] text-blue-700 mt-1.5 pt-1 border-t border-slate-100">
        Click bar to cross-filter dashboard
      </div>
    </div>
  );
}

export const DashboardWidget = ({
  schedule = [],
  departments = [],
  subjects = [],
  selectedDepartment: controlledDepartment,
  onSelectDepartment,
}) => {
  const semesters = useMemo(
    () => getAvailableSemesters({ schedule, subjects }),
    [schedule, subjects]
  );

  const [selectedSemester, setSelectedSemester] = useState('ALL');
  const [localDepartment, setLocalDepartment] = useState('ALL');

  const selectedDepartment =
    controlledDepartment !== undefined ? controlledDepartment : localDepartment;

  const setDepartment = (nextDept) => {
    if (onSelectDepartment) {
      onSelectDepartment(nextDept);
    } else {
      setLocalDepartment(nextDept);
    }
  };

  const handleToggleDepartment = (dept) => {
    if (!dept) return;
    setDepartment(selectedDepartment === dept ? 'ALL' : dept);
  };

  const chartData = useMemo(
    () =>
      buildDepartmentExamDistribution({
        schedule,
        departments,
        subjects,
        semester: selectedSemester,
      }),
    [schedule, departments, subjects, selectedSemester]
  );

  const totalExamsInView = useMemo(
    () => chartData.reduce((sum, item) => sum + item.scheduledExams, 0),
    [chartData]
  );

  const activeDeptsWithExams = useMemo(
    () => chartData.filter((item) => item.scheduledExams > 0).length,
    [chartData]
  );

  return (
    <section
      aria-label="Scheduled Exams by Department"
      data-testid="department-distribution-widget"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-700 shrink-0" />
            <h2 className="text-base font-semibold text-slate-900">
              Scheduled Exams Distribution by Department
            </h2>
            {selectedDepartment !== 'ALL' && (
              <span
                data-testid="chart-active-dept-badge"
                className="text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md"
              >
                Filtered: {selectedDepartment}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            <span>
              {selectedSemester === 'ALL'
                ? 'Current Academic Semester (All Terms)'
                : `Academic Semester ${selectedSemester}`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {totalExamsInView} exam{totalExamsInView === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {activeDeptsWithExams} active department{activeDeptsWithExams === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-500">Click any bar to filter heatmap &amp; table</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedDepartment !== 'ALL' && (
            <button
              type="button"
              onClick={() => setDepartment('ALL')}
              data-testid="chart-clear-dept-btn"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer whitespace-nowrap"
            >
              <FilterX className="w-3.5 h-3.5" />
              Clear Department Filter
            </button>
          )}

          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter chart by semester"
          >
            <button
              type="button"
              onClick={() => setSelectedSemester('ALL')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSemester === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Semesters
            </button>
            {semesters.map((sem) => (
              <button
                key={sem}
                type="button"
                onClick={() => setSelectedSemester(String(sem))}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  String(selectedSemester) === String(sem)
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sem {sem}
              </button>
            ))}
          </div>
        </div>
      </div>

      {totalExamsInView === 0 ? (
        <div className="h-56 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-center px-4">
          <p className="text-sm font-medium text-slate-700">
            No scheduled examinations found for this semester filter
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Select another academic semester or run the Genetic Algorithm scheduler to populate exams.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="h-60 w-full min-w-0" data-testid="department-exams-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                barCategoryGap="24%"
                onClick={(state) => {
                  const dept = state?.activePayload?.[0]?.payload?.department;
                  if (dept) handleToggleDepartment(dept);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="shortDept"
                  tick={{ fill: '#475569', fontSize: 12 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  content={<DepartmentTooltip />}
                  cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                />
                <Bar
                  dataKey="scheduledExams"
                  name="Scheduled Exams"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  onClick={(barItem) => {
                    const dept = barItem?.department || barItem?.payload?.department;
                    if (dept) handleToggleDepartment(dept);
                  }}
                >
                  {chartData.map((entry) => {
                    const isSelected = selectedDepartment === entry.department;
                    const hasFilter = selectedDepartment !== 'ALL';
                    let fill = '#CBD5E1';
                    if (entry.scheduledExams > 0) {
                      if (!hasFilter) {
                        fill = '#1D4ED8';
                      } else {
                        fill = isSelected ? '#1E3A8A' : '#93C5FD';
                      }
                    }

                    return (
                      <Cell
                        key={entry.department}
                        fill={fill}
                        stroke={isSelected ? '#0F172A' : 'none'}
                        strokeWidth={isSelected ? 1.5 : 0}
                        className="cursor-pointer"
                        onClick={() => handleToggleDepartment(entry.department)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Keyboard-accessible department selector strip matching chart bars */}
          <div
            className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs"
            role="group"
            aria-label="Filter dashboard by department"
          >
            <span className="text-slate-500 font-medium mr-1">Quick Select:</span>
            {chartData.map((entry) => {
              const active = selectedDepartment === entry.department;
              return (
                <button
                  key={entry.department}
                  type="button"
                  onClick={() => handleToggleDepartment(entry.department)}
                  aria-pressed={active}
                  data-testid={`dept-bar-btn-${entry.department}`}
                  className={`px-2.5 py-1 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-blue-700 text-white border-blue-700 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {entry.shortDept}{' '}
                  <span className="font-mono tabular-nums opacity-85">({entry.scheduledExams})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
