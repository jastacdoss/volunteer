<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSession } from '@/lib/auth'
import { loadTeamRequirements, getRequiredSteps, getTeamDisplayName, type RequiredSteps } from '@/lib/teamMatrix'
import OnboardingSteps from '@/components/OnboardingSteps.vue'
import AdditionalRequirements from '@/components/AdditionalRequirements.vue'

const router = useRouter()
const route = useRoute()
const isLoading = ref(true)
const personData = ref<any>(null)
const fieldDefinitions = ref<any[]>([])
const fieldData = ref<any[]>([])
const emails = ref<any[]>([])
const phones = ref<any[]>([])
const volunteerName = ref('')
const primaryEmail = ref('')
const primaryPhone = ref('')
const selectedTab = ref<string | null>(null)
const backgroundChecks = ref<any[]>([])

const personId = route.params.id as string

// Helper to get field value
function getFieldValue(fieldName: string): any {
  const fieldDef = fieldDefinitions.value.find((def: any) =>
    def.attributes.name === fieldName
  )

  if (!fieldDef) return null

  const field = fieldData.value.find((data: any) =>
    data.relationships?.field_definition?.data?.id === fieldDef.id
  )

  return field?.attributes?.value || null
}

// Parse multi-select field value (same as HomeView)
function parseMultiSelectValue(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    // Handle comma-separated or newline-separated strings
    return value.split(/[,\n]/).map(v => v.trim()).filter(v => v.length > 0)
  }
  return []
}

// Get active and completed teams (computed properties, not refs)
const activeTeams = computed(() => {
  const activeTeamsValue = getFieldValue('Onboarding In Progress For')
  console.log('🔍 Active Teams Value:', activeTeamsValue, 'Field Data Count:', fieldData.value.length)
  return parseMultiSelectValue(activeTeamsValue)
})

const completedTeams = computed(() => {
  const completedTeamsValue = getFieldValue('Onboarding Completed For')
  console.log('🔍 Completed Teams Value:', completedTeamsValue)

  // Debug: Show all field names
  if (fieldData.value.length > 0) {
    const fieldNames = fieldData.value.map((fd: any) => {
      const fieldDefId = fd.relationships?.field_definition?.data?.id
      const fieldDef = personData.value?.included?.find((item: any) =>
        item.type === 'FieldDefinition' && item.id === fieldDefId
      )
      return `${fieldDef?.attributes?.name} = ${fd.attributes?.value}`
    })
    console.log('📋 All fields:', fieldNames)
  }

  return parseMultiSelectValue(completedTeamsValue)
})

// All teams with their status (for tabs)
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

// Helper function to get current background check
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

// Helper to check expiration
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

// Helper to format dates
function formatDate(dateString: string | null): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

// Check if date is within X years
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

// Get environment variables
const CHILD_SAFETY_TRAINING_VALID_YEARS = 2
const MANDATED_REPORTER_TRAINING_VALID_YEARS = 1

// Calculate steps (same as HomeView)
const steps = computed(() => {
  // Show steps if there are either active OR completed teams
  if (!personData.value || (activeTeams.value.length === 0 && completedTeams.value.length === 0)) return []

  // Filter by selected team
  // For leader view, we need to show requirements for both active AND completed teams
  // So we treat the selected tab as "active" to get its requirements
  const isActiveTab = selectedTab.value && activeTeams.value.includes(selectedTab.value)
  const isCompletedTab = selectedTab.value && completedTeams.value.includes(selectedTab.value)

  const active = isActiveTab && selectedTab.value ? [selectedTab.value] : []
  const completed = isCompletedTab && selectedTab.value ? [selectedTab.value] : []

  // For completed tabs, we still need to get the requirements to show what was needed
  // So we pass the completed team as if it were active
  const teamsForRequirements = ((isActiveTab || isCompletedTab) && selectedTab.value) ? [selectedTab.value] : []

  const required: RequiredSteps = getRequiredSteps(teamsForRequirements, [])
  const stepsList: any[] = []

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

  // Step 2: Background Check (only if required) - Using BackgroundCheck API
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

    const bgStep: any = {
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

// Additional requirements (same as HomeView)
const additionalRequirements = computed(() => {
  if (!personData.value || (activeTeams.value.length === 0 && completedTeams.value.length === 0)) return []

  // For leader view, show requirements for both active AND completed teams
  const isActiveTab = selectedTab.value && activeTeams.value.includes(selectedTab.value)
  const isCompletedTab = selectedTab.value && completedTeams.value.includes(selectedTab.value)

  // Pass selected tab as "active" to get its requirements
  const teamsForRequirements = ((isActiveTab || isCompletedTab) && selectedTab.value) ? [selectedTab.value] : []

  const required: RequiredSteps = getRequiredSteps(teamsForRequirements, [])
  const additional: any[] = []

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
    const isMember = personData.value.attributes.membership === 'Member'
    additional.push({
      title: 'RCC Membership',
      description: 'Membership at River Christian Church is required for your role. You can ask questions and learn all about the process by attending Welcome to RCC.',
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

// Load volunteer data
async function loadVolunteerData() {
  const session = getSession()
  if (!session) {
    router.push('/')
    return
  }

  try {
    await loadTeamRequirements()

    const response = await fetch(`/api/leader/volunteer/${personId}`, {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to load volunteer data')
    }

    const data = await response.json()

    personData.value = data.userData.data
    fieldDefinitions.value = data.userData.included?.filter((item: any) => item.type === 'FieldDefinition') || []

    // The API endpoint returns FieldDatum objects directly in relationships.field_data.data
    // (not references like in the normal PCO API)
    fieldData.value = data.userData.data.relationships?.field_data?.data || []

    emails.value = data.emails || []
    phones.value = data.phones || []

    console.log('✅ Loaded field data count:', fieldData.value.length)
    console.log('📦 Field data:', fieldData.value)
    console.log('📦 Field definitions:', fieldDefinitions.value)

    volunteerName.value = personData.value.attributes.name
    primaryEmail.value = emails.value.find((e: any) => e.attributes.primary)?.attributes.address ||
                        emails.value[0]?.attributes.address ||
                        'No email on file'
    primaryPhone.value = phones.value.find((p: any) => p.attributes.primary)?.attributes.number ||
                        phones.value[0]?.attributes.number ||
                        'No phone on file'

    // Fetch background checks
    try {
      const bgResponse = await fetch(`/api/leader/volunteer/${personId}/background-checks`, {
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

  } catch (error) {
    console.error('Failed to load volunteer data:', error)
    router.push('/leader')
  } finally {
    isLoading.value = false
  }
}

const completedStepsCount = computed(() => {
  return steps.value.filter(step => step.completed).length
})

const totalStepsCount = computed(() => {
  return steps.value.length
})

const progressPercentage = computed(() => {
  if (totalStepsCount.value === 0) return 0
  return Math.round((completedStepsCount.value / totalStepsCount.value) * 100)
})

onMounted(async () => {
  await loadVolunteerData()
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center gap-4">
          <button
            @click="router.push('/leader')"
            class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
          </button>
          <h1 class="text-2xl font-bold text-gray-900">Volunteer Onboarding</h1>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p class="text-gray-600">Loading volunteer data...</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="max-w-5xl mx-auto px-6 py-12">
      <!-- Volunteer Info Card -->
      <div class="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-100">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">{{ volunteerName }}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p class="text-sm text-gray-500 mb-1">Email</p>
            <p class="font-semibold text-gray-900">{{ primaryEmail }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-500 mb-1">Phone</p>
            <p class="font-semibold text-gray-900">{{ primaryPhone }}</p>
          </div>
        </div>
      </div>

      <!-- No teams selected message -->
      <div v-if="activeTeams.length === 0 && completedTeams.length === 0" class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p class="text-yellow-800 font-medium">
          No teams selected for onboarding.
        </p>
      </div>

      <!-- Tabbed Interface and Content Window -->
      <div v-else>
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
          <h3 class="text-xl font-bold text-gray-900">Progress</h3>
          <span class="text-sm font-medium text-gray-600">
            {{ completedStepsCount }} of {{ totalStepsCount }} completed
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div
            class="bg-gradient-to-r from-blue-600 to-blue-500 h-3 rounded-full transition-all duration-500"
            :style="{ width: `${progressPercentage}%` }"
          ></div>
        </div>
      </div>

      <!-- Steps Section (using OnboardingSteps component) -->
      <div v-if="steps.length > 0" class="mb-12">
        <OnboardingSteps :steps="steps" :readonly="true" />
      </div>

      <!-- Additional Requirements Section (using AdditionalRequirements component) -->
      <div v-if="additionalRequirements.length > 0" class="mb-12">
        <AdditionalRequirements :requirements="additionalRequirements" />
      </div>
        </div>
      </div>
    </div>
  </div>
</template>
