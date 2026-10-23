import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sliders, X, Volume2, VolumeX, Activity, RefreshCw, Check } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const AudioMixerModal: React.FC = () => {
  const {
    isMixerOpen,
    setMixerOpen,
    project,
    updateProjectConfig,
    timelineFx,
    updateTimelineFx,
    isAudioMuted,
    toggleAudioMuted,
    bgmAudioPath,
  } = useStudioStore();

  const [v1Volume, setV1Volume] = useState(100);
  const [v1Muted, setV1Muted] = useState(false);
  const [a1Volume, setA1Volume] = useState(Math.round((project?.dubAudioGain ?? timelineFx.volume ?? 1.0) * 100));
  const [a2Volume, setA2Volume] = useState(Math.round((project?.bgmAudioGain ?? 0.75) * 100));
  const [duckingVol, setDuckingVol] = useState(Math.round((project?.duckingVolume ?? 0.18) * 100));
  const [peakLimiter, setPeakLimiter] = useState(project?.peakLimiterEnabled ?? true);
  const [masterGain, setMasterGain] = useState(Math.round((project?.masterGain ?? 1) * 100));

  React.useEffect(() => {
    if (!isMixerOpen) return;
    setV1Volume(Math.round((project?.originalAudioGain ?? 1) * 100));
    setV1Muted(project?.originalAudioMuted ?? false);
    setA1Volume(Math.round((project?.dubAudioGain ?? 1) * 100));
    setA2Volume(Math.round((project?.bgmAudioGain ?? 0.75) * 100));
    setDuckingVol(Math.round((project?.duckingVolume ?? 0.18) * 100));
    setMasterGain(Math.round((project?.masterGain ?? 1) * 100));
    setPeakLimiter(project?.peakLimiterEnabled ?? true);
  }, [isMixerOpen, project]);

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isMixerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMixerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMixerOpen, setMixerOpen]);

  if (!isMixerOpen) return null;

  const handleApplyMixer = () => {
    updateTimelineFx({ volume: a1Volume / 100 });
    if (project) {
      updateProjectConfig({
        duckingVolume: duckingVol / 100,
        originalAudioGain: v1Volume / 100,
        originalAudioMuted: v1Muted,
        dubAudioGain: a1Volume / 100,
        bgmAudioGain: a2Volume / 100,
        masterGain: masterGain / 100,
        masterMuted: isAudioMuted,
        peakLimiterEnabled: peakLimiter,
      });
    }
    setMixerOpen(false);
  };

  const handleResetDefaults = () => {
    setMasterGain(100);
    setV1Volume(100);
    setV1Muted(false);
    setA1Volume(100);
    setA2Volume(75);
    setDuckingVol(18);
    setPeakLimiter(true);
    if (isAudioMuted) toggleAudioMuted();
  };

  return (
    <AnimatePresence>
      <div 
        onClick={() => setMixerOpen(false)}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-950/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                  Studio Audio Mixer &amp; Stems Console
                </h3>
                <p className="text-[10px] text-slate-400">
                  Real-time multi-track gain staging, automated ducking &amp; master limiting
                </p>
              </div>
            </div>
            <button
              onClick={() => setMixerOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mixing Strips Grid */}
          <div className="p-6 grid grid-cols-4 gap-4 bg-slate-100/40 dark:bg-zinc-950/20">
            {/* Strip 1: V1 Original Video */}
            <div className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-zinc-900/80 flex flex-col items-center justify-between space-y-3 shadow-xs">
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                V1 Original
              </span>

              {/* Fader */}
              <div className="h-36 flex flex-col items-center justify-center relative py-1">
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={v1Muted ? 0 : v1Volume}
                  onChange={(e) => setV1Volume(Number(e.target.value))}
                  disabled={v1Muted}
                  className="w-28 h-1 -rotate-90 origin-center accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="text-center w-full space-y-1">
                <div className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-200">
                  {v1Muted ? 'Muted' : `${v1Volume}%`}
                </div>
                <button
                  onClick={() => setV1Muted(!v1Muted)}
                  className={`w-full py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    v1Muted
                      ? 'bg-rose-50 text-rose-600 border-rose-300 dark:bg-rose-950/50'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:border-zinc-700'
                  }`}
                >
                  {v1Muted ? 'Muted' : 'Mute'}
                </button>
              </div>
            </div>

            {/* Strip 2: A1 Dubbed Speech (AI Voice) */}
            <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-zinc-900/80 flex flex-col items-center justify-between space-y-3 shadow-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                A1 Dub Voice
              </span>

              {/* Fader */}
              <div className="h-36 flex flex-col items-center justify-center relative py-1">
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={a1Volume}
                  onChange={(e) => setA1Volume(Number(e.target.value))}
                  className="w-28 h-1 -rotate-90 origin-center accent-emerald-600 cursor-pointer"
                />
              </div>

              <div className="text-center w-full space-y-1">
                <div className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-200">
                  {a1Volume}%
                </div>
                <button
                  onClick={() => setA1Volume(100)}
                  className="w-full py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-zinc-700 bg-slate-50 text-slate-600 dark:bg-zinc-800 hover:bg-slate-100"
                >
                  Reset 0dB
                </button>
              </div>
            </div>

            {/* Strip 3: A2 BGM / Instrumental Stem */}
            <div className="p-3.5 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-white dark:bg-zinc-900/80 flex flex-col items-center justify-between space-y-3 shadow-xs">
              <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold text-[10px]">
                A2 BGM / Music
              </span>

              {/* Fader */}
              <div className="h-36 flex flex-col items-center justify-center relative py-1">
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={a2Volume}
                  onChange={(e) => setA2Volume(Number(e.target.value))}
                  className="w-28 h-1 -rotate-90 origin-center accent-purple-600 cursor-pointer"
                />
              </div>

              <div className="text-center w-full space-y-1">
                <div className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-200">
                  {a2Volume}%
                </div>
                <span className="text-[9.5px] text-slate-400 block truncate">
                  {bgmAudioPath ? 'Stem Loaded' : 'Original Video'}
                </span>
              </div>
            </div>

            {/* Strip 4: Master Bus & Limiter */}
            <div className="p-3.5 rounded-2xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/80 flex flex-col items-center justify-between space-y-3 shadow-xs">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold text-[10px]">
                Master Out
              </span>

              {/* Fader */}
              <div className="h-36 flex flex-col items-center justify-center relative py-1">
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={isAudioMuted ? 0 : masterGain}
                  onChange={(e) => setMasterGain(Number(e.target.value))}
                  disabled={isAudioMuted}
                  className="w-28 h-1 -rotate-90 origin-center accent-slate-800 dark:accent-zinc-200 cursor-pointer"
                />
              </div>

              <div className="text-center w-full space-y-1">
                <div className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-200">
                  {isAudioMuted ? 'Muted' : `${masterGain}%`}
                </div>
                <button
                  onClick={toggleAudioMuted}
                  className={`w-full py-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                    isAudioMuted
                      ? 'bg-rose-50 text-rose-600 border-rose-300 dark:bg-rose-950/50'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:border-zinc-700'
                  }`}
                >
                  {isAudioMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  <span>{isAudioMuted ? 'Muted' : 'Global Mute'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Ducking & Dynamic Range Compressor Box */}
          <div className="px-6 py-3 border-t border-slate-200 dark:border-zinc-800 space-y-2 bg-slate-50 dark:bg-zinc-950/40 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-sky-500" />
                  <span>Auto-Ducking Sensitivity:</span>
                  <span className="font-mono text-sky-600 font-bold">{duckingVol}%</span>
                </span>
                <p className="text-[10px] text-slate-400">
                  Background volume reduction during AI dialogue playback to prevent masking
                </p>
              </div>
              <input
                type="range"
                min={5}
                max={45}
                value={duckingVol}
                onChange={(e) => setDuckingVol(Number(e.target.value))}
                className="w-32 h-1 bg-slate-200 dark:bg-zinc-700 rounded accent-sky-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                Peak Hard Limiter (-0.1 dB True Peak)
              </span>
              <button
                onClick={() => setPeakLimiter(!peakLimiter)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  peakLimiter
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50'
                    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-zinc-800'
                }`}
              >
                {peakLimiter ? 'Active (ON)' : 'Bypass'}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
            <button
              onClick={handleResetDefaults}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Mix</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMixerOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyMixer}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Console</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
