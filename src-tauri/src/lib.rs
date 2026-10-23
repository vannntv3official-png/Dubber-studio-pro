pub mod models;
pub mod pipeline;
pub mod commands;
pub mod security;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::run_full_pipeline,
            commands::run_auto_dub_pipeline,
            commands::isolate_bgm,
            commands::regenerate_segment_tts,
            commands::auto_fit_segment,
            commands::export_dubbed_video,
            commands::export_srt_file,
            commands::get_system_metrics,
            commands::extract_video_frame,
            commands::detect_frame_subtitles,
            commands::open_path_in_explorer,
            commands::save_secure_keys,
            commands::load_secure_keys,
            commands::has_secure_keys,
            commands::delete_secure_keys
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
