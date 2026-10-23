# Dubber Studio Pro 🎙️🎬

> **Production-Ready Desktop AI Video Dubbing & Translation Studio**  
> Powered by **Tauri 2**, **React 19**, **TypeScript**, **Tailwind CSS**, **Motion (motion/react)**, **Zustand**, **WaveSurfer.js**, and **Rust**.

---

## ✨ Features Overview

- **Cross-Platform High-Performance Desktop NLE**: Built natively with Tauri 2 and Rust for minimum CPU/RAM footprint and hardware-accelerated video/audio processing.
- **Automated AI Video Dubbing Pipeline**:
  1. **Audio Extraction**: High-fidelity 16kHz mono (optimal for STT) and 44.1kHz stereo PCM audio demuxing.
  2. **Speech Recognition (STT)**: Sub-second word and segment level timestamping via OpenAI / Groq Whisper API, with local `whisper-cli` offline fallback.
  3. **Context-Aware Dialogue Translation**: LLM-driven dubbing translation (Google Gemini 2.5 Flash, OpenAI GPT-4o-mini, or local Ollama) enforcing natural spoken rhythm, subtitle timing constraints, and Khmer Unicode font typography (`Kantumruy Pro`).
  4. **Dynamic Speech Timing & Time-Stretching**: Automatic duration calculation and non-linear `atempo` time-stretching clamped between `1.0x` and `1.35x` to preserve natural pitch.
  5. **AI Shorten to Fit**: One-click AI rewriting of translated sentences to shorten duration by ~25% if spoken dialog exceeds the video window.
  6. **Voice Synthesis (TTS)**: Native Microsoft Edge-TTS support (including high-clarity Khmer voices `km-KH-PisethNeural` and `km-KH-SreymomNeural`, English `en-US-AndrewNeural`, etc.) and ElevenLabs REST API synthesis.
  7. **Multi-Track Audio Ducking & Final Muxing**: Complex FFmpeg filtergraph ducking original background audio to `18%` during active speech segments, positioning dubbed tracks via `adelay`, mixing with `amix`, and muxing into final MP4 or exporting SRT subtitles.
- **Glassmorphic Dark Mode Studio Interface**:
  - **Video & Audio Monitor**: HTML5 video playback with synchronized live Khmer Unicode subtitle overlays, and toggles for *Original*, *Dubbed Preview (with audio ducking)*, and *Split Comparison*.
  - **Synchronized Dialogue Script Editor**: Real-time virtualized segment cards with timestamp badges, speed-ratio indicators (Green natural, Amber fast, Red too long), editable text, and instant TTS preview.
  - **Multi-Track NLE Timeline**: Interactive WaveSurfer waveform track, draggable/resizable dubbed audio blocks with real-time speed ratio recalculation, and 60fps playhead scrubbing.

---

## 🛠️ Prerequisites

1. **FFmpeg & FFprobe**:
   - Verify installation: `ffmpeg -version` and `ffprobe -version`
   - Windows (via WinGet): `winget install Gyan.FFmpeg`
2. **Microsoft Edge-TTS** (Built-in free voice engine):
   - Install with Python: `pip install edge-tts`
   - Verify: `edge-tts --version`
3. **Node.js**: `v20+` or `v24+` (`npm -v`)
4. **Rust**: Rust toolchain (`rustc --version` & `cargo --version`). Both MSVC and GNU toolchains (`x86_64-pc-windows-gnu`) are supported.

---

## 🚀 Getting Started

### 1. Install Frontend Dependencies
```bash
npm install
```

### 2. Run in Development Mode
To launch the desktop application with hot-reloading:
```bash
npm run tauri dev
```

### 3. Build for Production Release
To compile the standalone desktop executable (`.exe` on Windows):
```bash
npm run tauri build
```
The installer and compiled binary will be generated in `src-tauri/target/release/`.

---

## 🔑 API Keys & Configuration

Click the **Settings** icon in the top toolbar to configure your preferred AI providers:
- **Google Gemini API Key**: Recommended for dubbing translations (Gemini 2.5 Flash).
- **Groq API Key / OpenAI API Key**: For fast Whisper STT speech recognition.
- **ElevenLabs API Key**: Optional for premium AI voice cloning.
- **Ollama Base URL**: For offline local LLM translation (default: `http://localhost:11434`).

---

## 📁 Architecture & File Layout

```
Dubber-studio-pro/
├── src/                          # React 19 Frontend
│   ├── components/
│   │   ├── HeaderBar.tsx         # Studio actions, language picker, theme and history controls
│   │   ├── LeftSidebar.tsx       # Video preview, playback, workspace tools and file loading
│   │   ├── SubtitleDataTable.tsx # Editable subtitle rows, voice selection and TTS preview
│   │   ├── TimelineEditor.tsx    # Multi-track timeline, audio ranges and segment editing
│   │   ├── AudioWaveformCanvas.tsx # Audio waveform rendering
│   │   ├── StatusBar.tsx         # Project, API key and system status
│   │   ├── PreferencesModal.tsx  # API keys, providers and studio preferences
│   │   ├── ExportModal.tsx       # MP4 muxing and SRT export
│   │   └── *Modal.tsx            # Supporting editing, preset and workflow dialogs
│   ├── store/
│   │   └── studioStore.ts        # Zustand application state, editing history and preferences
│   ├── types/
│   │   └── studio.ts             # Shared project, subtitle and IPC TypeScript types
│   ├── App.tsx                   # Main studio layout
│   └── main.tsx                  # React DOM entry point
├── src-tauri/                     # Rust Backend Engine
│   ├── src/
│   │   ├── models.rs             # Rust structs & enums (IPC contract)
│   │   ├── commands.rs           # Tauri IPC commands
│   │   ├── pipeline/
│   │   │   ├── ffmpeg.rs         # Audio extraction, atempo, adelay, ducking & muxing
│   │   │   ├── transcriber.rs    # Whisper API & local whisper-cli fallback
│   │   │   ├── translator.rs     # Gemini / OpenAI / Ollama translation & AI shorten
│   │   │   └── tts.rs            # Edge-TTS & ElevenLabs synthesis
│   │   ├── lib.rs                # Tauri runtime & plugin initialization
│   │   └── main.rs               # Windows entry point
│   ├── capabilities/
│   │   └── default.json          # Tauri 2 permission configuration
│   ├── tauri.conf.json           # Tauri 2 app configuration with assetProtocol
│   └── Cargo.toml                # Rust crate dependencies
└── README.md
```

---

## 🇰🇭 Khmer Language Dubbing Specialization

Dubber Studio Pro comes out-of-the-box pre-configured for Khmer dubbing:
- Pre-configured neural voices: **Piseth** (`km-KH-PisethNeural`) and **Sreymom** (`km-KH-SreymomNeural`).
- Embedded Google Fonts **Kantumruy Pro** and **Noto Sans Khmer** for rendered on-screen subtitles.
- Dubbing LLM prompt engineered specifically for conversational spoken Khmer grammar and syllable density.

---

## 📄 License
MIT License. Built for creators, translators, and studios worldwide.
