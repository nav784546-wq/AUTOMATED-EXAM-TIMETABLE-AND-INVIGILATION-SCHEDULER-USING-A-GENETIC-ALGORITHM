import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isForenoonSession,
  getSessionBadgeClasses,
  getSessionHeaderClasses,
  getSessionColumnTintClasses,
} from './sessionStyles.js';

test('isForenoonSession identifies FN labels regardless of full time suffix', () => {
  assert.equal(isForenoonSession('FN'), true);
  assert.equal(isForenoonSession('FN (09:30 - 12:30)'), true);
  assert.equal(isForenoonSession(' fn '), true);
  assert.equal(isForenoonSession('AN'), false);
  assert.equal(isForenoonSession('AN (14:00 - 17:00)'), false);
  assert.equal(isForenoonSession(''), false);
});

test('getSessionBadgeClasses and header helpers return distinct violet classes for FN vs AN', () => {
  const fnBadge = getSessionBadgeClasses('FN (09:30 - 12:30)');
  const anBadge = getSessionBadgeClasses('AN (14:00 - 17:00)');
  assert.notEqual(fnBadge, anBadge);
  assert.match(fnBadge, /violet/);
  assert.match(anBadge, /slate/);

  assert.match(getSessionHeaderClasses('FN'), /violet/);
  assert.match(getSessionHeaderClasses('AN'), /slate/);
  assert.match(getSessionColumnTintClasses('FN'), /violet/);
  assert.equal(getSessionColumnTintClasses('AN'), '');
});
