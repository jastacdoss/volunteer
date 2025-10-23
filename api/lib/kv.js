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
