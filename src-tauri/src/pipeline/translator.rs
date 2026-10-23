use serde::{Deserialize, Serialize};
use crate::models::{DubSegment, LlmProvider, ApiKeysConfig};

#[derive(Debug, Serialize, Deserialize)]
struct TranslationInputItem {
    id: String,
    index: usize,
    duration_ms: u64,
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TranslationOutputItem {
    id: String,
    translated_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TranslationBatchResponse {
    translations: Vec<TranslationOutputItem>,
}

pub async fn translate_segments(
    segments: &mut [DubSegment],
    source_lang: &str,
    target_lang: &str,
    provider: &LlmProvider,
    api_keys: &ApiKeysConfig,
) -> Result<(), String> {
    if segments.is_empty() {
        return Ok(());
    }

    // Process in batches of 15
    let chunk_size = 15;
    for chunk in segments.chunks_mut(chunk_size) {
        let input_items: Vec<TranslationInputItem> = chunk
            .iter()
            .map(|s| TranslationInputItem {
                id: s.id.clone(),
                index: s.index,
                duration_ms: s.end_ms.saturating_sub(s.start_ms),
                text: s.original_text.clone(),
            })
            .collect();

        let translated_items = match provider {
            LlmProvider::Gemini => {
                let key = api_keys.gemini_api_key.as_deref().unwrap_or("").trim();
                if key.is_empty() {
                    return Err("Gemini API key is missing. Please configure it in Settings.".to_string());
                }
                translate_chunk_gemini(&input_items, source_lang, target_lang, key).await?
            }
            LlmProvider::Openai => {
                let key = api_keys.openai_api_key.as_deref().unwrap_or("").trim();
                if key.is_empty() {
                    return Err("OpenAI API key is missing. Please configure it in Settings.".to_string());
                }
                translate_chunk_openai(&input_items, source_lang, target_lang, key).await?
            }
            LlmProvider::Ollama => {
                let base_url = api_keys.ollama_base_url.as_deref().unwrap_or("http://localhost:11434");
                translate_chunk_ollama(&input_items, source_lang, target_lang, base_url).await?
            }
        };

        let returned_ids: std::collections::HashSet<&str> = translated_items.iter().map(|item| item.id.as_str()).collect();
        if returned_ids.len() != translated_items.len() {
            return Err("Translation provider returned duplicate cue IDs in a batch. Retry the translation.".to_string());
        }
        let missing_count = chunk.iter()
            .filter(|segment| !returned_ids.contains(segment.id.as_str()))
            .count();
        if missing_count > 0 {
            return Err(format!("Translation provider omitted {missing_count} segment(s) in a batch; retry the translation or edit those cues manually."));
        }
        if translated_items.iter().any(|item| item.translated_text.trim().is_empty()) {
            return Err("Translation provider returned an empty subtitle. Retry the translation or edit the affected cue manually.".to_string());
        }

        // Match back translations to segments
        for item in translated_items {
            if let Some(seg) = chunk.iter_mut().find(|s| s.id == item.id) {
                seg.translated_text = item.translated_text.trim().to_string();
                seg.status = crate::models::SegmentStatus::Translated;
            }
        }
    }

    Ok(())
}

fn build_system_prompt(source_lang: &str, target_lang: &str) -> String {
    format!(
        r#"You are a professional film and video dubbing translator specializing in {source_lang} to {target_lang}.
Your task is to translate spoken dialog segments for voice-over synchronization (lip-sync / dubbing).
CRITICAL RULES:
1. Spoken, conversational phrasing: Use natural spoken language fitting the rhythm of dialog. For Khmer (km-KH), use natural, flowing spoken Khmer phrases with correct spacing and punctuation.
2. Timing constraint: Keep the translated speech length proportionate to `duration_ms` so the voice actor / TTS can speak it without rushing.
3. Preserve IDs: Output ONLY a JSON object matching this schema:
{{
  "translations": [
    {{
      "id": "<matching segment id>",
      "translated_text": "<natural translation>"
    }}
  ]
}}
DO NOT include markdown wrappers, explanations, or commentary."#
    )
}

async fn translate_chunk_gemini(
    items: &[TranslationInputItem],
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
) -> Result<Vec<TranslationOutputItem>, String> {
    let client = reqwest::Client::new();
    let models_to_try = ["gemini-3.7-flash", "gemini-2.5-flash"];
    let system_prompt = build_system_prompt(source_lang, target_lang);
    let items_json = serde_json::to_string(items).map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "system_instruction": {
            "parts": [{ "text": system_prompt }]
        },
        "contents": [{
            "parts": [{
                "text": format!("Translate these segments:\n{items_json}")
            }]
        }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.3
        }
    });

    let mut last_err = String::new();
    for model in models_to_try {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        );

        let res = match client.post(&url).json(&payload).send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("Gemini API request failed for {model}: {e}");
                continue;
            }
        };

        let status = res.status();
        if status.is_success() {
            let json_body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let content_text = json_body["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .ok_or_else(|| "Failed to extract text from Gemini response".to_string())?;

            let parsed: TranslationBatchResponse = serde_json::from_str(content_text)
                .map_err(|e| format!("Failed to parse Gemini JSON translation response: {e}\nRaw: {content_text}"))?;

            return Ok(parsed.translations);
        } else {
            let err_text = res.text().await.unwrap_or_default();
            last_err = format!("Gemini API error ({model}): {err_text}");
            if status.as_u16() == 429 || status.as_u16() == 404 || status.as_u16() == 503 {
                log::warn!("Gemini {model} rate limited or unavailable (HTTP {status}), falling back to next model...");
                continue;
            } else {
                return Err(last_err);
            }
        }
    }

    Err(last_err)
}

async fn translate_chunk_openai(
    items: &[TranslationInputItem],
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
) -> Result<Vec<TranslationOutputItem>, String> {
    let client = reqwest::Client::new();
    let system_prompt = build_system_prompt(source_lang, target_lang);
    let items_json = serde_json::to_string(items).map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "model": "gpt-4o-mini",
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": format!("Translate these segments:\n{items_json}") }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.3
    });

    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("OpenAI API request failed: {e}"))?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error: {err}"));
    }

    let json_body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content_text = json_body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| "Failed to extract content from OpenAI response".to_string())?;

    let parsed: TranslationBatchResponse = serde_json::from_str(content_text)
        .map_err(|e| format!("Failed to parse OpenAI JSON translation: {e}\nRaw: {content_text}"))?;

    Ok(parsed.translations)
}

async fn translate_chunk_ollama(
    items: &[TranslationInputItem],
    source_lang: &str,
    target_lang: &str,
    base_url: &str,
) -> Result<Vec<TranslationOutputItem>, String> {
    let client = reqwest::Client::new();
    let system_prompt = build_system_prompt(source_lang, target_lang);
    let items_json = serde_json::to_string(items).map_err(|e| e.to_string())?;

    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));
    let payload = serde_json::json!({
        "model": "llama3.2",
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": format!("Translate these segments:\n{items_json}") }
        ],
        "format": "json",
        "stream": false
    });

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Ollama error: {err}"));
    }

    let json_body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content_text = json_body["message"]["content"]
        .as_str()
        .ok_or_else(|| "Failed to extract content from Ollama response".to_string())?;

    let parsed: TranslationBatchResponse = serde_json::from_str(content_text)
        .map_err(|e| format!("Failed to parse Ollama JSON translation: {e}\nRaw: {content_text}"))?;

    Ok(parsed.translations)
}

pub async fn shorten_segment_translation(
    segment: &DubSegment,
    provider: &LlmProvider,
    api_keys: &ApiKeysConfig,
) -> Result<String, String> {
    let target_ms = segment.end_ms.saturating_sub(segment.start_ms);
    let prompt = format!(
        "The following translated dubbing text is too long and causes speech to rush. Rewrite it to be 25-35% shorter and more concise while preserving the exact core meaning. Spoken natural dialog only. Output ONLY the rewritten sentence without quotes or commentary.\n\nOriginal: {}\nTarget Duration: {}ms\nCurrent text: {}",
        segment.original_text, target_ms, segment.translated_text
    );

    match provider {
        LlmProvider::Gemini => {
            let key = api_keys.gemini_api_key.as_deref().unwrap_or("").trim();
            if key.is_empty() {
                return Err("Gemini API key is required to shorten translation".to_string());
            }
            let client = reqwest::Client::new();
            let models = ["gemini-3.7-flash", "gemini-2.5-flash"];
            let payload = serde_json::json!({
                "contents": [{ "parts": [{ "text": prompt }] }],
                "generationConfig": { "temperature": 0.4 }
            });

            let mut shortened_text = segment.translated_text.clone();
            for model in models {
                let url = format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
                );
                if let Ok(res) = client.post(&url).json(&payload).send().await {
                    if res.status().is_success() {
                        if let Ok(json_body) = res.json::<serde_json::Value>().await {
                            if let Some(text) = json_body["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                                shortened_text = text.trim().to_string();
                                break;
                            }
                        }
                    }
                }
            }
            Ok(shortened_text)
        }
        LlmProvider::Openai => {
            let key = api_keys.openai_api_key.as_deref().unwrap_or("").trim();
            if key.is_empty() {
                return Err("OpenAI API key is required to shorten translation".to_string());
            }
            let client = reqwest::Client::new();
            let payload = serde_json::json!({
                "model": "gpt-4o-mini",
                "messages": [
                    { "role": "system", "content": "You are a professional film dubbing director. Shorten dialog concisely." },
                    { "role": "user", "content": prompt }
                ],
                "temperature": 0.4
            });
            let res = client.post("https://api.openai.com/v1/chat/completions")
                .bearer_auth(key)
                .json(&payload)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if !res.status().is_success() {
                let error = res.text().await.unwrap_or_default();
                return Err(format!("OpenAI shortening request failed: {error}"));
            }
            let json_body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let shortened = json_body["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or(&segment.translated_text)
                .trim()
                .to_string();
            Ok(shortened)
        }
        LlmProvider::Ollama => {
            let base_url = api_keys.ollama_base_url.as_deref().unwrap_or("http://localhost:11434");
            let client = reqwest::Client::new();
            let url = format!("{}/api/chat", base_url.trim_end_matches('/'));
            let payload = serde_json::json!({
                "model": "llama3.2",
                "messages": [{ "role": "user", "content": prompt }],
                "stream": false
            });
            let res = client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
            if !res.status().is_success() {
                let error = res.text().await.unwrap_or_default();
                return Err(format!("Ollama shortening request failed: {error}"));
            }
            let json_body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            let shortened = json_body["message"]["content"]
                .as_str()
                .unwrap_or(&segment.translated_text)
                .trim()
                .to_string();
            Ok(shortened)
        }
    }
}
