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
        redirect_uri: 'http://localhost:1700/auth/callback',
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
    const userResponse = await fetch('https://api.planningcenteronline.com/people/v2/me?include=field_data', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch user data' })
    }

    const userData = await userResponse.json()

    res.json({
      accessToken,
      userData,
    })
  } catch (error) {
    console.error('OAuth error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
