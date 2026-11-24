import { useCallback, useEffect, useState } from 'react';

export function formatErrorMessage(err) {
  const raw = err instanceof Error ? err.message : String(err || 'Operation failed.');
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.error || 'Database permission or validation error.';
    } catch {
      return raw;
    }
  }
  return raw;
}

export function useToastConfirm() {
  const [statusBanner, setStatusBanner] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const showSuccess = useCallback((message, options = {}) => {
    setStatusBanner({
      type: 'success',
      message,
      undoLabel: options.undoLabel || null,
      onUndo: typeof options.onUndo === 'function' ? options.onUndo : null,
      durationMs: options.durationMs ?? (options.onUndo ? 12000 : 4000),
    });
  }, []);

  const showError = useCallback((err) => {
    setStatusBanner({
      type: 'error',
      message: formatErrorMessage(err),
      undoLabel: null,
      onUndo: null,
    });
  }, []);

  const dismissBanner = useCallback(() => {
    setStatusBanner(null);
  }, []);

  useEffect(() => {
    if (statusBanner?.type === 'success') {
      const delay = statusBanner.durationMs || 4000;
      const timer = setTimeout(() => setStatusBanner(null), delay);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [statusBanner]);

  const requestDeleteConfirmation = useCallback(
    ({ title, message, confirmLabel = 'Delete Permanently', onConfirm }) => {
      setConfirmState({ title, message, confirmLabel, onConfirm });
    },
    []
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmState?.onConfirm) return;
    setConfirmLoading(true);
    try {
      await confirmState.onConfirm();
      setConfirmState(null);
    } finally {
      setConfirmLoading(false);
    }
  }, [confirmState]);

  const cancelConfirmation = useCallback(() => {
    if (!confirmLoading) {
      setConfirmState(null);
    }
  }, [confirmLoading]);

  return {
    statusBanner,
    showSuccess,
    showError,
    dismissBanner,
    confirmState,
    confirmLoading,
    requestDeleteConfirmation,
    handleConfirmDelete,
    cancelConfirmation,
  };
}
