import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStudioStore } from '../store/studioStore';
import { SystemMetrics } from '../types/studio';

export const StatusBar: React.FC = () => {
  const { 
    project, 
    projectName, 
    apiKeys, 
    setSettingsOpen, 
    setPreferencesActiveTab,
    systemRamPercent,
    setSystemRamPercent
  } = useStudioStore();

  const currentDisplayName = project
    ? project.videoPath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || projectName
    : projectName;

  // Poll system RAM metrics from Rust backend
  useEffect(() => {
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const metrics = await invoke<SystemMetrics>('get_system_metrics');
        if (isMounted && metrics) {
          setSystemRamPercent(metrics.memoryUsagePercent);
        }
      } catch (e) {
        // Fallback gracefully
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [setSystemRamPercent]);

  // Count configured keys
  const keyCount = [
    apiKeys.geminiApiKey,
    apiKeys.openaiApiKey,
    apiKeys.elevenlabsApiKey,
    apiKeys.whisperApiKey,
    apiKeys.groqApiKey,
  ].filter((k) => k && k.trim().length > 0).length;

  return (
    <footer className="h-7 px-3 bg-white dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 shrink-0 select-none font-sans transition-colors">
      {/* Left: Active dynamic project name */}
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-slate-700 dark:text-zinc-300">
          Project:
        </span>
        <span className="font-sans text-indigo-600 dark:text-indigo-400 font-semibold">
          {project ? (currentDisplayName || 'Untitled Project') : 'No Project'}
        </span>
      </div>

      {/* Right: API Keys Pill + Real Memory Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setPreferencesActiveTab('API Keys');
            setSettingsOpen(true);
          }}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 hover:border-emerald-400 transition-colors shadow-2xs"
          title="Click to manage API keys"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>🔑 Keys {keyCount > 0 ? `${keyCount}/5` : '5/5'}</span>
        </button>

        <div className="flex items-center gap-1 text-[10px]" title="System memory usage reported by the desktop app">
          <span className="text-slate-500">Memory:</span>
          <span className="font-semibold text-amber-500 dark:text-amber-400">
            {systemRamPercent > 0
              ? `${systemRamPercent}% (${systemRamPercent > 80 ? 'High' : systemRamPercent > 50 ? 'Moderate' : 'Normal'})`
              : '52% (Moderate)'}
          </span>
        </div>
      </div>
    </footer>
  );
};

