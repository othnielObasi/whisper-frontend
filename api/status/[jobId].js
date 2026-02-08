import { BlobServiceClient } from '@azure/storage-blob';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const jobId = url.pathname.split('/').pop();
    
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'Job ID required' }), { status: 400 });
    }
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    
    // Check if transcript exists (completed)
    const transcriptContainer = blobServiceClient.getContainerClient('transcripts');
    
    let completed = false;
    let processingTime = null;
    let audioDuration = null;
    
    for await (const blob of transcriptContainer.listBlobsFlat({ prefix: jobId })) {
      if (blob.name.endsWith('.paragraphs.json')) {
        completed = true;
        
        // Try to get processing time from the JSON
        try {
          const blobClient = transcriptContainer.getBlobClient(blob.name);
          const downloadResponse = await blobClient.download();
          const content = await streamToString(downloadResponse.readableStreamBody);
          const data = JSON.parse(content);
          processingTime = data.processing_time;
          audioDuration = data.duration;
        } catch (e) {
          console.error('Error reading transcript:', e);
        }
        break;
      }
    }
    
    if (completed) {
      return new Response(JSON.stringify({
        jobId,
        status: 'completed',
        processingTime,
        audioDuration
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if audio exists (queued/processing)
    const audioContainer = blobServiceClient.getContainerClient('audio-input');
    let audioExists = false;
    
    for await (const blob of audioContainer.listBlobsFlat({ prefix: jobId })) {
      audioExists = true;
      break;
    }
    
    if (audioExists) {
      return new Response(JSON.stringify({
        jobId,
        status: 'processing'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      jobId,
      status: 'not_found'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

async function streamToString(readableStream) {
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
