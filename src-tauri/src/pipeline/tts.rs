use std::path::PathBuf;
use crate::models::{DubSegment, SegmentStatus, TtsProvider, ApiKeysConfig};
use crate::pipeline::ffmpeg::{get_audio_duration_ms, sync_segment_duration, create_command};

pub fn pace_khmer_text(text: &str) -> String {
    let mut result = String::with_capacity(text.len() + 16);
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        result.push(ch);
        if matches!(ch, '។' | '៕' | '?' | '!') {
            if let Some(&next_ch) = chars.peek() {
                if !next_ch.is_whitespace() {
                    result.push(' ');
                }
            }
        }
    }
    result.trim().to_string()
}

pub fn resolve_persona_and_emotion(
    voice: &str,
    persona: Option<&str>,
    emotion: Option<&str>,
) -> (String, String, String) {
    let (base_voice, base_rate, base_pitch_hz) = match persona.map(|p| p.trim().to_lowercase()).as_deref() {
        Some("baby") => ("km-KH-SreymomNeural", 1.05f32, 30.0f32),
        Some("girl") => ("km-KH-SreymomNeural", 1.02f32, 20.0f32),
        Some("boy") => ("km-KH-PisethNeural", 1.03f32, 15.0f32),
        Some("young_woman") => ("km-KH-SreymomNeural", 1.00f32, 2.0f32),
        Some("young_man") => ("km-KH-PisethNeural", 1.00f32, -2.0f32),
        Some("mother") => ("km-KH-SreymomNeural", 0.98f32, -4.0f32),
        Some("father") => ("km-KH-PisethNeural", 0.98f32, -12.0f32),
        Some("grandmother") => ("km-KH-SreymomNeural", 0.93f32, -8.0f32),
        Some("grandfather") => ("km-KH-PisethNeural", 0.90f32, -22.0f32),
        Some("villain") => ("km-KH-PisethNeural", 0.95f32, -18.0f32),
        Some("narrator") => ("km-KH-PisethNeural", 0.98f32, -5.0f32),
        _ => {
            let v = if voice.trim().is_empty() { "km-KH-PisethNeural" } else { voice };
            (v, 1.00f32, 0.0f32)
        }
    };

    let (rate_delta, emotion_pitch_hz) = match emotion.map(|e| e.trim().to_lowercase()).as_deref() {
        Some("calm") => (-0.07f32, -4.0f32),
        Some("sad") => (-0.09f32, -10.0f32),
        Some("angry") => (0.04f32, 6.0f32),
        Some("happy") => (0.02f32, 8.0f32),
        Some("excited") => (0.05f32, 12.0f32),
        Some("scared") => (0.03f32, 6.0f32),
        Some("whisper") => (-0.11f32, -6.0f32),
        _ => (0.0f32, 0.0f32),
    };

    let final_rate = (base_rate + rate_delta).clamp(0.78, 1.25);
    let final_pitch = (base_pitch_hz + emotion_pitch_hz).clamp(-35.0, 35.0);

    let rate_pct = (final_rate - 1.0) * 100.0;
    let rate_attr = format!("{rate_pct:+.0}%");
    let pitch_attr = format!("{final_pitch:+.0}Hz");

    (base_voice.to_string(), rate_attr, pitch_attr)
}

pub fn polish_tts_audio(input_wav: &str, output_wav: &str, duration_ms: u64) -> Result<(), String> {
    let dur_sec = duration_ms as f64 / 1000.0;
    let fade_out = 0.035;
    let fade_in = 0.020;
    let st_out = (dur_sec - fade_out).max(0.0);

    let af = if dur_sec > (fade_out * 2.0) {
        format!("highpass=f=70,lowpass=f=12000,afade=t=in:st=0:d={fade_in:.3},afade=t=out:st={st_out:.3}:d={fade_out:.3}")
    } else {
        format!("highpass=f=70,lowpass=f=12000,afade=t=in:st=0:d={fade_in:.3}")
    };

    let status = create_command("ffmpeg")
        .args([
            "-y",
            "-i", input_wav,
            "-af", &af,
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "1",
            output_wav,
        ])
        .status()
        .map_err(|e| format!("Audio polish execution failed: {e}"))?;

    if !status.success() {
        return Err("Audio polish filter failed".to_string());
    }

    Ok(())
}

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

    let polished_filename = format!("seg_{}_polished.wav", segment.id);
    let polished_path = output_dir.join(polished_filename).to_str().unwrap().to_string();

    let stretched_filename = format!("seg_{}_sync.wav", segment.id);
    let stretched_path = output_dir.join(stretched_filename).to_str().unwrap().to_string();

    let (selected_voice, rate_attr, pitch_attr) = resolve_persona_and_emotion(
        &segment.voice_id,
        segment.persona.as_deref(),
        segment.emotion.as_deref(),
    );

    let paced_text = pace_khmer_text(text);

    let synth_res = match provider {
        TtsProvider::EdgeTts => synthesize_edge_tts(&paced_text, &selected_voice, &rate_attr, &pitch_attr, &raw_path).await,
        TtsProvider::Elevenlabs => {
            let key = api_keys.elevenlabs_api_key.as_deref().unwrap_or("").trim();
            if key.is_empty() {
                Err("ElevenLabs API key is missing. Please configure it in Settings.".to_string())
            } else {
                synthesize_elevenlabs(text, &selected_voice, key, &raw_path).await
            }
        }
    };

    if let Err(e) = synth_res {
        segment.status = SegmentStatus::Error;
        segment.error_message = Some(e.clone());
        return Err(e);
    }

    // Compute TTS duration
    let source_audio_for_sync = match get_audio_duration_ms(&raw_path) {
        Ok(dur_ms) => {
            segment.tts_duration_ms = Some(dur_ms);
            // Apply studio audio polish (micro-fades & frequency balancing)
            if polish_tts_audio(&raw_path, &polished_path, dur_ms).is_ok() {
                polished_path
            } else {
                raw_path.clone()
            }
        }
        Err(err) => {
            segment.status = SegmentStatus::Error;
            segment.error_message = Some(err.clone());
            return Err(err);
        }
    };

    segment.tts_raw_path = Some(source_audio_for_sync.clone());

    // Sync with segment duration window
    let target_duration_ms = segment.end_ms.saturating_sub(segment.start_ms);
    match sync_segment_duration(&source_audio_for_sync, &stretched_path, target_duration_ms) {
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

async fn synthesize_edge_tts(
    text: &str,
    voice: &str,
    rate_attr: &str,
    pitch_attr: &str,
    output_path: &str,
) -> Result<(), String> {
    let selected_voice = if voice.trim().is_empty() {
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

    // Try direct edge-tts CLI with rate and pitch
    let mut cmd = create_command("edge-tts");
    cmd.args([
        "--voice", selected_voice,
        "--rate", rate_attr,
        "--pitch", pitch_attr,
        "-f", &temp_txt,
        "--write-media", &temp_mp3,
    ]);

    let edge_status = cmd.status();
    let mut edge_ok = match edge_status {
        Ok(s) if s.success() => true,
        _ => false,
    };

    // Fall back to python -m edge_tts if needed
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
            "--rate", rate_attr,
            "--pitch", pitch_attr,
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
        let _ = tokio::fs::remove_file(&temp_mp3).await;
        return Err("edge-tts synthesis failed. Please ensure edge-tts is installed via `pip install edge-tts`.".to_string());
    }

    // Convert mp3 to PCM 16-bit WAV with FFmpeg
    let conv_status = create_command("ffmpeg")
        .args([
            "-y",
            "-i", &temp_mp3,
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "1",
            output_path,
        ])
        .status()
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_mp3);
            format!("Failed to convert edge-tts output to WAV: {e}")
        })?;

    let _ = std::fs::remove_file(&temp_mp3);

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
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}");

    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    });

    let resp = client
        .post(&url)
        .header("xi-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ElevenLabs request failed: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs error: {err_text}"));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Failed to read ElevenLabs audio response: {e}"))?;

    let temp_mp3 = format!("{}.mp3", output_path);
    tokio::fs::write(&temp_mp3, &bytes)
        .await
        .map_err(|e| format!("Failed to write ElevenLabs temp audio: {e}"))?;

    let conv_status = create_command("ffmpeg")
        .args([
            "-y",
            "-i", &temp_mp3,
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "1",
            output_path,
        ])
        .status()
        .map_err(|e| {
            let _ = std::fs::remove_file(&temp_mp3);
            format!("Failed to convert ElevenLabs MP3 to WAV: {e}")
        })?;

    let _ = std::fs::remove_file(&temp_mp3);

    if !conv_status.success() {
        return Err("Failed to convert ElevenLabs audio to PCM WAV".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pace_khmer_text() {
        assert_eq!(
            pace_khmer_text("សួស្តី!តើអ្នកសុខសប្បាយទេ?ខ្ញុំសុខសប្បាយ។ពិតមែនហើយ៕"),
            "សួស្តី! តើអ្នកសុខសប្បាយទេ? ខ្ញុំសុខសប្បាយ។ ពិតមែនហើយ៕"
        );
        assert_eq!(
            pace_khmer_text("ជំរាបសួរ។ បាទ"),
            "ជំរាបសួរ។ បាទ"
        );
    }

    #[test]
    fn test_resolve_persona_and_emotion() {
        let (voice, rate, pitch) = resolve_persona_and_emotion(
            "km-KH-PisethNeural",
            Some("baby"),
            Some("happy"),
        );
        assert_eq!(voice, "km-KH-SreymomNeural");
        assert!(rate.contains('%'));
        assert!(pitch.contains("Hz"));
    }
}
