import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { 
  DubSegment, 
  ProjectConfig, 
  ApiKeysConfig, 
  OrigAudioRange, 
  BlurMask, 
  SponsorBreak, 
  DdpPreset 
} from '../types/studio';

const LOCAL_STORAGE_KEY_KEYS = 'dubber_studio_api_keys';
const LOCAL_STORAGE_KEY_THEME = 'dubber_studio_theme';
const LOCAL_STORAGE_KEY_BADGE = 'dubber_studio_badge';
const LOCAL_STORAGE_KEY_LITE_MODE = 'dubber_studio_lite_mode';
const LOCAL_STORAGE_KEY_GEMINI_MODEL = 'dubber_studio_gemini_model';
const LOCAL_STORAGE_KEY_AUTO_SWITCH = 'dubber_studio_auto_switch';
const LOCAL_STORAGE_KEY_BACKUP_MODEL = 'dubber_studio_backup_model';
const LOCAL_STORAGE_KEY_READ_SCREEN_MODEL = 'dubber_studio_read_screen_model';
const LOCAL_STORAGE_KEY_TRANSCRIBE_MODEL = 'dubber_studio_transcribe_model';
const LOCAL_STORAGE_KEY_VOCAL_ENGINE = 'dubber_studio_vocal_engine';
const LOCAL_STORAGE_KEY_DEMUCS_PATH = 'dubber_studio_demucs_path';
const LOCAL_STORAGE_KEY_DEMUCS_SEGMENT = 'dubber_studio_demucs_segment';
const LOCAL_STORAGE_KEY_TRANSCRIPTION_ENGINE = 'dubber_studio_transcription_engine';
const LOCAL_STORAGE_KEY_WHISPER_PATH = 'dubber_studio_whisper_path';
const LOCAL_STORAGE_KEY_WHISPER_MODEL = 'dubber_studio_whisper_model';
const LOCAL_STORAGE_KEY_DEFAULT_GENDER = 'dubber_studio_default_gender';

function loadInitialApiKeys(): ApiKeysConfig {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_KEYS);
    if (saved) {
      const parsed = JSON.parse(saved) as ApiKeysConfig;
      // Early builds stored this UI status label as if it were an actual key.
      for (const key of ['geminiApiKey', 'openaiApiKey', 'elevenlabsApiKey', 'whisperApiKey', 'groqApiKey'] as const) {
        if (parsed[key] === 'active') parsed[key] = '';
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse saved API keys', e);
  }
  return {
    geminiApiKey: '',
    openaiApiKey: '',
    elevenlabsApiKey: '',
    whisperApiKey: '',
    groqApiKey: '',
    ollamaBaseUrl: 'http://localhost:11434',
  };
}

function loadInitialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY_THEME);
  if (saved === 'dark' || saved === 'light') {
    if (saved === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    return saved;
  }
  document.documentElement.classList.remove('dark');
  return 'light';
}

function loadInitialBadge(): string {
  return localStorage.getItem(LOCAL_STORAGE_KEY_BADGE) || '🔥 PRO';
}

function loadInitialLiteMode(): boolean {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY_LITE_MODE);
  const isLite = saved === 'true';
  if (isLite) {
    document.documentElement.classList.add('lite-mode');
  } else {
    document.documentElement.classList.remove('lite-mode');
  }
  return isLite;
}

interface VideoTransformState {
  flipH: boolean;
  flipV: boolean;
  rotate: number;
  showSubs: boolean;
  pip: boolean;
}

interface TimelineFxState {
  speed: number;
  volume: number;
  pitch: number;
  reverb: boolean;
}

interface WorkflowTogglesState {
  autoFit: boolean;
  crowd: boolean;
  syncEnd: boolean;
  ducking: boolean;
}

interface StudioState {
  theme: 'light' | 'dark';
  proBadge: string;
  projectName: string;
  project: ProjectConfig | null;
  segments: DubSegment[];
  undoStack: DubSegment[][];
  redoStack: DubSegment[][];
  selectedSegmentIds: string[];
  activeSegmentId: string | null;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  zoomPxPerSec: number;
  audioTrackMode: 'original' | 'dubbed' | 'split';
  apiKeys: ApiKeysConfig;
  pipelineRunning: boolean;
  pipelineStage: string;
  pipelinePercent: number;
  pipelineDetail: string;
  isSettingsOpen: boolean;
  isExportOpen: boolean;
  masterDubbedVideoPath: string | null;
  bgmAudioPath: string | null;
  a1AudioPath: string | null;
  introVideoPath: string | null;
  outroVideoPath: string | null;
  isIntroOutroOpen: boolean;
  isAudioMuted: boolean;
  isBgmIsolated: boolean;
  searchQuery: string;
  targetLang: string;

  // New Production Features
  origRanges: OrigAudioRange[];
  blurMasks: BlurMask[];
  sponsorBreaks: SponsorBreak[];
  presets: DdpPreset[];
  activePresetFolder: string;
  mascotMood: 'idle' | 'playing' | 'processing' | 'done' | 'error';
  mascotSpeech: string;
  systemRamPercent: number;

  // Modals
  isReadScreenOpen: boolean;
  isSplitModalOpen: boolean;
  isFindReplaceOpen: boolean;
  isPresetsModalOpen: boolean;
  isSponsorModalOpen: boolean;
  isDaiRecapOpen: boolean;
  isAppTourOpen: boolean;
  isMixerOpen: boolean;

  videoTransform: VideoTransformState;
  timelineFx: TimelineFxState;
  workflowToggles: WorkflowTogglesState;

  badgeStyle: 'flame' | 'neon' | 'royal' | 'slate';
  headerActionOrder: string[];
  toggleTheme: () => void;
  setProBadge: (badge: string) => void;
  setBadgeStyle: (style: 'flame' | 'neon' | 'royal' | 'slate') => void;
  setHeaderActionOrder: (order: string[]) => void;
  setProjectName: (name: string) => void;
  toggleAudioMuted: () => void;
  toggleBgmIsolated: () => void;
  setProject: (project: ProjectConfig | null) => void;
  updateProjectConfig: (updates: Partial<ProjectConfig>) => void;
  setSegments: (segments: DubSegment[]) => void;
  undoSegments: () => void;
  redoSegments: () => void;
  updateSegment: (segment: DubSegment) => void;
  updateSegmentPartial: (id: string, updates: Partial<DubSegment>) => void;
  setActiveSegmentId: (id: string | null) => void;
  toggleSelectSegment: (id: string) => void;
  toggleSelectAllSegments: () => void;
  setSelectedVoiceForSelectedSegments: (voiceId: string) => void;
  addSegment: () => void;
  deleteSelectedSegments: () => void;
  splitActiveSegment: () => void;
  setSearchQuery: (query: string) => void;
  setTargetLang: (lang: string) => void;
  setBgmAudioPath: (path: string | null) => void;
  setA1AudioPath: (path: string | null) => void;
  setIntroVideoPath: (path: string | null) => void;
  setOutroVideoPath: (path: string | null) => void;
  setIntroOutroOpen: (open: boolean) => void;
  updateVideoTransform: (updates: Partial<VideoTransformState>) => void;
  updateTimelineFx: (updates: Partial<TimelineFxState>) => void;
  updateWorkflowToggles: (updates: Partial<WorkflowTogglesState>) => void;

  // Orig Ranges & Masks
  addOrigRange: (range: OrigAudioRange) => void;
  removeOrigRange: (id: string) => void;
  updateOrigRange: (id: string, updates: Partial<OrigAudioRange>) => void;
  setBlurMasks: (masks: BlurMask[]) => void;
  addBlurMask: (mask: BlurMask) => void;
  removeBlurMask: (id: string) => void;
  updateBlurMask: (id: string, updates: Partial<BlurMask>) => void;
  setSponsorBreaks: (breaks: SponsorBreak[]) => void;

  // Modal Open/Close Setters
  setReadScreenOpen: (open: boolean) => void;
  setSplitModalOpen: (open: boolean) => void;
  setFindReplaceOpen: (open: boolean) => void;
  setPresetsModalOpen: (open: boolean) => void;
  setSponsorModalOpen: (open: boolean) => void;
  setDaiRecapOpen: (open: boolean) => void;
  setAppTourOpen: (open: boolean) => void;
  setMixerOpen: (open: boolean) => void;
  setMascotMood: (mood: 'idle' | 'playing' | 'processing' | 'done' | 'error', speech?: string) => void;
  setSystemRamPercent: (pct: number) => void;

  setCurrentTimeMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoomPxPerSec: (zoom: number) => void;
  setAudioTrackMode: (mode: 'original' | 'dubbed' | 'split') => void;
  isVaultProtected: boolean;
  initSecureVault: () => Promise<void>;
  setApiKeys: (keys: Partial<ApiKeysConfig>) => void;
  setPipelineProgress: (progress: { running: boolean; stage?: string; percent?: number; detail?: string }) => void;
  setSettingsOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setMasterDubbedVideoPath: (path: string | null) => void;
  preferencesActiveTab: string;
  setPreferencesActiveTab: (tab: string) => void;

  // General & Model Preferences (Screen Recording Module)
  liteMode: boolean;
  setLiteMode: (enabled: boolean) => void;
  geminiAiModel: string;
  setGeminiAiModel: (model: string) => void;
  autoSwitchModel: boolean;
  setAutoSwitchModel: (enabled: boolean) => void;
  backupModel: string;
  setBackupModel: (model: string) => void;
  readScreenModel: string;
  setReadScreenModel: (model: string) => void;
  transcribeModel: string;
  setTranscribeModel: (model: string) => void;

  // Vocal Removal Engine Preferences
  vocalRemovalEngine: 'spleeter' | 'demucs';
  setVocalRemovalEngine: (engine: 'spleeter' | 'demucs') => void;
  demucsFolderPath: string;
  setDemucsFolderPath: (path: string) => void;
  demucsSegmentSize: number;
  setDemucsSegmentSize: (size: number) => void;

  // Transcription Engine Preferences
  transcriptionEngine: 'direct' | 'whisper' | 'gemini_cast';
  setTranscriptionEngine: (engine: 'direct' | 'whisper' | 'gemini_cast') => void;
  whisperFolderPath: string;
  setWhisperFolderPath: (path: string) => void;
  selectedWhisperModel: string;
  setSelectedWhisperModel: (model: string) => void;
  defaultGender: 'auto' | 'male' | 'female';
  setDefaultGender: (gender: 'auto' | 'male' | 'female') => void;

  resetToEmptyState: () => void;
}

let lastSegmentHistoryAt = 0;

function withSegmentHistory(
  state: StudioState,
  segments: DubSegment[],
  extra: Partial<StudioState> = {},
): Partial<StudioState> {
  if (segments === state.segments) return extra;
  const now = Date.now();
  const undoStack = now - lastSegmentHistoryAt > 500
    ? [...state.undoStack, state.segments].slice(-100)
    : state.undoStack;
  lastSegmentHistoryAt = now;
  return { ...extra, segments, undoStack, redoStack: [] };
}

export const useStudioStore = create<StudioState>((set) => ({
  theme: loadInitialTheme(),
  proBadge: loadInitialBadge(),
  badgeStyle: 'flame',
  headerActionOrder: ['folder', 'undo', 'redo', 'mixer', 'recap', 'export', 'lang', 'theme', 'tour', 'settings'],
  projectName: 'Untitled_Project',
  project: null,
  segments: [],
  undoStack: [],
  redoStack: [],
  selectedSegmentIds: [],
  activeSegmentId: null,
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  zoomPxPerSec: 380,
  audioTrackMode: 'dubbed',
  apiKeys: loadInitialApiKeys(),
  pipelineRunning: false,
  pipelineStage: '',
  pipelinePercent: 0,
  pipelineDetail: '',
  isSettingsOpen: false,
  isExportOpen: false,
  masterDubbedVideoPath: null,
  bgmAudioPath: null,
  a1AudioPath: null,
  introVideoPath: null,
  outroVideoPath: null,
  isIntroOutroOpen: false,
  isAudioMuted: false,
  isBgmIsolated: false,
  searchQuery: '',
  targetLang: 'km-KH',

  origRanges: [],
  blurMasks: [
    {
      id: 'default-mask',
      x: 10,
      y: 78,
      width: 80,
      height: 12,
      type: 'blur',
      enabled: false,
    }
  ],
  sponsorBreaks: [],
  presets: [
    {
      id: 'pre-1',
      name: 'Khmer Drama Standard',
      folder: 'Drama',
      description: 'Dual-cast (Piseth & Sreymom) balanced audio ducking',
      defaultVoice: 'km-KH-PisethNeural',
      targetLang: 'km-KH',
      speedRatio: 1.05,
      createdAt: '2026-10-15',
    },
    {
      id: 'pre-2',
      name: 'Action Anime Fast-Paced',
      folder: 'Anime',
      description: 'Dynamic time-stretched vocal sync with 1.15x tempo',
      defaultVoice: 'km-KH-PisethNeural',
      targetLang: 'km-KH',
      speedRatio: 1.15,
      createdAt: '2026-10-16',
    }
  ],
  activePresetFolder: 'All',
  mascotMood: 'idle',
  mascotSpeech: 'Meh.',
  systemRamPercent: 52,

  isReadScreenOpen: false,
  isSplitModalOpen: false,
  isFindReplaceOpen: false,
  isPresetsModalOpen: false,
  isSponsorModalOpen: false,
  isDaiRecapOpen: false,
  isAppTourOpen: false,
  isMixerOpen: false,

  videoTransform: {
    flipH: false,
    flipV: false,
    rotate: 0,
    showSubs: true,
    pip: false,
  },

  timelineFx: {
    speed: 1.0,
    volume: 1.0,
    pitch: 0,
    reverb: false,
  },

  workflowToggles: {
    autoFit: true,
    crowd: false,
    syncEnd: true,
    ducking: true,
  },

  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_THEME, nextTheme);
      return { theme: nextTheme };
    }),

  toggleAudioMuted: () => set((state) => ({ isAudioMuted: !state.isAudioMuted })),
  toggleBgmIsolated: () => set((state) => ({ isBgmIsolated: !state.isBgmIsolated })),

  setProject: (project) => {
    lastSegmentHistoryAt = 0;
    set({
      project,
      segments: [],
      undoStack: [],
      redoStack: [],
      selectedSegmentIds: [],
      activeSegmentId: null,
      currentTimeMs: 0,
      durationMs: 0,
      isPlaying: false,
      isAudioMuted: false,
      masterDubbedVideoPath: null,
      bgmAudioPath: null,
      a1AudioPath: null,
      introVideoPath: null,
      outroVideoPath: null,
      origRanges: [],
      sponsorBreaks: [],
      searchQuery: '',
      isBgmIsolated: false,
    });
  },

  updateProjectConfig: (updates) =>
    set((state) => ({
      project: state.project ? { ...state.project, ...updates } : null,
    })),

  setSegments: (segments) => set((state) => withSegmentHistory(state, segments, {
    selectedSegmentIds: state.selectedSegmentIds.filter((id) => segments.some((segment) => segment.id === id)),
    activeSegmentId: segments.some((segment) => segment.id === state.activeSegmentId)
      ? state.activeSegmentId
      : segments[0]?.id ?? null,
  })),

  undoSegments: () => set((state) => {
    const previous = state.undoStack[state.undoStack.length - 1];
    if (!previous) return state;
    lastSegmentHistoryAt = 0;
    return {
      segments: previous,
      activeSegmentId: previous.some((segment) => segment.id === state.activeSegmentId)
        ? state.activeSegmentId
        : previous[0]?.id ?? null,
      selectedSegmentIds: state.selectedSegmentIds.filter((id) => previous.some((segment) => segment.id === id)),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, state.segments].slice(-100),
    };
  }),

  redoSegments: () => set((state) => {
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next) return state;
    lastSegmentHistoryAt = 0;
    return {
      segments: next,
      activeSegmentId: next.some((segment) => segment.id === state.activeSegmentId)
        ? state.activeSegmentId
        : next[0]?.id ?? null,
      selectedSegmentIds: state.selectedSegmentIds.filter((id) => next.some((segment) => segment.id === id)),
      undoStack: [...state.undoStack, state.segments].slice(-100),
      redoStack: state.redoStack.slice(0, -1),
    };
  }),

  updateSegment: (segment) =>
    set((state) => withSegmentHistory(
      state,
      state.segments.map((s) => (s.id === segment.id ? segment : s)),
    )),

  updateSegmentPartial: (id, updates) =>
    set((state) => withSegmentHistory(state, state.segments.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, ...updates };
        const textOrVoiceChanged =
          (updates.translatedText !== undefined && updates.translatedText !== s.translatedText) ||
          (updates.voiceId !== undefined && updates.voiceId !== s.voiceId);
        const timingChanged = updates.startMs !== undefined || updates.endMs !== undefined;
        if (textOrVoiceChanged) {
          updated.ttsRawPath = null;
          updated.ttsStretchedPath = null;
          updated.ttsDurationMs = null;
          updated.speedRatio = 1;
          updated.status = 'translated';
          updated.errorMessage = null;
        } else if (timingChanged && updated.ttsDurationMs) {
          updated.ttsStretchedPath = null;
          updated.status = 'translated';
          updated.errorMessage = null;
        }
        if ((updates.startMs !== undefined || updates.endMs !== undefined) && updated.ttsDurationMs) {
          const windowMs = updated.endMs - updated.startMs;
          if (windowMs > 0) {
            updated.speedRatio = updated.ttsDurationMs / windowMs;
          }
        }
        return updated;
      }))),

  setActiveSegmentId: (id) => set({ activeSegmentId: id }),

  toggleSelectSegment: (id) =>
    set((state) => ({
      selectedSegmentIds: state.selectedSegmentIds.includes(id)
        ? state.selectedSegmentIds.filter((item) => item !== id)
        : [...state.selectedSegmentIds, id],
    })),

  toggleSelectAllSegments: () =>
    set((state) => ({
      selectedSegmentIds:
        state.selectedSegmentIds.length === state.segments.length
          ? []
          : state.segments.map((s) => s.id),
    })),

  setSelectedVoiceForSelectedSegments: (voiceId) =>
    set((state) => withSegmentHistory(state, state.segments.map((s) =>
        state.selectedSegmentIds.includes(s.id) ? { ...s, voiceId } : s
      ))),

  addSegment: () =>
    set((state) => {
      const curMs = state.currentTimeMs;
      const endMs = curMs + 3000;
      const newSeg: DubSegment = {
        id: crypto.randomUUID ? crypto.randomUUID() : `seg-${Date.now()}`,
        index: state.segments.length,
        startMs: curMs,
        endMs,
        speaker: 'Speaker 1',
        voiceId: state.project?.defaultVoice || 'km-KH-PisethNeural',
        originalText: 'New Dialog...',
        translatedText: 'ឃ្លាសន្ទនាថ្មី...',
        speedRatio: 1.0,
        status: 'pending',
      };
      return withSegmentHistory(state, [...state.segments, newSeg], {
        activeSegmentId: newSeg.id,
      });
    }),

  deleteSelectedSegments: () =>
    set((state) => {
      const idsToDelete = state.selectedSegmentIds.length > 0
        ? new Set(state.selectedSegmentIds)
        : (state.activeSegmentId ? new Set([state.activeSegmentId]) : new Set<string>());

      const remaining = state.segments.filter((s) => !idsToDelete.has(s.id));
      return withSegmentHistory(state, remaining.map((s, idx) => ({ ...s, index: idx })), {
        selectedSegmentIds: [],
        activeSegmentId: remaining[0]?.id || null,
      });
    }),

  splitActiveSegment: () =>
    set((state) => {
      if (!state.activeSegmentId) return state;
      const active = state.segments.find((s) => s.id === state.activeSegmentId);
      if (!active) return state;
      const curTime = state.currentTimeMs;
      if (curTime <= active.startMs || curTime >= active.endMs) return state;

      const part1: DubSegment = {
        ...active,
        endMs: curTime,
      };
      const part2: DubSegment = {
        ...active,
        id: crypto.randomUUID ? crypto.randomUUID() : `seg-${Date.now()}`,
        startMs: curTime,
        originalText: '(part 2)',
        translatedText: '(ផ្នែកទី ២)',
      };

      const newSegments: DubSegment[] = [];
      for (const seg of state.segments) {
        if (seg.id === active.id) {
          newSegments.push(part1);
          newSegments.push(part2);
        } else {
          newSegments.push(seg);
        }
      }

      return withSegmentHistory(state, newSegments.map((s, i) => ({ ...s, index: i })), {
        activeSegmentId: part2.id,
      });
    }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setBgmAudioPath: (bgmAudioPath) => set({ bgmAudioPath }),
  setA1AudioPath: (a1AudioPath) => set({ a1AudioPath }),
  setIntroVideoPath: (introVideoPath) => set({ introVideoPath }),
  setOutroVideoPath: (outroVideoPath) => set({ outroVideoPath }),
  setIntroOutroOpen: (isIntroOutroOpen) => set({ isIntroOutroOpen }),

  updateVideoTransform: (updates) =>
    set((state) => ({
      videoTransform: { ...state.videoTransform, ...updates },
    })),

  updateTimelineFx: (updates) =>
    set((state) => ({
      timelineFx: { ...state.timelineFx, ...updates },
    })),

  updateWorkflowToggles: (updates) =>
    set((state) => ({
      workflowToggles: { ...state.workflowToggles, ...updates },
    })),

  setCurrentTimeMs: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  setDurationMs: (ms) => set({ durationMs: Math.max(0, ms) }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setZoomPxPerSec: (zoomPxPerSec) => set({ zoomPxPerSec: Math.max(20, Math.min(250, zoomPxPerSec)) }),
  setAudioTrackMode: (audioTrackMode) => set({ audioTrackMode }),

  isVaultProtected: false,

  initSecureVault: async () => {
    try {
      const vaultKeys = await invoke<ApiKeysConfig>('load_secure_keys');
      if (vaultKeys && (vaultKeys.geminiApiKey || vaultKeys.openaiApiKey || vaultKeys.groqApiKey || vaultKeys.elevenlabsApiKey)) {
        set({ apiKeys: vaultKeys, isVaultProtected: true });
        localStorage.removeItem(LOCAL_STORAGE_KEY_KEYS);
        localStorage.removeItem('dubber_studio_cuda_keys');
        return;
      }
      const legacyRaw = localStorage.getItem(LOCAL_STORAGE_KEY_KEYS);
      if (legacyRaw) {
        const legacyKeys = JSON.parse(legacyRaw) as ApiKeysConfig;
        if (legacyKeys && (legacyKeys.geminiApiKey || legacyKeys.openaiApiKey || legacyKeys.groqApiKey || legacyKeys.elevenlabsApiKey)) {
          await invoke('save_secure_keys', { keys: legacyKeys });
          set({ apiKeys: legacyKeys, isVaultProtected: true });
          localStorage.removeItem(LOCAL_STORAGE_KEY_KEYS);
          localStorage.removeItem('dubber_studio_cuda_keys');
          return;
        }
      }
      set({ isVaultProtected: true });
    } catch (e) {
      console.warn('Windows Vault unavailable, running in local memory mode:', e);
    }
  },

  setApiKeys: (newKeys) =>
    set((state) => {
      const merged = { ...state.apiKeys, ...newKeys };
      invoke('save_secure_keys', { keys: merged }).catch((e) => {
        console.error('Failed to save to Windows Credential Vault:', e);
      });
      localStorage.removeItem(LOCAL_STORAGE_KEY_KEYS);
      localStorage.removeItem('dubber_studio_cuda_keys');
      return { apiKeys: merged, isVaultProtected: true };
    }),

  setPipelineProgress: ({ running, stage, percent, detail }) =>
    set((state) => ({
      pipelineRunning: running,
      pipelineStage: stage !== undefined ? stage : running ? state.pipelineStage : '',
      pipelinePercent: percent !== undefined ? percent : running ? state.pipelinePercent : 0,
      pipelineDetail: detail !== undefined ? detail : running ? state.pipelineDetail : '',
    })),

  setProBadge: (proBadge) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_BADGE, proBadge);
    } catch (e) {
      console.error(e);
    }
    set({ proBadge });
  },
  setBadgeStyle: (badgeStyle) => set({ badgeStyle }),
  setHeaderActionOrder: (headerActionOrder) => set({ headerActionOrder }),
  setProjectName: (projectName) => set({ projectName }),
  setTargetLang: (targetLang) => set((state) => ({
    targetLang,
    project: state.project ? { ...state.project, targetLang } : null,
  })),

  addOrigRange: (range) =>
    set((state) => ({ origRanges: [...state.origRanges, range] })),
  removeOrigRange: (id) =>
    set((state) => ({ origRanges: state.origRanges.filter((r) => r.id !== id) })),
  updateOrigRange: (id, updates) =>
    set((state) => ({
      origRanges: state.origRanges.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),

  setBlurMasks: (blurMasks) => set({ blurMasks }),
  addBlurMask: (mask) =>
    set((state) => ({ blurMasks: [...state.blurMasks, mask] })),
  removeBlurMask: (id) =>
    set((state) => ({ blurMasks: state.blurMasks.filter((m) => m.id !== id) })),
  updateBlurMask: (id, updates) =>
    set((state) => ({
      blurMasks: state.blurMasks.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  setSponsorBreaks: (sponsorBreaks) => set({ sponsorBreaks }),

  setReadScreenOpen: (isReadScreenOpen) => set({ isReadScreenOpen }),
  setSplitModalOpen: (isSplitModalOpen) => set({ isSplitModalOpen }),
  setFindReplaceOpen: (isFindReplaceOpen) => set({ isFindReplaceOpen }),
  setPresetsModalOpen: (isPresetsModalOpen) => set({ isPresetsModalOpen }),
  setSponsorModalOpen: (isSponsorModalOpen) => set({ isSponsorModalOpen }),
  setDaiRecapOpen: (isDaiRecapOpen) => set({ isDaiRecapOpen }),
  setAppTourOpen: (isAppTourOpen) => set({ isAppTourOpen }),
  setMixerOpen: (isMixerOpen) => set({ isMixerOpen }),
  setMascotMood: (mascotMood, speech) =>
    set((state) => ({
      mascotMood,
      mascotSpeech: speech !== undefined ? speech : state.mascotSpeech,
    })),
  setSystemRamPercent: (systemRamPercent) => set({ systemRamPercent }),

  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setExportOpen: (isExportOpen) => set({ isExportOpen }),
  setMasterDubbedVideoPath: (masterDubbedVideoPath) => set({ masterDubbedVideoPath }),
  preferencesActiveTab: 'General',
  setPreferencesActiveTab: (preferencesActiveTab) => set({ preferencesActiveTab }),

  // General & Engine Preferences implementations
  liteMode: loadInitialLiteMode(),
  setLiteMode: (enabled) => {
    if (enabled) {
      document.documentElement.classList.add('lite-mode');
    } else {
      document.documentElement.classList.remove('lite-mode');
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_LITE_MODE, String(enabled));
    set({ liteMode: enabled });
  },

  geminiAiModel: localStorage.getItem(LOCAL_STORAGE_KEY_GEMINI_MODEL) || 'Gemini 3.8 Flash (Newest - Frontier Speed)',
  setGeminiAiModel: (geminiAiModel) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_GEMINI_MODEL, geminiAiModel);
    set({ geminiAiModel });
  },

  autoSwitchModel: localStorage.getItem(LOCAL_STORAGE_KEY_AUTO_SWITCH) !== 'false',
  setAutoSwitchModel: (autoSwitchModel) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_AUTO_SWITCH, String(autoSwitchModel));
    set({ autoSwitchModel });
  },

  backupModel: localStorage.getItem(LOCAL_STORAGE_KEY_BACKUP_MODEL) || 'No backup',
  setBackupModel: (backupModel) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_BACKUP_MODEL, backupModel);
    set({ backupModel });
  },

  readScreenModel: localStorage.getItem(LOCAL_STORAGE_KEY_READ_SCREEN_MODEL) || 'gemini-3.7-flash',
  setReadScreenModel: (readScreenModel) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_READ_SCREEN_MODEL, readScreenModel);
    set({ readScreenModel });
  },

  transcribeModel: localStorage.getItem(LOCAL_STORAGE_KEY_TRANSCRIBE_MODEL) || 'gemini-3.7-flash',
  setTranscribeModel: (transcribeModel) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_TRANSCRIBE_MODEL, transcribeModel);
    set({ transcribeModel });
  },

  vocalRemovalEngine: (localStorage.getItem(LOCAL_STORAGE_KEY_VOCAL_ENGINE) as any) || 'demucs',
  setVocalRemovalEngine: (vocalRemovalEngine) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_VOCAL_ENGINE, vocalRemovalEngine);
    set({ vocalRemovalEngine });
  },

  demucsFolderPath: localStorage.getItem(LOCAL_STORAGE_KEY_DEMUCS_PATH) || '',
  setDemucsFolderPath: (demucsFolderPath) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_DEMUCS_PATH, demucsFolderPath);
    set({ demucsFolderPath });
  },

  demucsSegmentSize: Number(localStorage.getItem(LOCAL_STORAGE_KEY_DEMUCS_SEGMENT)) || 7,
  setDemucsSegmentSize: (demucsSegmentSize) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_DEMUCS_SEGMENT, String(demucsSegmentSize));
    set({ demucsSegmentSize });
  },

  transcriptionEngine: (localStorage.getItem(LOCAL_STORAGE_KEY_TRANSCRIPTION_ENGINE) as any) || 'whisper',
  setTranscriptionEngine: (transcriptionEngine) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_TRANSCRIPTION_ENGINE, transcriptionEngine);
    set({ transcriptionEngine });
  },

  whisperFolderPath: localStorage.getItem(LOCAL_STORAGE_KEY_WHISPER_PATH) || '',
  setWhisperFolderPath: (whisperFolderPath) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_WHISPER_PATH, whisperFolderPath);
    set({ whisperFolderPath });
  },

  selectedWhisperModel: localStorage.getItem(LOCAL_STORAGE_KEY_WHISPER_MODEL) || 'large-v3',
  setSelectedWhisperModel: (selectedWhisperModel) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_WHISPER_MODEL, selectedWhisperModel);
    set({ selectedWhisperModel });
  },

  defaultGender: (localStorage.getItem(LOCAL_STORAGE_KEY_DEFAULT_GENDER) as any) || 'auto',
  setDefaultGender: (defaultGender) => {
    localStorage.setItem(LOCAL_STORAGE_KEY_DEFAULT_GENDER, defaultGender);
    set({ defaultGender });
  },

  resetToEmptyState: () =>
    set({
      project: null,
      projectName: 'Untitled_Project',
      segments: [],
      selectedSegmentIds: [],
      activeSegmentId: null,
      currentTimeMs: 0,
      durationMs: 0,
      origRanges: [],
      bgmAudioPath: null,
      a1AudioPath: null,
      mascotSpeech: 'Ready!',
      systemRamPercent: 0,
    }),
}));
