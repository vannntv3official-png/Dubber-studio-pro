import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X, Circle } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const PipelineProgress: React.FC = () => {
  const { pipelineRunning, pipelineStage, pipelinePercent, pipelineDetail, setPipelineProgress } = useStudioStore();

  const isCompleted = pipelinePercent >= 100 && !pipelineRunning;
  const isVisible = pipelineRunning || !!pipelineStage;
  const stageName = pipelineStage.toLowerCase();
  const isError = stageName.includes('error');
  const currentStep = stageName.includes('complet') ? 3
    : stageName.includes('voice') || stageName.includes('synth') ? 3
    : stageName.includes('translat') || stageName.includes('dialog') ? 2
    : stageName.includes('transcrib') || stageName.includes('speech') ? 1
    : stageName.includes('extract') || stageName.includes('starting') ? 0
    : -1;
  const displayTitle = isCompleted && stageName.includes('voice') ? 'Voice generation finished'
    : isCompleted ? 'Subtitle and voice preparation complete'
    : isError ? 'Something went wrong'
    : stageName.includes('translat') || stageName.includes('dialog') ? 'Translating subtitles…'
    : stageName.includes('voice') || stageName.includes('synth') ? 'Generating voices…'
    : stageName.includes('transcrib') || stageName.includes('speech') ? 'Transcribing dialogue…'
    : stageName.includes('extract') || stageName.includes('starting') ? 'Preparing audio…'
    : pipelineStage || 'Processing…';
  const startedAt = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!pipelineRunning) {
      startedAt.current = null;
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [pipelineRunning]);

  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  // Auto-dismiss 4 seconds after completion
  useEffect(() => {
    if (!isCompleted) return;
    const timer = setTimeout(() => {
      setPipelineProgress({ running: false, stage: '', percent: 0, detail: '' });
    }, 4000);
    return () => clearTimeout(timer);
  }, [isCompleted, setPipelineProgress]);

  const handleDismiss = () => {
    startedAt.current = null;
    setElapsedSeconds(0);
    setPipelineProgress({ running: false, stage: '', percent: 0, detail: '' });
  };

  if (!isVisible) return null;

  return (
      <div
        role="status"
        aria-live="polite"
        className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 p-4 opacity-100 backdrop-blur-[2px] transition-opacity duration-200 dark:bg-zinc-950/70 select-none"
      >
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950/95 sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            {isCompleted ? <CheckCircle2 className="h-7 w-7 text-emerald-500" /> : isError ? <AlertCircle className="h-7 w-7 text-rose-500" /> : <Loader2 className="h-7 w-7 animate-spin" />}
          </div>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 text-center">
              <div className="mb-2 flex items-center justify-center gap-2">
              <h4 className={`text-base font-bold ${
                isError ? 'text-rose-600 dark:text-rose-400' : isCompleted ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-zinc-100'
              }`}>
                {displayTitle}
              </h4>
              {pipelineRunning && (
                <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">{pipelinePercent}%</span>
              )}
              {pipelineRunning && <span className="font-mono text-[11px] text-slate-400 dark:text-zinc-500">{elapsedLabel}</span>}
              {(isCompleted || isError) && (
                <button onClick={handleDismiss} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mx-auto mb-5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
              {pipelineDetail || 'Working on your subtitle script…'}
            </p>

            {currentStep >= 0 && !isError && (
              <div className="mb-5 flex items-center justify-center gap-1.5 sm:gap-2">
                {['Extract', 'Transcribe', 'Translate'].map((label, index) => {
                  const done = isCompleted || index < currentStep;
                  const active = !isCompleted && index === currentStep;
                  return (
                    <React.Fragment key={label}>
                      {index > 0 && <div className={`h-0.5 w-3 sm:w-7 ${index <= currentStep || isCompleted ? 'bg-indigo-400' : 'bg-slate-200 dark:bg-zinc-700'}`} />}
                      <div className={`flex items-center gap-1 text-[9px] font-semibold sm:gap-1.5 sm:text-[11px] ${active ? 'text-indigo-700 dark:text-indigo-300' : done ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Circle className="h-3.5 w-3.5" />}
                        <span>{label}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${isError ? 'from-rose-500 to-rose-400' : isCompleted ? 'from-emerald-500 to-emerald-400' : 'from-indigo-500 via-indigo-400 to-emerald-400'}`}
                style={{ width: `${pipelinePercent}%`, transition: 'width 300ms ease-out' }}
              />
            </div>
            {isCompleted && <p className="mt-2 text-right text-[10px] text-slate-400 dark:text-zinc-500">Closing shortly…</p>}
            </div>
          </div>
        </div>
      </div>
  );
};
