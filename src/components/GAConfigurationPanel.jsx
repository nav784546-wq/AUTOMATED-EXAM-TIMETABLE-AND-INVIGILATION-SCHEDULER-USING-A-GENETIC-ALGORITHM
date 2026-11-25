import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Cpu,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Server,
  Square,
  X,
} from 'lucide-react';
import {
  DEFAULT_GA_PARAMETERS,
  GA_PARAM_SPECS,
  GA_PRESETS,
  detectMatchingGAPreset,
  estimateGAWorkload,
  haveGAParametersChanged,
  normalizeGAParameters,
  validateGAParameters,
} from '../utils/gaConfig.js';

export function GAConfigurationPanel({
  config,
  savedConfig = DEFAULT_GA_PARAMETERS,
  onChangeConfig,
  onSaveConfig,
  isSavingConfig = false,
  onRunGA,
  onCancelGA,
  isGARunning = false,
  gaProgress = null,
  subjectCount = 0,
  runButtonLabel = 'Generate Institution-Wide Timetable',
  runButtonDisabled = false,
}) {
  const [newExamDate, setNewExamDate] = useState('');

  const executionMode = config.executionMode || 'WEB_WORKER';
  const availableDates = Array.isArray(config.availableDates)
    ? config.availableDates
    : DEFAULT_GA_PARAMETERS.availableDates;

  const validation = useMemo(() => validateGAParameters(config), [config]);
  const activePreset = useMemo(() => detectMatchingGAPreset(config), [config]);
  const workload = useMemo(
    () => estimateGAWorkload(config, subjectCount),
    [config, subjectCount]
  );
  const hasUnsavedChanges = useMemo(
    () => haveGAParametersChanged(config, savedConfig),
    [config, savedConfig]
  );

  const mutationPct = Number((Number(config.mutationRate ?? 0.12) * 100).toFixed(1));
  const crossoverPct = Number((Number(config.crossoverRate ?? 0.8) * 100).toFixed(1));

  const updateField = (field, value) => {
    onChangeConfig({
      ...config,
      [field]: value,
    });
  };

  const handleNumericFieldChange = (field, rawValue) => {
    if (rawValue === '') {
      updateField(field, '');
      return;
    }
    const parsed = Number(rawValue);
    updateField(field, Number.isFinite(parsed) ? parsed : '');
  };

  const handlePercentFieldChange = (field, rawPercent) => {
    if (rawPercent === '') {
      updateField(field, '');
      return;
    }
    const parsed = Number(rawPercent);
    if (!Number.isFinite(parsed)) {
      updateField(field, '');
      return;
    }
    updateField(field, Number((parsed / 100).toFixed(4)));
  };

  const handleApplyPreset = (preset) => {
    onChangeConfig({
      ...config,
      ...preset.values,
    });
  };

  const handleResetDefaults = () => {
    onChangeConfig({
      ...config,
      ...DEFAULT_GA_PARAMETERS,
      availableDates: [...DEFAULT_GA_PARAMETERS.availableDates],
    });
  };

  const handleAddDate = () => {
    const clean = String(newExamDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return;
    if (availableDates.includes(clean)) {
      setNewExamDate('');
      return;
    }
    const nextDates = [...availableDates, clean].sort();
    updateField('availableDates', nextDates);
    setNewExamDate('');
  };

  const handleRemoveDate = (targetDate) => {
    if (availableDates.length <= 1) return;
    updateField(
      'availableDates',
      availableDates.filter((d) => d !== targetDate)
    );
  };

  const clampedPop = Math.max(
    GA_PARAM_SPECS.populationSize.min,
    Math.min(GA_PARAM_SPECS.populationSize.max, Number(config.populationSize) || 40)
  );
  const clampedGen = Math.max(
    GA_PARAM_SPECS.generations.min,
    Math.min(GA_PARAM_SPECS.generations.max, Number(config.generations) || 50)
  );
  const clampedMut = Math.max(
    GA_PARAM_SPECS.mutationRate.min,
    Math.min(GA_PARAM_SPECS.mutationRate.max, Number(config.mutationRate) || 0.12)
  );
  const clampedCross = Math.max(
    GA_PARAM_SPECS.crossoverRate.min,
    Math.min(GA_PARAM_SPECS.crossoverRate.max, Number(config.crossoverRate) || 0.8)
  );

  const errorList = Object.values(validation.errors);

  return (
    <section
      data-testid="ga-configuration-panel"
      aria-labelledby="ga-config-heading"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 min-w-0"
    >
      {/* Header + Presets */}
      <div className="space-y-3 border-b border-slate-100 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="ga-config-heading" className="text-base font-semibold text-slate-900">
              Genetic Algorithm Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set population size, maximum generations, mutation, crossover, and selection operators
            </p>
          </div>

          <button
            type="button"
            data-testid="reset-ga-defaults-btn"
            onClick={handleResetDefaults}
            disabled={isGARunning || isSavingConfig}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 py-1 px-2 rounded-md hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          {GA_PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`ga-preset-${preset.id}`}
                title={preset.description}
                onClick={() => handleApplyPreset(preset)}
                disabled={isGARunning}
                className={`flex-1 min-w-[84px] px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Parameters: Slider + Exact Numeric Input */}
      <div className="space-y-4">
        {/* Population Size */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label htmlFor="ga-pop-input" className="text-xs font-medium text-slate-700">
              Population Size{' '}
              <span className="font-normal text-[11px] text-slate-400">
                ({GA_PARAM_SPECS.populationSize.min}–{GA_PARAM_SPECS.populationSize.max})
              </span>
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                id="ga-pop-input"
                data-testid="ga-pop-input"
                type="number"
                min={GA_PARAM_SPECS.populationSize.min}
                max={GA_PARAM_SPECS.populationSize.max}
                step={1}
                value={config.populationSize}
                onChange={(e) => handleNumericFieldChange('populationSize', e.target.value)}
                disabled={isGARunning}
                aria-invalid={Boolean(validation.errors.populationSize)}
                className={`w-20 px-2 py-1 text-right text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  validation.errors.populationSize
                    ? 'border-red-400 bg-red-50 text-red-900'
                    : 'border-slate-300 bg-white text-slate-900'
                }`}
              />
              <span className="text-[11px] text-slate-500 w-12 whitespace-nowrap">chroms</span>
            </div>
          </div>
          <input
            id="ga-pop"
            data-testid="ga-pop-slider"
            type="range"
            aria-label="Population Size slider"
            min={GA_PARAM_SPECS.populationSize.min}
            max={GA_PARAM_SPECS.populationSize.max}
            step={GA_PARAM_SPECS.populationSize.step}
            value={clampedPop}
            onChange={(e) => updateField('populationSize', Number(e.target.value))}
            disabled={isGARunning}
            className="w-full accent-blue-700 cursor-pointer"
          />
          {validation.errors.populationSize && (
            <p className="text-[11px] text-red-700 mt-1">{validation.errors.populationSize}</p>
          )}
        </div>

        {/* Maximum Generations */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label htmlFor="ga-gen-input" className="text-xs font-medium text-slate-700">
              Maximum Generations{' '}
              <span className="font-normal text-[11px] text-slate-400">
                ({GA_PARAM_SPECS.generations.min}–{GA_PARAM_SPECS.generations.max})
              </span>
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                id="ga-gen-input"
                data-testid="ga-gen-input"
                type="number"
                min={GA_PARAM_SPECS.generations.min}
                max={GA_PARAM_SPECS.generations.max}
                step={1}
                value={config.generations}
                onChange={(e) => handleNumericFieldChange('generations', e.target.value)}
                disabled={isGARunning}
                aria-invalid={Boolean(validation.errors.generations)}
                className={`w-20 px-2 py-1 text-right text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  validation.errors.generations
                    ? 'border-red-400 bg-red-50 text-red-900'
                    : 'border-slate-300 bg-white text-slate-900'
                }`}
              />
              <span className="text-[11px] text-slate-500 w-12 whitespace-nowrap">gens</span>
            </div>
          </div>
          <input
            id="ga-gen"
            data-testid="ga-gen-slider"
            type="range"
            aria-label="Maximum Generations slider"
            min={GA_PARAM_SPECS.generations.min}
            max={GA_PARAM_SPECS.generations.max}
            step={GA_PARAM_SPECS.generations.step}
            value={clampedGen}
            onChange={(e) => updateField('generations', Number(e.target.value))}
            disabled={isGARunning}
            className="w-full accent-blue-700 cursor-pointer"
          />
          {validation.errors.generations && (
            <p className="text-[11px] text-red-700 mt-1">{validation.errors.generations}</p>
          )}
        </div>

        {/* Mutation Rate (%) */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label htmlFor="ga-mut-input" className="text-xs font-medium text-slate-700">
              Mutation Rate{' '}
              <span className="font-normal text-[11px] text-slate-400">
                ({GA_PARAM_SPECS.mutationRate.minPercent}%–{GA_PARAM_SPECS.mutationRate.maxPercent}%)
              </span>
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                id="ga-mut-input"
                data-testid="ga-mut-input"
                type="number"
                min={GA_PARAM_SPECS.mutationRate.minPercent}
                max={GA_PARAM_SPECS.mutationRate.maxPercent}
                step={1}
                value={config.mutationRate === '' ? '' : mutationPct}
                onChange={(e) => handlePercentFieldChange('mutationRate', e.target.value)}
                disabled={isGARunning}
                aria-invalid={Boolean(validation.errors.mutationRate)}
                className={`w-20 px-2 py-1 text-right text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  validation.errors.mutationRate
                    ? 'border-red-400 bg-red-50 text-red-900'
                    : 'border-slate-300 bg-white text-slate-900'
                }`}
              />
              <span className="text-[11px] text-slate-500 w-12 whitespace-nowrap">%</span>
            </div>
          </div>
          <input
            id="ga-mut"
            data-testid="ga-mut-slider"
            type="range"
            aria-label="Mutation Rate slider"
            min={GA_PARAM_SPECS.mutationRate.min}
            max={GA_PARAM_SPECS.mutationRate.max}
            step={GA_PARAM_SPECS.mutationRate.step}
            value={clampedMut}
            onChange={(e) => updateField('mutationRate', Number(e.target.value))}
            disabled={isGARunning}
            className="w-full accent-blue-700 cursor-pointer"
          />
          {validation.errors.mutationRate && (
            <p className="text-[11px] text-red-700 mt-1">{validation.errors.mutationRate}</p>
          )}
        </div>

        {/* Crossover Rate (%) */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label htmlFor="ga-cross-input" className="text-xs font-medium text-slate-700">
              Crossover Rate{' '}
              <span className="font-normal text-[11px] text-slate-400">
                ({GA_PARAM_SPECS.crossoverRate.minPercent}%–{GA_PARAM_SPECS.crossoverRate.maxPercent}%)
              </span>
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                id="ga-cross-input"
                data-testid="ga-cross-input"
                type="number"
                min={GA_PARAM_SPECS.crossoverRate.minPercent}
                max={GA_PARAM_SPECS.crossoverRate.maxPercent}
                step={5}
                value={config.crossoverRate === '' ? '' : crossoverPct}
                onChange={(e) => handlePercentFieldChange('crossoverRate', e.target.value)}
                disabled={isGARunning}
                aria-invalid={Boolean(validation.errors.crossoverRate)}
                className={`w-20 px-2 py-1 text-right text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  validation.errors.crossoverRate
                    ? 'border-red-400 bg-red-50 text-red-900'
                    : 'border-slate-300 bg-white text-slate-900'
                }`}
              />
              <span className="text-[11px] text-slate-500 w-12 whitespace-nowrap">%</span>
            </div>
          </div>
          <input
            id="ga-cross"
            data-testid="ga-cross-slider"
            type="range"
            aria-label="Crossover Rate slider"
            min={GA_PARAM_SPECS.crossoverRate.min}
            max={GA_PARAM_SPECS.crossoverRate.max}
            step={GA_PARAM_SPECS.crossoverRate.step}
            value={clampedCross}
            onChange={(e) => updateField('crossoverRate', Number(e.target.value))}
            disabled={isGARunning}
            className="w-full accent-blue-700 cursor-pointer"
          />
          {validation.errors.crossoverRate && (
            <p className="text-[11px] text-red-700 mt-1">{validation.errors.crossoverRate}</p>
          )}
        </div>
      </div>

      {/* Advanced Operators */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="text-xs font-semibold text-slate-700">
          Selection &amp; Convergence Operators
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="min-w-0">
            <label
              htmlFor="ga-elitism-input"
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Elitism Count
            </label>
            <input
              id="ga-elitism-input"
              data-testid="ga-elitism-input"
              type="number"
              min={GA_PARAM_SPECS.elitismCount.min}
              max={GA_PARAM_SPECS.elitismCount.max}
              step={1}
              value={config.elitismCount ?? DEFAULT_GA_PARAMETERS.elitismCount}
              onChange={(e) => handleNumericFieldChange('elitismCount', e.target.value)}
              disabled={isGARunning}
              className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                validation.errors.elitismCount
                  ? 'border-red-400 bg-red-50 text-red-900'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            />
          </div>

          <div className="min-w-0">
            <label
              htmlFor="ga-tournament-input"
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Tournament k
            </label>
            <input
              id="ga-tournament-input"
              data-testid="ga-tournament-input"
              type="number"
              min={GA_PARAM_SPECS.tournamentSize.min}
              max={GA_PARAM_SPECS.tournamentSize.max}
              step={1}
              value={config.tournamentSize ?? DEFAULT_GA_PARAMETERS.tournamentSize}
              onChange={(e) => handleNumericFieldChange('tournamentSize', e.target.value)}
              disabled={isGARunning}
              className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                validation.errors.tournamentSize
                  ? 'border-red-400 bg-red-50 text-red-900'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            />
          </div>

          <div className="min-w-0">
            <label
              htmlFor="ga-early-stop-input"
              className="block text-[11px] font-medium text-slate-600 mb-1"
            >
              Early Stop (0=Off)
            </label>
            <input
              id="ga-early-stop-input"
              data-testid="ga-early-stop-input"
              type="number"
              min={GA_PARAM_SPECS.earlyStopGenerations.min}
              max={GA_PARAM_SPECS.earlyStopGenerations.max}
              step={5}
              value={config.earlyStopGenerations ?? DEFAULT_GA_PARAMETERS.earlyStopGenerations}
              onChange={(e) => handleNumericFieldChange('earlyStopGenerations', e.target.value)}
              disabled={isGARunning}
              className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                validation.errors.earlyStopGenerations
                  ? 'border-red-400 bg-red-50 text-red-900'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            />
          </div>
        </div>
        {(validation.errors.elitismCount ||
          validation.errors.tournamentSize ||
          validation.errors.earlyStopGenerations) && (
          <p className="text-[11px] text-red-700">
            {validation.errors.elitismCount ||
              validation.errors.tournamentSize ||
              validation.errors.earlyStopGenerations}
          </p>
        )}
      </div>

      {/* Exam Dates Window */}
      <div className="pt-3 border-t border-slate-100 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            Candidate Exam Dates ({availableDates.length})
          </span>
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <input
              type="date"
              aria-label="Add candidate exam date"
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
              disabled={isGARunning}
              className="flex-1 sm:flex-initial min-w-0 px-2 py-1 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <button
              type="button"
              onClick={handleAddDate}
              disabled={isGARunning || !newExamDate}
              aria-label="Add exam date"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto py-0.5">
          {availableDates.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono tabular-nums bg-slate-50 border border-slate-200 rounded text-slate-700"
            >
              {d}
              {availableDates.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveDate(d)}
                  disabled={isGARunning}
                  aria-label={`Remove date ${d}`}
                  className="text-slate-400 hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Execution Worker Mode */}
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <div className="text-xs font-semibold text-slate-700">Worker Execution Engine</div>
        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            data-testid="exec-mode-web-worker"
            onClick={() => updateField('executionMode', 'WEB_WORKER')}
            disabled={isGARunning}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              executionMode === 'WEB_WORKER'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            Web Worker
          </button>
          <button
            type="button"
            data-testid="exec-mode-server-worker"
            onClick={() => updateField('executionMode', 'SERVER_WORKER')}
            disabled={isGARunning}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              executionMode === 'SERVER_WORKER'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-3.5 h-3.5 shrink-0" />
            Server Worker
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          {executionMode === 'SERVER_WORKER'
            ? 'Executes GA constraints on Node worker_threads (/api/ga/optimize) and stores results in DB.'
            : 'Executes in browser Web Worker with live per-generation telemetry and stores results in DB.'}
        </p>
      </div>

      {/* Validation summary when invalid */}
      {!validation.isValid && errorList.length > 0 && (
        <div
          role="alert"
          data-testid="ga-config-validation-error"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorList[0]}</span>
        </div>
      )}

      {/* Live Progress */}
      {isGARunning && (
        <div
          data-testid="ga-live-progress"
          className="border border-blue-200 bg-blue-50/60 rounded-lg p-3.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-blue-900">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
              {gaProgress?.executionMode === 'SERVER_WORKER'
                ? 'Running Node Worker Service...'
                : `Gen ${gaProgress?.generation ?? 0} / ${gaProgress?.totalGenerations ?? clampedGen}`}
            </span>
            <span className="font-mono font-semibold text-blue-800 tabular-nums">
              {gaProgress?.percent ?? 0}%
            </span>
          </div>
          <svg
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="w-full h-2 rounded-full bg-blue-100 overflow-hidden"
          >
            <rect
              x="0"
              y="0"
              width={Math.max(2, Math.min(100, gaProgress?.percent ?? 0))}
              height="4"
              fill="#1D4ED8"
            />
          </svg>
          <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono tabular-nums">
            <span>Best fitness: {gaProgress?.bestFitness ?? 0}</span>
            <span>Conflicts: {gaProgress?.conflictCount ?? 0}</span>
          </div>
        </div>
      )}

      {/* Unboxed Workload Metadata + Save / Run Actions */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div
          data-testid="ga-workload-summary"
          className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"
        >
          <span className="font-mono tabular-nums">
            {workload.maxEvaluations.toLocaleString()} max evals · {workload.computeTier} ·{' '}
            {workload.estimatedRuntimeLabel}
          </span>
          <span className={hasUnsavedChanges ? 'font-medium text-amber-700' : 'text-slate-500'}>
            {hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="run-ga-scheduler-btn"
            onClick={onRunGA}
            disabled={!validation.isValid || isGARunning || runButtonDisabled}
            className={`w-full min-w-0 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors ${
              !validation.isValid || isGARunning || runButtonDisabled
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'
            }`}
          >
            <Play className="w-4 h-4 shrink-0" />
            <span className="truncate">{runButtonLabel}</span>
          </button>

          {(typeof onSaveConfig === 'function' || (isGARunning && onCancelGA)) && (
            <div className="flex flex-wrap items-center gap-2">
              {typeof onSaveConfig === 'function' && (
                <button
                  type="button"
                  data-testid="save-ga-config-btn"
                  onClick={() => onSaveConfig(normalizeGAParameters(config))}
                  disabled={!validation.isValid || isSavingConfig || isGARunning}
                  className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap transition-colors"
                >
                  {isSavingConfig ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  )}
                  <span>{isSavingConfig ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              )}

              {isGARunning && onCancelGA && (
                <button
                  type="button"
                  onClick={onCancelGA}
                  data-testid="cancel-ga-btn"
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default GAConfigurationPanel;
