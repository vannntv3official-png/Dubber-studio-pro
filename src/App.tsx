import React, { lazy, Suspense, useState, useEffect } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { LeftSidebar } from './components/LeftSidebar';
import { SubtitleDataTable } from './components/SubtitleDataTable';
import { TimelineEditor } from './components/TimelineEditor';
import { StatusBar } from './components/StatusBar';
import { useStudioStore } from './store/studioStore';

const PreferencesModal = lazy(() => import('./components/PreferencesModal').then((module) => ({ default: module.PreferencesModal })));
const ExportModal = lazy(() => import('./components/ExportModal').then((module) => ({ default: module.ExportModal })));
const IntroOutroModal = lazy(() => import('./components/IntroOutroModal').then((module) => ({ default: module.IntroOutroModal })));
const ReadScreenModal = lazy(() => import('./components/ReadScreenModal').then((module) => ({ default: module.ReadScreenModal })));
const SplitSubtitleModal = lazy(() => import('./components/SplitSubtitleModal').then((module) => ({ default: module.SplitSubtitleModal })));
const FindReplaceModal = lazy(() => import('./components/FindReplaceModal').then((module) => ({ default: module.FindReplaceModal })));
const PresetsManagerModal = lazy(() => import('./components/PresetsManagerModal').then((module) => ({ default: module.PresetsManagerModal })));
const SponsorBreakModal = lazy(() => import('./components/SponsorBreakModal').then((module) => ({ default: module.SponsorBreakModal })));
const DaiRecapModal = lazy(() => import('./components/DaiRecapModal').then((module) => ({ default: module.DaiRecapModal })));
const AppTourModal = lazy(() => import('./components/AppTourModal').then((module) => ({ default: module.AppTourModal })));
const AudioMixerModal = lazy(() => import('./components/AudioMixerModal').then((module) => ({ default: module.AudioMixerModal })));

export const App: React.FC = () => {
  const isSettingsOpen = useStudioStore((state) => state.isSettingsOpen);
  const isExportOpen = useStudioStore((state) => state.isExportOpen);
  const isIntroOutroOpen = useStudioStore((state) => state.isIntroOutroOpen);
  const isReadScreenOpen = useStudioStore((state) => state.isReadScreenOpen);
  const isSplitModalOpen = useStudioStore((state) => state.isSplitModalOpen);
  const isFindReplaceOpen = useStudioStore((state) => state.isFindReplaceOpen);
  const isPresetsModalOpen = useStudioStore((state) => state.isPresetsModalOpen);
  const isSponsorModalOpen = useStudioStore((state) => state.isSponsorModalOpen);
  const isDaiRecapOpen = useStudioStore((state) => state.isDaiRecapOpen);
  const isAppTourOpen = useStudioStore((state) => state.isAppTourOpen);
  const isMixerOpen = useStudioStore((state) => state.isMixerOpen);
  const initSecureVault = useStudioStore((state) => state.initSecureVault);
  const isPlaying = useStudioStore((state) => state.isPlaying);
  const setIsPlaying = useStudioStore((state) => state.setIsPlaying);
  const setSettingsOpen = useStudioStore((state) => state.setSettingsOpen);
  const setExportOpen = useStudioStore((state) => state.setExportOpen);
  const setFindReplaceOpen = useStudioStore((state) => state.setFindReplaceOpen);

  // Initialize secure Windows credential vault on app launch
  useEffect(() => {
    initSecureVault();
  }, [initSecureVault]);

  // Global Studio Keyboard Shortcuts (Space: Play/Pause, Ctrl+S: Export, Ctrl+F: Find, Ctrl+,: Settings)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setExportOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindReplaceOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === 'Escape') {
        setSettingsOpen(false);
        setExportOpen(false);
        setFindReplaceOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, setExportOpen, setFindReplaceOpen, setSettingsOpen]);
  // Timeline interactive height resizing (ទាញចេញ / ទាញចូល)
  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    const saved = localStorage.getItem('dubber_timeline_height');
    return saved ? Math.max(180, Math.min(650, parseInt(saved, 10))) : 320;
  });
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);

  useEffect(() => {
    localStorage.setItem('dubber_timeline_height', timelineHeight.toString());
  }, [timelineHeight]);

  useEffect(() => {
    if (isResizingTimeline) {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingTimeline]);

  const startTimelineResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTimeline(true);
    const startY = e.clientY;
    const startHeight = timelineHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Dragging UP expands timeline height, dragging DOWN shrinks it
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(180, Math.min(650, startHeight + delta));
      setTimelineHeight(newHeight);
    };

    const onMouseUp = () => {
      setIsResizingTimeline(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 select-none transition-colors">
      {/* 1. Top Header Bar (h-12) */}
      <HeaderBar />

      {/* 2. Main Studio Workspace */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar (w-[340px] xl:w-[360px] shrink-0 border-r): Video Preview & Workspace Tools */}
        <LeftSidebar />

        {/* Right Main Content (flex-1 flex flex-col overflow-hidden) */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top Panel (flex-1): Subtitle Data Table */}
          <div className="flex-1 min-h-[160px] overflow-hidden">
            <SubtitleDataTable />
          </div>

          {/* Draggable Horizontal Splitter Handle between Table and Timeline (ទាញចេញ/ទាញចូល) */}
          <div
            onMouseDown={startTimelineResize}
            className={`h-2.5 -my-1 w-full cursor-row-resize flex items-center justify-center z-30 group hover:bg-indigo-500/25 active:bg-indigo-600 transition-colors select-none ${
              isResizingTimeline ? 'bg-indigo-500/30' : 'bg-transparent'
            }`}
            title="ទាញឡើងលើ/ចុះក្រោម ដើម្បីពង្រីក/បង្រួម Timeline Editor (ចុច 2 ដងដើម្បី Reset)"
            onDoubleClick={() => setTimelineHeight(320)}
          >
            <div className={`w-16 h-1 rounded-full transition-colors ${isResizingTimeline ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-zinc-700 group-hover:bg-indigo-400'}`} />
          </div>

          {/* Bottom Panel (dynamic height): Timeline Editor */}
          <div 
            style={{ height: `${timelineHeight}px` }}
            className="shrink-0 overflow-hidden transition-[height] duration-75"
          >
            <TimelineEditor />
          </div>
        </div>
      </main>

      {/* 3. Bottom Status Footer (h-7) */}
      <StatusBar />

      {/* Modals & Production Overlays */}
      <Suspense fallback={null}>
        {isSettingsOpen && <PreferencesModal />}
        {isExportOpen && <ExportModal />}
        {isIntroOutroOpen && <IntroOutroModal />}
        {isReadScreenOpen && <ReadScreenModal />}
        {isSplitModalOpen && <SplitSubtitleModal />}
        {isFindReplaceOpen && <FindReplaceModal />}
        {isPresetsModalOpen && <PresetsManagerModal />}
        {isSponsorModalOpen && <SponsorBreakModal />}
        {isDaiRecapOpen && <DaiRecapModal />}
        {isAppTourOpen && <AppTourModal />}
        {isMixerOpen && <AudioMixerModal />}
      </Suspense>
    </div>
  );
};

export default App;
