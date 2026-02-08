import { QueueClient } from '@azure/storage-queue';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { jobId, blobName, interpreterMode, englishOnly, originalName } = await req.json();
    
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
    
    return new Response(JSON.stringify({
      status: 'queued',
      jobId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
