export function isForenoonSession(session = '') {
  return String(session || '').trim().toUpperCase().startsWith('FN');
}

export function getSessionBadgeClasses(session = '') {
  if (isForenoonSession(session)) {
    return 'bg-violet-100 text-violet-900 border-violet-300';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function getSessionHeaderClasses(session = '') {
  if (isForenoonSession(session)) {
    return 'bg-violet-50/90 text-violet-900';
  }
  return 'bg-slate-50 text-slate-700';
}

export function getSessionColumnTintClasses(session = '') {
  if (isForenoonSession(session)) {
    return 'bg-violet-50/25';
  }
  return '';
}
