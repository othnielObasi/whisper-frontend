import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;

async function loadFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  const isIsolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  const pkg = isIsolated ? '@ffmpeg/core' : '@ffmpeg/core-st';
  const base = `https://unpkg.com/${pkg}@0.12.6/dist/umd`;

  const instance = new FFmpeg();
  await instance.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = instance;
  return instance;
}

export async function detectFileType(file) {
  const bytes = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(bytes);

  // MP4 / MOV / M4V — 'ftyp' box at byte offset 4
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video';

  // MKV / WebM — EBML header
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'video';

  // AVI — RIFF....AVI
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x41 && b[9] === 0x56 && b[10] === 0x49
  ) return 'video';

  return 'audio';
}

export async function convertVideoToAudio(file, onProgress) {
  const instance = await loadFFmpeg();

  const progressHandler = ({ progress }) => {
    if (onProgress) onProgress(Math.min(99, Math.round(progress * 100)));
  };
  instance.on('progress', progressHandler);

  const ext = (file.name.match(/\.[^.]+$/) || ['.mp4'])[0].toLowerCase();
  const inputName = `input${ext}`;

  try {
    await instance.writeFile(inputName, await fetchFile(file));

    // Fast path: stream copy — no re-encode, just strips video track (seconds, any size)
    let usedCopy = true;
    try {
      await instance.exec(['-i', inputName, '-vn', '-acodec', 'copy', 'output.m4a']);
    } catch {
      // Stream copy failed (e.g. MKV with Opus) — fall back to re-encode
      usedCopy = false;
      await instance.exec(['-i', inputName, '-vn', '-ar', '44100', '-ac', '1', '-b:a', '96k', 'output.mp3']);
    }

    const outputName = usedCopy ? 'output.m4a' : 'output.mp3';
    const mimeType = usedCopy ? 'audio/mp4' : 'audio/mpeg';
    const data = await instance.readFile(outputName);

    await instance.deleteFile(inputName);
    await instance.deleteFile(outputName);

    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([data.buffer], `${stem}${usedCopy ? '.m4a' : '.mp3'}`, { type: mimeType });
  } finally {
    instance.off('progress', progressHandler);
  }
}
