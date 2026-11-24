import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemAuditCSV,
  filterAuditLogsClientSide,
  formatAuditRelativeTime,
  formatAuditTimestamp,
  getAuditCategoryLabel,
  sanitizeClientMetadata,
} from './auditLogs.js';

describe('auditLogs helpers', () => {
  it('maps audit categories to human-readable labels', () => {
    assert.equal(getAuditCategoryLabel('admin_access'), 'Admin Access');
    assert.equal(getAuditCategoryLabel('auth_security'), 'Auth & Recovery');
    assert.equal(getAuditCategoryLabel('scheduling'), 'Scheduling & Halls');
    assert.equal(getAuditCategoryLabel('academic_data'), 'Academic Data');
    assert.equal(getAuditCategoryLabel('unknown'), 'System Event');
  });

  it('strips sensitive fields from metadata', () => {
    const cleaned = sanitizeClientMetadata({
      password: 'secret-password',
      newPassword: 'abc',
      oobCode: '123456',
      resetToken: 'tok',
      targetRole: 'admin',
      count: 4,
    });
    assert.deepEqual(cleaned, { targetRole: 'admin', count: 4 });
  });

  it('formats UTC timestamps and relative durations deterministically', () => {
    assert.equal(
      formatAuditTimestamp('2026-11-23T05:14:09Z', 0),
      '2026-11-23 05:14:09 UTC'
    );
    assert.equal(formatAuditRelativeTime(1000, 1045), '45s ago');
    assert.equal(formatAuditRelativeTime(1000, 1360), '6m ago');
    assert.equal(formatAuditRelativeTime(1000, 8200), '2h ago');
  });

  it('filters audit logs by category, outcome, and search query', () => {
    const sample = [
      {
        id: 'syslog-1',
        category: 'admin_access',
        outcome: 'SUCCESS',
        action: 'ADMIN_PROVISIONED',
        summary: 'Provisioned administrator jane@university.edu',
        actorEmail: 'controller@university.edu',
        targetLabel: 'jane@university.edu',
      },
      {
        id: 'audit-2',
        category: 'auth_security',
        outcome: 'FAILED',
        action: 'RESET_FAILED',
        summary: 'Password reset expired',
        actorEmail: 'john@university.edu',
        targetLabel: 'john@university.edu',
      },
    ];

    assert.equal(filterAuditLogsClientSide(sample, { category: 'admin_access' }).length, 1);
    assert.equal(filterAuditLogsClientSide(sample, { outcome: 'FAILED' }).length, 1);
    assert.equal(filterAuditLogsClientSide(sample, { search: 'jane' }).length, 1);
    assert.equal(filterAuditLogsClientSide(sample, { search: 'nonexistent' }).length, 0);
  });

  it('builds properly escaped UTF-8 BOM CSV output', () => {
    const csv = buildSystemAuditCSV([
      {
        id: 'syslog-9',
        category: 'scheduling',
        action: 'TIMETABLE_FINALIZED',
        outcome: 'SUCCESS',
        summary: 'Finalized timetable, "Fall 2026"',
        actorEmail: 'controller@university.edu',
        actorUid: 'uid-1',
        actorRole: 'super_admin',
        targetType: 'schedule',
        targetId: 'sched-1',
        targetLabel: 'Fall 2026',
        createdAtIso: '2026-11-23T05:00:00Z',
        source: 'system_audit',
      },
    ]);
    assert.ok(csv.startsWith('\uFEFFTimestamp (UTC),Log ID,Category'));
    assert.ok(csv.includes('"Finalized timetable, ""Fall 2026"""'));
    assert.ok(csv.includes('Scheduling & Halls'));
  });
});
