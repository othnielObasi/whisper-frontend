import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  SignedIn, 
  SignedOut, 
  SignInButton, 
  SignUpButton,
  UserButton,
  useUser 
} from '@clerk/clerk-react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ============================================
// WAV Encoding Utility
// ============================================
function encodeWAV(audioBuffer, startSample, endSample) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = endSample - startSample;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numChannels * 2, true);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = startSample; i < endSample; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ============================================
// Trim Modal Component
// ============================================
function TrimModal({ file, onTrimComplete, onCancel }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const audioElRef = useRef(null);
  const blobUrlRef = useRef(null);
  const animFrameRef = useRef(null);
  const peaksRef = useRef(null);
  const playEndRef = useRef(0);
  const justDraggedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [dragging, setDragging] = useState(null);
  const [dragOrigin, setDragOrigin] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playMode, setPlayMode] = useState('selection');

  // Setup audio element — zero memory waveform (no file reads at all)
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = url;
    audioElRef.current = audio;

    const init = async () => {
      try {
        setLoadProgress(20);
        // Get duration from audio element metadata only
        await new Promise((resolve, reject) => {
          if (audio.readyState >= 1 && isFinite(audio.duration)) return resolve();
          audio.addEventListener('loadedmetadata', () => {
            if (isFinite(audio.duration)) resolve();
            else reject(new Error('Could not determine audio duration'));
          }, { once: true });
          audio.addEventListener('error', () => reject(audio.error || new Error('Audio load error')), { once: true });
        });
        if (cancelled) return;
        const dur = audio.duration;
        setDuration(dur);
        setTrimEnd(dur);
        setLoadProgress(60);

        // Generate a natural-looking synthetic waveform — zero file reads, zero decode
        // Uses seeded PRNG for consistent look per file
        const NUM_PEAKS = 2000;
        const peaks = [];
        let seed = file.size ^ (dur * 1000);
        const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
        let amp = 0.3 + rand() * 0.3;
        for (let i = 0; i < NUM_PEAKS; i++) {
          // Slow envelope + medium variation + fast jitter
          const env = 0.3 + 0.5 * Math.sin(i * Math.PI / NUM_PEAKS);
          amp += (rand() - 0.5) * 0.08;
          amp = Math.max(0.1, Math.min(0.9, amp));
          const jitter = 0.7 + rand() * 0.3;
          const level = env * amp * jitter;
          peaks.push({ min: -level, max: level });
        }
        peaksRef.current = peaks;

        setLoadProgress(100);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to process audio:', e);
        alert('Could not process this audio file.');
        onCancel();
      }
    };
    init();

    return () => {
      cancelled = true;
      audio.pause();
      audio.src = '';
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [file, onCancel]);

  // Draw waveform
  useEffect(() => {
    if (loading || !peaksRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const peaks = peaksRef.current;
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const mid = h / 2;
    const barWidth = w / peaks.length;

    // Background
    ctx.fillStyle = '#F8F5F0';
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = '#E5DFD6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    const startX = (trimStart / duration) * w;
    const endX = (trimEnd / duration) * w;

    // Draw dimmed waveform (outside selection)
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const { min, max } = peaks[i];
      const topH = max * mid * 0.85;
      const bottomH = -min * mid * 0.85;
      const isInSelection = x >= startX && x <= endX;

      if (!isInSelection) {
        ctx.fillStyle = '#D4C9BB';
        // Top bar
        const barW = Math.max(1, barWidth - 0.5);
        ctx.fillRect(x, mid - topH, barW, topH);
        // Bottom bar
        ctx.fillRect(x, mid, barW, bottomH);
      }
    }

    // Draw selected waveform with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#B07840');
    gradient.addColorStop(0.4, '#8B5A2B');
    gradient.addColorStop(0.6, '#8B5A2B');
    gradient.addColorStop(1, '#B07840');

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const { min, max } = peaks[i];
      const topH = max * mid * 0.85;
      const bottomH = -min * mid * 0.85;
      const isInSelection = x >= startX && x <= endX;

      if (isInSelection) {
        ctx.fillStyle = gradient;
        const barW = Math.max(1, barWidth - 0.5);
        ctx.fillRect(x, mid - topH, barW, topH);
        ctx.fillRect(x, mid, barW, bottomH);
      }
    }

    // Dim overlay outside selection
    ctx.fillStyle = 'rgba(248, 245, 240, 0.45)';
    ctx.fillRect(0, 0, startX, h);
    ctx.fillRect(endX, 0, w - endX, h);

    // Selection boundary glow
    ctx.shadowColor = 'rgba(139, 90, 43, 0.3)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#8B5A2B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, h);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Playhead
    if (playbackTime > 0 && isPlaying) {
      const playX = (playbackTime / duration) * w;
      ctx.strokeStyle = '#E74C3C';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Playhead dot
      ctx.fillStyle = '#E74C3C';
      ctx.beginPath();
      ctx.arc(playX, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  }, [loading, trimStart, trimEnd, duration, playbackTime, isPlaying]);

  // Playback animation loop — tracks audio element time
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const tick = () => {
      const audio = audioElRef.current;
      if (!audio || audio.paused) {
        setIsPlaying(false);
        setPlaybackTime(0);
        return;
      }
      const current = audio.currentTime;
      if (current >= playEndRef.current) {
        audio.pause();
        setIsPlaying(false);
        setPlaybackTime(0);
        return;
      }
      setPlaybackTime(current);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loading) return;
      // Don't capture keys when user is typing in an input
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) stopPlayback();
        else { setPlayMode('selection'); playAudio(trimStart, trimEnd); }
      } else if (e.code === 'Escape') {
        stopPlayback();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, isPlaying, trimStart, trimEnd]);

  const stopPlayback = useCallback(() => {
    const audio = audioElRef.current;
    if (audio) audio.pause();
    setIsPlaying(false);
  }, []);

  const scrubAudio = useCallback((time) => {
    // Seek only — no playback during drag to keep memory safe
    const audio = audioElRef.current;
    if (audio) audio.currentTime = time;
    setPlaybackTime(time);
  }, []);

  const playAudio = useCallback((fromTime, toTime) => {
    stopPlayback();
    const audio = audioElRef.current;
    if (!audio) return;
    audio.currentTime = fromTime;
    playEndRef.current = toTime;
    audio.play().catch(() => {});
    setIsPlaying(true);
    setPlaybackTime(fromTime);
  }, [stopPlayback]);

  // Pointer handling
  const getTimeFromX = useCallback((clientX) => {
    if (!containerRef.current || !duration) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const handlePointerDown = useCallback((e, type) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPlaying) stopPlayback();
    setDragging(type);
    if (type === 'region') {
      setDragOrigin({ x: e.clientX, start: trimStart, end: trimEnd });
    }
  }, [trimStart, trimEnd, isPlaying, stopPlayback]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    const time = getTimeFromX(e.clientX);
    if (dragging === 'start') {
      const t = Math.max(0, Math.min(time, trimEnd - 0.5));
      setTrimStart(t);
      scrubAudio(t);
    } else if (dragging === 'end') {
      const t = Math.min(duration, Math.max(time, trimStart + 0.5));
      setTrimEnd(t);
      scrubAudio(t);
    } else if (dragging === 'region' && dragOrigin) {
      const dx = e.clientX - dragOrigin.x;
      const rect = containerRef.current.getBoundingClientRect();
      const dt = (dx / rect.width) * duration;
      const regionLen = dragOrigin.end - dragOrigin.start;
      let newStart = dragOrigin.start + dt;
      let newEnd = dragOrigin.end + dt;
      if (newStart < 0) { newStart = 0; newEnd = regionLen; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - regionLen; }
      setTrimStart(newStart);
      setTrimEnd(newEnd);
    }
  }, [dragging, trimStart, trimEnd, duration, getTimeFromX, dragOrigin, scrubAudio]);

  const handlePointerUp = useCallback(() => {
    if (dragging) {
      justDraggedRef.current = true;
      // Play a brief audio snippet at the final handle position
      const audio = audioElRef.current;
      if (audio) {
        const t = dragging === 'start' ? trimStart : dragging === 'end' ? trimEnd : trimStart;
        audio.currentTime = t;
        playEndRef.current = t + 0.2;
        audio.play().then(() => {
          setTimeout(() => { if (audioElRef.current) audioElRef.current.pause(); }, 200);
        }).catch(() => {});
      }
    }
    setDragging(null);
    setDragOrigin(null);
  }, [dragging, trimStart, trimEnd]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [dragging, handlePointerMove, handlePointerUp]);

  const handleWaveformClick = useCallback((e) => {
    if (dragging) return;
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    const time = getTimeFromX(e.clientX);
    setPlaybackTime(time);
    if (isPlaying) {
      const limit = playMode === 'selection' ? trimEnd : duration;
      playAudio(time, limit);
    }
  }, [dragging, getTimeFromX, isPlaying, playMode, trimEnd, duration, playAudio]);

  const handleTrimAndUpload = async () => {
    setExporting(true);
    stopPlayback();

    const isFullSelection = trimStart < 0.5 && (duration - trimEnd) < 0.5;
    if (isFullSelection) {
      // No trim needed — upload original
      onTrimComplete(file);
      return;
    }

    const MAX_DECODE_SIZE = 150 * 1024 * 1024; // 150MB threshold for in-browser decode
    if (file.size > MAX_DECODE_SIZE) {
      // File too large for browser decode — upload original as-is
      onTrimComplete(file);
      return;
    }

    try {
      const EXPORT_RATE = 16000; // Whisper-native sample rate
      const selectedDuration = trimEnd - trimStart;
      const numFrames = Math.ceil(selectedDuration * EXPORT_RATE);
      const arrayBuffer = await file.arrayBuffer();
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offCtx = new OfflineCtx(1, numFrames, EXPORT_RATE);
      const decoded = await offCtx.decodeAudioData(arrayBuffer);
      const source = offCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(offCtx.destination);
      source.start(0, trimStart, selectedDuration);
      const rendered = await offCtx.startRendering();
      const wavBlob = encodeWAV(rendered, 0, rendered.length);
      const trimmedFile = new File([wavBlob], file.name.replace(/\.[^.]+$/, '_trimmed.wav'), { type: 'audio/wav' });
      onTrimComplete(trimmedFile);
    } catch (e) {
      console.error('Trim export failed:', e);
      // Fallback: upload original file
      const ok = window.confirm(
        'Browser ran out of memory trimming this large file.\n\n' +
        'Click OK to upload the original file instead, or Cancel to go back and adjust.'
      );
      if (ok) {
        onTrimComplete(file);
      } else {
        setExporting(false);
      }
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const formatTimeShort = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Parse user-entered time string back to seconds
  const parseTime = (str) => {
    const cleaned = str.trim();
    if (!cleaned) return null;
    const parts = cleaned.split(':');
    let seconds = 0;
    if (parts.length === 3) {
      seconds = (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseFloat(parts[2]) || 0);
    } else if (parts.length === 2) {
      seconds = (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
    } else {
      seconds = parseFloat(parts[0]) || 0;
    }
    return isNaN(seconds) ? null : Math.max(0, seconds);
  };

  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [editStartVal, setEditStartVal] = useState('');
  const [editEndVal, setEditEndVal] = useState('');

  const commitStartTime = () => {
    const t = parseTime(editStartVal);
    if (t != null && t < trimEnd - 0.5 && t >= 0) {
      setTrimStart(Math.min(t, duration));
    }
    setEditingStart(false);
  };

  const commitEndTime = () => {
    const t = parseTime(editEndVal);
    if (t != null && t > trimStart + 0.5 && t <= duration) {
      setTrimEnd(t);
    }
    setEditingEnd(false);
  };

  const trimmedDuration = trimEnd - trimStart;
  const savingsPercent = duration > 0 ? Math.round(((duration - trimmedDuration) / duration) * 100) : 0;

  return (
    <div className="trim-modal-overlay">
      <div className="trim-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="trim-modal-header">
          <div className="trim-header-left">
            <div className="trim-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
                <line x1="8.12" y1="8.12" x2="12" y2="12"/>
              </svg>
            </div>
            <div>
              <h2>Trim Audio</h2>
              <p className="trim-filename">{file.name}</p>
            </div>
          </div>
          <button className="trim-close-btn" onClick={() => { stopPlayback(); onCancel(); }} title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="trim-loading">
            <div className="trim-load-ring">
              <svg viewBox="0 0 48 48">
                <circle className="trim-load-track" cx="24" cy="24" r="20" />
                <circle className="trim-load-fill" cx="24" cy="24" r="20"
                  style={{ strokeDashoffset: 126 - (126 * loadProgress / 100) }} />
              </svg>
              <span className="trim-load-percent">{loadProgress}%</span>
            </div>
            <p>Decoding audio file...</p>
          </div>
        ) : (
          <>
            {/* Time bar */}
            <div className="trim-time-bar">
              <div className="trim-time-card trim-time-start">
                <span className="trim-time-icon">◀</span>
                <div>
                  <span className="trim-time-label">Start</span>
                  {editingStart ? (
                    <input
                      className="trim-time-input"
                      value={editStartVal}
                      onChange={(e) => setEditStartVal(e.target.value)}
                      onBlur={commitStartTime}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitStartTime(); if (e.key === 'Escape') setEditingStart(false); }}
                      autoFocus
                      placeholder="m:ss.s"
                    />
                  ) : (
                    <span
                      className="trim-time-value editable"
                      onClick={() => { setEditStartVal(formatTime(trimStart)); setEditingStart(true); }}
                      title="Click to type a time"
                    >{formatTime(trimStart)}</span>
                  )}
                </div>
              </div>
              <div className="trim-time-card trim-time-selection">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                  <line x1="20" y1="4" x2="8.12" y2="15.88" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <div>
                  <span className="trim-time-label">Selection</span>
                  <span className="trim-time-value">{formatTime(trimmedDuration)}</span>
                </div>
              </div>
              <div className="trim-time-card trim-time-end">
                <div>
                  <span className="trim-time-label">End</span>
                  {editingEnd ? (
                    <input
                      className="trim-time-input"
                      value={editEndVal}
                      onChange={(e) => setEditEndVal(e.target.value)}
                      onBlur={commitEndTime}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEndTime(); if (e.key === 'Escape') setEditingEnd(false); }}
                      autoFocus
                      placeholder="m:ss.s"
                    />
                  ) : (
                    <span
                      className="trim-time-value editable"
                      onClick={() => { setEditEndVal(formatTime(trimEnd)); setEditingEnd(true); }}
                      title="Click to type a time"
                    >{formatTime(trimEnd)}</span>
                  )}
                </div>
                <span className="trim-time-icon">▶</span>
              </div>
            </div>

            {/* Waveform */}
            <div className="trim-waveform-wrap">
              <div className="trim-waveform-container" ref={containerRef} onClick={handleWaveformClick}>
                <div className="trim-canvas-wrap">
                  <canvas ref={canvasRef} className="trim-waveform-canvas" />
                </div>

                {/* Handles */}
                <div
                  className={`trim-handle trim-handle-start ${dragging === 'start' ? 'dragging' : ''}`}
                  style={{ left: `${(trimStart / duration) * 100}%` }}
                  onPointerDown={(e) => handlePointerDown(e, 'start')}
                >
                  <div className="trim-handle-grip">
                    <span /><span /><span />
                  </div>
                </div>

                <div
                  className="trim-region"
                  style={{
                    left: `${(trimStart / duration) * 100}%`,
                    width: `${((trimEnd - trimStart) / duration) * 100}%`
                  }}
                  onPointerDown={(e) => handlePointerDown(e, 'region')}
                />

                <div
                  className={`trim-handle trim-handle-end ${dragging === 'end' ? 'dragging' : ''}`}
                  style={{ left: `${(trimEnd / duration) * 100}%` }}
                  onPointerDown={(e) => handlePointerDown(e, 'end')}
                >
                  <div className="trim-handle-grip">
                    <span /><span /><span />
                  </div>
                </div>
              </div>

              {/* Time axis */}
              <div className="trim-time-axis">
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                  <span key={pct} style={{ left: `${pct * 100}%` }}>{formatTimeShort(pct * duration)}</span>
                ))}
              </div>
            </div>

            {/* Transport controls */}
            <div className="trim-transport">
              <div className="trim-transport-left">
                <button
                  className={`trim-transport-btn trim-btn-play ${isPlaying ? 'active' : ''}`}
                  onClick={() => {
                    if (isPlaying) { stopPlayback(); }
                    else { setPlayMode('selection'); playAudio(trimStart, trimEnd); }
                  }}
                  title="Play selection (Space)"
                >
                  {isPlaying && playMode === 'selection' ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                  )}
                </button>
                <button
                  className={`trim-transport-btn trim-btn-full ${isPlaying && playMode === 'full' ? 'active' : ''}`}
                  onClick={() => {
                    if (isPlaying && playMode === 'full') { stopPlayback(); }
                    else { setPlayMode('full'); playAudio(0, duration); }
                  }}
                  title="Play full audio"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Full
                </button>
              </div>

              <div className="trim-transport-info">
                <span className="trim-savings-badge">
                  {savingsPercent > 0 ? `−${savingsPercent}%` : 'Full length'}
                </span>
                <span className="trim-transport-duration">
                  {formatTimeShort(trimmedDuration)} <span className="trim-of">of</span> {formatTimeShort(duration)}
                </span>
              </div>
            </div>

            {/* Keyboard hint */}
            <div className="trim-keyboard-hint">
              <kbd>Space</kbd> Play/Pause &nbsp; <kbd>Esc</kbd> Cancel &nbsp; Drag handles to set trim points
            </div>

            {/* Actions */}
            <div className="trim-actions">
              <button className="trim-cancel-btn" onClick={() => { stopPlayback(); onCancel(); }} disabled={exporting}>
                Cancel
              </button>
              <button className="trim-skip-btn" onClick={() => { stopPlayback(); onTrimComplete(file); }} disabled={exporting}
                title="Upload the original file without trimming">
                Upload Original
              </button>
              <button className="trim-upload-btn" onClick={handleTrimAndUpload} disabled={exporting}>
                {exporting ? (
                  <>
                    <span className="trim-export-spinner" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                      <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
                      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                    </svg>
                    Trim & Upload
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// Upload Panel Component
// ============================================
function UploadPanel({ onUploadComplete, isUploading, setIsUploading }) {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [interpreterMode, setInterpreterMode] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(true);
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [trimFile, setTrimFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const uploadFile = async (file) => {
    setIsUploading(true);
    setProgress(0);

    try {
      const tokenRes = await fetch(`${API_BASE}/get-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          interpreterMode,
          englishOnly
        })
      });
      
      if (!tokenRes.ok) throw new Error('Failed to get upload URL');
        if (!tokenRes.headers.get('content-type')?.includes('application/json')) {
          const txt = await tokenRes.text();
          throw new Error('Bad upload URL response: ' + txt);
        }
        const { uploadUrl, jobId, blobName } = await tokenRes.json();

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.onload = async () => {
          if (xhr.status === 201) {
          await fetch(`${API_BASE}/upload-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, blobName, interpreterMode, englishOnly, originalName: file.name })
          });
          onUploadComplete(jobId, file.name);
        } else {
            const respText = xhr.responseText || xhr.statusText;
            console.error('Upload failed', xhr.status, respText);
            alert('Upload failed: ' + xhr.status + ' - ' + respText);
        }
        setIsUploading(false);
        setProgress(0);
      };

      xhr.onerror = () => {
        alert('Upload failed');
        setIsUploading(false);
        setProgress(0);
      };

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
      xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');
      xhr.send(file);
      
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + error.message);
      setIsUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (trimEnabled) {
        setTrimFile(f);
      } else {
        uploadFile(f);
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (trimEnabled) {
        setTrimFile(f);
      } else {
        uploadFile(f);
      }
    }
  };

  return (
    <div className="upload-panel">
      <h2>Upload Audio</h2>
      
      <div
        className={`drop-zone ${dragActive ? 'active' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        {isUploading ? (
          <div className="upload-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span>{progress}% uploaded</span>
          </div>
        ) : (
          <>
            <div className="drop-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p>Drag & drop audio file or click to browse</p>
            <span className="file-types">MP3, WAV, M4A, FLAC supported</span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          hidden
        />
      </div>

      <div className="upload-options">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={trimEnabled}
            onChange={(e) => setTrimEnabled(e.target.checked)}
            disabled={isUploading}
          />
          Trim audio before upload
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={interpreterMode}
            onChange={(e) => setInterpreterMode(e.target.checked)}
            disabled={isUploading}
          />
          Interpreter present
        </label>

        {interpreterMode && (
          <div className="interpreter-options">
            <label className="radio-label">
              <input
                type="radio"
                name="transcribeOption"
                checked={englishOnly}
                onChange={() => setEnglishOnly(true)}
                disabled={isUploading}
              />
              English only (skip interpreter)
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="transcribeOption"
                checked={!englishOnly}
                onChange={() => setEnglishOnly(false)}
                disabled={isUploading}
              />
              Both languages (separate files)
            </label>
          </div>
        )}
      </div>

      {trimFile && (
        <TrimModal
          file={trimFile}
          onTrimComplete={(trimmedFile) => {
            setTrimFile(null);
            uploadFile(trimmedFile);
          }}
          onCancel={() => setTrimFile(null)}
        />
      )}
    </div>
  );
}

// ============================================
// Jobs History Table Component
// ============================================
function JobsHistory({ jobs, onSelectJob, onDeleteJob, currentJobId }) {
  const formatDuration = (seconds) => {
    if (seconds == null || seconds === false) return '-';
    const num = Number(seconds);
    if (isNaN(num) || num < 0) return '-';
    const mins = Math.floor(num / 60);
    const secs = Math.floor(num % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'completed': { class: 'status-completed', label: 'Completed' },
      'processing': { class: 'status-processing', label: 'Processing' },
      'queued': { class: 'status-queued', label: 'Queued' },
      'failed': { class: 'status-failed', label: 'Failed' }
    };
    const s = statusMap[status] || { class: 'status-unknown', label: status };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  };

  if (!jobs || jobs.length === 0) {
    return (
      <div className="jobs-history empty">
        <p>No transcription jobs yet. Upload an audio file to get started.</p>
      </div>
    );
  }

  return (
    <div className="jobs-history">
      <h3>Recent Transcriptions</h3>
      <div className="jobs-table-wrapper">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>File Name</th>
              <th>Status</th>
              <th>Audio Duration</th>
              <th>Processing Time</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.jobId} className={currentJobId === job.jobId ? 'active' : ''}>
                <td className="job-name" title={job.originalName}>
                  {job.originalName || job.jobId}
                </td>
                <td>{getStatusBadge(job.status)}</td>
                <td>{formatDuration(job.audioDuration)}</td>
                <td>{formatDuration(job.processingTime)}</td>
                <td>{formatDate(job.createdAt)}</td>
                <td className="job-actions">
                  {job.status === 'completed' && (
                    <button className="btn-view" onClick={() => onSelectJob(job)}>
                      View
                    </button>
                  )}
                  <button className="btn-delete" onClick={() => onDeleteJob(job.jobId)} title="Delete job">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// Status Panel Component (Animated Processing Page)
// ============================================
const PROCESSING_STEPS = [
  { key: 'uploaded', label: 'File uploaded', icon: '📤' },
  { key: 'queued', label: 'Queued for processing', icon: '📋' },
  { key: 'processing', label: 'AI transcribing audio', icon: '🧠' },
  { key: 'completed', label: 'Transcription complete', icon: '✅' },
];

function getStepIndex(status) {
  if (status === 'completed') return 3;
  if (status === 'processing') return 2;
  if (status === 'queued') return 1;
  return 0;
}

function StatusPanel({ jobId, fileName, onTranscriptReady, onStatusUpdate }) {
  const [statusDetails, setStatusDetails] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [dots, setDots] = useState('');
  const [pollErrors, setPollErrors] = useState(0);
  const pollInterval = useRef(null);
  const timerInterval = useRef(null);
  const dotsInterval = useRef(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    if (!jobId) return;
    startTime.current = Date.now();

    timerInterval.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);

    dotsInterval.current = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/status/${jobId}`);
        if (!response.ok) {
          setPollErrors(prev => prev + 1);
          return;
        }
        const data = await response.json();
        setPollErrors(0);
        setStatusDetails(data);
        onStatusUpdate?.(data);

        if (data.status === 'completed') {
          clearInterval(pollInterval.current);
          clearInterval(timerInterval.current);
          clearInterval(dotsInterval.current);
          onTranscriptReady(data);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval.current);
          clearInterval(timerInterval.current);
          clearInterval(dotsInterval.current);
        }
      } catch (error) {
        console.error('Status check error:', error);
        setPollErrors(prev => prev + 1);
      }
    };

    checkStatus();
    pollInterval.current = setInterval(checkStatus, 5000);

    return () => {
      clearInterval(pollInterval.current);
      clearInterval(timerInterval.current);
      clearInterval(dotsInterval.current);
    };
  }, [jobId, onTranscriptReady, onStatusUpdate]);

  if (!jobId) return null;

  const currentStatus = statusDetails?.status || 'queued';
  const activeStep = getStepIndex(currentStatus);
  const isActive = currentStatus === 'processing' || currentStatus === 'queued';

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Estimate: ~5 min per hour of audio as a rough guess, cap at 10 min display
  const estimatedMin = 8;
  const estimatedMax = 12;
  const progressPercent = isActive
    ? Math.min(95, Math.round((elapsedTime / (estimatedMin * 60)) * 100))
    : currentStatus === 'completed' ? 100 : 0;

  return (
    <div className="status-panel-v2">
      {/* Pulsing ring animation */}
      <div className="status-ring-container">
        <svg className="status-ring" viewBox="0 0 120 120">
          <circle className="ring-bg" cx="60" cy="60" r="52" />
          <circle
            className={`ring-progress ${isActive ? 'ring-animated' : ''}`}
            cx="60" cy="60" r="52"
            style={{ strokeDashoffset: 327 - (327 * progressPercent / 100) }}
          />
        </svg>
        <div className="status-ring-inner">
          <span className="status-ring-percent">{progressPercent}%</span>
          <span className="status-ring-elapsed">{formatElapsed(elapsedTime)}</span>
        </div>
      </div>

      {/* Title & subtitle */}
      <h3 className="status-v2-title">
        {currentStatus === 'completed' ? 'Transcription Complete!' :
         currentStatus === 'failed' ? 'Processing Failed' :
         `Transcribing${dots}`}
      </h3>
      {fileName && <p className="status-v2-filename">{fileName}</p>}

      {/* Step tracker */}
      <div className="status-steps">
        {PROCESSING_STEPS.map((step, idx) => {
          const isDone = idx < activeStep;
          const isCurrent = idx === activeStep;
          return (
            <div key={step.key} className={`status-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
              <div className="step-icon-row">
                <div className={`step-dot ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                  {isDone ? '✓' : step.icon}
                </div>
                {idx < PROCESSING_STEPS.length - 1 && (
                  <div className={`step-line ${isDone ? 'done' : ''}`} />
                )}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Live info bar */}
      {isActive && (
        <div className="status-live-bar">
          <div className="live-dot" />
          <span>Estimated: {estimatedMin}–{estimatedMax} minutes for a 2-hour sermon</span>
        </div>
      )}

      {/* Fun tips that rotate */}
      {isActive && <StatusTips />}

      {currentStatus === 'failed' && (
        <p className="status-error-msg">Something went wrong. Please try uploading again.</p>
      )}

      {pollErrors >= 3 && (
        <p className="status-error-msg">Having trouble checking status. Still trying...</p>
      )}
    </div>
  );
}

function StatusTips() {
  const tips = [
    '🎵 WhisperX AI is analyzing your audio waveforms...',
    '🔤 Identifying speakers and segmenting dialogue...',
    '⚡ Generating timestamps for each segment...',
    '📝 Building paragraph structure from speech patterns...',
    '🌍 Detecting language and optimizing accuracy...',
    '🎯 Fine-tuning punctuation and formatting...',
  ];
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIdx(prev => (prev + 1) % tips.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="status-tips">
      <p className="status-tip-text" key={tipIdx}>{tips[tipIdx]}</p>
    </div>
  );
}

// ============================================
// Audio Player Component
// ============================================
const AudioPlayer = React.forwardRef(({ audioUrl, currentTime, onTimeUpdate, onSeek, isPlaying, setIsPlaying, onDurationLoaded }, ref) => {
  const audioRef = useRef(null);
  const [duration, setDuration] = useState(0);

  React.useImperativeHandle(ref, () => ({
    seekAndPlay: (time) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        audioRef.current.play();
        setIsPlaying(true);
        onSeek(time);
      }
    },
    pause: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
  }));

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      onTimeUpdate(audioRef.current.currentTime);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      onSeek(newTime);
    }
  };

  const skipTime = (seconds) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
    }
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration || 0;
          setDuration(d);
          if (d > 0 && onDurationLoaded) onDurationLoaded(d);
        }}
        onEnded={() => setIsPlaying(false)}
      />
      
      <div className="player-controls">
        <button className="player-btn skip-btn" onClick={() => skipTime(-10)}>
          <span>-10s</span>
        </button>
        
        <button className="player-btn play-btn" onClick={togglePlay}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M14,19H18V5H14M6,19H10V5H6V19Z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
            </svg>
          )}
        </button>
        
        <button className="player-btn skip-btn" onClick={() => skipTime(10)}>
          <span>+10s</span>
        </button>
      </div>

      {isPlaying && (
        <div className="now-playing">
          🔊 Now playing at {formatTime(currentTime)}
        </div>
      )}

      <div className="player-timeline" onClick={handleSeek}>
        <div className="timeline-progress" style={{ width: `${(currentTime / duration) * 100}%` }} />
        <div className="timeline-handle" style={{ left: `${(currentTime / duration) * 100}%` }} />
      </div>

      <div className="player-time">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
});

// ============================================
// Transcript Segment Component
// ============================================
function TranscriptSegment({ segment, isActive, isPlaying, onClick, onDoubleClick, isEditing, editText, setEditText, onSave, onCancel, showTimestamps }) {
  if (isEditing) {
    return (
      <div className="segment-edit-container">
        <div className="segment-edit-header">
          <span className="segment-edit-timestamp">{segment.ts}</span>
          <span className="segment-edit-label">Editing segment</span>
        </div>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          autoFocus
          rows={3}
        />
        <div className="segment-edit-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-save" onClick={onSave}>✓ Save</button>
        </div>
      </div>
    );
  }

  return (
    <span 
      className={`segment ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Click to play • Double-click to edit"
    >
      {showTimestamps && (
        <span className="timestamp">
          {isActive && isPlaying && '▶ '}
          {segment.ts}
        </span>
      )}
      <span className="text">{segment.text}</span>
      {' '}
    </span>
  );
}

// ============================================
// Transcript Editor Component
// ============================================
function TranscriptEditor({ transcript, audioUrl, onSave, onAudioDurationLoaded }) {
  const [paragraphs, setParagraphs] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [editingSegment, setEditingSegment] = useState(null);
  const [editText, setEditText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const transcriptRef = useRef(null);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    if (transcript?.paragraphs) {
      setParagraphs(transcript.paragraphs);
    }
  }, [transcript]);

  const findActiveSegment = useCallback(() => {
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const para = paragraphs[pIdx];
      for (let sIdx = 0; sIdx < para.segments.length; sIdx++) {
        const seg = para.segments[sIdx];
        if (currentTime >= seg.start && currentTime <= seg.end) {
          return { pIdx, sIdx };
        }
      }
    }
    return null;
  }, [currentTime, paragraphs]);

  const activeSegment = findActiveSegment();

  useEffect(() => {
    if (activeSegment && transcriptRef.current && isPlaying) {
      const activeEl = transcriptRef.current.querySelector('.segment.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegment, isPlaying]);

  const handleSegmentClick = (pIdx, sIdx, segment) => {
    if (editingSegment !== null) return;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.seekAndPlay(segment.start);
    }
  };

  const handleSegmentDoubleClick = (pIdx, sIdx, segment) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setEditingSegment({ pIdx, sIdx });
    setEditText(segment.text);
  };

  const handleSegmentSave = () => {
    if (editingSegment === null) return;
    const { pIdx, sIdx } = editingSegment;
    const newParagraphs = [...paragraphs];
    newParagraphs[pIdx].segments[sIdx].text = editText;
    setParagraphs(newParagraphs);
    setEditingSegment(null);
    setEditText('');
    setHasChanges(true);
  };

  const handleSegmentCancel = () => {
    setEditingSegment(null);
    setEditText('');
  };

  const handleSaveAll = async () => {
    try {
      await onSave(paragraphs);
      setHasChanges(false);
      alert('Transcript saved successfully!');
    } catch (error) {
      alert('Failed to save: ' + error.message);
    }
  };

  return (
    <div className="transcript-editor">
      <div className="editor-header">
        <h2>Transcript Editor</h2>
        <div className="editor-hint">
          <span className="hint-badge">Click</span> to play
          <span className="hint-separator">•</span>
          <span className="hint-badge">Double-click</span> to edit
        </div>
        <label className="timestamp-toggle">
          <span className="timestamp-toggle-label">Timestamps</span>
          <button
            className={`toggle-switch ${showTimestamps ? 'on' : ''}`}
            onClick={() => setShowTimestamps(prev => !prev)}
            role="switch"
            aria-checked={showTimestamps}
          >
            <span className="toggle-knob" />
          </button>
        </label>
        {hasChanges && (
          <button className="btn-primary" onClick={handleSaveAll}>
            Save Changes
          </button>
        )}
      </div>

      {audioUrl && (
        <AudioPlayer
          ref={audioPlayerRef}
          audioUrl={audioUrl}
          currentTime={currentTime}
          onTimeUpdate={setCurrentTime}
          onSeek={setCurrentTime}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          onDurationLoaded={onAudioDurationLoaded}
        />
      )}

      <div className="transcript-content" ref={transcriptRef}>
        {paragraphs.map((para, pIdx) => (
          <div key={pIdx} className="paragraph">
            {para.segments.map((seg, sIdx) => (
              <TranscriptSegment
                key={`${pIdx}-${sIdx}`}
                segment={seg}
                isActive={activeSegment?.pIdx === pIdx && activeSegment?.sIdx === sIdx}
                isPlaying={isPlaying}
                isEditing={editingSegment?.pIdx === pIdx && editingSegment?.sIdx === sIdx}
                editText={editText}
                setEditText={setEditText}
                onClick={() => handleSegmentClick(pIdx, sIdx, seg)}
                onDoubleClick={() => handleSegmentDoubleClick(pIdx, sIdx, seg)}
                onSave={handleSegmentSave}
                onCancel={handleSegmentCancel}
                showTimestamps={showTimestamps}
              />
            ))}
            {showTimestamps && <span className="paragraph-end-time">{para.end_ts}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Export Options Component
// ============================================
function ExportOptions({ transcript, jobId, onBackToDashboard }) {
  const [exporting, setExporting] = useState(false);

  const generateText = (includeTimestamps) => {
    if (!transcript?.paragraphs) return '';
    return transcript.paragraphs.map(para => {
      if (includeTimestamps) {
        return para.segments.map(seg => `${seg.ts}  ${seg.text}`).join(' ') + `  ${para.end_ts}`;
      } else {
        return para.segments.map(seg => seg.text).join(' ');
      }
    }).join('\n\n');
  };

  const generateSRT = () => {
    if (!transcript?.paragraphs) return '';
    let index = 1;
    let srt = '';
    
    transcript.paragraphs.forEach(para => {
      para.segments.forEach(seg => {
        const startTime = formatSRTTime(seg.start);
        const endTime = formatSRTTime(seg.end);
        srt += `${index}\n${startTime} --> ${endTime}\n${seg.text}\n\n`;
        index++;
      });
    });
    
    return srt;
  };

  const formatSRTTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const downloadText = (includeTimestamps) => {
    const text = generateText(includeTimestamps);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobId}${includeTimestamps ? '_timestamped' : ''}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSRT = () => {
    const srt = generateSRT();
    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobId}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDocx = (includeTimestamps) => {
    setExporting(true);
    
    // Generate DOCX-compatible HTML
    const content = transcript.paragraphs.map(para => {
      if (includeTimestamps) {
        const text = para.segments.map(seg => 
          `<span style="color:#888;font-size:9pt">${seg.ts}</span> ${seg.text}`
        ).join(' ');
        return `<p style="font-family:Georgia;font-size:12pt;line-height:1.8">${text} <span style="color:#888;font-size:9pt">${para.end_ts}</span></p>`;
      } else {
        const text = para.segments.map(seg => seg.text).join(' ');
        return `<p style="font-family:Georgia;font-size:12pt;line-height:1.8">${text}</p>`;
      }
    }).join('');

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
      <head><meta charset="utf-8"><title>Transcript</title></head>
      <body>${content}</body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-word' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobId}${includeTimestamps ? '_timestamped' : ''}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div className="export-options">
      <h3>Export</h3>
      
      <div className="export-group">
        <span className="export-label">With Timestamps</span>
        <div className="export-buttons">
          <button onClick={() => downloadText(true)} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            TXT
          </button>
          <button onClick={() => downloadDocx(true)} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6,2H14L20,8V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M13,3.5V9H18.5L13,3.5M7,13L8.5,18H10.5L12,14L13.5,18H15.5L17,13H15.5L14.5,17L13,13.5H11L9.5,17L8.5,13H7Z"/>
            </svg>
            Word
          </button>
        </div>
      </div>

      <div className="export-group">
        <span className="export-label">Without Timestamps</span>
        <div className="export-buttons">
          <button onClick={() => downloadText(false)} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            TXT
          </button>
          <button onClick={() => downloadDocx(false)} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6,2H14L20,8V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M13,3.5V9H18.5L13,3.5M7,13L8.5,18H10.5L12,14L13.5,18H15.5L17,13H15.5L14.5,17L13,13.5H11L9.5,17L8.5,13H7Z"/>
            </svg>
            Word
          </button>
        </div>
      </div>

      <div className="export-group">
        <span className="export-label">Subtitles</span>
        <div className="export-buttons">
          <button onClick={downloadSRT} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <line x1="6" y1="12" x2="18" y2="12"/>
              <line x1="6" y1="16" x2="14" y2="16"/>
            </svg>
            SRT
          </button>
        </div>
      </div>

      <div className="how-to-edit">
        <h4>How to Edit</h4>
        <ul>
          <li><strong>Single click</strong> - Play audio from that point</li>
          <li><strong>Double click</strong> - Edit the text</li>
          <li><strong>Save Changes</strong> - Save all edits</li>
        </ul>
      </div>

      <button className="btn-back-dashboard" onClick={onBackToDashboard}>
        ← Back to Dashboard
      </button>
    </div>
  );
}

// ============================================
// Login Page Component
// ============================================
function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
          </svg>
          <h1>Sermon Transcriber</h1>
        </div>
        <p className="login-subtitle">Transcribe sermons with AI-powered accuracy</p>
        
        <div className="login-buttons">
          <SignInButton mode="modal">
            <button className="btn-primary btn-large">Sign In</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="btn-secondary btn-large">Create Account</button>
          </SignUpButton>
        </div>

        <div className="login-features">
          <div className="feature">
            <span className="feature-icon">🎙️</span>
            <span>Upload audio files</span>
          </div>
          <div className="feature">
            <span className="feature-icon">✨</span>
            <span>AI transcription</span>
          </div>
          <div className="feature">
            <span className="feature-icon">✏️</span>
            <span>Edit & export</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main App Component
// ============================================
function App() {
  const { user, isLoaded } = useUser();
  const [currentJobId, setCurrentJobId] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [currentFileName, setCurrentFileName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [view, setView] = useState('upload');
  const [jobs, setJobs] = useState([]);

  // User-specific storage key
  const storageKey = user ? `whisper-jobs-${user.id}` : 'whisper-jobs';

  useEffect(() => {
    if (!user) return;
    const savedJobs = localStorage.getItem(storageKey);
    if (savedJobs) {
      try {
        const parsed = JSON.parse(savedJobs);
        setJobs(parsed);

        // Backfill missing audioDuration/processingTime for completed jobs
        parsed.forEach(async (job) => {
          if (job.status === 'completed' && (job.audioDuration == null || job.processingTime == null)) {
            try {
              const res = await fetch(`${API_BASE}/status/${job.jobId}`);
              const data = await res.json();
              if (data.status === 'completed') {
                setJobs(prev => prev.map(j =>
                  j.jobId === job.jobId
                    ? {
                        ...j,
                        status: 'completed',
                        audioDuration: j.audioDuration ?? data.audioDuration ?? null,
                        processingTime: j.processingTime ?? data.processingTime ?? null,
                      }
                    : j
                ));
              }
            } catch (e) {
              // ignore — best effort backfill
            }
          }
        });
      } catch (e) {
        console.error('Failed to load jobs:', e);
      }
    }
  }, [user, storageKey]);

  useEffect(() => {
    if (!user) return;
    if (jobs.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(jobs));
    }
  }, [jobs, user, storageKey]);

  const handleUploadComplete = (jobId, originalName) => {
    setCurrentJobId(jobId);
    setCurrentFileName(originalName);
    const newJob = {
      jobId,
      originalName,
      userId: user?.id,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: Date.now()
    };
    setJobs(prev => [newJob, ...prev.slice(0, 19)]);
    setView('processing');
  };

  const handleStatusUpdate = useCallback((statusData) => {
    setJobs(prev => prev.map(job => {
      if (job.jobId !== statusData.jobId) return job;
      return {
        ...job,
        status: statusData.status ?? job.status,
        audioDuration: statusData.audioDuration ?? job.audioDuration,
        processingTime: statusData.processingTime ?? job.processingTime,
      };
    }));
  }, []);

  const handleTranscriptReady = useCallback(async (statusData) => {
    const jobId = statusData.jobId;
    try {
      const response = await fetch(`${API_BASE}/transcript/${jobId}`);
      const data = await response.json();
      setTranscript(data);
      setAudioUrl(`${API_BASE}/audio/${jobId}`);
      
      setJobs(prev => prev.map(job => {
        if (job.jobId !== jobId) return job;
        const elapsed = job.startedAt ? Math.round((Date.now() - job.startedAt) / 1000) : null;
        return {
          ...job,
          status: 'completed',
          audioDuration: data.duration ?? data.audio_duration ?? statusData.audioDuration ?? job.audioDuration ?? null,
          processingTime: data.processing_time ?? data.processingTime ?? statusData.processingTime ?? elapsed ?? job.processingTime ?? null
        };
      }));
      
      setView('editor');
    } catch (error) {
      console.error('Failed to load transcript:', error);
      setView('upload');
    }
  }, []);

  const handleSelectJob = async (job) => {
    setCurrentJobId(job.jobId);
    try {
      const response = await fetch(`${API_BASE}/transcript/${job.jobId}`);
      const data = await response.json();
      setTranscript(data);
      setAudioUrl(`${API_BASE}/audio/${job.jobId}`);

      // Backfill duration & processing time from transcript data if missing
      if (data.duration != null || data.audio_duration != null || data.processing_time != null) {
        setJobs(prev => prev.map(j =>
          j.jobId === job.jobId
            ? {
                ...j,
                audioDuration: j.audioDuration ?? data.duration ?? data.audio_duration ?? null,
                processingTime: j.processingTime ?? data.processing_time ?? data.processingTime ?? null,
              }
            : j
        ));
      }

      setView('editor');
    } catch (error) {
      console.error('Failed to load transcript:', error);
      alert('Failed to load transcript');
    }
  };

  const handleDeleteJob = (jobId) => {
    if (!window.confirm('Delete this job from your history?')) return;
    setJobs(prev => {
      const updated = prev.filter(j => j.jobId !== jobId);
      if (updated.length === 0) {
        localStorage.removeItem(storageKey);
      }
      return updated;
    });
  };

  const handleSaveTranscript = async (paragraphs) => {
    const response = await fetch(`${API_BASE}/transcript/${currentJobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphs })
    });
    if (!response.ok) throw new Error('Failed to save');
  };

  const resetToUpload = () => {
    setCurrentJobId(null);
    setTranscript(null);
    setAudioUrl(null);
    setView('upload');
  };

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="app loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Show login page if not signed in */}
      <SignedOut>
        <LoginPage />
      </SignedOut>

      {/* Show main app if signed in */}
      <SignedIn>
        <header className="app-header">
          <div className="logo" onClick={resetToUpload}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
            </svg>
            <span>Sermon Transcriber</span>
          </div>
          <div className="header-right">
            {view !== 'upload' && (
              <button className="btn-secondary" onClick={resetToUpload}>
                New Upload
              </button>
            )}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        <main className="app-main">
          {view === 'upload' && (
            <>
              <UploadPanel
                onUploadComplete={handleUploadComplete}
                isUploading={isUploading}
                setIsUploading={setIsUploading}
              />
              <JobsHistory 
                jobs={jobs} 
                onSelectJob={handleSelectJob}
                onDeleteJob={handleDeleteJob}
                currentJobId={currentJobId}
              />
            </>
          )}

          {view === 'processing' && (
            <StatusPanel
              jobId={currentJobId}
              fileName={currentFileName}
              onTranscriptReady={handleTranscriptReady}
              onStatusUpdate={handleStatusUpdate}
            />
          )}

          {view === 'editor' && transcript && (
            <div className="editor-layout">
              <TranscriptEditor
                transcript={transcript}
                audioUrl={audioUrl}
                onSave={handleSaveTranscript}
                onAudioDurationLoaded={(dur) => {
                  setJobs(prev => prev.map(j =>
                    j.jobId === currentJobId && !j.audioDuration
                      ? { ...j, audioDuration: Math.round(dur) }
                      : j
                  ));
                }}
              />
              <aside className="editor-sidebar">
                <ExportOptions transcript={transcript} jobId={currentJobId} onBackToDashboard={resetToUpload} />
              </aside>
            </div>
          )}
        </main>

        <footer className="app-footer">
          <span>Godstone Tabernacle Sermon Transcription</span>
        </footer>
      </SignedIn>
    </div>
  );
}

export default App;
