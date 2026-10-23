import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clapperboard, X, Plus, Trash2, Check, Video } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useStudioStore } from '../store/studioStore';
import { SponsorBreak } from '../types/studio';

export const SponsorBreakModal: React.FC = () => {
  const {
    isSponsorModalOpen,
    setSponsorModalOpen,
    sponsorBreaks,
    setSponsorBreaks,
    currentTimeMs,
  } = useStudioStore();

  const [breaks, setBreaks] = useState<SponsorBreak[]>(sponsorBreaks);
  const [selectedVideoPath, setSelectedVideoPath] = useState('');
  const [fadeDurationMs, setFadeDurationMs] = useState(500);

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isSponsorModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSponsorModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSponsorModalOpen, setSponsorModalOpen]);

  if (!isSponsorModalOpen) return null;

  const handlePickClip = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Clips', extensions: ['mp4', 'mov', 'mkv'] }],
      });
      if (selected && typeof selected === 'string') {
        setSelectedVideoPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSponsorAtPlayhead = () => {
    if (!selectedVideoPath) {
      alert('Please choose a video clip first.');
      return;
    }

    const newBreak: SponsorBreak = {
      id: `sponsor-${Date.now()}`,
      timestampMs: currentTimeMs,
      videoPath: selectedVideoPath,
      durationMs: 5000,
      fadeDurationMs,
      label: selectedVideoPath.split(/[\\/]/).pop() || 'Sponsor Break',
    };

    setBreaks([...breaks, newBreak]);
  };

  const handleRemoveBreak = (id: string) => {
    setBreaks(breaks.filter((b) => b.id !== id));
  };

  const handleSaveAndApply = () => {
    setSponsorBreaks(breaks);
    setSponsorModalOpen(false);
  };

  const formatMs = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      <div 
        onClick={() => setSponsorModalOpen(false)}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                Sponsor Break &amp; Bumper Insertion
              </span>
            </div>
            <button
              onClick={() => setSponsorModalOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs">
            {/* Insertion settings */}
            <div className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2.5">
              <span className="font-bold text-slate-700 dark:text-zinc-300">
                Insert Sponsor Clip at Playhead ({formatMs(currentTimeMs)})
              </span>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedVideoPath}
                  readOnly
                  placeholder="Select sponsor video file..."
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-800 dark:text-zinc-200"
                />
                <button
                  onClick={handlePickClip}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 font-bold rounded-lg border border-slate-200 dark:border-zinc-700"
                >
                  Browse
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-500">Crossfade:</span>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    step={100}
                    value={fadeDurationMs}
                    onChange={(e) => setFadeDurationMs(Number(e.target.value))}
                    className="w-16 px-1.5 py-0.5 rounded border border-slate-300 dark:border-zinc-750 bg-white dark:bg-zinc-900 text-xs text-center font-mono"
                  />
                  <span className="text-[10px] text-slate-400">ms</span>
                </div>
                <button
                  onClick={handleAddSponsorAtPlayhead}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert at {formatMs(currentTimeMs)}</span>
                </button>
              </div>
            </div>

            {/* List of Breaks */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <span className="font-bold text-[10px] text-slate-400 uppercase">Configured Timeline Breaks</span>
              {breaks.length === 0 ? (
                <div className="p-4 text-center text-slate-400 border border-dashed rounded-xl">
                  No sponsor breaks added yet.
                </div>
              ) : (
                breaks.map((b) => (
                  <div
                    key={b.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Video className="w-3.5 h-3.5 text-rose-500" />
                      <div>
                        <p className="font-bold text-slate-800 dark:text-zinc-200">{b.label}</p>
                        <p className="text-[10px] text-slate-400">Position: {formatMs(b.timestampMs)} • Fade: {b.fadeDurationMs}ms</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveBreak(b.id)}
                      className="p-1 hover:text-rose-600 text-slate-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-zinc-900/50">
            <button
              onClick={() => setSponsorModalOpen(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-bold text-slate-600 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-md shadow-rose-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Breaks</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
