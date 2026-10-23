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
