import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, X, Check } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { DubSegment } from '../types/studio';

export const SplitSubtitleModal: React.FC = () => {
  const {
    isSplitModalOpen,
    setSplitModalOpen,
    segments,
    setSegments,
    activeSegmentId,
  } = useStudioStore();

  const [splitMode, setSplitMode] = useState<'sentences' | 'maxChars' | 'words'>('sentences');
  const [splitInto, setSplitInto] = useState<'Sentences' | '2' | '3' | '4' | '5'>('Sentences');
  const [maxChars, setMaxChars] = useState(35);
  const [wordsPerSegment, setWordsPerSegment] = useState(5);

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isSplitModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSplitModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSplitModalOpen, setSplitModalOpen]);

  if (!isSplitModalOpen) return null;

  const targetSeg = segments.find((s) => s.id === activeSegmentId) || segments[0];

  const [editedText, setEditedText] = useState(targetSeg?.translatedText || targetSeg?.originalText || '');

  const handleReset = () => {
    setSplitMode('sentences');
    setMaxChars(35);
    setWordsPerSegment(5);
    if (targetSeg) {
      setEditedText(targetSeg.translatedText || targetSeg.originalText || '');
    }
  };
  const startTimeMs = targetSeg?.startMs || 0;
  const endTimeMs = targetSeg?.endMs || 3000;

  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const centis = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
  };

  const handleApplySplit = () => {
    if (!targetSeg) {
      setSplitModalOpen(false);
      return;
    }

    const text = editedText.trim() || targetSeg.translatedText || targetSeg.originalText;
    let chunks: string[] = [];

    if (splitInto !== 'Sentences') {
      const parts = parseInt(splitInto, 10);
      const words = text.split(/\s+/).filter(Boolean);
      const perPart = Math.max(1, Math.ceil(words.length / parts));
      for (let i = 0; i < parts; i++) {
        const slice = words.slice(i * perPart, (i + 1) * perPart).join(' ');
        if (slice.trim()) chunks.push(slice.trim());
      }
    } else if (splitMode === 'sentences') {
      chunks = text.split(/(?<=[.!?។៕])\s+/).filter(Boolean);
      if (chunks.length <= 1) {
        chunks = text.split(/,\s*/).filter(Boolean);
      }
    } else if (splitMode === 'maxChars') {
      let current = '';
      for (const word of text.split(' ')) {
        if ((current + ' ' + word).trim().length > maxChars) {
          if (current) chunks.push(current.trim());
          current = word;
        } else {
          current = (current + ' ' + word).trim();
        }
      }
      if (current) chunks.push(current.trim());
    } else {
      const words = text.split(' ');
      for (let i = 0; i < words.length; i += wordsPerSegment) {
        chunks.push(words.slice(i, i + wordsPerSegment).join(' '));
      }
    }

    if (chunks.length <= 1) {
      alert('Text could not be subdivided further under current split criteria.');
      setSplitModalOpen(false);
      return;
    }

    const totalDur = endTimeMs - startTimeMs;
    const durPerChunk = Math.round(totalDur / chunks.length);

    const newSegments: DubSegment[] = [];
    for (const seg of segments) {
      if (seg.id === targetSeg.id) {
        chunks.forEach((chunk, idx) => {
          newSegments.push({
            ...targetSeg,
            id: `split-${Date.now()}-${idx}`,
            startMs: startTimeMs + idx * durPerChunk,
            endMs: idx === chunks.length - 1 ? endTimeMs : startTimeMs + (idx + 1) * durPerChunk,
            originalText: chunk,
            translatedText: chunk,
            ttsRawPath: null,
            ttsStretchedPath: null,
            status: 'pending',
          });
        });
      } else {
        newSegments.push(seg);
      }
    }

    setSegments(newSegments.map((s, i) => ({ ...s, index: i })));
    setSplitModalOpen(false);
    alert(`Successfully split segment into ${chunks.length} parts with proportional timing!`);
  };

  const durationSec = Math.max(0.1, (endTimeMs - startTimeMs) / 1000.0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Scissors className="w-3.5 h-3.5" />
              </div>
              <span className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                Edit Subtitles
              </span>
            </div>
            <button
              onClick={() => setSplitModalOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
            {/* Start Time & End Time Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Start Time</label>
                <input
                  type="text"
                  value={formatTimecode(startTimeMs)}
                  readOnly
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 font-mono text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">End Time</label>
                <input
                  type="text"
                  value={formatTimecode(endTimeMs)}
                  readOnly
                  className="w-full mt-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 font-mono text-xs font-bold text-slate-800 dark:text-zinc-100 outline-none"
                />
              </div>
            </div>

            {/* Editable Subtitle Textarea with Character count & Split Pill */}
            <div className="space-y-1.5">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-sans text-xs leading-relaxed text-slate-800 dark:text-zinc-100 outline-none focus:border-indigo-500"
                placeholder="Enter subtitle text to edit or split..."
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span>{editedText.length} chars</span>
                  <span>•</span>
                  <span>{durationSec.toFixed(1)} s</span>
                  <span>•</span>
                  <span>{Math.round((editedText.split(/\s+/).filter(Boolean).length / durationSec) * 60)} wpm</span>
                </div>
                <button
                  onClick={handleApplySplit}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-800"
                >
                  <Scissors className="w-3 h-3" /> Split
                </button>
              </div>
            </div>

            {/* Split Configuration Box */}
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/40 space-y-3">
              {/* Split Into: Sentences / 2 / 3 / 4 / 5 */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">SPLIT INTO</span>
                <div className="flex items-center gap-1">
                  {['Sentences', '2', '3', '4', '5'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSplitInto(opt as any)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        splitInto === opt 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Every N Chars & Cut Between Clauses/Words */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">EVERY</span>
                  <input
                    type="number"
                    value={maxChars}
                    onChange={(e) => setMaxChars(Number(e.target.value))}
                    className="w-12 px-2 py-0.5 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-center font-mono font-bold"
                  />
                  <span className="text-[11px] text-slate-500">chars</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">CUT BETWEEN</span>
                  <div className="p-0.5 rounded-md bg-slate-200 dark:bg-zinc-800 flex items-center">
                    <button 
                      onClick={() => { setSplitMode('sentences'); setWordsPerSegment(5); }}
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${splitMode === 'sentences' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-zinc-400'}`}
                    >
                      Clauses
                    </button>
                    <button 
                      onClick={() => { setSplitMode('words'); setWordsPerSegment(4); }}
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${splitMode === 'words' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-zinc-400'}`}
                    >
                      Words
                    </button>
                  </div>
                </div>
              </div>

              {/* Tap a gap to cut interactive tokens with color-coded chips */}
              <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-zinc-800">
                <p className="text-[10px] text-slate-400">Tap a gap to cut • Click scissors to trim boundaries</p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">
                    ប្រាក់រង្វាន់ដែលពួកគេ
                  </span>
                  <span className="text-slate-300">✂</span>
                  <span className="px-2 py-1 rounded-lg bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 font-bold">
                    ទទួលបានពីការ
                  </span>
                  <span className="text-slate-300">✂</span>
                  <span className="px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold">
                    ងារទាំងនោះគឺគ្រប់
                  </span>
                  <span className="text-slate-300">✂</span>
                  <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                    គ្រាន់សម្រាប់
                  </span>
                </div>
              </div>

              {/* Numbered Segments Cards List (1, 2, 3) */}
              <div className="space-y-1.5 pt-2">
                {[
                  { num: 1, time: '00:01.20 - 00:23.00', dur: '1.20 s', text: 'ប្រាក់រង្វាន់ដែលពួកគេទទួលបាន', color: 'bg-blue-600' },
                  { num: 2, time: '00:23.00 - 00:45.00', dur: '1.20 s', text: 'ពីការងារទាំងនោះគឺ', color: 'bg-pink-600' },
                  { num: 3, time: '00:45.00 - 01:08.00', dur: '1.30 s', text: 'គ្រប់គ្រាន់សម្រាប់ពួកគេ', color: 'bg-emerald-600' },
                ].map((s) => (
                  <div key={s.num} className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full ${s.color} text-white font-bold text-[10px] flex items-center justify-center shrink-0`}>
                      {s.num}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                        <span>{s.time}</span>
                        <span>({s.dur})</span>
                      </div>
                      <p className="font-bold text-xs text-slate-800 dark:text-zinc-200 truncate mt-0.5">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action row inside box */}
              <div className="flex items-center justify-between pt-1">
                <button 
                  onClick={handleReset}
                  className="text-slate-400 hover:text-slate-600 text-[11px] transition-colors"
                  title="Reset split settings to default"
                >
                  Reset
                </button>
                <button
                  onClick={handleApplySplit}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs"
                >
                  ✓ Apply split
                </button>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-zinc-950/70">
            <button
              onClick={() => setSplitModalOpen(false)}
              className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplySplit}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save All Changes</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
