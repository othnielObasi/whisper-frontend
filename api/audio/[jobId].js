import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';

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
      return new Response(JSON.stringify({ error: 'Audio not found' }), { status: 404 });
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
    return Response.redirect(sasUrl, 302);
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
