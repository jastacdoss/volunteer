#!/usr/bin/env node

/**
 * Remove Viewer Permissions from People in PCO List
 *
 * This script fetches all people from a Planning Center Online list
 * and removes "Viewer" permissions from each person's People app access.
 *
 * Usage:
 *   node scripts/add-viewer-permissions.js [--list-id=XXXX] [--person-id=XXXX] [--dry-run]
 *
 * Options:
 *   --list-id=XXXX    PCO List ID (default: 4529147) - processes all people in list
 *   --person-id=XXXX  PCO Person ID - processes only this specific person
 *   --dry-run         Preview changes without applying them
 *
 * For n8n integration:
 *   Call the API endpoint: POST /api/admin/remove-viewer-permissions
 *   Body: { listId: "4529147", personId: "123456", dryRun: false }
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../.env.local') })

// Configuration
const PCO_APP_ID = process.env.PCO_APP_ID
const PCO_SECRET = process.env.PCO_SECRET
const BASE_URL = 'https://api.planningcenteronline.com/people/v2'

if (!PCO_APP_ID || !PCO_SECRET) {
  console.error('Error: PCO_APP_ID and PCO_SECRET must be set in .env.local')
  process.exit(1)
}

// Helper: Sleep function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Helper: Make authenticated request with retry logic
async function makeRequest(url, options = {}, retries = 3) {
  const credentials = Buffer.from(`${PCO_APP_ID}:${PCO_SECRET}`).toString('base64')

  const defaultOptions = {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, defaultOptions)

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5')
        console.log(`Rate limited. Waiting ${retryAfter}s before retry...`)
        await sleep(retryAfter * 1000)
        continue
      }

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      return response
    } catch (error) {
      if (attempt === retries) throw error
      console.log(`Request failed (attempt ${attempt}/${retries}): ${error.message}`)
      await sleep(1000 * attempt) // Exponential backoff
    }
  }
}

// Fetch a single person by ID
async function fetchPersonById(personId) {
  console.log(`Fetching person ${personId}...`)

  const response = await makeRequest(`${BASE_URL}/people/${personId}`)

  if (response.status === 404) {
    throw new Error(`Person ${personId} not found`)
  }

  const data = await response.json()
  console.log(`Found person: ${data.data.attributes?.name || 'Unknown'}\n`)
  return [data.data]
}

// Fetch all people from a list with pagination
async function fetchPeopleFromList(listId) {
  const people = []
  let nextUrl = `${BASE_URL}/lists/${listId}/people?per_page=100`

  console.log(`Fetching people from list ${listId}...`)

  while (nextUrl) {
    const response = await makeRequest(nextUrl)
    const data = await response.json()

    if (data.data && data.data.length > 0) {
      people.push(...data.data)
      console.log(`  Retrieved ${people.length} people so far...`)
    }

    nextUrl = data.links?.next || null

    // Be nice to the API
    if (nextUrl) await sleep(500)
  }

  console.log(`Total people found: ${people.length}\n`)
  return people
}

// Remove Viewer permission from a person (set to No Access)
async function removeViewerPermission(personId, personName, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY RUN] Would remove Viewer permission from: ${personName} (${personId})`)
    return { success: true, skipped: true }
  }

  try {
    const response = await makeRequest(
      `${BASE_URL}/people/${personId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'Person',
            id: personId,
            attributes: {
              people_permissions: 'No Access'
            }
          }
        })
      }
    )

    if (response.ok) {
      console.log(`✓ Removed Viewer permission: ${personName} (${personId})`)
      return { success: true, personId, personName }
    } else {
      const errorText = await response.text()
      console.error(`✗ Failed to update ${personName} (${personId}): ${errorText}`)
      return { success: false, personId, personName, error: errorText }
    }
  } catch (error) {
    console.error(`✗ Error updating ${personName} (${personId}): ${error.message}`)
    return { success: false, personId, personName, error: error.message }
  }
}

// Main function - exported for API/n8n use
export async function removeViewerPermissions(listId = '4529147', personId = null, dryRun = false) {
  console.log('='.repeat(60))
  console.log('Remove Viewer Permissions from PCO')
  console.log('='.repeat(60))
  if (personId) {
    console.log(`Person ID: ${personId}`)
  } else {
    console.log(`List ID: ${listId}`)
  }
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('='.repeat(60))
  console.log()

  const startTime = Date.now()
  const results = {
    total: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: []
  }

  try {
    // Fetch people - either single person or entire list
    let people
    if (personId) {
      people = await fetchPersonById(personId)
    } else {
      people = await fetchPeopleFromList(listId)
    }
    results.total = people.length

    if (people.length === 0) {
      console.log('No people found.')
      return results
    }

    console.log(`Processing ${people.length} people...`)
    console.log()

    // Process each person with rate limiting
    for (let i = 0; i < people.length; i++) {
      const person = people[i]
      const personId = person.id
      const personName = person.attributes?.name || 'Unknown'

      const result = await removeViewerPermission(personId, personName, dryRun)

      if (result.success && result.skipped) {
        results.skipped++
      } else if (result.success) {
        results.succeeded++
      } else {
        results.failed++
        results.errors.push({
          personId: result.personId,
          personName: result.personName,
          error: result.error
        })
      }

      // Rate limiting: 5 requests per second max
      if ((i + 1) % 5 === 0 && i + 1 < people.length) {
        await sleep(1000)
      }
    }

  } catch (error) {
    console.error('Fatal error:', error.message)
    throw error
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log()
  console.log('='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`Total people:     ${results.total}`)
  if (dryRun) {
    console.log(`Would update:     ${results.skipped}`)
  } else {
    console.log(`Succeeded:        ${results.succeeded}`)
    console.log(`Failed:           ${results.failed}`)
  }
  console.log(`Duration:         ${duration}s`)
  console.log('='.repeat(60))

  if (results.errors.length > 0) {
    console.log()
    console.log('Errors:')
    results.errors.forEach(err => {
      console.log(`  - ${err.personName} (${err.personId}): ${err.error}`)
    })
  }

  return results
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const listIdArg = args.find(arg => arg.startsWith('--list-id='))
  const listId = listIdArg ? listIdArg.split('=')[1] : '4529147'
  const personIdArg = args.find(arg => arg.startsWith('--person-id='))
  const personId = personIdArg ? personIdArg.split('=')[1] : null
  const dryRun = args.includes('--dry-run')

  removeViewerPermissions(listId, personId, dryRun)
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('Script failed:', error)
      process.exit(1)
    })
}
