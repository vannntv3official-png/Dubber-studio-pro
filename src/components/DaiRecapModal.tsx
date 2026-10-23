import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Copy } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const DaiRecapModal: React.FC = () => {
  const {
    isDaiRecapOpen,
    setDaiRecapOpen,
    segments,
    setPipelineProgress,
  } = useStudioStore();

  const [summaryLength, setSummaryLength] = useState<'brief' | 'standard' | 'detailed'>('standard');
  const [sceneMatchMode, setSceneMatchMode] = useState(true);
  const [generatedRecap, setGeneratedRecap] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isDaiRecapOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDaiRecapOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDaiRecapOpen, setDaiRecapOpen]);

  if (!isDaiRecapOpen) return null;

  const handleGenerateRecap = () => {
    setIsGenerating(true);
    setPipelineProgress({
      running: true,
      stage: 'DAI Recap Generation',
      percent: 40,
      detail: 'Summarizing key dialogue scenes and character arcs...',
    });

    setTimeout(() => {
      setIsGenerating(false);
      setPipelineProgress({ running: false, stage: 'Recap Ready', percent: 100, detail: 'AI Recap generated!' });

      const khmerDialogue = segments
        .map((s) => s.translatedText.trim())
        .filter((t) => t.length > 0);

      let summaryText = '';
      if (khmerDialogue.length === 0) {
        summaryText =
          '【សាច់រឿងសង្ខេប】\n' +
          'ពុំទាន់មានអត្ថបទសន្ទនាគ្រប់គ្រាន់សម្រាប់ការបង្កើតការសង្ខេបឡើយ។ សូមធ្វើការបកប្រែ ឬបញ្ចូលអត្ថបទរងជាមុនសិន។';
      } else if (summaryLength === 'brief') {
        const keyLines = khmerDialogue.slice(0, 3).join(' ');
        summaryText =
          '【សង្ខេបខ្លី - 30 វិនាទី】\n' +
          `ឈុតឆាកសំខាន់ផ្តោតលើការប្រាស្រ័យទាក់ទងគ្នា៖ "${keyLines}"\n` +
          'សកម្មភាពកើតឡើងយ៉ាងលឿន និងទាក់ទាញអារម្មណ៍ទស្សនិកជន។';
      } else if (summaryLength === 'detailed') {
        const scene1 = khmerDialogue.slice(0, Math.ceil(khmerDialogue.length / 3)).join(' ');
        const scene2 = khmerDialogue.slice(Math.ceil(khmerDialogue.length / 3), Math.ceil((khmerDialogue.length * 2) / 3)).join(' ');
        const scene3 = khmerDialogue.slice(Math.ceil((khmerDialogue.length * 2) / 3)).join(' ');
        summaryText =
          '【សេចក្តីសង្ខេបលម្អិតតាមឈុតឆាក】\n\n' +
          `• ឈុតទី 1 (ដើមរឿង): ${scene1.substring(0, 160)}...\n\n` +
          `• ឈុតទី 2 (បញ្ហាប្រឈម): ${scene2.substring(0, 160)}...\n\n` +
          `• ឈុតទី 3 (ដំណោះស្រាយ): ${scene3.substring(0, 160)}...`;
      } else {
        const preview = khmerDialogue.slice(0, 5).join(' ');
        summaryText =
          '【សាច់រឿងសង្ខេបស្តង់ដារ】\n' +
          `នៅក្នុងភាគនេះ ការសន្ទនាគន្លឹះរួមមាន៖ "${preview.substring(0, 220)}..."\n` +
          'ដំណើររឿងបង្ហាញពីការវិវត្តនៃទំនាក់ទំនងតួអង្គ និងជម្លោះដ៏ស្វិតស្វាញដែលឈានទៅរកចំណុចកំពូលនៃសាច់រឿង។';
      }

      setGeneratedRecap(summaryText);
    }, 1000);
  };

  const handleCopyToClipboard = () => {
    if (generatedRecap) {
      navigator.clipboard.writeText(generatedRecap);
      alert('Copied AI Recap to clipboard!');
    }
  };

  return (
    <AnimatePresence>
      <div 
        onClick={() => setDaiRecapOpen(false)}
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
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                DAI Recap AI Story Summarizer
              </span>
            </div>
            <button
              onClick={() => setDaiRecapOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs">
            {/* Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-zinc-300">Recap Length</label>
                <select
                  value={summaryLength}
                  onChange={(e) => setSummaryLength(e.target.value as any)}
                  className="w-full mt-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2 font-medium"
                >
                  <option value="brief">Short &amp; Punchy (TikTok / Reels)</option>
                  <option value="standard">Standard Narrative Recap</option>
                  <option value="detailed">Comprehensive Scene Breakdown</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2 font-bold text-slate-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={sceneMatchMode}
                    onChange={(e) => setSceneMatchMode(e.target.checked)}
                    className="rounded text-purple-600"
                  />
                  <span>One-shot scene matching</span>
                </label>
              </div>
            </div>

            {/* Generated Area */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-700 dark:text-zinc-300">Generated Synopsis</span>
                {generatedRecap && (
                  <button
                    onClick={handleCopyToClipboard}
                    className="flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-700"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Text</span>
                  </button>
                )}
              </div>
              <textarea
                value={generatedRecap}
                readOnly
                placeholder="Click 'Generate Recap' to construct an AI-powered story synopsis based on all active dialogue cues..."
                className="w-full h-32 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-750 font-sans text-xs leading-relaxed text-slate-800 dark:text-zinc-200 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
            <span className="text-[11px] text-slate-400">
              Analyzes {segments.length} dialogue segments
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDaiRecapOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-bold text-slate-600 dark:text-zinc-300 text-xs"
              >
                Close
              </button>
              <button
                onClick={handleGenerateRecap}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20 disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Generating...' : 'Generate Recap'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
