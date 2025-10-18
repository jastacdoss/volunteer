import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const FORM_ID = process.argv[2]

if (!FORM_ID) {
  console.error('Usage: node scripts/delete-form-submissions.js <FORM_ID>')
  console.error('Example: node scripts/delete-form-submissions.js 937413')
  process.exit(1)
}

if (!process.env.PCO_APP_ID || !process.env.PCO_SECRET) {
  console.error('Error: PCO_APP_ID and PCO_SECRET must be set in .env.local')
  process.exit(1)
}

const credentials = Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString('base64')

async function deleteAllFormSubmissions(formId) {
  console.log(`\n🔍 Fetching all submissions for form ${formId}...`)

  // Fetch all form submissions with pagination
  let allSubmissions = []
  let nextUrl = `https://api.planningcenteronline.com/people/v2/forms/${formId}/form_submissions?per_page=100`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed to fetch submissions: ${response.status}`, errorText)
      process.exit(1)
    }

    const data = await response.json()
    allSubmissions = allSubmissions.concat(data.data || [])

    console.log(`  Fetched ${data.data?.length || 0} submissions (total: ${allSubmissions.length})`)

    nextUrl = data.links?.next || null

    // Small delay to avoid rate limiting
    if (nextUrl) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log(`\n📋 Found ${allSubmissions.length} total submissions`)

  if (allSubmissions.length === 0) {
    console.log('✅ No submissions to delete')
    return
  }

  // Ask for confirmation
  console.log(`\n⚠️  WARNING: This will permanently delete ${allSubmissions.length} form submissions!`)
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')

  await new Promise(resolve => setTimeout(resolve, 5000))

  // Delete each submission
  console.log('🗑️  Deleting submissions...')
  let deleted = 0
  let failed = 0

  for (const submission of allSubmissions) {
    try {
      const deleteResponse = await fetch(
        `https://api.planningcenteronline.com/people/v2/forms/${formId}/form_submissions/${submission.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        }
      )

      if (deleteResponse.ok || deleteResponse.status === 204) {
        deleted++
        console.log(`  ✓ Deleted submission ${submission.id} (${deleted}/${allSubmissions.length})`)
      } else {
        failed++
        const errorText = await deleteResponse.text()
        console.error(`  ✗ Failed to delete submission ${submission.id}: ${deleteResponse.status} ${errorText}`)
      }

      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (error) {
      failed++
      console.error(`  ✗ Error deleting submission ${submission.id}:`, error.message)
    }
  }

  console.log(`\n✅ Deletion complete!`)
  console.log(`   Deleted: ${deleted}`)
  console.log(`   Failed: ${failed}`)
}

// Run the script
deleteAllFormSubmissions(FORM_ID)
  .then(() => {
    console.log('\n✨ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
