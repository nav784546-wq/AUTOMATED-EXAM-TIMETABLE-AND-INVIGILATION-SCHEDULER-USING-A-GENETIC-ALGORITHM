import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { fetchSystemAuditLogs } from '../services/auditService.js';
import {
  AUDIT_CATEGORY_OPTIONS,
  AUDIT_OUTCOME_OPTIONS,
  buildSystemAuditCSV,
  formatAuditRelativeTime,
  formatAuditTimestamp,
  getAuditCategoryLabel,
} from '../utils/auditLogs.js';

const PAGE_SIZE = 15;

export function SystemAuditLogsSection({
  requesterEmail = '',
  requesterUid = '',
  isSuperAdmin = false,
  requesterRole = 'admin',
  refreshSignal = 0,
}) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({
    totalEvents: 0,
    successCount: 0,
    failedCount: 0,
    last24HoursCount: 0,
    byCategory: {},
  });
  const [category, setCategory] = useState('all');
  const [outcome, setOutcome] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLogId, setSelectedLogId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(0);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadAuditLogs = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      setLogs([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchSystemAuditLogs({
        requesterEmail,
        requesterUid,
        category,
        outcome,
        search: debouncedSearch,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotal(Number(data.total || 0));
      setSummary(
        data.summary || {
          totalEvents: 0,
          successCount: 0,
          failedCount: 0,
          last24HoursCount: 0,
          byCategory: {},
        }
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load system audit logs. Please retry.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    isSuperAdmin,
    requesterEmail,
    requesterUid,
    category,
    outcome,
    debouncedSearch,
    page,
  ]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs, refreshSignal]);

  const handleCategoryChange = (nextCategory) => {
    setCategory(nextCategory);
    setPage(0);
    setSelectedLogId(null);
  };

  const handleOutcomeChange = (nextOutcome) => {
    setOutcome(nextOutcome);
    setPage(0);
    setSelectedLogId(null);
  };

  const handleClearFilters = () => {
    setCategory('all');
    setOutcome('ALL');
    setSearchInput('');
    setDebouncedSearch('');
    setPage(0);
    setSelectedLogId(null);
  };

  const handleExportCsv = () => {
    if (!logs.length || typeof document === 'undefined') return;
    const csv = buildSystemAuditCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'examgrid_system_audit_logs.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedLog = useMemo(
    () => logs.find((item) => item.id === selectedLogId) || null,
    [logs, selectedLogId]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters =
    category !== 'all' || outcome !== 'ALL' || debouncedSearch.length > 0;

  if (!isSuperAdmin) {
    return (
      <section
        data-testid="audit-logs-restricted"
        aria-labelledby="system-audit-logs-heading"
        className="bg-white border border-slate-200 rounded-xl p-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h2
              id="system-audit-logs-heading"
              className="text-base font-semibold text-slate-900"
            >
              System Audit Logs
            </h2>
            <p className="text-sm text-slate-600">
              Access Restricted: Viewing portal-wide management, credential recovery, and role change audit logs requires Super Administrator privileges.
            </p>
            <p className="text-xs text-slate-500 pt-1">
              Current Access Level: <span className="font-medium text-slate-800">{requesterRole === 'admin' ? 'Administrator' : requesterRole}</span>
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="system-audit-logs-section"
      aria-labelledby="system-audit-logs-heading"
      className="space-y-4"
    >
      {/* Section Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2
            id="system-audit-logs-heading"
            className="text-base font-semibold text-slate-900"
          >
            Latest System Audit Logs
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable activity trail across administrator accounts, password recovery, exam scheduling, and academic records.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadAuditLogs}
            disabled={loading}
            data-testid="audit-logs-refresh"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || logs.length === 0}
            data-testid="audit-logs-export"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* 4-Column KPI Hairline Strip */}
      <div
        data-testid="audit-logs-kpi-strip"
        className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
      >
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Total Audit Events</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {summary.totalEvents ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Unified security &amp; ops</div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Last 24 Hours</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {summary.last24HoursCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Recent portal actions</div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Successful Actions</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
            {summary.successCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Verified operations</div>
        </div>

        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Failed or Denied</div>
          <div
            className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
              (summary.failedCount ?? 0) > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {summary.failedCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Errors &amp; RBAC blocks</div>
        </div>
      </div>

      {/* Audit Container: Filters + Dense Table + Detail Inspector */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Segmented Category Filter Controls */}
            <div
              role="tablist"
              aria-label="Filter audit logs by category"
              className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {AUDIT_CATEGORY_OPTIONS.map((opt) => {
                const active = category === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`audit-cat-${opt.id}`}
                    onClick={() => handleCategoryChange(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Outcome & Search Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search actor, action, or target..."
                  aria-label="Search audit logs"
                  data-testid="audit-logs-search"
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <select
                value={outcome}
                onChange={(e) => handleOutcomeChange(e.target.value)}
                aria-label="Filter by outcome"
                data-testid="audit-logs-outcome"
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                {AUDIT_OUTCOME_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div
            role="alert"
            data-testid="audit-logs-error"
            className="p-6 text-center space-y-3 border-b border-slate-200 bg-red-50/60"
          >
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              type="button"
              onClick={loadAuditLogs}
              className="px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Retry Loading Logs
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !error ? (
          <div data-testid="audit-logs-loading" className="divide-y divide-slate-200">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="h-3.5 w-36 bg-slate-200 rounded" />
                <div className="h-3.5 w-64 bg-slate-200 rounded flex-1 max-w-md" />
                <div className="h-3.5 w-24 bg-slate-200 rounded hidden sm:block" />
                <div className="h-3.5 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : !error && logs.length === 0 ? (
          /* Empty State */
          <div data-testid="audit-logs-empty" className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              {hasActiveFilters
                ? 'No audit logs match the selected filters'
                : 'No system audit events recorded yet'}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {hasActiveFilters
                ? 'Adjust the category, outcome, or search keyword to view other recorded events.'
                : 'Administrator provisioning, role changes, password recovery attempts, and academic or scheduling updates will appear here chronologically.'}
            </p>
            {hasActiveFilters && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        ) : !error ? (
          /* Populated Data Table */
          <div className="overflow-x-auto">
            <table
              data-testid="audit-logs-table"
              className="w-full text-left border-collapse"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4 whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 px-4">Activity &amp; Target</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Category</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Actor</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Outcome</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {logs.map((entry) => {
                  const isSelected = selectedLogId === entry.id;
                  const isSuccess = entry.outcome === 'SUCCESS';
                  const relTime = formatAuditRelativeTime(entry.createdAt);
                  return (
                    <tr
                      key={entry.id}
                      data-testid={`audit-row-${entry.id}`}
                      onClick={() =>
                        setSelectedLogId((prev) => (prev === entry.id ? null : entry.id))
                      }
                      className={`transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 align-top whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-900">
                          {formatAuditTimestamp(entry.createdAtIso, entry.createdAt)}
                        </div>
                        {relTime && (
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                            {relTime}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-4 align-top min-w-[240px]">
                        <div className="font-medium text-slate-900 leading-snug">
                          {entry.summary}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-slate-600">{entry.action}</span>
                          {entry.targetLabel && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[220px]">
                                {entry.targetLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 align-top whitespace-nowrap text-slate-600">
                        {getAuditCategoryLabel(entry.category)}
                      </td>

                      <td className="py-2.5 px-4 align-top whitespace-nowrap">
                        <div className="text-slate-900 font-medium truncate max-w-[200px]">
                          {entry.actorEmail || (entry.actorUid ? `UID ${entry.actorUid.slice(0, 10)}` : 'System')}
                        </div>
                        {entry.actorRole && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {entry.actorRole === 'super_admin'
                              ? 'Super Admin'
                              : entry.actorRole === 'admin'
                              ? 'Administrator'
                              : entry.actorRole}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-4 align-top whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            isSuccess ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {isSuccess ? 'Success' : 'Failed'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 align-top text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLogId((prev) =>
                              prev === entry.id ? null : entry.id
                            );
                          }}
                          aria-expanded={isSelected}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer whitespace-nowrap"
                        >
                          {isSelected ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              Hide
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              Inspect
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Selected Audit Event Inspector */}
        {selectedLog && (
          <div
            data-testid="audit-log-detail-panel"
            className="border-t border-slate-200 bg-slate-50/70 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-900">
                Event Record Details · <span className="font-mono text-slate-600">{selectedLog.id}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogId(null)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Event Source</div>
                <div className="font-mono text-slate-900 mt-0.5">{selectedLog.source}</div>
              </div>
              <div>
                <div className="text-slate-500">Actor UID</div>
                <div className="font-mono text-slate-900 mt-0.5 truncate">
                  {selectedLog.actorUid || 'Not linked'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Target Resource</div>
                <div className="text-slate-900 mt-0.5">
                  {selectedLog.targetType || 'system'}
                  {selectedLog.targetId ? ` (${selectedLog.targetId})` : ''}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Client IP</div>
                <div className="font-mono text-slate-900 mt-0.5">
                  {selectedLog.clientIp || 'Local / Unknown'}
                </div>
              </div>
            </div>

            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
              <div className="pt-2 border-t border-slate-200/80">
                <div className="text-xs text-slate-500 mb-1.5">Sanitized Metadata</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {Object.entries(selectedLog.metadata).map(([k, v]) => (
                    <div key={k} className="text-slate-700 font-mono truncate">
                      <span className="text-slate-500">{k}:</span>{' '}
                      <span className="text-slate-900">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && !error && total > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
            <div className="font-mono tabular-nums">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{' '}
              {total} events
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  setSelectedLogId(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="font-mono tabular-nums px-1">
                Page {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => {
                  setPage((p) => p + 1);
                  setSelectedLogId(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
