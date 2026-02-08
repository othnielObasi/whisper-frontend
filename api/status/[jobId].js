import { BlobServiceClient } from '@azure/storage-blob';

async function streamToString(readableStream) {
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Remove .mp3/.wav/.m4a/.json etc.
function normalizeJobId(id) {
  return id.replace(/\.[^/.]+$/, "");
}

export default async function handler(req, res) {
  try {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID required' });
    }

    const baseId = normalizeJobId(jobId);

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // ---- CHECK TRANSCRIPTS ----
    const transcriptContainer = blobServiceClient.getContainerClient('transcripts');

    let completed = false;
    let processingTime = null;
    let audioDuration = null;

    for await (const blob of transcriptContainer.listBlobsFlat({ prefix: baseId })) {
      if (blob.name.endsWith('.paragraphs.json')) {
        completed = true;

        try {
          const blobClient = transcriptContainer.getBlobClient(blob.name);
          const downloadResponse = await blobClient.download();
          const content = await streamToString(downloadResponse.readableStreamBody);

          const data = JSON.parse(content);
          processingTime = data.processing_time ?? null;
          audioDuration = data.duration ?? null;
        } catch (e) {
          console.error("Failed reading transcript:", e);
        }

        break;
      }
    }

    if (completed) {
      return res.status(200).json({
        jobId: baseId,
        status: "completed",
        processingTime,
        audioDuration
      });
    }

    // ---- CHECK AUDIO INPUT ----
    const audioContainer = blobServiceClient.getContainerClient('audio-input');
    let audioExists = false;

    for await (const blob of audioContainer.listBlobsFlat({ prefix: baseId })) {
      audioExists = true;
      break;
    }

    if (audioExists) {
      return res.status(200).json({
        jobId: baseId,
        status: "processing"
      });
    }

    // ---- NOT FOUND ----
    return res.status(404).json({
      jobId: baseId,
      status: "not_found"
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
