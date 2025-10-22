// Script to fetch form field IDs from PCO Forms API
// Run this once to get the field IDs, then hard-code them in the config

import 'dotenv/config'

const VITE_PCO_OAUTH_CLIENT_ID = process.env.VITE_PCO_OAUTH_CLIENT_ID
const VITE_PCO_OAUTH_SECRET = process.env.VITE_PCO_OAUTH_SECRET
const FORM_ID = '982853' // References form

async function fetchFormFields() {
  // Get OAuth token
  const tokenResponse = await fetch('https://api.planningcenteronline.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: VITE_PCO_OAUTH_CLIENT_ID,
      client_secret: VITE_PCO_OAUTH_SECRET,
      scope: 'people',
    }),
  })

  if (!tokenResponse.ok) {
    console.error('Failed to get OAuth token:', tokenResponse.status, tokenResponse.statusText)
    return
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  const response = await fetch(
    `https://api.planningcenteronline.com/people/v2/forms/${FORM_ID}/form_fields`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    console.error('Failed to fetch form fields:', response.status, response.statusText)
    return
  }

  const data = await response.json()

  console.log('\n=== References Form Field IDs ===\n')

  const fieldMap = {}

  data.data.forEach(field => {
    const label = field.attributes.label
    const id = field.id
    console.log(`${label}: ${id}`)
    fieldMap[label] = id
  })

  console.log('\n=== Config Format ===\n')
  console.log('export const REFERENCES_FORM_FIELDS = {')

  for (let i = 1; i <= 3; i++) {
    console.log(`  // Reference ${i}`)
    console.log(`  ref${i}Name: '${fieldMap[`Reference ${i} - Name`] || 'NOT_FOUND'}',`)
    console.log(`  ref${i}Phone: '${fieldMap[`Reference ${i} - Phone`] || 'NOT_FOUND'}',`)
    console.log(`  ref${i}Email: '${fieldMap[`Reference ${i} - Email`] || 'NOT_FOUND'}',`)
    console.log(`  ref${i}Relationship: '${fieldMap[`Reference ${i} - Relationship`] || 'NOT_FOUND'}',`)
    console.log()
  }

  console.log('}')
}

fetchFormFields().catch(console.error)
