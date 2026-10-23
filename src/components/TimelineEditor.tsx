import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { 
  Scissors, 
  Sparkles, 
  Volume2, 
  ChevronDown, 
  Trash2, 
  Wand2, 
  Scan, 
  Link2,
  Layers,
  Zap,
  ArrowLeftRight,
  Globe,
  Users2,
  Loader2,
} from 'lucide-react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useStudioStore } from '../store/studioStore';
import { PipelineEvent, DubSegment, SUPPORTED_LANGUAGES } from '../types/studio';
import { AudioWaveformCanvas } from './AudioWaveformCanvas';

export const TimelineEditor: React.FC = () => {
  const {
    project,
    segments,
    selectedSegmentIds,
    activeSegmentId,
    setActiveSegmentId,
    updateSegment,
    updateSegmentPartial,
    currentTimeMs,
    setCurrentTimeMs,
    durationMs,
    workflowToggles,
    updateWorkflowToggles,
    timelineFx,
    updateTimelineFx,
    targetLang,
    setTargetLang,
    splitActiveSegment,
    pipelineRunning,
    pipelineStage,
    setPipelineProgress,
    apiKeys,
    transcriptionEngine,
    selectedWhisperModel,
    transcribeModel,
    setSegments,
    bgmAudioPath,
    setBgmAudioPath,
    a1AudioPath,
    setReadScreenOpen,
    deleteSelectedSegments,
    setMixerOpen,
    origRanges,
    addOrigRange,
    removeOrigRange,
    updateOrigRange,
    audioTrackMode,
    setAudioTrackMode,
  } = useStudioStore();

  const [isLinked, setIsLinked] = useState(true);
  const [showTimelineLangMenu, setShowTimelineLangMenu] = useState(false);
  const timelineLangRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (timelineLangRef.current && !timelineLangRef.current.contains(e.target as Node)) {
        setShowTimelineLangMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  // Default Zoom set to 100%
  const [zoomPercent, setZoomPercent] = useState(100);
  const zoomPxPerSec = Math.round((zoomPercent / 100) * 26);

  // Dragging state for T1 segment blocks
  const [draggingSegment, setDraggingSegment] = useState<{
    id: string;
    type: 'move' | 'resize-left' | 'resize-right';
    initialClientX: number;
    initialStartMs: number;
    initialEndMs: number;
  } | null>(null);

  // Dragging state for Orig Audio Range blocks
  const [draggingOrigRange, setDraggingOrigRange] = useState<{
    id: string;
    type: 'move' | 'resize-left' | 'resize-right';
    initialClientX: number;
    initialStartMs: number;
    initialEndMs: number;
  } | null>(null);

  const totalDurationSec = useMemo(() => {
    return durationMs > 0 ? durationMs / 1000.0 : 60.0;
  }, [durationMs]);

  const timelineWidthPx = totalDurationSec * zoomPxPerSec;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingSegment) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-no-seek="true"]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + (containerRef.current?.scrollLeft ?? 0);
    const timeSec = clickX / zoomPxPerSec;
    const newTimeMs = Math.round(timeSec * 1000);
    setCurrentTimeMs(newTimeMs);
  };

  // Mouse move handler for dragging / resizing segments & orig ranges
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingSegment) {
      const deltaPx = e.clientX - draggingSegment.initialClientX;
      const deltaMs = Math.round((deltaPx / zoomPxPerSec) * 1000);

      if (draggingSegment.type === 'move') {
        const duration = draggingSegment.initialEndMs - draggingSegment.initialStartMs;
        const newStart = Math.max(0, draggingSegment.initialStartMs + deltaMs);
        const newEnd = newStart + duration;
        updateSegmentPartial(draggingSegment.id, {
          startMs: newStart,
          endMs: newEnd,
        });
      } else if (draggingSegment.type === 'resize-left') {
        const newStart = Math.max(0, Math.min(draggingSegment.initialEndMs - 200, draggingSegment.initialStartMs + deltaMs));
        updateSegmentPartial(draggingSegment.id, {
          startMs: newStart,
        });
      } else if (draggingSegment.type === 'resize-right') {
        const newEnd = Math.max(draggingSegment.initialStartMs + 200, draggingSegment.initialEndMs + deltaMs);
        updateSegmentPartial(draggingSegment.id, {
          endMs: newEnd,
        });
      }
    } else if (draggingOrigRange) {
      const deltaPx = e.clientX - draggingOrigRange.initialClientX;
      const deltaMs = Math.round((deltaPx / zoomPxPerSec) * 1000);

      if (draggingOrigRange.type === 'move') {
        const duration = draggingOrigRange.initialEndMs - draggingOrigRange.initialStartMs;
        const newStart = Math.max(0, draggingOrigRange.initialStartMs + deltaMs);
        const newEnd = newStart + duration;
        updateOrigRange(draggingOrigRange.id, {
          startMs: newStart,
          endMs: newEnd,
        });
      } else if (draggingOrigRange.type === 'resize-left') {
        const newStart = Math.max(0, Math.min(draggingOrigRange.initialEndMs - 200, draggingOrigRange.initialStartMs + deltaMs));
        updateOrigRange(draggingOrigRange.id, {
          startMs: newStart,
        });
      } else if (draggingOrigRange.type === 'resize-right') {
        const newEnd = Math.max(draggingOrigRange.initialStartMs + 200, draggingOrigRange.initialEndMs + deltaMs);
        updateOrigRange(draggingOrigRange.id, {
          endMs: newEnd,
        });
      }
    }
  }, [draggingSegment, draggingOrigRange, zoomPxPerSec, updateSegmentPartial, updateOrigRange]);

  const handleMouseUp = useCallback(async () => {
    const segmentId = draggingSegment?.id;
    setDraggingSegment(null);
    setDraggingOrigRange(null);
    if (!segmentId || !project) return;
    const segment = useStudioStore.getState().segments.find((item) => item.id === segmentId);
    if (!segment?.ttsRawPath) return;
    try {
      updateSegmentPartial(segment.id, { status: 'synthesizing' });
      const updated = await invoke<DubSegment>('regenerate_segment_tts', {
        segment,
        config: project,
        apiKeys,
      });
      updateSegment(updated);
    } catch (error) {
      console.error('Failed to resync segment audio after timing edit:', error);
      updateSegmentPartial(segment.id, { status: 'error' });
    }
  }, [draggingSegment, project, apiKeys, updateSegment, updateSegmentPartial]);

  useEffect(() => {
    if (draggingSegment || draggingOrigRange) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingSegment, draggingOrigRange, handleMouseMove, handleMouseUp]);

  // Handler to add raw audio segment (laughter, crying, applause)
  const handleAddOrigRange = useCallback(() => {
    const start = Math.max(0, currentTimeMs - 200);
    const end = start + 3000;
    addOrigRange({
      id: `orig-${Date.now()}`,
      startMs: start,
      endMs: end,
      action: 'duck',
      fadeInMs: 200,
      fadeOutMs: 200,
      gain: 1.0,
    });
  }, [currentTimeMs, addOrigRange]);

  // Global 'O' keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        handleAddOrigRange();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAddOrigRange]);

  // Transcribe Full Pipeline Trigger
  const handleTranscribe = async () => {
    if (!project) {
      alert('Please load a video first in the left sidebar.');
      return;
    }

    try {
      setPipelineProgress({
        running: true,
        stage: 'Transcribing video',
        percent: 0,
        detail: 'Recognizing dialogue and extracting segment timestamps...',
      });

      const channel = new Channel<PipelineEvent>();
      channel.onmessage = (event) => {
        switch (event.type) {
          case 'StageProgress':
            setPipelineProgress({
              running: true,
              stage: event.stage,
              percent: event.percent,
              detail: event.detail,
            });
            break;
          case 'SegmentsInitialized':
            setSegments(event.segments);
            break;
          case 'SegmentUpdated':
            updateSegment(event.segment);
            break;
          case 'PipelineCompleted':
            setPipelineProgress({
              running: false,
              stage: 'Completed',
              percent: 100,
              detail: 'Transcription and dubbing pipeline finished. Check segment status for any voice errors.',
            });
            break;
          case 'PipelineError':
            setPipelineProgress({
              running: false,
              stage: 'Error',
              percent: 0,
              detail: event.message,
            });
            break;
        }
      };

      await invoke('run_full_pipeline', {
        config: { ...project, targetLang },
        apiKeys,
        transcriptionEngine,
        whisperModel: selectedWhisperModel,
        transcribeModel,
        autoFit: workflowToggles.autoFit,
        channel,
      });
    } catch (err: any) {
      console.error(err);
      setPipelineProgress({
        running: false,
        stage: 'Error',
        percent: 0,
        detail: `Transcription failed: ${err?.message || err}`,
      });
    }
  };

  // Generate Selected Audio TTS
  const handleGenerateSelectedAudio = async () => {
    if (!project || pipelineRunning) return;
    const selectedTargets = segments.filter((segment) => selectedSegmentIds.includes(segment.id));
    const targets = selectedTargets.length > 0
      ? selectedTargets
      : segments.filter((segment) => segment.id === activeSegmentId);

    if (targets.length === 0) {
      return;
    }

    let failures = 0;
    setPipelineProgress({
      running: true,
      stage: 'Voice Synthesis',
      percent: 0,
      detail: `Preparing voice audio for ${targets.length} subtitle${targets.length === 1 ? '' : 's'}...`,
    });

    for (const [index, seg] of targets.entries()) {
      try {
        setPipelineProgress({
          running: true,
          stage: 'Voice Synthesis',
          percent: Math.round((index / targets.length) * 100),
          detail: `Generating voice for subtitle ${index + 1} of ${targets.length}...`,
        });
        updateSegmentPartial(seg.id, { status: 'synthesizing' });
        const updated = await invoke<DubSegment>('regenerate_segment_tts', {
          segment: seg,
          config: project,
          apiKeys,
        });
        updateSegment(updated);
      } catch (err) {
        console.error(err);
        failures += 1;
        updateSegmentPartial(seg.id, { status: 'error', errorMessage: String(err) });
      }
    }

    setPipelineProgress({
      running: false,
      stage: 'Voice Generation Finished',
      percent: 100,
      detail: failures
        ? `Generated audio with ${failures} failed subtitle${failures === 1 ? '' : 's'}. Check the audio status column.`
        : `Generated audio for all ${targets.length} selected subtitle${targets.length === 1 ? '' : 's'}.`,
    });
  };

  const transcribeButtonLabel = (() => {
    if (!pipelineRunning) return 'Transcribe';
    const stage = pipelineStage.toLowerCase();
    if (stage.includes('transcrib') || stage.includes('speech recognition') || stage.includes('starting')) return 'Transcribing…';
    if (stage.includes('translat')) return 'Translating…';
    if (stage.includes('synth') || stage.includes('voice') || stage.includes('audio')) return 'Generating voices…';
    return 'Processing…';
  })();
  const selectedAudioCount = segments.filter((segment) => selectedSegmentIds.includes(segment.id)).length;
  const canGenerateAudio = !!project && segments.length > 0 && (
    selectedAudioCount > 0 ||
    segments.some((segment) => segment.id === activeSegmentId)
  );

  // Generate ruler ticks every 10 seconds
  const rulerTicks = useMemo(() => {
    const ticks = [];
    const step = 10;
    for (let s = 0; s <= totalDurationSec; s += step) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      const label = `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.00`;
      ticks.push({ sec: s, label, x: s * zoomPxPerSec });
    }
    return ticks;
  }, [totalDurationSec, zoomPxPerSec]);

  const playheadX = (currentTimeMs / 1000.0) * zoomPxPerSec;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden select-none">
      {/* ROW 1: Title + Zoom + Split + Audio FX Parameters */}
      <div className="h-9 px-3 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs bg-white dark:bg-zinc-950 shrink-0 overflow-x-auto custom-scrollbar">
        {/* Left: Timeline Editor Title + Zoom Slider */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-bold text-xs text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-600" />
            Timeline Editor
          </span>

          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-zinc-800">
            <span className="font-bold text-[10px] uppercase text-slate-400">ZOOM:</span>
            <input
              type="range"
              min={30}
              max={600}
              value={zoomPercent}
              onChange={(e) => setZoomPercent(Number(e.target.value))}
              className="w-24 h-1 rounded cursor-pointer accent-indigo-600"
            />
            <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 w-8">
              {zoomPercent}%
            </span>
          </div>
        </div>

        {/* Right: Split + Audio FX controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Split */}
          <button
            onClick={splitActiveSegment}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] hover:bg-emerald-100 transition-colors shadow-2xs"
            title="Split Segment at Playhead"
          >
            <Scissors className="w-3 h-3" />
            <span>Split</span>
          </button>

          {/* SPEED slider */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
            <span>SPEED:</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={timelineFx.speed}
              onChange={(e) => updateTimelineFx({ speed: parseFloat(e.target.value) })}
              className="w-14 accent-indigo-600 h-1 cursor-pointer"
            />
            <span className="font-mono text-slate-700 dark:text-zinc-300">{timelineFx.speed.toFixed(1)}x</span>
          </div>

          {/* VOL slider */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
            <span>VOL:</span>
            <input
              type="range"
              min={0}
              max={2.0}
              step={0.1}
              value={timelineFx.volume}
              onChange={(e) => updateTimelineFx({ volume: parseFloat(e.target.value) })}
              className="w-14 accent-indigo-600 h-1 cursor-pointer"
            />
            <span className="font-mono text-slate-700 dark:text-zinc-300">{timelineFx.volume.toFixed(1)}</span>
          </div>

          {/* PITCH slider */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
            <span>PITCH:</span>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={timelineFx.pitch}
              onChange={(e) => updateTimelineFx({ pitch: parseInt(e.target.value, 10) })}
              className="w-14 accent-indigo-600 h-1 cursor-pointer"
            />
            <span className="font-mono text-slate-700 dark:text-zinc-300">
              {timelineFx.pitch > 0 ? `+${timelineFx.pitch}` : timelineFx.pitch}
            </span>
          </div>

          {/* Reverb toggle */}
          <button
            onClick={() => updateTimelineFx({ reverb: !timelineFx.reverb })}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              timelineFx.reverb
                ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300'
            }`}
            title="Toggle Reverb Audio Effect"
          >
            ≈ Reverb
          </button>
        </div>
      </div>

      {/* ROW 2: Language + Workflow Toggles + AI Buttons */}
      <div className="h-10 px-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-zinc-900/40 shrink-0 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-2 shrink-0">
          {/* Target Language pill with dropdown - rounded-full */}
          <div className="relative" ref={timelineLangRef}>
            <button
              onClick={() => setShowTimelineLangMenu(!showTimelineLangMenu)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 font-medium text-[11px] text-slate-700 dark:text-zinc-300 shadow-2xs hover:border-indigo-400 transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              <span>{SUPPORTED_LANGUAGES.find((l) => l.code === targetLang)?.label.split(' ')[0] || targetLang}</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showTimelineLangMenu ? 'rotate-180' : ''}`} />
            </button>

            {showTimelineLangMenu && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-slate-200 dark:border-zinc-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Target Language
                </div>
                {SUPPORTED_LANGUAGES.filter((l) => l.code !== 'auto').map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setTargetLang(lang.code);
                      setShowTimelineLangMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between ${
                      targetLang === lang.code ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-zinc-700/50' : 'text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <span>{lang.label}</span>
                    {targetLang === lang.code && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto-Fit — rounded-full */}
          <button
            onClick={() => updateWorkflowToggles({ autoFit: !workflowToggles.autoFit })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold text-[11px] shadow-2xs transition-colors ${
              workflowToggles.autoFit
                ? 'border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400'
            }`}
            title={workflowToggles.autoFit ? 'Auto-Fit ON — click to disable' : 'Auto-Fit OFF — click to enable'}
          >
            <Zap className={`w-3.5 h-3.5 ${workflowToggles.autoFit ? 'fill-amber-500 text-amber-500' : 'text-slate-400'}`} />
            Auto-Fit: {workflowToggles.autoFit ? 'Med' : 'Off'}
          </button>

          {/* Crowd — rounded-full */}
          <button
            onClick={() => updateWorkflowToggles({ crowd: !workflowToggles.crowd })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border font-medium text-[11px] shadow-2xs transition-colors ${
              workflowToggles.crowd
                ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300'
            }`}
            title={workflowToggles.crowd ? 'Crowd ON — click to disable' : 'Crowd OFF — click to enable'}
          >
            <Users2 className="w-3.5 h-3.5" />
            Crowd{workflowToggles.crowd ? ': ON' : ''}
          </button>

          {/* Sync End — rounded-full */}
          <button
            onClick={() => updateWorkflowToggles({ syncEnd: !workflowToggles.syncEnd })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold text-[11px] shadow-2xs transition-colors ${
              workflowToggles.syncEnd
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400'
            }`}
            title={workflowToggles.syncEnd ? 'Sync End ON' : 'Sync End OFF'}
          >
            <Link2 className="w-3.5 h-3.5" />
            Sync End: {workflowToggles.syncEnd ? 'ON' : 'OFF'}
          </button>

          {/* Ducking — rounded-full */}
          <button
            onClick={() => updateWorkflowToggles({ ducking: !workflowToggles.ducking })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold text-[11px] shadow-2xs transition-colors ${
              workflowToggles.ducking
                ? 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-500 dark:text-zinc-400'
            }`}
            title={workflowToggles.ducking ? 'Ducking ON — BGM ducks under voice' : 'Ducking OFF'}
          >
            <Volume2 className="w-3.5 h-3.5" />
            Ducking: {workflowToggles.ducking ? 'ON' : 'OFF'}
          </button>

          {/* Original (O) Mode — rounded-full */}
          <button
            onClick={handleAddOrigRange}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold text-[11px] shadow-2xs hover:bg-amber-100 transition-colors"
            title="Mark Raw Audio Segment at Playhead (press 'O')"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-black">O</span>
            Original
          </button>

          {/* Read Screen — rounded-full emerald */}
          <button
            onClick={() => setReadScreenOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] font-semibold shadow-2xs transition-colors"
            title="Read Screen OCR & Video Subtitle Detector"
          >
            <Scan className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Read Screen
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Automatic dubbing pipeline */}
          <button
            onClick={handleTranscribe}
            disabled={pipelineRunning || !project}
            title={!project ? 'Load a video before transcribing.' : pipelineRunning ? pipelineStage : 'Transcribe the video and prepare translated voice segments.'}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs shadow-xs transition-all ${
              project
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-white hover:bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500'
            }`}
          >
            {pipelineRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{transcribeButtonLabel}</span>
          </button>

          {/* Generate Selected Audio */}
          <button
            onClick={handleGenerateSelectedAudio}
            disabled={pipelineRunning || !canGenerateAudio}
            title={!project ? 'Load a video project before generating voice audio.' : !canGenerateAudio ? 'Add or select a subtitle before generating voice audio.' : 'Generate voice audio for the selected subtitles.'}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-xs shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-indigo-50 dark:disabled:hover:bg-indigo-950/40"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>{pipelineRunning ? 'Working…' : selectedAudioCount > 1 ? `Generate Voice (${selectedAudioCount})` : 'Generate Voice'}</span>
          </button>
        </div>
      </div>

      {/* 4-Track Multi-Track Timeline Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-slate-100/50 dark:bg-zinc-950/80"
      >
        <div
          style={{ width: `${timelineWidthPx}px` }}
          className="min-h-full relative flex flex-col min-w-full pb-4"
          onClick={handleTimelineClick}
        >
          {/* Time Ruler */}
          <div className="h-6 bg-slate-100 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 relative shrink-0">
            {rulerTicks.map((tick) => (
              <div
                key={tick.sec}
                style={{ left: `${tick.x}px` }}
                className="absolute top-0 bottom-0 flex flex-col justify-between pointer-events-none"
              >
                <span className="text-[9px] font-mono font-semibold text-slate-500 pl-1">
                  {tick.label}
                </span>
                <div className="w-[1px] h-2 bg-slate-300 dark:bg-zinc-700" />
              </div>
            ))}
          </div>

          {/* 4-Track Area */}
          <div className="flex-1 flex flex-col justify-start p-2 gap-2 relative">
            {/* 1. Track V1 (Original Video Audio: 00:00.00 - 01:37.62) */}
            <div className="h-14 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 relative flex items-center px-3 overflow-hidden shadow-xs shrink-0">
              {/* Floating Left Control Pill: V1 | ✂ | 🗑 | 🪄 | ⊡ */}
              <div className="absolute left-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 shadow-xs pointer-events-auto">
                <span>V1</span>
                <span className="text-slate-300">|</span>
                <button onClick={splitActiveSegment} title="Split at Playhead"><Scissors className="w-3 h-3 hover:text-indigo-900" /></button>
                <span className="text-slate-300">|</span>
                <button onClick={() => { if (confirm('Clear all segments?')) setSegments([]); }} title="Clear All"><Trash2 className="w-3 h-3 hover:text-rose-600" /></button>
                <span className="text-slate-300">|</span>
                <button onClick={handleTranscribe} title="Transcribe & Translate"><Wand2 className="w-3 h-3 hover:text-purple-600" /></button>
                <span className="text-slate-300">|</span>
                <button onClick={() => setReadScreenOpen(true)} title="Read Screen OCR"><Scan className="w-3 h-3 hover:text-indigo-600" /></button>
              </div>

              {/* Waveform Canvas across V1 */}
              <div className="w-full h-10 flex items-center px-28 pointer-events-none overflow-hidden">
                {project?.extractedAudioPath ? (
                  <AudioWaveformCanvas
                    audioPath={project.extractedAudioPath}
                    width={Math.max(200, timelineWidthPx - 200)}
                    height={36}
                    color="#818cf8"
                    barWidth={2}
                    gap={2}
                    className="opacity-75"
                  />
                ) : (
                  <div
                    className="w-full h-7 opacity-70"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, #818cf8 0px, #818cf8 2px, transparent 2px, transparent 4px)',
                    }}
                  />
                )}
              </div>

              {/* Right Duration Pill: Dynamic Duration */}
              <div className="absolute right-3 px-2 py-0.5 rounded-md bg-white/95 dark:bg-zinc-900/95 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 pointer-events-none shadow-xs">
                00:00.00 - {Math.floor(totalDurationSec / 60).toString().padStart(2, '0')}:{(totalDurationSec % 60).toFixed(2).padStart(5, '0')}
              </div>
            </div>

            {/* 1.5 Track ORIG (Selective Raw Audio Segment Overlay: Laughter, Crying, Applause) */}
            {origRanges.length > 0 && (
              <div className="h-10 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 relative flex items-center px-3 shadow-xs shrink-0 overflow-hidden">
                {/* Floating Left Pill: ORIG | + */}
                <div className="absolute left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border border-amber-300 dark:border-amber-800 text-[10px] font-bold text-amber-700 dark:text-amber-300 shadow-xs pointer-events-auto">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>ORIG</span>
                  <span className="text-slate-300">|</span>
                  <button onClick={handleAddOrigRange} title="Add Raw Audio Segment at Playhead" className="hover:text-amber-900 font-bold">+</button>
                </div>

                {/* Range blocks */}
                {origRanges.map((rng) => {
                  const startX = (rng.startMs / 1000.0) * zoomPxPerSec;
                  const widthPx = Math.max(36, ((rng.endMs - rng.startMs) / 1000.0) * zoomPxPerSec);

                  return (
                    <div
                      key={rng.id}
                      style={{ left: `${startX}px`, width: `${widthPx}px` }}
                      className="absolute top-1 bottom-1 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-sans text-xs px-2.5 py-0.5 shadow-sm flex items-center justify-between cursor-grab active:cursor-grabbing border border-teal-400 group overflow-hidden select-none"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingOrigRange({
                          id: rng.id,
                          type: 'move',
                          initialClientX: e.clientX,
                          initialStartMs: rng.startMs,
                          initialEndMs: rng.endMs,
                        });
                      }}
                    >
                      {/* Left Resize Handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingOrigRange({
                            id: rng.id,
                            type: 'resize-left',
                            initialClientX: e.clientX,
                            initialStartMs: rng.startMs,
                            initialEndMs: rng.endMs,
                          });
                        }}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-l"
                        title="Stretch Start"
                      />

                      <div className="flex items-center gap-1.5 truncate pointer-events-none pl-1 text-[11px] font-bold">
                        <span>{rng.label || 'Keep Original Laugh'}</span>
                        <span className="text-[10px] opacity-90 font-mono">
                          (00:{(rng.startMs / 1000).toFixed(1)} - 00:{(rng.endMs / 1000).toFixed(1)})
                        </span>
                      </div>

                      <div className="flex items-center gap-1 pointer-events-auto pr-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextAction = rng.action === 'duck' ? 'keep' : rng.action === 'keep' ? 'mute' : 'duck';
                            updateOrigRange(rng.id, { action: nextAction });
                          }}
                          className="px-1.5 py-0.2 rounded bg-black/25 hover:bg-black/40 text-[8.5px] font-bold"
                          title="Click to cycle: Ducking / Keep / Mute"
                        >
                          {rng.action}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeOrigRange(rng.id);
                          }}
                          className="hover:text-rose-200 text-white/80 text-[10px] font-bold px-0.5"
                          title="Delete Raw Audio Segment"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Right Resize Handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingOrigRange({
                            id: rng.id,
                            type: 'resize-right',
                            initialClientX: e.clientX,
                            initialStartMs: rng.startMs,
                            initialEndMs: rng.endMs,
                          });
                        }}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-r"
                        title="Stretch End"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Audio Stem / Track Mode Selector */}
            <div className="flex items-center gap-1.5 px-2 py-0.5">
              <button
                onClick={() => {
                  const modes: Array<'original' | 'dubbed' | 'split'> = ['original', 'dubbed', 'split'];
                  const nextMode = modes[(modes.indexOf(audioTrackMode) + 1) % modes.length];
                  setAudioTrackMode(nextMode);
                }}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-[10px] font-bold text-slate-700 dark:text-zinc-300 shadow-2xs transition-colors"
                title="Click to cycle Audio Track Preview: Original Mix / Dubbed Voice / Split Stems"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>
                  {audioTrackMode === 'original' ? 'Ch 1/2 (Original Mix)' : audioTrackMode === 'dubbed' ? 'Track A1 (Dubbed Voice)' : 'Split Stems (V1 + A2)'}
                </span>
                <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
              </button>
            </div>

            {/* 2. Track T1 (Green Khmer Subtitle Blocks with Gaps) */}
            <div className="h-14 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 relative flex items-center px-3 shadow-xs shrink-0">
              {/* Floating Left Pill: T1 | 🔗 | 🗑 */}
              <div className="absolute left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shadow-xs pointer-events-auto">
                <span>T1</span>
                <span className="text-slate-300">|</span>
                <button
                  onClick={() => setIsLinked(!isLinked)}
                  className={isLinked ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 hover:text-slate-600'}
                  title={isLinked ? 'Subtitle timings linked with audio (Click to unlock)' : 'Subtitle timings unlinked (Click to lock)'}
                >
                  <Link2 className="w-3 h-3" />
                </button>
                <span className="text-slate-300">|</span>
                <button onClick={deleteSelectedSegments} title="Delete Selected"><Trash2 className="w-3 h-3 hover:text-rose-600" /></button>
              </div>

              {/* Segment Blocks */}
              {segments.map((seg) => {
                const startX = (seg.startMs / 1000.0) * zoomPxPerSec;
                const widthPx = Math.max(
                  24,
                  ((seg.endMs - seg.startMs) / 1000.0) * zoomPxPerSec
                );
                const isSelected = seg.id === activeSegmentId || selectedSegmentIds.includes(seg.id);

                return (
                  <div
                    key={seg.id}
                    style={{
                      left: `${startX}px`,
                      width: `${widthPx}px`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSegmentId(seg.id);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setActiveSegmentId(seg.id);
                      setDraggingSegment({
                        id: seg.id,
                        type: 'move',
                        initialClientX: e.clientX,
                        initialStartMs: seg.startMs,
                        initialEndMs: seg.endMs,
                      });
                    }}
                    className={`absolute top-2 bottom-2 rounded-lg bg-emerald-600 text-white font-sans text-xs px-2 py-1 shadow-sm flex items-center justify-between cursor-grab active:cursor-grabbing border ${
                      isSelected
                        ? 'ring-2 ring-indigo-500 border-white'
                        : 'border-emerald-500 hover:bg-emerald-500'
                    }`}
                  >
                    {/* Left Resize Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingSegment({
                          id: seg.id,
                          type: 'resize-left',
                          initialClientX: e.clientX,
                          initialStartMs: seg.startMs,
                          initialEndMs: seg.endMs,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l"
                    />

                    <span className="truncate text-[11px] font-bold pointer-events-none">
                      {seg.translatedText || seg.originalText}
                    </span>

                    {/* Right Resize Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingSegment({
                          id: seg.id,
                          type: 'resize-right',
                          initialClientX: e.clientX,
                          initialStartMs: seg.startMs,
                          initialEndMs: seg.endMs,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r"
                    />
                  </div>
                );
              })}
            </div>

            {/* 3. Track A1 (Indigo Dubbed Audio Clips with Waveform Peaks matching T1) */}
            <div className="h-14 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 relative flex items-center px-3 shadow-xs shrink-0">
              {/* Floating Left Pill: A1 | 🔊 | ✂ | 🗑 */}
              <div className="absolute left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border border-indigo-300 dark:border-indigo-800 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 shadow-xs pointer-events-auto">
                <span>A1</span>
                <span className="text-slate-300">|</span>
                <button onClick={() => setMixerOpen(true)} title="Audio Mixer"><Volume2 className="w-3 h-3 hover:text-indigo-900" /></button>
                <span className="text-slate-300">|</span>
                <button onClick={splitActiveSegment} title="Split Audio"><Scissors className="w-3 h-3 hover:text-indigo-900" /></button>
                <span className="text-slate-300">|</span>
                <button onClick={deleteSelectedSegments} title="Delete Selected Audio"><Trash2 className="w-3 h-3 hover:text-rose-600" /></button>
              </div>

              {/* Dubbed Audio Clips */}
              {segments.map((seg) => {
                const startX = (seg.startMs / 1000.0) * zoomPxPerSec;
                const widthPx = Math.max(
                  24,
                  ((seg.endMs - seg.startMs) / 1000.0) * zoomPxPerSec
                );
                const isSelected = seg.id === activeSegmentId || selectedSegmentIds.includes(seg.id);
                const segAudio = seg.ttsStretchedPath || seg.ttsRawPath || a1AudioPath;

                return (
                  <div
                    key={`a1-seg-${seg.id}`}
                    style={{
                      left: `${startX}px`,
                      width: `${widthPx}px`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSegmentId(seg.id);
                    }}
                    className={`absolute top-2 bottom-2 rounded-lg bg-indigo-600 text-white font-sans text-xs px-2 py-1 shadow-sm flex items-center justify-between border cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'ring-2 ring-emerald-400 border-white'
                        : 'border-indigo-500 hover:bg-indigo-500'
                    }`}
                  >
                    {/* Waveform Peaks inside A1 block */}
                    <div className="flex items-center h-full opacity-90 pointer-events-none w-full justify-center">
                      <AudioWaveformCanvas
                        audioPath={segAudio}
                        width={Math.max(16, widthPx - 8)}
                        height={24}
                        color="#ffffff"
                        barWidth={2}
                        gap={1}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4. Track A2 (Full-Width Purple Instrumental Bar) */}
            <div className="h-12 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 relative flex items-center px-3 shadow-xs overflow-hidden shrink-0">
              {/* Floating Left Pill: A2 | 🔊 | ↔ | 🗑 */}
              <div className="absolute left-3 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border border-purple-300 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 shadow-xs pointer-events-auto">
                <span>A2</span>
                <span className="text-slate-300">|</span>
                <button onClick={() => setMixerOpen(true)} title="Audio Mixer"><Volume2 className="w-3 h-3 hover:text-purple-900" /></button>
                <span className="text-slate-300">|</span>
                <button onClick={() => setMixerOpen(true)} title="Audio Mixer & Balance"><ArrowLeftRight className="w-3 h-3 hover:text-purple-900" /></button>
                <span className="text-slate-300">|</span>
                <button title="Clear BGM" onClick={() => setBgmAudioPath(null)}><Trash2 className="w-3 h-3 hover:text-rose-600" /></button>
              </div>

              {/* Full-width purple Instrumental bar */}
              <div className="absolute left-28 right-3 top-2 bottom-2 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white font-mono text-[11px] font-bold flex items-center px-3 shadow-sm border border-purple-400/50 overflow-hidden">
                <div className="flex items-center gap-2 truncate shrink-0 z-10">
                  <Volume2 className="w-3.5 h-3.5 opacity-90 shrink-0" />
                  <span className="truncate">
                    {bgmAudioPath ? bgmAudioPath.split(/[/\\]/).pop() : (project ? `${project.videoPath.split(/[/\\]/).pop()} (Instrumental) V:0.5` : 'Instrumental Stem V:0.5')}
                  </span>
                </div>
                <div className="ml-auto flex-1 flex items-center justify-end h-full pl-4 pointer-events-none opacity-60">
                  <AudioWaveformCanvas
                    audioPath={bgmAudioPath}
                    width={Math.max(100, timelineWidthPx - 400)}
                    height={20}
                    color="#ffffff"
                    barWidth={2}
                    gap={2}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Vertical Red Playhead Line Spanning All 4 Tracks */}
          <div
            style={{ left: `${playheadX}px` }}
            className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-30 pointer-events-none shadow-md shadow-rose-500/50"
          >
            <div className="w-3 h-3 -ml-[5px] -mt-0.5 bg-rose-500 rounded-b-sm rotate-45 transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
