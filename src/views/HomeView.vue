<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getSession, initiateLogin, logout, refreshUserData } from '@/lib/auth'
import { getRequiredSteps, getCovenantLevel, getTeamDisplayName, type RequiredSteps } from '@/lib/teamMatrix'

// Environment variables for training validity periods
const CHILD_SAFETY_TRAINING_VALID_YEARS = Number(import.meta.env.VITE_CHILD_SAFETY_TRAINING_VALID_YEARS || 2)
const MANDATED_REPORTER_TRAINING_VALID_YEARS = Number(import.meta.env.VITE_MANDATED_REPORTER_TRAINING_VALID_YEARS || 1)

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
}

interface AdditionalRequirement {
  title: string
  description: string
  link?: string
  linkText?: string
  fieldName?: string
}

const userName = ref('Volunteer')
const isLoading = ref(true)
const isAuthenticated = ref(false)
const activeTeams = ref<string[]>([])
const completedTeams = ref<string[]>([])
const personData = ref<any>(null)
const fieldDefinitions = ref<any[]>([])
const fieldData = ref<any[]>([])

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
 * Helper function to get field value by field name
 */
function getFieldValue(fieldName: string): any {
  // Find the field definition by name
  const fieldDef = fieldDefinitions.value.find((def: any) =>
    def.attributes.name === fieldName
  )

  if (!fieldDef) {
    return null
  }

  // Find the field data that matches this definition ID
  const field = fieldData.value.find((data: any) =>
    data.relationships?.field_definition?.data?.id === fieldDef.id
  )

  return field?.attributes?.value || null
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
 * Dynamically generate steps based on team requirements
 */
const steps = computed((): Step[] => {
  if (!personData.value) return []

  const active = activeTeams.value
  const completed = completedTeams.value

  if (active.length === 0) {
    return []
  }

  const required: RequiredSteps = getRequiredSteps(active, completed)
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
      link: 'https://riverchristianchurch.churchcenter.com/people/forms/818825',
      linkText: 'Complete Declaration Form',
      action: 'external',
      fieldName: 'Declaration Submitted',
      completed: isReviewed,
      pending: isSubmitted && !isReviewed
    })
  }

  // Step 2: Background Check Application (only if required)
  if (required.backgroundCheck) {
    const bgSubmitted = getFieldValue('Background Check Application Submitted')
    const bgPassed = personData.value.attributes.passed_background_check === true
    const isSubmitted = bgSubmitted === 'Yes' || bgSubmitted === 'true' || bgSubmitted === true

    stepsList.push({
      id: stepsList.length + 1,
      title: 'Background Check Application',
      description: 'Follow this link to submit your personal background check information. After submitting, click the button below to mark as submitted. (This procedure needs to be completed every 2 years.)',
      link: 'https://ministryopportunities.org/RCCFI',
      linkText: 'Submit Background Check Application',
      action: 'submit',
      fieldName: 'Background Check Application Submitted',
      completed: bgPassed,
      pending: isSubmitted && !bgPassed
    })
  }

  // Step 3: Child Safety Training (only if required)
  if (required.childSafety) {
    const submitted = getFieldValue('Child Safety Training Submitted')
    const lastCompleted = getFieldValue('Child Safety Training Last Completed')
    const isValid = isWithinYears(lastCompleted, CHILD_SAFETY_TRAINING_VALID_YEARS)
    const isSubmitted = submitted === 'Yes' || submitted === 'true' || submitted === true

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
    const submitted = getFieldValue('Mandated Reporter Training Submitted')
    const lastCompleted = getFieldValue('Mandated Reporter Training Last Completed')
    const isValid = isWithinYears(lastCompleted, MANDATED_REPORTER_TRAINING_VALID_YEARS)
    const isSubmitted = submitted === 'Yes' || submitted === 'true' || submitted === true

    stepsList.push({
      id: stepsList.length + 1,
      title: 'Mandated Reporter Training',
      description: `Complete the mandated reporter training online. This training is valid for ${MANDATED_REPORTER_TRAINING_VALID_YEARS} year and must be renewed annually.`,
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

  const required: RequiredSteps = getRequiredSteps(activeTeams.value, completedTeams.value)
  const additional: AdditionalRequirement[] = []

  if (required.welcomeToRCC) {
    additional.push({
      title: 'Attend Welcome to RCC',
      description: 'Completion of Welcome to RCC is required for your role.',
      link: 'https://riverchristianchurch.churchcenter.com/registrations/events/category/94241',
      linkText: 'View Schedule',
      fieldName: 'Completion of Welcome to RCC'
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
      teamText = teamNames[0]
    } else if (teamNames.length === 2) {
      teamText = `${teamNames[0]} and ${teamNames[1]}`
    } else {
      teamText = teamNames.slice(0, -1).join(', ') + ', and ' + teamNames[teamNames.length - 1]
    }

    additional.push({
      title: 'RCC Membership',
      description: `Volunteers who serve on the ${teamText} ${teamNames.length === 1 ? 'Team are' : 'Teams are'} expected to be members of River Christian Church. You can ask questions and learn all about the process by attending Welcome to RCC.`,
      fieldName: 'RCC Membership'
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

onMounted(async () => {
  const session = getSession()

  if (!session) {
    isLoading.value = false
    return
  }

  isAuthenticated.value = true

  // Refresh user data to get latest field information
  const freshData = await refreshUserData()
  const userData = freshData || session.user

  // Extract user name from PCO data
  personData.value = userData.data
  userName.value = personData.value.attributes.first_name || 'Volunteer'

  // Extract custom fields and field definitions from included data
  const included = userData.included || []

  // Field data comes from relationships, not included
  const fieldDataRelationship = userData.data.relationships?.field_data?.data || []
  fieldData.value = Array.isArray(fieldDataRelationship) ? fieldDataRelationship : []

  // Field definitions come from included
  fieldDefinitions.value = included.filter((item: any) => item.type === 'FieldDefinition')

  console.log('Field definitions loaded:', fieldDefinitions.value.length)
  console.log('All field names:', fieldDefinitions.value.map((f: any) => f.attributes.name))

  // Get active teams (Onboarding In Progress For)
  const activeTeamsValue = getFieldValue('Onboarding In Progress For')
  activeTeams.value = parseMultiSelectValue(activeTeamsValue)

  // Get completed teams (Onboarding Completed For)
  const completedTeamsValue = getFieldValue('Onboarding Completed For')
  completedTeams.value = parseMultiSelectValue(completedTeamsValue)

  console.log('Active teams:', activeTeams.value)
  console.log('Completed teams:', completedTeams.value)

  // Debug covenant fields
  console.log('Public Presence Policy Signed:', getFieldValue('Public Presence Policy Signed'))
  console.log('Moral Conduct Policy Signed:', getFieldValue('Moral Conduct Policy Signed'))
  console.log('Covenant Signed:', getFieldValue('Covenant Signed'))

  isLoading.value = false
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

    // Refresh user data to get updated field values
    await refreshUserData()
    location.reload() // Reload to show updated status
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
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-5xl mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">RCC Volunteer Onboarding</h1>
            <p class="text-sm text-gray-600 mt-1">River Christian Church</p>
          </div>
          <button
            @click="handleLogout"
            class="text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-5xl mx-auto px-6 py-12">
      <!-- Welcome Section -->
      <div class="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-100">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">
          Hello, {{ userName }}!
        </h2>
        <div class="prose prose-lg max-w-none text-gray-700">
          <p class="mb-4">
            Thank you for taking the necessary steps to getting involved at RCC. Your time and service are so appreciated and because of volunteers like you, we are able to reach more for Christ.
          </p>
          <p class="mb-4">
            Safety is our top priority, so every adult volunteer that may work around kids must complete a background check and the online child safety training prior to volunteering.
          </p>
        </div>

        <!-- Show active teams -->
        <div v-if="activeTeams.length > 0" class="mt-6 p-4 bg-blue-50 rounded-lg">
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
        <div v-else class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p class="text-yellow-800 font-medium">
            No teams selected for onboarding. Please contact the church office to get started.
          </p>
        </div>
      </div>

      <!-- Progress Overview (only if there are steps) -->
      <div v-if="steps.length > 0" class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-gray-900">Your Progress</h3>
          <span class="text-sm font-medium text-gray-600">
            {{ steps.filter(s => s.completed).length }} of {{ steps.length }} completed
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-gradient-to-r from-blue-600 to-blue-500 h-3 rounded-full transition-all duration-500"
            :style="{ width: `${(steps.filter(s => s.completed).length / steps.length) * 100}%` }"
          ></div>
        </div>
      </div>

      <!-- Steps -->
      <div v-if="steps.length > 0" class="space-y-6 mb-12">
        <div
          v-for="step in steps"
          :key="step.id"
          class="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden border border-gray-200"
        >
          <div class="p-6">
            <div class="flex items-start gap-4">
              <!-- Step Number/Checkmark/Pending -->
              <div class="flex-shrink-0">
                <!-- Completed -->
                <div
                  v-if="step.completed"
                  class="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center"
                >
                  <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <!-- Pending -->
                <div
                  v-else-if="step.pending"
                  class="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center"
                >
                  <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <!-- Not started -->
                <div
                  v-else
                  class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md"
                >
                  {{ step.id }}
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-2">
                  <h4 class="text-xl font-bold text-gray-900">
                    Step {{ step.id }} - {{ step.title }}
                  </h4>
                  <span
                    v-if="step.completed"
                    class="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full"
                  >
                    Completed
                  </span>
                  <template v-else-if="step.pending">
                    <span class="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                      Submitted
                    </span>
                    <span class="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                      Pending Review
                    </span>
                  </template>
                </div>

                <p class="text-gray-700 mb-4 leading-relaxed">
                  {{ step.description }}
                </p>

                <div v-if="step.completedDate" class="text-sm text-gray-500 mb-3">
                  Completed on {{ step.completedDate }}
                </div>

                <div v-if="step.email && !step.completed && !step.pending" class="mb-3">
                  <span class="text-sm text-gray-600">
                    Watch for email from: <span class="font-medium text-gray-900">{{ step.email }}</span>
                  </span>
                </div>

                <!-- Buttons for incomplete steps -->
                <div v-if="!step.completed && !step.pending" class="flex gap-3 flex-wrap">
                  <!-- External link button -->
                  <a
                    v-if="step.link"
                    :href="step.link"
                    target="_blank"
                    class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <span>{{ step.linkText }}</span>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                    </svg>
                  </a>

                  <!-- Mark as submitted button -->
                  <button
                    v-if="step.action === 'submit'"
                    @click="handleMarkSubmitted(step)"
                    class="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span>Mark as Submitted</span>
                  </button>
                </div>

                <!-- Pending message -->
                <div v-if="step.pending" class="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg">
                  Your submission is pending review. We'll update your status once it's been processed.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Additional Requirements Section -->
      <div v-if="additionalRequirements.length > 0" class="mb-12">
        <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-8 border border-purple-100">
          <h3 class="text-2xl font-bold text-gray-900 mb-3">Additional Requirements</h3>
          <p class="text-gray-600 mb-6">
            Based on your selected team(s), you may also need to complete the following:
          </p>

          <div class="space-y-4">
            <div
              v-for="(req, index) in additionalRequirements"
              :key="index"
              class="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm"
            >
              <svg class="w-6 h-6 text-purple-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div class="flex-1">
                <h4 class="font-bold text-gray-900 mb-1">{{ req.title }}</h4>
                <p class="text-sm text-gray-600 mb-2">{{ req.description }}</p>
                <a
                  v-if="req.link"
                  :href="req.link"
                  target="_blank"
                  class="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <span>{{ req.linkText }}</span>
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </a>
              </div>
            </div>
          </div>
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
