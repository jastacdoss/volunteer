import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const app = express()
const PORT = 1701

app.use(cors())
app.use(express.json())

// OAuth callback endpoint
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query

  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' })
  }

  try {
    // Determine the correct redirect URI based on environment
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:1700'
    const redirectUri = `${protocol}://${host}/auth/callback`

    console.log('Using redirect URI:', redirectUri)

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
      console.error('Token exchange error:', error)
      return res.status(500).json({ error: 'Failed to exchange code for token' })
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
      return res.status(404).json({ error: `Field "${fieldName}" not found. Please create this custom field in PCO People first.` })
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
      return res.status(500).json({ error: 'Failed to update field' })
    }

    console.log('Field updated successfully')
    res.json({ success: true })
  } catch (error) {
    console.error('Field update error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// For local development
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})

// Export for Vercel serverless functions
export default app
