use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TtsProvider {
    EdgeTts,
    Elevenlabs,
}

impl Default for TtsProvider {
    fn default() -> Self {
        TtsProvider::EdgeTts
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LlmProvider {
    Gemini,
    Openai,
    Ollama,
}

impl Default for LlmProvider {
    fn default() -> Self {
        LlmProvider::Gemini
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SegmentStatus {
    Pending,
    Transcribed,
    Translated,
    Synthesizing,
    Ready,
    Error,
}

impl Default for SegmentStatus {
    fn default() -> Self {
        SegmentStatus::Pending
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    pub video_path: String,
    pub extracted_audio_path: Option<String>,
    pub source_lang: String,
    pub target_lang: String,
    pub tts_provider: TtsProvider,
    pub default_voice: String,
    pub llm_provider: LlmProvider,
    pub ducking_volume: f32,
    #[serde(default = "default_one")]
    pub original_audio_gain: f32,
    #[serde(default)]
    pub original_audio_muted: bool,
    #[serde(default = "default_one")]
    pub dub_audio_gain: f32,
    #[serde(default = "default_bgm_gain")]
    pub bgm_audio_gain: f32,
    #[serde(default = "default_one")]
    pub master_gain: f32,
    #[serde(default)]
    pub master_muted: bool,
    #[serde(default = "default_true")]
    pub peak_limiter_enabled: bool,
}

fn default_one() -> f32 { 1.0 }
fn default_bgm_gain() -> f32 { 0.75 }
fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DubSegment {
    pub id: String,
    pub index: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker_tag: Option<String>,
    pub voice_id: String,
    pub original_text: String,
    pub translated_text: String,
    pub tts_raw_path: Option<String>,
    pub tts_stretched_path: Option<String>,
    pub tts_duration_ms: Option<u64>,
    pub speed_ratio: f64,
    pub status: SegmentStatus,
    #[serde(default)]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeysConfig {
    pub gemini_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub elevenlabs_api_key: Option<String>,
    pub whisper_api_key: Option<String>,
    pub groq_api_key: Option<String>,
    pub ollama_base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrigAudioRange {
    pub id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub action: String,
    pub fade_in_ms: u64,
    pub fade_out_ms: u64,
    pub gain: f32,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PipelineEvent {
    StageProgress {
        stage: String,
        percent: u8,
        detail: String,
    },
    SegmentsInitialized {
        segments: Vec<DubSegment>,
    },
    SegmentUpdated {
        segment: DubSegment,
    },
    PipelineCompleted {
        #[serde(rename = "outputVideoPath")]
        output_video_path: String,
    },
    PipelineError {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub memory_usage_percent: u8,
    pub os_name: String,
}
