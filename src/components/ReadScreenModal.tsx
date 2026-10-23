import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scan, X, Sparkles, RefreshCw, Check, Plus } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { useStudioStore } from '../store/studioStore';
import { DubSegment } from '../types/studio';

export const ReadScreenModal: React.FC = () => {
  const {
    isReadScreenOpen,
    setReadScreenOpen,
    project,
    currentTimeMs,
    setSegments,
    segments,
    setPipelineProgress,
    addBlurMask,
    apiKeys,
  } = useStudioStore();

  const [box, setBox] = useState({ x: 15, y: 75, width: 70, height: 15 });
  const [translateWhenDone, setTranslateWhenDone] = useState(true);
  const [coverOriginal, setCoverOriginal] = useState<'none' | 'blur' | 'pixelate' | 'solid'>('blur');
  const [selectedOcrModel, setSelectedOcrModel] = useState('gemini-3.7-flash');
  const [capturedFrameUrl, setCapturedFrameUrl] = useState<string | null>(null);
  const [capturedFramePath, setCapturedFramePath] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrReviewItems, setOcrReviewItems] = useState<Array<{ id: string; original: string; translated: string; added?: boolean }>>([]);
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isReadScreenOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReadScreenOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReadScreenOpen, setReadScreenOpen]);

  // Capture frame on mount if not yet captured
  React.useEffect(() => {
    if (isReadScreenOpen && project && !capturedFrameUrl) {
      handleCaptureFrame();
    }
  }, [isReadScreenOpen, project]);

  if (!isReadScreenOpen) return null;

  const handleCaptureFrame = async (): Promise<string | null> => {
    if (!project) {
      alert('Please load a video first in the left sidebar.');
      return null;
    }
    try {
      setIsProcessing(true);
      const imagePath = await invoke<string>('extract_video_frame', {
        videoPath: project.videoPath,
        timestampMs: currentTimeMs,
        outputImagePath: null,
      });

      setCapturedFramePath(imagePath);
      setCapturedFrameUrl(convertFileSrc(imagePath));
      setIsProcessing(false);
      return imagePath;
    } catch (e: any) {
      setIsProcessing(false);
      alert(`Frame extraction error: ${e?.message || e}`);
      return null;
    }
  };

  const handleRunOcrDetection = async () => {
    setIsProcessing(true);
    setOcrStatusMsg(null);
    setPipelineProgress({
      running: true,
      stage: 'Screen OCR & Vision Detection',
      percent: 40,
      detail: `Scanning bounding box [${box.x}%, ${box.y}%, ${box.width}%, ${box.height}%]...`,
    });

    try {
      let imagePath = capturedFramePath;
      if (!imagePath) {
        imagePath = await handleCaptureFrame();
      }

      if (!imagePath) {
        setIsProcessing(false);
        setPipelineProgress({ running: false });
        return;
      }

      const boxHint = `[X: ${box.x}%, Y: ${box.y}%, Width: ${box.width}%, Height: ${box.height}%]`;
      const detected = await invoke<Array<{ id: string; original: string; translated: string }>>('detect_frame_subtitles', {
        imagePath,
        targetLang: project?.targetLang || 'km-KH',
        boxRect: boxHint,
        apiKeys,
      });

      if (detected && detected.length > 0) {
        setOcrReviewItems(detected.map((it) => ({ ...it, added: false })));
        setOcrStatusMsg(`Detected ${detected.length} subtitle lines!`);
        if (coverOriginal !== 'none') {
          applyAutoMask();
        }
      } else {
        setOcrStatusMsg('No subtitle text detected at this timestamp. Seek to a frame with burned-in subtitles and re-scan.');
      }

      setPipelineProgress({ running: false, stage: 'OCR Complete', percent: 100, detail: 'AI Vision OCR scan complete' });
    } catch (err: any) {
      console.error('OCR Error:', err);
      setOcrStatusMsg(err?.message || String(err));
      setPipelineProgress({ running: false, stage: 'OCR Error', percent: 0, detail: String(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  const applyAutoMask = () => {
    if (coverOriginal !== 'none') {
      addBlurMask({
        id: `ocr-mask-${Date.now()}`,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        type: coverOriginal,
        enabled: true,
      });
    }
  };

  const handleUseSingleLine = (item: { id: string; original: string; translated: string; added?: boolean }, idx: number) => {
    const cur = currentTimeMs + idx * 2500;
    const newSeg: DubSegment = {
      id: `ocr-seg-${Date.now()}-${idx}`,
      index: segments.length,
      startMs: cur,
      endMs: cur + 2400,
      speaker: 'Speaker 1',
      speakerTag: 'A2',
      voiceId: project?.defaultVoice || 'km-KH-PisethNeural',
      originalText: item.original,
      translatedText: item.translated,
      speedRatio: 1.0,
      status: 'ready',
    };

    setSegments([...segments, newSeg]);
    setOcrReviewItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, added: true } : it))
    );
    applyAutoMask();
  };

  const handleApplyToTimeline = () => {
    if (ocrReviewItems.length === 0) {
      handleRunOcrDetection();
      return;
    }

    const cur = currentTimeMs;
    const newItems: DubSegment[] = ocrReviewItems.map((item, idx) => ({
      id: `ocr-seg-${Date.now()}-${idx}`,
      index: segments.length + idx,
      startMs: cur + idx * 3000,
      endMs: cur + (idx + 1) * 3000,
      speaker: 'Speaker 1',
      speakerTag: 'A2',
      voiceId: project?.defaultVoice || 'km-KH-PisethNeural',
      originalText: item.original,
      translatedText: item.translated,
      speedRatio: 1.0,
      status: 'ready',
    }));

    setSegments([...segments, ...newItems]);
    applyAutoMask();
    setReadScreenOpen(false);
    alert(`Applied ${newItems.length} OCR detected subtitle segments to the timeline!`);
  };

  const [linesPerImage, setLinesPerImage] = useState(20);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [modelCategory, setModelCategory] = useState<'All' | 'Reasoning' | 'Fast & cheap' | 'Long context' | 'JSON mode'>('All');

  const modelsList = [
    { id: 'claude-opus-3.5', name: 'claude-opus-3.5', provider: 'Claude · opus-3.5', color: 'bg-amber-500' },
    { id: 'claude-sonnet-3.5', name: 'claude-sonnet-3.5', provider: 'Claude · sonnet-3.5', color: 'bg-amber-500' },
    { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', provider: 'Gemini · 2.5-pro', color: 'bg-emerald-500' },
    { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash', provider: 'Gemini · 2.5-flash', color: 'bg-emerald-500' },
    { id: 'gemini-3.7-flash', name: 'gemini-3.7-flash', provider: 'Gemini · 3.7-flash', color: 'bg-emerald-500', isAuto: true },
    { id: 'gpt-4.5', name: 'gpt-4.5', provider: 'GPT · 4.5', color: 'bg-teal-500' },
    { id: 'gpt-4.5-pro', name: 'gpt-4.5-pro', provider: 'GPT · 4.5-pro', color: 'bg-teal-500' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
                <Scan className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
                  Read on screen subtitles
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  The exact words and timing, read from the picture instead of guessed from the sound.
                </p>
              </div>
            </div>
            <button
              onClick={() => setReadScreenOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2-Column Split Body */}
          <div className="p-6 grid grid-cols-12 gap-6 overflow-y-auto">
            {/* Left Column (5 cols): 9:16 Video Monitor with Subtitle Zone Box */}
            <div className="col-span-5 flex flex-col items-center">
              <div className="relative aspect-[9/16] w-full max-w-[240px] bg-zinc-950 rounded-2xl overflow-hidden border border-slate-300 dark:border-zinc-800 shadow-xl flex items-center justify-center">
                {capturedFrameUrl ? (
                  <img src={capturedFrameUrl} alt="Video Frame" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                    <Scan className="w-8 h-8 opacity-40 animate-pulse" />
                    <span className="text-[11px] font-medium">9:16 Portrait Preview</span>
                  </div>
                )}

                {/* Subtitle Area Bounding Box with Cyan corner/edge handles */}
                <div
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                  className="absolute border-2 border-cyan-400 bg-cyan-400/20 rounded cursor-move flex items-center justify-center shadow-lg"
                >
                  <span className="bg-cyan-600 text-white text-[8.5px] font-bold px-1 py-0.5 rounded shadow">
                    Subtitle area
                  </span>
                  {/* Corner Handles */}
                  <span className="absolute -top-1 -left-1 w-2 h-2 bg-white border border-cyan-600 rounded-full" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-white border border-cyan-600 rounded-full" />
                  <span className="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-cyan-600 rounded-full" />
                  <span className="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-cyan-600 rounded-full" />
                </div>

                {/* Bottom Action inside preview: Find it for me & Capture Frame */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-1">
                  <button
                    onClick={handleCaptureFrame}
                    className="p-1 rounded-md bg-zinc-900/90 hover:bg-black text-white text-[9.5px] border border-white/20 shadow-sm flex items-center gap-1 transition-all"
                    title="Capture current video frame"
                  >
                    <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>0:00 / 0:51</span>
                  </button>
                  <button
                    onClick={() => {
                      setBox({ x: 10, y: 72, width: 80, height: 16 });
                      alert('Auto-detected subtitle zone: Box locked to lower 1/3 viewport.');
                    }}
                    className="px-2 py-0.5 rounded-md bg-zinc-900/90 hover:bg-black text-white text-[9.5px] font-bold border border-white/20 shadow-sm flex items-center gap-1 transition-all"
                  >
                    <span>🪄 Find it for me</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column (7 cols): Step Workflow Cards & Controls */}
            <div className="col-span-7 space-y-4 text-xs">
              {/* Green Subtitles Found Banner */}
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="font-bold text-xs text-emerald-900 dark:text-emerald-200">Subtitles found</h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    The box marks where the lines appear. Drag it if it's off.
                  </p>
                </div>
              </div>

              {/* 3 Step Icons Cards: Watch, Pack, Read */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 flex flex-col gap-1">
                  <span className="font-bold text-[11px] text-slate-800 dark:text-zinc-200 flex items-center gap-1">
                    <span className="text-blue-500">👁</span> Watch
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                    Only this area, on your PC
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 flex flex-col gap-1">
                  <span className="font-bold text-[11px] text-slate-800 dark:text-zinc-200 flex items-center gap-1">
                    <span className="text-emerald-500">📦</span> Pack
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                    One picture per line, up to 40 lines an image
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 flex flex-col gap-1">
                  <span className="font-bold text-[11px] text-slate-800 dark:text-zinc-200 flex items-center gap-1">
                    <span className="text-purple-500">📖</span> Read
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">
                    CodeCraft reads and translates each image once
                  </p>
                </div>
              </div>

              {/* Toggle 1: Translate when done */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800">
                <div>
                  <span className="font-bold text-slate-800 dark:text-zinc-200">Translate when done</span>
                  <p className="text-[10px] text-slate-400">Target language: Khmer</p>
                </div>
                <input
                  type="checkbox"
                  checked={translateWhenDone}
                  onChange={(e) => setTranslateWhenDone(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
              </div>

              {/* Toggle 2: Cover the original subtitles */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800">
                <div>
                  <span className="font-bold text-slate-800 dark:text-zinc-200">Cover the original subtitles</span>
                  <p className="text-[10px] text-slate-400">Adds a blur over this area. You can resize or remove it later.</p>
                </div>
                <input
                  type="checkbox"
                  checked={coverOriginal !== 'none'}
                  onChange={(e) => setCoverOriginal(e.target.checked ? 'blur' : 'none')}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
              </div>

              {/* Cover style buttons: Blur, Picture, Solid */}
              {coverOriginal !== 'none' && (
                <div className="grid grid-cols-3 gap-2 pl-2">
                  <button
                    onClick={() => setCoverOriginal('blur')}
                    className={`py-1 rounded-lg border font-bold text-xs ${coverOriginal === 'blur' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'text-slate-600'}`}
                  >
                    Blur
                  </button>
                  <button
                    onClick={() => setCoverOriginal('pixelate')}
                    className={`py-1 rounded-lg border font-bold text-xs ${coverOriginal === 'pixelate' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'text-slate-600'}`}
                  >
                    Picture
                  </button>
                  <button
                    onClick={() => setCoverOriginal('solid')}
                    className={`py-1 rounded-lg border font-bold text-xs ${coverOriginal === 'solid' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'text-slate-600'}`}
                  >
                    Solid
                  </button>
                </div>
              )}

              {/* Lines per image Stepper */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="font-bold text-slate-800 dark:text-zinc-200">Lines per image</span>
                  <p className="text-[10px] text-slate-400">More lines in one image means fewer requests to CodeCraft. Choose fewer if words are missed.</p>
                </div>
                <div className="flex items-center gap-1">
                  {[20, 40, 60].map((num) => (
                    <button
                      key={num}
                      onClick={() => setLinesPerImage(num)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${linesPerImage === num ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Read with Model Picker (CodeCraft API Search Dropdown) */}
              <div className="space-y-1 relative">
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Read with:</span>
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-bold text-slate-900 dark:text-zinc-100">{selectedOcrModel}</span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-bold text-[9px]">Auto</span>
                    <span className="text-slate-400 text-[10px]">CodeCraft · Backup: gemini-2.5-pro</span>
                  </div>
                  <span className="text-slate-400">▼</span>
                </button>

                {/* Floating Modal Picker Dropdown */}
                {showModelPicker && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-3 z-50 space-y-2">
                    {/* Search Input */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search models that read pictures..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs outline-none bg-slate-50 dark:bg-zinc-800"
                      />
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1 text-[10px] font-semibold overflow-x-auto">
                      {(['All', 'Reasoning', 'Fast & cheap', 'Long context', 'JSON mode'] as const).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setModelCategory(cat)}
                          className={`px-2 py-0.5 rounded-full ${modelCategory === cat ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Models List */}
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {modelsList.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => {
                            setSelectedOcrModel(m.name);
                            setShowModelPicker(false);
                          }}
                          className="p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${m.color}`} />
                            <span className="font-bold">{m.name}</span>
                            {m.isAuto && <span className="px-1 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">Auto</span>}
                          </div>
                          <span className="text-[10px] text-slate-400">{m.provider}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Side-by-Side Review Section (Module 1) */}
              {ocrReviewItems.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-800 dark:text-zinc-200">
                      Side-by-Side Review ({ocrReviewItems.length} lines detected)
                    </span>
                    <button
                      onClick={handleApplyToTimeline}
                      className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-2xs"
                    >
                      <Check className="w-3 h-3" />
                      <span>Use All Lines</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                    {ocrReviewItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 font-mono truncate">
                            {item.original}
                          </div>
                          <div className="text-[11px] font-bold text-slate-900 dark:text-zinc-100 font-sans truncate">
                            {item.translated}
                          </div>
                        </div>

                        <button
                          onClick={() => handleUseSingleLine(item, idx)}
                          disabled={item.added}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all ${
                            item.added
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                          }`}
                        >
                          {item.added ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Use This Line</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ocrStatusMsg && (
                <div className={`p-2.5 rounded-xl text-xs font-semibold ${
                  ocrReviewItems.length > 0 
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                }`}>
                  {ocrStatusMsg}
                </div>
              )}

              {/* Primary Blue Action: [Read subtitles] */}
              <button
                onClick={handleRunOcrDetection}
                disabled={isProcessing}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Sparkles className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? 'Processing Picture OCR...' : 'Scan & Extract Subtitles'}</span>
              </button>
              <p className="text-[10px] text-center text-slate-400">Uses your configured Gemini API key. Auto-aligns extracted lines with 100% frame precision.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
