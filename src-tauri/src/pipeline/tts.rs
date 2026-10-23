use std::path::PathBuf;
use crate::models::{DubSegment, SegmentStatus, TtsProvider, ApiKeysConfig};
use crate::pipeline::ffmpeg::{get_audio_duration_ms, sync_segment_duration, create_command};

pub async fn synthesize_segment(
    segment: &mut DubSegment,
    provider: &TtsProvider,
    output_dir: &PathBuf,
    api_keys: &ApiKeysConfig,
) -> Result<(), String> {
    let text = if !segment.translated_text.trim().is_empty() {
        &segment.translated_text
    } else {
        &segment.original_text
    };

    if text.trim().is_empty() {
        segment.status = SegmentStatus::Error;
        segment.error_message = Some("No text available to synthesize".to_string());
        return Err("No text available to synthesize".to_string());
    }

    segment.status = SegmentStatus::Synthesizing;

    let raw_filename = format!("seg_{}_raw.wav", segment.id);
    let raw_path = output_dir.join(raw_filename).to_str().unwrap().to_string();

    let stretched_filename = format!("seg_{}_sync.wav", segment.id);
    let stretched_path = output_dir.join(stretched_filename).to_str().unwrap().to_string();

    let synth_res = match provider {
        TtsProvider::EdgeTts => synthesize_edge_tts(text, &segment.voice_id, &raw_path).await,
        TtsProvider::Elevenlabs => {
            let key = api_keys.elevenlabs_api_key.as_deref().unwrap_or("").trim();
            if key.is_empty() {
                Err("ElevenLabs API key is missing. Please configure it in Settings.".to_string())
            } else {
                synthesize_elevenlabs(text, &segment.voice_id, key, &raw_path).await
            }
        }
    };

    if let Err(e) = synth_res {
        segment.status = SegmentStatus::Error;
        segment.error_message = Some(e.clone());
        return Err(e);
    }

    segment.tts_raw_path = Some(raw_path.clone());

    // Compute TTS duration and sync with segment duration window
    let target_duration_ms = segment.end_ms.saturating_sub(segment.start_ms);
    match get_audio_duration_ms(&raw_path) {
        Ok(dur_ms) => {
            segment.tts_duration_ms = Some(dur_ms);
            match sync_segment_duration(&raw_path, &stretched_path, target_duration_ms) {
                Ok(ratio) => {
                    segment.tts_stretched_path = Some(stretched_path);
                    segment.speed_ratio = ratio;
                    segment.status = SegmentStatus::Ready;
                    segment.error_message = None;
                    Ok(())
                }
                Err(err) => {
                    segment.status = SegmentStatus::Error;
                    segment.error_message = Some(err.clone());
                    Err(err)
                }
            }
        }
        Err(err) => {
            segment.status = SegmentStatus::Error;
            segment.error_message = Some(err.clone());
            Err(err)
        }
    }
}

async fn synthesize_edge_tts(text: &str, voice: &str, output_path: &str) -> Result<(), String> {
    // Determine voice name (fallback to Khmer if empty or starts with km)
    let selected_voice = if voice.is_empty() {
        "km-KH-PisethNeural"
    } else {
        voice
    };

    let temp_txt = format!("{}.txt", output_path);
    let temp_mp3 = format!("{}.mp3", output_path);

    // Write text to UTF-8 file to prevent command line length or quote escaping issues
    tokio::fs::write(&temp_txt, text.as_bytes())
        .await
        .map_err(|e| format!("Failed to write text to temp file: {e}"))?;

    // Try direct edge-tts CLI
    let mut cmd = create_command("edge-tts");
    cmd.args([
        "--voice", selected_voice,
        "-f", &temp_txt,
        "--write-media", &temp_mp3,
    ]);

    let edge_status = cmd.status();
    let mut edge_ok = match edge_status {
        Ok(s) if s.success() => true,
        _ => false,
    };

    // If edge-tts direct command failed, fall back to python -m edge_tts
    if !edge_ok {
        let mut py_cmd = std::process::Command::new("python");
        py_cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            py_cmd.creation_flags(0x08000000);
        }
        py_cmd.args([
            "-m", "edge_tts",
            "--voice", selected_voice,
            "-f", &temp_txt,
            "--write-media", &temp_mp3,
        ]);

        if let Ok(py_status) = py_cmd.status() {
            if py_status.success() {
                edge_ok = true;
            }
        }
    }

    // Clean up temporary text file
    let _ = tokio::fs::remove_file(&temp_txt).await;

    if !edge_ok {
        return Err("edge-tts synthesis failed. Please ensure edge-tts is installed via `pip install edge-tts`.".to_string());
    }

    // Convert mp3 to PCM 16-bit WAV with FFmpeg
    let conv_status = create_command("ffmpeg")
        .args([
            "-y",
            "-i", &temp_mp3,
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            output_path,
        ])
        .status()
        .map_err(|e| format!("Failed to convert edge-tts output to WAV: {e}"))?;

    // Cleanup temp mp3
    let _ = std::fs::remove_file(temp_mp3);

    if !conv_status.success() {
        return Err("Failed to convert synthesized MP3 to WAV".to_string());
    }

    Ok(())
}

async fn synthesize_elevenlabs(
    text: &str,
    voice_id: &str,
    api_key: &str,
    output_path: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);

    let payload = serde_json::json!({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    });

    let res = client
        .post(&url)
        .header("xi-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("ElevenLabs HTTP request failed: {e}"))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs API error: {err_text}"));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;

    let temp_mp3 = format!("{}.mp3", output_path);
    tokio::fs::write(&temp_mp3, &bytes).await.map_err(|e| e.to_string())?;

    // Convert mp3 to 44.1kHz WAV
    let conv_status = create_command("ffmpeg")
        .args([
            "-y",
            "-i", &temp_mp3,
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            output_path,
        ])
        .status()
        .map_err(|e| format!("Failed to convert ElevenLabs MP3 to WAV: {e}"))?;

    let _ = std::fs::remove_file(temp_mp3);

    if !conv_status.success() {
        return Err("Failed to convert ElevenLabs audio to WAV".to_string());
    }

    Ok(())
}
