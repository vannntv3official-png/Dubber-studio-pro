import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clapperboard, FolderPlus, Trash2, Check } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useStudioStore } from '../store/studioStore';

export const IntroOutroModal: React.FC = () => {
  const {
    isIntroOutroOpen,
    setIntroOutroOpen,
    introVideoPath,
    setIntroVideoPath,
    outroVideoPath,
    setOutroVideoPath,
  } = useStudioStore();

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isIntroOutroOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIntroOutroOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isIntroOutroOpen, setIntroOutroOpen]);

  if (!isIntroOutroOpen) return null;

  const handleSelectIntro = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
      });
      if (selected && typeof selected === 'string') {
        setIntroVideoPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectOutro = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
      });
      if (selected && typeof selected === 'string') {
        setOutroVideoPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AnimatePresence>
      <div 
        onClick={() => setIntroOutroOpen(false)}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="max-w-lg w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <Clapperboard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
                  Intro &amp; Outro Bumper Clips
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Automatically prepend channel intros and append outro credits
                </p>
              </div>
            </div>

            <button
              onClick={() => setIntroOutroOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs">
            {/* Intro Clip Card */}
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-2 bg-slate-50/50 dark:bg-zinc-950/40">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-zinc-200">
                  🎬 Intro Video (Bumper Clip)
                </span>
                {introVideoPath && (
                  <button
                    onClick={() => setIntroVideoPath(null)}
                    className="text-rose-500 hover:text-rose-600 text-[11px] flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>

              {introVideoPath ? (
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="font-mono text-[11px] truncate text-slate-700 dark:text-zinc-300 max-w-[340px]">
                    {introVideoPath.split(/[\\/]/).pop()}
                  </span>
                  <button
                    onClick={handleSelectIntro}
                    className="text-indigo-600 hover:underline text-[11px] font-semibold"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSelectIntro}
                  className="w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-indigo-500 text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-2 transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Choose Intro Video...</span>
                </button>
              )}
            </div>

            {/* Outro Clip Card */}
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-2 bg-slate-50/50 dark:bg-zinc-950/40">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-zinc-200">
                  🎬 Outro Video (End Credits / Subscribe)
                </span>
                {outroVideoPath && (
                  <button
                    onClick={() => setOutroVideoPath(null)}
                    className="text-rose-500 hover:text-rose-600 text-[11px] flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>

              {outroVideoPath ? (
                <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="font-mono text-[11px] truncate text-slate-700 dark:text-zinc-300 max-w-[340px]">
                    {outroVideoPath.split(/[\\/]/).pop()}
                  </span>
                  <button
                    onClick={handleSelectOutro}
                    className="text-indigo-600 hover:underline text-[11px] font-semibold"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSelectOutro}
                  className="w-full py-3 rounded-lg border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-indigo-500 text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-2 transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Choose Outro Video...</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-zinc-950/70">
            <button
              onClick={() => setIntroOutroOpen(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setIntroOutroOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Clips</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
