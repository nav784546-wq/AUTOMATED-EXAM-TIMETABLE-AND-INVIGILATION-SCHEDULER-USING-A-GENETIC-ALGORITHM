import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PaginationBar({
  totalItems = 0,
  page = 1,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'records',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, currentPage * pageSize);

  if (totalItems === 0) return null;

  return (
    <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 no-print">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono tabular-nums">
          Showing <strong className="text-slate-900">{startIdx}</strong>–
          <strong className="text-slate-900">{endIdx}</strong> of{' '}
          <strong className="text-slate-900">{totalItems}</strong> {itemLabel}
        </span>

        {onPageSizeChange && (
          <label className="inline-flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                if (onPageChange) onPageChange(1);
              }}
              aria-label={`Rows per page for ${itemLabel}`}
              className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white font-mono text-slate-800"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange && onPageChange(currentPage - 1)}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Prev
        </button>

        <span className="px-2.5 font-mono tabular-nums text-slate-800 font-medium">
          Page {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange && onPageChange(currentPage + 1)}
          aria-label="Next page"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
