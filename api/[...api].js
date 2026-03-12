import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";

async function streamToString(readableStream) {
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function normalizeJobId(id) {
  return id.replace(/\.[^/.]+$/, "");
}

export default async function handler(req, res) {
  // Keep CORS headers consistent for browser uploads
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-ms-blob-type");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Vercel populates req.query.api as an array for [...api] catch-all routes
  // Fallback: parse from req.url if req.query.api is not populated
  let parts = Array.isArray(req.query.api) ? req.query.api : (req.query.api ? [req.query.api] : []);
  if (parts.length === 0) {
    const fullPath = (req.url || '').split('?')[0];
    parts = fullPath.split('/').filter(Boolean);
    // Remove leading 'api' segment
    if (parts[0] === 'api') parts = parts.slice(1);
  }

  try {
    // ----- version ----
    if (parts.length === 1 && parts[0] === '_version') {
      return res.status(200).json({
        ok: true,
        sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
        message: 'version endpoint is live',
        time: new Date().toISOString(),
      });
    }

    // ----- get-upload-url ----
    if (parts.length === 1 && parts[0] === 'get-upload-url' && req.method === 'POST') {
      const accountName = process.env.AZURE_STORAGE_ACCOUNT;
      const accountKey = process.env.AZURE_STORAGE_KEY;
      const containerName = process.env.AZURE_STORAGE_CONTAINER || 'audio-input';

      const { filename } = req.body || {};
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'filename is required' });
      }

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
      const randPart = Math.random().toString(36).slice(2, 10);
      const jobId = `${datePart}_${timePart}_${randPart}`;

      const ext = (() => {
        const parts = filename.split('.');
        const last = parts.length > 1 ? parts.pop() : 'mp3';
        const clean = String(last || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean || 'mp3';
      })();

      const blobName = `${jobId}.${ext}`;

      if (!accountName || !accountKey) {
        return res.status(500).json({ error: 'Missing env: AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY' });
      }

      const cred = new StorageSharedKeyCredential(accountName, accountKey);
      const blobService = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        cred
      );

      const container = blobService.getContainerClient(containerName);
      await container.createIfNotExists();

      const blobClient = container.getBlockBlobClient(blobName);

      const startsOn = new Date(Date.now() - 2 * 60 * 1000);
      const expiresOn = new Date(Date.now() + 60 * 60 * 1000);

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions: BlobSASPermissions.parse('cw'),
          startsOn,
          expiresOn,
          protocol: 'https',
        },
        cred
      ).toString();

      return res.status(200).json({
        uploadUrl: `${blobClient.url}?${sasToken}`,
        jobId,
        blobName,
        containerName,
        expiresOn: expiresOn.toISOString(),
      });
    }

    // ----- upload-complete ----
    // Event Grid already triggers the Azure Function which enqueues to whisper-jobs,
    // so this endpoint just acknowledges the upload without sending a duplicate queue message.
    if (parts.length === 1 && parts[0] === 'upload-complete' && req.method === 'POST') {
      const { jobId, blobName } = req.body || {};
      if (!jobId || !blobName) return res.status(400).json({ error: 'jobId and blobName required' });

      return res.status(200).json({ status: 'queued', jobId });
    }

    // ----- status/:jobId ----
    if (parts.length === 2 && parts[0] === 'status' && req.method === 'GET') {
      const jobId = normalizeJobId(parts[1]);
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

      const transcriptContainer = blobServiceClient.getContainerClient('transcripts');
      let completed = false;
      let processingTime = null;
      let audioDuration = null;

      for await (const blob of transcriptContainer.listBlobsFlat({ prefix: jobId })) {
        if (blob.name.endsWith('.paragraphs.json')) {
          completed = true;
          try {
            const blobClient = transcriptContainer.getBlobClient(blob.name);
            const downloadResponse = await blobClient.download();
            const content = await streamToString(downloadResponse.readableStreamBody);
            const data = JSON.parse(content);
            processingTime = data.processing_time ?? data.processingTime ?? data.process_time ?? null;
            audioDuration = data.duration ?? data.audio_duration ?? data.audioDuration ?? null;
          } catch (e) {
            console.error('Failed reading transcript:', e);
          }
          break;
        }
      }

      if (completed) {
        return res.status(200).json({ jobId, status: 'completed', processingTime, audioDuration });
      }

      const audioContainer = blobServiceClient.getContainerClient('audio-input');
      let audioExists = false;
      for await (const blob of audioContainer.listBlobsFlat({ prefix: jobId })) {
        audioExists = true;
        break;
      }

      if (audioExists) return res.status(200).json({ jobId, status: 'processing' });
      return res.status(404).json({ jobId, status: 'not_found' });
    }

    // ----- transcript/:jobId (GET/PUT) ----
    if (parts.length === 2 && parts[0] === 'transcript') {
      const jobId = parts[1];
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient('transcripts');

      if (req.method === 'PUT') {
        const { paragraphs } = req.body || {};
        let transcriptBlob = null;
        for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
          if (blob.name.endsWith('.paragraphs.json')) {
            transcriptBlob = blob.name;
            break;
          }
        }
        if (!transcriptBlob) return res.status(404).json({ error: 'Transcript not found' });
        const blobClient = containerClient.getBlobClient(transcriptBlob);
        const downloadResponse = await blobClient.download();
        const content = await streamToString(downloadResponse.readableStreamBody);
        const data = JSON.parse(content);
        data.paragraphs = paragraphs;
        data.last_edited = new Date().toISOString();
        const blockBlobClient = containerClient.getBlockBlobClient(transcriptBlob);
        const updatedContent = JSON.stringify(data, null, 2);
        await blockBlobClient.upload(updatedContent, updatedContent.length, {
          blobHTTPHeaders: { blobContentType: 'application/json' }
        });
        return res.status(200).json({ status: 'saved' });
      }

      // GET
      let transcriptBlob = null;
      for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
        if (blob.name.endsWith('.paragraphs.json')) {
          transcriptBlob = blob.name;
          break;
        }
      }
      if (!transcriptBlob) return res.status(404).json({ error: 'Transcript not found' });
      const blobClient = containerClient.getBlobClient(transcriptBlob);
      const downloadResponse = await blobClient.download();
      const content = await streamToString(downloadResponse.readableStreamBody);
      return res.status(200).json(JSON.parse(content));
    }

    // ----- audio/:jobId (GET redirect to SAS) ----
    if (parts.length === 2 && parts[0] === 'audio' && req.method === 'GET') {
      const jobId = parts[1];
      const accountName = process.env.AZURE_STORAGE_ACCOUNT;
      const accountKey = process.env.AZURE_STORAGE_KEY;
      const containerName = 'audio-input';
      const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceClient = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, sharedKeyCredential);
      const containerClient = blobServiceClient.getContainerClient(containerName);

      let audioBlob = null;
      const extensions = ['.mp3', '.wav', '.m4a', '.flac'];
      for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
        if (extensions.some(ext => blob.name.endsWith(ext))) {
          audioBlob = blob.name;
          break;
        }
      }
      if (!audioBlob) return res.status(404).json({ error: 'Audio not found' });
      const blobClient = containerClient.getBlobClient(audioBlob);
      const startsOn = new Date();
      const expiresOn = new Date(startsOn.valueOf() + 3600 * 1000);
      const sasToken = generateBlobSASQueryParameters({ containerName, blobName: audioBlob, permissions: BlobSASPermissions.parse('r'), startsOn, expiresOn }, sharedKeyCredential).toString();
      const sasUrl = `${blobClient.url}?${sasToken}`;
      return res.redirect(302, sasUrl);
    }

    // Not found
    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('api catch-all error:', e);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}

export const config = {
  runtime: 'nodejs',
};
