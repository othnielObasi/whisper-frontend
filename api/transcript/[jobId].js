const { BlobServiceClient } = require('@azure/storage-blob');

module.exports = async function handler(req, res) {
  try {
    const { jobId } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID required' });
    }
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient('transcripts');
    
    // Handle PUT request for saving edits
    if (req.method === 'PUT') {
      const { paragraphs } = req.body;
      
      // Find existing transcript
      let transcriptBlob = null;
      for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
        if (blob.name.endsWith('.paragraphs.json')) {
          transcriptBlob = blob.name;
          break;
        }
      }
      
      if (!transcriptBlob) {
        return res.status(404).json({ error: 'Transcript not found' });
      }
      
      // Load existing and update paragraphs
      const blobClient = containerClient.getBlobClient(transcriptBlob);
      const downloadResponse = await blobClient.download();
      const content = await streamToString(downloadResponse.readableStreamBody);
      const data = JSON.parse(content);
      
      data.paragraphs = paragraphs;
      data.last_edited = new Date().toISOString();
      
      // Save back
      const blockBlobClient = containerClient.getBlockBlobClient(transcriptBlob);
      await blockBlobClient.upload(JSON.stringify(data, null, 2), JSON.stringify(data, null, 2).length, {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      
      return res.status(200).json({ status: 'saved' });
    }
    
    // Handle GET request
    let transcriptBlob = null;
    for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
      if (blob.name.endsWith('.paragraphs.json')) {
        transcriptBlob = blob.name;
        break;
      }
    }
    
    if (!transcriptBlob) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    const blobClient = containerClient.getBlobClient(transcriptBlob);
    const downloadResponse = await blobClient.download();
    const content = await streamToString(downloadResponse.readableStreamBody);
    
    return res.status(200).json(JSON.parse(content));
    
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
