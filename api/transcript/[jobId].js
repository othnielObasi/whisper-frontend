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
    const containerClient = blobServiceClient.getContainerClient('transcripts');
    
    // Find the paragraphs.json file
    let transcriptBlob = null;
    for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
      if (blob.name.endsWith('.paragraphs.json')) {
        transcriptBlob = blob.name;
        break;
      }
    }
    
    if (!transcriptBlob) {
      return new Response(JSON.stringify({ error: 'Transcript not found' }), { status: 404 });
    }
    
    const blobClient = containerClient.getBlobClient(transcriptBlob);
    const downloadResponse = await blobClient.download();
    const content = await streamToString(downloadResponse.readableStreamBody);
    
    return new Response(content, {
      status: 200,
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
