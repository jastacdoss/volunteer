import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { setVolunteer, getVolunteer, getAllVolunteers, clearAllVolunteers, deleteVolunteer, setTeamRequirements, getTeamRequirements, getResources, addFolder, deleteFolder, updateFolder, addFile, deleteFile, updateFile } from './lib/kv.js'
import { uploadFile, deleteFileFromR2, getDownloadUrl, getUploadUrl } from './lib/r2.js'
import { makeRequest, getRateLimiterStats, resetRateLimiterStats } from './lib/rate-limiter.js'
import { FIELD_IDS, FIELD_NAMES } from './config/field-ids.js'
import { REFERENCES_FORM_FIELDS } from './config/form-field-ids.js'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load team requirements
const teamRequirements = JSON.parse(
  readFileSync(join(__dirname, '../data/teamRequirements.json'), 'utf-8')
)

// Helper: Normalize team name from PCO to match our team keys
// PCO stores display names like "Ministry Leader" or "Care Ministry"
// We need to convert them to kebab-case keys like "ministry-leader" or "care"
function normalizeTeamName(teamName) {
  if (!teamName) return null

  // Special case mappings for teams that were renamed or have special handling
  const specialCases = {
    'care ministry': 'care',
    'care-ministry': 'care',
    'communion team': 'communion',
    'communion-team': 'communion',
    'outreach and missions': 'outreach',
    'outreach-and-missions': 'outreach'
  }

  // Normalize: lowercase and replace spaces with dashes
  const normalized = teamName.toLowerCase().replace(/\s+/g, '-')

  // Check for special cases
  return specialCases[normalized] || normalized
}

// Helper: Get required fields for a volunteer based on their teams
function getRequiredFields(teams) {
  const required = {
    declaration: false,
    welcomeToRCC: false,
    childSafety: false,
    mandatedReporter: false,
    references: false,
    backgroundCheck: false,
    membership: false,
    covenant: false,
    moralConduct: false,
    publicPresence: false
  }

  // Union of all team requirements
  teams.forEach(team => {
    const normalizedTeam = normalizeTeamName(team)
    const teamReqs = teamRequirements.teams[normalizedTeam]
    console.log(`[Team Lookup] Original: "${team}" → Normalized: "${normalizedTeam}" → Found: ${!!teamReqs}`)
    if (teamReqs) {
      if (teamReqs.backgroundCheck) required.backgroundCheck = true
      if (teamReqs.references) required.references = true
      if (teamReqs.childSafety) required.childSafety = true
      if (teamReqs.mandatedReporter) required.mandatedReporter = true
      if (teamReqs.welcomeToRCC) required.welcomeToRCC = true
      if (teamReqs.membership) required.membership = true
      if (teamReqs.covenant) required.covenant = true
      if (teamReqs.moralConduct) required.moralConduct = true
      if (teamReqs.publicPresence) required.publicPresence = true
    }
  })

  // Declaration is automatically required when Background Check is required
  if (required.backgroundCheck) {
    required.declaration = true
  }

  console.log(`[Required Fields] For teams ${JSON.stringify(teams)}:`, required)
  return required
}

// Helper: Calculate covenant level required (highest level across all teams)
function getRequiredCovenantLevel(teams) {
  let maxLevel = 0
  teams.forEach(team => {
    const normalizedTeam = normalizeTeamName(team)
    const teamReqs = teamRequirements.teams[normalizedTeam]
    if (teamReqs) {
      if (teamReqs.publicPresence) maxLevel = Math.max(maxLevel, 3)
      else if (teamReqs.moralConduct) maxLevel = Math.max(maxLevel, 2)
      else if (teamReqs.covenant) maxLevel = Math.max(maxLevel, 1)
    }
  })
  return maxLevel
}

// Helper: Check if user is admin or leader for a specific team
// Returns { isAuthorized: boolean, isAdmin: boolean, leaderTeams: string[] }
async function checkAdminOrLeader(accessToken, requiredTeam = null) {
  const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

  // Get user data to check if they're an admin
  const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!userResponse.ok) {
    return { isAuthorized: false, isAdmin: false, leaderTeams: [] }
  }

  const userData = await userResponse.json()
  const personId = userData.data.id
  const isSiteAdmin = userData.data.attributes?.site_administrator === true
  const peoplePermissions = userData.data.attributes?.people_permissions || ''
  const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
  const isAdmin = isSiteAdmin || isPeopleAdmin

  // If they're an admin, they're authorized for everything
  if (isAdmin) {
    return { isAuthorized: true, isAdmin: true, leaderTeams: [] }
  }

  // Check if they're a leader
  const fieldDataResponse = await fetch(
    `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?per_page=100`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    }
  )

  if (!fieldDataResponse.ok) {
    return { isAuthorized: false, isAdmin: false, leaderTeams: [] }
  }

  const fieldDataResult = await fieldDataResponse.json()

  // Find ALL Ministry/Team Leader field entries (multi-select fields have multiple FieldDatum entries)
  const leaderFieldDataEntries = fieldDataResult.data?.filter(
    item => item.relationships?.field_definition?.data?.id === FIELD_IDS.ministryTeamLeader
  ) || []

  // Collect all values from the field data entries and normalize them
  const leaderTeams = leaderFieldDataEntries
    .map(entry => entry.attributes?.value)
    .filter(Boolean)
    .map(team => normalizeTeamName(team))

  console.log('[checkAdminOrLeader] Person ID:', personId, 'Leader teams:', leaderTeams)

  // If no specific team is required, just check if they're a leader of ANY team
  if (!requiredTeam) {
    return { isAuthorized: leaderTeams.length > 0, isAdmin: false, leaderTeams }
  }

  // Check if they're a leader for the required team
  const normalizedRequiredTeam = normalizeTeamName(requiredTeam)
  const isAuthorized = leaderTeams.includes(normalizedRequiredTeam)

  return { isAuthorized, isAdmin: false, leaderTeams }
}

// Helper: Calculate progress for a volunteer
// Only counts: Declaration/BG Check (1), References (2), Child Safety (3), Mandated Reporter (4), Covenant (5)
// Max 5 (Kids team with all required) - Min 1 (Usher with only Covenant)
function calculateProgress(fields, backgroundCheck, requiredFields, covenantLevel, personId = null) {
  let completed = 0
  let total = 0
  const debug = personId === '170696784' // Test Testlinger

  if (debug) {
    console.log('[Progress Debug 170696784] Fields:', JSON.stringify(fields, null, 2))
    console.log('[Progress Debug 170696784] Required:', JSON.stringify(requiredFields, null, 2))
    console.log('[Progress Debug 170696784] Covenant Level:', covenantLevel)
  }

  // Declaration/BG Check (counted as ONE step - both must be complete if both required)
  if (requiredFields.declaration || requiredFields.backgroundCheck) {
    total++
    const declarationComplete = !requiredFields.declaration || fields.declaration
    const bgCheckComplete = !requiredFields.backgroundCheck || (backgroundCheck?.status === 'completed' || backgroundCheck?.status === 'manual_clear')

    if (debug) console.log('[Progress Debug 170696784] Decl/BG: decl=' + declarationComplete + ', bg=' + bgCheckComplete)

    // Both must be complete (if required)
    if (declarationComplete && bgCheckComplete) {
      completed++
    }
  }

  // References (check if reviewed by admin)
  if (requiredFields.references) {
    total++
    const referencesComplete = fields.references // Admin has reviewed
    if (debug) console.log('[Progress Debug 170696784] References: required=true, reviewed=' + fields.references + ', submitted=' + fields.referencesSubmitted)
    if (referencesComplete) completed++
  }

  // Child Safety (check if training completed by admin - not just submitted)
  if (requiredFields.childSafety) {
    total++
    const childSafetyComplete = !!fields.childSafety // Only count if admin completed (has completion date)
    if (debug) console.log('[Progress Debug 170696784] Child Safety: required=true, completed=' + fields.childSafety + ', submitted=' + fields.childSafetySubmitted + ', result=' + childSafetyComplete)
    if (childSafetyComplete) completed++
  }

  // Mandated Reporter (check if training completed by admin - not just submitted)
  if (requiredFields.mandatedReporter) {
    total++
    const mandatedReporterComplete = !!fields.mandatedReporter // Only count if admin completed (has completion date)
    if (debug) console.log('[Progress Debug 170696784] Mandated Reporter: required=true, completed=' + fields.mandatedReporter + ', submitted=' + fields.mandatedReporterSubmitted + ', result=' + mandatedReporterComplete)
    if (mandatedReporterComplete) completed++
  }

  // Covenant level check
  if (covenantLevel > 0) {
    total++
    const covenantComplete = (covenantLevel === 1 && fields.covenantSigned) ||
                             (covenantLevel === 2 && fields.moralConduct) ||
                             (covenantLevel === 3 && fields.publicPresence)
    if (debug) console.log('[Progress Debug 170696784] Covenant: level=' + covenantLevel + ', complete=' + covenantComplete)
    if (covenantComplete) completed++
  }

  if (debug) console.log('[Progress Debug 170696784] RESULT: ' + completed + '/' + total)

  return { completed, total }
}

// Sync a single volunteer from PCO and update cache
async function syncSingleVolunteer(personId) {
  const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

  try {
    // Call 1: Fetch person with included emails and phone_numbers
    const personResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/people/${personId}?include=emails,phone_numbers`,
      { headers: { Authorization: `Basic ${credentials}` } }
    )

    if (!personResponse.ok) {
      console.error(`[Single Sync] Failed to fetch person ${personId}: ${personResponse.status}`)
      return null
    }

    const personResult = await personResponse.json()
    const personData = personResult.data
    const included = personResult.included || []

    // Extract email from included data
    const emails = included.filter(item => item.type === 'Email')
    const primaryEmail = emails.find(e => e.attributes?.primary)
    const email = primaryEmail?.attributes?.address || emails[0]?.attributes?.address || ''

    // Extract phone from included data
    const phones = included.filter(item => item.type === 'PhoneNumber')
    const primaryPhone = phones.find(p => p.attributes?.primary)
    const phone = primaryPhone?.attributes?.number || phones[0]?.attributes?.number || ''

    // Call 2: Fetch ALL field_data with pagination
    let allFieldData = []
    let nextUrl = `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?per_page=100`

    while (nextUrl) {
      const fieldResponse = await makeRequest(nextUrl, {
        headers: { Authorization: `Basic ${credentials}` }
      })
      if (!fieldResponse.ok) break
      const fieldPage = await fieldResponse.json()
      allFieldData = allFieldData.concat(fieldPage.data || [])
      nextUrl = fieldPage.links?.next || null
    }

    // Call 3: Fetch background checks
    const bgResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/background_checks`,
      { headers: { Authorization: `Basic ${credentials}` } }
    )

    // Parse background check data
    let backgroundCheck = null
    if (bgResponse.ok) {
      const bgData = await bgResponse.json()
      if (bgData.data && bgData.data.length > 0) {
        // Find the current background check (marked as current: true), or fallback to first one
        const latestBg = bgData.data.find(bg => bg.attributes?.current === true) || bgData.data[0]
        backgroundCheck = {
          status: latestBg.attributes?.status || 'unknown',
          completedAt: latestBg.attributes?.completed_at || null,
          createdAt: latestBg.attributes?.created_at || null,
          expiresOn: latestBg.attributes?.expires_on || null
        }
      }
    }

    // Get field value by field ID ONLY
    const getFieldValue = (fieldId) => {
      if (!fieldId) return null
      const field = allFieldData.find(
        item => item.relationships?.field_definition?.data?.id === fieldId
      )
      return field?.attributes?.value || null
    }

    // Get teams for this person - multi-select fields return multiple FieldDatum entries
    const teamFieldEntries = allFieldData.filter(
      item => item.relationships?.field_definition?.data?.id === FIELD_IDS.onboardingInProgressFor
    )
    const teams = teamFieldEntries
      .map(entry => entry.attributes?.value)
      .filter(Boolean) // Remove null/undefined values

    console.log(`[Single Sync] Person ${personId} (${personData.attributes?.name}) has teams:`, teams)

    if (teams.length === 0) {
      console.log(`[Single Sync] Person ${personId} has no active onboarding teams, skipping`)
      return null
    }

    // Get all field dates/values by field ID ONLY
    const fields = {
      declaration: getFieldValue(FIELD_IDS.declarationReviewed),
      declarationSubmitted: getFieldValue(FIELD_IDS.declarationSubmitted),
      welcomeToRCC: getFieldValue(FIELD_IDS.welcomeToRCC),
      childSafety: getFieldValue(FIELD_IDS.childSafetyCompleted),
      childSafetySubmitted: getFieldValue(FIELD_IDS.childSafetySubmitted),
      mandatedReporter: getFieldValue(FIELD_IDS.mandatedReporterCompleted),
      mandatedReporterSubmitted: getFieldValue(FIELD_IDS.mandatedReporterSubmitted),
      references: getFieldValue(FIELD_IDS.referencesChecked),
      referencesSubmitted: getFieldValue(FIELD_IDS.referencesSubmitted),
      membership: getFieldValue(FIELD_IDS.membership),
      covenantSigned: getFieldValue(FIELD_IDS.covenantSigned),
      moralConduct: getFieldValue(FIELD_IDS.moralConduct),
      publicPresence: getFieldValue(FIELD_IDS.publicPresence)
    }

    // Calculate required fields and progress
    const requiredFields = getRequiredFields(teams)
    const covenantLevel = getRequiredCovenantLevel(teams)
    const progress = calculateProgress(fields, backgroundCheck, requiredFields, covenantLevel, personId)

    const volunteer = {
      id: personId,
      name: personData.attributes?.name || '',
      firstName: personData.attributes?.first_name || '',
      lastName: personData.attributes?.last_name || '',
      email,
      phone,
      avatar: personData.attributes?.avatar || '',
      teams,
      fields,
      backgroundCheck,
      requiredFields,
      covenantLevel,
      progress
    }

    // Store in cache
    await setVolunteer(volunteer)
    console.log(`[Single Sync] Updated volunteer ${personId} (${personData.attributes?.name})`)

    return volunteer
  } catch (error) {
    console.error(`[Single Sync] Error fetching volunteer ${personId}:`, error.message)
    return null
  }
}

// Reusable sync function for volunteers
async function syncVolunteers() {
  const startTime = Date.now()
  const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

  resetRateLimiterStats()

  // ONCE: Fetch all field definitions to get field IDs (only if not already logged)
  if (!global.fieldIdsLogged) {
    console.log('[Sync] Fetching field definitions to extract IDs...')
    const fieldDefsResponse = await fetch(
      'https://api.planningcenteronline.com/people/v2/field_definitions?per_page=100',
      { headers: { Authorization: `Basic ${credentials}` } }
    )

    if (fieldDefsResponse.ok) {
      const fieldDefs = await fieldDefsResponse.json()
      const fieldMap = {}
      fieldDefs.data.forEach(item => {
        fieldMap[item.attributes.name] = item.id
      })

      const neededFields = [
        'Declaration Reviewed',
        'Declaration Submitted',
        'Welcome to RCC',
        'Child Safety Training Last Completed',
        'Child Safety Training Submitted',
        'Mandated Reporter Training Last Completed',
        'Mandated Reporter Training Submitted',
        'References Checked',
        'References Submitted',
        'Membership',
        'Covenant Signed',
        'Moral Conduct Policy Signed',
        'Public Presence Policy Signed'
      ]

      console.log('\n========== COPY THESE FIELD IDs TO api/config/field-ids.js ==========')
      neededFields.forEach(name => {
        const id = fieldMap[name] || 'NOT_FOUND'
        console.log(`  ${name}: '${id}',`)
      })
      console.log('======================================================================\n')

      global.fieldIdsLogged = true
    }
  }

  // Don't clear cache - just overwrite volunteers to avoid race condition
  // where API calls return empty arrays during sync

  // Fetch all field data for "Onboarding In Progress For" field (959379)
  let allFieldData = []
  let nextUrl = `https://api.planningcenteronline.com/people/v2/field_data?where[field_definition_id]=959379&per_page=100`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Basic ${credentials}` }
    })
    if (!response.ok) {
      console.error(`Failed to fetch field data: ${response.status} ${response.statusText}`)
      break
    }
    const page = await response.json()
    allFieldData = allFieldData.concat(page.data || [])
    nextUrl = page.links?.next || null
  }

  const personIds = [...new Set(allFieldData.map(fd => fd.relationships?.customizable?.data?.id).filter(Boolean))]
  console.log(`Found ${personIds.length} volunteers to sync`)

  // Fetch volunteers in parallel (batches of 10 to respect rate limits)
  const batchSize = 10
  let processedCount = 0
  const volunteers = []

  for (let i = 0; i < personIds.length; i += batchSize) {
    const batch = personIds.slice(i, i + batchSize)

    const batchResults = await Promise.all(batch.map(async (personId) => {
      try {
        // Call 1: Fetch person with included emails and phone_numbers
        const personResponse = await makeRequest(
          `https://api.planningcenteronline.com/people/v2/people/${personId}?include=emails,phone_numbers`,
          { headers: { Authorization: `Basic ${credentials}` } }
        )

        if (!personResponse.ok) {
          console.error(`Failed to fetch person ${personId}: ${personResponse.status}`)
          return null
        }

        const personResult = await personResponse.json()
        const personData = personResult.data
        const included = personResult.included || []

        // Debug logging for first volunteer only
        if (personId === '170696784') {
          console.log('[Email Debug] Included data types:', included.map(i => i.type))
          console.log('[Email Debug] Included count:', included.length)
        }

        // Extract email from included data
        const emails = included.filter(item => item.type === 'Email')
        const primaryEmail = emails.find(e => e.attributes?.primary)
        const email = primaryEmail?.attributes?.address || emails[0]?.attributes?.address || ''

        // Extract phone from included data
        const phones = included.filter(item => item.type === 'PhoneNumber')
        const primaryPhone = phones.find(p => p.attributes?.primary)
        const phone = primaryPhone?.attributes?.number || phones[0]?.attributes?.number || ''

        // Debug logging for first volunteer only
        if (personId === '170696784') {
          console.log('[Email Debug] Emails found:', emails.length)
          console.log('[Email Debug] Phones found:', phones.length)
          console.log('[Email Debug] Final email:', email)
          console.log('[Email Debug] Final phone:', phone)
        }

        // Call 2: Fetch ALL field_data with pagination
        let allFieldData = []
        let nextUrl = `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?per_page=100`

        while (nextUrl) {
          const fieldResponse = await makeRequest(nextUrl, {
            headers: { Authorization: `Basic ${credentials}` }
          })
          if (!fieldResponse.ok) break
          const fieldPage = await fieldResponse.json()
          allFieldData = allFieldData.concat(fieldPage.data || [])
          nextUrl = fieldPage.links?.next || null
        }

        // Call 3: Fetch background checks
        const bgResponse = await makeRequest(
          `https://api.planningcenteronline.com/people/v2/people/${personId}/background_checks`,
          { headers: { Authorization: `Basic ${credentials}` } }
        )

        // Parse background check data
        let backgroundCheck = null
        if (bgResponse.ok) {
          const bgData = await bgResponse.json()
          if (bgData.data && bgData.data.length > 0) {
            // Find the current background check (marked as current: true), or fallback to first one
            const latestBg = bgData.data.find(bg => bg.attributes?.current === true) || bgData.data[0]
            backgroundCheck = {
              status: latestBg.attributes?.status || 'unknown',
              completedAt: latestBg.attributes?.completed_at || null,
              createdAt: latestBg.attributes?.created_at || null,
              expiresOn: latestBg.attributes?.expires_on || null
            }
          }
        }

        // Get field value by field ID ONLY
        const getFieldValue = (fieldId) => {
          if (!fieldId) return null
          const field = allFieldData.find(
            item => item.relationships?.field_definition?.data?.id === fieldId
          )
          return field?.attributes?.value || null
        }

        // Get teams for this person - multi-select fields return multiple FieldDatum entries
        const teamFieldEntries = allFieldData.filter(
          item => item.relationships?.field_definition?.data?.id === FIELD_IDS.onboardingInProgressFor
        )
        const teams = teamFieldEntries
          .map(entry => entry.attributes?.value)
          .filter(Boolean) // Remove null/undefined values

        if (teams.length === 0) {
          return null
        }

        // Get all field dates/values by field ID ONLY
        const fields = {
          declaration: getFieldValue(FIELD_IDS.declarationReviewed),
          declarationSubmitted: getFieldValue(FIELD_IDS.declarationSubmitted),
          welcomeToRCC: getFieldValue(FIELD_IDS.welcomeToRCC),
          childSafety: getFieldValue(FIELD_IDS.childSafetyCompleted),
          childSafetySubmitted: getFieldValue(FIELD_IDS.childSafetySubmitted),
          mandatedReporter: getFieldValue(FIELD_IDS.mandatedReporterCompleted),
          mandatedReporterSubmitted: getFieldValue(FIELD_IDS.mandatedReporterSubmitted),
          references: getFieldValue(FIELD_IDS.referencesChecked),
          referencesSubmitted: getFieldValue(FIELD_IDS.referencesSubmitted),
          membership: getFieldValue(FIELD_IDS.membership),
          covenantSigned: getFieldValue(FIELD_IDS.covenantSigned),
          moralConduct: getFieldValue(FIELD_IDS.moralConduct),
          publicPresence: getFieldValue(FIELD_IDS.publicPresence)
        }

        // Calculate required fields and progress
        const requiredFields = getRequiredFields(teams)
        const covenantLevel = getRequiredCovenantLevel(teams)
        const progress = calculateProgress(fields, backgroundCheck, requiredFields, covenantLevel, personId)

        return {
          id: personId,
          name: personData.attributes?.name || '',
          firstName: personData.attributes?.first_name || '',
          lastName: personData.attributes?.last_name || '',
          email,
          phone,
          avatar: personData.attributes?.avatar || '',
          teams,
          fields,
          backgroundCheck,
          requiredFields,
          covenantLevel,
          progress
        }
      } catch (error) {
        console.error(`Error fetching volunteer ${personId}:`, error.message)
        return null
      }
    }))

    const validResults = batchResults.filter(Boolean)
    volunteers.push(...validResults)
    processedCount += batch.length

    if (processedCount % 20 === 0) {
      console.log(`Progress: ${processedCount}/${personIds.length} volunteers processed`)
    }
  }

  // Store all volunteers in Redis
  for (const volunteer of volunteers) {
    await setVolunteer(volunteer)
  }

  const duration = Date.now() - startTime
  const rateStats = getRateLimiterStats()
  const successRate = personIds.length > 0 ? (volunteers.length / personIds.length * 100).toFixed(1) : 0

  console.log(`Sync completed in ${duration}ms`)
  console.log(`  - Volunteers found: ${personIds.length}`)
  console.log(`  - Volunteers cached: ${volunteers.length}`)
  console.log(`  - Success rate: ${successRate}%`)
  console.log(`  - API calls made: ${rateStats.callCount}`)
  console.log(`  - Rate limit (429) errors: ${rateStats.error429Count}`)
  console.log(`  - Rate limit remaining: ${rateStats.remaining}/${rateStats.limit}`)

  return {
    volunteers,
    personIds,
    duration,
    rateStats
  }
}

// Load environment variables for local development
// Vercel will use dashboard environment variables
if (process.env.NODE_ENV !== 'production') {
  const result = dotenv.config({ path: '.env.local' })
  if (result.error) {
    console.error('Error loading .env.local:', result.error)
  } else {
    console.log('.env.local loaded successfully')
  }
}

const app = express()
const PORT = 1701

// Configure CORS for production and development
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://volunteer.riverchristian.church', 'https://volunteer.riverchristian.org']
    : '*',
  credentials: true
}

app.use(cors(corsOptions))
app.use(express.json())

// Debug endpoint to check environment
app.get('/api/debug', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    hasClientId: !!process.env.VITE_PCO_OAUTH_CLIENT_ID,
    hasClientSecret: !!process.env.VITE_PCO_OAUTH_SECRET,
    hasPcoAppId: !!process.env.PCO_APP_ID,
    hasPcoSecret: !!process.env.PCO_SECRET,
    headers: {
      host: req.headers.host,
      'x-forwarded-host': req.headers['x-forwarded-host'],
      'x-forwarded-proto': req.headers['x-forwarded-proto']
    }
  })
})

// OAuth callback endpoint
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query

  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' })
  }

  try {
    // Determine the correct redirect URI based on environment
    // For local development, always use localhost:1700 (Vite dev server)
    // For production, use the forwarded host from Vercel
    const isLocal = !req.headers['x-forwarded-host']
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = isLocal
      ? 'localhost:1700'
      : (req.headers['x-forwarded-host'] || req.headers.host)
    const redirectUri = `${protocol}://${host}/auth/callback`


    // Exchange code for token
    const tokenResponse = await fetch('https://api.planningcenteronline.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.VITE_PCO_OAUTH_CLIENT_ID,
        client_secret: process.env.VITE_PCO_OAUTH_SECRET,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error,
        redirectUri,
        hasClientId: !!process.env.VITE_PCO_OAUTH_CLIENT_ID,
        hasClientSecret: !!process.env.VITE_PCO_OAUTH_SECRET
      })
      return res.status(500).json({
        error: 'Failed to exchange code for token',
        details: error,
        redirectUri
      })
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Fetch user data
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const personId = userData.data.id

    // Fetch field data using admin PAT (volunteers can't read their own field data)
    // This requires a Personal Access Token with admin permissions

    if (process.env.PCO_SECRET) {
      try {
        // PATs use HTTP Basic Auth with app_id:secret format
        const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

        // Fetch ALL field data with pagination support
        let allFieldData = []
        let allIncluded = []
        let nextUrl = `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition&per_page=100`

        while (nextUrl) {
          const fieldDataResponse = await fetch(nextUrl, {
            headers: {
              Authorization: `Basic ${credentials}`,
            },
          })


          if (fieldDataResponse.ok) {
            const fieldDataResult = await fieldDataResponse.json()
            allFieldData = allFieldData.concat(fieldDataResult.data || [])
            allIncluded = allIncluded.concat(fieldDataResult.included || [])

            // Check for next page
            nextUrl = fieldDataResult.links?.next || null
          } else {
            const errorText = await fieldDataResponse.text()
            console.error('Failed to fetch field data:', fieldDataResponse.status, errorText)
            break
          }
        }


        // Merge field data into userData
        userData.included = allIncluded
        userData.data.relationships = userData.data.relationships || {}
        userData.data.relationships.field_data = {
          data: allFieldData
        }
      } catch (error) {
        console.error('Failed to fetch field data:', error)
        // Continue without field data rather than failing
      }
    } else {
    }

    res.json({
      accessToken,
      userData,
    })
  } catch (error) {
    console.error('OAuth error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// User refresh endpoint
app.get('/api/user/refresh', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Fetch user data
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const personId = userData.data.id

    // Fetch field data with high page size (faster than full pagination)
    // Note: Most volunteers have < 50 field data items, so a single request suffices
    if (process.env.PCO_SECRET && process.env.PCO_APP_ID) {
      try {
        const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

        // Single request with large page size (covers most volunteers without pagination)
        const fieldDataResponse = await fetch(
          `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition&per_page=100`,
          {
            headers: {
              Authorization: `Basic ${credentials}`,
            },
          }
        )

        if (fieldDataResponse.ok) {
          const fieldDataResult = await fieldDataResponse.json()

          // Merge field data into userData
          userData.included = fieldDataResult.included || []
          userData.data.relationships = userData.data.relationships || {}
          userData.data.relationships.field_data = {
            data: fieldDataResult.data || []
          }
        }
      } catch (error) {
        console.error('Failed to fetch field data:', error)
      }
    }

    res.json({ userData })
  } catch (error) {
    console.error('Refresh error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get person's background checks
app.get('/api/person/background-checks', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Fetch user data to get person ID
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const personId = userData.data.id

    // Fetch background checks using admin PAT
    if (process.env.PCO_SECRET && process.env.PCO_APP_ID) {
      try {
        const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

        const bgResponse = await makeRequest(
          `https://api.planningcenteronline.com/people/v2/people/${personId}/background_checks`,
          {
            headers: {
              Authorization: `Basic ${credentials}`,
            },
          }
        )

        if (bgResponse.ok) {
          const bgData = await bgResponse.json()
          return res.json(bgData)
        } else {
          console.error('Failed to fetch background checks:', bgResponse.status)
          return res.status(500).json({ error: 'Failed to fetch background checks' })
        }
      } catch (error) {
        console.error('Background check fetch error:', error)
        return res.status(500).json({ error: 'Internal server error' })
      }
    } else {
      return res.status(500).json({ error: 'Server not configured for background check access' })
    }
  } catch (error) {
    console.error('Background check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// View As: Get person data as if logged in as them (admin only)
app.get('/api/admin/view-as/:personId', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId } = req.params

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Verify user is admin
    const authCheck = await checkAdminOrLeader(accessToken)
    if (!authCheck.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // Fetch person data using system credentials
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    const personResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!personResponse.ok) {
      return res.status(404).json({ error: 'Person not found' })
    }

    const userData = await personResponse.json()

    // Fetch field data with field definitions
    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition&per_page=100`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (fieldDataResponse.ok) {
      const fieldDataResult = await fieldDataResponse.json()

      // Merge field data into userData (same format as /api/user/refresh)
      userData.included = fieldDataResult.included || []
      userData.data.relationships = userData.data.relationships || {}
      userData.data.relationships.field_data = {
        data: fieldDataResult.data || []
      }
    }

    return res.json(userData)
  } catch (error) {
    console.error('View As error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// View As: Get background checks for a person (admin only)
app.get('/api/admin/background-checks/:personId', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId } = req.params

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Verify user is admin
    const authCheck = await checkAdminOrLeader(accessToken)
    if (!authCheck.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // Fetch background checks using system credentials
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    const bgResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/background_checks`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (bgResponse.ok) {
      const bgData = await bgResponse.json()
      return res.json(bgData)
    } else {
      return res.status(500).json({ error: 'Failed to fetch background checks' })
    }
  } catch (error) {
    console.error('Background check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get specific person's background checks (leader only)
app.get('/api/leader/volunteer/:personId/background-checks', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId } = req.params

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Fetch background checks using admin PAT
    if (process.env.PCO_SECRET && process.env.PCO_APP_ID) {
      try {
        const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

        const bgResponse = await makeRequest(
          `https://api.planningcenteronline.com/people/v2/people/${personId}/background_checks`,
          {
            headers: {
              Authorization: `Basic ${credentials}`,
            },
          }
        )

        if (bgResponse.ok) {
          const bgData = await bgResponse.json()
          return res.json(bgData)
        } else {
          console.error('Failed to fetch background checks:', bgResponse.status)
          return res.status(500).json({ error: 'Failed to fetch background checks' })
        }
      } catch (error) {
        console.error('Background check fetch error:', error)
        return res.status(500).json({ error: 'Internal server error' })
      }
    } else {
      return res.status(500).json({ error: 'Server not configured for background check access' })
    }
  } catch (error) {
    console.error('Background check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update custom field endpoint
app.post('/api/field/update', async (req, res) => {

  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { fieldName, value } = req.body

  if (!accessToken) {
    console.error('No access token provided')
    return res.status(401).json({ error: 'No access token provided' })
  }

  if (!fieldName) {
    console.error('No field name provided')
    return res.status(400).json({ error: 'Field name is required' })
  }

  try {

    // Get user ID
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const personId = userData.data.id

    // Get ALL field definitions (not just the ones with data for this person)
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // First, get the person's existing field data
    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition&per_page=100`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!fieldDataResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch field data' })
    }

    const fieldDataResult = await fieldDataResponse.json()

    // Try to find the field definition in the person's existing field data
    let fieldDef = fieldDataResult.included?.find(
      (item) => item.type === 'FieldDefinition' && item.attributes.name === fieldName
    )

    // If not found, fetch ALL field definitions to find it
    if (!fieldDef) {

      // Fetch all field definitions with pagination support
      let allFieldDefs = []
      let nextUrl = `https://api.planningcenteronline.com/people/v2/field_definitions?per_page=100`

      while (nextUrl) {
        const allFieldDefsResponse = await fetch(nextUrl, {
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        })

        if (!allFieldDefsResponse.ok) {
          console.error('Failed to fetch field definitions:', allFieldDefsResponse.status)
          break
        }

        const page = await allFieldDefsResponse.json()
        allFieldDefs = allFieldDefs.concat(page.data || [])

        // Check for next page in links
        nextUrl = page.links?.next || null
      }


      fieldDef = allFieldDefs.find(
        (item) => item.type === 'FieldDefinition' && item.attributes.name === fieldName
      )
    }

    if (!fieldDef) {
      console.error(`Field "${fieldName}" not found in PCO`)
      console.error('Available fields:', allFieldDefs.map(f => f.attributes.name).join(', '))
      return res.status(404).json({
        error: `Field "${fieldName}" not found. Please create this custom field in PCO People first.`,
        availableFields: allFieldDefs.map(f => f.attributes.name)
      })
    }

    const fieldDefinitionId = fieldDef.id

    // Check if field data already exists

    const existingFieldData = fieldDataResult.data?.find(
      (item) => item.relationships?.field_definition?.data?.id === fieldDefinitionId
    )

    if (existingFieldData) {
    }

    let updateResponse

    if (existingFieldData) {
      // Update existing field data
      updateResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/field_data/${existingFieldData.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              id: existingFieldData.id,
              attributes: {
                value: value,
              },
            },
          }),
        }
      )
    } else {
      // Create new field data
      updateResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              attributes: {
                value: value,
              },
              relationships: {
                field_definition: {
                  data: {
                    type: 'FieldDefinition',
                    id: fieldDefinitionId,
                  },
                },
              },
            },
          }),
        }
      )
    }

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Failed to update field:', updateResponse.status, errorText)
      return res.status(500).json({
        error: 'Failed to update field',
        details: errorText,
        status: updateResponse.status
      })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Field update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Check if user is a PCO admin
app.get('/api/admin/check', async (req, res) => {
  console.log('[/api/admin/check] Request received at', new Date().toISOString())
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Fetch user data with permissions
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()

    // Check if user has admin permissions
    // PCO stores this in 'site_administrator' and 'people_permissions' attributes
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin


    res.json({ isAdmin })
  } catch (error) {
    console.error('Admin check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Save team requirements (admin only)
app.post('/api/admin/team-requirements', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { teams } = req.body

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  if (!teams) {
    return res.status(400).json({ error: 'Teams data is required' })
  }

  try {
    // Verify user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // Save to JSON config file
    const fs = await import('fs/promises')
    const path = await import('path')
    const { fileURLToPath } = await import('url')

    // Get the directory of the current file
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const configPath = path.join(__dirname, '..', 'data', 'teamRequirements.json')


    // Prepare the data to save
    const configData = {
      lastUpdated: new Date().toISOString(),
      updatedBy: userData.data.attributes.name || userData.data.attributes.login_identifier,
      teams
    }

    // Save to Redis instead of file system (Vercel serverless is read-only)
    await setTeamRequirements(configData)

    res.json({
      success: true,
      message: 'Changes saved successfully',
      lastUpdated: configData.lastUpdated,
      updatedBy: configData.updatedBy
    })
  } catch (error) {
    console.error('Team requirements save error:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

// Get team requirements (from Redis)
app.get('/api/admin/team-requirements', async (req, res) => {
  try {
    // Try to read from Redis
    const configData = await getTeamRequirements()

    // If no data in Redis, return empty structure
    if (!configData) {
      return res.json({
        teams: {},
        lastUpdated: null,
        updatedBy: null
      })
    }

    res.json({
      teams: configData.teams || {},
      lastUpdated: configData.lastUpdated,
      updatedBy: configData.updatedBy
    })
  } catch (error) {
    console.error('Failed to load team requirements:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

// Public webhook endpoint to download full team requirements matrix for n8n
// This returns the DEFAULT requirements merged with any custom overrides
// No authentication required - this is for automation workflows
app.get('/api/webhook/team-matrix', async (req, res) => {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const { fileURLToPath } = await import('url')

    // Get the directory of the current file
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)

    // Read the default team requirements from static JSON file
    const defaultMatrixPath = path.join(__dirname, '..', 'data', 'defaultTeamRequirements.json')
    const defaultMatrixContent = await fs.readFile(defaultMatrixPath, 'utf8')
    const DEFAULT_TEAM_REQUIREMENTS = JSON.parse(defaultMatrixContent)

    // Also load any custom overrides from Redis
    let customOverrides = {}
    const configData = await getTeamRequirements()
    if (configData) {
      customOverrides = configData.teams || {}
    }

    // Merge defaults with overrides
    const fullMatrix = {
      ...DEFAULT_TEAM_REQUIREMENTS,
      ...customOverrides
    }

    res.json({
      teams: fullMatrix,
      source: 'DEFAULT_TEAM_REQUIREMENTS merged with custom overrides',
      totalTeams: Object.keys(fullMatrix).length,
      defaultTeams: Object.keys(DEFAULT_TEAM_REQUIREMENTS).length,
      customTeams: Object.keys(customOverrides).length
    })
  } catch (error) {
    console.error('Failed to load team matrix for n8n:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

// Public webhook endpoint for n8n to check team requirements
// No authentication required - this is for automation workflows
app.get('/api/webhook/team-requirements', async (req, res) => {
  const { team } = req.query

  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const { fileURLToPath } = await import('url')

    // Get the directory of the current file
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const configPath = path.join(__dirname, '..', 'data', 'teamRequirements.json')

    // Try to read the config file
    let configData = { teams: {} }
    try {
      const fileContent = await fs.readFile(configPath, 'utf8')
      configData = JSON.parse(fileContent)
    } catch (error) {
    }

    const teams = configData.teams || {}

    // If specific team requested, return just that team's requirements
    if (team) {
      // Normalize team name to kebab-case (lowercase with dashes)
      const teamKey = team.toLowerCase().replace(/\s+/g, '-')

      if (teams[teamKey]) {
        return res.json({
          team: teamKey,
          requirements: teams[teamKey]
        })
      } else {
        return res.status(404).json({
          error: 'Team not found',
          team: teamKey,
          availableTeams: Object.keys(teams)
        })
      }
    }

    // Otherwise, return all teams
    res.json({
      teams,
      lastUpdated: configData.lastUpdated,
      updatedBy: configData.updatedBy
    })
  } catch (error) {
    console.error('Failed to load team requirements for webhook:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

// Check if user is a ministry leader
app.get('/api/leader/check', async (req, res) => {
  console.log('[/api/leader/check] Request received at', new Date().toISOString())
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Get current user
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      console.error('[/api/leader/check] Failed to fetch user, status:', userResponse.status)
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const personId = userData.data.id

    // Get the user's field data to check Ministry/Team Leader field (without include)
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    const fieldDataResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?per_page=100`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!fieldDataResponse.ok) {
      console.error('[/api/leader/check] Failed to fetch field data, status:', fieldDataResponse.status)
      const errorText = await fieldDataResponse.text()
      console.error('[/api/leader/check] Error response:', errorText)
      return res.status(500).json({ error: 'Failed to fetch field data' })
    }

    const fieldDataResult = await fieldDataResponse.json()

    // Find ALL Ministry/Team Leader field entries (multi-select fields have multiple FieldDatum entries)
    const leaderFieldDataEntries = fieldDataResult.data?.filter(
      item => item.relationships?.field_definition?.data?.id === FIELD_IDS.ministryTeamLeader
    ) || []

    // Collect all values from the field data entries
    const ministries = leaderFieldDataEntries
      .map(entry => entry.attributes?.value)
      .filter(Boolean) // Remove null/undefined values

    console.log('[/api/leader/check] Person ID:', personId)
    console.log('[/api/leader/check] Found', leaderFieldDataEntries.length, 'Team Leader field entries')
    console.log('[/api/leader/check] Ministries:', JSON.stringify(ministries))

    res.json({
      isLeader: ministries.length > 0,
      ministries: ministries
    })
  } catch (error) {
    console.error('[/api/leader/check] Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get all volunteers for a specific team from Redis cache (leader only)
app.get('/api/leader/volunteers/:team', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { team } = req.params


  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  if (!team) {
    return res.status(400).json({ error: 'Team parameter is required' })
  }

  try {
    // Get all volunteers from Redis cache
    const allVolunteers = await getAllVolunteers()

    // Filter volunteers who have this team in their teams array
    const teamVolunteers = allVolunteers.filter(volunteer =>
      volunteer.teams && volunteer.teams.includes(team)
    )

    // Sort volunteers by last name (or full name as fallback)
    teamVolunteers.sort((a, b) => {
      const aName = a.lastName || a.name
      const bName = b.lastName || b.name
      return aName.localeCompare(bName)
    })

    res.json({ volunteers: teamVolunteers })
  } catch (error) {
    console.error('[/api/leader/volunteers/:team] Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get specific volunteer's onboarding data (leader only)
app.get('/api/leader/volunteer/:personId', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId } = req.params

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // Fetch person data
    const personResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!personResponse.ok) {
      return res.status(404).json({ error: 'Person not found' })
    }

    const personData = await personResponse.json()

    // Fetch field data
    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition&per_page=100`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!fieldDataResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch field data' })
    }

    const fieldDataResult = await fieldDataResponse.json()

    // Merge field data into person data (similar to /api/user/refresh)
    personData.included = fieldDataResult.included || []
    personData.data.relationships = personData.data.relationships || {}
    personData.data.relationships.field_data = {
      data: fieldDataResult.data || []
    }

    // Fetch email addresses
    const emailsResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    let emails = []
    if (emailsResponse.ok) {
      const emailsData = await emailsResponse.json()
      emails = emailsData.data || []
    }

    // Fetch phone numbers
    const phonesResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/phone_numbers`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    let phones = []
    if (phonesResponse.ok) {
      const phonesData = await phonesResponse.json()
      phones = phonesData.data || []
    }

    res.json({
      userData: personData,
      emails,
      phones
    })
  } catch (error) {
    console.error('Volunteer data fetch error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Sync all volunteers to Redis cache (admin only)
app.post('/api/admin/volunteers/sync', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Verify user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const result = await syncVolunteers()

    res.json({
      success: true,
      synced: result.volunteers.length,
      total: result.personIds.length,
      duration_ms: result.duration,
      api_calls: result.rateStats.callCount,
      rate_limit_hits: result.rateStats.error429Count
    })
  } catch (error) {
    console.error('Volunteer sync error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get all volunteers with "Onboarding In Progress For" from Redis cache (admin only)
app.get('/api/admin/volunteers', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')


  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Verify user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin


    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // Get volunteers from Redis cache
    const volunteers = await getAllVolunteers()

    res.json({ volunteers })
  } catch (error) {
    console.error('[/api/admin/volunteers] Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Toggle review status (admin or team leader) - Stores date instead of Yes/No
app.post('/api/admin/toggle-review', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId, fieldName, value } = req.body

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Get volunteer's teams from cache to check authorization
    const volunteer = await getVolunteer(personId)
    const volunteerTeams = volunteer?.teams || []

    // Check if user is admin or leader for any of the volunteer's teams
    const authCheck = await checkAdminOrLeader(accessToken)

    if (!authCheck.isAuthorized) {
      return res.status(403).json({ error: 'Admin or team leader access required' })
    }

    // If user is a leader (not admin), verify they lead at least one of the volunteer's teams
    if (!authCheck.isAdmin) {
      const hasCommonTeam = volunteerTeams.some(team =>
        authCheck.leaderTeams.includes(normalizeTeamName(team))
      )

      if (!hasCommonTeam) {
        return res.status(403).json({ error: 'You can only manage volunteers on your teams' })
      }
    }

    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // Map frontend field names to actual PCO field names (date fields)
    const fieldNameMapping = {
      'Child Safety Training Reviewed': 'Child Safety Training Last Completed',
      'Mandated Reporter Training Reviewed': 'Mandated Reporter Training Last Completed',
      'References Checked': 'References Checked'
    }

    const actualFieldName = fieldNameMapping[fieldName] || fieldName

    // Get field definition
    let fieldDef = null
    let nextUrl = `https://api.planningcenteronline.com/people/v2/field_definitions?per_page=100`

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      })

      if (!response.ok) break

      const page = await response.json()
      fieldDef = page.data?.find(item => item.attributes.name === actualFieldName)
      if (fieldDef) break

      nextUrl = page.links?.next || null
    }

    if (!fieldDef) {
      return res.status(404).json({ error: `Field "${actualFieldName}" not found` })
    }

    // Get existing field data
    const fieldDataResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!fieldDataResponse.ok) {
      const errorText = await fieldDataResponse.text()
      console.error('[toggle-review] Failed to fetch field data:', fieldDataResponse.status, errorText)
      return res.status(500).json({ error: 'Failed to fetch field data', details: errorText })
    }

    const fieldDataResult = await fieldDataResponse.json()
    const existingField = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === fieldDef.id
    )

    // Store today's date in ISO format (YYYY-MM-DD) when checked, null when unchecked
    const todayISO = new Date().toISOString().split('T')[0]
    const fieldValue = value ? todayISO : null

    let updateResponse
    if (existingField) {
      // Update existing
      updateResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/field_data/${existingField.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              id: existingField.id,
              attributes: {
                value: fieldValue,
              },
            },
          }),
        }
      )
    } else {
      // Create new (only if value is true/checked)
      if (!value) {
        return res.json({ success: true }) // Nothing to do if unchecking non-existent field
      }

      updateResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              attributes: {
                value: fieldValue,
              },
              relationships: {
                field_definition: {
                  data: {
                    type: 'FieldDefinition',
                    id: fieldDef.id,
                  },
                },
              },
            },
          }),
        }
      )
    }

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      return res.status(500).json({ error: 'Failed to update field', details: errorText })
    }

    // Update cache after successful PCO update
    const cachedVolunteer = await getVolunteer(personId)
    if (cachedVolunteer) {
      // Update the field value in cache
      if (fieldName === 'Child Safety Training Reviewed') {
        cachedVolunteer.fields.childSafety = value
      } else if (fieldName === 'Mandated Reporter Training Reviewed') {
        cachedVolunteer.fields.mandatedReporter = value
      } else if (fieldName === 'References Checked') {
        cachedVolunteer.fields.references = value
      }

      // Recalculate progress from scratch
      cachedVolunteer.progress = calculateProgress(
        cachedVolunteer.fields,
        cachedVolunteer.backgroundCheck,
        cachedVolunteer.requiredFields,
        cachedVolunteer.covenantLevel,
        personId
      )

      await setVolunteer(cachedVolunteer)

      // Return the updated volunteer data so frontend can update immediately
      res.json({ success: true, volunteer: cachedVolunteer })

      // Trigger background sync to fetch any other PCO updates (don't await)
      syncSingleVolunteer(personId).catch(err => {
        console.error(`[Background Sync] Failed for person ${personId}:`, err)
      })

      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Toggle review error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Set field date (admin or team leader) - Sets a specific date for date fields
app.post('/api/admin/set-field-date', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId, fieldName, date } = req.body

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Get volunteer's teams from cache to check authorization
    const volunteer = await getVolunteer(personId)
    const volunteerTeams = volunteer?.teams || []

    // Check if user is admin or leader for any of the volunteer's teams
    const authCheck = await checkAdminOrLeader(accessToken)

    if (!authCheck.isAuthorized) {
      return res.status(403).json({ error: 'Admin or team leader access required' })
    }

    // If user is a leader (not admin), verify they lead at least one of the volunteer's teams
    if (!authCheck.isAdmin) {
      const hasCommonTeam = volunteerTeams.some(team =>
        authCheck.leaderTeams.includes(normalizeTeamName(team))
      )

      if (!hasCommonTeam) {
        return res.status(403).json({ error: 'You can only manage volunteers on your teams' })
      }
    }

    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // Get field definition
    let fieldDef = null
    let nextUrl = `https://api.planningcenteronline.com/people/v2/field_definitions?per_page=100`

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      })

      if (!response.ok) break

      const page = await response.json()
      fieldDef = page.data?.find(item => item.attributes.name === fieldName)
      if (fieldDef) break

      nextUrl = page.links?.next || null
    }

    if (!fieldDef) {
      return res.status(404).json({ error: `Field "${fieldName}" not found` })
    }

    // Get existing field data
    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!fieldDataResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch field data' })
    }

    const fieldDataResult = await fieldDataResponse.json()
    const existingField = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === fieldDef.id
    )

    let updateResponse
    if (existingField) {
      // Update existing
      updateResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/field_data/${existingField.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              id: existingField.id,
              attributes: {
                value: date,
              },
            },
          }),
        }
      )
    } else {
      // Create new
      updateResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              attributes: {
                value: date,
              },
              relationships: {
                field_definition: {
                  data: {
                    type: 'FieldDefinition',
                    id: fieldDef.id,
                  },
                },
              },
            },
          }),
        }
      )
    }

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      return res.status(500).json({ error: 'Failed to update field', details: errorText })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Set field date error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Mark volunteer onboarding as complete for a team (admin or team leader)
app.post('/api/admin/complete-onboarding', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { personId, team } = req.body

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  try {
    // Verify user is admin or leader for this team
    const authCheck = await checkAdminOrLeader(accessToken, team)

    if (!authCheck.isAuthorized) {
      return res.status(403).json({ error: 'Admin or team leader access required' })
    }

    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // Get field data for this person (without include - we use field IDs directly)
    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?per_page=100`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!fieldDataResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch field data' })
    }

    const fieldDataResult = await fieldDataResponse.json()

    // Get current values using field IDs from config
    const inProgressField = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === FIELD_IDS.onboardingInProgressFor
    )
    const completedField = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === FIELD_IDS.onboardingCompleted
    )

    const currentInProgressValue = inProgressField?.attributes?.value
    const currentCompletedValue = completedField?.attributes?.value

    // Parse multi-select values - PCO stores them as comma-separated strings
    const parseMultiSelect = (value) => {
      if (!value) return []
      if (Array.isArray(value)) return value
      if (typeof value === 'string') {
        // Check if it's a JSON string
        if (value.startsWith('[')) {
          try {
            return JSON.parse(value)
          } catch {
            return value.split(',').map(v => v.trim())
          }
        }
        return value.split(',').map(v => v.trim())
      }
      return [value]
    }

    const inProgressTeams = parseMultiSelect(currentInProgressValue)
    const completedTeams = parseMultiSelect(currentCompletedValue)

    console.log(`[Complete Onboarding] Person: ${personId}, Team: ${team}`)
    console.log(`[Complete Onboarding] Current In Progress: ${JSON.stringify(inProgressTeams)}`)
    console.log(`[Complete Onboarding] Current Completed: ${JSON.stringify(completedTeams)}`)

    // Remove from in progress
    const newInProgress = inProgressTeams.filter(t => t !== team)
    console.log(`[Complete Onboarding] New In Progress after filter: ${JSON.stringify(newInProgress)}`)

    // Add to completed if not already there
    if (!completedTeams.includes(team)) {
      completedTeams.push(team)
    }
    console.log(`[Complete Onboarding] New Completed: ${JSON.stringify(completedTeams)}`)

    // Format values for PCO - multi-select fields expect comma-separated strings, null to clear, or empty string
    const formatMultiSelect = (teams) => {
      if (teams.length === 0) return null  // Try null instead of empty string to clear
      return teams.join(',')
    }

    const inProgressValue = formatMultiSelect(newInProgress)
    const completedValue = formatMultiSelect(completedTeams)
    console.log(`[Complete Onboarding] Sending In Progress value: ${JSON.stringify(inProgressValue)}`)
    console.log(`[Complete Onboarding] Sending Completed value: ${JSON.stringify(completedValue)}`)

    // Update In Progress field - DELETE if empty, PATCH if has values
    if (inProgressField) {
      if (inProgressValue === null) {
        // To uncheck/clear a multi-select field, DELETE the field_datum
        const response = await fetch(
          `https://api.planningcenteronline.com/people/v2/field_data/${inProgressField.id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Basic ${credentials}`,
            },
          }
        )
        console.log(`[Complete Onboarding] In Progress DELETE status: ${response.status}`)
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Complete Onboarding] In Progress DELETE failed: ${errorText}`)
          throw new Error(`Failed to DELETE In Progress field: ${response.status} - ${errorText}`)
        }
        console.log(`[Complete Onboarding] In Progress field deleted successfully`)
      } else {
        // PATCH to update with new value
        const response = await fetch(
          `https://api.planningcenteronline.com/people/v2/field_data/${inProgressField.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${credentials}`,
            },
            body: JSON.stringify({
              data: {
                type: 'FieldDatum',
                id: inProgressField.id,
                attributes: {
                  value: inProgressValue,
                },
              },
            }),
          }
        )
        console.log(`[Complete Onboarding] In Progress PATCH status: ${response.status}`)
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Complete Onboarding] In Progress PATCH failed: ${errorText}`)
          throw new Error(`Failed to PATCH In Progress field: ${response.status} - ${errorText}`)
        }
        const responseData = await response.json()
        console.log(`[Complete Onboarding] In Progress PATCH successful, new value: ${JSON.stringify(responseData.data?.attributes?.value)}`)
      }
    }

    if (completedField) {
      const response = await fetch(
        `https://api.planningcenteronline.com/people/v2/field_data/${completedField.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              id: completedField.id,
              attributes: {
                value: completedValue,
              },
            },
          }),
        }
      )
      console.log(`[Complete Onboarding] Completed PATCH status: ${response.status}`)
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Complete Onboarding] Completed PATCH failed: ${errorText}`)
        throw new Error(`Failed to PATCH Completed field: ${response.status} - ${errorText}`)
      }
      const responseData = await response.json()
      console.log(`[Complete Onboarding] Completed PATCH successful, new value: ${JSON.stringify(responseData.data?.attributes?.value)}`)
    } else {
      // Create new completed field
      const response = await fetch(
        `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            data: {
              type: 'FieldDatum',
              attributes: {
                value: completedValue,
              },
              relationships: {
                field_definition: {
                  data: {
                    type: 'FieldDefinition',
                    id: FIELD_IDS.onboardingCompleted,
                  },
                },
              },
            },
          }),
        }
      )
      console.log(`[Complete Onboarding] Completed POST status: ${response.status}`)
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Complete Onboarding] Completed POST failed: ${errorText}`)
        throw new Error(`Failed to POST Completed field: ${response.status} - ${errorText}`)
      }
      const responseData = await response.json()
      console.log(`[Complete Onboarding] Completed POST successful, new value: ${JSON.stringify(responseData.data?.attributes?.value)}`)
    }

    // Clear Redis cache for this volunteer
    console.log(`[Complete Onboarding] Attempting to delete volunteer:${personId} from Redis`)
    const deleteResult = await deleteVolunteer(personId)
    console.log(`[Complete Onboarding] Redis deletion result: ${deleteResult} (1=success, 0=key didn't exist)`)

    // Verify deletion
    const verification = await getVolunteer(personId)
    if (verification) {
      console.error(`[Complete Onboarding] WARNING: volunteer:${personId} still exists in Redis after deletion!`)
    } else {
      console.log(`[Complete Onboarding] Verified: volunteer:${personId} successfully removed from Redis`)
    }

    res.json({ success: true, personId })
  } catch (error) {
    console.error('Complete onboarding error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Fetch references for a volunteer
app.get('/api/references/:personId', async (req, res) => {
  try {
    const { personId } = req.params
    console.log(`[/api/references/:personId] Fetching references for person ${personId}`)

    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // Fetch form submissions for this person (sorted by created_at descending to get most recent)
    const submissionsResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/forms/982853/form_submissions?where[person_id]=${personId}&order=-created_at`,
      { headers: { Authorization: `Basic ${credentials}` } }
    )

    if (!submissionsResponse.ok) {
      console.error(`[/api/references/:personId] Failed to fetch submissions: ${submissionsResponse.status}`)
      return res.status(submissionsResponse.status).json({ error: 'Failed to fetch submissions' })
    }

    const submissionsData = await submissionsResponse.json()
    console.log(`[/api/references/:personId] Found ${submissionsData.data?.length || 0} submissions for person ${personId}`)

    if (!submissionsData.data || submissionsData.data.length === 0) {
      return res.json({ references: [] })
    }

    // Get the most recent submission (first one due to -created_at ordering)
    const submissionId = submissionsData.data[0].id
    const submissionDate = submissionsData.data[0].attributes?.created_at
    console.log(`[/api/references/:personId] Using most recent submission ${submissionId} (created: ${submissionDate})`)

    // Fetch form submission values (the actual answers) - no need to include form_field since we have IDs
    const valuesResponse = await makeRequest(
      `https://api.planningcenteronline.com/people/v2/forms/982853/form_submissions/${submissionId}/form_submission_values`,
      { headers: { Authorization: `Basic ${credentials}` } }
    )

    if (!valuesResponse.ok) {
      console.error(`[/api/references/:personId] Failed to fetch submission values: ${valuesResponse.status}`)
      return res.status(valuesResponse.status).json({ error: 'Failed to fetch submission values' })
    }

    const valuesData = await valuesResponse.json()
    console.log(`[/api/references/:personId] Got ${valuesData.data?.length || 0} field values`)

    // Build a map of field_id to value
    const valueMap = {}
    valuesData.data.forEach(item => {
      const fieldId = item.relationships?.form_field?.data?.id
      const value = item.attributes.display_value  // Use display_value, not value
      if (fieldId) {
        valueMap[fieldId] = value || ''
      }
    })

    // Extract references data using hardcoded field IDs
    const references = [
      {
        name: valueMap[REFERENCES_FORM_FIELDS.ref1Name] || '',
        phone: valueMap[REFERENCES_FORM_FIELDS.ref1Phone] || '',
        email: valueMap[REFERENCES_FORM_FIELDS.ref1Email] || '',
        relationship: valueMap[REFERENCES_FORM_FIELDS.ref1Relationship] || ''
      },
      {
        name: valueMap[REFERENCES_FORM_FIELDS.ref2Name] || '',
        phone: valueMap[REFERENCES_FORM_FIELDS.ref2Phone] || '',
        email: valueMap[REFERENCES_FORM_FIELDS.ref2Email] || '',
        relationship: valueMap[REFERENCES_FORM_FIELDS.ref2Relationship] || ''
      },
      {
        name: valueMap[REFERENCES_FORM_FIELDS.ref3Name] || '',
        phone: valueMap[REFERENCES_FORM_FIELDS.ref3Phone] || '',
        email: valueMap[REFERENCES_FORM_FIELDS.ref3Email] || '',
        relationship: valueMap[REFERENCES_FORM_FIELDS.ref3Relationship] || ''
      }
    ]

    console.log(`[/api/references/:personId] Returning ${references.length} references`)
    res.json({ references })
  } catch (error) {
    console.error('[/api/references/:personId] Error:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

// Set People Permissions in PCO (Admin only, for n8n integration)
app.post('/api/admin/people-permissions', async (req, res) => {
  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - Bearer token required' })
    }

    const token = authHeader.substring(7)
    const expectedToken = process.env.ADMIN_API_TOKEN || 'default-insecure-token'

    // Debug logging
    console.log(`[/api/admin/people-permissions] Token comparison:`)
    console.log(`  Received token length: ${token.length}`)
    console.log(`  Expected token length: ${expectedToken.length}`)
    console.log(`  Tokens match: ${token === expectedToken}`)

    if (token !== expectedToken) {
      return res.status(403).json({ error: 'Forbidden - Invalid token' })
    }

    // Get parameters
    const { permission, listId = null, personId = null, dryRun = false } = req.body

    if (permission === undefined) {
      return res.status(400).json({ error: 'Permission parameter is required (null, Viewer, Editor, or Manager)' })
    }

    const permissionDisplay = permission === null ? 'No Access' : permission
    console.log(`[/api/admin/people-permissions] Starting - permission: ${permissionDisplay}, ${personId ? `personId: ${personId}` : `listId: ${listId}`}, dryRun: ${dryRun}`)

    // Dynamically import the script function
    const { setPeoplePermissions } = await import('../scripts/people-permissions.js')

    // Execute the function
    const results = await setPeoplePermissions(permission, listId, personId, dryRun)

    console.log(`[/api/admin/people-permissions] Completed - ${results.succeeded} succeeded, ${results.failed} failed`)

    res.json({
      success: true,
      results
    })
  } catch (error) {
    console.error('[/api/admin/people-permissions] Error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    })
  }
})

// Get onboarding status for a specific person (for n8n integration)
// No auth required - designed for webhook/automation use
app.get('/api/onboarding-status/:personId', async (req, res) => {
  const { personId } = req.params

  if (!personId) {
    return res.status(400).json({ error: 'Person ID is required' })
  }

  try {
    console.log(`[/api/onboarding-status] Fetching fresh data for person ${personId}`)

    // Fetch fresh data from PCO and update cache
    const volunteer = await syncSingleVolunteer(personId)

    if (!volunteer) {
      return res.status(404).json({
        error: 'Person not found in onboarding system',
        personId,
        isOnboarding: false
      })
    }

    console.log(`[/api/onboarding-status] Fresh data fetched for ${volunteer.name}`)

    // Get team requirements from storage
    const storedRequirements = await getTeamRequirements()
    const requirements = storedRequirements || teamRequirements

    // Get the teams array - it's stored as 'teams' in the volunteer object
    const teams = volunteer.teams || []

    if (teams.length === 0) {
      return res.status(404).json({
        error: 'Person has no onboarding teams assigned',
        personId,
        isOnboarding: false
      })
    }

    // Calculate status for each team they're onboarding for
    const teamStatuses = teams.map(teamName => {
      const teamReq = requirements.teams[teamName.toLowerCase()]

      if (!teamReq) {
        return {
          team: teamName,
          error: 'Team requirements not found'
        }
      }

      // Calculate status for each required step
      const steps = {}

      // Declaration (if BG check required)
      if (teamReq.backgroundCheck) {
        steps.declaration = {
          required: true,
          volunteerSubmitted: volunteer.fields.declarationSubmitted === 'Yes',
          adminReviewed: !!volunteer.fields.declaration,
          complete: !!volunteer.fields.declaration
        }
      }

      // Background Check
      if (teamReq.backgroundCheck) {
        const bgComplete = volunteer.backgroundCheck &&
                          (volunteer.backgroundCheck.status === 'complete_clear' ||
                           volunteer.backgroundCheck.status === 'manual_clear')
        steps.backgroundCheck = {
          required: true,
          status: volunteer.backgroundCheck?.status || 'not_started',
          complete: bgComplete
        }
      }

      // References
      if (teamReq.references) {
        steps.references = {
          required: true,
          volunteerSubmitted: volunteer.fields.referencesSubmitted === 'Yes',
          adminReviewed: !!volunteer.fields.references,
          complete: !!volunteer.fields.references
        }
      }

      // Child Safety
      if (teamReq.childSafety) {
        steps.childSafety = {
          required: true,
          volunteerSubmitted: volunteer.fields.childSafetySubmitted === 'Yes',
          adminReviewed: !!volunteer.fields.childSafety,
          complete: !!volunteer.fields.childSafety
        }
      }

      // Mandated Reporter
      if (teamReq.mandatedReporter) {
        steps.mandatedReporter = {
          required: true,
          volunteerSubmitted: volunteer.fields.mandatedReporterSubmitted === 'Yes',
          adminReviewed: !!volunteer.fields.mandatedReporter,
          complete: !!volunteer.fields.mandatedReporter
        }
      }

      // Covenant (check appropriate level)
      const covenantLevel = teamReq.publicPresence ? 3 : teamReq.moralConduct ? 2 : teamReq.covenant ? 1 : 0
      if (covenantLevel > 0) {
        const covenantComplete = (covenantLevel === 1 && volunteer.fields.covenantSigned) ||
                                 (covenantLevel === 2 && volunteer.fields.moralConduct) ||
                                 (covenantLevel === 3 && volunteer.fields.publicPresence)
        steps.covenant = {
          required: true,
          level: covenantLevel,
          complete: !!covenantComplete
        }
      }

      // Calculate overall progress
      const totalSteps = Object.keys(steps).length
      const completedSteps = Object.values(steps).filter(step => step.complete).length
      const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

      return {
        team: teamName,
        steps,
        progress: {
          completed: completedSteps,
          total: totalSteps,
          percent: progressPercent
        },
        isComplete: completedSteps === totalSteps
      }
    })

    // Overall status
    const allComplete = teamStatuses.every(ts => ts.isComplete)
    const anyComplete = teamStatuses.some(ts => ts.isComplete)

    res.json({
      personId,
      name: volunteer.name,
      avatar: volunteer.avatar,
      isOnboarding: true,
      teams: teams,
      teamStatuses,
      overallStatus: {
        allTeamsComplete: allComplete,
        anyTeamComplete: anyComplete,
        teamsCount: teamStatuses.length
      }
    })
  } catch (error) {
    console.error('[/api/onboarding-status] Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
})

// Quick background check status endpoint (for n8n integration)
// No auth required - designed for webhook/automation use
app.get('/api/background-check/:personId', async (req, res) => {
  const { personId } = req.params

  if (!personId) {
    return res.status(400).json({ error: 'Person ID is required' })
  }

  const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

  try {
    console.log(`[/api/background-check] Checking status for person ${personId}`)

    // Fetch field data and background checks in parallel
    const [fieldDataResponse, bgResponse] = await Promise.all([
      makeRequest(
        `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?per_page=100`,
        { headers: { Authorization: `Basic ${credentials}` } }
      ),
      makeRequest(
        `https://api.planningcenteronline.com/people/v2/people/${personId}/background_checks`,
        { headers: { Authorization: `Basic ${credentials}` } }
      )
    ])

    if (!fieldDataResponse.ok) {
      return res.status(404).json({
        error: 'Person not found',
        personId
      })
    }

    const fieldDataResult = await fieldDataResponse.json()

    // Get declaration fields
    const declarationSubmittedField = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === FIELD_IDS.declarationSubmitted
    )
    const declarationReviewedField = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === FIELD_IDS.declarationReviewed
    )

    // Declaration Submitted field returns a date string when submitted, null when not
    // Declaration Reviewed field returns a date string when reviewed, null when not
    const declarationSubmitted = !!declarationSubmittedField?.attributes?.value
    const declarationReviewed = !!declarationReviewedField?.attributes?.value

    // Parse background check data
    let backgroundCheck = null
    if (bgResponse.ok) {
      const bgData = await bgResponse.json()
      if (bgData.data && bgData.data.length > 0) {
        // Find the current background check (marked as current: true), or fallback to first one
        const currentBg = bgData.data.find(bg => bg.attributes?.current === true) || bgData.data[0]
        backgroundCheck = {
          status: currentBg.attributes?.status || 'unknown',
          completedAt: currentBg.attributes?.completed_at || null,
          createdAt: currentBg.attributes?.created_at || null,
          expiresOn: currentBg.attributes?.expires_on || null
        }
      }
    }

    // Calculate if a new background check needs to be ordered
    const declarationComplete = declarationSubmitted && declarationReviewed

    // Check if background check expires within 45 days
    let expiresWithin45Days = false
    if (backgroundCheck?.expiresOn) {
      const expiresDate = new Date(backgroundCheck.expiresOn)
      const now = new Date()
      const daysUntilExpiry = Math.floor((expiresDate - now) / (1000 * 60 * 60 * 24))
      expiresWithin45Days = daysUntilExpiry <= 45
    }

    // Order if:
    // 1. Declaration is complete AND no background check exists yet, OR
    // 2. Declaration is complete AND background check expires within 45 days
    const bgCheckNeedsOrdered = declarationComplete && (!backgroundCheck || expiresWithin45Days)

    const response = {
      person_id: personId,
      declaration: {
        submitted: declarationSubmitted,
        reviewed: declarationReviewed,
        complete: declarationComplete
      },
      background_check: backgroundCheck ? {
        status: backgroundCheck.status,
        completed_at: backgroundCheck.completedAt,
        created_at: backgroundCheck.createdAt,
        expires_on: backgroundCheck.expiresOn
      } : {
        status: 'not_started',
        completed_at: null,
        created_at: null,
        expires_on: null
      },
      bg_check_needs_ordered: bgCheckNeedsOrdered
    }

    res.json(response)
  } catch (error) {
    console.error('[/api/background-check] Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
})

// ============================================================================
// PUBLIC: LifeGroups API for map display
// ============================================================================
app.get('/api/groups', async (req, res) => {
  try {
    if (!process.env.PCO_APP_ID || !process.env.PCO_SECRET) {
      return res.status(500).json({ error: 'PCO credentials not configured' })
    }

    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')
    const authHeader = `Basic ${credentials}`

    // Fetch all groups with location included (paginated)
    let allGroups = []
    let allLocations = new Map()
    let nextUrl = 'https://api.planningcenteronline.com/groups/v2/groups?include=location&per_page=100&filter=listed'

    while (nextUrl) {
      console.log('[Groups API] Fetching:', nextUrl)
      const response = await fetch(nextUrl, {
        headers: { Authorization: authHeader }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Groups API] Error:', response.status, errorText)
        return res.status(response.status).json({
          error: 'PCO API error',
          status: response.status
        })
      }

      const data = await response.json()
      allGroups = allGroups.concat(data.data || [])

      // Collect included locations
      if (data.included) {
        data.included.forEach(item => {
          if (item.type === 'Location') {
            allLocations.set(item.id, item.attributes)
          }
        })
      }

      nextUrl = data.links?.next || null
    }

    // Transform to simplified format for frontend
    const groups = allGroups
      .filter(group => !group.attributes.archived_at) // Exclude archived
      .map(group => {
        const locationId = group.relationships?.location?.data?.id
        const location = locationId ? allLocations.get(locationId) : null

        const name = group.attributes.name
        const description = group.attributes.description_as_plain_text || group.attributes.description || ''

        // Detect childcare from name or description
        const hasChildcare = /childcare|child care|\(w\/childcare\)/i.test(name) ||
                            /childcare (is )?available|childcare provided/i.test(description)

        return {
          id: group.id,
          name,
          description,
          schedule: group.attributes.schedule,
          contactEmail: group.attributes.contact_email,
          membersCount: group.attributes.memberships_count,
          publicUrl: group.attributes.public_church_center_web_url,
          headerImage: group.attributes.header_image?.medium,
          groupTypeId: group.relationships?.group_type?.data?.id,
          hasChildcare,
          location: location ? {
            name: location.name,
            address: location.full_formatted_address,
            lat: parseFloat(location.latitude),
            lng: parseFloat(location.longitude),
            displayPreference: location.display_preference
          } : null
        }
      })

    // Also fetch group types for filtering
    const typesResponse = await fetch(
      'https://api.planningcenteronline.com/groups/v2/group_types',
      { headers: { Authorization: authHeader } }
    )

    let groupTypes = []
    if (typesResponse.ok) {
      const typesData = await typesResponse.json()
      groupTypes = (typesData.data || []).map(t => ({
        id: t.id,
        name: t.attributes.name,
        description: t.attributes.description
      }))
    }

    res.json({
      groups,
      groupTypes,
      meta: {
        totalGroups: groups.length,
        groupsWithLocation: groups.filter(g => g.location).length
      }
    })
  } catch (error) {
    console.error('[Groups API] Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    })
  }
})

// For local development only (Vercel ignores this)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`)

    // Auto-sync volunteers every 10 minutes
    let isSyncing = false

    const autoSync = async () => {
      if (isSyncing) {
        console.log('[Auto-sync] Sync already in progress, skipping')
        return
      }

      isSyncing = true
      console.log('[Auto-sync] Starting volunteer sync...')

      try {
        const result = await syncVolunteers()
        console.log(`[Auto-sync] Completed - ${result.volunteers.length}/${result.personIds.length} cached, ${result.rateStats.callCount} API calls, ${result.rateStats.error429Count} rate limit errors`)
      } catch (err) {
        console.error('[Auto-sync] Error:', err.message)
      } finally {
        isSyncing = false
      }
    }

    // Initial sync 5 seconds after startup
    setTimeout(() => {
      console.log('[Startup] Running initial volunteer sync...')
      autoSync()
    }, 5000)

    // Auto-sync every 10 minutes
    setInterval(autoSync, 10 * 60 * 1000)
  })
}

// ============ Resources API ============

// Get all resources (folders and files) - requires authentication
app.get('/api/resources', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const resources = await getResources()
    res.json(resources)
  } catch (err) {
    console.error('[Resources] Error fetching resources:', err)
    res.status(500).json({ error: 'Failed to fetch resources' })
  }
})

// Get download URL for a file - requires authentication
app.get('/api/resources/download/:fileId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { fileId } = req.params
    const resources = await getResources()
    const file = resources.files.find(f => f.id === fileId)

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    const downloadUrl = await getDownloadUrl(file.r2Key)
    res.json({ url: downloadUrl, filename: file.name })
  } catch (err) {
    console.error('[Resources] Error getting download URL:', err)
    res.status(500).json({ error: 'Failed to get download URL' })
  }
})

// Create a folder - admin only
app.post('/api/resources/folders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { name, parentId } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' })
    }

    const folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
      createdBy: userData.data.attributes.name || userData.data.id
    }

    await addFolder(folder)
    res.json(folder)
  } catch (err) {
    console.error('[Resources] Error creating folder:', err)
    res.status(500).json({ error: 'Failed to create folder' })
  }
})

// Delete a folder - admin only
app.delete('/api/resources/folders/:folderId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { folderId } = req.params

    // Get files in folder to delete from R2
    const resources = await getResources()
    const filesToDelete = resources.files.filter(f => f.folderId === folderId)

    // Delete files from R2
    for (const file of filesToDelete) {
      try {
        await deleteFileFromR2(file.r2Key)
      } catch (err) {
        console.error(`[Resources] Failed to delete file from R2: ${file.r2Key}`, err)
      }
    }

    await deleteFolder(folderId)
    res.json({ success: true, deletedFiles: filesToDelete.length })
  } catch (err) {
    console.error('[Resources] Error deleting folder:', err)
    res.status(500).json({ error: 'Failed to delete folder' })
  }
})

// Rename a folder - admin only
app.patch('/api/resources/folders/:folderId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { folderId } = req.params
    const { name } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' })
    }

    const updatedFolder = await updateFolder(folderId, { name: name.trim() })

    if (!updatedFolder) {
      return res.status(404).json({ error: 'Folder not found' })
    }

    res.json(updatedFolder)
  } catch (err) {
    console.error('[Resources] Error renaming folder:', err)
    res.status(500).json({ error: 'Failed to rename folder' })
  }
})

// Get upload URL for a file - admin only
app.post('/api/resources/upload-url', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { filename, contentType, folderId, displayName } = req.body

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Filename and contentType are required' })
    }

    // Generate a unique key for the file
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const r2Key = `lifegroups/${folderId || 'root'}/${fileId}-${filename}`

    // Get signed upload URL
    const uploadUrl = await getUploadUrl(r2Key, contentType)
    console.log('[Resources] Generated upload URL:', uploadUrl.split('?')[0]) // Log URL without signature

    // Create file metadata (will be saved after successful upload)
    const fileMetadata = {
      id: fileId,
      name: filename,
      displayName: displayName || filename, // Use displayName if provided, otherwise use filename
      contentType,
      folderId: folderId || null,
      r2Key,
      createdAt: new Date().toISOString(),
      createdBy: userData.data.attributes.name || userData.data.id
    }

    res.json({ uploadUrl, fileMetadata })
  } catch (err) {
    console.error('[Resources] Error getting upload URL:', err)
    res.status(500).json({ error: 'Failed to get upload URL' })
  }
})

// Confirm file upload (save metadata after successful upload) - admin only
app.post('/api/resources/files', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { fileMetadata } = req.body

    if (!fileMetadata || !fileMetadata.id) {
      return res.status(400).json({ error: 'File metadata is required' })
    }

    await addFile(fileMetadata)
    res.json(fileMetadata)
  } catch (err) {
    console.error('[Resources] Error saving file metadata:', err)
    res.status(500).json({ error: 'Failed to save file metadata' })
  }
})

// Delete a file - admin only
app.delete('/api/resources/files/:fileId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { fileId } = req.params

    // Delete from metadata (returns the file so we can delete from R2)
    const file = await deleteFile(fileId)

    if (file) {
      // Delete from R2
      try {
        await deleteFileFromR2(file.r2Key)
      } catch (err) {
        console.error(`[Resources] Failed to delete file from R2: ${file.r2Key}`, err)
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Resources] Error deleting file:', err)
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// Move a file to a different folder - admin only
app.patch('/api/resources/files/:fileId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    const { fileId } = req.params
    const { folderId, displayName } = req.body

    // Build updates object
    const updates = {}
    if (folderId !== undefined) {
      updates.folderId = folderId || null
    }
    if (displayName !== undefined) {
      updates.displayName = displayName.trim()
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' })
    }

    const updatedFile = await updateFile(fileId, updates)

    if (!updatedFile) {
      return res.status(404).json({ error: 'File not found' })
    }

    res.json(updatedFile)
  } catch (err) {
    console.error('[Resources] Error updating file:', err)
    res.status(500).json({ error: 'Failed to update file' })
  }
})

// Test R2 configuration - admin only
app.get('/api/resources/test-r2', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const accessToken = authHeader.split(' ')[1]

    // Check if user is admin
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const userData = await userResponse.json()
    const isSiteAdmin = userData.data.attributes?.site_administrator === true
    const peoplePermissions = userData.data.attributes?.people_permissions || ''
    const isPeopleAdmin = peoplePermissions === 'Manager' || peoplePermissions === 'Administrator'
    const isAdmin = isSiteAdmin || isPeopleAdmin

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // Check R2 config
    const config = {
      hasAccountId: !!process.env.R2_ACCOUNT_ID,
      hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
      hasBucket: !!process.env.R2_BUCKET_NAME,
      bucket: process.env.R2_BUCKET_NAME,
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    }

    // Try to generate a test presigned URL
    const testKey = `test/connection-test-${Date.now()}.txt`
    const testUrl = await getUploadUrl(testKey, 'text/plain')

    res.json({
      config,
      testUploadUrl: testUrl.split('?')[0], // URL without signature
      message: 'R2 configuration looks correct. Make sure CORS is configured on the R2 bucket.'
    })
  } catch (err) {
    console.error('[Resources] R2 test error:', err)
    res.status(500).json({
      error: 'R2 configuration test failed',
      details: err.message
    })
  }
})

// Export for Vercel serverless functions
export default app
