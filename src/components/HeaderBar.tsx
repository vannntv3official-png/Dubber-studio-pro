import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Download,
  Sun,
  Moon,
  HelpCircle,
  Settings,
  Folder,
  ChevronDown,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStudioStore } from '../store/studioStore';
import { SUPPORTED_LANGUAGES } from '../types/studio';

export const HeaderBar: React.FC = () => {
  const {
    theme,
    toggleTheme,
    setSettingsOpen,
    setPreferencesActiveTab,
    setAppTourOpen,
    setDaiRecapOpen,
    setExportOpen,
    targetLang,
    setTargetLang,
    undoSegments,
    redoSegments,
    undoStack,
    redoStack,
    project,
  } = useStudioStore();

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) {
        setShowFolderMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoSegments();
        else undoSegments();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoSegments();
      }
    };
    window.addEventListener('keydown', handleHistoryShortcut);
    return () => window.removeEventListener('keydown', handleHistoryShortcut);
  }, [undoSegments, redoSegments]);

  return (
    <header className="h-12 px-3 bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between relative z-20 shrink-0 select-none shadow-2xs transition-colors">

      {/* Left: App Logo + Title + PRO badge + Subtitle */}
      <div className="flex items-center gap-2.5">
        {/* Logo block */}
        <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-zinc-800 flex items-center justify-center text-white font-bold text-[11px] shadow-sm shrink-0 border border-slate-700">
          <span className="text-indigo-400">D</span>AI
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-zinc-100">
            DAI Dubber
          </span>

          {/* PRO Badge — gradient amber/orange matching mockup */}
          <span
            onClick={() => {
              setPreferencesActiveTab('Theme');
              setSettingsOpen(true);
            }}
            className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:opacity-90 transition-opacity select-none"
            title="Click to customize badge in Preferences"
          >
            🔥 PRO
          </span>

          <span className="hidden xl:inline text-[11px] font-medium text-indigo-600 dark:text-indigo-400 ml-0.5">
            Transcribe · Translate · Dub · Render
          </span>
        </div>
      </div>

      {/* Right Action Bar */}
      <div className="flex items-center gap-1.5">
        {/* Folder Dropdown */}
        <div className="relative" ref={folderMenuRef}>
          <button
            onClick={() => setShowFolderMenu(!showFolderMenu)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors shadow-2xs"
            title="Open Directories & Resources"
          >
            <Folder className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Folder</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showFolderMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl z-50 p-1.5 text-xs space-y-0.5 animate-spring-modal">
              <button
                onClick={async () => {
                  setShowFolderMenu(false);
                  if (project?.videoPath) {
                    const dir = project.videoPath.replace(/[/\\][^/\\]+$/, '');
                    await invoke('open_path_in_explorer', { path: dir });
                  } else {
                    await invoke('open_path_in_explorer', { path: '%USERPROFILE%\\Videos' });
                  }
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors font-medium text-left"
              >
                <span>📂</span>
                <div className="truncate">
                  <div className="font-bold text-[11px]">Video Directory</div>
                  <div className="text-[9.5px] text-slate-400 truncate">{project ? project.videoPath : '%USERPROFILE%\\Videos'}</div>
                </div>
              </button>

              <button
                onClick={async () => {
                  setShowFolderMenu(false);
                  await invoke('open_path_in_explorer', { path: '%USERPROFILE%\\.cache\\whisper' });
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors font-medium text-left"
              >
                <span>🎙️</span>
                <div>
                  <div className="font-bold text-[11px]">Whisper Models Cache</div>
                  <div className="text-[9.5px] text-slate-400">%USERPROFILE%\.cache\whisper</div>
                </div>
              </button>

              <button
                onClick={async () => {
                  setShowFolderMenu(false);
                  await invoke('open_path_in_explorer', { path: '%TEMP%\\dubber_studio_pro\\stems' });
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors font-medium text-left"
              >
                <span>🎼</span>
                <div>
                  <div className="font-bold text-[11px]">Demucs Stems Folder</div>
                  <div className="text-[9.5px] text-slate-400">%TEMP%\dubber_studio_pro\stems</div>
                </div>
              </button>

              <button
                onClick={async () => {
                  setShowFolderMenu(false);
                  await invoke('open_path_in_explorer', { path: '%TEMP%\\dubber_studio_pro' });
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors font-medium text-left"
              >
                <span>⚙️</span>
                <div>
                  <div className="font-bold text-[11px]">Temp Workspace Dir</div>
                  <div className="text-[9.5px] text-slate-400">%TEMP%\dubber_studio_pro</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Undo */}
        <button
          onClick={undoSegments}
          disabled={undoStack.length === 0}
          aria-label="Undo subtitle edit"
          className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Redo */}
        <button
          onClick={redoSegments}
          disabled={redoStack.length === 0}
          aria-label="Redo subtitle edit"
          className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        {/* Audio Mixer */}
        <button
          onClick={() => useStudioStore.getState().setMixerOpen(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 transition-colors"
          title="Audio Mixer & Balance"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        {/* Presets / Sparkles */}
        <button
          onClick={() => setDaiRecapOpen(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-400 transition-colors"
          title="DAI Recap & AI Tools"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>

        {/* Quick Export — solid emerald */}
        <button
          onClick={() => setExportOpen(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
          title="Export / Final Render"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Target Language Pill */}
        <div className="relative" ref={langMenuRef}>
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors bg-white dark:bg-zinc-900 shadow-2xs"
          >
            <span>{targetLang.toUpperCase().split('-')[0]}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
          {showLangMenu && (
            <div className="absolute right-0 mt-1 w-40 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl py-1 z-50 text-xs">
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setTargetLang(l.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-indigo-50 dark:hover:bg-zinc-800 ${
                    targetLang === l.code
                      ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'dark'
            ? <Sun className="w-3.5 h-3.5 text-amber-400" />
            : <Moon className="w-3.5 h-3.5 text-slate-600" />
          }
        </button>

        {/* Help / Tour */}
        <button
          onClick={() => setAppTourOpen(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors"
          title="Interactive Feature Guide & Tour"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        {/* Settings Gear */}
        <button
          onClick={() => {
            setPreferencesActiveTab('General');
            setSettingsOpen(true);
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 transition-colors"
          title="Preferences & API Keys"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
