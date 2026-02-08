import { QueueClient } from "@azure/storage-queue";

export default async function handler(req, res) {
  // CORS (adjust if you want to lock down)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    // IMPORTANT: default this to the queue your worker actually reads
    // Based on your CLI checks earlier, that is "audio-jobs"
    const queueName = process.env.AZURE_QUEUE_NAME || "audio-jobs";

    const inputContainer = process.env.AZURE_STORAGE_CONTAINER || "audio-input";
    const outputContainer = process.env.AZURE_OUTPUT_CONTAINER || "transcripts";

    if (!connectionString) {
      return res.status(500).json({ error: "Missing env: AZURE_STORAGE_CONNECTION_STRING" });
    }

    const { jobId, blobName, interpreterMode, englishOnly, originalName } = req.body || {};

    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "jobId is required" });
    }
    if (!blobName || typeof blobName !== "string") {
      return res.status(400).json({ error: "blobName is required" });
    }

    const queueClient = new QueueClient(connectionString, queueName);

    // Ensure queue exists
    await queueClient.createIfNotExists();

    // IMPORTANT: send plain JSON string.
    // Do NOT base64-encode manually. The SDK handles message encoding.
    const message = {
      blob_name: blobName,
      blob_url: "", // optional; worker can use blob_name + container via connection string
      container: inputContainer,
      output_container: outputContainer,
      job_id: jobId,
      original_name: originalName || blobName,
      interpreter_present: Boolean(interpreterMode),
      transcribe_option: englishOnly ? "english_only" : "both_separate",
      event_time: new Date().toISOString(),
    };

    await queueClient.sendMessage(JSON.stringify(message));

    return res.status(200).json({
      status: "queued",
      jobId,
      queue: queueName,
    });
  } catch (e) {
    console.error("upload-complete error:", e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}

export const config = {
  runtime: "nodejs",
};


