import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  FileVideo, 
  FileText, 
  Check, 
  Folder,
  Sparkles
} from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useStudioStore } from '../store/studioStore';
import { PipelineEvent } from '../types/studio';

export const ExportModal: React.FC = () => {
  const { 
    isExportOpen, 
    setExportOpen, 
    project, 
    segments,
    setPipelineProgress,
    pipelineRunning,
    workflowToggles,
    origRanges,
    bgmAudioPath,
    videoTransform,
  } = useStudioStore();

  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [exportType, setExportType] = useState<'video' | 'srt'>('video');
  const [outputPath, setOutputPath] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [completedPath, setCompletedPath] = useState<string | null>(null);
  const [exportQuality, setExportQuality] = useState<'best' | 'balanced' | 'small'>('balanced');
  const [finalSpeed, setFinalSpeed] = useState<string>('OFF');

  React.useEffect(() => {
    if (!isExportOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExportOpen, setExportOpen]);

  if (!isExportOpen || !project) return null;

  const handleBrowseOutput = async () => {
    try {
      const ext = exportType === 'video' ? 'mp4' : 'srt';
      const defaultName = `dubbed_${project.targetLang}_output.${ext}`;
      const selected = await save({
        defaultPath: defaultName,
        filters: [
          exportType === 'video'
            ? { name: 'MP4 Video', extensions: ['mp4'] }
            : { name: 'SubRip Subtitle', extensions: ['srt'] },
        ],
      });

      if (selected && typeof selected === 'string') {
        setOutputPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartExport = async () => {
    if (segments.length === 0) {
      alert('Add or import subtitle segments before exporting.');
      return;
    }
    if (exportType === 'video' && !segments.some((segment) => segment.ttsStretchedPath || segment.ttsRawPath)) {
      alert('Generate voice audio for at least one segment before exporting a dubbed video.');
      return;
    }
    let target = outputPath.trim();
    if (!target) {
      const stem = project.videoPath.replace(/\.[^/.]+$/, '');
      const ext = exportType === 'video' ? 'mp4' : 'srt';
      target = `${stem}_dubbed_${project.targetLang}.${ext}`;
      setOutputPath(target);
    }

    setIsExporting(true);
    setCompletedPath(null);

    try {
      if (exportType === 'srt') {
        await invoke('export_srt_file', {
          segments,
          outputPath: target,
        });
        setCompletedPath(target);
        setIsExporting(false);
      } else {
        const channel = new Channel<PipelineEvent>();
        channel.onmessage = (event) => {
          if (event.type === 'StageProgress') {
            setPipelineProgress({
              running: true,
              stage: event.stage,
              percent: event.percent,
              detail: event.detail,
            });
          } else if (event.type === 'PipelineCompleted') {
            setCompletedPath(event.outputVideoPath);
            setIsExporting(false);
            setPipelineProgress({ running: false, stage: 'Export Complete', percent: 100, detail: target });
          } else if (event.type === 'PipelineError') {
            alert(`Export failed: ${event.message}`);
            setIsExporting(false);
            setPipelineProgress({ running: false });
          }
        };

        await invoke('export_dubbed_video', {
          config: project,
          segments,
          burnSubs: burnSubtitles,
          quality: exportQuality,
          finalSpeed: finalSpeed === 'OFF' ? 1 : Number(finalSpeed.replace('x', '')),
          flipH: videoTransform.flipH,
          flipV: videoTransform.flipV,
          rotation: videoTransform.rotate,
          a2AudioPath: bgmAudioPath,
          duckingEnabled: workflowToggles.ducking,
          origRanges,
          outputPath: target,
          channel,
        });
      }
    } catch (err: any) {
      console.error('Export error:', err);
      alert(`Export error: ${err?.message || err}`);
      setIsExporting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Modal Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
                <FileVideo className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Export Settings</h3>
            </div>
            <button
              onClick={() => setExportOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 space-y-4 text-xs overflow-y-auto">
            {/* Render Mode Segmented Control */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Render Mode</span>
              <div className="p-1 rounded-xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 grid grid-cols-2 gap-1">
                <button
                  onClick={() => setExportType('video')}
                  className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
                    exportType === 'video'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  <FileVideo className="w-3.5 h-3.5" />
                  <span>Video + Audio</span>
                </button>
                <button
                  onClick={() => setExportType('srt')}
                  className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all ${
                    exportType === 'srt'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Audio Only / Subtitles</span>
                </button>
              </div>
            </div>

            {/* Export Quality: 3 Selection Cards */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Export Quality</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {exportQuality === 'best' ? 'Highest quality · CRF 18' : exportQuality === 'balanced' ? 'Balanced · CRF 21' : 'Smaller file · CRF 26'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'best', label: 'Best Quality', desc: 'CRF 18' },
                  { id: 'balanced', label: 'Balanced', desc: 'CRF 21' },
                  { id: 'small', label: 'Small File', desc: 'CRF 26' },
                ].map((q) => {
                  const isSel = exportQuality === q.id;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setExportQuality(q.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                        isSel 
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-500/20' 
                          : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="font-bold text-[11px]">{q.label}</span>
                      <span className={`text-[9px] ${isSel ? 'text-emerald-100' : 'text-slate-400'}`}>{q.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Final Speed Multiplier */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Final Speed</span>
              <div className="grid grid-cols-5 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                {['OFF', '1.1x', '1.25x', '1.5x', '2x'].map((s) => {
                  const isSel = finalSpeed === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setFinalSpeed(s)}
                      className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSel 
                          ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 shadow-2xs border border-slate-300 dark:border-zinc-600' 
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400">Increase speed. Pick a speed to make the finished video play faster.</p>
            </div>

            {/* Burn Subtitles Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 text-xs">
              <div>
                <span className="font-semibold text-slate-700 dark:text-zinc-200">Burn Subtitles into Video</span>
                <p className="text-[10px] text-slate-400">Render translated subtitle text onto the video</p>
              </div>
              <input
                type="checkbox"
                checked={burnSubtitles}
                onChange={(e) => setBurnSubtitles(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </div>

            {/* Output Filename */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Output Filename</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. E01_Khmer_Dubbed.mp4"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  className="flex-1 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                />
                <button
                  onClick={handleBrowseOutput}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition-colors"
                >
                  <Folder className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400">Don't forget to keep the .mp4 extension!</p>
            </div>

            {completedPath && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2 text-[11px]">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">Saved: {completedPath}</span>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 bg-slate-50 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExportOpen(false)}
                className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleStartExport}
                disabled={isExporting || pipelineRunning}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Rendering...' : '▶ Start Render'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
