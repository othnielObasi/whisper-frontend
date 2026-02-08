const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');

module.exports = async function handler(req, res) {
  try {
    const { jobId } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID required' });
    }
    
    const accountName = process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = process.env.AZURE_STORAGE_KEY;
    const containerName = 'audio-input';
    
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      sharedKeyCredential
    );
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Find the audio blob
    let audioBlob = null;
    const extensions = ['.mp3', '.wav', '.m4a', '.flac'];
    
    for await (const blob of containerClient.listBlobsFlat({ prefix: jobId })) {
      if (extensions.some(ext => blob.name.endsWith(ext))) {
        audioBlob = blob.name;
        break;
      }
    }
    
    if (!audioBlob) {
      return res.status(404).json({ error: 'Audio not found' });
    }
    
    // Generate read-only SAS URL
    const blobClient = containerClient.getBlobClient(audioBlob);
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + 3600 * 1000); // 1 hour
    
    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName: audioBlob,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
    }, sharedKeyCredential).toString();
    
    const sasUrl = `${blobClient.url}?${sasToken}`;
    
    // Redirect to SAS URL for streaming
    return res.redirect(302, sasUrl);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
