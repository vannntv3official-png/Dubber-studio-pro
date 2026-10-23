import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Check, Globe } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const AppTourModal: React.FC = () => {
  const { isAppTourOpen, setAppTourOpen } = useStudioStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [tourLang, setTourLang] = useState<'en' | 'km'>('en');

  // Keyboard shortcut Esc
  React.useEffect(() => {
    if (!isAppTourOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAppTourOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAppTourOpen, setAppTourOpen]);

  if (!isAppTourOpen) return null;

  const tourSteps = [
    {
      titleEn: '1. Load & Transform Video Canvas',
      titleKm: '១. ផ្ទុកវីដេអូ និងកែតម្រូវទម្រង់',
      descEn: 'Use the left media bar to load portrait or landscape videos. You can crop, flip horizontal, or add a subtitle cover blur box.',
      descKm: 'ប្រើប្រាស់របារខាងឆ្វេងដើម្បីបញ្ចូលវីដេអូ។ អ្នកអាច Flip, Crop ឬបិទបាំងអក្សរចាស់លើវីដេអូបានយ៉ាងងាយស្រួល។',
      icon: '🎬',
    },
    {
      titleEn: '2. Subtitle Data & Multi-Cast Actors',
      titleKm: '២. តារាងទិន្នន័យអក្សររត់ និងសំឡេងតួអង្គ',
      descEn: 'Manage dialogue rows, split sentences, search & replace terms, and batch assign voice profiles (A2–A5 male and female actors).',
      descKm: 'គ្រប់គ្រងអត្ថបទសម្រាយ កាត់ឃ្លាស្វ័យប្រវត្ត និងកំណត់សំឡេងតួអង្គ (A2-A5 ប្រុស និង ស្រី) ដោយចុចតែមួយប៉ក់។',
      icon: '🎙️',
    },
    {
      titleEn: '3. Multi-Track Timeline & Waveforms',
      titleKm: '៣. បន្ទាត់ពេលវេលាច្រើនជួរ (Timeline)',
      descEn: 'Synchronized lanes for Original Audio (V1), Selective Pass-Through (ORIG), Subtitles (T1), AI Dubbing (A1), and BGM (A2).',
      descKm: 'កែសម្រួលពេលវេលាលើបន្ទាត់ V1, ORIG (រក្សាសំឡេងដើម), T1 (អក្សររត់), A1 (សំឡេងបញ្ចាំង) និង A2 (តន្ត្រីផ្ទៃក្រោយ)។',
      icon: '🌊',
    },
    {
      titleEn: '4. AI Transcription & Synthesis',
      titleKm: '៤. ការបំលែងសំឡេង និងបង្កើតសំឡេង AI',
      descEn: 'Click Transcribe to auto-generate subtitles with Whisper/Gemini, and synthesize Khmer voices via Edge-TTS or ElevenLabs.',
      descKm: 'ចុច Transcribe ដើម្បីចាប់យកអត្ថបទស្វ័យប្រវត្ត និងបង្កើតសំឡេងភាសាខ្មែរតាម Edge-TTS ឬ ElevenLabs។',
      icon: '✨',
    },
  ];

  const step = tourSteps[currentStep];

  return (
    <AnimatePresence>
      <div 
        onClick={() => setAppTourOpen(false)}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{step.icon}</span>
              <span className="font-extrabold text-sm text-slate-800 dark:text-zinc-100">
                {tourLang === 'en' ? 'Studio Onboarding Tour' : 'មគ្គុទ្ទេសក៍ណែនាំស្ទូឌីយោ'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Language Switcher */}
              <button
                onClick={() => setTourLang(tourLang === 'en' ? 'km' : 'en')}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-zinc-700"
              >
                <Globe className="w-3 h-3" />
                <span>{tourLang === 'en' ? 'ភាសាខ្មែរ' : 'English'}</span>
              </button>

              <button
                onClick={() => setAppTourOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-3 text-center">
            <h3 className="font-extrabold text-base text-slate-800 dark:text-zinc-100">
              {tourLang === 'en' ? step.titleEn : step.titleKm}
            </h3>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed font-sans">
              {tourLang === 'en' ? step.descEn : step.descKm}
            </p>

            {/* Stepper Dots */}
            <div className="flex items-center justify-center gap-1.5 pt-3">
              {tourSteps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    currentStep === i ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-200 dark:bg-zinc-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/50">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-bold text-xs text-slate-600 dark:text-zinc-300 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5 inline mr-1" />
              Prev
            </button>

            {currentStep < tourSteps.length - 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => setAppTourOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Get Started</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
