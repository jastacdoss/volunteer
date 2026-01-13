import { Redis } from '@upstash/redis'

// Lazy initialize Redis client (allows env vars to load first)
let redis = null
function getRedis() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    redis = new Redis({ url, token })
  }
  return redis
}

// Store a single volunteer
export async function setVolunteer(volunteer) {
  const client = getRedis()
  await client.set(`volunteer:${volunteer.id}`, JSON.stringify(volunteer))
}

// Get a single volunteer
export async function getVolunteer(id) {
  const client = getRedis()
  const data = await client.get(`volunteer:${id}`)
  return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null
}

// Get all volunteer IDs
export async function getAllVolunteerIds() {
  const client = getRedis()
  const keys = await client.keys('volunteer:*')
  return keys.map(key => key.replace('volunteer:', ''))
}

// Get all volunteers
export async function getAllVolunteers() {
  const client = getRedis()
  const keys = await client.keys('volunteer:*')
  if (keys.length === 0) return []

  // Use MGET to fetch all volunteers in a single call
  const values = await client.mget(...keys)

  return values
    .filter(Boolean)
    .map(data => typeof data === 'string' ? JSON.parse(data) : data)
}

// Clear all volunteer data
export async function clearAllVolunteers() {
  const client = getRedis()
  const keys = await client.keys('volunteer:*')
  if (keys.length === 0) return 0

  for (const key of keys) {
    await client.del(key)
  }

  return keys.length
}

// Delete a single volunteer
// Returns the number of keys deleted (1 if successful, 0 if key didn't exist)
export async function deleteVolunteer(id) {
  const client = getRedis()
  const result = await client.del(`volunteer:${id}`)
  return result
}

// Store team requirements configuration
export async function setTeamRequirements(config) {
  const client = getRedis()
  await client.set('team-requirements', JSON.stringify(config))
}

// Get team requirements configuration
export async function getTeamRequirements() {
  const client = getRedis()
  const data = await client.get('team-requirements')
  return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null
}

// ============ Resources (folders/files) ============

// Get all resources (folders and files metadata)
export async function getResources() {
  const client = getRedis()
  const data = await client.get('resources')
  return data ? (typeof data === 'string' ? JSON.parse(data) : data) : { folders: [], files: [] }
}

// Save all resources
export async function setResources(resources) {
  const client = getRedis()
  await client.set('resources', JSON.stringify(resources))
}

// Add a folder
export async function addFolder(folder) {
  const resources = await getResources()
  resources.folders.push(folder)
  await setResources(resources)
  return folder
}

// Delete a folder (and optionally its files)
export async function deleteFolder(folderId) {
  const resources = await getResources()
  resources.folders = resources.folders.filter(f => f.id !== folderId)
  resources.files = resources.files.filter(f => f.folderId !== folderId)
  await setResources(resources)
}

// Update a folder's metadata (e.g., rename)
export async function updateFolder(folderId, updates) {
  const resources = await getResources()
  const folderIndex = resources.folders.findIndex(f => f.id === folderId)
  if (folderIndex === -1) return null

  resources.folders[folderIndex] = { ...resources.folders[folderIndex], ...updates }
  await setResources(resources)
  return resources.folders[folderIndex]
}

// Add a file metadata entry
export async function addFile(file) {
  const resources = await getResources()
  resources.files.push(file)
  await setResources(resources)
  return file
}

// Delete a file metadata entry
export async function deleteFile(fileId) {
  const resources = await getResources()
  const file = resources.files.find(f => f.id === fileId)
  resources.files = resources.files.filter(f => f.id !== fileId)
  await setResources(resources)
  return file // Return the deleted file so we can delete from R2
}

// Update a file's metadata (e.g., move to different folder)
export async function updateFile(fileId, updates) {
  const resources = await getResources()
  const fileIndex = resources.files.findIndex(f => f.id === fileId)
  if (fileIndex === -1) return null

  resources.files[fileIndex] = { ...resources.files[fileIndex], ...updates }
  await setResources(resources)
  return resources.files[fileIndex]
}
