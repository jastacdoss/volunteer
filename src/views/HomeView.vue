<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSession, initiateLogin, logout } from '@/lib/auth'

interface Step {
  id: number
  title: string
  description: string
  link?: string
  linkText?: string
  completed: boolean
  completedDate?: string
  email?: string
}

const steps = ref<Step[]>([
  {
    id: 1,
    title: 'Declaration Form',
    description: 'This Declaration form must be completed and submitted before moving onto step 2.',
    link: 'https://fs11.formsite.com/OF5Zls/zbtttxycs9/index',
    linkText: 'Complete Declaration Form',
    completed: false
  },
  {
    id: 2,
    title: 'Background Check',
    description: 'Follow this link to submit your personal background check information. (This procedure needs to be completed every 2 years.)',
    link: 'https://ministryopportunities.org/RCCFI',
    linkText: 'Submit Background Check',
    completed: false
  },
  {
    id: 3,
    title: 'Child Safety Training',
    description: 'Expect an email from Message@protectingourkids.com for the kid\'s safety training. This should come to your email 1-2 days after completing the background check. The training consists of multiple online videos. At the end of all the videos is a quick quiz, 70% or higher is considered passing. You will have 2 weeks to complete this training before the link expires.',
    email: 'Message@protectingourkids.com',
    completed: false
  },
  {
    id: 4,
    title: 'Covenant and Reference Forms',
    description: 'Read and sign this Covenant and Reference form for this ministry. Once completed, email them to admin@riverchristian.church.',
    link: 'mailto:admin@riverchristian.church',
    linkText: 'Email Forms to Admin',
    completed: false
  },
  {
    id: 5,
    title: 'Welcome to RCC Class',
    description: 'If you have not already attended the Welcome to RCC class, please register for the next class available.',
    link: '#',
    linkText: 'View Schedule',
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

  // Extract user name from PCO data
  const personData = session.user.data
  userName.value = personData.attributes.first_name || 'Volunteer'

  // Extract custom fields from included field_data
  const fieldData = session.user.included?.filter((item: any) => item.type === 'FieldDatum') || []

  // Map field data to completion status
  // TODO: Update these field names to match your actual PCO custom fields
  fieldData.forEach((field: any) => {
    const fieldName = field.attributes.field_definition_id
    const value = field.attributes.value

    // Example: Check if steps are completed based on custom field values
    // You'll need to map these to your actual field definition IDs
    // For now, leaving as TODO
  })

  isLoading.value = false
})

function handleLogin() {
  initiateLogin()
}

function handleLogout() {
  logout()
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
              <!-- Step Number/Checkmark -->
              <div class="flex-shrink-0">
                <div
                  v-if="step.completed"
                  class="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center"
                >
                  <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
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
                </div>

                <p class="text-gray-700 mb-4 leading-relaxed">
                  {{ step.description }}
                </p>

                <div v-if="step.completedDate" class="text-sm text-gray-500 mb-3">
                  Completed on {{ step.completedDate }}
                </div>

                <div v-if="step.email && !step.completed" class="mb-3">
                  <span class="text-sm text-gray-600">
                    Watch for email from: <span class="font-medium text-gray-900">{{ step.email }}</span>
                  </span>
                </div>

                <div v-if="step.link && !step.completed">
                  <a
                    :href="step.link"
                    target="_blank"
                    class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    <span>{{ step.linkText }}</span>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                    </svg>
                  </a>
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
