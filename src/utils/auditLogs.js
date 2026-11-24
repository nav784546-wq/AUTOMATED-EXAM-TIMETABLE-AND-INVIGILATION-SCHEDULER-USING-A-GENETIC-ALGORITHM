export const AUDIT_CATEGORY_OPTIONS = [
  { id: 'all', label: 'All Activities' },
  { id: 'admin_access', label: 'Admin Access' },
  { id: 'auth_security', label: 'Auth & Recovery' },
  { id: 'scheduling', label: 'Scheduling & Halls' },
  { id: 'academic_data', label: 'Academic Data' },
];

export const AUDIT_OUTCOME_OPTIONS = [
  { id: 'ALL', label: 'All Outcomes' },
  { id: 'SUCCESS', label: 'Success' },
  { id: 'FAILED', label: 'Failed' },
];

const CATEGORY_LABELS = {
  admin_access: 'Admin Access',
  auth_security: 'Auth & Recovery',
  scheduling: 'Scheduling & Halls',
  academic_data: 'Academic Data',
};

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'confirmpassword',
  'oobcode',
  'resettoken',
  'token',
  'idtoken',
  'secret',
]);

export function getAuditCategoryLabel(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_LABELS[key] || 'System Event';
}

export function sanitizeClientMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const cleaned = {};
  for (const [rawKey, rawVal] of Object.entries(metadata)) {
    const key = String(rawKey || '').trim();
    if (!key || SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    if (
      rawVal === null ||
      typeof rawVal === 'string' ||
      typeof rawVal === 'number' ||
      typeof rawVal === 'boolean'
    ) {
      cleaned[key.slice(0, 64)] =
        typeof rawVal === 'string' ? rawVal.slice(0, 200) : rawVal;
    }
  }
  return cleaned;
}

export function formatAuditTimestamp(createdAtIso, createdAtSeconds) {
  if (createdAtIso && typeof createdAtIso === 'string') {
    const date = new Date(createdAtIso);
    if (!Number.isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mm = String(date.getUTCMinutes()).padStart(2, '0');
      const ss = String(date.getUTCSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}:${ss} UTC`;
    }
  }
  if (typeof createdAtSeconds === 'number' && Number.isFinite(createdAtSeconds) && createdAtSeconds > 0) {
    const date = new Date(createdAtSeconds * 1000);
    if (!Number.isNaN(date.getTime())) {
      return formatAuditTimestamp(date.toISOString(), 0);
    }
  }
  return 'Unknown timestamp';
}

export function formatAuditRelativeTime(createdAtSeconds, nowSeconds = Math.floor(Date.now() / 1000)) {
  const ts = Number(createdAtSeconds || 0);
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const diff = Math.max(0, Math.floor(nowSeconds - ts));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function filterAuditLogsClientSide(logs = [], { category = 'all', outcome = 'ALL', search = '' } = {}) {
  const cat = String(category || 'all').trim().toLowerCase();
  const out = String(outcome || 'ALL').trim().toUpperCase();
  const q = String(search || '').trim().toLowerCase();

  return (Array.isArray(logs) ? logs : []).filter((entry) => {
    if (cat && cat !== 'all' && String(entry.category || '').toLowerCase() !== cat) {
      return false;
    }
    if (out && out !== 'ALL' && String(entry.outcome || '').toUpperCase() !== out) {
      return false;
    }
    if (q) {
      const haystack = [
        entry.id,
        entry.action,
        entry.summary,
        entry.category,
        entry.actorEmail,
        entry.actorUid,
        entry.targetType,
        entry.targetId,
        entry.targetLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function escapeCsvCell(val) {
  const str = String(val ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildSystemAuditCSV(logs = []) {
  const headers = [
    'Timestamp (UTC)',
    'Log ID',
    'Category',
    'Action',
    'Outcome',
    'Summary',
    'Actor Email',
    'Actor UID',
    'Actor Role',
    'Target Type',
    'Target ID',
    'Target Label',
    'Source',
  ];

  const rows = (Array.isArray(logs) ? logs : []).map((entry) =>
    [
      formatAuditTimestamp(entry.createdAtIso, entry.createdAt),
      entry.id || '',
      getAuditCategoryLabel(entry.category),
      entry.action || '',
      entry.outcome || '',
      entry.summary || '',
      entry.actorEmail || '',
      entry.actorUid || '',
      entry.actorRole || '',
      entry.targetType || '',
      entry.targetId || '',
      entry.targetLabel || '',
      entry.source || 'system_audit',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return `\uFEFF${headers.map(escapeCsvCell).join(',')}\n${rows.join('\n')}`;
}
