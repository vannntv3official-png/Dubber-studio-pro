import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Replace } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const FindReplaceModal: React.FC = () => {
  const {
    isFindReplaceOpen,
    setFindReplaceOpen,
    segments,
    setSegments,
  } = useStudioStore();

  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [scope, setScope] = useState<'thisTab' | 'allTabs'>('thisTab');

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isFindReplaceOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFindReplaceOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFindReplaceOpen, setFindReplaceOpen]);

  if (!isFindReplaceOpen) return null;

  const handleReplaceAll = () => {
    if (!findText) {
      alert('Please enter text to find.');
      return;
    }

    let count = 0;
    const updated = segments.map((seg) => {
      let t = seg.translatedText || '';
      let o = seg.originalText || '';

      const regex = new RegExp(
        findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        matchCase ? 'g' : 'gi'
      );

      if (regex.test(t)) {
        count++;
        t = t.replace(regex, replaceText);
      }
      if (regex.test(o)) {
        o = o.replace(regex, replaceText);
      }

      return {
        ...seg,
        translatedText: t,
        originalText: o,
      };
    });

    setSegments(updated);
    setFindReplaceOpen(false);
    alert(`Replaced ${count} occurrences across subtitle rows.`);
  };

  return (
    <AnimatePresence>
      <div 
        onClick={() => setFindReplaceOpen(false)}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-500" />
              <span className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                Find &amp; Replace Subtitles
              </span>
            </div>
            <button
              onClick={() => setFindReplaceOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-zinc-300">Find Word / Term</label>
              <input
                type="text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="e.g. Brother"
                className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-zinc-300">Replace With</label>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="e.g. បងប្រុស"
                className="w-full mt-1 px-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:border-indigo-500"
              />
            </div>

            {/* Scope & Match Case */}
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={(e) => setMatchCase(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Match exact case</span>
              </label>

              <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-750 p-0.5 bg-slate-100 dark:bg-zinc-800">
                <button
                  onClick={() => setScope('thisTab')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                    scope === 'thisTab' ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  This Tab
                </button>
                <button
                  onClick={() => setScope('allTabs')}
                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                    scope === 'allTabs' ? 'bg-white dark:bg-zinc-900 text-indigo-600 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  All Tabs
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-zinc-900/50">
            <button
              onClick={() => setFindReplaceOpen(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-bold text-slate-600 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={handleReplaceAll}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-md shadow-indigo-500/20"
            >
              <Replace className="w-3.5 h-3.5" />
              <span>Replace All</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
