import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ============================================
// Upload Panel Component
// ============================================
function UploadPanel({ onUploadComplete, isUploading, setIsUploading }) {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [interpreterMode, setInterpreterMode] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(true);
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
          alert('Upload failed: ' + xhr.statusText);
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
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
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
    </div>
  );
}

// ============================================
// Jobs History Table Component
// ============================================
function JobsHistory({ jobs, onSelectJob, currentJobId }) {
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
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
                <td>
                  {job.status === 'completed' && (
                    <button className="btn-view" onClick={() => onSelectJob(job)}>
                      View
                    </button>
                  )}
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
// Status Panel Component
// ============================================
function StatusPanel({ jobId, onTranscriptReady, onStatusUpdate }) {
  const [statusDetails, setStatusDetails] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const pollInterval = useRef(null);
  const timerInterval = useRef(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    if (!jobId) return;
    startTime.current = Date.now();

    timerInterval.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);

    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/status/${jobId}`);
        const data = await response.json();
        setStatusDetails(data);
        onStatusUpdate?.(data);

        if (data.status === 'completed') {
          clearInterval(pollInterval.current);
          clearInterval(timerInterval.current);
          onTranscriptReady(data);
        } else if (data.status === 'failed') {
          clearInterval(pollInterval.current);
          clearInterval(timerInterval.current);
        }
      } catch (error) {
        console.error('Status check error:', error);
      }
    };

    checkStatus();
    pollInterval.current = setInterval(checkStatus, 5000);

    return () => {
      clearInterval(pollInterval.current);
      clearInterval(timerInterval.current);
    };
  }, [jobId, onTranscriptReady, onStatusUpdate]);

  if (!jobId) return null;

  const getStatusIcon = () => {
    switch (statusDetails?.status) {
      case 'queued': return '⏳';
      case 'processing': return '⚙️';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📋';
    }
  };

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="status-panel">
      <h3>Processing Status</h3>
      <div className="status-card">
        <div className="status-icon">{getStatusIcon()}</div>
        <div className="status-info">
          <span className="status-label">{statusDetails?.status || 'Checking...'}</span>
          <span className="status-file">{jobId}</span>
          {(statusDetails?.status === 'processing' || statusDetails?.status === 'queued') && (
            <span className="status-time">Elapsed: {formatElapsed(elapsedTime)}</span>
          )}
          {statusDetails?.processingTime && (
            <span className="status-time completed">
              ✓ Completed in {Math.floor(statusDetails.processingTime / 60)}m {Math.floor(statusDetails.processingTime % 60)}s
            </span>
          )}
        </div>
      </div>
      {(statusDetails?.status === 'processing' || statusDetails?.status === 'queued') && (
        <p className="status-hint">
          Processing a 2-hour sermon typically takes 8-10 minutes...
        </p>
      )}
    </div>
  );
}

// ============================================
// Audio Player Component
// ============================================
const AudioPlayer = React.forwardRef(({ audioUrl, currentTime, onTimeUpdate, onSeek, isPlaying, setIsPlaying }, ref) => {
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
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
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
function TranscriptSegment({ segment, isActive, isPlaying, onClick, onDoubleClick, isEditing, editText, setEditText, onSave, onCancel }) {
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
      <span className="timestamp">
        {isActive && isPlaying && '▶ '}
        {segment.ts}
      </span>
      <span className="text">{segment.text}</span>
      {' '}
    </span>
  );
}

// ============================================
// Transcript Editor Component
// ============================================
function TranscriptEditor({ transcript, audioUrl, onSave }) {
  const [paragraphs, setParagraphs] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [editingSegment, setEditingSegment] = useState(null);
  const [editText, setEditText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
              />
            ))}
            <span className="paragraph-end-time">{para.end_ts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Export Options Component
// ============================================
function ExportOptions({ transcript, jobId }) {
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

  const downloadWord = async (includeTimestamps) => {
    setExporting(true);
    try {
      const response = await fetch(`${API_BASE}/export/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'docx', includeTimestamps })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${jobId}${includeTimestamps ? '_timestamped' : ''}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      alert('Export failed: ' + error.message);
    }
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
          <button onClick={() => downloadWord(true)} disabled={exporting}>
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
          <button onClick={() => downloadWord(false)} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6,2H14L20,8V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M13,3.5V9H18.5L13,3.5M7,13L8.5,18H10.5L12,14L13.5,18H15.5L17,13H15.5L14.5,17L13,13.5H11L9.5,17L8.5,13H7Z"/>
            </svg>
            Word
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
    </div>
  );
}

// ============================================
// Main App Component
// ============================================
function App() {
  const [currentJobId, setCurrentJobId] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [view, setView] = useState('upload');
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const savedJobs = localStorage.getItem('whisper-jobs');
    if (savedJobs) {
      try {
        setJobs(JSON.parse(savedJobs));
      } catch (e) {
        console.error('Failed to load jobs:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (jobs.length > 0) {
      localStorage.setItem('whisper-jobs', JSON.stringify(jobs));
    }
  }, [jobs]);

  const handleUploadComplete = (jobId, originalName) => {
    setCurrentJobId(jobId);
    const newJob = {
      jobId,
      originalName,
      status: 'queued',
      createdAt: new Date().toISOString()
    };
    setJobs(prev => [newJob, ...prev.slice(0, 19)]);
    setView('processing');
  };

  const handleStatusUpdate = (statusData) => {
    setJobs(prev => prev.map(job => 
      job.jobId === statusData.jobId ? { ...job, ...statusData } : job
    ));
  };

  const handleTranscriptReady = async (statusData) => {
    try {
      const response = await fetch(`${API_BASE}/transcript/${statusData.jobId || currentJobId}`);
      const data = await response.json();
      setTranscript(data);
      setAudioUrl(`${API_BASE}/audio/${statusData.jobId || currentJobId}`);
      
      setJobs(prev => prev.map(job => 
        job.jobId === (statusData.jobId || currentJobId)
          ? { ...job, status: 'completed', audioDuration: data.duration, processingTime: statusData.processingTime }
          : job
      ));
      
      setView('editor');
    } catch (error) {
      console.error('Failed to load transcript:', error);
    }
  };

  const handleSelectJob = async (job) => {
    setCurrentJobId(job.jobId);
    try {
      const response = await fetch(`${API_BASE}/transcript/${job.jobId}`);
      const data = await response.json();
      setTranscript(data);
      setAudioUrl(`${API_BASE}/audio/${job.jobId}`);
      setView('editor');
    } catch (error) {
      console.error('Failed to load transcript:', error);
      alert('Failed to load transcript');
    }
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo" onClick={resetToUpload}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
          </svg>
          <span>Sermon Transcriber</span>
        </div>
        {view !== 'upload' && (
          <button className="btn-secondary" onClick={resetToUpload}>
            New Upload
          </button>
        )}
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
              currentJobId={currentJobId}
            />
          </>
        )}

        {view === 'processing' && (
          <StatusPanel
            jobId={currentJobId}
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
            />
            <aside className="editor-sidebar">
              <ExportOptions transcript={transcript} jobId={currentJobId} />
            </aside>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>Whisper Transcription Service</span>
      </footer>
    </div>
  );
}

export default App;
