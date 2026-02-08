import { QueueClient } from '@azure/storage-queue';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, blobName, interpreterMode, englishOnly, originalName } = req.body;
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const queueName = 'whisper-jobs';
    
    // Queue the transcription job
    const queueClient = new QueueClient(connectionString, queueName);
    
    const message = {
      blob_name: blobName,
      container: 'audio-input',
      output_container: 'transcripts',
      job_id: jobId,
      original_name: originalName,
      interpreter_present: interpreterMode || false,
      transcribe_option: englishOnly ? 'english_only' : 'both_separate',
      event_time: new Date().toISOString()
    };
    
    // Base64 encode for Azure Queue
    const encodedMessage = Buffer.from(JSON.stringify(message)).toString('base64');
    await queueClient.sendMessage(encodedMessage);
    
    return res.status(200).json({
      status: 'queued',
      jobId
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
export const config = {
  runtime: "nodejs",
};
