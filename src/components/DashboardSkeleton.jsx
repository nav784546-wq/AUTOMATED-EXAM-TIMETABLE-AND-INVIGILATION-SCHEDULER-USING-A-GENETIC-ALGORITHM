import React from 'react';

export function DashboardSkeleton() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Loading examination dashboard"
      data-testid="dashboard-skeleton"
    >
      {/* Primary 4-KPI Row Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 bg-slate-200 rounded" />
              <div className="h-4 w-4 bg-slate-200 rounded" />
            </div>
            <div className="h-7 w-24 bg-slate-200 rounded" />
            <div className="h-3 w-40 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Compact Secondary Inventory Strip Skeleton */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 animate-pulse flex flex-wrap items-center justify-between gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="h-3.5 w-24 bg-slate-200 rounded" />
            <div className="h-4 w-10 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Department Distribution Chart Skeleton */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-64 bg-slate-200 rounded" />
            <div className="h-3 w-44 bg-slate-100 rounded" />
          </div>
          <div className="h-8 w-56 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-64 bg-slate-50 border border-slate-100 rounded-lg flex items-end justify-around px-8 pb-6 gap-4">
          {[55, 80, 42, 68, 50, 74].map((h, i) => (
            <div
              key={i}
              className="w-10 bg-slate-200 rounded-t-md"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Conflict Heatmap Skeleton */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-4 w-56 bg-slate-200 rounded" />
            <div className="h-3 w-72 bg-slate-100 rounded" />
          </div>
          <div className="h-8 w-64 bg-slate-100 rounded-lg" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-7 gap-2">
              <div className="h-11 bg-slate-200 rounded col-span-2" />
              {[0, 1, 2, 3, 4].map((cIdx) => (
                <div key={cIdx} className="h-11 bg-slate-100 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Assignments Table Skeleton */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-60 bg-slate-200 rounded" />
            <div className="h-3 w-48 bg-slate-100 rounded" />
          </div>
          <div className="h-8 w-44 bg-slate-100 rounded-lg" />
        </div>
        <div className="divide-y divide-slate-100 p-4 space-y-3">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="grid grid-cols-6 gap-4 py-2">
              <div className="h-4 bg-slate-200 rounded" />
              <div className="h-4 bg-slate-200 rounded col-span-2" />
              <div className="h-4 bg-slate-100 rounded" />
              <div className="h-4 bg-slate-100 rounded" />
              <div className="h-4 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
