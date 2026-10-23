import React, { useRef, useEffect, useMemo } from 'react';
import { 
  Video, 
  FlipHorizontal, 
  FlipVertical, 
  Crop, 
  RotateCw, 
  SlidersHorizontal, 
  Type, 
  PictureInPicture, 
  Play, 
  Pause, 
  Square, 
  Volume2, 
  VolumeX, 
  FolderPlus, 
  Music, 
  LayoutGrid,
  AudioWaveform,
  Wand2,
  FileUp,
  FileDown,
  Clapperboard,
  Trash2,
  RotateCcw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke, convertFileSrc, Channel } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useStudioStore } from '../store/studioStore';
import { ProjectConfig, PipelineEvent, DubSegment } from '../types/studio';

function parseTimestampToMs(timeStr: string): number {
  const parts = timeStr.trim().replace(',', '.').split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }
  return 0;
}

function parseSrtOrVtt(content: string, defaultVoice: string): DubSegment[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const parsedSegments: DubSegment[] = [];
  let currentStart = 0;
  let currentEnd = 0;
  let currentTextLines: string[] = [];
  let index = 0;

  const timecodeRegex = /(\d{1,2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{3})/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (timecodeRegex.test(trimmed)) {
      if (currentTextLines.length > 0 && currentEnd > currentStart) {
        parsedSegments.push({
          id: `seg-${Date.now()}-${index}`,
          index,
          startMs: currentStart,
          endMs: currentEnd,
          speaker: 'Speaker 1',
          speakerTag: undefined,
          voiceId: defaultVoice,
          originalText: currentTextLines.join(' '),
          translatedText: currentTextLines.join(' '),
          speedRatio: 1.0,
          status: 'translated',
        });
        index++;
        currentTextLines = [];
      }
      const match = trimmed.match(timecodeRegex);
      if (match) {
        currentStart = parseTimestampToMs(match[1]);
        currentEnd = parseTimestampToMs(match[2]);
      }
    } else if (trimmed && !/^\d+$/.test(trimmed) && trimmed !== 'WEBVTT') {
      currentTextLines.push(trimmed);
    }
  }

  if (currentTextLines.length > 0 && currentEnd > currentStart) {
    parsedSegments.push({
      id: `seg-${Date.now()}-${index}`,
      index,
      startMs: currentStart,
      endMs: currentEnd,
      speaker: 'Speaker 1',
      speakerTag: undefined,
      voiceId: defaultVoice,
      originalText: currentTextLines.join(' '),
      translatedText: currentTextLines.join(' '),
      speedRatio: 1.0,
      status: 'translated',
    });
  }

  return parsedSegments;
}

export const LeftSidebar: React.FC = () => {
  const {
    project,
    targetLang,
    setProject,
    segments,
    setSegments,
    activeSegmentId,
    setActiveSegmentId,
    currentTimeMs,
    setCurrentTimeMs,
    durationMs,
    setDurationMs,
    isPlaying,
    setIsPlaying,
    audioTrackMode,
    masterDubbedVideoPath,
    setPipelineProgress,
    videoTransform,
    updateVideoTransform,
    setBgmAudioPath,
    bgmAudioPath,
    setA1AudioPath,
    a1AudioPath,
    setIntroOutroOpen,
    isAudioMuted,
    toggleAudioMuted,
    isBgmIsolated,
    toggleBgmIsolated,
    setExportOpen,
    blurMasks,
    addBlurMask,
    updateBlurMask,
    removeBlurMask,
  } = useStudioStore();


  const [activeBlurType, setActiveBlurType] = React.useState<'blur' | 'pixelate' | 'solid'>('blur');
  const [blurIntensity, setBlurIntensity] = React.useState(12);
  const [showBlurToolbar, setShowBlurToolbar] = React.useState(true);
  const [showFilterPopover, setShowFilterPopover] = React.useState(false);
  const [showStylePopover, setShowStylePopover] = React.useState(false);
  const [aspectRatio, setAspectRatio] = React.useState<'9:16' | '16:9' | '1:1'>('9:16');
  
  // Real-time Video Color Grading
  const [brightness, setBrightness] = React.useState(100);
  const [contrast, setContrast] = React.useState(100);
  const [saturation, setSaturation] = React.useState(100);

  // Subtitle Draggable Coordinates & Snap Guides
  const [subPos, setSubPos] = React.useState({ x: 50, y: 85 }); // percentage
  const [isDraggingSub, setIsDraggingSub] = React.useState(false);
  const [isNearCenterX, setIsNearCenterX] = React.useState(false);
  const [isNearCenterY, setIsNearCenterY] = React.useState(false);

  // Censor / Blur Mask Draggable Coordinates
  const [draggingMaskId, setDraggingMaskId] = React.useState<string | null>(null);
  const [maskDragStart, setMaskDragStart] = React.useState<{ x: number; y: number; initialX: number; initialY: number } | null>(null);

  useEffect(() => {
    if (!isDraggingSub && !draggingMaskId) return;
    const stopDragging = () => {
      setIsDraggingSub(false);
      setIsNearCenterX(false);
      setIsNearCenterY(false);
      setDraggingMaskId(null);
      setMaskDragStart(null);
    };
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    return () => {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, [isDraggingSub, draggingMaskId]);

  // Module 5: Font color & background styling controls
  const [subFontSize, setSubFontSize] = React.useState(14);
  const [subFontColor, setSubFontColor] = React.useState('#ffffff');
  const [subBgColor, setSubBgColor] = React.useState('rgba(0, 0, 0, 0.75)');
  const [subGlowColor, setSubGlowColor] = React.useState('#6366f1');

  // Interactive Resizable Dimensions (ទាញចេញ / ទាញចូល)
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => {
    const saved = localStorage.getItem('dubber_sidebar_width');
    return saved ? Math.max(260, Math.min(650, parseInt(saved, 10))) : 340;
  });
  const [isResizingWidth, setIsResizingWidth] = React.useState(false);

  const [previewHeight, setPreviewHeight] = React.useState<number>(() => {
    const saved = localStorage.getItem('dubber_preview_height');
    return saved ? Math.max(180, Math.min(650, parseInt(saved, 10))) : 380;
  });
  const [isResizingHeight, setIsResizingHeight] = React.useState(false);

  useEffect(() => {
    localStorage.setItem('dubber_sidebar_width', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('dubber_preview_height', previewHeight.toString());
  }, [previewHeight]);

  useEffect(() => {
    if (isResizingWidth) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else if (isResizingHeight) {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingWidth, isResizingHeight]);

  const startWidthResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingWidth(true);
    const startX = e.clientX;
    const startW = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(260, Math.min(650, startW + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizingWidth(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startHeightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingHeight(true);
    const startY = e.clientY;
    const startH = previewHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(180, Math.min(650, startH + delta));
      setPreviewHeight(newHeight);
    };

    const onMouseUp = () => {
      setIsResizingHeight(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCardRef = useRef<HTMLDivElement>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = React.useState(1.0);

  // Active subtitle
  const currentSubtitle = useMemo(() => {
    return segments.find(
      (s) => currentTimeMs >= s.startMs && currentTimeMs < s.endMs
    );
  }, [segments, currentTimeMs]);

  useEffect(() => {
    if (currentSubtitle && currentSubtitle.id !== activeSegmentId) {
      setActiveSegmentId(currentSubtitle.id);
    }
  }, [currentSubtitle, activeSegmentId, setActiveSegmentId]);

  const videoSrc = useMemo(() => {
    if (!project) return undefined;
    if (audioTrackMode === 'dubbed' && masterDubbedVideoPath) {
      return convertFileSrc(masterDubbedVideoPath);
    }
    return convertFileSrc(project.videoPath);
  }, [project, masterDubbedVideoPath, audioTrackMode]);

  // Audio ducking / segment audio preview
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isAudioMuted) {
      video.muted = true;
      if (ttsAudioRef.current) ttsAudioRef.current.muted = true;
      return;
    }
    video.muted = false;

    if (audioTrackMode === 'original') {
      video.volume = volume;
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
    } else if (audioTrackMode === 'dubbed') {
      if (masterDubbedVideoPath) {
        video.volume = volume;
      } else {
        if (currentSubtitle && (currentSubtitle.ttsStretchedPath || currentSubtitle.ttsRawPath)) {
          video.volume = (project?.duckingVolume || 0.18) * volume;
          const audioPath = currentSubtitle.ttsStretchedPath || currentSubtitle.ttsRawPath;
          if (audioPath && ttsAudioRef.current) {
            const audio = ttsAudioRef.current;
            const ttsSrc = convertFileSrc(audioPath);
            const offsetSec = Math.max(0, (currentTimeMs - currentSubtitle.startMs) / 1000.0);
            if (audio.src !== ttsSrc) {
              audio.src = ttsSrc;
              audio.currentTime = offsetSec;
              if (isPlaying) {
                audio.play().catch(() => {});
              }
            } else {
              if (Math.abs(audio.currentTime - offsetSec) > 0.35) {
                audio.currentTime = offsetSec;
              }
              if (isPlaying && audio.paused) {
                audio.play().catch(() => {});
              } else if (!isPlaying && !audio.paused) {
                audio.pause();
              }
            }
          }
        } else {
          video.volume = volume;
          if (ttsAudioRef.current) ttsAudioRef.current.pause();
        }
      }
    }
  }, [audioTrackMode, currentSubtitle, masterDubbedVideoPath, currentTimeMs, isPlaying, project, isAudioMuted, volume]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTimeMs(Math.round(videoRef.current.currentTime * 1000));
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDurationMs(Math.round(videoRef.current.duration * 1000));
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) {
      setIsPlaying(!isPlaying);
      return;
    }
    if (isPlaying) {
      videoRef.current.pause();
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTimeMs(0);
  };


  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const currentVideoMs = Math.round(video.currentTime * 1000);
    if (Math.abs(currentVideoMs - currentTimeMs) > 180) {
      video.currentTime = currentTimeMs / 1000.0;
    }
  }, [currentTimeMs]);

  // Load Video Handler (Real Tauri IPC)
  const handleLoadVideo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }],
      });

      if (selected && typeof selected === 'string') {
        setPipelineProgress({
          running: true,
          stage: 'Initializing Video',
          percent: 15,
          detail: 'Extracting audio streams from video with FFmpeg...',
        });

        const newProject = await invoke<ProjectConfig>('create_project', { videoPath: selected });
        setProject(newProject);
        setPipelineProgress({ running: false, stage: '', percent: 0, detail: '' });
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error loading video: ${err?.message || err}`);
      setPipelineProgress({ running: false });
    }
  };

  // Load BGM Handler
  const handleLoadBgm = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'flac', 'm4a'] }],
      });
      if (selected && typeof selected === 'string') {
        setBgmAudioPath(selected);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  // Load A1 Audio Handler (Real Tauri IPC)
  const handleLoadA1Audio = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'aac', 'flac'] }],
      });
      if (selected && typeof selected === 'string') {
        setA1AudioPath(selected);
        console.log(`Loaded external A1 audio track: ${selected.split(/[\\/]/).pop()}`);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  // Isolate BGM Handler (Real Tauri IPC Channel Execution)
  const handleIsolateBgm = async () => {
    const videoOrAudio = project?.videoPath || bgmAudioPath;
    if (!videoOrAudio) {
      alert('Please load a video or audio file first.');
      return;
    }

    try {
      setPipelineProgress({
        running: true,
        stage: 'UVR / Demucs Vocal Separation',
        percent: 20,
        detail: 'Starting vocal and instrumental track separation...',
      });

      const channel = new Channel<PipelineEvent>();
      channel.onmessage = (event) => {
        if (event.type === 'StageProgress') {
          setPipelineProgress({
            running: true,
            stage: event.stage,
            percent: event.percent,
            detail: event.detail,
          });
        }
      };

      const instrumentalPath = await invoke<string>('isolate_bgm', {
        videoPath: videoOrAudio,
        outputDir: null,
        channel,
      });

      setBgmAudioPath(instrumentalPath);
      if (!isBgmIsolated) toggleBgmIsolated();
      setPipelineProgress({
        running: false,
        stage: 'Isolation Complete',
        percent: 100,
        detail: 'Instrumental audio stem ready on track A2',
      });
    } catch (err: any) {
      console.error(err);
      alert(`BGM Isolation error: ${err?.message || err}`);
      setPipelineProgress({ running: false });
    }
  };

  const { projectName } = useStudioStore();
  const fileName = (project ? project.videoPath.split(/[\\/]/).pop() : null) || `${projectName}.mp4`;

  // Export SRT Handler (Real Tauri Save Dialog & IPC)
  const handleExportSrt = async () => {
    if (segments.length === 0) {
      alert('No subtitle segments to export.');
      return;
    }

    try {
      const defaultName = `${fileName.replace(/\.[^/.]+$/, '')}_${project?.targetLang || targetLang}.srt`;
      const savePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'SRT Subtitles', extensions: ['srt'] }],
      });

      if (savePath) {
        await invoke('export_srt_file', {
          segments,
          outputPath: savePath,
        });
        alert(`Subtitles exported successfully to:\n${savePath}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Export SRT error: ${err?.message || err}`);
    }
  };

  // Import SRT Handler (Real File Reading & Parsing)
  const handleImportSrt = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Subtitle Files', extensions: ['srt', 'vtt'] }],
      });
      if (selected && typeof selected === 'string') {
        const text = await readTextFile(selected);
        const parsed = parseSrtOrVtt(text, project?.defaultVoice || 'km-KH-PisethNeural');
        if (parsed.length > 0) {
          setSegments(parsed);
          alert(`Successfully imported ${parsed.length} subtitle segments!`);
        } else {
          alert('No valid subtitle cues found in file.');
        }
      }
    } catch (e: any) {
      console.error(e);
      alert(`Import error: ${e?.message || e}`);
    }
  };

  // Intro & Outro Handler
  const handleIntroOutro = () => {
    setIntroOutroOpen(true);
  };

  const formatTimecode = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const centis = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
  };

  const transformStyle = useMemo(() => {
    const transforms = [];
    if (videoTransform.flipH) transforms.push('scaleX(-1)');
    if (videoTransform.flipV) transforms.push('scaleY(-1)');
    if (videoTransform.rotate) transforms.push(`rotate(${videoTransform.rotate}deg)`);
    return transforms.length > 0 ? transforms.join(' ') : 'none';
  }, [videoTransform]);

  return (
    <aside 
      style={{ width: `${sidebarWidth}px` }}
      className="relative shrink-0 border-r border-slate-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-950 p-2.5 overflow-hidden select-none gap-2 transition-[width] duration-75 h-full"
    >
      {/* Right Edge Draggable Splitter Handle (Resize Sidebar & Video Width) */}
      <div
        onMouseDown={startWidthResize}
        className={`absolute top-0 right-0 w-2 h-full cursor-col-resize z-40 transition-colors group flex items-center justify-center hover:bg-indigo-500/30 active:bg-indigo-600 ${
          isResizingWidth ? 'bg-indigo-600/40' : 'bg-transparent'
        }`}
        title="ទាញចេញ/ទាញចូល ដើម្បីពង្រីក/បង្រួមទទឹងវីដេអូ (ចុច 2 ដងដើម្បី Reset)"
        onDoubleClick={() => setSidebarWidth(340)}
      >
        <div className={`w-0.5 h-12 rounded-full transition-colors ${isResizingWidth ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-zinc-700 group-hover:bg-indigo-400'}`} />
      </div>

      {/* Top Header: Video icon + filename (only shown when video is loaded) */}
      {project && (
        <div className="shrink-0 flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <Video className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
          <span className="truncate">{fileName}</span>
        </div>
      )}

      {/* Video Transform Toolbar */}
      <div className="shrink-0 relative bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-1 flex items-center justify-between shadow-xs text-slate-600 dark:text-zinc-400">
        <button
          onClick={() => updateVideoTransform({ flipH: !videoTransform.flipH })}
          className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all ${videoTransform.flipH ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400' : ''}`}
          title="Flip Horizontal"
        >
          <FlipHorizontal className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => updateVideoTransform({ flipV: !videoTransform.flipV })}
          className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all ${videoTransform.flipV ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400' : ''}`}
          title="Flip Vertical"
        >
          <FlipVertical className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            const ratios: Array<'9:16' | '16:9' | '1:1'> = ['9:16', '16:9', '1:1'];
            const nextRatio = ratios[(ratios.indexOf(aspectRatio) + 1) % ratios.length];
            setAspectRatio(nextRatio);
          }}
          className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all flex items-center gap-1 ${
            aspectRatio !== '9:16' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 font-bold' : ''
          }`}
          title={`Aspect Ratio: ${aspectRatio} (Click to switch 9:16, 16:9, 1:1)`}
        >
          <Crop className="w-3.5 h-3.5" />
          <span className="text-[9px] font-mono">{aspectRatio}</span>
        </button>

        <button
          onClick={() => updateVideoTransform({ rotate: (videoTransform.rotate + 90) % 360 })}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
          title="Rotate 90°"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        {/* Reset Transforms */}
        <button
          onClick={() => {
            updateVideoTransform({ flipH: false, flipV: false, rotate: 0 });
            setAspectRatio('9:16');
            setBrightness(100);
            setContrast(100);
            setSaturation(100);
          }}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          title="Reset Transforms (Flip, Rotate, Crop & Filters)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Filter Popover Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowFilterPopover(!showFilterPopover)}
            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all ${showFilterPopover ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400' : ''}`}
            title="Video Adjustments (Brightness, Contrast, Saturation)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {showFilterPopover && (
            <div className="absolute top-8 left-0 w-48 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl z-50 text-[11px] space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-zinc-200">
                <span>Color Grading</span>
                <button onClick={() => setShowFilterPopover(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Brightness:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{brightness}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 dark:bg-zinc-700 rounded cursor-pointer accent-indigo-600"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Contrast:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{contrast}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 dark:bg-zinc-700 rounded cursor-pointer accent-indigo-600"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Saturation:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{saturation}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={saturation}
                  onChange={(e) => setSaturation(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 dark:bg-zinc-700 rounded cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Subtitle Style Popover Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowStylePopover(!showStylePopover)}
            className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all ${showStylePopover ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400' : ''}`}
            title="Subtitle Typography Style"
          >
            <Type className="w-3.5 h-3.5" />
          </button>

          {showStylePopover && (
            <div className="absolute top-8 right-0 w-52 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl z-50 text-[11px] space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-zinc-200">
                <span>Subtitle Style & Font</span>
                <button onClick={() => setShowStylePopover(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              {/* Font Size */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Font Size:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">{subFontSize}px</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={28}
                  value={subFontSize}
                  onChange={(e) => setSubFontSize(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 dark:bg-zinc-700 rounded cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Font Color Picker */}
              <div className="space-y-1">
                <span className="text-slate-500 text-[10px]">Text Color</span>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {['#ffffff', '#fde047', '#38bdf8', '#4ade80', '#f43f5e'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSubFontColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                        subFontColor === c ? 'scale-110 ring-2 ring-indigo-500 border-white' : 'border-slate-300 dark:border-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Background Color Picker */}
              <div className="space-y-1">
                <span className="text-slate-500 text-[10px]">Background Box</span>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {[
                    { label: 'Dark', val: 'rgba(0, 0, 0, 0.75)' },
                    { label: 'Indigo', val: 'rgba(30, 27, 75, 0.85)' },
                    { label: 'Clear', val: 'transparent' },
                    { label: 'Solid', val: '#000000' },
                  ].map((bg) => (
                    <button
                      key={bg.label}
                      onClick={() => setSubBgColor(bg.val)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${
                        subBgColor === bg.val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Glow Color */}
              <div className="space-y-1">
                <span className="text-slate-500 text-[10px]">Glow Shadow Color</span>
                <div className="flex gap-1.5 pt-0.5">
                  {['#6366f1', '#a855f7', '#f59e0b', '#06b6d4', '#10b981'].map((g) => (
                    <button
                      key={g}
                      onClick={() => setSubGlowColor(g)}
                      style={{ backgroundColor: g }}
                      className={`w-4 h-4 rounded-full border cursor-pointer ${
                        subGlowColor === g ? 'ring-2 ring-indigo-500 scale-110 border-white' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => updateVideoTransform({ pip: !videoTransform.pip })}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
          title="Picture in Picture"
        >
          <PictureInPicture className="w-3.5 h-3.5" />
        </button>

        {/* Quick Expand / Compact Toggle (ទាញចេញ/ទាញចូល) */}
        <button
          onClick={() => {
            if (sidebarWidth > 380 || previewHeight > 420) {
              setSidebarWidth(300);
              setPreviewHeight(280);
            } else {
              setSidebarWidth(460);
              setPreviewHeight(480);
            }
          }}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 active:scale-95 transition-all text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          title={sidebarWidth > 380 || previewHeight > 420 ? 'បង្រួមតូច (Compact)' : 'ពង្រីកធំ (Expand)'}
        >
          {sidebarWidth > 380 || previewHeight > 420 ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 9:16 Portrait Video Player Container */}
      <div 
        ref={videoCardRef}
        onMouseMove={(e) => {
          if (isDraggingSub && videoCardRef.current) {
            const rect = videoCardRef.current.getBoundingClientRect();
            let px = ((e.clientX - rect.left) / rect.width) * 100;
            let py = ((e.clientY - rect.top) / rect.height) * 100;

            // Snap to horizontal center if within 4%
            if (Math.abs(px - 50) < 4) {
              px = 50;
              setIsNearCenterX(true);
            } else {
              setIsNearCenterX(false);
            }

            // Snap to vertical center if within 4%
            if (Math.abs(py - 50) < 4) {
              py = 50;
              setIsNearCenterY(true);
            } else {
              setIsNearCenterY(false);
            }

            setSubPos({ x: Math.max(10, Math.min(90, px)), y: Math.max(10, Math.min(90, py)) });
          } else if (draggingMaskId && maskDragStart && videoCardRef.current) {
            const rect = videoCardRef.current.getBoundingClientRect();
            const deltaX = ((e.clientX - maskDragStart.x) / rect.width) * 100;
            const deltaY = ((e.clientY - maskDragStart.y) / rect.height) * 100;
            const targetMask = blurMasks.find((m) => m.id === draggingMaskId);
            if (targetMask) {
              const newX = Math.max(0, Math.min(100 - targetMask.width, maskDragStart.initialX + deltaX));
              const newY = Math.max(0, Math.min(100 - targetMask.height, maskDragStart.initialY + deltaY));
              updateBlurMask(draggingMaskId, { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
            }
          }
        }}
        onMouseUp={() => {
          setIsDraggingSub(false);
          setIsNearCenterX(false);
          setIsNearCenterY(false);
          setDraggingMaskId(null);
          setMaskDragStart(null);
        }}
        style={{
          maxHeight: `${previewHeight}px`,
          height: aspectRatio === '9:16' ? `${previewHeight}px` : undefined,
        }}
        className={`shrink-0 bg-zinc-950 rounded-2xl overflow-hidden mx-auto w-full relative flex items-center justify-center border border-slate-300 dark:border-zinc-800 shadow-xl group select-none transition-all duration-75 ${
          aspectRatio === '9:16' ? 'aspect-[9/16]' : aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-square'
        }`}
      >
        {/* Center vertical alignment dashed guideline (Image 2 style) */}
        {project && (
          <div className="absolute top-[20%] bottom-[20%] left-1/2 -translate-x-1/2 w-0 border-l border-dashed border-rose-500/80 pointer-events-none z-20" />
        )}

        {/* Animated Snap Alignment Lines on Drag */}
        {isNearCenterX && (
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] border-l border-dashed border-sky-400 pointer-events-none z-30 shadow-xs" />
        )}
        {isNearCenterY && (
          <div className="absolute left-0 right-0 top-1/2 h-[1px] border-t border-dashed border-sky-400 pointer-events-none z-30 shadow-xs" />
        )}

        {project ? (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
              onClick={togglePlay}
              style={{
                transform: transformStyle,
                filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
              }}
              className="w-full h-full object-cover cursor-pointer transition-transform duration-200 absolute inset-0 z-0 bg-black"
            />
            <audio ref={ttsAudioRef} className="hidden" />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-5 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-zinc-900 dark:to-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
              <Video className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">Your preview starts here</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-4">Load a video to build your dubbing project.</p>
            <button
              onClick={handleLoadVideo}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Choose video
            </button>
          </div>
        )}

        {/* v10.5 Subtitle Covering & Blur Mask Layer */}
        {blurMasks.filter(m => m.enabled).map((mask) => (
          <div
            key={mask.id}
            style={{
              left: `${mask.x}%`,
              top: `${mask.y}%`,
              width: `${mask.width}%`,
              height: `${mask.height}%`,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDraggingMaskId(mask.id);
              setMaskDragStart({
                x: e.clientX,
                y: e.clientY,
                initialX: mask.x,
                initialY: mask.y,
              });
            }}
            className="absolute z-20 pointer-events-auto border-2 border-indigo-500/80 rounded-md overflow-hidden flex items-center justify-center cursor-move"
          >
            {/* Mask Backdrop (Blur / Pixelate / Solid) */}
            <div
              className={`w-full h-full ${
                mask.type === 'solid'
                  ? 'bg-black'
                  : mask.type === 'pixelate'
                  ? 'backdrop-pixelate bg-black/40'
                  : 'backdrop-blur-md bg-black/25'
              }`}
              style={mask.type === 'blur' ? { backdropFilter: `blur(${blurIntensity}px)` } : undefined}
            />

            {/* Corner Resize Handles */}
            <span className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-xs pointer-events-none" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-xs pointer-events-none" />
            <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-xs pointer-events-none" />
            <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-indigo-600 rounded-xs pointer-events-none" />

            {/* Floating Top Mini Toolbar (v10.5 Style) */}
            {showBlurToolbar && (
              <div 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 shadow-xl text-[10px] font-bold text-slate-800 dark:text-zinc-100 whitespace-nowrap z-30"
              >
                <button
                  onClick={() => {
                    setActiveBlurType('blur');
                    updateBlurMask(mask.id, { type: 'blur' });
                  }}
                  className={`px-1.5 py-0.5 rounded transition-colors ${mask.type === 'blur' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300'}`}
                >
                  Blur
                </button>
                <input
                  type="range"
                  min={4}
                  max={30}
                  value={blurIntensity}
                  onChange={(e) => setBlurIntensity(Number(e.target.value))}
                  className="w-12 h-1 accent-indigo-600 cursor-pointer"
                  title="Blur Intensity"
                />
                <button
                  onClick={() => {
                    setActiveBlurType('solid');
                    updateBlurMask(mask.id, { type: 'solid' });
                  }}
                  className={`px-1.5 py-0.5 rounded transition-colors ${mask.type === 'solid' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300'}`}
                >
                  Solid
                </button>
                <div className="w-[1px] h-3 bg-slate-200 dark:bg-zinc-700 mx-0.5" />
                <button
                  onClick={() => removeBlurMask(mask.id)}
                  className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                  title="Delete Censor Mask"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setShowBlurToolbar(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 px-0.5"
                  title="Hide Toolbar"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Burned Khmer Subtitle Overlay Preview with Draggable Box & Snap Alignment */}
        {videoTransform.showSubs && (currentSubtitle || segments[0]) && (
          <div 
            style={{
              left: `${subPos.x}%`,
              top: `${subPos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDraggingSub(true);
            }}
            className="absolute flex flex-col items-center justify-center pointer-events-auto z-10 px-1 cursor-grab active:cursor-grabbing w-full max-w-[92%]"
          >
            <div 
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
              }}
              className={`w-full px-3 py-1.5 rounded-xl backdrop-blur-xs border border-white/10 text-center shadow-2xl transition-all ${
                isDraggingSub ? 'border-sky-400 ring-2 ring-sky-400/30' : 'hover:border-white/20'
              }`}
            >
              <p 
                className="font-extrabold leading-snug font-sans tracking-wide text-white text-[13px]"
                style={{
                  textShadow: '0 0 10px rgba(99, 102, 241, 0.5), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                }}
              >
                {(currentSubtitle || segments[0])?.translatedText || (currentSubtitle || segments[0])?.originalText}
              </p>
              {(currentSubtitle || segments[0])?.originalText && (
                <p className="text-zinc-300 text-[10px] mt-0.5 opacity-90 font-medium truncate max-w-[220px] mx-auto">
                  {(currentSubtitle || segments[0])?.originalText}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Playback Transport Card */}
      <div className="shrink-0 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 shadow-xs space-y-2.5">
        {/* Timecode display & Progress Bar */}
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="font-bold text-indigo-600 dark:text-indigo-400">
            {formatTimecode(currentTimeMs)}
          </span>
          <span className="text-slate-400 dark:text-zinc-500">
            {formatTimecode(durationMs)}
          </span>
        </div>

        {/* Progress Slider */}
        <input
          type="range"
          min={0}
          max={durationMs || 1000}
          value={currentTimeMs}
          onChange={(e) => setCurrentTimeMs(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg cursor-pointer appearance-none"
        />

        {/* Controls Row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-sm transition-transform active:scale-95"
              title="Play / Pause"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <button
              onClick={handleStop}
              className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center justify-center transition-colors"
              title="Stop"
            >
              <Square className="w-3 h-3 fill-rose-600 dark:fill-rose-400" />
            </button>

            <button
              onClick={() => updateVideoTransform({ showSubs: !videoTransform.showSubs })}
              className={`px-2 py-1 rounded-md text-xs font-bold border transition-colors ${videoTransform.showSubs ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-400' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-zinc-800 dark:border-zinc-700'}`}
              title="Toggle Subtitle Visibility"
            >
              CC
            </button>
          </div>

          {/* Volume Slider & Mute Toggle */}
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (isAudioMuted) toggleAudioMuted();
              }}
              className="w-16 h-1 bg-slate-200 dark:bg-zinc-800 rounded cursor-pointer"
            />

            <button
              onClick={toggleAudioMuted}
              className={`p-1 rounded-md text-xs transition-colors ${isAudioMuted ? 'text-rose-500' : 'text-slate-500 dark:text-zinc-400'}`}
              title="Toggle Mute"
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Height Resize Splitter Handle under Video Player / Transport (ទាញចុះក្រោម/ឡើងលើ) */}
      <div
        onMouseDown={startHeightResize}
        className={`shrink-0 h-3 -my-0.5 w-full cursor-row-resize flex items-center justify-center group hover:bg-indigo-500/15 active:bg-indigo-600 transition-colors select-none py-0.5 ${
          isResizingHeight ? 'bg-indigo-500/25' : ''
        }`}
        title="ទាញចុះក្រោម/ឡើងលើ ដើម្បីពង្រីក/បង្រួមកម្ពស់វីដេអូ (ចុច 2 ដងដើម្បី Reset)"
        onDoubleClick={() => setPreviewHeight(380)}
      >
        <div className={`w-12 h-1 rounded-full transition-colors ${isResizingHeight ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-zinc-700 group-hover:bg-indigo-400'}`} />
      </div>

      {/* Scrollable Workspace Tools Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1 -mr-0.5 mt-0.5 pb-2">
        <div className="sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xs py-0.5 z-10 flex items-center justify-between px-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          <div className="flex items-center gap-1.5">
            <LayoutGrid className="w-3 h-3 text-indigo-500" />
            <span>Workspace Tools</span>
          </div>
          <span className="text-[8px] font-medium text-slate-400 dark:text-zinc-600 lowercase">8 tools</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {/* 1. Load Video */}
          <button
            onClick={handleLoadVideo}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white/90 hover:bg-indigo-50/40 dark:bg-zinc-900/90 dark:hover:bg-indigo-950/30 border border-slate-200/90 dark:border-zinc-800/90 hover:border-indigo-300 dark:hover:border-indigo-700/60 text-slate-700 dark:text-zinc-200 transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center"
          >
            <Video className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mb-0.5 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold text-[10px] text-slate-800 dark:text-zinc-100 leading-tight">Load Video</span>
            <span className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium truncate max-w-[95px] leading-tight mt-0.5">
              {project ? (project.videoPath.split(/[\\/]/).pop() || 'Loaded') : 'MP4, MOV'}
            </span>
          </button>

          {/* 2. Load BGM */}
          <button
            onClick={handleLoadBgm}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white/90 hover:bg-purple-50/40 dark:bg-zinc-900/90 dark:hover:bg-purple-950/30 border border-slate-200/90 dark:border-zinc-800/90 hover:border-purple-300 dark:hover:border-purple-700/60 text-slate-700 dark:text-zinc-200 transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center"
          >
            <Music className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-0.5 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold text-[10px] text-slate-800 dark:text-zinc-100 leading-tight">{bgmAudioPath ? 'BGM Loaded' : 'Load BGM'}</span>
            <span className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium truncate max-w-[95px] leading-tight mt-0.5">
              {bgmAudioPath ? (bgmAudioPath.split(/[\\/]/).pop() || 'Active') : 'MP3, WAV'}
            </span>
          </button>

          {/* 3. Load A1 Audio */}
          <button
            onClick={handleLoadA1Audio}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white/90 hover:bg-emerald-50/40 dark:bg-zinc-900/90 dark:hover:bg-emerald-950/30 border border-slate-200/90 dark:border-zinc-800/90 hover:border-emerald-300 dark:hover:border-emerald-700/60 text-slate-700 dark:text-zinc-200 transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center"
          >
            <AudioWaveform className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-0.5 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold text-[10px] text-slate-800 dark:text-zinc-100 leading-tight">{a1AudioPath ? 'A1 Loaded' : 'Load A1'}</span>
            <span className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium truncate max-w-[95px] leading-tight mt-0.5">
              {a1AudioPath ? (a1AudioPath.split(/[\\/]/).pop() || 'Active') : 'Vocals / Stems'}
            </span>
          </button>

          {/* 4. Isolate BGM */}
          <button
            onClick={handleIsolateBgm}
            className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center border ${
              isBgmIsolated
                ? 'bg-purple-600 text-white border-purple-600 shadow-purple-500/25 ring-1.5 ring-purple-400/40'
                : 'bg-white/90 hover:bg-purple-50/40 dark:bg-zinc-900/90 dark:hover:bg-purple-950/30 border-slate-200/90 dark:border-zinc-800/90 hover:border-purple-300 dark:hover:border-purple-700/60 text-slate-700 dark:text-zinc-200'
            }`}
          >
            <Wand2 className={`w-4 h-4 mb-0.5 group-hover:scale-110 transition-transform duration-200 ${isBgmIsolated ? 'text-white' : 'text-purple-500 dark:text-purple-400'}`} />
            <span className="font-bold text-[10px] leading-tight">{isBgmIsolated ? 'BGM Isolated' : 'Isolate BGM'}</span>
            <span className={`text-[8px] font-medium truncate max-w-[95px] leading-tight mt-0.5 ${isBgmIsolated ? 'text-purple-100' : 'text-slate-400 dark:text-zinc-500'}`}>
              {isBgmIsolated ? 'Track A2' : 'UVR / Demucs'}
            </span>
          </button>

          {/* 5. Audio Muted */}
          <button
            onClick={toggleAudioMuted}
            className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center border ${
              isAudioMuted
                ? 'bg-rose-500 text-white border-rose-500 shadow-rose-500/25 ring-1.5 ring-rose-400/40'
                : 'bg-white/90 hover:bg-rose-50/40 dark:bg-zinc-900/90 dark:hover:bg-rose-950/30 border-slate-200/90 dark:border-zinc-800/90 hover:border-rose-300 dark:hover:border-rose-700/60 text-slate-700 dark:text-zinc-200'
            }`}
          >
            <VolumeX className={`w-4 h-4 mb-0.5 group-hover:scale-110 transition-transform duration-200 ${isAudioMuted ? 'text-white' : 'text-rose-500 dark:text-rose-400'}`} />
            <span className="font-bold text-[10px] leading-tight">{isAudioMuted ? 'Audio Muted' : 'Audio Active'}</span>
            <span className={`text-[8px] font-medium leading-tight mt-0.5 ${isAudioMuted ? 'text-rose-100' : 'text-slate-400 dark:text-zinc-500'}`}>
              {isAudioMuted ? 'Muted' : 'Unmuted'}
            </span>
          </button>

          {/* 6. Export SRT */}
          <button
            onClick={handleExportSrt}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white/90 hover:bg-amber-50/40 dark:bg-zinc-900/90 dark:hover:bg-amber-950/30 border border-slate-200/90 dark:border-zinc-800/90 hover:border-amber-300 dark:hover:border-amber-700/60 text-slate-700 dark:text-zinc-200 transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center"
          >
            <FileUp className="w-4 h-4 text-amber-500 dark:text-amber-400 mb-0.5 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold text-[10px] text-slate-800 dark:text-zinc-100 leading-tight">Export SRT</span>
            <span className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium truncate max-w-[95px] leading-tight mt-0.5">Khmer Subtitles</span>
          </button>

          {/* 7. Import (SRT/VTT) */}
          <button
            onClick={handleImportSrt}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white/90 hover:bg-emerald-50/40 dark:bg-zinc-900/90 dark:hover:bg-emerald-950/30 border border-slate-200/90 dark:border-zinc-800/90 hover:border-emerald-300 dark:hover:border-emerald-700/60 text-slate-700 dark:text-zinc-200 transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center"
          >
            <FileDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-0.5 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold text-[10px] text-slate-800 dark:text-zinc-100 leading-tight">Import Subs</span>
            <span className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium truncate max-w-[95px] leading-tight mt-0.5">SRT / VTT</span>
          </button>

          {/* 8. Intro & Outro */}
          <button
            onClick={handleIntroOutro}
            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white/90 hover:bg-rose-50/40 dark:bg-zinc-900/90 dark:hover:bg-rose-950/30 border border-slate-200/90 dark:border-zinc-800/90 hover:border-rose-300 dark:hover:border-rose-700/60 text-slate-700 dark:text-zinc-200 transition-all duration-200 ease-out shadow-2xs group active:scale-[0.96] hover:-translate-y-0.5 hover:shadow-xs text-center"
          >
            <Clapperboard className="w-4 h-4 text-rose-500 dark:text-rose-400 mb-0.5 group-hover:scale-110 transition-transform duration-200" />
            <span className="font-bold text-[10px] text-slate-800 dark:text-zinc-100 leading-tight">Intro &amp; Outro</span>
            <span className="text-[8px] text-slate-400 dark:text-zinc-500 font-medium truncate max-w-[95px] leading-tight mt-0.5">Logo &amp; Music</span>
          </button>
        </div>

        {/* Action Buttons Below Grid */}
        <div className="space-y-1.5 pt-0.5">
          {/* Add / Toggle Blur Box (Censor) */}
          <button
            onClick={() => {
              const activeMask = blurMasks.find((m) => m.enabled);
              if (!activeMask) {
                addBlurMask({
                  id: `mask-${Date.now()}`,
                  x: 15,
                  y: 75,
                  width: 70,
                  height: 14,
                  type: activeBlurType,
                  enabled: true,
                });
                setShowBlurToolbar(true);
              } else {
                setShowBlurToolbar((prev) => !prev);
              }
            }}
            className="w-full py-1.5 px-2.5 rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 bg-white/80 hover:bg-slate-50 dark:bg-zinc-900/80 dark:hover:bg-zinc-850 text-slate-700 dark:text-zinc-300 font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition-all duration-200 shadow-2xs active:scale-[0.98] hover:border-indigo-400"
          >
            <Crop className="w-3 h-3 text-indigo-500" />
            <span>
              {blurMasks.some((m) => m.enabled)
                ? (showBlurToolbar ? 'Hide Blur Controls' : 'Show Blur Controls')
                : 'Add Blur Box (Censor)'}
            </span>
            {blurMasks.some((m) => m.enabled) && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            )}
          </button>

          {/* Project readiness */}
          {!project && (
            <div className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200/80 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-zinc-900/80 text-slate-500 dark:text-zinc-400 font-medium text-[10px] flex items-center justify-center gap-1.5">
              <Video className="w-3 h-3 text-slate-400" />
              <span>Load a video to get started</span>
            </div>
          )}

          {/* Final Render CTA Button */}
          {project && (
            <button
              onClick={() => setExportOpen(true)}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-sm shadow-indigo-500/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-1.5"
            >
              <Clapperboard className="w-3.5 h-3.5" />
              <span>Final Render</span>
            </button>
          )}

          {/* Clear All Data */}
          <button
            onClick={() => {
              if (confirm('Are you sure you want to clear all project data and segments?')) {
                useStudioStore.getState().setSegments([]);
                useStudioStore.getState().setProject(null);
              }
            }}
            className="w-full py-1 px-2.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600/90 dark:text-rose-400/90 font-semibold text-[10px] flex items-center justify-center gap-1.5 transition-colors duration-150"
          >
            <Trash2 className="w-2.5 h-2.5" />
            <span>Clear All Data</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
