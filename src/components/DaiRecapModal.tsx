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
    apiKeys,
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

  const handleGenerateRecap = async () => {
    setIsGenerating(true);
    setPipelineProgress({
      running: true,
      stage: 'Recap Generation',
      percent: 30,
      detail: 'Analyzing dialogue transcript...',
    });

    const activeLines = segments
      .map((s, idx) => {
        const text = (s.translatedText || s.originalText || '').trim();
        return text ? `[${idx + 1}] ${text}` : '';
      })
      .filter(Boolean);

    if (activeLines.length === 0) {
      setIsGenerating(false);
      setPipelineProgress({ running: false, stage: 'Idle', percent: 0, detail: '' });
      setGeneratedRecap(
        '【សាច់រឿងសង្ខេប】\n' +
        'ពុំទាន់មានអត្ថបទសន្ទនាគ្រប់គ្រាន់សម្រាប់ការបង្កើតការសង្ខេបឡើយ។ សូមធ្វើការបកប្រែ ឬបញ្ចូលអត្ថបទរងជាមុនសិន។'
      );
      return;
    }

    const key = apiKeys.geminiApiKey?.trim();
    if (key) {
      try {
        setPipelineProgress({
          running: true,
          stage: 'Gemini AI Summarizer',
          percent: 65,
          detail: 'Synthesizing story recap with Gemini AI...',
        });

        const lengthInstruction =
          summaryLength === 'brief'
            ? 'Short & punchy (30-second video hook for TikTok/Reels, 2-3 sentences in Khmer).'
            : summaryLength === 'detailed'
            ? 'Comprehensive breakdown dividing the episode into Scene 1 (Beginning), Scene 2 (Conflict), and Scene 3 (Resolution/Climax) in natural Khmer.'
            : 'Standard narrative episode synopsis in 4-6 engaging sentences in natural Khmer.';

        const prompt = `You are a professional film and drama scriptwriter. Summarize the following episode dialogue into an engaging story synopsis written in fluent, natural Khmer (ភាសាខ្មែរ).

Style requirement: ${lengthInstruction}
${sceneMatchMode ? 'Highlight dramatic character tensions and central conflict.' : ''}

Dialogue Lines:
${activeLines.slice(0, 80).join('\n')}

Output solely the final Khmer synopsis with appropriate section titles:`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim()) {
            setGeneratedRecap(candidateText.trim());
            setPipelineProgress({ running: false, stage: 'Complete', percent: 100, detail: 'AI Recap ready' });
            setIsGenerating(false);
            return;
          }
        }
      } catch (err: any) {
        console.warn('Gemini recap fetch failed, using local dialogue compile:', err);
      }
    }

    // Honest local compilation fallback (no fake setTimeout simulation)
    const dialogueSample = activeLines.slice(0, 15).join(' ');
    let summaryText = '';
    if (summaryLength === 'brief') {
      summaryText =
        '【សង្ខេបខ្លី (Local Digest)】\n' +
        `ការសន្ទនាសំខាន់ៗដកស្រង់ចេញពីឈុតឆាក៖ ${dialogueSample.substring(0, 200)}...\n\n` +
        'ℹ️ ចំណាំ៖ ដើម្បីទទួលបានការសង្ខេបកម្រិតខ្ពស់ដោយ Gemini AI សូមភ្ជាប់ Gemini API Key នៅក្នុងផ្ទាំង Preferences > API Keys។';
    } else if (summaryLength === 'detailed') {
      const third = Math.max(1, Math.ceil(activeLines.length / 3));
      const s1 = activeLines.slice(0, third).join(' ');
      const s2 = activeLines.slice(third, third * 2).join(' ');
      const s3 = activeLines.slice(third * 2).join(' ');
      summaryText =
        '【សេចក្តីសង្ខេបតាមឈុតឆាក (Local Digest)】\n\n' +
        `• ឈុតទី 1 (ដើមរឿង): ${s1.substring(0, 140)}...\n\n` +
        `• ឈុតទី 2 (បញ្ហាប្រឈម): ${s2.substring(0, 140)}...\n\n` +
        `• ឈុតទី 3 (ដំណោះស្រាយ): ${s3.substring(0, 140)}...\n\n` +
        'ℹ️ ចំណាំ៖ នេះជាការរៀបចំឈុតឆាកក្នុងស្រុក។ បញ្ចូល Gemini API Key ដើម្បីវិភាគស៊ីជម្រៅដោយ AI។';
    } else {
      summaryText =
        '【សាច់រឿងសង្ខេបស្តង់ដារ (Local Digest)】\n' +
        `ការសន្ទនាសំខាន់ៗក្នុងភាគនេះ៖ ${dialogueSample.substring(0, 240)}...\n\n` +
        'ℹ️ ចំណាំ៖ នេះជាការដកស្រង់អត្ថបទសន្ទនាក្នុងស្រុក។ សូមកំណត់ Gemini API Key នៅក្នុង Preferences ដើម្បីបង្កើតការសង្ខេបបែបនិទានរឿងដោយស្វ័យប្រវត្តិ។';
    }

    setGeneratedRecap(summaryText);
    setPipelineProgress({ running: false, stage: 'Complete', percent: 100, detail: 'Local digest compiled' });
    setIsGenerating(false);
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
