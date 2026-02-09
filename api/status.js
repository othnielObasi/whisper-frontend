import { BlobServiceClient } from "@azure/storage-blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT; // optional if using conn string
    const containerName = process.env.AZURE_TRANSCRIPTS_CONTAINER || "transcripts";

    const jobId = (req.query?.jobId || "").toString().trim();
    if (!jobId) return res.status(400).json({ error: "jobId is required" });

    // Normalize: accept either "1976-12-19.mp3" OR "1976-12-19"
    const base = jobId.replace(/\.(mp3|wav|m4a|mp4|aac|flac|ogg)$/i, "");
    const jsonName = `${base}.json`;

    if (!storageConn) {
      return res.status(500).json({
        error: "Missing AZURE_STORAGE_CONNECTION_STRING in Vercel env vars"
      });
    }

    const blobService = BlobServiceClient.from_connection_string(storageConn);
    const container = blobService.getContainerClient(containerName);
    const blob = container.getBlobClient(jsonName);

    const exists = await blob.exists();
    if (!exists) {
      // If transcript isn't there yet, it's still processing
      return res.status(200).json({ jobId, status: "processing" });
    }

    // Transcript exists → completed
    // (Optional) pull metadata fields if present
    const download = await blob.download(0);
    const body = await streamToString(download.readableStreamBody);
    let data = null;
    try { data = JSON.parse(body); } catch { /* ignore */ }

    const meta = data?._metadata || {};
    return res.status(200).json({
      jobId,
      status: "completed",
      transcriptBlob: jsonName,
      audioDuration: meta.duration ?? null,
      processingTime: meta.processing_time ?? meta.processingTime ?? null,
      processedAt: meta.processed_at ?? null
    });
  } catch (e) {
    console.error("status error:", e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}

async function streamToString(readable) {
  if (!readable) return "";
  const chunks = [];
  for await (const chunk of readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}
