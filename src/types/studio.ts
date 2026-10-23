export type TtsProvider = 'edge-tts' | 'elevenlabs';
export type LlmProvider = 'gemini' | 'openai' | 'ollama';
export type SegmentStatus = 'pending' | 'transcribed' | 'translated' | 'synthesizing' | 'ready' | 'error';

export interface ProjectConfig {
  id: string;
  videoPath: string;
  extractedAudioPath?: string | null;
  sourceLang: string;
  targetLang: string;
  ttsProvider: TtsProvider;
  defaultVoice: string;
  llmProvider: LlmProvider;
  duckingVolume: number;
  originalAudioGain: number;
  originalAudioMuted: boolean;
  dubAudioGain: number;
  bgmAudioGain: number;
  masterGain: number;
  masterMuted: boolean;
  peakLimiterEnabled: boolean;
}

export interface DubSegment {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  speaker: string;
  speakerTag?: string;
  voiceId: string;
  persona?: string;
  emotion?: string;
  originalText: string;
  translatedText: string;
  ttsRawPath?: string | null;
  ttsStretchedPath?: string | null;
  ttsDurationMs?: number | null;
  speedRatio: number;
  status: SegmentStatus;
  errorMessage?: string | null;
}

export interface ApiKeysConfig {
  geminiApiKey?: string | null;
  openaiApiKey?: string | null;
  elevenlabsApiKey?: string | null;
  whisperApiKey?: string | null;
  groqApiKey?: string | null;
  ollamaBaseUrl?: string | null;
}

export type PipelineEvent =
  | { type: 'StageProgress'; stage: string; percent: number; detail: string }
  | { type: 'SegmentsInitialized'; segments: DubSegment[] }
  | { type: 'SegmentUpdated'; segment: DubSegment }
  | { type: 'PipelineCompleted'; outputVideoPath: string }
  | { type: 'PipelineError'; message: string };

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  language: string;
  locale: string;
  provider: TtsProvider;
}

export interface MoviePersona {
  id: string;
  name: string;
  khmerName: string;
  emoji: string;
  defaultVoice: string;
  pitchOffsetHz: number;
  rateMultiplier: number;
  description: string;
}

export interface MovieEmotion {
  id: string;
  name: string;
  khmerName: string;
  emoji: string;
  rateDeltaPercent: number;
  pitchDeltaHz: number;
}

export const MOVIE_PERSONAS: MoviePersona[] = [
  { id: 'narrator', name: 'Movie Narrator', khmerName: 'អ្នកអត្ថាធិប្បាយភាពយន្ត', emoji: '🎙️', defaultVoice: 'km-KH-PisethNeural', pitchOffsetHz: -5, rateMultiplier: 0.98, description: 'Narrator / Voice-over' },
  { id: 'young_man', name: 'Young Man / Hero', khmerName: 'យុវជន / តួឯកប្រុស', emoji: '👱‍♂️', defaultVoice: 'km-KH-PisethNeural', pitchOffsetHz: -2, rateMultiplier: 1.00, description: 'Young male lead' },
  { id: 'young_woman', name: 'Young Woman / Heroine', khmerName: 'នារីវ័យក្មេង / តួឯកស្រី', emoji: '👱‍♀️', defaultVoice: 'km-KH-SreymomNeural', pitchOffsetHz: 2, rateMultiplier: 1.00, description: 'Young female lead' },
  { id: 'father', name: 'Father / Adult Male', khmerName: 'លោកឪពុក / បុរសពេញវ័យ', emoji: '👨', defaultVoice: 'km-KH-PisethNeural', pitchOffsetHz: -12, rateMultiplier: 0.98, description: 'Father / Adult male' },
  { id: 'mother', name: 'Mother / Adult Female', khmerName: 'អ្នកម្តាយ / ស្ត្រីពេញវ័យ', emoji: '👩', defaultVoice: 'km-KH-SreymomNeural', pitchOffsetHz: -4, rateMultiplier: 0.98, description: 'Mother / Adult female' },
  { id: 'grandfather', name: 'Grandfather / Old Male', khmerName: 'លោកតា / ជីតា', emoji: '👴', defaultVoice: 'km-KH-PisethNeural', pitchOffsetHz: -22, rateMultiplier: 0.90, description: 'Elderly grandfather' },
  { id: 'grandmother', name: 'Grandmother / Old Female', khmerName: 'លោកយាយ / ជីដូន', emoji: '👵', defaultVoice: 'km-KH-SreymomNeural', pitchOffsetHz: -8, rateMultiplier: 0.93, description: 'Elderly grandmother' },
  { id: 'boy', name: 'Boy / Son', khmerName: 'ក្មេងប្រុស / កូនប្រុស', emoji: '👦', defaultVoice: 'km-KH-PisethNeural', pitchOffsetHz: 15, rateMultiplier: 1.03, description: 'Young boy' },
  { id: 'girl', name: 'Girl / Daughter', khmerName: 'ក្មេងស្រី / កូនស្រី', emoji: '👧', defaultVoice: 'km-KH-SreymomNeural', pitchOffsetHz: 20, rateMultiplier: 1.02, description: 'Young girl' },
  { id: 'baby', name: 'Baby / Toddler', khmerName: 'ទារក / កូនង៉ា', emoji: '👶', defaultVoice: 'km-KH-SreymomNeural', pitchOffsetHz: 30, rateMultiplier: 1.05, description: 'Infant or small child' },
  { id: 'villain', name: 'Villain / Antagonist', khmerName: 'តួកាច / ជនទុច្ចរិត', emoji: '🦹', defaultVoice: 'km-KH-PisethNeural', pitchOffsetHz: -18, rateMultiplier: 0.95, description: 'Dark / deep villain' }
];

export const MOVIE_EMOTIONS: MovieEmotion[] = [
  { id: 'natural', name: 'Natural', khmerName: 'ធម្មតា', emoji: '😐', rateDeltaPercent: 0, pitchDeltaHz: 0 },
  { id: 'calm', name: 'Calm', khmerName: 'ស្ងប់ស្ងាត់', emoji: '😌', rateDeltaPercent: -7, pitchDeltaHz: -4 },
  { id: 'sad', name: 'Sad', khmerName: 'កំសត់ / ស្រពោន', emoji: '😢', rateDeltaPercent: -9, pitchDeltaHz: -10 },
  { id: 'angry', name: 'Angry', khmerName: 'ខឹង / ឆេវឆាវ', emoji: '😡', rateDeltaPercent: 4, pitchDeltaHz: 6 },
  { id: 'happy', name: 'Happy', khmerName: 'រីករាយ / សប្បាយ', emoji: '😄', rateDeltaPercent: 2, pitchDeltaHz: 8 },
  { id: 'excited', name: 'Excited', khmerName: 'រំភើប / ភ្ញាក់ផ្អើល', emoji: '🤩', rateDeltaPercent: 5, pitchDeltaHz: 12 },
  { id: 'scared', name: 'Scared / Fearful', khmerName: 'ភ័យខ្លាច', emoji: '😨', rateDeltaPercent: 3, pitchDeltaHz: 6 },
  { id: 'whisper', name: 'Whisper', khmerName: 'ខ្សឹប', emoji: '🤫', rateDeltaPercent: -11, pitchDeltaHz: -6 }
];

export const POPULAR_VOICES: VoiceOption[] = [
  { id: 'km-KH-PisethNeural', name: 'Piseth (Khmer)', gender: 'Male', language: 'Khmer', locale: 'km-KH', provider: 'edge-tts' },
  { id: 'km-KH-SreymomNeural', name: 'Sreymom (Khmer)', gender: 'Female', language: 'Khmer', locale: 'km-KH', provider: 'edge-tts' },
  { id: 'en-US-AndrewNeural', name: 'Andrew (English US)', gender: 'Male', language: 'English', locale: 'en-US', provider: 'edge-tts' },
  { id: 'en-US-AvaNeural', name: 'Ava (English US)', gender: 'Female', language: 'English', locale: 'en-US', provider: 'edge-tts' },
  { id: 'en-US-BrianNeural', name: 'Brian (English US)', gender: 'Male', language: 'English', locale: 'en-US', provider: 'edge-tts' },
  { id: 'en-US-EmmaNeural', name: 'Emma (English US)', gender: 'Female', language: 'English', locale: 'en-US', provider: 'edge-tts' },
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (Chinese)', gender: 'Female', language: 'Chinese', locale: 'zh-CN', provider: 'edge-tts' },
  { id: 'zh-CN-YunxiNeural', name: 'Yunxi (Chinese)', gender: 'Male', language: 'Chinese', locale: 'zh-CN', provider: 'edge-tts' },
  { id: 'ja-JP-NanamiNeural', name: 'Nanami (Japanese)', gender: 'Female', language: 'Japanese', locale: 'ja-JP', provider: 'edge-tts' },
  { id: 'ja-JP-KeitaNeural', name: 'Keita (Japanese)', gender: 'Male', language: 'Japanese', locale: 'ja-JP', provider: 'edge-tts' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (ElevenLabs)', gender: 'Female', language: 'English', locale: 'en-US', provider: 'elevenlabs' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (ElevenLabs)', gender: 'Female', language: 'English', locale: 'en-US', provider: 'elevenlabs' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (ElevenLabs)', gender: 'Female', language: 'English', locale: 'en-US', provider: 'elevenlabs' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (ElevenLabs)', gender: 'Male', language: 'English', locale: 'en-US', provider: 'elevenlabs' }
];

export interface SystemMetrics {
  totalMemoryMb: number;
  usedMemoryMb: number;
  memoryUsagePercent: number;
  osName: string;
}

export interface OrigAudioRange {
  id: string;
  startMs: number;
  endMs: number;
  action: 'duck' | 'keep' | 'mute';
  fadeInMs: number;
  fadeOutMs: number;
  gain: number;
  label?: string;
}

export interface BlurMask {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'blur' | 'pixelate' | 'solid';
  enabled: boolean;
}

export interface SponsorBreak {
  id: string;
  timestampMs: number;
  videoPath: string;
  durationMs: number;
  fadeDurationMs: number;
  label: string;
}

export interface DdpPreset {
  id: string;
  name: string;
  folder: string;
  description: string;
  defaultVoice: string;
  targetLang: string;
  speedRatio: number;
  createdAt: string;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: 'Auto Detect (STT)' },
  { code: 'km-KH', label: 'Khmer (ភាសាខ្មែរ)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'ja-JP', label: 'Japanese (日本語)' },
  { code: 'ko-KR', label: 'Korean (한국어)' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'vi-VN', label: 'Vietnamese' },
  { code: 'th-TH', label: 'Thai' }
];
