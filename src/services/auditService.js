import { doc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { sanitizeClientMetadata } from '../utils/auditLogs.js';
import { handleFirestoreError, OperationType } from './persistenceService.js';

const API_BASE = '/api';

async function adminRequest(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.detail || data.error || `Request failed with status ${res.status}`
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function fetchCurrentAdminRole(email = '', uid = '') {
  const qs = new URLSearchParams();
  if (email) qs.set('email', String(email).trim().toLowerCase());
  if (uid) qs.set('uid', String(uid).trim());
  return await adminRequest(`/admin/me?${qs.toString()}`);
}

export async function fetchAdminAccounts({ requesterEmail = '', requesterUid = '' } = {}) {
  const qs = new URLSearchParams();
  if (requesterEmail) qs.set('requesterEmail', String(requesterEmail).trim().toLowerCase());
  if (requesterUid) qs.set('requesterUid', String(requesterUid).trim());
  return await adminRequest(`/admin/accounts?${qs.toString()}`);
}

export async function provisionAdminAccount({
  email,
  name,
  role = 'admin',
  firebaseUid = '',
  requesterEmail = '',
  requesterUid = '',
}) {
  const created = await adminRequest('/admin/accounts', {
    method: 'POST',
    body: JSON.stringify({
      email: String(email || '').trim().toLowerCase(),
      name: String(name || '').trim(),
      role: String(role || 'admin').trim().toLowerCase(),
      firebaseUid: String(firebaseUid || '').trim(),
      requesterEmail: String(requesterEmail || '').trim().toLowerCase(),
      requesterUid: String(requesterUid || '').trim(),
    }),
  });

  if (auth.currentUser?.uid && created?.id) {
    const path = `administrators/${created.id}`;
    try {
      await setDoc(doc(db, 'administrators', created.id), {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
        status: created.status,
        firebaseUid: created.firebaseUid || '',
        createdBy: auth.currentUser.uid,
        updatedBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      // Log via standard handler for Firestore diagnostics without reverting SQLite record if user is non-Firestore Super Admin
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch {
        // Ignore mirror write denial so primary backend provisioning still succeeds
      }
    }
  }

  return created;
}

export async function updateAdminAccount(
  accountId,
  updates = {},
  { requesterEmail = '', requesterUid = '' } = {}
) {
  const updated = await adminRequest(`/admin/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...updates,
      requesterEmail: String(requesterEmail || '').trim().toLowerCase(),
      requesterUid: String(requesterUid || '').trim(),
    }),
  });

  if (auth.currentUser?.uid && updated?.id) {
    const path = `administrators/${updated.id}`;
    try {
      await updateDoc(doc(db, 'administrators', updated.id), {
        name: updated.name,
        role: updated.role,
        status: updated.status,
        firebaseUid: updated.firebaseUid || '',
        updatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch {
        // Mirror best-effort
      }
    }
  }

  return updated;
}

export async function removeAdminAccount(
  accountId,
  { requesterEmail = '', requesterUid = '' } = {}
) {
  const qs = new URLSearchParams();
  if (requesterEmail) qs.set('requesterEmail', String(requesterEmail).trim().toLowerCase());
  if (requesterUid) qs.set('requesterUid', String(requesterUid).trim());
  const res = await adminRequest(
    `/admin/accounts/${encodeURIComponent(accountId)}?${qs.toString()}`,
    {
      method: 'DELETE',
    }
  );

  if (auth.currentUser?.uid && accountId) {
    const path = `administrators/${accountId}`;
    try {
      await deleteDoc(doc(db, 'administrators', accountId));
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, path);
      } catch {
        // Mirror best-effort
      }
    }
  }

  return res;
}

export async function fetchSystemAuditLogs({
  requesterEmail = '',
  requesterUid = '',
  category = 'all',
  outcome = 'ALL',
  search = '',
  limit = 25,
  offset = 0,
} = {}) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (requesterEmail) qs.set('requesterEmail', String(requesterEmail).trim().toLowerCase());
  if (requesterUid) qs.set('requesterUid', String(requesterUid).trim());
  if (category && category !== 'all') qs.set('category', category);
  if (outcome && outcome !== 'ALL') qs.set('outcome', outcome);
  if (search) qs.set('search', search.trim());

  return await adminRequest(`/admin/audit-logs?${qs.toString()}`);
}

export async function logSystemAuditEvent({
  category,
  action,
  summary,
  outcome = 'SUCCESS',
  actorEmail = '',
  actorUid = '',
  actorRole = '',
  targetType = '',
  targetId = '',
  targetLabel = '',
  metadata = {},
}) {
  if (!category || !action || !summary) return null;

  const currentUser = auth.currentUser;
  const resolvedEmail = String(
    actorEmail || currentUser?.email || 'controller@university.edu'
  )
    .trim()
    .toLowerCase();
  const resolvedUid = String(actorUid || currentUser?.uid || '').trim();
  const cleanMeta = sanitizeClientMetadata(metadata);

  try {
    const entry = await adminRequest('/admin/audit-logs', {
      method: 'POST',
      body: JSON.stringify({
        category,
        action: String(action).trim().toUpperCase(),
        summary: String(summary).trim().slice(0, 300),
        outcome: String(outcome || 'SUCCESS').trim().toUpperCase(),
        actorEmail: resolvedEmail,
        actorUid: resolvedUid,
        actorRole: String(actorRole || '').trim(),
        targetType: String(targetType || '').trim(),
        targetId: String(targetId || '').trim(),
        targetLabel: String(targetLabel || '').trim(),
        metadata: cleanMeta,
      }),
    });

    if (currentUser?.uid && entry?.id) {
      try {
        await setDoc(doc(db, 'auditLogs', entry.id), {
          id: entry.id,
          category: entry.category,
          action: entry.action,
          summary: entry.summary,
          outcome: entry.outcome,
          actorEmail: resolvedEmail,
          actorUid: currentUser.uid,
          actorRole: entry.actorRole || 'admin',
          targetType: entry.targetType || '',
          targetId: entry.targetId || '',
          targetLabel: entry.targetLabel || '',
          metadata: cleanMeta,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      } catch {
        // Best-effort Firestore mirror; never break main workflow
      }
    }

    return entry;
  } catch {
    return null;
  }
}
