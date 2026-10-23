import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bookmark, X, FolderPlus, Download, Upload, Check } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { useStudioStore } from '../store/studioStore';
import { DdpPreset } from '../types/studio';

export const PresetsManagerModal: React.FC = () => {
  const {
    isPresetsModalOpen,
    setPresetsModalOpen,
    presets,
    activePresetFolder,
    updateProjectConfig,
  } = useStudioStore();

  const [selectedFolder, setSelectedFolder] = useState<string>(activePresetFolder || 'All');
  const [activePresetId, setActivePresetId] = useState<string>(presets[0]?.id || '');

  const [foldersList, setFoldersList] = useState(['All', 'Drama', 'Anime', 'Documentary', 'Shorts']);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isPresetsModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresetsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresetsModalOpen, setPresetsModalOpen]);

  if (!isPresetsModalOpen) return null;

  const filteredPresets = selectedFolder === 'All' 
    ? presets 
    : presets.filter((p) => p.folder.toLowerCase() === selectedFolder.toLowerCase());

  const handleApplyPreset = (preset: DdpPreset) => {
    updateProjectConfig({
      defaultVoice: preset.defaultVoice,
      targetLang: preset.targetLang,
    });
    setPresetsModalOpen(false);
    alert(`Applied preset "${preset.name}"!`);
  };

  const handleExportProject = async () => {
    try {
      const stateToExport = {
        projectName: useStudioStore.getState().projectName,
        project: useStudioStore.getState().project,
        segments: useStudioStore.getState().segments,
        origRanges: useStudioStore.getState().origRanges,
        blurMasks: useStudioStore.getState().blurMasks,
        sponsorBreaks: useStudioStore.getState().sponsorBreaks,
        targetLang: useStudioStore.getState().targetLang,
        exportedAt: new Date().toISOString(),
        version: '10.5.0',
      };

      const path = await save({
        filters: [{ name: 'DAI Dubber Project', extensions: ['ddpro', 'dd', 'ddp'] }],
        defaultPath: `${useStudioStore.getState().projectName || 'Untitled_Project_01'}.ddpro`,
      });

      if (path) {
        await writeTextFile(path, JSON.stringify(stateToExport, null, 2));
        alert(`Project successfully exported to:\n${path}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Export project failed: ${err?.message || err}`);
    }
  };

  const handleImportProject = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'DAI Dubber Project', extensions: ['ddpro', 'dd', 'ddp'] }],
      });

      if (selected && typeof selected === 'string') {
        const text = await readTextFile(selected);
        const data = JSON.parse(text);

        if (data.projectName) useStudioStore.getState().setProjectName(data.projectName);
        if (data.project) useStudioStore.getState().setProject(data.project);
        if (Array.isArray(data.segments)) useStudioStore.getState().setSegments(data.segments);
        if (Array.isArray(data.blurMasks)) useStudioStore.getState().setBlurMasks(data.blurMasks);
        if (Array.isArray(data.sponsorBreaks)) useStudioStore.getState().setSponsorBreaks(data.sponsorBreaks);
        if (data.targetLang) useStudioStore.getState().setTargetLang(data.targetLang);

        setPresetsModalOpen(false);
        alert(`Successfully imported project package from ${selected.split(/[/\\]/).pop()}!`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Import project failed: ${err?.message || err}`);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                Project Presets (.ddp Package Manager)
              </span>
            </div>
            <button
              onClick={() => setPresetsModalOpen(false)}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 flex gap-4 text-xs">
            {/* Folder Sidebar */}
            <div className="w-36 space-y-1 border-r border-slate-200 dark:border-zinc-800 pr-3 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Folders</span>
              {foldersList.map((f) => (
                <button
                  key={f}
                  onClick={() => setSelectedFolder(f)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                    selectedFolder === f
                      ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                      : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400'
                  }`}
                >
                  {f}
                </button>
              ))}

              {isAddingFolder ? (
                <div className="mt-2 space-y-1">
                  <input
                    type="text"
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded border border-purple-300 dark:border-purple-800 bg-white dark:bg-zinc-900 focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFolderName.trim()) {
                        const name = newFolderName.trim();
                        if (!foldersList.includes(name)) {
                          setFoldersList([...foldersList, name]);
                          setSelectedFolder(name);
                        }
                        setNewFolderName('');
                        setIsAddingFolder(false);
                      } else if (e.key === 'Escape') {
                        setIsAddingFolder(false);
                      }
                    }}
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setIsAddingFolder(false)}
                      className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (newFolderName.trim()) {
                          const name = newFolderName.trim();
                          if (!foldersList.includes(name)) {
                            setFoldersList([...foldersList, name]);
                            setSelectedFolder(name);
                          }
                          setNewFolderName('');
                          setIsAddingFolder(false);
                        }
                      }}
                      className="px-1.5 py-0.5 text-[10px] bg-purple-600 text-white rounded font-bold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingFolder(true)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg font-medium text-slate-400 hover:text-slate-600 flex items-center gap-1 mt-2 border border-dashed border-slate-300 dark:border-zinc-700"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>+ Folder</span>
                </button>
              )}
            </div>

            {/* Presets Grid */}
            <div className="flex-1 space-y-2 overflow-y-auto max-h-64 pr-1">
              {filteredPresets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => setActivePresetId(preset.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activePresetId === preset.id
                      ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20'
                      : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 dark:text-zinc-100">{preset.name}</span>
                    <span className="text-[10px] bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-slate-500">
                      {preset.folder}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">{preset.description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                    <span>Voice: {preset.defaultVoice}</span>
                    <span>•</span>
                    <span>Speed: {preset.speedRatio}x</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportProject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-all shadow-2xs"
                title="Save complete project state (.ddpro package)"
              >
                <Download className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Export .ddpro</span>
              </button>
              <button
                onClick={handleImportProject}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-all shadow-2xs"
                title="Open and restore .ddpro project package"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Import .ddpro</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPresetsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-bold text-slate-600 dark:text-zinc-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = presets.find((p) => p.id === activePresetId);
                  if (target) handleApplyPreset(target);
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-500/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Load Preset</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
