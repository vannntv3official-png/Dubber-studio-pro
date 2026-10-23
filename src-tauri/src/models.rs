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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub persona: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emotion: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_config_defaults() {
        let json = r#"{
            "id": "proj-123",
            "videoPath": "C:\\videos\\sample.mp4",
            "sourceLang": "en",
            "targetLang": "km-KH",
            "ttsProvider": "edge-tts",
            "defaultVoice": "km-KH-PisethNeural",
            "llmProvider": "gemini",
            "duckingVolume": 0.18
        }"#;

        let config: ProjectConfig = serde_json::from_str(json).expect("Deserialization failed");
        assert_eq!(config.id, "proj-123");
        assert_eq!(config.original_audio_gain, 1.0);
        assert_eq!(config.bgm_audio_gain, 0.75);
        assert!(!config.original_audio_muted);
        assert!(config.peak_limiter_enabled);
    }

    #[test]
    fn test_segment_status_transitions() {
        assert_eq!(SegmentStatus::default(), SegmentStatus::Pending);

        let seg = DubSegment {
            id: "seg-1".to_string(),
            index: 0,
            start_ms: 1000,
            end_ms: 3500,
            speaker: "Speaker 1".to_string(),
            speaker_tag: None,
            voice_id: "km-KH-PisethNeural".to_string(),
            original_text: "Hello world".to_string(),
            translated_text: "សួស្តីពិភពលោក".to_string(),
            tts_raw_path: None,
            tts_stretched_path: None,
            tts_duration_ms: None,
            speed_ratio: 1.05,
            status: SegmentStatus::Ready,
            error_message: None,
            persona: Some("father".to_string()),
            emotion: Some("calm".to_string()),
        };

        let serialized = serde_json::to_string(&seg).expect("Serialization failed");
        assert!(serialized.contains("សួស្តីពិភពលោក"));
        assert!(serialized.contains("speedRatio"));

        let deserialized: DubSegment = serde_json::from_str(&serialized).expect("Deserialization failed");
        assert_eq!(deserialized.id, "seg-1");
        assert_eq!(deserialized.end_ms - deserialized.start_ms, 2500);
        assert_eq!(deserialized.status, SegmentStatus::Ready);
    }

    #[test]
    fn test_orig_audio_range_serialization() {
        let range = OrigAudioRange {
            id: "r-1".to_string(),
            start_ms: 500,
            end_ms: 4500,
            action: "mute".to_string(),
            fade_in_ms: 200,
            fade_out_ms: 300,
            gain: 0.0,
            label: Some("Intro Music Mute".to_string()),
        };

        let json = serde_json::to_string(&range).unwrap();
        assert!(json.contains("\"action\":\"mute\""));
        assert!(json.contains("\"fadeInMs\":200"));

        let parsed: OrigAudioRange = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.start_ms, 500);
        assert_eq!(parsed.action, "mute");
    }
}
