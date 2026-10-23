use std::path::{Path, PathBuf};
use std::process::Command;
use crate::models::{DubSegment, OrigAudioRange};

fn apply_process_flags(mut cmd: Command) -> Command {
    cmd.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW prevents console popup flashes
    }
    cmd
}

pub fn create_command(name: &str) -> Command {
    // 1. Try sidecar path relative to current executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidate_sidecar = exe_dir.join(format!("{}-x86_64-pc-windows-gnu.exe", name));
            if candidate_sidecar.exists() {
                return apply_process_flags(Command::new(candidate_sidecar));
            }
            let candidate_plain = exe_dir.join(format!("{}.exe", name));
            if candidate_plain.exists() {
                return apply_process_flags(Command::new(candidate_plain));
            }
            let candidate_binaries = exe_dir.join("binaries").join(format!("{}.exe", name));
            if candidate_binaries.exists() {
                return apply_process_flags(Command::new(candidate_binaries));
            }
        }
    }

    // 2. Try project directory src-tauri/binaries/
    let local_sidecar = Path::new("binaries").join(format!("{}-x86_64-pc-windows-gnu.exe", name));
    if local_sidecar.exists() {
        return apply_process_flags(Command::new(local_sidecar));
    }
    let local_plain = Path::new("binaries").join(format!("{}.exe", name));
    if local_plain.exists() {
        return apply_process_flags(Command::new(local_plain));
    }

    // 3. Try standard Python scripts directory on Windows dynamically
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let py_root = PathBuf::from(&local_app_data).join("Programs").join("Python");
            if let Ok(entries) = std::fs::read_dir(&py_root) {
                for entry in entries.flatten() {
                    let script_candidate = entry.path().join("Scripts").join(format!("{}.exe", name));
                    if script_candidate.exists() {
                        return apply_process_flags(Command::new(script_candidate));
                    }
                }
            }
        }
    }

    apply_process_flags(Command::new(name))
}

pub fn extract_audio(video_path: &str, out_wav_stt: &str, out_wav_mix: &str) -> Result<(), String> {
    // 1. 16kHz mono 16-bit PCM for STT (Whisper optimal)
    let status_stt = create_command("ffmpeg")
        .args([
            "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            out_wav_stt,
        ])
        .status()
        .map_err(|e| format!("Failed to execute ffmpeg for STT extraction: {e}"))?;

    if !status_stt.success() {
        return Err(format!("FFmpeg audio extraction for STT failed with code {:?}", status_stt.code()));
    }

    // 2. 44.1kHz stereo 16-bit PCM for studio timeline and master mixing
    let status_mix = create_command("ffmpeg")
        .args([
            "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            out_wav_mix,
        ])
        .status()
        .map_err(|e| format!("Failed to execute ffmpeg for mix extraction: {e}"))?;

    if !status_mix.success() {
        return Err(format!("FFmpeg audio extraction for mix failed with code {:?}", status_mix.code()));
    }

    Ok(())
}

pub fn get_audio_duration_ms(audio_path: &str) -> Result<u64, String> {
    // Attempt with ffprobe first
    let output = create_command("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let duration_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(duration_sec) = duration_str.parse::<f64>() {
                return Ok((duration_sec * 1000.0).round() as u64);
            }
        }
    }

    // Fallback: hound crate for WAV files
    if Path::new(audio_path).extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) == Some("wav".to_string()) {
        if let Ok(reader) = hound::WavReader::open(audio_path) {
            let spec = reader.spec();
            let duration_samples = reader.duration();
            let duration_sec = duration_samples as f64 / spec.sample_rate as f64;
            return Ok((duration_sec * 1000.0).round() as u64);
        }
    }

    Err(format!("Could not determine audio duration for: {audio_path}"))
}

pub fn sync_segment_duration(input_audio: &str, output_audio: &str, target_duration_ms: u64) -> Result<f64, String> {
    let actual_duration_ms = get_audio_duration_ms(input_audio)?;
    if target_duration_ms == 0 {
        return Err("Target duration cannot be 0".to_string());
    }

    let raw_ratio = actual_duration_ms as f64 / target_duration_ms as f64;
    
    // Clamp tempo dynamically between 0.80 and 1.35
    let tempo = if raw_ratio > 1.0 {
        raw_ratio.min(1.35)
    } else if raw_ratio < 0.80 {
        raw_ratio.max(0.80)
    } else {
        raw_ratio
    };

    let status = if (tempo - 1.0).abs() < 0.02 {
        create_command("ffmpeg")
            .args(["-y", "-i", input_audio, "-vn", "-c:a", "pcm_s16le", output_audio])
            .status()
    } else {
        create_command("ffmpeg")
            .args([
                "-y",
                "-i", input_audio,
                "-vn",
                "-filter:a", &format!("atempo={:.3}", tempo),
                "-c:a", "pcm_s16le",
                output_audio,
            ])
            .status()
    }.map_err(|e| format!("Failed to run ffmpeg atempo: {e}"))?;

    if !status.success() {
        return Err(format!("FFmpeg atempo time-stretching failed with exit code {:?}", status.code()));
    }

    Ok(raw_ratio)
}

/// Isolate BGM / Instrumental stem via Demucs or FFmpeg vocal elimination filter (Instrumental V:0.5)
pub fn isolate_bgm(video_or_audio_path: &str, output_dir: &str) -> Result<String, String> {
    std::fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;

    let out_instrumental = Path::new(output_dir).join("instrumental_44k.wav");
    let out_instrumental_str = out_instrumental.to_str().unwrap().to_string();

    // Check if Demucs is available and attempt Demucs separation
    let mut demucs_succeeded = false;
    let demucs_check = create_command("demucs").arg("--help").output();

    if let Ok(out) = demucs_check {
        if out.status.success() {
            // Run demucs two-stems separation
            let status = create_command("demucs")
                .args([
                    "--two-stems=vocals",
                    "-o", output_dir,
                    video_or_audio_path,
                ])
                .status();

            if let Ok(s) = status {
                if s.success() {
                    // Check for output file
                    let file_stem = Path::new(video_or_audio_path).file_stem().and_then(|s| s.to_str()).unwrap_or("audio");
                    let candidate = Path::new(output_dir).join("htdemucs").join(file_stem).join("no_vocals.wav");
                    if candidate.exists() {
                        // Apply volume 0.5 to instrumental
                        let vol_status = create_command("ffmpeg")
                            .args([
                                "-y",
                                "-i", candidate.to_str().unwrap(),
                                "-filter:a", "volume=0.5",
                                "-c:a", "pcm_s16le",
                                "-ar", "44100",
                                &out_instrumental_str,
                            ])
                            .status();

                        if let Ok(vs) = vol_status {
                            if vs.success() {
                                demucs_succeeded = true;
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback: FFmpeg center-channel vocal cancellation / band-stop vocal filtering with volume=0.5
    if !demucs_succeeded {
        let status = create_command("ffmpeg")
            .args([
                "-y",
                "-i", video_or_audio_path,
                "-vn",
                "-filter_complex",
                "[0:a]pan=stereo|c0=c0-c1|c1=c1-c0,highpass=f=200,lowpass=f=3500,volume=0.5[aout]",
                "-map", "[aout]",
                "-c:a", "pcm_s16le",
                "-ar", "44100",
                &out_instrumental_str,
            ])
            .status()
            .map_err(|e| format!("FFmpeg vocal isolation fallback failed: {e}"))?;

        if !status.success() {
            return Err(format!("Audio vocal isolation failed with exit code {:?}", status.code()));
        }
    }

    Ok(out_instrumental_str)
}

pub fn export_srt_file(segments: &[DubSegment], output_path: &str) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create SRT file at {output_path}: {e}"))?;

    for (i, seg) in segments.iter().enumerate() {
        let index = i + 1;
        let start_time = format_srt_timestamp(seg.start_ms);
        let end_time = format_srt_timestamp(seg.end_ms);
        let text = if !seg.translated_text.trim().is_empty() {
            &seg.translated_text
        } else {
            &seg.original_text
        };

        writeln!(file, "{index}\n{start_time} --> {end_time}\n{text}\n")
            .map_err(|e| format!("Failed to write SRT entry: {e}"))?;
    }

    Ok(())
}

fn format_srt_timestamp(ms: u64) -> String {
    let hours = ms / 3_600_000;
    let rem = ms % 3_600_000;
    let minutes = rem / 60_000;
    let rem = rem % 60_000;
    let seconds = rem / 1000;
    let millis = rem % 1000;

    format!("{hours:02}:{minutes:02}:{seconds:02},{millis:03}")
}

pub fn mix_and_mux_video(
    video_path: &str,
    bg_audio_path: &str,
    segments: &[DubSegment],
    ducking_vol: f32,
    original_gain: f32,
    original_muted: bool,
    dub_gain: f32,
    bgm_gain: f32,
    master_gain: f32,
    master_muted: bool,
    peak_limiter: bool,
    bgm_path: Option<&str>,
    ducking_enabled: bool,
    orig_ranges: &[OrigAudioRange],
    burn_subtitles: bool,
    quality: &str,
    final_speed: f32,
    flip_h: bool,
    flip_v: bool,
    rotation: u16,
    srt_path: Option<&str>,
    output_mp4: &str,
) -> Result<(), String> {
    let mut active_segments: Vec<&DubSegment> = segments
        .iter()
        .filter(|s| {
            s.tts_stretched_path.as_ref().map_or(false, |p| Path::new(p).exists())
                || s.tts_raw_path.as_ref().map_or(false, |p| Path::new(p).exists())
        })
        .collect();

    active_segments.sort_by_key(|s| s.start_ms);

    let mut cmd = create_command("ffmpeg");
    cmd.arg("-y");

    // Input 0: original video
    cmd.args(["-i", video_path]);

    // Input 1: high quality original audio track
    cmd.args(["-i", bg_audio_path]);

    let bgm_input_idx = bgm_path.filter(|p| Path::new(p).exists()).map(|p| {
        cmd.arg("-i").arg(p);
        2usize
    });

    // Additional inputs: each active TTS segment
    for seg in &active_segments {
        let path = seg
            .tts_stretched_path
            .as_ref()
            .filter(|path| Path::new(path).exists())
            .or_else(|| seg.tts_raw_path.as_ref().filter(|path| Path::new(path).exists()))
            .ok_or_else(|| format!("No usable synthesized audio file for segment {}", seg.id))?;
        cmd.arg("-i").arg(path);
    }

    // Build filter_complex
    let mut filter_complex = String::new();

    // Apply dialogue ducking and user-defined original-audio regions.
    let duck_conditions: Vec<String> = active_segments.iter().map(|seg| {
        format!("between(t,{:.3},{:.3})", seg.start_ms as f64 / 1000.0, seg.end_ms as f64 / 1000.0)
    }).collect();
    let duck_volume = if ducking_enabled { ducking_vol.clamp(0.0, 1.0) } else { 1.0 };
    let mut volume_expr = if duck_conditions.is_empty() { "1.0".to_string() }
        else { format!("if({}, {duck_volume:.3}, 1.0)", duck_conditions.join("+")) };
    for range in orig_ranges {
        if range.end_ms <= range.start_ms { continue; }
        let start = range.start_ms as f64 / 1000.0;
        let end = range.end_ms as f64 / 1000.0;
        let gain = range.gain.clamp(0.0, 4.0);
        let level = match range.action.as_str() {
            "mute" => "0".to_string(),
            "keep" => format!("{gain:.3}"),
            _ => format!("min({gain:.3},{duck_volume:.3})"),
        };
        let fade_in = (range.fade_in_ms as f64 / 1000.0).min(end - start);
        let fade_out = (range.fade_out_ms as f64 / 1000.0).min(end - start);
        let fade = if fade_in > 0.0 || fade_out > 0.0 {
            let in_expr = if fade_in > 0.0 { format!("min(1,(t-{start:.3})/{fade_in:.3})") } else { "1".to_string() };
            let out_expr = if fade_out > 0.0 { format!("min(1,({end:.3}-t)/{fade_out:.3})") } else { "1".to_string() };
            format!("({in_expr})*({out_expr})")
        } else { "1".to_string() };
        volume_expr = format!("if(between(t,{start:.3},{end:.3}),({level})*({fade}),{volume_expr})");
    }
    volume_expr = if original_muted { "0.0".to_string() }
        else { format!("({:.3})*({volume_expr})", original_gain.clamp(0.0, 2.0)) };
    filter_complex.push_str(&format!("[1:a]volume=eval=frame:volume='{volume_expr}'[bg_ducked];"));
    if active_segments.is_empty() {
        filter_complex.push_str("[bg_ducked]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]");
    } else {
        // 2. Delay each segment audio track to its start_ms
        let mut mix_inputs = vec!["[bg_ducked]".to_string()];
        for (i, seg) in active_segments.iter().enumerate() {
            let input_idx = i + 2 + if bgm_input_idx.is_some() { 1 } else { 0 }; // video is 0, original is 1
            let delay_ms = seg.start_ms;
            let delayed_tag = format!("[seg_{i}]");
            let duration_sec = seg.end_ms.saturating_sub(seg.start_ms) as f64 / 1000.0;
            filter_complex.push_str(&format!(
                "[{input_idx}:a]volume={dub_gain:.3},atrim=duration={duration_sec:.3},asetpts=PTS-STARTPTS,adelay={delay_ms}|{delay_ms}{delayed_tag};"
            ));
            mix_inputs.push(delayed_tag);
        }

        if let Some(bgm_idx) = bgm_input_idx {
            filter_complex.push_str(&format!("[{bgm_idx}:a]volume={bgm_gain:.3}[music];"));
            mix_inputs.push("[music]".to_string());
        }

        // 3. Mix all tracks together
        let total_inputs = mix_inputs.len();
        let all_mix_tags = mix_inputs.join("");
        filter_complex.push_str(&format!(
            "{all_mix_tags}amix=inputs={total_inputs}:duration=first:dropout_transition=0:normalize=0[aout]"
        ));
    }

    if active_segments.is_empty() {
        if let Some(bgm_idx) = bgm_input_idx {
            filter_complex.push_str(&format!(";[{bgm_idx}:a]volume={bgm_gain:.3}[music];[aout][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout_bgm]"));
        }
    }

    let pre_master = if active_segments.is_empty() && bgm_input_idx.is_some() { "aout_bgm" } else { "aout" };
    let master_level = if master_muted { 0.0 } else { master_gain.clamp(0.0, 2.0) };
    let limiter = if peak_limiter { ",alimiter=limit=0.989" } else { "" };
    filter_complex.push_str(&format!(";[{pre_master}]volume={master_level:.3}{limiter}[master]"));

    let speed = if final_speed.is_finite() { final_speed.clamp(0.5, 2.0) } else { 1.0 };
    if (speed - 1.0).abs() >= 0.001 {
        filter_complex.push_str(&format!(";[master]atempo={speed:.4}[audio_speed]"));
    }

    // Write filter_complex to temporary script file to avoid Windows command line length overflow (8191 char limit)
    let mut temp_filter_file = std::env::temp_dir();
    temp_filter_file.push("dubber_studio_pro");
    let _ = std::fs::create_dir_all(&temp_filter_file);
    let filter_script_path = temp_filter_file.join(format!("filter_graph_{}.txt", uuid::Uuid::new_v4()));
    std::fs::write(&filter_script_path, &filter_complex)
        .map_err(|e| format!("Failed to write FFmpeg filter graph script: {e}"))?;

    cmd.arg("-filter_complex_script").arg(&filter_script_path);

    let mut video_filters = Vec::new();
    if burn_subtitles && srt_path.is_some() {
        let srt = srt_path.unwrap().replace('\\', "/").replace(':', "\\:").replace('\'', "\\'");
        video_filters.push(format!("subtitles='{srt}'"));
    }
    match rotation % 360 {
        90 => video_filters.push("transpose=1".to_string()),
        180 => { video_filters.push("hflip".to_string()); video_filters.push("vflip".to_string()); }
        270 => video_filters.push("transpose=2".to_string()),
        _ => {}
    }
    if flip_h { video_filters.push("hflip".to_string()); }
    if flip_v { video_filters.push("vflip".to_string()); }
    if (speed - 1.0).abs() >= 0.001 {
        video_filters.push(format!("setpts=PTS/{speed:.4}"));
    }
    if !video_filters.is_empty() {
        cmd.args(["-vf", &video_filters.join(",")]);
    }
    let encode_video = !video_filters.is_empty();
    if encode_video {
        let crf = match quality { "best" => "18", "small" => "26", _ => "21" };
        cmd.args(["-c:v", "libx264", "-crf", crf, "-preset", "fast"]);
    } else {
        cmd.args(["-c:v", "copy"]);
    }

    cmd.args([
        "-map", "0:v:0",
        "-map", if (speed - 1.0).abs() >= 0.001 { "[audio_speed]" } else { "[master]" },
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_mp4,
    ]);

    let status = cmd.status().map_err(|e| {
        let _ = std::fs::remove_file(&filter_script_path);
        format!("Failed to execute ffmpeg mix and mux: {e}")
    })?;

    let _ = std::fs::remove_file(&filter_script_path);

    if !status.success() {
        return Err(format!("FFmpeg mixing/muxing failed with exit code {:?}", status.code()));
    }

    Ok(())
}

pub fn extract_video_frame_at_time(video_path: &str, timestamp_ms: u64, out_image_path: &str) -> Result<(), String> {
    let sec = timestamp_ms as f64 / 1000.0;
    let status = create_command("ffmpeg")
        .args([
            "-y",
            "-ss", &format!("{:.3}", sec),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            out_image_path,
        ])
        .status()
        .map_err(|e| format!("Failed to extract video frame snapshot: {e}"))?;

    if !status.success() {
        return Err("Failed to capture video snapshot frame via FFmpeg".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_srt_timestamp() {
        assert_eq!(format_srt_timestamp(0), "00:00:00,000");
        assert_eq!(format_srt_timestamp(999), "00:00:00,999");
        assert_eq!(format_srt_timestamp(1_000), "00:00:01,000");
        assert_eq!(format_srt_timestamp(61_234), "00:01:01,234");
        assert_eq!(format_srt_timestamp(3_661_500), "01:01:01,500");
        assert_eq!(format_srt_timestamp(36_000_000), "10:00:00,000");
    }

    #[test]
    fn test_export_srt_buffer() {
        let segs = vec![
            DubSegment {
                id: "s1".to_string(),
                index: 0,
                start_ms: 1000,
                end_ms: 3000,
                speaker: "S1".to_string(),
                speaker_tag: None,
                voice_id: "voice1".to_string(),
                original_text: "Original line".to_string(),
                translated_text: "Translated line".to_string(),
                tts_raw_path: None,
                tts_stretched_path: None,
                tts_duration_ms: None,
                speed_ratio: 1.0,
                status: crate::models::SegmentStatus::Ready,
                error_message: None,
            }
        ];

        let temp_dir = std::env::temp_dir().join(format!("dubber_test_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let srt_file = temp_dir.join("test.srt");
        let res = export_srt_file(&segs, srt_file.to_str().unwrap());
        assert!(res.is_ok());

        let content = std::fs::read_to_string(&srt_file).unwrap();
        assert!(content.contains("1\n00:00:01,000 --> 00:00:03,000\nTranslated line\n"));
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
