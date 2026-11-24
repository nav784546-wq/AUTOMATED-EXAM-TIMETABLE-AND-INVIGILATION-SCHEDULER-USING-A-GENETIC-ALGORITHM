import { DEFAULT_EXAM_DATES } from './seedData.js';

export const GA_PARAM_SPECS = {
  populationSize: {
    key: 'populationSize',
    label: 'Population Size',
    min: 10,
    max: 300,
    step: 5,
    default: 40,
    integer: true,
    unit: 'chromosomes',
  },
  generations: {
    key: 'generations',
    label: 'Maximum Generations',
    min: 10,
    max: 500,
    step: 5,
    default: 50,
    integer: true,
    unit: 'generations',
  },
  mutationRate: {
    key: 'mutationRate',
    label: 'Mutation Rate',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    minPercent: 1,
    maxPercent: 50,
    stepPercent: 1,
    default: 0.12,
    integer: false,
    unit: '%',
  },
  crossoverRate: {
    key: 'crossoverRate',
    label: 'Crossover Rate',
    min: 0.3,
    max: 1.0,
    step: 0.05,
    minPercent: 30,
    maxPercent: 100,
    stepPercent: 5,
    default: 0.8,
    integer: false,
    unit: '%',
  },
  elitismCount: {
    key: 'elitismCount',
    label: 'Elitism Count',
    min: 1,
    max: 10,
    step: 1,
    default: 2,
    integer: true,
    unit: 'elites',
  },
  tournamentSize: {
    key: 'tournamentSize',
    label: 'Tournament Size',
    min: 2,
    max: 8,
    step: 1,
    default: 3,
    integer: true,
    unit: 'contenders',
  },
  earlyStopGenerations: {
    key: 'earlyStopGenerations',
    label: 'Early-Stop Patience',
    min: 0,
    max: 100,
    step: 5,
    default: 0,
    integer: true,
    unit: 'generations',
  },
};

export const DEFAULT_GA_PARAMETERS = {
  populationSize: 40,
  generations: 50,
  mutationRate: 0.12,
  crossoverRate: 0.8,
  elitismCount: 2,
  tournamentSize: 3,
  earlyStopGenerations: 0,
  executionMode: 'WEB_WORKER',
  availableDates: [...DEFAULT_EXAM_DATES],
};

export const GA_PRESETS = [
  {
    id: 'fast',
    label: 'Fast Preview',
    description: 'Low-latency draft schedule for quick feasibility checks.',
    values: {
      populationSize: 20,
      generations: 25,
      mutationRate: 0.16,
      crossoverRate: 0.75,
      elitismCount: 2,
      tournamentSize: 3,
      earlyStopGenerations: 10,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended institutional default balancing speed and convergence.',
    values: {
      populationSize: 40,
      generations: 50,
      mutationRate: 0.12,
      crossoverRate: 0.8,
      elitismCount: 2,
      tournamentSize: 3,
      earlyStopGenerations: 0,
    },
  },
  {
    id: 'deep',
    label: 'Deep Search',
    description: 'Larger population and longer search horizon for dense exam cohorts.',
    values: {
      populationSize: 80,
      generations: 120,
      mutationRate: 0.1,
      crossoverRate: 0.85,
      elitismCount: 4,
      tournamentSize: 4,
      earlyStopGenerations: 25,
    },
  },
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(val, min, max, fallback) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function clampFloat(val, min, max, fallback, decimals = 4) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(max, num));
  return Number(clamped.toFixed(decimals));
}

export function normalizeAvailableDates(dates) {
  if (!Array.isArray(dates)) return [...DEFAULT_EXAM_DATES];
  const unique = Array.from(
    new Set(
      dates
        .map((d) => String(d || '').trim())
        .filter((d) => ISO_DATE_RE.test(d))
    )
  ).sort();
  return unique.length > 0 ? unique : [...DEFAULT_EXAM_DATES];
}

export function normalizeGAParameters(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const populationSize = clampInt(
    src.populationSize,
    GA_PARAM_SPECS.populationSize.min,
    GA_PARAM_SPECS.populationSize.max,
    DEFAULT_GA_PARAMETERS.populationSize
  );
  const rawGen = src.generations ?? src.maxGenerations;
  const generations = clampInt(
    rawGen,
    GA_PARAM_SPECS.generations.min,
    GA_PARAM_SPECS.generations.max,
    DEFAULT_GA_PARAMETERS.generations
  );
  const mutationRate = clampFloat(
    src.mutationRate,
    GA_PARAM_SPECS.mutationRate.min,
    GA_PARAM_SPECS.mutationRate.max,
    DEFAULT_GA_PARAMETERS.mutationRate
  );
  const crossoverRate = clampFloat(
    src.crossoverRate,
    GA_PARAM_SPECS.crossoverRate.min,
    GA_PARAM_SPECS.crossoverRate.max,
    DEFAULT_GA_PARAMETERS.crossoverRate
  );
  const maxElitism = Math.min(
    GA_PARAM_SPECS.elitismCount.max,
    Math.max(1, Math.floor(populationSize / 2))
  );
  const elitismCount = clampInt(
    src.elitismCount,
    GA_PARAM_SPECS.elitismCount.min,
    maxElitism,
    Math.min(DEFAULT_GA_PARAMETERS.elitismCount, maxElitism)
  );
  const maxTournament = Math.min(GA_PARAM_SPECS.tournamentSize.max, populationSize);
  const tournamentSize = clampInt(
    src.tournamentSize,
    GA_PARAM_SPECS.tournamentSize.min,
    maxTournament,
    Math.min(DEFAULT_GA_PARAMETERS.tournamentSize, maxTournament)
  );
  const earlyStopGenerations = clampInt(
    src.earlyStopGenerations,
    GA_PARAM_SPECS.earlyStopGenerations.min,
    GA_PARAM_SPECS.earlyStopGenerations.max,
    DEFAULT_GA_PARAMETERS.earlyStopGenerations
  );
  const executionMode =
    String(src.executionMode || '').toUpperCase() === 'SERVER_WORKER'
      ? 'SERVER_WORKER'
      : 'WEB_WORKER';
  const availableDates = normalizeAvailableDates(src.availableDates);

  return {
    populationSize,
    generations,
    mutationRate,
    crossoverRate,
    elitismCount,
    tournamentSize,
    earlyStopGenerations,
    executionMode,
    availableDates,
  };
}

export function validateGAParameters(params = {}) {
  const errors = {};
  const src = params && typeof params === 'object' ? params : {};

  const pop = Number(src.populationSize);
  if (!Number.isFinite(pop) || !Number.isInteger(pop)) {
    errors.populationSize = 'Population size must be a whole number.';
  } else if (pop < GA_PARAM_SPECS.populationSize.min || pop > GA_PARAM_SPECS.populationSize.max) {
    errors.populationSize = `Population size must be between ${GA_PARAM_SPECS.populationSize.min} and ${GA_PARAM_SPECS.populationSize.max}.`;
  }

  const genVal = src.generations ?? src.maxGenerations;
  const gen = Number(genVal);
  if (!Number.isFinite(gen) || !Number.isInteger(gen)) {
    errors.generations = 'Maximum generations must be a whole number.';
  } else if (gen < GA_PARAM_SPECS.generations.min || gen > GA_PARAM_SPECS.generations.max) {
    errors.generations = `Maximum generations must be between ${GA_PARAM_SPECS.generations.min} and ${GA_PARAM_SPECS.generations.max}.`;
  }

  const mut = Number(src.mutationRate);
  if (!Number.isFinite(mut)) {
    errors.mutationRate = 'Mutation rate must be a valid percentage.';
  } else if (
    mut < GA_PARAM_SPECS.mutationRate.min - 1e-6 ||
    mut > GA_PARAM_SPECS.mutationRate.max + 1e-6
  ) {
    errors.mutationRate = `Mutation rate must be between ${GA_PARAM_SPECS.mutationRate.minPercent}% and ${GA_PARAM_SPECS.mutationRate.maxPercent}%.`;
  }

  const cross = Number(src.crossoverRate);
  if (!Number.isFinite(cross)) {
    errors.crossoverRate = 'Crossover rate must be a valid percentage.';
  } else if (
    cross < GA_PARAM_SPECS.crossoverRate.min - 1e-6 ||
    cross > GA_PARAM_SPECS.crossoverRate.max + 1e-6
  ) {
    errors.crossoverRate = `Crossover rate must be between ${GA_PARAM_SPECS.crossoverRate.minPercent}% and ${GA_PARAM_SPECS.crossoverRate.maxPercent}%.`;
  }

  const elite = Number(src.elitismCount ?? DEFAULT_GA_PARAMETERS.elitismCount);
  const maxEliteAllowed = Number.isFinite(pop)
    ? Math.min(GA_PARAM_SPECS.elitismCount.max, Math.max(1, Math.floor(pop / 2)))
    : GA_PARAM_SPECS.elitismCount.max;
  if (!Number.isFinite(elite) || !Number.isInteger(elite)) {
    errors.elitismCount = 'Elitism count must be a whole number.';
  } else if (elite < GA_PARAM_SPECS.elitismCount.min || elite > maxEliteAllowed) {
    errors.elitismCount = `Elitism count must be between ${GA_PARAM_SPECS.elitismCount.min} and ${maxEliteAllowed}.`;
  }

  const tour = Number(src.tournamentSize ?? DEFAULT_GA_PARAMETERS.tournamentSize);
  const maxTourAllowed = Number.isFinite(pop)
    ? Math.min(GA_PARAM_SPECS.tournamentSize.max, Math.max(2, pop))
    : GA_PARAM_SPECS.tournamentSize.max;
  if (!Number.isFinite(tour) || !Number.isInteger(tour)) {
    errors.tournamentSize = 'Tournament size must be a whole number.';
  } else if (tour < GA_PARAM_SPECS.tournamentSize.min || tour > maxTourAllowed) {
    errors.tournamentSize = `Tournament size must be between ${GA_PARAM_SPECS.tournamentSize.min} and ${maxTourAllowed}.`;
  }

  const early = Number(src.earlyStopGenerations ?? DEFAULT_GA_PARAMETERS.earlyStopGenerations);
  if (!Number.isFinite(early) || !Number.isInteger(early)) {
    errors.earlyStopGenerations = 'Early-stop patience must be a whole number.';
  } else if (
    early < GA_PARAM_SPECS.earlyStopGenerations.min ||
    early > GA_PARAM_SPECS.earlyStopGenerations.max
  ) {
    errors.earlyStopGenerations = `Early-stop patience must be between ${GA_PARAM_SPECS.earlyStopGenerations.min} and ${GA_PARAM_SPECS.earlyStopGenerations.max}.`;
  }

  if (src.availableDates !== undefined) {
    const validDates = Array.isArray(src.availableDates)
      ? src.availableDates.filter((d) => ISO_DATE_RE.test(String(d || '').trim()))
      : [];
    if (validDates.length === 0) {
      errors.availableDates = 'At least one valid exam date (YYYY-MM-DD) is required.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function detectMatchingGAPreset(params = {}) {
  const norm = normalizeGAParameters(params);
  for (const preset of GA_PRESETS) {
    const v = preset.values;
    if (
      norm.populationSize === v.populationSize &&
      norm.generations === v.generations &&
      Math.abs(norm.mutationRate - v.mutationRate) < 1e-4 &&
      Math.abs(norm.crossoverRate - v.crossoverRate) < 1e-4 &&
      norm.elitismCount === v.elitismCount &&
      norm.tournamentSize === v.tournamentSize &&
      norm.earlyStopGenerations === v.earlyStopGenerations
    ) {
      return preset.id;
    }
  }
  return 'custom';
}

export function estimateGAWorkload(params = {}, subjectCount = 10) {
  const norm = normalizeGAParameters(params);
  const maxEvaluations = norm.populationSize * norm.generations;
  const geneOps = maxEvaluations * Math.max(1, Number(subjectCount) || 1);

  let computeTier = 'Balanced';
  if (maxEvaluations <= 1000) {
    computeTier = 'Fast';
  } else if (maxEvaluations >= 8000) {
    computeTier = 'Intensive';
  }

  const approxMs = Math.max(40, Math.round(geneOps * 0.012));
  const estimatedRuntimeLabel =
    approxMs < 1000 ? `< 1s est.` : `~${(approxMs / 1000).toFixed(1)}s est.`;

  return {
    maxEvaluations,
    computeTier,
    estimatedRuntimeLabel,
  };
}

export function haveGAParametersChanged(a = {}, b = {}) {
  const na = normalizeGAParameters(a);
  const nb = normalizeGAParameters(b);
  return (
    na.populationSize !== nb.populationSize ||
    na.generations !== nb.generations ||
    Math.abs(na.mutationRate - nb.mutationRate) > 1e-4 ||
    Math.abs(na.crossoverRate - nb.crossoverRate) > 1e-4 ||
    na.elitismCount !== nb.elitismCount ||
    na.tournamentSize !== nb.tournamentSize ||
    na.earlyStopGenerations !== nb.earlyStopGenerations ||
    na.executionMode !== nb.executionMode ||
    JSON.stringify(na.availableDates) !== JSON.stringify(nb.availableDates)
  );
}
