const { BlobServiceClient } = require('@azure/storage-blob');

module.exports = async function handler(req, res) {
  try {
    const { jobId } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID required' });
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
      return res.status(200).json({
        jobId,
        status: 'completed',
        processingTime,
        audioDuration
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
      return res.status(200).json({
        jobId,
        status: 'processing'
      });
    }
    
    return res.status(404).json({
      jobId,
      status: 'not_found'
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

async function streamToString(readableStream) {
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
