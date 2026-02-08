import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from "@azure/storage-blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT;
    const accountKey = process.env.AZURE_STORAGE_KEY;
    const containerName = process.env.AZURE_STORAGE_CONTAINER || "audio-input";

    if (!accountName || !accountKey) {
      return res.status(500).json({
        error: "Server misconfigured: AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY are required.",
      });
    }

    const { filename } = req.body || {};
    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ error: "filename is required" });
    }

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timePart = now.toISOString().slice(11, 19).replace(/:/g, "");
    const randPart = Math.random().toString(36).slice(2, 10);
    const jobId = `${datePart}_${timePart}_${randPart}`;

    const ext = (() => {
      const parts = filename.split(".");
      const last = parts.length > 1 ? parts.pop() : "mp3";
      const clean = String(last || "mp3")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return clean || "mp3";
    })();

    const blobName = `${jobId}.${ext}`;

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      sharedKeyCredential
    );

    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blobClient = containerClient.getBlockBlobClient(blobName);

    const startsOn = new Date(Date.now() - 2 * 60 * 1000);
    const expiresOn = new Date(Date.now() + 60 * 60 * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"),
        startsOn,
        expiresOn,
        protocol: "https",
      },
      sharedKeyCredential
    ).toString();

    const uploadUrl = `${blobClient.url}?${sasToken}`;

    return res.status(200).json({
      uploadUrl,
      jobId,
      blobName,
      containerName,
      expiresOn: expiresOn.toISOString(),
    });
  } catch (error) {
    console.error("get-upload-url error:", error);
    return res.status(500).json({ error: error?.message || "Unknown error" });
  }
}

export const config = {
  runtime: "nodejs",
};
