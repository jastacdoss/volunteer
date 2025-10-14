import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

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

    console.log('Using redirect URI:', redirectUri)
    console.log('Client ID:', process.env.VITE_PCO_OAUTH_CLIENT_ID ? 'SET' : 'NOT SET')
    console.log('Client Secret:', process.env.VITE_PCO_OAUTH_SECRET ? 'SET' : 'NOT SET')

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
    console.log('PCO_SECRET exists?', !!process.env.PCO_SECRET)
    console.log('PCO_SECRET value:', process.env.PCO_SECRET ? `${process.env.PCO_SECRET.substring(0, 15)}...` : 'NOT SET')

    if (process.env.PCO_SECRET) {
      try {
        // PATs use HTTP Basic Auth with app_id:secret format
        const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

        const fieldDataResponse = await fetch(
          `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition`,
          {
            headers: {
              Authorization: `Basic ${credentials}`,
            },
          }
        )

        console.log('Field data response status:', fieldDataResponse.status)

        if (fieldDataResponse.ok) {
          const fieldDataResult = await fieldDataResponse.json()
          console.log('Field data fetched successfully:', fieldDataResult.data?.length || 0, 'fields')

          // Merge field data into userData
          userData.included = fieldDataResult.included || []
          userData.data.relationships = userData.data.relationships || {}
          userData.data.relationships.field_data = {
            data: fieldDataResult.data || []
          }
        } else {
          const errorText = await fieldDataResponse.text()
          console.error('Failed to fetch field data:', fieldDataResponse.status, errorText)
        }
      } catch (error) {
        console.error('Failed to fetch field data:', error)
        // Continue without field data rather than failing
      }
    } else {
      console.log('PCO_SECRET not set, skipping field data fetch')
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

    // Fetch field data using admin PAT
    if (process.env.PCO_SECRET && process.env.PCO_APP_ID) {
      try {
        const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

        const fieldDataResponse = await fetch(
          `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition`,
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

// Update custom field endpoint
app.post('/api/field/update', async (req, res) => {
  console.log('Field update request received:', req.body)

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
    console.log('=== FIELD UPDATE REQUEST ===')
    console.log('Field name:', fieldName)
    console.log('Value:', value)

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
    console.log('Person ID:', personId)

    // Get ALL field definitions (not just the ones with data for this person)
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // First, get the person's existing field data
    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition`,
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
      console.log(`Field "${fieldName}" not found in person's data, fetching all field definitions...`)

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

      console.log(`Fetched ${allFieldDefs.length} total field definitions`)
      console.log('Field names:', allFieldDefs.map(f => f.attributes.name))

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

    console.log(`Found field definition for "${fieldName}":`, fieldDef.id)
    const fieldDefinitionId = fieldDef.id

    // Check if field data already exists
    const existingFieldData = fieldDataResult.data?.find(
      (item) => item.relationships?.field_definition?.data?.id === fieldDefinitionId
    )

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

    console.log('Field updated successfully')
    res.json({ success: true })
  } catch (error) {
    console.error('Field update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Check if user is a PCO admin
app.get('/api/admin/check', async (req, res) => {
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

    console.log('=== ADMIN CHECK ===')
    console.log('User ID:', userData.data.id)
    console.log('Site Administrator:', isSiteAdmin)
    console.log('People Permissions:', peoplePermissions)
    console.log('Is Admin?', isAdmin)
    console.log('==================')

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

    console.log('Saving to:', configPath)
    console.log('Number of teams to save:', Object.keys(teams).length)

    // Prepare the data to save
    const configData = {
      lastUpdated: new Date().toISOString(),
      updatedBy: userData.data.attributes.name || userData.data.attributes.login_identifier,
      teams
    }

    // Write to file
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf8')

    console.log('✅ Team requirements saved successfully by:', configData.updatedBy)
    console.log('✅ File written to:', configPath)

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

// Get team requirements (with overrides from config file)
app.get('/api/admin/team-requirements', async (req, res) => {
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
      console.log('No custom config found, using defaults')
    }

    // Import the default requirements from the module
    // Since this is server-side, we need to read the TypeScript file or have a separate JSON defaults file
    // For now, return the config data (which will be empty initially)
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

// Check if user is a ministry leader
app.get('/api/leader/check', async (req, res) => {
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
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()
    const personId = userData.data.id

    // Get the user's field data to check Ministry/Team Leader field
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    const fieldDataResponse = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition`,
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

    // Find the Ministry/Team Leader field (ID: 961991)
    const leaderFieldDef = fieldDataResult.included?.find(
      item => item.type === 'FieldDefinition' && item.id === '961991'
    )

    if (!leaderFieldDef) {
      return res.json({ isLeader: false })
    }

    const leaderFieldData = fieldDataResult.data?.find(
      item => item.relationships?.field_definition?.data?.id === '961991'
    )

    const ministries = leaderFieldData?.attributes?.value || null

    res.json({
      isLeader: !!ministries,
      ministries: ministries ? (Array.isArray(ministries) ? ministries : [ministries]) : []
    })
  } catch (error) {
    console.error('Leader check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Simple in-memory cache for volunteer data
const volunteerCache = new Map()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Get volunteers for a ministry (leader only)
app.get('/api/leader/volunteers/:ministry', async (req, res) => {
  const authHeader = req.headers.authorization
  const accessToken = authHeader?.replace('Bearer ', '')
  const { ministry } = req.params

  if (!accessToken) {
    return res.status(401).json({ error: 'No access token provided' })
  }

  if (!ministry) {
    return res.status(400).json({ error: 'Ministry parameter is required' })
  }

  // Check cache first
  const cacheKey = `volunteers:${ministry}`
  const cached = volunteerCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data)
  }

  try {
    const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

    // Fetch only field data for the two onboarding fields we care about
    let allFieldData = []
    const fieldIds = ['959379', '959386'] // In Progress (959379) and Completed (959386) fields

    for (const fieldId of fieldIds) {
      let nextUrl = `https://api.planningcenteronline.com/people/v2/field_data?where[field_definition_id]=${fieldId}&per_page=25`
      let pageCount = 0
      const maxPages = 2 // Very conservative to avoid rate limiting

      while (nextUrl && pageCount < maxPages) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        })

        if (!response.ok) {
          console.error(`Failed to fetch field data for field ${fieldId}:`, response.status)
          if (response.status === 429) {
            console.error('RATE LIMITED - PCO has blocked further requests temporarily')
            break
          }
          break
        }

        const page = await response.json()
        allFieldData = allFieldData.concat(page.data || [])

        nextUrl = page.links?.next || null
        pageCount++

        // Longer delay to avoid rate limiting
        if (nextUrl) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Delay between field fetches
      if (fieldIds.indexOf(fieldId) < fieldIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // Group field data by person
    const personFieldMap = new Map()
    for (const fieldData of allFieldData) {
      const personId = fieldData.relationships?.customizable?.data?.id
      if (!personId) continue

      if (!personFieldMap.has(personId)) {
        personFieldMap.set(personId, [])
      }
      personFieldMap.get(personId).push(fieldData)
    }

    // Filter volunteers by onboarding status for this ministry
    const inProgressVolunteers = []
    const completedVolunteers = []

    for (const [personId, personFieldData] of personFieldMap) {
      // Check Onboarding In Progress For (959379) - SWAPPED: this was wrong!
      const inProgressField = personFieldData.find(
        fd => fd.relationships?.field_definition?.data?.id === '959379'
      )
      const inProgressValue = inProgressField?.attributes?.value

      // Check Onboarding Completed For (959386) - SWAPPED: this was wrong!
      const completedField = personFieldData.find(
        fd => fd.relationships?.field_definition?.data?.id === '959386'
      )
      const completedValue = completedField?.attributes?.value

      // Check if this person has the ministry in their onboarding fields
      const inProgressMinistries = Array.isArray(inProgressValue) ? inProgressValue : (inProgressValue ? [inProgressValue] : [])
      const completedMinistries = Array.isArray(completedValue) ? completedValue : (completedValue ? [completedValue] : [])

      const matchesInProgress = inProgressMinistries.includes(ministry)
      const matchesCompleted = completedMinistries.includes(ministry)

      if (matchesInProgress || matchesCompleted) {
        // Fetch person details
        try {
          const personResponse = await fetch(
            `https://api.planningcenteronline.com/people/v2/people/${personId}`,
            {
              headers: {
                Authorization: `Basic ${credentials}`,
              },
            }
          )

          if (personResponse.ok) {
            const personData = await personResponse.json()
            const person = personData.data

            // Fetch email addresses
            const emailsResponse = await fetch(
              `https://api.planningcenteronline.com/people/v2/people/${personId}/emails`,
              {
                headers: {
                  Authorization: `Basic ${credentials}`,
                },
              }
            )

            let primaryEmail = ''
            if (emailsResponse.ok) {
              const emailsData = await emailsResponse.json()
              const emails = emailsData.data || []
              // Find primary email or use first email
              const primaryEmailObj = emails.find(e => e.attributes.primary) || emails[0]
              primaryEmail = primaryEmailObj?.attributes?.address || ''
            }

            const volunteerInfo = {
              id: person.id,
              name: person.attributes.name,
              email: primaryEmail,
              avatar: person.attributes.avatar
            }

            // Prioritize completed over in progress - if they've completed for this ministry,
            // they should only appear in the completed section
            console.log(`📋 ${volunteerInfo.name}:`, {
              inProgressMinistries,
              completedMinistries,
              matchesInProgress,
              matchesCompleted
            })

            if (matchesCompleted) {
              console.log(`✅ Adding ${volunteerInfo.name} to COMPLETED`)
              completedVolunteers.push(volunteerInfo)
            } else if (matchesInProgress) {
              console.log(`🔄 Adding ${volunteerInfo.name} to IN PROGRESS`)
              inProgressVolunteers.push(volunteerInfo)
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (error) {
          console.error(`Failed to fetch person ${personId}:`, error.message)
        }
      }
    }

    const result = {
      inProgress: inProgressVolunteers,
      completed: completedVolunteers
    }

    // Cache the result
    volunteerCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    })

    res.json(result)
  } catch (error) {
    console.error('Volunteers fetch error:', error)
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
      `https://api.planningcenteronline.com/people/v2/people/${personId}/field_data?include=field_definition`,
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

// For local development only (Vercel ignores this)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`)
  })
}

// Export for Vercel serverless functions
export default app
