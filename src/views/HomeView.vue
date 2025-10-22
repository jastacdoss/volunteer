<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getSession, initiateLogin, logout, refreshUserData } from '@/lib/auth'
import { loadTeamRequirements, getRequiredSteps, getCovenantLevel, getTeamDisplayName, type RequiredSteps } from '@/lib/teamMatrix'
import OnboardingSteps from '@/components/OnboardingSteps.vue'
import AdditionalRequirements from '@/components/AdditionalRequirements.vue'
import AppHeader from '@/components/AppHeader.vue'

// Environment variables for training validity periods
const CHILD_SAFETY_TRAINING_VALID_YEARS = Number(import.meta.env.VITE_CHILD_SAFETY_TRAINING_VALID_YEARS || 2)
const MANDATED_REPORTER_TRAINING_VALID_YEARS = Number(import.meta.env.VITE_MANDATED_REPORTER_TRAINING_VALID_YEARS || 1)

// Training URLs
const MANDATED_REPORTER_URL = import.meta.env.VITE_MANDATED_REPORTER_URL || 'https://www.myflfamilies.com/sites/default/files/PT/FlProMandatedReporter/story.html'

interface Step {
  id: number
  title: string
  description: string
  link?: string
  linkText?: string
  completed: boolean
  pending?: boolean
  completedDate?: string
  email?: string
  action?: 'submit' | 'external' | 'pending-only'
  fieldName?: string
  covenantLevel?: 1 | 2 | 3
  backgroundCheckStatus?: string
  backgroundCheckDate?: string
}

interface AdditionalRequirement {
  title: string
  description: string
  link?: string
  linkText?: string
  fieldName?: string
  completed?: boolean
}

const userName = ref('Volunteer')
const isLoading = ref(true)
const isAuthenticated = ref(false)
const isUserAdmin = ref(false)
const isUserLeader = ref(false)
const activeTeams = ref<string[]>([])
const completedTeams = ref<string[]>([])
const personData = ref<any>(null)
const fieldDefinitions = ref<any[]>([])
const fieldData = ref<any[]>([])
const selectedTab = ref<string | null>(null)
const backgroundChecks = ref<any[]>([])
let refreshInterval: ReturnType<typeof setInterval> | null = null
let isRefreshing = ref(false)

/**
 * Helper function to check if a date is within X years
 */
function isWithinYears(dateString: string | null, years: number): boolean {
  if (!dateString) return false
  try {
    const date = new Date(dateString)
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - years)
    return date >= cutoff
  } catch {
    return false
  }
}

/**
 * Get current background check (where current=true) or most recent
 */
function getCurrentBackgroundCheck() {
  if (backgroundChecks.value.length === 0) return null

  // First, try to find a check marked as current
  const currentCheck = backgroundChecks.value.find((check: any) => check.attributes.current === true)
  if (currentCheck) return currentCheck

  // Otherwise, return the most recent one (sorted by completed_at desc)
  const sorted = [...backgroundChecks.value].sort((a: any, b: any) => {
    const dateA = new Date(a.attributes.completed_at || 0).getTime()
    const dateB = new Date(b.attributes.completed_at || 0).getTime()
    return dateB - dateA
  })
  return sorted[0] || null
}

/**
 * Check if background check is expired
 */
function isBackgroundCheckExpired(check: any): boolean {
  if (!check || !check.attributes.expires_on) return false
  try {
    const expiresDate = new Date(check.attributes.expires_on)
    const today = new Date()
    return expiresDate < today
  } catch {
    return false
  }
}

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

/**
 * Helper function to get field value by field name or field ID
 * Note: PCO multiselect fields return multiple FieldDatum objects with the same field_definition.id
 */
function getFieldValue(fieldNameOrId: string): any {
  let fieldDefId: string | null = null

  // Check if it's a numeric ID (like '959457')
  if (/^\d+$/.test(fieldNameOrId)) {
    fieldDefId = fieldNameOrId
  } else {
    // Find the field definition by name
    const fieldDef = fieldDefinitions.value.find((def: any) =>
      def.attributes.name === fieldNameOrId
    )
    if (fieldDef) {
      fieldDefId = fieldDef.id
    }
  }

  if (!fieldDefId) {
    return null
  }

  // Get ALL field data with this definition ID (multiselect = multiple FieldDatum objects)
  const fields = fieldData.value.filter((data: any) =>
    data.relationships?.field_definition?.data?.id === fieldDefId
  )

  if (fields.length === 0) {
    return null
  }

  // If multiple values, return as array
  if (fields.length > 1) {
    return fields.map((f: any) => f.attributes?.value).filter(Boolean)
  }

  // Single value
  return fields[0]?.attributes?.value || null
}

/**
 * Parse multi-select field value (could be string or array)
 */
function parseMultiSelectValue(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    // Handle comma-separated or newline-separated strings
    return value.split(/[,\n]/).map(v => v.trim()).filter(v => v.length > 0)
  }
  return []
}

/**
 * All teams with their status (for tabs)
 */
const allTeams = computed(() => {
  const teams: Array<{name: string, status: 'active' | 'completed'}> = []

  activeTeams.value.forEach(team => {
    teams.push({ name: team, status: 'active' })
  })

  completedTeams.value.forEach(team => {
    teams.push({ name: team, status: 'completed' })
  })

  return teams
})

// Auto-select first team when data loads
watch(allTeams, (teams) => {
  if (teams.length > 0 && !selectedTab.value && teams[0]) {
    selectedTab.value = teams[0].name
  }
}, { immediate: true })

/**
 * Dynamically generate steps based on team requirements
 */
const steps = computed((): Step[] => {
  if (!personData.value) return []

  const active = activeTeams.value
  const completed = completedTeams.value

  if (active.length === 0) {
    return []
  }

  // If we have multiple teams, filter by selected tab
  const showTabs = allTeams.value.length > 1
  let teamsToShow = active

  if (showTabs && selectedTab.value) {
    // Show only the selected tab's requirements
    const isActiveTab = active.includes(selectedTab.value)
    const isCompletedTab = completed.includes(selectedTab.value)

    if (isActiveTab) {
      teamsToShow = [selectedTab.value]
    } else if (isCompletedTab) {
      // For completed tabs, still show requirements but use as active to get requirements
      teamsToShow = [selectedTab.value]
    } else {
      teamsToShow = []
    }
  }

  const required: RequiredSteps = getRequiredSteps(teamsToShow, [])
  const stepsList: Step[] = []

  // Step 1: Declaration Form (only if Background Check required)
  if (required.backgroundCheck) {
    const declarationSubmitted = getFieldValue('Declaration Submitted')
    const declarationReviewed = getFieldValue('Declaration Reviewed')
    const isSubmitted = declarationSubmitted === 'Yes' || declarationSubmitted === 'true' || declarationSubmitted === true
    const isReviewed = !!(declarationReviewed && declarationReviewed !== 'false' && declarationReviewed !== false)

    stepsList.push({
      id: stepsList.length + 1,
      title: 'Declaration Form',
      description: 'This Declaration form must be completed and submitted before moving onto the background check step.',
      link: 'https://riverchristianchurch.churchcenter.com/people/forms/937413',
      linkText: 'Complete Declaration Form',
      action: 'external',
      fieldName: 'Declaration Submitted',
      completed: isReviewed,
      pending: isSubmitted && !isReviewed
    })
  }

  // Step 2: Background Check Application (only if required)
  if (required.backgroundCheck) {
    const currentCheck = getCurrentBackgroundCheck()

    let bgCompleted = false
    let bgPending = false
    let bgStatus = ''
    let bgDate = ''
    let description = ''
    let action: 'submit' | 'external' | 'pending-only' = 'external'

    if (!currentCheck) {
      // No background check exists - show initial message
      description = 'Expect an email to complete your background check. This should come to your email 1-2 days after your declaration is reviewed. (This procedure needs to be completed every 2 years.)'
      action = 'pending-only'
    } else {
      const status = currentCheck.attributes.status
      const statusUpdatedAt = currentCheck.attributes.status_updated_at
      bgDate = formatDate(statusUpdatedAt)

      // Check for various status values
      if (status === 'report_processing' || status === 'pending') {
        // Submitted, waiting for results
        bgPending = true
        bgStatus = 'report_processing'
        description = `Background check submitted and processing. Status will update automatically when complete.`
        action = 'pending-only'
      } else if (status === 'manual_clear' || status === 'clear' || status === 'approved') {
        // Background check passed
        const isExpired = isBackgroundCheckExpired(currentCheck)
        if (isExpired) {
          // Expired - need new one
          description = 'Your background check has expired. Please complete a new one.'
          action = 'external'
        } else {
          // Valid and current
          bgCompleted = true
          bgStatus = 'manual_clear'
          description = `Background check completed and approved.`
          action = 'pending-only'
        }
      } else if (status === 'manual_not_clear' || status === 'not_clear' || status === 'denied') {
        // Background check did not pass
        bgStatus = 'manual_not_clear'
        description = `Background check not cleared. Please contact the office for more information.`
        action = 'pending-only'
      } else {
        // Unknown status - treat as pending
        bgPending = true
        bgStatus = status
        description = `Background check status: ${status}`
        action = 'pending-only'
      }
    }

    const bgStep: Step = {
      id: stepsList.length + 1,
      title: 'Background Check',
      description,
      action,
      completed: bgCompleted,
      pending: bgPending,
      backgroundCheckStatus: bgStatus,
      backgroundCheckDate: bgDate
    }

    // Only add link if action is not 'pending-only' (i.e., when expired or no check exists but declaration completed)
    if (action === 'external') {
      bgStep.link = 'https://ministryopportunities.org/RCCFI'
      bgStep.linkText = 'Submit Background Check'
    }

    stepsList.push(bgStep)
  }

  // Step 3: Child Safety Training (only if required)
  if (required.childSafety) {
    // Use field IDs directly since field names may not be in included definitions
    const submitted = getFieldValue('959457') // Child Safety Training Submitted
    const lastCompleted = getFieldValue('959380') // Child Safety Training Last Completed
    const isValid = isWithinYears(lastCompleted, CHILD_SAFETY_TRAINING_VALID_YEARS)

    console.log('🔍 Child Safety Training Submitted (959457):', submitted, 'Type:', typeof submitted)
    console.log('🔍 Submitted === "Yes":', submitted === 'Yes')
    console.log('🔍 Submitted === "YES":', submitted === 'YES')
    console.log('🔍 Last Completed (959380):', lastCompleted, 'Is Valid:', isValid)

    // Debug: Show the actual field data for this field
    const field959457 = fieldData.value.find((fd: any) => fd.relationships?.field_definition?.data?.id === '959457')
    console.log('🔍 Raw field data for 959457:', field959457)

    // Check if submitted - handle various boolean representations from PCO
    const isSubmitted = submitted === 'Yes' || submitted === 'YES' || submitted === 'true' || submitted === true || submitted === 'yes' || submitted === 't'
    console.log('🔍 isSubmitted:', isSubmitted)

    stepsList.push({
      id: stepsList.length + 1,
      title: 'Child Safety Training',
      description: `Expect an email from Message@protectingourkids.com for the child safety training. This should come to your email 1-2 days after completing the background check. The training consists of multiple online videos. At the end of all the videos is a quick quiz, 70% or higher is considered passing. You will have 2 weeks to complete this training before the link expires. This training is valid for ${CHILD_SAFETY_TRAINING_VALID_YEARS} years.`,
      email: 'Message@protectingourkids.com',
      fieldName: 'Child Safety Training Submitted',
      action: 'submit',
      completed: isValid,
      pending: isSubmitted && !isValid
    })
  }

  // Step 4: Mandated Reporter Training (only if required)
  if (required.mandatedReporter) {
    // Use field IDs directly since field names may not be in included definitions
    const submitted = getFieldValue('959458') // Mandated Reporter Training Submitted
    const lastCompleted = getFieldValue('959382') // Mandated Reporter Training Last Completed
    const isValid = isWithinYears(lastCompleted, MANDATED_REPORTER_TRAINING_VALID_YEARS)
    const isSubmitted = submitted === 'Yes' || submitted === 'true' || submitted === true || submitted === 'yes' || submitted === 't'

    stepsList.push({
      id: stepsList.length + 1,
      title: 'Mandated Reporter Training',
      description: `Complete the Mandated Reporter Training provided by the Florida Department of Children and Families by clicking the button below. RCC requires that volunteers and staff who directly or indirectly interact with children complete the training annually. Upon completion of the course, please click the button below and print a paper copy of your certificate and drop off at the church office, or print a PDF and email to <a href="mailto:admin@riverchristian.church" class="text-blue-600 hover:text-blue-700 underline">admin@riverchristian.church</a>.`,
      link: MANDATED_REPORTER_URL,
      linkText: 'Complete Training',
      fieldName: 'Mandated Reporter Training Submitted',
      action: 'submit',
      completed: isValid,
      pending: isSubmitted && !isValid
    })
  }

  // Step 5: References (only if required)
  if (required.references) {
    const referencesSubmitted = getFieldValue('References Submitted')
    const referencesChecked = getFieldValue('References Checked')
    const isSubmitted = referencesSubmitted === 'Yes' || referencesSubmitted === 'true' || referencesSubmitted === true
    const isChecked = !!(referencesChecked && referencesChecked !== 'false' && referencesChecked !== false)

    stepsList.push({
      id: stepsList.length + 1,
      title: 'References',
      description: 'Submit your personal and professional reference forms using the link below.',
      link: 'https://riverchristianchurch.churchcenter.com/people/forms/982853',
      linkText: 'Submit References Form',
      action: 'external',
      fieldName: 'References Submitted',
      completed: isChecked,
      pending: isSubmitted && !isChecked
    })
  }

  // Step 6: Covenant (tiered - show only highest level needed)
  if (required.covenant === 3) {
    const covenantSigned = getFieldValue('Public Presence Policy Signed')
    stepsList.push({
      id: stepsList.length + 1,
      title: 'Public Presence Policy Covenant',
      description: 'Read and sign the Public Presence Policy Covenant form. This is the highest level covenant required for your role.',
      link: 'https://riverchristianchurch.churchcenter.com/people/forms/982797',
      linkText: 'Complete Covenant Form',
      action: 'external',
      fieldName: 'Public Presence Policy Signed',
      covenantLevel: 3,
      completed: !!(covenantSigned && covenantSigned !== 'false' && covenantSigned !== false)
    })
  } else if (required.covenant === 2) {
    const covenantSigned = getFieldValue('Moral Conduct Policy Signed')
    stepsList.push({
      id: stepsList.length + 1,
      title: 'Moral Conduct Policy Covenant',
      description: 'Read and sign the Moral Conduct Policy Covenant form for your role.',
      link: 'https://riverchristianchurch.churchcenter.com/people/forms/1068047',
      linkText: 'Complete Covenant Form',
      action: 'external',
      fieldName: 'Moral Conduct Policy Signed',
      covenantLevel: 2,
      completed: !!(covenantSigned && covenantSigned !== 'false' && covenantSigned !== false)
    })
  } else if (required.covenant === 1) {
    const covenantSigned = getFieldValue('Covenant Signed')
    stepsList.push({
      id: stepsList.length + 1,
      title: 'Volunteer Covenant',
      description: 'Read and sign the Volunteer Covenant form.',
      link: 'https://riverchristianchurch.churchcenter.com/people/forms/1068048',
      linkText: 'Complete Covenant Form',
      action: 'external',
      fieldName: 'Covenant Signed',
      covenantLevel: 1,
      completed: !!(covenantSigned && covenantSigned !== 'false' && covenantSigned !== false)
    })
  }

  return stepsList
})

/**
 * Additional requirements (not part of main onboarding steps)
 */
const additionalRequirements = computed((): AdditionalRequirement[] => {
  if (!personData.value || activeTeams.value.length === 0) return []

  // If we have multiple teams, filter by selected tab
  const showTabs = allTeams.value.length > 1
  let teamsToShow = activeTeams.value

  if (showTabs && selectedTab.value) {
    // Show only the selected tab's requirements
    const isActiveTab = activeTeams.value.includes(selectedTab.value)
    const isCompletedTab = completedTeams.value.includes(selectedTab.value)

    if (isActiveTab) {
      teamsToShow = [selectedTab.value]
    } else if (isCompletedTab) {
      // For completed tabs, still show requirements
      teamsToShow = [selectedTab.value]
    } else {
      teamsToShow = []
    }
  }

  const required: RequiredSteps = getRequiredSteps(teamsToShow, [])
  const additional: AdditionalRequirement[] = []

  if (required.welcomeToRCC) {
    const welcomeDate = getFieldValue('Welcome to RCC Date')
    const isCompleted = !!(welcomeDate && welcomeDate !== 'false' && welcomeDate !== false)

    additional.push({
      title: 'Attend Welcome to RCC',
      description: 'Completion of Welcome to RCC is required for your role.',
      link: 'https://riverchristianchurch.churchcenter.com/registrations/events/category/94241',
      linkText: 'View Schedule',
      fieldName: 'Welcome to RCC Date',
      completed: isCompleted
    })
  }

  if (required.lifeGroup) {
    additional.push({
      title: 'Regularly Attend LifeGroup',
      description: 'Life Group attendance is required for your role.',
      link: 'https://riverchristianchurch.churchcenter.com/groups/lifegroups?enrollment=open_signup%2Crequest_to_join&filter=enrollment',
      linkText: 'View Groups',
      fieldName: 'Life Group Attendance'
    })
  }

  if (required.membership) {
    // Format team names nicely for the description
    const teamNames = activeTeams.value.map(team => getTeamDisplayName(team))
    let teamText = ''
    if (teamNames.length === 1) {
      teamText = teamNames[0]!
    } else if (teamNames.length === 2) {
      teamText = `${teamNames[0]!} and ${teamNames[1]!}`
    } else if (teamNames.length > 2) {
      teamText = teamNames.slice(0, -1).join(', ') + ', and ' + teamNames[teamNames.length - 1]!
    }

    // Check PCO membership attribute
    const isMember = personData.value.attributes.membership === 'Member'

    additional.push({
      title: 'RCC Membership',
      description: `Volunteers who serve on the ${teamText} ${teamNames.length === 1 ? 'Team are' : 'Teams are'} expected to be members of River Christian Church. You can ask questions and learn all about the process by attending Welcome to RCC.`,
      fieldName: 'RCC Membership',
      completed: isMember
    })
  }

  if (required.discipleship) {
    additional.push({
      title: 'Complete Discipleship Training',
      description: 'Discipleship Training completion is required for your role.',
      fieldName: 'Discipleship Training'
    })
  }

  if (required.leadership) {
    additional.push({
      title: 'Complete Leadership Training',
      description: 'Leadership Training completion is required for your role.',
      fieldName: 'Leadership Training'
    })
  }

  return additional
})

/**
 * Load all user data (field data, background checks, etc.)
 */
async function loadUserData() {
  // Prevent overlapping refreshes
  if (isRefreshing.value) {
    console.log('⏭️  Skipping refresh - already in progress')
    return
  }

  isRefreshing.value = true
  const startTime = Date.now()

  try {
    const session = getSession()
    if (!session) {
      isRefreshing.value = false
      return
    }

    // Refresh user data to get latest field information
    const freshData = await refreshUserData()
    const userData = freshData || session.user

    // Extract user name from PCO data
    personData.value = userData.data
    userName.value = personData.value.attributes.first_name || 'Volunteer'

    // Extract custom fields and field definitions from included data
    const included = userData.included || []

    // Field definitions come from included
    fieldDefinitions.value = included.filter((item: any) => item.type === 'FieldDefinition')

    // Field data: FieldDatum objects are in userData.data.relationships.field_data.data
    // The included array only has FieldDefinition objects (metadata about fields)
    // The actual FieldDatum objects with values are in the relationships
    const fieldDataFromRelationships = userData.data.relationships?.field_data?.data || []
    fieldData.value = Array.isArray(fieldDataFromRelationships) ? fieldDataFromRelationships : []

    console.log('🔍 Field data count:', fieldData.value.length)

    // Get active teams (Onboarding In Progress For)
    const activeTeamsValue = getFieldValue('Onboarding In Progress For')
    activeTeams.value = parseMultiSelectValue(activeTeamsValue)

    // Get completed teams (Onboarding Completed For)
    const completedTeamsValue = getFieldValue('Onboarding Completed For')
    completedTeams.value = parseMultiSelectValue(completedTeamsValue)

    // Fetch background checks
    try {
      const bgResponse = await fetch(`/api/person/background-checks`, {
        headers: {
          'Authorization': `Bearer ${session.token}`,
        },
      })
      if (bgResponse.ok) {
        const bgData = await bgResponse.json()
        backgroundChecks.value = bgData.data || []
      }
    } catch (error) {
      console.log('Could not fetch background checks:', error)
    }

    const elapsed = Date.now() - startTime
    console.log(`✓ Refresh completed in ${elapsed}ms`)
  } finally {
    isRefreshing.value = false
  }
}

onMounted(async () => {
  // Load team requirements from API (with admin overrides)
  await loadTeamRequirements()

  const session = getSession()

  if (!session) {
    isLoading.value = false
    return
  }

  isAuthenticated.value = true

  // Initial data load
  await loadUserData()

  isLoading.value = false

  // Set up automatic background refresh every 10 seconds
  refreshInterval = setInterval(async () => {
    console.log('🔄 Auto-refreshing user data...')
    await loadUserData()
  }, 10000) // 10 seconds
})

onUnmounted(() => {
  // Clean up interval when component unmounts
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

function handleLogin() {
  initiateLogin()
}

function handleLogout() {
  logout()
}

async function handleMarkSubmitted(step: Step) {
  if (!step.fieldName) return

  try {
    const session = getSession()
    if (!session) return

    console.log('Submitting field update:', step.fieldName)

    // Call API to update the custom field
    const response = await fetch('/api/field/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        fieldName: step.fieldName,
        value: true,  // Use boolean true instead of string "Yes"
      }),
    })

    console.log('Response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Update failed:', errorData)
      if (errorData.availableFields) {
        console.error('Available fields in PCO:', errorData.availableFields)
      }
      throw new Error(errorData.error || 'Failed to update field')
    }

    const result = await response.json()
    console.log('Update successful:', result)

    // Refresh user data in the background to show updated status
    await loadUserData()
  } catch (error) {
    console.error('Failed to mark as submitted:', error)
    alert('Failed to mark as submitted. Please try again.')
  }
}
</script>

<template>
  <!-- Not authenticated - show login -->
  <div v-if="!isLoading && !isAuthenticated" class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-lg p-12 max-w-md w-full text-center">
      <h1 class="text-3xl font-bold text-gray-900 mb-4">RCC Volunteer Onboarding</h1>
      <p class="text-gray-600 mb-8">Sign in with Planning Center to view your onboarding progress</p>
      <button
        @click="handleLogin"
        class="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-lg"
      >
        Sign in with Planning Center
      </button>
    </div>
  </div>

  <!-- Authenticated - show dashboard -->
  <div v-else-if="!isLoading" class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
    <!-- Header -->
    <AppHeader title="My Onboarding" />

    <!-- Main Content -->
    <main class="max-w-5xl mx-auto px-6 py-12">
      <!-- Welcome Section -->
      <div class="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-100">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-3xl font-bold text-gray-900">
            Hello, {{ userName }}!
          </h2>
          <a
            href="https://riverchristianchurch.churchcenter.com/me/profile-and-household"
            target="_blank"
            class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            Edit Profile
          </a>
        </div>
        <div class="prose prose-lg max-w-none text-gray-700">
          <p class="mb-4">
            Thank you for taking the necessary steps to getting involved at RCC. Your time and service are so appreciated and because of volunteers like you, we are able to reach more for Christ. Below you can see the team(s) you have volunteered to serve on and the steps required to get started. If you have any issues along the way feel free to reach out to one of our <a href="mailto:admin@riverchristian.church" class="text-blue-600 hover:text-blue-700 underline">admins</a>.
          </p>
          <p class="mb-6">
            RCC utilizes Planning Center for scheduling, communication, and other administrative tasks. To complete the onboarding steps below, you will need to create an account. Once added to a serve team, you can view your schedule and update your block-out dates. You will be required to login twice as part of the process - once to Planning Center and once to Church Center. Both sites use the same email/phone but the login process is slightly different as detailed below.
          </p>

          <!-- Login Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
            <!-- Planning Center Login Card -->
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
              <div class="flex items-start gap-3 mb-3">
                <svg class="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                <h4 class="text-lg font-bold text-blue-900">Planning Center Login</h4>
              </div>
              <p class="text-sm text-gray-700">
                Traditional username and password login. You completed this login to get to this page.
              </p>
            </div>

            <!-- Church Center Login Card -->
            <div class="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-xl p-6 shadow-sm">
              <div class="flex items-start gap-3 mb-3">
                <svg class="w-6 h-6 text-green-600 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
                <h4 class="text-lg font-bold text-green-900">Church Center Login</h4>
              </div>
              <p class="text-sm text-gray-700 mb-3">
                Church Center is accessible to anyone at RCC who has ever checked in a child/student, registered for an event or group, or donated online. This login uses the same email/phone as Planning Center, but instead of a traditional password, you will be emailed/texted a six-digit code to gain access.
              </p>
              <p class="text-sm text-gray-700">
                You will need to login to Church Center to update your profile information and complete any required forms below.
              </p>
            </div>
          </div>
        </div>

        <!-- Show active teams (when no tabs) -->
        <div v-if="activeTeams.length > 0 && allTeams.length <= 1" class="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 class="text-sm font-semibold text-blue-900 mb-2">Onboarding For:</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="team in activeTeams"
              :key="team"
              class="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full"
            >
              {{ getTeamDisplayName(team) }}
            </span>
          </div>
        </div>

        <!-- No teams selected -->
        <div v-else-if="activeTeams.length === 0 && completedTeams.length === 0" class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p class="text-yellow-800 font-medium">
            No teams selected for onboarding. Please contact the church office to get started.
          </p>
        </div>
      </div>

      <!-- Tabbed Interface (when multiple teams) -->
      <div v-if="allTeams.length > 1">
        <!-- Team Tabs -->
        <div class="flex gap-2 mb-0 flex-wrap pl-2">
          <button
            v-for="team in allTeams"
            :key="team.name"
            @click="selectedTab = team.name"
            :class="[
              'px-4 py-3 font-medium rounded-t-lg transition-colors flex items-center gap-2 border-t border-x',
              selectedTab === team.name
                ? (team.status === 'active' ? 'bg-blue-500 text-white border-blue-500' : 'bg-green-500 text-white border-green-500')
                : (team.status === 'active' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-gray-300' : 'bg-green-100 text-green-800 hover:bg-green-200 border-gray-300')
            ]"
          >
            <!-- Icon based on status -->
            <svg v-if="team.status === 'active'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            {{ getTeamDisplayName(team.name) }}
          </button>
        </div>

        <!-- Content Window -->
        <div class="bg-white rounded-b-xl rounded-tr-xl shadow-lg border border-gray-200 p-8">
          <!-- Progress Overview (only if there are steps) -->
          <div v-if="steps.length > 0" class="mb-8">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-gray-900">Your Progress</h3>
              <span class="text-sm font-medium text-gray-600">
                {{ steps.filter(s => s.completed || s.pending).length }} of {{ steps.length }} completed
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3 relative overflow-hidden">
              <!-- Completed portion (green) -->
              <div
                class="absolute top-0 left-0 bg-green-500 h-3 transition-all duration-500"
                :style="{ width: `${(steps.filter(s => s.completed).length / steps.length) * 100}%` }"
              ></div>
              <!-- Pending portion (yellow) - starts where completed ends -->
              <div
                class="absolute top-0 bg-yellow-500 h-3 transition-all duration-500"
                :style="{
                  left: `${(steps.filter(s => s.completed).length / steps.length) * 100}%`,
                  width: `${(steps.filter(s => s.pending).length / steps.length) * 100}%`
                }"
              ></div>
            </div>
          </div>

          <!-- Steps (using OnboardingSteps component) -->
          <div v-if="steps.length > 0" class="mb-12">
            <OnboardingSteps :steps="steps" :readonly="false" @mark-submitted="handleMarkSubmitted" />
          </div>

          <!-- Additional Requirements (using AdditionalRequirements component) -->
          <div v-if="additionalRequirements.length > 0" class="mb-12">
            <AdditionalRequirements :requirements="additionalRequirements" />
          </div>
        </div>
      </div>

      <!-- No Tabs - Show content directly -->
      <div v-else-if="activeTeams.length > 0">
        <!-- Progress Overview (only if there are steps) -->
        <div v-if="steps.length > 0" class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-gray-900">Your Progress</h3>
            <span class="text-sm font-medium text-gray-600">
              {{ steps.filter(s => s.completed || s.pending).length }} of {{ steps.length }} completed
            </span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3 relative overflow-hidden">
            <!-- Completed portion (green) -->
            <div
              class="absolute top-0 left-0 bg-green-500 h-3 transition-all duration-500"
              :style="{ width: `${(steps.filter(s => s.completed).length / steps.length) * 100}%` }"
            ></div>
            <!-- Pending portion (yellow) - starts where completed ends -->
            <div
              class="absolute top-0 bg-yellow-500 h-3 transition-all duration-500"
              :style="{
                left: `${(steps.filter(s => s.completed).length / steps.length) * 100}%`,
                width: `${(steps.filter(s => s.pending).length / steps.length) * 100}%`
              }"
            ></div>
          </div>
        </div>

        <!-- Steps (using OnboardingSteps component) -->
        <div v-if="steps.length > 0" class="mb-12">
          <OnboardingSteps :steps="steps" :readonly="false" @mark-submitted="handleMarkSubmitted" />
        </div>

        <!-- Additional Requirements (using AdditionalRequirements component) -->
        <div v-if="additionalRequirements.length > 0" class="mb-12">
          <AdditionalRequirements :requirements="additionalRequirements" />
        </div>
      </div>

      <!-- Footer Contact -->
      <div class="mt-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl shadow-lg p-8 text-white">
        <h3 class="text-2xl font-bold mb-4">Questions or Need Help?</h3>
        <p class="mb-4 text-blue-50">
          Thank you for your interest in serving at RCC! We look forward to serving and growing the Kingdom alongside you! If you have any questions about the process or issues with the onboarding process please reach out to our office admin staff at <a href="mailto:admin@riverchristian.church" class="text-white hover:text-blue-100 font-semibold underline">admin@riverchristian.church</a>.
        </p>
        <div class="space-y-2 text-blue-50">
          <p class="font-semibold text-white">Sincerely,</p>
          <p>Cathy Reigner & Heather Lynn</p>
          <p>RCC Office Admin</p>
        </div>
      </div>
    </main>
  </div>
</template>
