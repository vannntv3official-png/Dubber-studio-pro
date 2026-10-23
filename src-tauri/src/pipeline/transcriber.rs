use std::path::Path;
use std::process::Command;
use uuid::Uuid;
use serde::Deserialize;
use reqwest::multipart::{Form, Part};
use base64::Engine;
use crate::models::{DubSegment, SegmentStatus, ApiKeysConfig};

#[derive(Debug, Deserialize)]
struct WhisperVerboseResponse {
    #[serde(default)]
    segments: Vec<WhisperRawSegment>,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct WhisperRawSegment {
    #[serde(default)]
    #[allow(dead_code)]
    id: usize,
    #[serde(default)]
    start: f64,
    #[serde(default)]
    end: f64,
    #[serde(default)]
    text: String,
    #[serde(default)]
    speaker: Option<String>,
}

pub async fn transcribe_audio(
    audio_path: &str,
    source_lang: &str,
    default_voice: &str,
    engine: &str,
    whisper_model: &str,
    gemini_model: &str,
    api_keys: &ApiKeysConfig,
) -> Result<Vec<DubSegment>, String> {
    if !Path::new(audio_path).exists() {
        return Err(format!("Audio file does not exist: {audio_path}"));
    }

    if engine == "whisper" {
        if !check_local_whisper_available() {
            return Err("Local Whisper is not installed or could not be found. Install OpenAI Whisper or select a cloud transcription engine.".to_string());
        }
        return transcribe_with_local(audio_path, source_lang, default_voice, whisper_model);
    }

    // The Gemini modes use the provider selected in Preferences instead of silently
    // choosing another provider behind the user's back.
    if engine == "direct" || engine == "gemini_cast" {
        let key = api_keys.gemini_api_key.as_deref().unwrap_or("").trim();
        if key.is_empty() {
            return Err("A Gemini API key is required for the selected transcription engine.".to_string());
        }
        return transcribe_with_gemini(audio_path, source_lang, default_voice, key, gemini_model, engine == "gemini_cast").await;
    }

    // Legacy / unknown engine values retain provider fallback behavior.
    // 1. Try Groq Whisper API if key is provided
    if let Some(groq_key) = &api_keys.groq_api_key {
        let trimmed = groq_key.trim();
        if !trimmed.is_empty() {
            log::info!("Transcribing audio via Groq Whisper API...");
            match transcribe_with_api(
                audio_path,
                source_lang,
                default_voice,
                "https://api.groq.com/openai/v1/audio/transcriptions",
                trimmed,
                "whisper-large-v3-turbo",
            ).await {
                Ok(segs) if !segs.is_empty() => return Ok(segs),
                Ok(_) => log::warn!("Groq Whisper returned empty segments, attempting fallback..."),
                Err(e) => log::warn!("Groq Whisper failed: {e}, attempting fallback..."),
            }
        }
    }

    // 2. Try OpenAI Whisper API if key is provided
    if let Some(openai_key) = api_keys.openai_api_key.as_ref().or(api_keys.whisper_api_key.as_ref()) {
        let trimmed = openai_key.trim();
        if !trimmed.is_empty() {
            log::info!("Transcribing audio via OpenAI Whisper API...");
            match transcribe_with_api(
                audio_path,
                source_lang,
                default_voice,
                "https://api.openai.com/v1/audio/transcriptions",
                trimmed,
                "whisper-1",
            ).await {
                Ok(segs) if !segs.is_empty() => return Ok(segs),
                Ok(_) => log::warn!("OpenAI Whisper returned empty segments, attempting fallback..."),
                Err(e) => log::warn!("OpenAI Whisper failed: {e}, attempting fallback..."),
            }
        }
    }

    // 3. Try Gemini API audio transcription if key is provided
    if let Some(gemini_key) = &api_keys.gemini_api_key {
        let trimmed = gemini_key.trim();
        if !trimmed.is_empty() {
            log::info!("Transcribing audio via Gemini Flash Multimodal API...");
            match transcribe_with_gemini(audio_path, source_lang, default_voice, trimmed, "gemini-2.5-flash", false).await {
                Ok(segs) if !segs.is_empty() => return Ok(segs),
                Ok(_) => log::warn!("Gemini transcription returned empty segments, attempting fallback..."),
                Err(e) => log::warn!("Gemini transcription failed: {e}, attempting fallback..."),
            }
        }
    }

    // 4. Fallback to local Whisper engine (Python whisper or whisper-cli)
    if check_local_whisper_available() {
        log::info!("Transcribing audio via local Whisper engine...");
        return transcribe_with_local(audio_path, source_lang, default_voice, "base");
    }

    Err(
        "No Speech-to-Text provider available. Please either:\n\
        1. Add a Gemini, Groq, or OpenAI API key in Preferences (⚙ Settings),\n\
        2. Or use local Python Whisper (which is detected if installed).".to_string()
    )
}

pub fn check_local_whisper_available() -> bool {
    // The local transcription implementation below supports OpenAI Whisper CLI / Python.
    let mut cmd = crate::pipeline::ffmpeg::create_command("whisper");
    cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
    if let Ok(o) = cmd.arg("-h").output() {
        if o.status.success() {
            return true;
        }
    }

    // Check python -c "import whisper"
    let mut py_cmd = Command::new("python");
    py_cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
    if let Ok(o) = py_cmd.args(["-c", "import whisper"]).output() {
        if o.status.success() {
            return true;
        }
    }

    // Check python3 / py alternatives
    for py_bin in &["python3", "py"] {
        let mut alt_cmd = Command::new(py_bin);
        alt_cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
        if let Ok(o) = alt_cmd.args(["-c", "import whisper"]).output() {
            if o.status.success() {
                return true;
            }
        }
    }

    false
}

async fn transcribe_with_api(
    audio_path: &str,
    source_lang: &str,
    default_voice: &str,
    endpoint: &str,
    api_key: &str,
    model: &str,
) -> Result<Vec<DubSegment>, String> {
    let file_bytes = tokio::fs::read(audio_path)
        .await
        .map_err(|e| format!("Failed to read audio file: {e}"))?;

    let file_part = Part::bytes(file_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Invalid multipart payload: {e}"))?;

    let mut form = Form::new()
        .part("file", file_part)
        .text("model", model.to_string())
        .text("response_format", "verbose_json")
        .text("timestamp_granularities[]", "segment");

    if source_lang != "auto" && !source_lang.trim().is_empty() {
        let lang_code = source_lang.split('-').next().unwrap_or(source_lang);
        form = form.text("language", lang_code.to_string());
    }

    let client = reqwest::Client::new();
    let res = client
        .post(endpoint)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("HTTP request to Whisper API failed: {e}"))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Whisper API error ({}): {}", endpoint, err_text));
    }

    let text_content = res.text().await.map_err(|e| format!("Failed to read Whisper response text: {e}"))?;
    parse_whisper_json_to_segments(&text_content, default_voice, audio_path)
}

async fn transcribe_with_gemini(
    audio_path: &str,
    source_lang: &str,
    default_voice: &str,
    api_key: &str,
    model: &str,
    detect_cast: bool,
) -> Result<Vec<DubSegment>, String> {
    let file_bytes = tokio::fs::read(audio_path)
        .await
        .map_err(|e| format!("Failed to read audio file: {e}"))?;

    // If audio is over 20MB, skip inline Gemini and defer to local
    if file_bytes.len() > 20 * 1024 * 1024 {
        return Err("Audio file is larger than 20MB for direct inline Gemini transcription.".to_string());
    }

    let base64_audio = base64::engine::general_purpose::STANDARD.encode(&file_bytes);
    let lang_hint = if source_lang != "auto" && !source_lang.trim().is_empty() {
        format!("Spoken language is {source_lang}.")
    } else {
        "Detect the spoken language automatically.".to_string()
    };

    let cast_instruction = if detect_cast {
        "Identify recurring speakers. For each segment include speaker as a stable label such as Actor 1, Actor 2, up to Actor 5. Use Actor 1 when uncertain."
    } else {
        "Do not identify speakers."
    };
    let prompt = format!(
        r#"You are an expert audio transcription system.
Transcribe all spoken dialog from this audio recording with precise start and end timestamps in seconds.
{lang_hint}
{cast_instruction}
Return ONLY a valid JSON object matching this schema:
{{
  "segments": [
    {{
      "start": 0.0,
      "end": 2.5,
      "text": "Exact spoken words",
      "speaker": "Actor 1"
    }}
  ]
}}
Do NOT include markdown formatting or backticks around the JSON."#
    );

    let payload = serde_json::json!({
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": "audio/wav",
                        "data": base64_audio
                    }
                },
                {
                    "text": prompt
                }
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1
        }
    });

    let client = reqwest::Client::new();
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}");

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Gemini transcription request failed: {e}"))?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API error during transcription: {err}"));
    }

    let json_body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content_text = json_body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| "Failed to extract text from Gemini response".to_string())?;

    parse_whisper_json_to_segments(content_text, default_voice, audio_path)
}

fn transcribe_with_local(
    audio_path: &str,
    source_lang: &str,
    default_voice: &str,
    model: &str,
) -> Result<Vec<DubSegment>, String> {
    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let out_dir = temp_dir.path().to_str().unwrap().to_string();

    let mut last_err = String::new();

    // 1. Try direct whisper binary
    let mut cmd = crate::pipeline::ffmpeg::create_command("whisper");
    cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
    cmd.args([
        audio_path,
        "--model", model,
        "--output_format", "json",
        "--output_dir", &out_dir,
        "--fp16", "False",
    ]);

    if source_lang != "auto" && !source_lang.trim().is_empty() {
        let lang = source_lang.split('-').next().unwrap_or(source_lang);
        cmd.args(["--language", lang]);
    }

    let direct_ok = match cmd.output() {
        Ok(output) if output.status.success() => true,
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            last_err = format!("Whisper CLI exited with code {:?}: {}", output.status.code(), stderr);
            false
        }
        Err(e) => {
            last_err = format!("Failed to spawn whisper CLI: {e}");
            false
        }
    };

    // 2. If direct binary failed, try python -m whisper
    if !direct_ok {
        let mut py_cmd = Command::new("python");
        py_cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
        py_cmd.args([
            "-m", "whisper",
            audio_path,
            "--model", model,
            "--output_format", "json",
            "--output_dir", &out_dir,
            "--fp16", "False",
        ]);

        if source_lang != "auto" && !source_lang.trim().is_empty() {
            let lang = source_lang.split('-').next().unwrap_or(source_lang);
            py_cmd.args(["--language", lang]);
        }

        let py_res = py_cmd.output();
        match py_res {
            Ok(output) if output.status.success() => {}
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Local Whisper execution failed: {stderr}\nPrevious error: {last_err}"));
            }
            Err(e) => {
                return Err(format!("Failed to execute python -m whisper: {e}\nPrevious error: {last_err}"));
            }
        }
    }

    let file_stem = Path::new(audio_path).file_stem().and_then(|s| s.to_str()).unwrap_or("audio");
    let json_path = format!("{}/{}.json", out_dir, file_stem);

    let content = std::fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read local whisper JSON output from {json_path}: {e}"))?;

    parse_whisper_json_to_segments(&content, default_voice, audio_path)
}

fn parse_whisper_json_to_segments(
    json_str: &str,
    default_voice: &str,
    audio_path: &str,
) -> Result<Vec<DubSegment>, String> {
    let parsed: WhisperVerboseResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse transcription JSON: {e}\nRaw output: {json_str}"))?;

    let mut segments = Vec::new();
    for (idx, raw) in parsed.segments.into_iter().enumerate() {
        let start_ms = (raw.start * 1000.0).round() as u64;
        let end_ms = (raw.end * 1000.0).round() as u64;
        let text = raw.text.trim().to_string();

        if text.is_empty() || end_ms <= start_ms {
            continue;
        }

        segments.push(DubSegment {
            id: Uuid::new_v4().to_string(),
            index: idx,
            start_ms,
            end_ms,
            speaker: raw.speaker.clone().unwrap_or_else(|| "Speaker 1".to_string()),
            speaker_tag: raw.speaker.as_deref().and_then(speaker_label_to_tag),
            voice_id: default_voice.to_string(),
            original_text: text,
            translated_text: String::new(),
            tts_raw_path: None,
            tts_stretched_path: None,
            tts_duration_ms: None,
            speed_ratio: 1.0,
            status: SegmentStatus::Transcribed,
            error_message: None,
            persona: None,
            emotion: None,
        });
    }

    // Fallback if segments array was empty but full text was returned
    if segments.is_empty() && !parsed.text.trim().is_empty() {
        let duration_ms = crate::pipeline::ffmpeg::get_audio_duration_ms(audio_path).unwrap_or(5000);
        segments.push(DubSegment {
            id: Uuid::new_v4().to_string(),
            index: 0,
            start_ms: 0,
            end_ms: duration_ms,
            speaker: "Speaker 1".to_string(),
            speaker_tag: None,
            voice_id: default_voice.to_string(),
            original_text: parsed.text.trim().to_string(),
            translated_text: String::new(),
            tts_raw_path: None,
            tts_stretched_path: None,
            tts_duration_ms: None,
            speed_ratio: 1.0,
            status: SegmentStatus::Transcribed,
            error_message: None,
            persona: None,
            emotion: None,
        });
    }

    Ok(segments)
}

fn speaker_label_to_tag(label: &str) -> Option<String> {
    let normalized = label.to_ascii_lowercase();
    let number = normalized.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse::<u8>().ok()?;
    if (1..=5).contains(&number) { Some(format!("A{number}")) } else { None }
}
