import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, interpreterMode, englishOnly } = req.body;
    
    const accountName = process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = process.env.AZURE_STORAGE_KEY;
    const containerName = 'audio-input';
    
    // Generate job ID
    const now = new Date();
    const jobId = `${now.toISOString().slice(0, 10).replace(/-/g, '')}_${now.toISOString().slice(11, 19).replace(/:/g, '')}_${Math.random().toString(36).slice(2, 10)}`;
    
    // Get file extension
    const ext = filename.split('.').pop() || 'mp3';
    const blobName = `${jobId}.${ext}`;
    
    // Generate SAS URL for direct upload
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      sharedKeyCredential
    );
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    
    // SAS token valid for 1 hour
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + 3600 * 1000);
    
    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
    }, sharedKeyCredential).toString();
    
    const uploadUrl = `${blobClient.url}?${sasToken}`;
    
    return res.status(200).json({
      uploadUrl,
      jobId,
      blobName
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
