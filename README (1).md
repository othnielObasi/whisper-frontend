# Sermon Transcriber

A web application for transcribing sermon audio files using Azure Whisper AI. Upload audio, get accurate transcriptions with timestamps, and edit/export the results.

![Sermon Transcriber](https://img.shields.io/badge/React-18.2-blue) ![Vite](https://img.shields.io/badge/Vite-5.0-purple) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## Features

- **Audio Upload** - Drag & drop MP3, WAV, M4A, FLAC files
- **Interpreter Mode** - Option to handle bilingual sermons
- **Real-time Status** - Track processing progress
- **Audio Player** - Synchronized playback with transcript highlighting
- **Click to Play** - Single click any segment to play from that timestamp
- **Inline Editing** - Double-click any segment to edit text
- **Export Options** - Download as TXT or Word, with or without timestamps
- **Job History** - View and access previous transcriptions

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Custom CSS (warm, professional design)
- **Backend**: Vercel Serverless Functions
- **Storage**: Azure Blob Storage
- **Transcription**: Azure VM with WhisperX AI

## Deployment

### Deploy to Vercel

1. Fork/clone this repository
2. Go to [vercel.com](https://vercel.com) and import the project
3. Add environment variables:

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_ACCOUNT` | Azure Storage account name |
| `AZURE_STORAGE_KEY` | Azure Storage account key |
| `AZURE_STORAGE_CONNECTION_STRING` | Full connection string |

4. Deploy!

### Local Development

```bash
# Install dependencies
npm install

# Create .env file from template
cp .env.example .env
# Edit .env with your Azure credentials

# Start dev server
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Vercel                                     │
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │  React Frontend │    │  Serverless API Functions       ││
│  │  (Static Build) │───▶│  /api/get-upload-url            ││
│  │                 │    │  /api/upload-complete           ││
│  │                 │    │  /api/status/[jobId]            ││
│  │                 │    │  /api/transcript/[jobId]        ││
│  │                 │    │  /api/audio/[jobId]             ││
│  └─────────────────┘    └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────┐
              │  Azure Storage              │
              │  - audio-input (uploads)    │
              │  - transcripts (results)    │
              │  - whisper-jobs (queue)     │
              └─────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────┐
              │  Azure VM (Auto-scaling)    │
              │  - WhisperX AI Engine       │
              │  - Scales 0-2 based on load │
              └─────────────────────────────┘
```

## Usage

1. **Upload**: Drag & drop an audio file or click to browse
2. **Wait**: Processing takes ~8-10 minutes for a 2-hour sermon
3. **Review**: Click segments to play, double-click to edit
4. **Export**: Download as TXT or Word document

## License

MIT
