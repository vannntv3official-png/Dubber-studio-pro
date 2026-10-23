import React, { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface AudioWaveformCanvasProps {
  audioPath?: string | null;
  width: number;
  height: number;
  color?: string;
  barWidth?: number;
  gap?: number;
  className?: string;
}

const peaksCache = new Map<string, number[]>();

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  audioPath,
  width,
  height,
  color = '#6366f1',
  barWidth = 2,
  gap = 1,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    if (!audioPath) {
      setPeaks(null);
      return;
    }

    if (peaksCache.has(audioPath)) {
      setPeaks(peaksCache.get(audioPath)!);
      return;
    }

    let isMounted = true;
    const loadAudioPeaks = async () => {
      try {
        const fileUrl = convertFileSrc(audioPath);
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const channelData = audioBuffer.getChannelData(0);
        const totalSamples = channelData.length;
        const targetBars = Math.max(10, Math.floor(width / (barWidth + gap)));
        const blockSize = Math.floor(totalSamples / targetBars);

        const extracted: number[] = [];
        for (let i = 0; i < targetBars; i++) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j] || 0);
          }
          const avg = sum / blockSize;
          extracted.push(Math.min(1.0, avg * 3.5)); // Boost dynamic range
        }

        audioCtx.close();

        peaksCache.set(audioPath, extracted);
        if (isMounted) {
          setPeaks(extracted);
        }
      } catch (err) {
        // Fallback gracefully on audio decode error
        console.warn('Could not decode audio waveform peaks, using fallback:', err);
      }
    };

    loadAudioPeaks();

    return () => {
      isMounted = false;
    };
  }, [audioPath, width, barWidth, gap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const bars = peaks && peaks.length > 0 ? peaks : generateFallbackPeaks(width, barWidth, gap);
    const step = barWidth + gap;
    const midY = height / 2;

    ctx.fillStyle = color;

    for (let i = 0; i < bars.length; i++) {
      const x = i * step;
      if (x > width) break;
      const barH = Math.max(3, bars[i] * (height * 0.85));
      const y = midY - barH / 2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barWidth, barH, 1) : ctx.rect(x, y, barWidth, barH);
      ctx.fill();
    }
  }, [peaks, width, height, color, barWidth, gap]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`pointer-events-none ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  );
};

function generateFallbackPeaks(width: number, barWidth: number, gap: number): number[] {
  const count = Math.max(10, Math.floor(width / (barWidth + gap)));
  const list: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = 0.25 + 0.35 * Math.sin(i * 0.25) + 0.15 * Math.sin(i * 0.7);
    list.push(Math.max(0.1, Math.min(0.9, val)));
  }
  return list;
}
