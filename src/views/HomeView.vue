<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSession, initiateLogin, logout, refreshUserData } from '@/lib/auth'

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
}

const steps = ref<Step[]>([
  {
    id: 1,
    title: 'Declaration Form',
    description: 'This Declaration form must be completed and submitted before moving onto step 2.',
    link: 'https://riverchristianchurch.churchcenter.com/people/forms/818825',
    linkText: 'Complete Declaration Form',
    action: 'external',
    fieldName: 'Declaration',
    completed: false
  },
  {
    id: 2,
    title: 'Background Check Application',
    description: 'Follow this link to submit your personal background check information. After submitting, click the button below to mark as submitted. (This procedure needs to be completed every 2 years.)',
    link: 'https://ministryopportunities.org/RCCFI',
    linkText: 'Submit Background Check Application',
    action: 'submit',
    fieldName: 'Background Check Application Submitted',
    completed: false,
    pending: false
  },
  {
    id: 3,
    title: 'Covenant',
    description: 'Read and sign the Covenant form for Kids ministry. Once completed, email it to admin@riverchristian.church.',
    link: 'mailto:admin@riverchristian.church',
    linkText: 'Email Covenant to Admin',
    action: 'external',
    fieldName: 'Covenants',
    completed: false
  },
  {
    id: 4,
    title: 'References',
    description: 'Submit your reference forms using the link below. Our admin team will review and verify your references.',
    link: 'https://riverchristianchurch.churchcenter.com/people/forms/982853',
    linkText: 'Submit References Form',
    action: 'external',
    fieldName: 'References Checked',
    completed: false
  }
])

const userName = ref('Volunteer')
const isLoading = ref(true)
const isAuthenticated = ref(false)

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
  const personData = userData.data
  userName.value = personData.attributes.first_name || 'Volunteer'

  // Extract custom fields and field definitions from included data
  const included = userData.included || []

  // Field data comes from relationships, not included
  const fieldDataRelationship = userData.data.relationships?.field_data?.data || []
  const fieldData = Array.isArray(fieldDataRelationship) ? fieldDataRelationship : []

  // Field definitions come from included
  const fieldDefinitions = included.filter((item: any) => item.type === 'FieldDefinition')

  // Debug: Log all field definitions to see what's available
  console.log('Available field definitions:', fieldDefinitions.map((def: any) => ({
    id: def.id,
    name: def.attributes.name,
    tab: def.attributes.tab_name
  })))

  // Debug: Log all field data values
  console.log('Field data values:', fieldData.map((data: any) => ({
    field_definition_id: data.relationships?.field_definition?.data?.id,
    value: data.attributes.value
  })))

  // Helper function to get field value by field name
  const getFieldValue = (fieldName: string) => {
    // Find the field definition by name
    const fieldDef = fieldDefinitions.find((def: any) =>
      def.attributes.name === fieldName
    )

    if (!fieldDef) {
      console.log(`Field "${fieldName}" not found in definitions`)
      return null
    }

    console.log(`Found field definition for "${fieldName}":`, fieldDef.id)

    // Find the field data that matches this definition ID
    const field = fieldData.find((data: any) =>
      data.relationships?.field_definition?.data?.id === fieldDef.id
    )

    const value = field?.attributes?.value || null
    console.log(`Field "${fieldName}" value:`, value)

    return value
  }

  // Map field data to completion status for each step
  steps.value.forEach((step, index) => {
    if (!step.fieldName) return

    const fieldValue = getFieldValue(step.fieldName)

    // Default to not completed if field value is null/undefined
    if (fieldValue === null || fieldValue === undefined) {
      step.completed = false
      step.pending = false
      return
    }

    // Step 1: Declaration - boolean field
    if (step.fieldName === 'Declaration') {
      step.completed = fieldValue === 'true' || fieldValue === true
    }

    // Step 2: Background Check Application Submitted - boolean field
    // Shows as "pending" (yellow) until background check is actually valid
    else if (step.fieldName === 'Background Check Application Submitted') {
      const isSubmitted = fieldValue === 'true' || fieldValue === true
      if (isSubmitted) {
        // Check if background check is actually valid (from person attributes)
        const bgCheckValid = personData.attributes.passed_background_check === true
        if (bgCheckValid) {
          step.completed = true
          step.pending = false
        } else {
          step.completed = false
          step.pending = true // Yellow state
        }
      } else {
        step.completed = false
        step.pending = false
      }
    }

    // Step 3: Covenants - multi-select field, check for "Kids"
    else if (step.fieldName === 'Covenants') {
      // Covenants is a multi-select, value might be a string or array
      if (typeof fieldValue === 'string') {
        step.completed = fieldValue.includes('Kids')
      } else if (Array.isArray(fieldValue)) {
        step.completed = fieldValue.includes('Kids')
      } else {
        step.completed = false
      }
    }

    // Step 4: References Checked - boolean field
    else if (step.fieldName === 'References Checked') {
      step.completed = fieldValue === 'true' || fieldValue === true
    }
  })

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
        value: true,
      }),
    })

    console.log('Response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Update failed:', errorData)
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
          <p class="text-sm text-gray-600">
            If you have already completed any of these procedures with other ministries, please contact
            <a href="mailto:admin@riverchristian.church" class="text-blue-600 hover:text-blue-700 font-medium">admin@riverchristian.church</a>
            so we can verify we have what's needed on file.
          </p>
        </div>
      </div>

      <!-- Progress Overview -->
      <div class="mb-8">
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
      <div class="space-y-6">
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
                  <span
                    v-else-if="step.pending"
                    class="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full"
                  >
                    Pending Review
                  </span>
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

                  <!-- Mark as submitted button (only for Background Check) -->
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

                  <!-- Pending button (for Safety Training) -->
                  <button
                    v-if="step.action === 'pending-only'"
                    disabled
                    class="inline-flex items-center gap-2 px-6 py-3 bg-gray-400 text-white font-semibold rounded-lg cursor-not-allowed shadow-md"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span>Pending</span>
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

      <!-- Footer Contact -->
      <div class="mt-12 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl shadow-lg p-8 text-white">
        <h3 class="text-2xl font-bold mb-4">Questions or Need Help?</h3>
        <p class="mb-4 text-blue-50">
          Let us know if you have any questions or issues opening any of the documents or websites. Thank you for serving!
        </p>
        <div class="space-y-2 text-blue-50">
          <p class="font-semibold text-white">Sincerely,</p>
          <p>Cathy Reigner & Heather Lynn</p>
          <p>RCC Office Admin</p>
          <a href="mailto:admin@riverchristian.church" class="inline-block mt-3 text-white hover:text-blue-100 font-semibold underline">
            admin@riverchristian.church
          </a>
        </div>
      </div>
    </main>
  </div>
</template>
