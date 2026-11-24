import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import {
  fetchAdminAccounts,
  provisionAdminAccount,
  removeAdminAccount,
  updateAdminAccount,
} from '../services/auditService.js';
import { formatAuditTimestamp } from '../utils/auditLogs.js';
import { SystemAuditLogsSection } from './SystemAuditLogsSection.jsx';

export function AdministratorManagementView({
  adminEmail = '',
  adminUid = '',
  showSuccess,
  showError,
  requestDeleteConfirmation,
}) {
  const [accounts, setAccounts] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [requesterRole, setRequesterRole] = useState('admin');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState('');

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('admin');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [auditRefreshCounter, setAuditRefreshCounter] = useState(0);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError('');
    try {
      const data = await fetchAdminAccounts({
        requesterEmail: adminEmail,
        requesterUid: adminUid,
      });
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setIsSuperAdmin(Boolean(data.isSuperAdmin));
      setRequesterRole(data.requesterRole || 'admin');
    } catch (err) {
      setAccountsError(
        err instanceof Error
          ? err.message
          : 'Failed to load administrator directory.'
      );
    } finally {
      setLoadingAccounts(false);
    }
  }, [adminEmail, adminUid]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleProvisionAdmin = async (e) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail) {
      showError('Please provide both the administrator name and email address.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await provisionAdminAccount({
        email: trimmedEmail,
        name: trimmedName,
        role: newRole,
        requesterEmail: adminEmail,
        requesterUid: adminUid,
      });
      setAccounts((prev) => [...prev, created]);
      setNewName('');
      setNewEmail('');
      setNewRole('admin');
      setAuditRefreshCounter((c) => c + 1);
      showSuccess(
        `Authorized ${created.role === 'super_admin' ? 'Super Administrator' : 'Administrator'} account for ${created.email}.`
      );
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRole = async (acc) => {
    const nextRole = acc.role === 'super_admin' ? 'admin' : 'super_admin';
    setBusyId(acc.id);
    try {
      const updated = await updateAdminAccount(
        acc.id,
        { role: nextRole },
        { requesterEmail: adminEmail, requesterUid: adminUid }
      );
      setAccounts((prev) => prev.map((item) => (item.id === acc.id ? updated : item)));
      setAuditRefreshCounter((c) => c + 1);
      showSuccess(
        `Updated ${updated.email} role to ${
          updated.role === 'super_admin' ? 'Super Administrator' : 'Administrator'
        }.`
      );
    } catch (err) {
      showError(err);
    } finally {
      setBusyId('');
    }
  };

  const handleToggleStatus = async (acc) => {
    const nextStatus = acc.status === 'active' ? 'suspended' : 'active';
    setBusyId(acc.id);
    try {
      const updated = await updateAdminAccount(
        acc.id,
        { status: nextStatus },
        { requesterEmail: adminEmail, requesterUid: adminUid }
      );
      setAccounts((prev) => prev.map((item) => (item.id === acc.id ? updated : item)));
      setAuditRefreshCounter((c) => c + 1);
      showSuccess(
        `${updated.email} is now ${updated.status === 'active' ? 'Active' : 'Suspended'}.`
      );
    } catch (err) {
      showError(err);
    } finally {
      setBusyId('');
    }
  };

  const handleRequestDelete = (acc) => {
    requestDeleteConfirmation({
      title: 'Remove Administrator Account',
      message: `Revoke portal access and permanently remove ${acc.name} (${acc.email}) from the authorized administrator directory?`,
      confirmLabel: 'Remove Administrator',
      onConfirm: async () => {
        try {
          await removeAdminAccount(acc.id, {
            requesterEmail: adminEmail,
            requesterUid: adminUid,
          });
          setAccounts((prev) => prev.filter((item) => item.id !== acc.id));
          setAuditRefreshCounter((c) => c + 1);
          showSuccess(`Administrator account ${acc.email} removed.`);
        } catch (err) {
          showError(err);
        }
      },
    });
  };

  const normalizedMe = String(adminEmail || '').trim().toLowerCase();

  return (
    <div className="space-y-6" data-testid="admin-management-view">
      {/* Session Identity Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            Administrator Access Control
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              Signed in as <strong className="font-medium text-slate-800">{adminEmail || 'Unknown'}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Role:{' '}
              <strong className="font-medium text-slate-800">
                {isSuperAdmin
                  ? 'Super Administrator'
                  : requesterRole === 'admin'
                  ? 'Administrator'
                  : requesterRole}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {accounts.length} authorized {accounts.length === 1 ? 'account' : 'accounts'}
            </span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 shrink-0">
          {isSuperAdmin ? (
            <>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Super Administrator Governance Active</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Standard Administrator Access</span>
            </>
          )}
        </div>
      </div>

      {/* Add Administrator Form (Super Admin Only) */}
      {isSuperAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900">Add Administrator</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Authorize another university examination controller or department administrator to access the portal.
          </p>

          <form
            onSubmit={handleProvisionAdmin}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label
                htmlFor="admin-name-input"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Full Name
              </label>
              <input
                id="admin-name-input"
                data-testid="add-admin-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Dr. Priya Sharma"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="admin-email-input"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                University Email
              </label>
              <input
                id="admin-email-input"
                data-testid="add-admin-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="e.g. priya.sharma@university.edu"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="admin-role-select"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Access Role
              </label>
              <select
                id="admin-role-select"
                data-testid="add-admin-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                <option value="admin">Administrator</option>
                <option value="super_admin">Super Administrator</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              data-testid="add-admin-submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap h-[38px]"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              {submitting ? 'Adding...' : 'Add Administrator'}
            </button>
          </form>
        </div>
      )}

      {/* Administrator Accounts Directory */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Authorized Administrator Directory
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Active and suspended administrator accounts linked to Examination Control.
            </p>
          </div>
        </div>

        {accountsError ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm text-red-700">{accountsError}</p>
            <button
              type="button"
              onClick={loadAccounts}
              className="px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : loadingAccounts ? (
          <div className="divide-y divide-slate-200">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="h-3.5 w-40 bg-slate-200 rounded" />
                <div className="h-3.5 w-48 bg-slate-200 rounded" />
                <div className="h-3.5 w-24 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No administrator records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              data-testid="admin-accounts-table"
              className="w-full text-left border-collapse"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Administrator</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Role</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Provisioned</th>
                  {isSuperAdmin && (
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {accounts.map((acc) => {
                  const isSelf =
                    acc.email.toLowerCase() === normalizedMe ||
                    (adminUid && acc.firebaseUid && acc.firebaseUid === adminUid);
                  const isActive = acc.status === 'active';
                  const rowBusy = busyId === acc.id;

                  return (
                    <tr
                      key={acc.id}
                      data-testid={`admin-account-row-${acc.email}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">
                          {acc.name}
                          {isSelf && (
                            <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                              (Current session)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {acc.firebaseUid
                            ? `UID ${acc.firebaseUid.slice(0, 12)}`
                            : 'UID pending sign-in'}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-slate-700 font-mono">
                        {acc.email}
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={
                            acc.role === 'super_admin'
                              ? 'font-semibold text-blue-800'
                              : 'font-medium text-slate-700'
                          }
                        >
                          {acc.role === 'super_admin'
                            ? 'Super Administrator'
                            : 'Administrator'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            isActive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isActive ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          {isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {formatAuditTimestamp(acc.createdAtIso, acc.createdAt)}
                      </td>

                      {isSuperAdmin && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isSelf || rowBusy}
                              onClick={() => handleToggleRole(acc)}
                              title={
                                isSelf
                                  ? 'Cannot modify your own active Super Administrator role'
                                  : 'Toggle role between Administrator and Super Administrator'
                              }
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-40 cursor-pointer whitespace-nowrap"
                            >
                              {acc.role === 'super_admin'
                                ? 'Set Admin'
                                : 'Make Super Admin'}
                            </button>

                            <button
                              type="button"
                              disabled={isSelf || rowBusy}
                              onClick={() => handleToggleStatus(acc)}
                              title={
                                isSelf
                                  ? 'Cannot suspend your own active account'
                                  : 'Toggle account active or suspended status'
                              }
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-40 cursor-pointer whitespace-nowrap"
                            >
                              {isActive ? 'Suspend' : 'Activate'}
                            </button>

                            <button
                              type="button"
                              disabled={isSelf || rowBusy}
                              onClick={() => handleRequestDelete(acc)}
                              aria-label={`Remove ${acc.email}`}
                              className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Latest System Audit Logs Section (Super Administrator Only) */}
      <SystemAuditLogsSection
        requesterEmail={adminEmail}
        requesterUid={adminUid}
        isSuperAdmin={isSuperAdmin}
        requesterRole={requesterRole}
        refreshSignal={auditRefreshCounter}
      />
    </div>
  );
}
