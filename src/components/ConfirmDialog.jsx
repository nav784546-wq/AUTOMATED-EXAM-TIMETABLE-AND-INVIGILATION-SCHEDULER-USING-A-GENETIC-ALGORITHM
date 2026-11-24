import React, { useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';

export function ConfirmDialog({
  open,
  title = 'Confirm Permanent Deletion',
  message = 'Are you sure you want to permanently delete this record from the database?',
  confirmLabel = 'Delete Permanently',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const cancelBtnRef = useRef(null);
  const dialogRef = useFocusTrap({
    isOpen: open,
    onClose: () => {
      if (!loading && typeof onCancel === 'function') {
        onCancel();
      }
    },
    initialFocusRef: cancelBtnRef,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading && typeof onCancel === 'function') {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 focus:outline-none"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
              {title}
            </h3>
            <p id="confirm-dialog-message" className="text-sm text-slate-600 mt-1">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            ref={cancelBtnRef}
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
