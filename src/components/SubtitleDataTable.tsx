import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Search,
  Check,
  ChevronDown,
  Volume2,
  FilePenLine,
  MessageSquareText,
  Layers,
  Users,
  Settings,
} from 'lucide-react';
import { invoke, convertFileSrc, Channel } from '@tauri-apps/api/core';
import { useStudioStore } from '../store/studioStore';
import { DubSegment, PipelineEvent, MOVIE_PERSONAS, MOVIE_EMOTIONS } from '../types/studio';
import { PipelineProgress } from './PipelineProgress';

export const SubtitleDataTable: React.FC = () => {
  const {
    project,
    projectName,
    apiKeys,
    segments,
    setSegments,
    selectedSegmentIds,
    activeSegmentId,
    setActiveSegmentId,
    toggleSelectSegment,
    toggleSelectAllSegments,
    setSelectedVoiceForSelectedSegments,
    updateSegment,
    updateSegmentPartial,
    addSegment,
    deleteSelectedSegments,
    setCurrentTimeMs,
    setIsPlaying,
    searchQuery,
    setSplitModalOpen,
    setFindReplaceOpen,
    setPresetsModalOpen,
    setProjectName,
    setSearchQuery,
    setPipelineProgress,
  } = useStudioStore();

  const [selectedMaleVoice, setSelectedMaleVoice] = useState('km-KH-PisethNeural');
  const [selectedFemaleVoice, setSelectedFemaleVoice] = useState('km-KH-SreymomNeural');
  const [batchPersona, setBatchPersona] = useState('narrator');
  const [batchEmotion, setBatchEmotion] = useState('natural');
  const [isGeneratingBatchAudio, setIsGeneratingBatchAudio] = useState(false);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Dropdown states
  const [showSeriesMenu, setShowSeriesMenu] = useState(false);
  const [showAllVoicesMenu, setShowAllVoicesMenu] = useState(false);
  const [showCastMenu, setShowCastMenu] = useState(false);
  const [selectedCastFilter, setSelectedCastFilter] = useState<string | null>(null);

  const seriesMenuRef = useRef<HTMLDivElement>(null);
  const allVoicesMenuRef = useRef<HTMLDivElement>(null);
  const castMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (seriesMenuRef.current && !seriesMenuRef.current.contains(target)) {
        setShowSeriesMenu(false);
      }
      if (allVoicesMenuRef.current && !allVoicesMenuRef.current.contains(target)) {
        setShowAllVoicesMenu(false);
      }
      if (castMenuRef.current && !castMenuRef.current.contains(target)) {
        setShowCastMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredSegments = useMemo(() => {
    let result = segments;
    if (selectedCastFilter && selectedCastFilter !== 'ALL') {
      result = result.filter(
        (s) => s.speakerTag === selectedCastFilter || s.speaker === selectedCastFilter
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.originalText.toLowerCase().includes(q) ||
          s.translatedText.toLowerCase().includes(q) ||
          s.speaker.toLowerCase().includes(q)
      );
    }
    return result;
  }, [segments, searchQuery, selectedCastFilter]);

  const handleRowClick = (id: string, startMs: number) => {
    setActiveSegmentId(id);
    setCurrentTimeMs(startMs);
    setIsPlaying(false);
  };

  const handleApplyMaleVoice = () => {
    if (selectedSegmentIds.length > 0) {
      setSelectedVoiceForSelectedSegments(selectedMaleVoice);
      selectedSegmentIds.forEach((id) => {
        updateSegmentPartial(id, { voiceId: selectedMaleVoice, speakerTag: 'A2' });
      });
    } else if (activeSegmentId) {
      updateSegmentPartial(activeSegmentId, { voiceId: selectedMaleVoice, speakerTag: 'A2' });
    }
  };

  const handleApplyFemaleVoice = () => {
    if (selectedSegmentIds.length > 0) {
      setSelectedVoiceForSelectedSegments(selectedFemaleVoice);
      selectedSegmentIds.forEach((id) => {
        updateSegmentPartial(id, { voiceId: selectedFemaleVoice, speakerTag: 'A4' });
      });
    } else if (activeSegmentId) {
      updateSegmentPartial(activeSegmentId, { voiceId: selectedFemaleVoice, speakerTag: 'A4' });
    }
  };

  const handleApplyBatchPersona = () => {
    const p = MOVIE_PERSONAS.find((x) => x.id === batchPersona);
    const vId = p ? p.defaultVoice : selectedMaleVoice;
    if (selectedSegmentIds.length > 0) {
      selectedSegmentIds.forEach((id) => {
        updateSegmentPartial(id, { persona: batchPersona, voiceId: vId });
      });
    } else if (activeSegmentId) {
      updateSegmentPartial(activeSegmentId, { persona: batchPersona, voiceId: vId });
    }
  };

  const handleApplyBatchEmotion = () => {
    if (selectedSegmentIds.length > 0) {
      selectedSegmentIds.forEach((id) => {
        updateSegmentPartial(id, { emotion: batchEmotion });
      });
    } else if (activeSegmentId) {
      updateSegmentPartial(activeSegmentId, { emotion: batchEmotion });
    }
  };

  const handleBatchGenerateAudio = async (targetOnlySelected: boolean = false) => {
    if (!project || segments.length === 0 || isGeneratingBatchAudio) return;

    const targetIds = targetOnlySelected && selectedSegmentIds.length > 0
      ? selectedSegmentIds
      : undefined;

    setIsGeneratingBatchAudio(true);
    setPipelineProgress({
      running: true,
      stage: 'Voice Synthesis',
      percent: 0,
      detail: `Preparing audio generation for ${targetIds ? targetIds.length : segments.length} subtitles...`,
    });

    try {
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
          case 'SegmentUpdated':
            updateSegment(event.segment);
            break;
          default:
            break;
        }
      };

      const updated = await invoke<DubSegment[]>('generate_segments_audio', {
        segments,
        targetIds,
        config: project,
        apiKeys,
        channel,
      });

      if (Array.isArray(updated)) {
        setSegments(updated);
      }

      setPipelineProgress({
        running: false,
        stage: 'Completed',
        percent: 100,
        detail: 'Audio generation completed successfully.',
      });
    } catch (err) {
      console.error('Batch audio generation failed:', err);
      setPipelineProgress({
        running: false,
        stage: 'Error',
        percent: 0,
        detail: `Voice synthesis failed: ${err}`,
      });
    } finally {
      setIsGeneratingBatchAudio(false);
    }
  };

  // Real Audio Preview: Plays actual synthesized audio or regenerates TTS via IPC
  const handlePlayAudioPreview = async (seg: DubSegment) => {
    if (playingSegmentId === seg.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingSegmentId(null);
      return;
    }

    setPlayingSegmentId(seg.id);
    setActiveSegmentId(seg.id);
    setCurrentTimeMs(seg.startMs);

    const existingAudio = seg.ttsStretchedPath || seg.ttsRawPath;
    if (existingAudio) {
      try {
        const src = convertFileSrc(existingAudio);
        if (!audioPlayerRef.current) {
          audioPlayerRef.current = new Audio(src);
        } else {
          audioPlayerRef.current.src = src;
        }
        audioPlayerRef.current.onended = () => setPlayingSegmentId(null);
        audioPlayerRef.current.onerror = () => setPlayingSegmentId(null);
        await audioPlayerRef.current.play();
        return;
      } catch (err) {
        console.error(err);
      }
    }

    // If audio is not yet synthesized and a project is open, generate it with real TTS backend
    if (project) {
      try {
        updateSegmentPartial(seg.id, { status: 'synthesizing' });
        const updated = await invoke<DubSegment>('regenerate_segment_tts', {
          segment: seg,
          config: project,
          apiKeys,
        });
        updateSegment(updated);
        const newAudio = updated.ttsStretchedPath || updated.ttsRawPath;
        if (newAudio) {
          const src = convertFileSrc(newAudio);
          if (!audioPlayerRef.current) {
            audioPlayerRef.current = new Audio(src);
          } else {
            audioPlayerRef.current.src = src;
          }
          audioPlayerRef.current.onended = () => setPlayingSegmentId(null);
          audioPlayerRef.current.onerror = () => setPlayingSegmentId(null);
          await audioPlayerRef.current.play();
          return;
        }
      } catch (e) {
        console.error('TTS generation error:', e);
        updateSegmentPartial(seg.id, { status: 'error' });
      }
    }

    // Web Speech fallback for offline testing
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(seg.translatedText || seg.originalText);
      utterance.rate = seg.speedRatio || 1.0;
      utterance.onend = () => setPlayingSegmentId(null);
      utterance.onerror = () => setPlayingSegmentId(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPlayingSegmentId(null), 1200);
    }
  };

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const centis = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 select-none">
      {/* Hidden audio element */}
      <audio ref={audioPlayerRef} className="hidden" />

      {/* Top Action Toolbar */}
      <div className="h-11 px-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50/70 dark:bg-zinc-900/40 text-xs overflow-x-auto custom-scrollbar">
        {/* Left: Title + Labeled Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-bold text-xs text-slate-800 dark:text-zinc-100 flex items-center gap-1 mr-1">
            Subtitle Data
            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
              {segments.length}
            </span>
          </span>

          {/* [+ Add Text] */}
          <button
            onClick={addSegment}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold transition-colors shadow-2xs"
            title="Add New Subtitle Segment"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Text</span>
          </button>

          {/* [📝 Edit] */}
          <button
            onClick={() => setSplitModalOpen(true)}
            disabled={segments.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-medium transition-colors shadow-2xs disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-slate-100 dark:disabled:hover:bg-zinc-800"
            title={segments.length === 0 ? 'Transcribe the video or add a subtitle before editing.' : 'Edit subtitles'}
          >
            <FilePenLine className="w-3.5 h-3.5 text-blue-500" />
            <span>Edit</span>
          </button>

          {/* [🗑 Delete] — rose colored matching mockup */}
          <button
            onClick={deleteSelectedSegments}
            disabled={selectedSegmentIds.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/30 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-medium transition-colors shadow-2xs disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-rose-50/40 dark:disabled:hover:bg-rose-950/30"
            title={selectedSegmentIds.length === 0 ? 'Select subtitles to delete.' : 'Delete selected subtitles'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* [🔍 Find & Replace] — amber colored matching mockup */}
          <button
            onClick={() => setFindReplaceOpen(true)}
            disabled={segments.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium transition-colors shadow-2xs disabled:cursor-not-allowed disabled:opacity-45"
            title={segments.length === 0 ? 'Add or import subtitles before using Find & Replace.' : 'Find & Replace in subtitles'}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Find &amp; Replace</span>
          </button>

          {/* [🔊 Generate Audio] — Indigo high-visibility action button */}
          <button
            onClick={() => handleBatchGenerateAudio(selectedSegmentIds.length > 0)}
            disabled={segments.length === 0 || isGeneratingBatchAudio}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold transition-all shadow-2xs disabled:cursor-not-allowed disabled:opacity-45"
            title={
              selectedSegmentIds.length > 0
                ? `Synthesize voice for ${selectedSegmentIds.length} selected subtitle(s)`
                : 'Synthesize voice for all pending subtitles'
            }
          >
            <Volume2 className={`w-3.5 h-3.5 ${isGeneratingBatchAudio ? 'animate-bounce text-amber-300' : ''}`} />
            <span>
              {isGeneratingBatchAudio
                ? 'Synthesizing...'
                : selectedSegmentIds.length > 0
                ? `Generate Audio (${selectedSegmentIds.length})`
                : 'Generate Audio (All)'}
            </span>
          </button>

          {/* [📚 Series] — Interactive dropdown */}
          <div className="relative" ref={seriesMenuRef}>
            <button
              onClick={() => setShowSeriesMenu(!showSeriesMenu)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium transition-colors shadow-2xs cursor-pointer"
              title="Series & Episode Management"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Series</span>
              <ChevronDown className={`w-3 h-3 text-emerald-600 dark:text-emerald-400 transition-transform ${showSeriesMenu ? 'rotate-180' : ''}`} />
            </button>

            {showSeriesMenu && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-slate-200 dark:border-zinc-700 py-2 px-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 px-1">
                  Series &amp; Episode
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200 px-1 mb-2 truncate">
                  {projectName || '嫌疑人的秘密_EP12'}
                </div>
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {['EP 01', 'EP 02', 'EP 03', 'EP 04', 'EP 05', 'EP 06', 'EP 07', 'EP 08'].map((ep) => (
                    <button
                      key={ep}
                      onClick={() => {
                        const base = (projectName || 'Series').split('_')[0];
                        setProjectName(`${base}_${ep.replace(' ', '')}`);
                        setShowSeriesMenu(false);
                      }}
                      className="px-1.5 py-1 text-[11px] font-mono rounded bg-slate-100 hover:bg-indigo-50 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-slate-700 dark:text-zinc-200 transition-colors text-center"
                    >
                      {ep}
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-100 dark:border-zinc-700 pt-2">
                  <button
                    onClick={() => {
                      setShowSeriesMenu(false);
                      setPresetsModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Manage Series Presets</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* [🎬 All voices] — Interactive Dropdown */}
          <div className="relative" ref={allVoicesMenuRef}>
            <button
              onClick={() => setShowAllVoicesMenu(!showAllVoicesMenu)}
              disabled={segments.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
              title={segments.length === 0 ? 'Add or import subtitles before assigning voices.' : 'Assign one voice to every subtitle'}
            >
              <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>All voices</span>
              <ChevronDown className={`w-3 h-3 text-indigo-500 transition-transform ${showAllVoicesMenu ? 'rotate-180' : ''}`} />
            </button>

            {showAllVoicesMenu && (
              <div className="absolute top-full left-0 mt-1 w-60 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-slate-200 dark:border-zinc-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Apply to all {segments.length} segments
                </div>
                {[
                  { id: 'km-KH-PisethNeural', label: '🇰🇭 តួឯកប្រុស (Piseth)', gender: '♂' },
                  { id: 'km-KH-SreymomNeural', label: '🇰🇭 តួឯកស្រី (Sreymom)', gender: '♀' },
                  { id: 'en-US-AndrewNeural', label: '🇺🇸 Andrew (US Male)', gender: '♂' },
                  { id: 'en-US-BrianNeural', label: '🇺🇸 Brian (US Male)', gender: '♂' },
                  { id: 'en-US-AvaNeural', label: '🇺🇸 Ava (US Female)', gender: '♀' },
                  { id: 'en-US-EmmaNeural', label: '🇺🇸 Emma (US Female)', gender: '♀' },
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      segments.forEach((s) => updateSegmentPartial(s.id, { voiceId: v.id }));
                      setShowAllVoicesMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between text-slate-700 dark:text-zinc-200"
                  >
                    <span>{v.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">{v.gender}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cast 5 selector — Interactive Cast & Filter Manager */}
          <div className="relative" ref={castMenuRef}>
            <button
              onClick={() => setShowCastMenu(!showCastMenu)}
              disabled={segments.length === 0}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border font-medium transition-colors shadow-2xs cursor-pointer ${
                selectedCastFilter && selectedCastFilter !== 'ALL'
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
              }`}
              title={segments.length === 0 ? 'Transcribe or import subtitles before filtering by cast.' : 'Filter subtitles by cast role'}
            >
              <span className="flex -space-x-1 mr-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-1 ring-white dark:ring-zinc-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500 ring-1 ring-white dark:ring-zinc-800" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-white dark:ring-zinc-800" />
              </span>
              <span>{selectedCastFilter && selectedCastFilter !== 'ALL' ? `Cast: ${selectedCastFilter}` : 'Cast 5'}</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showCastMenu ? 'rotate-180' : ''}`} />
            </button>

            {showCastMenu && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-slate-200 dark:border-zinc-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cast Filter</span>
                  {selectedCastFilter && selectedCastFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedCastFilter('ALL')}
                      className="text-[10px] font-semibold text-indigo-600 hover:underline"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedCastFilter('ALL');
                    setShowCastMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-colors flex items-center justify-between ${
                    !selectedCastFilter || selectedCastFilter === 'ALL'
                      ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-zinc-700/50'
                      : 'text-slate-700 dark:text-zinc-200'
                  }`}
                >
                  <span>Show All Characters</span>
                  <span className="text-[10px] font-mono text-slate-400">({segments.length})</span>
                </button>
                <div className="border-t border-slate-100 dark:border-zinc-700 my-1" />
                {[
                  { tag: 'A1', label: 'Cast 1: តួអ្នករៀបរាប់ (Narrator)', color: 'bg-blue-500' },
                  { tag: 'A2', label: 'Cast 2: តួឯកប្រុស (Lead Male)', color: 'bg-cyan-500' },
                  { tag: 'A3', label: 'Cast 3: តួឯកស្រី (Lead Female)', color: 'bg-pink-500' },
                  { tag: 'A4', label: 'Cast 4: តួរង (Supporting)', color: 'bg-amber-500' },
                  { tag: 'A5', label: 'Cast 5: តួបន្ទាប់បន្សំ (Extra)', color: 'bg-emerald-500' },
                ].map((c) => {
                  const count = segments.filter((s) => s.speakerTag === c.tag || s.speaker === c.tag).length;
                  return (
                    <div
                      key={c.tag}
                      className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors group"
                    >
                      <button
                        onClick={() => {
                          setSelectedCastFilter(c.tag);
                          setShowCastMenu(false);
                        }}
                        className="flex items-center gap-2 flex-1 text-left text-slate-700 dark:text-zinc-200"
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${c.color} shrink-0`} />
                        <span className="truncate">{c.label}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-slate-400">({count})</span>
                        {selectedSegmentIds.length > 0 && (
                          <button
                            onClick={() => {
                              selectedSegmentIds.forEach((id) => {
                                updateSegmentPartial(id, { speakerTag: c.tag });
                              });
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Assign selected to this Cast"
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Voice & Character Assignment Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Batch Persona Picker */}
          <div className="flex items-center rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/80 dark:bg-purple-950/40 p-0.5 shadow-2xs">
            <span className="text-purple-600 text-xs ml-1 mr-0.5">🎭</span>
            <select
              value={batchPersona}
              onChange={(e) => setBatchPersona(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-purple-700 dark:text-purple-300 px-1 py-0.5 focus:outline-none cursor-pointer font-sans"
              title="Select Movie Character Persona for selection"
            >
              {MOVIE_PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.khmerName}
                </option>
              ))}
            </select>
            <button
              onClick={handleApplyBatchPersona}
              className="w-5 h-5 rounded-md bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-colors shadow-xs"
              title="Apply Movie Persona to selected subtitles"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>

          {/* Batch Emotion Picker */}
          <div className="flex items-center rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/40 p-0.5 shadow-2xs">
            <span className="text-amber-600 text-xs ml-1 mr-0.5">✨</span>
            <select
              value={batchEmotion}
              onChange={(e) => setBatchEmotion(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-amber-700 dark:text-amber-300 px-1 py-0.5 focus:outline-none cursor-pointer font-sans"
              title="Select Movie Emotion for selection"
            >
              {MOVIE_EMOTIONS.map((em) => (
                <option key={em.id} value={em.id}>
                  {em.emoji} {em.khmerName}
                </option>
              ))}
            </select>
            <button
              onClick={handleApplyBatchEmotion}
              className="w-5 h-5 rounded-md bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center transition-colors shadow-xs"
              title="Apply Emotion to selected subtitles"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>

          {/* Male voice pill: [♂ Default Male v] [✓] — full Khmer name */}
          <div className="flex items-center rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/40 p-0.5 shadow-2xs">
            <span className="text-blue-500 text-xs ml-1.5 mr-0.5 font-bold">♂</span>
            <select
              value={selectedMaleVoice}
              onChange={(e) => setSelectedMaleVoice(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-blue-700 dark:text-blue-300 px-1 py-0.5 focus:outline-none cursor-pointer font-sans"
            >
              <option value="km-KH-PisethNeural">តួឯកប្រុស (Piseth)</option>
              <option value="en-US-AndrewNeural">Andrew (US)</option>
              <option value="en-US-BrianNeural">Brian (US)</option>
            </select>
            <button
              onClick={handleApplyMaleVoice}
              className="w-5 h-5 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-xs"
              title="Apply Male Voice to Selection"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>

          {/* Female voice pill: [♀ Default Female v] [✓] — full Khmer name */}
          <div className="flex items-center rounded-lg border border-pink-200 dark:border-pink-900 bg-pink-50/80 dark:bg-pink-950/40 p-0.5 shadow-2xs">
            <span className="text-pink-500 text-xs ml-1.5 mr-0.5 font-bold">♀</span>
            <select
              value={selectedFemaleVoice}
              onChange={(e) => setSelectedFemaleVoice(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-pink-600 dark:text-pink-300 px-1 py-0.5 focus:outline-none cursor-pointer font-sans"
            >
              <option value="km-KH-SreymomNeural">តួឯកស្រី (Sreymom)</option>
              <option value="en-US-AvaNeural">Ava (US)</option>
              <option value="en-US-EmmaNeural">Emma (US)</option>
            </select>
            <button
              onClick={handleApplyFemaleVoice}
              className="w-5 h-5 rounded-md bg-pink-500 hover:bg-pink-600 text-white flex items-center justify-center transition-colors shadow-xs"
              title="Apply Female Voice to Selection"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        <PipelineProgress />
        <table className="w-full text-left text-xs border-collapse">
          {/* Sticky Table Header */}
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            <tr>
              <th className="w-9 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={selectedSegmentIds.length > 0 && selectedSegmentIds.length === segments.length}
                  onChange={toggleSelectAllSegments}
                  className="rounded text-indigo-600 cursor-pointer"
                />
              </th>
              <th className="w-20 px-2 py-2">START</th>
              <th className="w-20 px-2 py-2">END</th>
              <th className="px-3 py-2">KHMER TEXT (EDITABLE)</th>
              <th className="w-52 px-2 py-2">CHARACTER PERSONA</th>
              <th className="w-36 px-2 py-2">EMOTION</th>
              <th className="w-20 px-2 py-2 text-center">SPEED</th>
              <th className="w-24 px-3 py-2 text-center">AUDIO</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-900 font-sans">
            {filteredSegments.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 sm:p-10">
                  <div className="mx-auto flex max-w-md flex-col items-center text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                      <MessageSquareText className="h-5 w-5" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                      {searchQuery.trim() ? 'No matching subtitles' : project ? 'Your script is ready' : 'Your subtitle script will appear here'}
                    </h2>
                    <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                      {searchQuery.trim()
                        ? `Nothing matches “${searchQuery.trim()}”. Try another search term.`
                        : project
                        ? 'Transcribe your video from the timeline, or add a subtitle line to start editing.'
                        : 'Load a video, then transcribe it or import an SRT/VTT file to start dubbing.'}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {searchQuery.trim() ? (
                        <button onClick={() => setSearchQuery('')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                          Clear search
                        </button>
                      ) : project && segments.length === 0 ? (
                        <button onClick={addSegment} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700">
                          <Plus className="h-3.5 w-3.5" /> Add first subtitle
                        </button>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredSegments.map((seg) => {
                const isSelected = selectedSegmentIds.includes(seg.id);
                const isActive = activeSegmentId === seg.id;
                const speed = seg.speedRatio || 1.0;
                const isPlayingThis = playingSegmentId === seg.id;
                const isSynthesizing = seg.status === 'synthesizing';

                return (
                  <tr
                    key={seg.id}
                    onClick={() => handleRowClick(seg.id, seg.startMs)}
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-l-4 border-l-indigo-600 dark:border-l-indigo-500'
                        : isSelected
                        ? 'bg-slate-50 dark:bg-zinc-900/60'
                        : 'hover:bg-slate-50/70 dark:hover:bg-zinc-900/30'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectSegment(seg.id)}
                        className="rounded text-indigo-600 cursor-pointer"
                      />
                    </td>

                    {/* Start Time */}
                    <td className={`px-2 py-2 font-mono text-[11px] ${isActive ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-zinc-400'}`}>
                      {formatMs(seg.startMs)}
                    </td>

                    {/* End Time */}
                    <td className={`px-2 py-2 font-mono text-[11px] ${isActive ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-zinc-500'}`}>
                      {formatMs(seg.endMs)}
                    </td>

                    {/* Inline Editable Khmer Text */}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col">
                        <input
                          id={`sub-input-${seg.id}`}
                          type="text"
                          value={seg.translatedText}
                          onChange={(e) => updateSegmentPartial(seg.id, { translatedText: e.target.value })}
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-zinc-700 focus:border-indigo-500 dark:focus:border-indigo-400 px-1 py-0.5 text-xs font-bold font-sans text-slate-800 dark:text-zinc-100 focus:outline-none transition-colors"
                          placeholder="បញ្ចូលអត្ថបទសម្រាយ..."
                        />
                        {seg.originalText && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 px-1 truncate">
                            {seg.originalText}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Character Persona & Voice Column */}
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block w-full">
                        <select
                          value={seg.persona || 'narrator'}
                          onChange={(e) => {
                            const newPersona = e.target.value;
                            const pObj = MOVIE_PERSONAS.find((p) => p.id === newPersona);
                            updateSegmentPartial(seg.id, {
                              persona: newPersona,
                              voiceId: pObj?.defaultVoice || seg.voiceId || 'km-KH-PisethNeural',
                            });
                          }}
                          className="w-full text-[11px] font-semibold rounded-lg px-2 py-1 border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs font-sans truncate"
                          title="Movie Character Archetype (tuned pitch offset & speech rate)"
                        >
                          {MOVIE_PERSONAS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.emoji} {p.khmerName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Emotion Modulation Column */}
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block w-full">
                        <select
                          value={seg.emotion || 'natural'}
                          onChange={(e) => {
                            updateSegmentPartial(seg.id, { emotion: e.target.value });
                          }}
                          className="w-full text-[11px] font-semibold rounded-lg px-2 py-1 border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-900 text-amber-700 dark:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-2xs font-sans truncate"
                          title="Dialogue Emotion Modulation (pitch & speech speed)"
                        >
                          {MOVIE_EMOTIONS.map((em) => (
                            <option key={em.id} value={em.id}>
                              {em.emoji} {em.khmerName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Speed Column: Clean text 1.0x / 1.1x matching screenshot */}
                    <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <span
                        className="font-mono font-bold text-xs text-slate-700 dark:text-zinc-300"
                        title="Measured speech duration divided by this cue's time window"
                      >
                        {speed.toFixed(1)}x
                      </span>
                    </td>

                    {/* Audio Status Column: Ready (emerald) / Pending (amber) matching screenshot */}
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handlePlayAudioPreview(seg)}
                        className="focus:outline-none transition-transform hover:scale-105 active:scale-95 text-xs font-bold"
                        title="Click to preview or generate audio"
                      >
                        {isPlayingThis ? (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                            <Volume2 className="w-3.5 h-3.5 animate-bounce" /> Playing
                          </span>
                        ) : isSynthesizing ? (
                          <span className="text-amber-500 animate-pulse">Generating...</span>
                        ) : seg.status === 'pending' ? (
                          <span className="text-amber-500 dark:text-amber-400">Pending</span>
                        ) : (
                          <span className="text-emerald-500 dark:text-emerald-400">Ready</span>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
