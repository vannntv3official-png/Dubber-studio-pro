use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use uuid::Uuid;
use crate::models::{ProjectConfig, DubSegment, ApiKeysConfig, PipelineEvent, TtsProvider, LlmProvider, OrigAudioRange};
use crate::pipeline::{ffmpeg, transcriber, translator, tts};

pub fn get_project_dir(project_id: &str) -> Result<PathBuf, String> {
    let mut dir = std::env::temp_dir();
    dir.push("dubber_studio_pro");
    dir.push(project_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create project temp dir: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub async fn create_project(video_path: String) -> Result<ProjectConfig, String> {
    if !Path::new(&video_path).exists() {
        return Err(format!("Selected video path does not exist: {video_path}"));
    }

    let project_id = Uuid::new_v4().to_string();
    let project_dir = get_project_dir(&project_id)?;

    let out_stt = project_dir.join("extracted_stt_16k.wav").to_str().unwrap().to_string();
    let out_mix = project_dir.join("extracted_mix_44k.wav").to_str().unwrap().to_string();

    ffmpeg::extract_audio(&video_path, &out_stt, &out_mix)?;

    Ok(ProjectConfig {
        id: project_id,
        video_path,
        extracted_audio_path: Some(out_mix),
        source_lang: "auto".to_string(),
        target_lang: "km-KH".to_string(),
        tts_provider: TtsProvider::EdgeTts,
        default_voice: "km-KH-PisethNeural".to_string(),
        llm_provider: LlmProvider::Gemini,
        ducking_volume: 0.18,
        original_audio_gain: 1.0,
        original_audio_muted: false,
        dub_audio_gain: 1.0,
        bgm_audio_gain: 0.75,
        master_gain: 1.0,
        master_muted: false,
        peak_limiter_enabled: true,
    })
}

#[tauri::command]
pub async fn run_full_pipeline(
    mut config: ProjectConfig,
    api_keys: ApiKeysConfig,
    transcription_engine: String,
    whisper_model: String,
    transcribe_model: String,
    auto_fit: bool,
    channel: Channel<PipelineEvent>,
) -> Result<(), String> {
    let project_dir = get_project_dir(&config.id)?;

    // 1. Audio Extraction if not already done
    let out_stt = project_dir.join("extracted_stt_16k.wav").to_str().unwrap().to_string();
    let out_mix = project_dir.join("extracted_mix_44k.wav").to_str().unwrap().to_string();

    if !Path::new(&out_stt).exists() || !Path::new(&out_mix).exists() {
        let _ = channel.send(PipelineEvent::StageProgress {
            stage: "Audio Extraction".to_string(),
            percent: 10,
            detail: "Demuxing high-fidelity audio tracks from video...".to_string(),
        });
        ffmpeg::extract_audio(&config.video_path, &out_stt, &out_mix)?;
        config.extracted_audio_path = Some(out_mix.clone());
    }

    // 2. Speech-to-Text Transcription
    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "Speech Recognition".to_string(),
        percent: 25,
        detail: "Transcribing dialogue and extracting segment timestamps...".to_string(),
    });

    let mut segments = transcriber::transcribe_audio(
        &out_stt,
        &config.source_lang,
        &config.default_voice,
        &transcription_engine,
        &whisper_model,
        transcribe_model.strip_prefix("Auto: ").unwrap_or(&transcribe_model),
        &api_keys,
    ).await?;

    let _ = channel.send(PipelineEvent::SegmentsInitialized {
        segments: segments.clone(),
    });

    // 3. Context-Aware LLM Translation
    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "Dialog Translation".to_string(),
        percent: 60,
        detail: format!("Translating dialog to {} with timing constraints...", config.target_lang),
    });

    translator::translate_segments(
        &mut segments,
        &config.source_lang,
        &config.target_lang,
        &config.llm_provider,
        &api_keys,
    ).await?;

    for seg in &segments {
        let _ = channel.send(PipelineEvent::SegmentUpdated {
            segment: seg.clone(),
        });
    }

    // 4. Synthesize each translated cue so a completed pipeline is ready to export.
    let total = segments.len().max(1);
    for (index, segment) in segments.iter_mut().enumerate() {
        let _ = channel.send(PipelineEvent::StageProgress {
            stage: "Voice Synthesis".to_string(),
            percent: 70 + ((index * 25) / total) as u8,
            detail: format!("Generating voice for cue {} of {}...", index + 1, total),
        });

        let mut result = tts::synthesize_segment(segment, &config.tts_provider, &project_dir, &api_keys).await;
        if result.is_ok() && auto_fit && segment.speed_ratio > 1.35 {
            match translator::shorten_segment_translation(segment, &config.llm_provider, &api_keys).await {
                Ok(shortened) if !shortened.trim().is_empty() && shortened.trim() != segment.translated_text.trim() => {
                    segment.translated_text = shortened;
                    result = tts::synthesize_segment(segment, &config.tts_provider, &project_dir, &api_keys).await;
                }
                Ok(_) => {}
                Err(error) => log::warn!("Auto-fit skipped for segment {}: {error}", segment.id),
            }
        }
        if let Err(error) = result {
            log::warn!("TTS failed for segment {}: {error}", segment.id);
        }
        let _ = channel.send(PipelineEvent::SegmentUpdated { segment: segment.clone() });
    }

    // Export generated & translated subtitles to srt
    let srt_preview = project_dir.join("subtitles.srt").to_str().unwrap().to_string();
    let _ = ffmpeg::export_srt_file(&segments, &srt_preview);

    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "Completed".to_string(),
        percent: 100,
        detail: "Transcription, translation, and voice generation finished.".to_string(),
    });

    let _ = channel.send(PipelineEvent::PipelineCompleted {
        output_video_path: config.video_path.clone(),
    });

    Ok(())
}

#[tauri::command]
pub async fn regenerate_segment_tts(
    mut segment: DubSegment,
    config: ProjectConfig,
    api_keys: ApiKeysConfig,
) -> Result<DubSegment, String> {
    let project_dir = get_project_dir(&config.id)?;
    tts::synthesize_segment(&mut segment, &config.tts_provider, &project_dir, &api_keys).await?;
    Ok(segment)
}

#[tauri::command]
pub async fn auto_fit_segment(
    mut segment: DubSegment,
    config: ProjectConfig,
    api_keys: ApiKeysConfig,
) -> Result<DubSegment, String> {
    let shortened = translator::shorten_segment_translation(&segment, &config.llm_provider, &api_keys).await?;
    segment.translated_text = shortened;
    let project_dir = get_project_dir(&config.id)?;
    tts::synthesize_segment(&mut segment, &config.tts_provider, &project_dir, &api_keys).await?;
    Ok(segment)
}

#[tauri::command]
pub async fn export_dubbed_video(
    config: ProjectConfig,
    segments: Vec<DubSegment>,
    burn_subs: bool,
    quality: String,
    final_speed: f32,
    flip_h: bool,
    flip_v: bool,
    rotation: u16,
    a2_audio_path: Option<String>,
    ducking_enabled: bool,
    orig_ranges: Vec<OrigAudioRange>,
    output_path: String,
    channel: Channel<PipelineEvent>,
) -> Result<String, String> {
    let project_dir = get_project_dir(&config.id)?;
    let out_mix = project_dir.join("extracted_mix_44k.wav").to_str().unwrap().to_string();

    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "Exporting Video".to_string(),
        percent: 20,
        detail: "Generating subtitles and multi-track audio filters...".to_string(),
    });

    let srt_path = project_dir.join("export_subtitles.srt").to_str().unwrap().to_string();
    ffmpeg::export_srt_file(&segments, &srt_path)?;

    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "Exporting Video".to_string(),
        percent: 50,
        detail: "Encoding final video with audio ducking and lip-sync tracks...".to_string(),
    });

    ffmpeg::mix_and_mux_video(
        &config.video_path,
        &out_mix,
        &segments,
        config.ducking_volume,
        config.original_audio_gain,
        config.original_audio_muted,
        config.dub_audio_gain,
        config.bgm_audio_gain,
        config.master_gain,
        config.master_muted,
        config.peak_limiter_enabled,
        a2_audio_path.as_deref(),
        ducking_enabled,
        &orig_ranges,
        burn_subs,
        &quality,
        final_speed,
        flip_h,
        flip_v,
        rotation,
        Some(&srt_path),
        &output_path,
    )?;

    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "Export Complete".to_string(),
        percent: 100,
        detail: format!("Exported successfully to {}", output_path),
    });

    let _ = channel.send(PipelineEvent::PipelineCompleted {
        output_video_path: output_path.clone(),
    });

    Ok(output_path)
}

#[tauri::command]
pub async fn run_auto_dub_pipeline(
    config: ProjectConfig,
    api_keys: ApiKeysConfig,
    transcription_engine: String,
    whisper_model: String,
    transcribe_model: String,
    auto_fit: bool,
    channel: Channel<PipelineEvent>,
) -> Result<(), String> {
    run_full_pipeline(config, api_keys, transcription_engine, whisper_model, transcribe_model, auto_fit, channel).await
}

#[tauri::command]
pub async fn isolate_bgm(
    video_path: String,
    output_dir: Option<String>,
    channel: Channel<PipelineEvent>,
) -> Result<String, String> {
    if !Path::new(&video_path).exists() {
        return Err(format!("Video path does not exist: {video_path}"));
    }

    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "UVR / Demucs Vocal Separation".to_string(),
        percent: 30,
        detail: "Separating vocal and instrumental tracks...".to_string(),
    });

    let out_dir = match output_dir {
        Some(d) => PathBuf::from(d),
        None => {
            let mut temp = std::env::temp_dir();
            temp.push("dubber_studio_pro");
            temp.push("stems");
            std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
            temp
        }
    };

    let instrumental = ffmpeg::isolate_bgm(&video_path, out_dir.to_str().unwrap())?;

    let _ = channel.send(PipelineEvent::StageProgress {
        stage: "BGM Isolation Complete".to_string(),
        percent: 100,
        detail: "Instrumental audio stem ready on Track A2".to_string(),
    });

    Ok(instrumental)
}

#[tauri::command]
pub async fn export_srt_file(
    segments: Vec<DubSegment>,
    output_path: String,
) -> Result<(), String> {
    ffmpeg::export_srt_file(&segments, &output_path)
}

#[tauri::command]
pub fn get_system_metrics() -> Result<crate::models::SystemMetrics, String> {
    #[cfg(target_os = "windows")]
    {
        use std::mem::zeroed;
        #[repr(C)]
        struct MEMORYSTATUSEX {
            dw_length: u32,
            dw_memory_load: u32,
            ull_total_phys: u64,
            ull_avail_phys: u64,
            ull_total_page_file: u64,
            ull_avail_page_file: u64,
            ull_total_virtual: u64,
            ull_avail_virtual: u64,
            ull_avail_extended_virtual: u64,
        }

        extern "system" {
            fn GlobalMemoryStatusEx(lp_buffer: *mut MEMORYSTATUSEX) -> i32;
        }

        unsafe {
            let mut status: MEMORYSTATUSEX = zeroed();
            status.dw_length = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
            if GlobalMemoryStatusEx(&mut status) != 0 {
                let total_mb = status.ull_total_phys / (1024 * 1024);
                let avail_mb = status.ull_avail_phys / (1024 * 1024);
                let used_mb = total_mb.saturating_sub(avail_mb);
                let percent = status.dw_memory_load as u8;

                return Ok(crate::models::SystemMetrics {
                    total_memory_mb: total_mb,
                    used_memory_mb: used_mb,
                    memory_usage_percent: percent,
                    os_name: "Windows".to_string(),
                });
            }
        }
    }

    Ok(crate::models::SystemMetrics {
        total_memory_mb: 16384,
        used_memory_mb: 8192,
        memory_usage_percent: 50,
        os_name: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub async fn extract_video_frame(
    video_path: String,
    timestamp_ms: u64,
    output_image_path: Option<String>,
) -> Result<String, String> {
    let out = match output_image_path {
        Some(p) => p,
        None => {
            let mut temp = std::env::temp_dir();
            temp.push("dubber_studio_pro");
            temp.push("ocr_frames");
            std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
            temp.push(format!("frame_{}.jpg", timestamp_ms));
            temp.to_str().unwrap().to_string()
        }
    };

    ffmpeg::extract_video_frame_at_time(&video_path, timestamp_ms, &out)?;
    Ok(out)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrSubtitleItem {
    pub id: String,
    pub original: String,
    pub translated: String,
}

#[derive(Debug, serde::Deserialize)]
struct GeminiOcrResponse {
    #[serde(default)]
    subtitles: Vec<OcrSubRaw>,
}

#[derive(Debug, serde::Deserialize)]
struct OcrSubRaw {
    #[serde(default)]
    original: String,
    #[serde(default)]
    translated: String,
}

#[tauri::command]
pub async fn detect_frame_subtitles(
    image_path: String,
    target_lang: String,
    box_rect: Option<String>,
    api_keys: ApiKeysConfig,
) -> Result<Vec<OcrSubtitleItem>, String> {
    if !Path::new(&image_path).exists() {
        return Err(format!("Extracted frame image not found: {image_path}"));
    }

    let img_bytes = std::fs::read(&image_path)
        .map_err(|e| format!("Failed to read frame image: {e}"))?;
    use base64::Engine;
    let b64_img = base64::engine::general_purpose::STANDARD.encode(&img_bytes);

    let region_hint = box_rect.unwrap_or_else(|| "bottom subtitle area".to_string());
    let prompt = format!(
        "Analyze this video frame. The user is focusing on the subtitle box region at: {region_hint}. \
        Detect any hardcoded/burned-in subtitle text in this video frame. \
        Extract the exact original subtitle text verbatim. \
        Translate the extracted subtitle into target language ({target_lang}). \
        Return ONLY a JSON object matching this schema:\n\
        {{\n  \"subtitles\": [\n    {{\n      \"original\": \"<extracted text>\",\n      \"translated\": \"<natural translation>\"\n    }}\n  ]\n}}\n\
        If no subtitles or text are visible, return {{\"subtitles\": []}}."
    );

    // 1. Try Gemini Vision API if key available
    if let Some(key) = api_keys.gemini_api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        let client = reqwest::Client::new();
        let payload = serde_json::json!({
            "contents": [{
                "parts": [
                    { "text": prompt },
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_img
                        }
                    }
                ]
            }],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2
            }
        });

        let models = ["gemini-3.7-flash", "gemini-2.5-flash"];
        for model in models {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            );
            if let Ok(res) = client.post(&url).json(&payload).send().await {
                if res.status().is_success() {
                    if let Ok(json_body) = res.json::<serde_json::Value>().await {
                        if let Some(text) = json_body["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                            if let Ok(parsed) = serde_json::from_str::<GeminiOcrResponse>(text) {
                                let mut items = Vec::new();
                                for (i, sub) in parsed.subtitles.into_iter().enumerate() {
                                    if !sub.original.trim().is_empty() {
                                        items.push(OcrSubtitleItem {
                                            id: format!("ocr-{}-{}", uuid::Uuid::new_v4().simple(), i),
                                            original: sub.original.trim().to_string(),
                                            translated: if sub.translated.trim().is_empty() { sub.original.trim().to_string() } else { sub.translated.trim().to_string() },
                                        });
                                    }
                                }
                                return Ok(items);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Try OpenAI Vision if available
    if let Some(key) = api_keys.openai_api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        let client = reqwest::Client::new();
        let payload = serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "text", "text": prompt },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/jpeg;base64,{b64_img}")
                        }
                    }
                ]
            }],
            "response_format": { "type": "json_object" }
        });

        if let Ok(res) = client.post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(key)
            .json(&payload)
            .send()
            .await 
        {
            if res.status().is_success() {
                if let Ok(json_body) = res.json::<serde_json::Value>().await {
                    if let Some(content) = json_body["choices"][0]["message"]["content"].as_str() {
                        if let Ok(parsed) = serde_json::from_str::<GeminiOcrResponse>(content) {
                            let mut items = Vec::new();
                            for (i, sub) in parsed.subtitles.into_iter().enumerate() {
                                if !sub.original.trim().is_empty() {
                                    items.push(OcrSubtitleItem {
                                        id: format!("ocr-{}-{}", uuid::Uuid::new_v4().simple(), i),
                                        original: sub.original.trim().to_string(),
                                        translated: if sub.translated.trim().is_empty() { sub.original.trim().to_string() } else { sub.translated.trim().to_string() },
                                    });
                                }
                            }
                            return Ok(items);
                        }
                    }
                }
            }
        }
    }

    Err("Please enter your Gemini API Key in Settings -> API Keys to enable real AI Vision OCR and translation.".to_string())
}

#[tauri::command]
pub fn open_path_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut resolved = path;
        if resolved.contains("%USERPROFILE%") {
            if let Ok(profile) = std::env::var("USERPROFILE") {
                resolved = resolved.replace("%USERPROFILE%", &profile);
            }
        }
        let p = Path::new(&resolved);
        if !p.exists() {
            let _ = std::fs::create_dir_all(p);
        }
        let target = if p.is_file() {
            format!("/select,\"{}\"", resolved)
        } else {
            resolved
        };
        let _ = std::process::Command::new("explorer").arg(target).spawn();
        return Ok(());
    }
    #[allow(unreachable_code)]
    Ok(())
}
