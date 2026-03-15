# AI Sermon Transcription Project — Comprehensive Report

**Project**: Automated Sermon Transcription Pipeline  
**Organisation**: Godstone Tabernacle  
**Date**: March 2026  
**Prepared by**: Development Team

---

## 1. What This Project Does

This project automates the transcription of sermon recordings for **Godstone Tabernacle**. Instead of manually typing out sermons — which can take many hours per recording — this system converts MP3 audio files into written text automatically.

**In simple terms**: You upload a sermon recording, and within minutes a written transcript appears — correctly formatted with proper capitalisation for religious terms (God, Lord, Jesus Christ), scripture references (e.g., John 3:16), and British English spelling.

### The Problem It Solves

The Godstone Tabernacle Transcription Team has been manually typing sermon transcripts — a labour-intensive process where a single 90-minute sermon can take **several hours** to transcribe. Key challenges:

- Manually typing a 90-minute sermon takes **several hours**
- Typists must be familiar with religious terminology, names, and scripture references
- The work is physically demanding and repetitive
- Demand often exceeds available typist capacity

### Third-Party Tools Explored

Before this project, the Transcription Team explored existing AI transcription services:

| Tool | Outcome |
|------|--------|
| [Cockatoo](https://www.cockatoo.com/) | Produced documents but did not meet the team's requirements for sermon-specific formatting |
| [ElevenLabs](https://elevenlabs.io/) | Very accurate and intuitive — good first drafts that reduce proofreading time significantly |
| Other AI tools | Most would slow down the workflow rather than speed it up |

**However, a critical concern was raised: privacy.**

Brother Blewett raised the issue of file privacy with third-party cloud services. Sermon recordings are the ministry's intellectual property, and uploading them to external AI platforms means:

- Audio files are sent to servers outside the organisation's control
- No guarantee the content isn't used for model training
- No control over data retention or deletion
- Terms of service can change at any time

This privacy concern — combined with the need for sermon-specific post-processing (reverential capitalisation, scripture formatting, vocabulary corrections) that no off-the-shelf tool provides — led to the decision to build a **self-hosted solution on the organisation's own Azure infrastructure**.

### Why We Built Our Own

| Requirement | Third-Party Tools | Our Solution |
|-------------|------------------|-------------|
| **Privacy** | Audio uploaded to external servers | Audio stays on **our Azure account** — never leaves our infrastructure |
| **Reverential capitalisation** | Not available | God, Lord, Holy Spirit, He/Him/His (in divine context) — all automatic |
| **Scripture formatting** | Not available | "1 Corinthians 13:4–7" formatted automatically |
| **British English** | Most default to American | "honour", "organise", "baptise" — automatic conversion |
| **Vocabulary corrections** | Generic models | Sermon-specific: "William Brandon" → "William Branham", etc. |
| **Cost** | Per-minute pricing adds up | **~£12/month** for 10 sermons/week; £0 when idle |
| **Customisation** | Fixed product | We control every rule — editable JSON config files |

### Our Solution

- A 90-minute sermon is transcribed in **5–7 minutes** — roughly 60× faster than manual typing
- The system applies **sermon-specific corrections** automatically (capitalisation, names, scripture formatting)
- Multiple sermons can be queued — the system processes them one by one without losing any
- The GPU machine **costs nothing when idle** — it starts automatically when a sermon is uploaded and shuts itself down when done

---

## 2. How It Works (Non-Technical Overview)

```
Step 1:  Go to the web portal, sign in, and upload the sermon MP3
            ↓
Step 2:  The system detects the new file automatically
            ↓
Step 3:  A powerful GPU machine starts up (if it was sleeping)
            ↓
Step 4:  The AI listens to the audio and produces raw text
            ↓
Step 5:  Automatic corrections are applied:
           • Capitalises God, Lord, Jesus, Holy Spirit, etc.
           • Fixes known name mishearings (e.g., "William Brandon" → "William Branham")
           • Formats scripture references (e.g., "1 Corinthians 13:4–7")
           • Converts to British English spelling
           • Adds sentence structure (full stops, capitals)
           • Groups text into readable paragraphs
            ↓
Step 6:  The finished transcript appears in the web portal
            ↓
Step 7:  Review, edit, and export the transcript (TXT, Word, or SRT subtitles)
            ↓
Step 8:  After 10 minutes with nothing to do, the GPU machine shuts down (no cost)
```

**No human intervention is required** between Step 1 and Step 6. The entire process is automatic.

The **web portal** (Sermon Transcriber) provides the full experience: upload, real-time progress tracking, synchronized audio playback with transcript highlighting, inline editing, and export — all from a web browser.

---

## 3. Current Status

### What Is Live Today

| Component | Status | Details |
|-----------|--------|---------|
| Automated transcription | **Live** | WhisperX Whisper Large v3 model on NVIDIA V100 GPU |
| Auto-start on upload | **Live** | Event Grid detects uploads, starts the GPU machine |
| Auto-shutdown when idle | **Live** | Machine deallocates after 10 minutes idle — zero cost |
| Vocabulary corrections | **Live** | Corrects common AI mishearings of names, places, religious terms |
| Reverential capitalisation | **Live** | God, Lord, Jesus Christ, Holy Spirit, Scripture, etc. |
| God-context pronouns | **Live** | "He", "Him", "His" capitalised when referring to God |
| Scripture reference formatting | **Live** | Normalised to "Book Chapter:Verse" with en-dash ranges |
| British English spelling | **Live** | "honour", "organise", "baptise", "realise", etc. |
| Sentence structure | **Live** | Punctuation restoration and sentence capitalisation |
| Paragraph grouping | **Live** | Intelligent breaks at natural speech pauses |
| Retry & error handling | **Live** | Failed jobs retry 3 times, then go to dead-letter queue |
| Health monitoring | **Live** | Health endpoint for service monitoring |
| Structured logging | **Live** | JSON logs for operational visibility |
| **Web portal** | **Live** | Upload, track progress, review/edit transcripts, export (TXT/Word/SRT) |
| User authentication | **Live** | Clerk-based sign-in with per-user job history |
| Audio trimming | **Live** | Trim audio before upload with visual waveform editor |
| Interpreter mode | **Live** | Option to handle bilingual sermons (English-only or both languages) |
| Inline transcript editing | **Live** | Double-click any segment to edit; click to play from that point |
| Synchronized audio playback | **Live** | Audio player highlights the current segment in real time |
| Export options | **Live** | Download as TXT, Word (.doc), or SRT subtitles — with or without timestamps |

### Deployment Tracks

| Track | Status | Purpose |
|-------|--------|---------|
| **Web Portal** | **Live / Production** | React frontend on Vercel — upload, review, edit, and export transcripts |
| **Standalone VM** | **Active / Production** | GPU backend — one V100 machine in UK South |
| **Azure Batch** | Ready for testing | An alternative approach using managed pool of GPU machines |
| **VM Scale Set (VMSS)** | Code complete, not yet deployed | Auto-scaling approach (blocked by Azure quota permissions) |

---

## 4. What the Transcript Looks Like

For each sermon, the system produces four output files:

### 1. Clean Text (`.clean.txt`) — For reading and review

A plain-English transcript with paragraphs, ready for proofreading:

> Shall we bow our heads in a word of prayer. Our Heavenly Father, we certainly thank you for the opportunity to be here tonight, Lord, may the love of God just sweep down tonight, Lord, and take all the unbelief out of our midst...

### 2. Timestamped Paragraphs (`.paragraphs.txt`) — For referencing the audio

Each paragraph has start and end timestamps:

> 00:00:01  Shall we bow our heads in a word of prayer...  00:00:58

### 3. Structured Paragraphs (`.paragraphs.json`) — For software integration

Machine-readable format with precise timing, segment indices, and metadata.

### 4. Raw Transcript (`.json`) — Full detail

Every word with its exact timestamp and confidence score from the AI model.

---

## 5. Transcript Quality — Feedback & Response

An early reviewer provided detailed feedback. Here is the status of each point raised:

### Positive Feedback

| Feedback | Status |
|----------|--------|
| **"Word accuracy is very good — one of the better ones I've seen"** | Confirmed. WhisperX Large v3 provides strong base accuracy. Additionally, ~50 known mishearing corrections are applied automatically. |

### Issues Raised & Current Status

*Status validated by fresh processing run on 14 March 2026.*

| # | Issue Raised | Status | What Was Done |
|---|-------------|--------|---------------|
| 1 | **Lack of sentence structure / no full stops** | **Largely fixed; residual gaps remain** | Three mechanisms added: (a) punctuation restoration model, (b) segment-boundary detection inserts full stops at speech pauses, (c) discourse-starter detection. Fresh test shows 97.2% of segments now end with proper punctuation (was ~0% in initial review). 32 of 1,123 segments still lack ending punctuation — these are the **primary remaining quality gap**. Punctuation artefacts (orphan periods, double commas) are now **fully cleaned up** (0 instances in fresh output, vs 59 in old output). |
| 2 | **No capital letters at start of sentences** | **Largely fixed** | Automatic sentence-start capitalisation is active. Remaining gaps are downstream of the 32 unpunctuated segments (no full stop = no capital). |
| 3 | **Random capital letters mid-sentence** | **Largely fixed** | A 300+ word list identifies common English words that should be lowercase mid-sentence, while protecting proper nouns (God, Lord, Jesus, place names, people names, scripture books). Fresh output shows correct capitalisation on standard words. |
| 4 | **Paragraph breaks mid-sentence** | **Largely fixed** | "Safe breakpoint" logic ensures paragraphs only break where the previous text ends with a full stop or at a strong natural pause. A hard cap prevents infinite paragraphs. |
| 5 | **Missing capitals when needed** | **Fixed** | Reverential capitalisation (God, Lord, Holy Spirit, etc.), God-context pronoun capitalisation (He, Him, His), and personal pronoun "I" correction are all active and working in fresh output. |
| 6 | **American English instead of British** | **Fixed** | Over 50 American-to-British spelling conversions active and verified — zero American spellings found in fresh output for all mapped words. One gap: "marvelous" → "marvellous" not yet mapped. |

### Remaining Quality Work

*Validated by fresh processing run on 14 March 2026 against 1,123 raw WhisperX segments.*

| Priority | Issue | Evidence from Fresh Run | Impact |
|----------|-------|------------------------|--------|
| **High** | Improve full-stop placement on long unpunctuated segments | 32 of 1,123 segments (2.8%) end without any punctuation. Several are 200+ characters with no sentence breaks at all — these are the hardest to proofread. | The #1 remaining issue. Cascades into missing sentence capitals. |
| **Fixed** | ~~Clean up punctuation artefacts (orphan periods, double commas)~~ | Old v3 output had 35 orphan periods, 15 double periods, and 9 double commas. **Fresh output: 0 orphan periods, 0 double periods, 0 double commas.** Cleanup regex in `postprocess_paragraph()` is working. | ~~Minor but visually distracting~~ → **Resolved.** |
| **Fixed** | ~~American English remaining~~ | Fresh output contains zero instances of "organize", "honor", "favor", "color", "realize", "baptize", "recognize", "center", "analyze", "behavior", "neighbor", or "labor". British English conversion is working. | ~~Small config-file addition~~ → **Resolved.** |
| **Medium** | Add "marvellous" to British English mapping | Fresh output still has "marvelous" (1 occurrence). Missing from `british_english.py`. | Small config-file addition. |
| **Medium** | Capitalise denomination names consistently | Fresh output: "lutherans" (1), "methodists" (1), "pentecostals" (1) appear lowercase alongside correctly capitalised forms. The lowercase instances come from raw WhisperX output and are not caught by the capitalisation config. | Small config-file addition to `capitalization.json`. |
| **Low** | Detect questions ("How good is it?" not "How good is it.") | "how good is it." appears with a period instead of "?" in 6 instances. The punctuation model does not reliably detect rhetorical questions. | Needs a question-starter detection heuristic. |

---

## 6. How the System Is Built (Technical Detail)

### Architecture

```
  User → Web Portal (Vercel / React)
              ├── Clerk authentication (sign in / sign up)
              ├── Upload MP3 via SAS token (direct to Azure Blob)
              ├── Real-time status polling (queued → processing → complete)
              ├── Transcript editor with synchronized audio playback
              └── Export: TXT, Word (.doc), SRT subtitles
                      │
                      ▼
  Azure Blob Storage (audio-input/)
                      │
                      ▼
              Azure Event Grid (BlobCreated trigger)
                      │
                      ▼
              Azure Function (enqueue_job)
                ├── Enqueues job message → Azure Storage Queue
                └── Wakes GPU VM if deallocated (via Azure Compute SDK)
                      │
                      ▼
              GPU Worker (V100, systemd service)
                ├── Polls queue every 10 seconds
                ├── Downloads MP3 from blob storage
                ├── Converts to 16 kHz mono WAV (ffmpeg)
                ├── WhisperX transcription (large-v3, CUDA)
                ├── 9-phase deterministic post-processing pipeline
                ├── Uploads 4 output files → Blob Storage (transcripts/)
                └── Self-deallocates after 10 min idle
                      │
                      ▼
              Web Portal polls for completion → loads transcript + audio
```

### Post-Processing Pipeline (9 Phases)

All corrections are **deterministic and rule-based** — no AI rewrites the speaker's words. The corrections are predictable, auditable, and configurable via JSON files.

| Phase | What It Does | Config File |
|-------|-------------|-------------|
| A. Vocabulary corrections | Fixes AI mishearings of names/places | `config/replacements.json` |
| B. Personal pronouns | "i" → "I", "i'm" → "I'm" | Built-in |
| C. Reverential capitalisation | "god" → "God", "holy spirit" → "Holy Spirit" | `config/capitalization.json` |
| D. God-context pronouns | "he/him/his" → "He/Him/His" near divine names | Built-in (80-char context window) |
| E. Scripture references | Normalises to "Book Chapter:Verse" format | `config/scripture_books.json` |
| F. Paragraph capitalisation | First letter of each paragraph capitalised | Built-in |
| G. Punctuation restoration | Inserts full stops, commas, question marks | `deepmultilingualpunctuation` model |
| H. Sentence restoration | Boundary detection, sentence capitals, mid-cap fixes | `sentence_restore.py` |
| I. British English | American → British spelling conversion | `british_english.py` |

### Web Portal — `whisper-frontend`

A single-page React application hosted on Vercel, providing the complete user experience.

| Component | Technology | Purpose |
|-----------|-----------|--------|
| Frontend | React 18 + Vite 5 | Single-page app with drag-and-drop upload, transcript editor, audio player |
| Hosting | Vercel | Static build + serverless API functions (zero config, automatic deploys) |
| Authentication | Clerk | User sign-in/sign-up with per-user job history stored in localStorage |
| API Proxy | Vercel Serverless (Node.js) | Catch-all route (`api/[...api].js`) proxying to Azure Storage |
| Upload | Azure Blob SAS tokens | Frontend uploads directly to Azure via time-limited SAS URL (no file passes through server) |
| Audio Playback | HTML5 `<audio>` element | Synchronized playback highlighting the active transcript segment, with imperative ref-based API (`seekAndPlay`, `pause`) |
| Audio Trimming | Web Audio API + Canvas | Visual waveform editor with drag handles, click-to-seek, scrub preview, and keyboard shortcuts |
| Export | Client-side generation | TXT (plain/timestamped), Word (.doc via HTML), SRT subtitles |
| State Management | React Hooks + localStorage | Per-user job history stored in `whisper-jobs-{userId}` — no external state library |

**React Components:**

| Component | Purpose |
|-----------|--------|
| `App` | Root component — manages views (upload / processing / editor), job state, and navigation |
| `LoginPage` | Unauthenticated landing page with Clerk sign-in/sign-up |
| `UploadPanel` | Drag & drop file upload with interpreter mode toggle and optional trim |
| `TrimModal` | Full waveform audio editor — drag handles, click-to-seek, scrub preview, keyboard shortcuts |
| `StatusPanel` | Animated processing tracker with SVG progress ring and 4-step visual pipeline |
| `StatusTips` | Rotating tips displayed during processing (cycles every 4 seconds) |
| `AudioPlayer` | Audio playback controls with timeline scrubber, skip ±10s, and imperative ref API |
| `TranscriptEditor` | Paragraph-based transcript viewer with playback sync and inline editing |
| `TranscriptSegment` | Individual segment renderer — click to play, double-click to edit |
| `ExportOptions` | Export to TXT, Word, and SRT with or without timestamps |
| `JobsHistory` | Table of past transcriptions with status badges, durations, and actions |

**Key features:**
- **Drag & drop upload** with progress bar — supports MP3, WAV, M4A, FLAC
- **Interpreter mode** — option to handle bilingual sermons (English-only or both languages)
- **Real-time processing status** — animated SVG progress ring, 4-step tracker with elapsed time, and rotating tips
- **Click-to-play** — single-click any transcript segment to play audio from that timestamp
- **Inline editing** — double-click any segment to edit text, then save changes back to Azure
- **Auto-scroll** — active segment automatically scrolls into centre view during playback
- **Timestamp toggle** — show/hide timestamps for clean reading view
- **Audio trimming** — visual waveform with draggable handles, editable start/end timestamps (supports h:m:s.ms input), scrub preview while dragging, keyboard shortcuts (Space to play/pause, Esc to cancel), and savings percentage display
- **Job history** — per-user history with auto-backfill of missing audio duration and processing time from the API
- **Export options** — TXT, Word, SRT — each with or without timestamps
- **Loading state** — spinner displayed while Clerk authentication initialises

**API Endpoints (Vercel Serverless):**

| Endpoint | Method | Purpose |
|----------|--------|--------|
| `/api/get-upload-url` | POST | Generates SAS token for direct browser-to-Azure upload — receives `{filename, contentType, interpreterMode, englishOnly}`, returns `{uploadUrl, jobId, blobName}` |
| `/api/upload-complete` | POST | Acknowledges upload — sends `{jobId, blobName, interpreterMode, englishOnly, originalName}` (Event Grid handles the real trigger) |
| `/api/status/:jobId` | GET | Polls Azure Storage to check if transcript exists — returns `{jobId, status, audioDuration?, processingTime?}` (polled every 5 seconds) |
| `/api/transcript/:jobId` | GET | Fetches the `.paragraphs.json` — returns `{paragraphs: [{segments: [{ts, text, start, end}], end_ts}], duration?, processing_time?}` |
| `/api/transcript/:jobId` | PUT | Saves edited transcript back to Azure — sends updated `{paragraphs}` with modified segment text |
| `/api/audio/:jobId` | GET | Redirects to SAS-signed audio URL for browser playback |
| `/api/_version` | GET | Health/version check |

### Azure Resources

| Resource | Name | Location | Purpose |
|----------|------|----------|--------|
| GPU VM | `whisperx-v100` | UK South | NVIDIA V100 GPU — runs transcription |
| Storage Account | `whisperst180477` | East US | Stores audio files, transcripts, queues |
| Function App | `whisper-func-standalone` | UK South | Detects uploads, starts VM |
| Resource Group | `whisper-rg` | West US 2 | Contains all resources |
| Web Portal | Vercel (whisper-frontend) | Global CDN | React app + serverless API |

### Security

| Measure | Detail |
|---------|--------|
| Managed Identity | VM and Function authenticate via Azure AD — no storage keys in code |
| Clerk Authentication | Web portal requires sign-in — only authorised users can upload and access transcripts |
| Key Vault | Secrets stored in Azure Key Vault, not environment variables |
| NSG | Network access restricted to admin IP only |
| TLS 1.2 | Enforced on all storage connections |
| No public blob access | Storage containers are private |
| RBAC | Least-privilege roles for each principal |
| **Data sovereignty** | **All audio and transcripts remain on Godstone Tabernacle's own Azure account — nothing is sent to third-party AI services. The WhisperX model runs locally on our GPU, not via an external API.** |

### Infrastructure as Code

All Azure resources are defined in a Bicep template (`infra/main.bicep`), with numbered deployment scripts for reproducible setup (`00_prereqs.sh` through `17_deploy_worker_to_vm.sh`).

---

## 7. Performance & Cost

### Processing Speed

| Metric | Value |
|--------|-------|
| Time per sermon (~90 min audio) | ~5–7 minutes |
| Sermons per hour (1 VM) | ~8–10 |
| Concurrent uploads | Unlimited (queued) |
| Processing order | First-in, first-out |
| VM cold start time | ~2–3 minutes |
| Auto-shutdown after idle | 10 minutes |

### Cost

| Component | Cost | When |
|-----------|------|------|
| GPU VM (processing) | ~£2.83 / hour | Only while transcribing |
| GPU VM (idle/off) | ~£4 / month | OS disk storage only |
| Function App | Pennies / month | Negligible |
| Storage | Low | Per-GB + transactions |
| **Total when idle** | **~£4 / month** | **No GPU cost when no work** |

**Example**: Transcribing 10 sermons per week ≈ 1 hour of GPU time ≈ **~£12/month** total.

---

## 8. Constraints & Limitations

### Azure Infrastructure

| Constraint | Impact | Resolution Path |
|------------|--------|----------------|
| GPU quota limited to 1 VM (9 vCPUs) | Can only process 1 sermon at a time | Request quota increase to 12 vCPUs for 2 parallel VMs |
| VMSS deployment blocked | Cannot deploy auto-scaling architecture | Requires resource-group-create permissions or new subscription |
| Batch path is scaffolding only | Not yet a production-ready alternative | Needs Event Grid wiring and managed identity on nodes |

### Transcript Quality

| Constraint | Impact | Resolution Path |
|------------|--------|----------------|
| Sentence structure not perfect | Reviewer found it faster to type than correct | Improve full-stop insertion accuracy (highest priority) |
| English only | Post-processing only supports English sermons | Extend config files for other languages if needed |
| Sermon-specific vocabulary | New names/terms need manual addition to config | Community contributions to `replacements.json` |

### Operational

| Constraint | Impact | Resolution Path |
|------------|--------|----------------|
| Sequential processing | 10 sermons take ~50–70 minutes | Parallel VMs (requires quota increase) |

---

## 9. Future Roadmap

### Phase 1: Transcript Quality (Immediate Priority)

The most impactful work is improving the transcript to the point where **correcting the AI output is faster than typing from scratch**. This means:

- Improving full-stop and sentence boundary detection
- Cleaning up punctuation artefacts
- Expanding the British English word list
- Adding denomination capitalisation (Lutherans, Methodists, Pentecostals)
- Adding question detection

**Success metric**: A reviewer can proofread and correct the AI transcript faster than typing the sermon manually.

### Phase 2: Production Hardening (Near-term)

| Item | What It Means |
|------|---------------|
| ~~Monitoring & alerts~~ | ~~Get notified if a transcription fails or the queue is stuck~~ — **Done.** External watchdog function and budget alerts deployed (see Section 11) |
| Azure Batch autoscale | GPU pool scales automatically with demand |
| Event Grid for Batch | Auto-trigger Batch jobs on upload (currently manual) |
| Managed Identity everywhere | Remove all remaining secret/key usage |

### Phase 3: Scaling (Mid-term)

| Item | What It Means |
|------|---------------|
| Parallel processing | 2+ sermons transcribed simultaneously |
| VMSS deployment | Auto-scaling fleet of GPU machines (when permissions allow) |
| A100 GPU upgrade | Cuts transcription time from 5–7 min to 2–3 min per sermon |

### Phase 4: Features (Future)

| Item | What It Means |
|------|---------------|
| Speaker identification | Label who is speaking (minister, congregation, etc.) |
| Multi-language | Support for sermons in other languages |
| CI/CD pipeline | Automated testing and deployment when code changes |
| Email notifications | Notify users when a transcript is ready (currently poll-based) |

---

## 10. Repository & Technical Reference

### Repositories

The project spans **two repositories**:

**Backend** — [`othnielObasi/whisperx-azure`](https://github.com/othnielObasi/whisperx-azure)

```
├── infra/                    # Azure resource definitions (Bicep IaC)
├── functions/enqueue_job/    # Azure Function (detects uploads, wakes VM)
├── worker-container/         # GPU worker + post-processing pipeline
│   ├── worker.py             #   Queue polling, job lifecycle, self-deallocate
│   ├── transcribe.py         #   WhisperX transcription + paragraph grouping
│   ├── postprocess.py        #   Deterministic text corrections (9 phases)
│   ├── sentence_restore.py   #   Sentence boundary detection
│   ├── british_english.py    #   American → British spelling
│   └── config/               #   JSON rule files (editable without code changes)
│       ├── capitalization.json    # Religious terms to capitalise
│       ├── replacements.json      # Known AI mishearings to correct
│       ├── scripture_books.json   # Bible book names and aliases
│       └── scripture_rules.json   # Feature toggles (punctuation, British English, etc.)
├── docker/                   # Container image definitions
├── scripts/                  # Deployment and test scripts
├── systemd/                  # Linux service definitions
├── docs/                     # Architecture documentation
└── tests/                    # Sample outputs for quality comparison
```

**Frontend** — [`othnielObasi/whisper-frontend`](https://github.com/othnielObasi/whisper-frontend)

```
├── src/
│   ├── App.jsx               # All components: Upload, TrimModal, StatusPanel,
│   │                         #   TranscriptEditor, AudioPlayer, ExportOptions,
│   │                         #   JobsHistory, LoginPage
│   ├── App.css               # Custom CSS (warm, professional design)
│   └── main.jsx              # Entry point with Clerk authentication provider
├── api/
│   └── [...api].js           # Vercel serverless catch-all (SAS tokens, status,
│                              #   transcript CRUD, audio proxy)
├── vercel.json               # Vercel deployment config
├── vite.config.js            # Vite build config with dev proxy
└── .env.example              # Environment variable template
```

### Key Technical Highlights

- **Complete web experience**: Upload, track, review, edit, and export — all from a browser, no technical tools needed
- **Zero idle cost**: GPU shuts down automatically — you only pay when sermons are being transcribed
- **Fully event-driven**: Upload an MP3 and walk away — transcripts appear automatically
- **Deterministic corrections**: Rule-based, not AI rewriting — the speaker's words are preserved exactly
- **Config-driven**: Vocabulary, capitalisation, and scripture rules are in editable JSON files — no code changes needed to add a new name or term
- **Fault-tolerant**: Queue-based with automatic retries and dead-letter handling — no jobs are ever lost
- **Secure by design**: Managed Identity, Key Vault, Clerk authentication, SAS-token uploads, network restrictions
- **Direct-to-storage uploads**: Files go straight from the browser to Azure Blob Storage via SAS tokens — no server bottleneck
- **Inline editing with audio sync**: Click any segment to hear it, double-click to edit — efficient proofreading workflow

---

## 11. Post-Implementation Challenges & Resolutions

### The Cost Incident (March 11–14, 2026)

#### What Happened

On March 11, the system was working correctly — the GPU VM started automatically when sermons were uploaded, transcribed them, and deallocated itself after 10 minutes idle. This self-deallocate cycle succeeded **three times** that day:

| Time (UTC) | Event | Triggered By |
|---|---|---|
| 12:26 | VM self-deallocated after idle timeout | Worker (Managed Identity) |
| 13:50 | VM woke up for new sermon upload | Function App |
| 14:09 | VM self-deallocated after idle timeout | Worker (Managed Identity) |
| 21:31 | VM woke up for new sermon upload | Function App |
| 21:51 | VM self-deallocated after idle timeout | Worker (Managed Identity) |

At **23:05**, the VM was started manually for a deployment test. After this start, the worker process either crashed on startup or failed to initialise properly. Because the worker was the **only component** capable of deallocating the VM, and it was no longer running, the GPU machine stayed on with no work to do.

**The VM ran unattended for approximately 60 hours** — from March 11 at 23:06 UTC until an administrator noticed the accumulating costs and manually stopped it on March 14 at 11:34 UTC.

Azure Advisor itself flagged the idle VM on March 13 with a recommendation to deallocate it, but there was no alerting mechanism to surface this to the team.

#### Cost Impact

| Resource | Cost | Notes |
|---|---|---|
| VM compute (60 hours × ~£2.83/hr) | ~£170 | The GPU running with no work |
| Storage, networking, other | ~£5 | Normal background costs |
| **Total** | **~£175** | Against a £200/month budget |

Nearly the entire monthly budget was consumed in 2.5 days on an idle machine.

#### Root Cause: Single Point of Failure

The self-deallocate mechanism was designed as follows:

```
Worker polls queue → Queue empty for 10 min → Worker calls Azure Deallocate API → VM shuts down
```

This design had a **critical flaw**: the VM's only path to shut itself down was the worker process successfully reaching the idle timeout and calling the Azure SDK. If any of the following happened, the VM would run forever:

| Failure Mode | What Goes Wrong | VM Stays Running? |
|---|---|---|
| Worker crashes on startup | `sys.exit(1)` with `Restart=no` — systemd leaves it dead | **Yes — indefinitely** |
| API service fails | Worker has `Requires=whisperx-api.service` — both die | **Yes — indefinitely** |
| Job hangs forever | Worker never returns to idle-check loop | **Yes — indefinitely** |
| Azure SDK call fails | `_self_deallocate()` catches exception and logs, but exits anyway | **Yes — indefinitely** |
| SIGTERM received | Signal handler exits without attempting deallocate | **Yes — indefinitely** |

In every case, the result is the same: **no external authority exists to stop the VM**. The systemd service had `Restart=no` (intentionally, so the worker wouldn't restart after a successful self-deallocate), but this also meant it wouldn't restart after a crash.

### Fixes Implemented (March 15, 2026)

A defence-in-depth approach was implemented with four independent layers. Each layer can catch failures that the previous layer missed.

#### Layer 1: External Watchdog Timer Function

The most critical fix. A new Azure Function (`vm_watchdog`) runs on a **5-minute timer**, completely independent of the VM.

**Logic:**
1. Check if VM is running → if not, exit (nothing to do)
2. Check how long the VM has been running
3. Check if the job queue is empty
4. **Idle deallocate**: If queue is empty AND VM has been running > 15 minutes → deallocate
5. **Circuit breaker**: If VM has been running > 90 minutes total, regardless of queue state → force-deallocate

This means: even if the worker process is completely dead, the worst case is the VM runs for **15 minutes** of wasted compute (~£0.71) instead of days (~£170). The 90-minute circuit breaker is an absolute safety net — no single sermon should take that long.

The watchdog runs on the existing Consumption (Y1) plan Function App, which costs essentially nothing (fractions of a penny per execution).

```
files:  functions/vm_watchdog/__init__.py
        functions/vm_watchdog/function.json
config: WATCHDOG_IDLE_MINUTES=15
        WATCHDOG_MAX_RUNTIME_MINUTES=90
```

#### Layer 2: Worker Hardening

Three changes to `worker-container/worker.py`:

**a) Self-deallocate retries 3 times** (was fire-and-forget)

Previously, if the Azure SDK call failed once, the worker logged an error and exited — leaving the VM running. Now it retries 3 times with a 5-second backoff between attempts.

**b) Fatal errors attempt deallocate before exit**

Previously, an unhandled exception would call `sys.exit(1)` immediately. Now the worker attempts to deallocate the VM before exiting, even on a fatal crash.

**c) Signal handler attempts deallocate**

Previously, receiving SIGTERM/SIGINT would set a flag and exit without deallocating. Now, if the worker receives a shutdown signal with no active job, it attempts to deallocate before exiting.

#### Layer 3: Systemd Service Resilience

Changed `whisperx-worker.service` from `Restart=no` to `Restart=on-failure` with limits:

```ini
Restart=on-failure
RestartSec=30
StartLimitBurst=3
StartLimitIntervalSec=300
```

This means:
- **Normal exit** (code 0) after self-deallocate → no restart (correct behaviour)
- **Crash** (code 1) → restart up to 3 times in 5 minutes
- **Still crashing** → systemd gives up; the external watchdog (Layer 1) handles it

#### Layer 4: Budget Alerts

A deployment script (`18_setup_alerts.sh`) creates Azure budget alerts at £50, £100, and £150 thresholds. These email the administrator when spending crosses each level, providing early warning before costs reach the £200 monthly budget.

### Updated Architecture

```
Blob Upload → Event Grid → Azure Function (enqueue_job)
                                ├─ Enqueue job to Storage Queue
                                └─ Start VM if deallocated

VM Boot → systemd starts:
    whisperx-api.service   (FastAPI GPU server, Restart=on-failure)
    whisperx-worker.service (Queue poller, Restart=on-failure, max 3 retries)
        └─ worker.py polls queue
              ├─ Job found → process → reset idle timer
              ├─ Queue empty for 10 min → _self_deallocate (3 retries) → exit
              └─ SIGTERM / fatal error → attempt deallocate → exit

NEW → Watchdog Function (every 5 min):            ← EXTERNAL KILL SWITCH
        ├─ Is VM running?
        │    └─ No → exit (no cost)
        ├─ Is queue empty + VM idle > 15 min?
        │    └─ Yes → Deallocate
        └─ Has VM been running > 90 min?           ← CIRCUIT BREAKER
             └─ Yes → Force-deallocate unconditionally

NEW → Azure Budget Alerts:                         ← COST SAFETY NET
        ├─ £50/mo  → email notification
        ├─ £100/mo → email notification
        └─ £150/mo → email notification
```

### Defence Summary

| Layer | Mechanism | Max Wasted Cost | Depends On |
|---|---|---|---|
| 1 | **External watchdog** (15 min idle / 90 min cap) | **~£0.71 – £4.25** | **Azure Function runtime (independent)** |
| 2 | Worker self-deallocate (10 min idle, 3 retries) | ~£0.47 | Worker process alive |
| 3 | Systemd restart on crash (up to 3 attempts) | ~£2.50 | Worker can restart successfully |
| 4 | Budget email alerts | Human response time | Azure billing pipeline |

### Lessons Learned

1. **Never rely on a VM to shut itself down.** An in-VM process is the wrong place for cost-critical lifecycle control. If the process dies, the VM stays on. An external controller — running outside the VM — must have the final authority.

2. **`Restart=no` was a design trap.** The intent was correct (don't restart after self-deallocate), but it also prevented recovery from crashes. `Restart=on-failure` with limits is the right trade-off.

3. **Fire-and-forget API calls are dangerous for cost control.** A single failed `begin_deallocate()` call with no retry can cost hundreds of pounds. Critical operations must retry.

4. **Budget alerts are not optional for pay-per-use GPU resources.** The VM ran for 60 hours before anyone noticed. Even basic email alerts at threshold levels would have caught this within hours.

5. **Activity logs are essential for post-incident investigation.** Azure Activity Log recorded every start and deallocate event with the caller identity, making it possible to reconstruct exactly what happened. These logs are retained for 90 days by default.

*Full forensic details, including the complete Activity Log timeline and code-level analysis of each failure mode, are documented in [COST_INCIDENT_REPORT.md](COST_INCIDENT_REPORT.md).*
