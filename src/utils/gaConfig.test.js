import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GA_PARAMETERS,
  GA_PRESETS,
  detectMatchingGAPreset,
  estimateGAWorkload,
  haveGAParametersChanged,
  normalizeGAParameters,
  validateGAParameters,
} from './gaConfig.js';

test('normalizeGAParameters clamps bounds and derives safe elitism/tournament limits', () => {
  const normalized = normalizeGAParameters({
    populationSize: 12,
    maxGenerations: 9999,
    mutationRate: 0.9,
    crossoverRate: 0.1,
    elitismCount: 9,
    tournamentSize: 20,
    earlyStopGenerations: -5,
    executionMode: 'SERVER_WORKER',
    availableDates: ['2026-11-20', 'bad-date', '2026-11-18', '2026-11-18'],
  });

  assert.equal(normalized.populationSize, 12);
  assert.equal(normalized.generations, 500);
  assert.equal(normalized.mutationRate, 0.5);
  assert.equal(normalized.crossoverRate, 0.3);
  // Half of popSize=12 is 6
  assert.equal(normalized.elitismCount, 6);
  // Max tournament size is 8
  assert.equal(normalized.tournamentSize, 8);
  assert.equal(normalized.earlyStopGenerations, 0);
  assert.equal(normalized.executionMode, 'SERVER_WORKER');
  assert.deepEqual(normalized.availableDates, ['2026-11-18', '2026-11-20']);
});

test('validateGAParameters catches out-of-range and fractional integer fields', () => {
  const valid = validateGAParameters(DEFAULT_GA_PARAMETERS);
  assert.equal(valid.isValid, true);
  assert.deepEqual(valid.errors, {});

  const invalid = validateGAParameters({
    populationSize: 4,
    generations: 12.5,
    mutationRate: 0.85,
    crossoverRate: 0.15,
    elitismCount: 0,
    tournamentSize: 1,
    earlyStopGenerations: 250,
    availableDates: [],
  });

  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errors.populationSize);
  assert.ok(invalid.errors.generations);
  assert.ok(invalid.errors.mutationRate);
  assert.ok(invalid.errors.crossoverRate);
  assert.ok(invalid.errors.elitismCount);
  assert.ok(invalid.errors.tournamentSize);
  assert.ok(invalid.errors.earlyStopGenerations);
  assert.ok(invalid.errors.availableDates);
});

test('detectMatchingGAPreset identifies presets and custom configurations', () => {
  for (const preset of GA_PRESETS) {
    assert.equal(detectMatchingGAPreset(preset.values), preset.id);
  }
  assert.equal(
    detectMatchingGAPreset({ ...DEFAULT_GA_PARAMETERS, populationSize: 75 }),
    'custom'
  );
});

test('estimateGAWorkload calculates total evaluations and compute tier accurately', () => {
  const fast = estimateGAWorkload({ populationSize: 20, generations: 25 }, 8);
  assert.equal(fast.maxEvaluations, 500);
  assert.equal(fast.computeTier, 'Fast');

  const deep = estimateGAWorkload({ populationSize: 100, generations: 120 }, 16);
  assert.equal(deep.maxEvaluations, 12000);
  assert.equal(deep.computeTier, 'Intensive');
});

test('haveGAParametersChanged detects modifications accurately', () => {
  const a = normalizeGAParameters(DEFAULT_GA_PARAMETERS);
  const b = normalizeGAParameters({ ...DEFAULT_GA_PARAMETERS });
  assert.equal(haveGAParametersChanged(a, b), false);

  assert.equal(
    haveGAParametersChanged(a, { ...b, generations: 75 }),
    true
  );
  assert.equal(
    haveGAParametersChanged(a, { ...b, executionMode: 'SERVER_WORKER' }),
    true
  );
});
