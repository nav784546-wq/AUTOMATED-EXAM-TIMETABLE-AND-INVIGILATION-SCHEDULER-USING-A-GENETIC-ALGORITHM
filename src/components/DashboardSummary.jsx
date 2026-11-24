import React from 'react';
import {
  GraduationCap,
  Building2,
  CalendarCheck,
  Users,
  DoorOpen,
  ClipboardClock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Percent,
} from 'lucide-react';

export const DashboardSummary = ({
  totalStudents = 0,
  activeDepartments = 0,
  scheduledExams = 0,
  totalFaculty = 0,
  availableClassrooms = 0,
  totalClassrooms = 0,
  pendingInvigilations = 0,
  hallUtilizationRate = 0,
  totalHardViolations = 0,
  departmentWarnings = 0,
  bestFitness = 0,
  convergedAtGeneration = 0,
  executionTimeMs = 0,
  workloadStdDev = 0,
}) => {
  const allInvigilationsAssigned = pendingInvigilations === 0;
  const isConflictFree = totalHardViolations === 0;

  const primaryCards = [
    {
      id: 'schedule-integrity',
      label: 'Schedule Integrity',
      value: isConflictFree ? '0 Clashes' : `${totalHardViolations} Issues`,
      subtext: isConflictFree ? (
        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Fitness {bestFitness} · {executionTimeMs}ms
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-red-700 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Hard constraint violation(s)
        </span>
      ),
      icon: isConflictFree ? (
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-red-600" />
      ),
      tone: isConflictFree ? 'text-emerald-700' : 'text-red-700',
    },
    {
      id: 'scheduled-exams',
      label: 'Scheduled Exams',
      value: scheduledExams,
      subtext:
        departmentWarnings > 0
          ? `${departmentWarnings} parallel dept advisory`
          : 'Active examination timetable',
      icon: <CalendarCheck className="w-4 h-4 text-blue-700" />,
      tone: 'text-slate-900',
    },
    {
      id: 'hall-utilization',
      label: 'Hall Utilization',
      value: `${hallUtilizationRate}%`,
      subtext: `${availableClassrooms} of ${totalClassrooms} halls active · Gen ${convergedAtGeneration}`,
      icon: <Percent className="w-4 h-4 text-blue-700" />,
      tone: 'text-slate-900',
    },
    {
      id: 'pending-invigilations',
      label: 'Pending Invigilations',
      value: pendingInvigilations,
      subtext: allInvigilationsAssigned ? (
        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          All duties assigned
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Requires faculty assignment
        </span>
      ),
      icon: <ClipboardClock className="w-4 h-4 text-blue-700" />,
      tone: allInvigilationsAssigned ? 'text-slate-900' : 'text-amber-700',
    },
  ];

  const metadataItems = [
    {
      label: 'Total Students',
      value: totalStudents,
      icon: <GraduationCap className="w-3.5 h-3.5 text-slate-500" />,
    },
    {
      label: 'Active Departments',
      value: activeDepartments,
      icon: <Building2 className="w-3.5 h-3.5 text-slate-500" />,
    },
    {
      label: 'Total Faculty',
      value: totalFaculty,
      sub: `σ ${workloadStdDev}`,
      icon: <Users className="w-3.5 h-3.5 text-slate-500" />,
    },
    {
      label: 'Available Classrooms',
      value: `${availableClassrooms} / ${totalClassrooms}`,
      icon: <DoorOpen className="w-3.5 h-3.5 text-slate-500" />,
    },
  ];

  return (
    <div className="space-y-2.5">
      {/* Primary Single-Row KPI Strip (4 Core Operational Metrics) */}
      <section
        aria-label="Dashboard Summary Statistics"
        data-testid="primary-kpi-row"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5"
      >
        {primaryCards.map((card) => (
          <div
            key={card.id}
            data-testid={`kpi-card-${card.id}`}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
              <span>{card.label}</span>
              {card.icon}
            </div>
            <div className={`text-2xl font-bold font-mono tabular-nums leading-tight ${card.tone}`}>
              {card.value}
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">{card.subtext}</div>
          </div>
        ))}
      </section>

      {/* Compact Secondary Inventory Metadata Strip */}
      <section
        aria-label="Institution Inventory Metadata"
        data-testid="secondary-metadata-strip"
        className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs"
      >
        {metadataItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            {item.icon}
            <span className="text-slate-500">{item.label}:</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {item.value}
            </span>
            {item.sub && (
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                ({item.sub})
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};
