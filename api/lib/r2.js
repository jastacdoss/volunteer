import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Lazy initialize S3 client for R2
let s3Client = null

function getS3Client() {
  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY')
    }

    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // R2 requires path-style URLs, not virtual-hosted-style
    })
  }
  return s3Client
}

function getBucketName() {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) {
    throw new Error('R2_BUCKET_NAME not configured')
  }
  return bucket
}

/**
 * Upload a file to R2
 * @param {string} key - The file path/key in the bucket
 * @param {Buffer} body - The file content
 * @param {string} contentType - The MIME type
 */
export async function uploadFile(key, body, contentType) {
  const client = getS3Client()
  const bucket = getBucketName()

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))

  return { key, bucket }
}

/**
 * Delete a file from R2
 * @param {string} key - The file path/key in the bucket
 */
export async function deleteFileFromR2(key) {
  const client = getS3Client()
  const bucket = getBucketName()

  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
}

/**
 * Get a signed download URL for a file (valid for 1 hour)
 * @param {string} key - The file path/key in the bucket
 */
export async function getDownloadUrl(key) {
  const client = getS3Client()
  const bucket = getBucketName()

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  // URL valid for 1 hour
  const url = await getSignedUrl(client, command, { expiresIn: 3600 })
  return url
}

/**
 * Get a signed upload URL for direct browser upload (valid for 15 minutes)
 * @param {string} key - The file path/key in the bucket
 * @param {string} contentType - The expected MIME type
 */
export async function getUploadUrl(key, contentType) {
  const client = getS3Client()
  const bucket = getBucketName()

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  // URL valid for 15 minutes
  const url = await getSignedUrl(client, command, { expiresIn: 900 })
  return url
}
