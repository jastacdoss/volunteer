<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { getSession, checkPermissions } from '@/lib/auth'
import { getTeamDisplayName } from '@/lib/teamMatrix'
import AppHeader from '@/components/AppHeader.vue'

interface BackgroundCheck {
  status: string
  completedAt: string | null
  createdAt: string | null
  expiresOn: string | null
}

interface VolunteerFields {
  declaration: string | null
  declarationSubmitted: string | null
  welcomeToRCC: string | null
  childSafety: string | null
  childSafetySubmitted: string | null
  mandatedReporter: string | null
  mandatedReporterSubmitted: string | null
  references: string | null
  referencesSubmitted: string | null
  membership: string | null
  covenantSigned: string | null
  moralConduct: string | null
  publicPresence: string | null
}

interface RequiredFields {
  declaration: boolean
  welcomeToRCC: boolean
  childSafety: boolean
  mandatedReporter: boolean
  references: boolean
  backgroundCheck: boolean
  membership: boolean
  covenant: boolean
  moralConduct: boolean
  publicPresence: boolean
}

interface Volunteer {
  id: string
  name: string
  email: string
  avatar: string
  teams: string[]
  fields: VolunteerFields
  backgroundCheck: BackgroundCheck | null
  requiredFields: RequiredFields
  covenantLevel: number
  progress: {
    completed: number
    total: number
  }
}

const router = useRouter()
const isLoading = ref(true)
const isLeader = ref(false)
const isAdmin = ref(false)
const leaderName = ref('')
const leaderEmail = ref('')
const leaderId = ref('')
const ministries = ref<string[]>([])
const selectedTab = ref<string | null>(null)
const volunteers = ref<Volunteer[]>([])

// Loading states for buttons
const isSubmittingReferences = ref(false)
const isCompletingOnboarding = ref(false)

// References modal state
interface Reference {
  name: string
  phone: string
  email: string
  relationship: string
}

const showReferencesModal = ref(false)
const currentVolunteerForReferences = ref<Volunteer | null>(null)
const referencesData = ref<Reference[]>([])
const isLoadingReferences = ref(false)

// Complete onboarding modal state
const showCompleteModal = ref(false)
const volunteerToComplete = ref<Volunteer | null>(null)

// Field status helpers
type FieldStatus = 'empty' | 'pending_user' | 'pending_admin' | 'complete'

// For Declaration field
function getDeclarationStatus(volunteer: Volunteer): FieldStatus {
  const submitted = volunteer.fields.declarationSubmitted
  const reviewed = volunteer.fields.declaration

  if (!submitted || submitted === 'No') return 'pending_user'
  if (reviewed) return 'complete'
  return 'pending_admin'
}

// For Background Check only (separated from Declaration)
function getBackgroundCheckStatus(volunteer: Volunteer): FieldStatus {
  const bgCheck = volunteer.backgroundCheck

  // No background check: pending user
  if (!bgCheck) {
    return 'pending_user'
  }

  // Person icon: awaiting_applicant
  if (bgCheck.status === 'awaiting_applicant') {
    return 'pending_user'
  }

  // Hourglass: report_processing OR needs_review OR pending_review
  if (bgCheck.status === 'report_processing' || bgCheck.status === 'needs_review' || bgCheck.status === 'pending_review') {
    return 'pending_admin'
  }

  // Green check: manual_clear OR complete_clear
  if (bgCheck.status === 'manual_clear' || bgCheck.status === 'complete_clear') {
    return 'complete'
  }

  return 'pending_user'
}

// For References field
function getReferencesStatus(volunteer: Volunteer): FieldStatus {
  const submitted = volunteer.fields.referencesSubmitted
  const reviewed = volunteer.fields.references

  if (!submitted || submitted === 'No') return 'pending_user'
  if (reviewed) return 'complete'
  return 'pending_admin'
}

// For Child Safety field
function getChildSafetyStatus(volunteer: Volunteer): FieldStatus {
  const submitted = volunteer.fields.childSafetySubmitted
  const completed = volunteer.fields.childSafety

  // Yellow person: not submitted
  if (!submitted || submitted === 'No') return 'pending_user'

  // Orange clock: submitted but not reviewed/completed by admin
  if (submitted === 'true' && !completed) return 'pending_admin'

  // Green check: completed
  return 'complete'
}

// For Mandated Reporter field
function getMandatedReporterStatus(volunteer: Volunteer): FieldStatus {
  const submitted = volunteer.fields.mandatedReporterSubmitted
  const completed = volunteer.fields.mandatedReporter

  // Yellow person: not submitted
  if (!submitted || submitted === 'No') return 'pending_user'

  // Orange clock: submitted but not reviewed/completed by admin
  if (submitted === 'true' && !completed) return 'pending_admin'

  // Green check: completed
  return 'complete'
}

// For Covenant field
function getCovenantStatus(volunteer: Volunteer): FieldStatus {
  const level = volunteer.covenantLevel
  if (level === 0) return 'complete'
  if (level === 1 && volunteer.fields.covenantSigned) return 'complete'
  if (level === 2 && volunteer.fields.moralConduct) return 'complete'
  if (level === 3 && volunteer.fields.publicPresence) return 'complete'
  return 'pending_user'
}

// Status icon components
function getStatusIcon(status: FieldStatus) {
  if (status === 'pending_user') {
    // Yellow person icon
    return () => h('svg', { viewBox: '0 0 24 24', fill: 'none' }, [
      h('path', { d: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z', fill: '#EAB308' })
    ])
  }
  if (status === 'pending_admin') {
    // Orange clock icon
    return () => h('svg', { viewBox: '0 0 24 24', fill: 'none' }, [
      h('path', { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z', fill: '#F97316' })
    ])
  }
  if (status === 'complete') {
    // Green check icon
    return () => h('svg', { viewBox: '0 0 24 24', fill: 'none' }, [
      h('path', { d: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z', fill: '#22C55E' })
    ])
  }
  // Default empty state
  return () => h('svg', { viewBox: '0 0 24 24', fill: 'none' }, [
    h('circle', { cx: '12', cy: '12', r: '8', fill: '#D1D5DB' })
  ])
}

// Check if user is a leader
async function checkLeaderStatus() {
  console.log('[LeaderView] checkLeaderStatus called')
  const session = getSession()
  if (!session) {
    console.log('[LeaderView] No session, redirecting to /')
    router.push('/')
    return
  }

  // Store leader info from session
  leaderName.value = session.user?.data?.attributes?.name || 'Leader'
  leaderEmail.value = session.user?.data?.attributes?.login_identifier || ''
  leaderId.value = session.user?.data?.id || ''
  console.log('[LeaderView] Leader info:', { name: leaderName.value, email: leaderEmail.value, id: leaderId.value })

  try {
    console.log('[LeaderView] Checking leader status...')
    // Use cached permissions (or fetch if not cached)
    const permissions = await checkPermissions()

    isLeader.value = permissions.isLeader
    ministries.value = permissions.ministries
    isAdmin.value = permissions.isAdmin

    console.log('[LeaderView] isLeader:', isLeader.value, 'ministries:', ministries.value)
    console.log('[LeaderView] isAdmin:', isAdmin.value)

    if (!isLeader.value) {
      console.log('[LeaderView] Not a leader, redirecting to /')
      router.push('/')
      return
    }

    // Auto-select first ministry
    if (ministries.value.length > 0 && ministries.value[0]) {
      selectedTab.value = ministries.value[0]
      console.log('[LeaderView] Auto-selecting first ministry:', selectedTab.value)
      await loadVolunteers(ministries.value[0])
    } else {
      console.log('[LeaderView] No ministries found')
    }
  } catch (error) {
    console.error('[LeaderView] Failed to check leader status:', error)
    router.push('/')
  } finally {
    isLoading.value = false
  }
}

// Load volunteers for selected team
async function loadVolunteers(team: string) {
  console.log('[LeaderView] loadVolunteers called with team:', team)
  const session = getSession()
  if (!session || !team) {
    console.log('[LeaderView] No session or team in loadVolunteers')
    return
  }

  isLoading.value = true

  try {
    console.log('[LeaderView] Fetching /api/leader/volunteers/' + team)
    const response = await fetch(`/api/leader/volunteers/${encodeURIComponent(team)}`, {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    console.log('[LeaderView] Response status:', response.status)

    if (!response.ok) {
      throw new Error('Failed to load volunteers')
    }

    const data = await response.json()
    console.log('[LeaderView] Got volunteers:', data.volunteers?.length || 0)
    volunteers.value = data.volunteers || []
  } catch (error) {
    console.error('[LeaderView] Failed to load volunteers:', error)
    volunteers.value = []
  } finally {
    isLoading.value = false
  }
}

// Handle tab change
async function onTabChange(team: string) {
  selectedTab.value = team
  await loadVolunteers(team)
}

// View volunteer's onboarding
function viewVolunteer(volunteerId: string) {
  router.push(`/leader/volunteer/${volunteerId}`)
}

// Check if field is required for ANY volunteer in the current team
function isFieldRequired(field: keyof RequiredFields | 'covenant'): boolean {
  return volunteers.value.some(v => {
    if (field === 'covenant') return v.covenantLevel > 0
    return v.requiredFields[field]
  })
}

// Helper function to format phone numbers
function formatPhone(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return 'No phone'

  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '')

  // Format as (XXX) XXX-XXXX for 10-digit numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }

  // Format as +X (XXX) XXX-XXXX for 11-digit numbers (with country code)
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }

  // Return as-is if format doesn't match
  return phoneNumber
}

// Get covenant level for current team (max level across all volunteers)
const teamCovenantLevel = computed(() => {
  return Math.max(...volunteers.value.map(v => v.covenantLevel), 0)
})

// References review functions
async function openReferencesModal(volunteer: Volunteer) {
  currentVolunteerForReferences.value = volunteer
  showReferencesModal.value = true
  isLoadingReferences.value = true

  try {
    const response = await fetch(`/api/references/${volunteer.id}`)

    if (response.ok) {
      const data = await response.json()
      referencesData.value = data.references
    }
  } catch (error) {
    console.error('Failed to fetch references:', error)
  } finally {
    isLoadingReferences.value = false
  }
}

function closeReferencesModal() {
  showReferencesModal.value = false
  currentVolunteerForReferences.value = null
  referencesData.value = []
}

async function markReferencesAsReviewed() {
  if (!currentVolunteerForReferences.value) return

  const session = getSession()
  if (!session) return

  isSubmittingReferences.value = true

  try {
    console.log('[markReferencesAsReviewed] Starting...')
    const today = new Date().toISOString().split('T')[0]

    const response = await fetch('/api/admin/toggle-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        personId: currentVolunteerForReferences.value.id,
        fieldName: 'References Checked',
        value: today,
      }),
    })

    console.log('[markReferencesAsReviewed] Toggle response:', response.status)

    if (response.ok) {
      const result = await response.json()
      console.log('[markReferencesAsReviewed] Got result:', result)

      // Update the volunteer in the local list immediately
      if (result.volunteer) {
        const index = volunteers.value.findIndex(v => v.id === result.volunteer.id)
        if (index !== -1) {
          // Use splice to trigger Vue reactivity
          volunteers.value.splice(index, 1, result.volunteer)
          console.log('[markReferencesAsReviewed] Updated volunteer in list:', result.volunteer.fields.references)
        } else {
          console.log('[markReferencesAsReviewed] Volunteer not found in list, id:', result.volunteer.id)
        }
      } else {
        console.log('[markReferencesAsReviewed] No volunteer data in result')
      }

      // Close modal immediately
      closeReferencesModal()
      console.log('[markReferencesAsReviewed] Modal closed')
    } else {
      alert('Failed to mark references as reviewed. Please try again.')
    }
  } catch (error) {
    console.error('Failed to mark references as reviewed:', error)
    alert('Failed to mark references as reviewed. Please try again.')
  } finally {
    isSubmittingReferences.value = false
  }
}

// Complete onboarding functions
function openCompleteModal(volunteer: Volunteer) {
  volunteerToComplete.value = volunteer
  showCompleteModal.value = true
}

function closeCompleteModal() {
  showCompleteModal.value = false
  volunteerToComplete.value = null
}

async function confirmCompleteOnboarding() {
  if (!volunteerToComplete.value) return

  const session = getSession()
  if (!session || !selectedTab.value) return

  isCompletingOnboarding.value = true

  try {
    // Remove team from "Onboarding In Progress For" and add to "Onboarding Completed For"
    const response = await fetch('/api/admin/complete-onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        personId: volunteerToComplete.value.id,
        team: selectedTab.value,
      }),
    })

    if (response.ok) {
      const result = await response.json()
      // Remove volunteer from UI immediately
      volunteers.value = volunteers.value.filter(v => v.id !== result.personId)
      closeCompleteModal()
    } else {
      alert('Failed to complete onboarding. Please try again.')
    }
  } catch (error) {
    console.error('Failed to complete onboarding:', error)
    alert('Failed to complete onboarding. Please try again.')
  } finally {
    isCompletingOnboarding.value = false
  }
}

// Polling interval reference
let pollingInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await checkLeaderStatus()

  // Poll for updates every 30 seconds
  pollingInterval = setInterval(() => {
    if (selectedTab.value) {
      loadVolunteers(selectedTab.value)
    }
  }, 30 * 1000)
})

onUnmounted(() => {
  // Clean up polling interval
  if (pollingInterval) {
    clearInterval(pollingInterval)
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <AppHeader title="Leader Dashboard" />
    <!-- Loading State -->
    <div v-if="isLoading && !selectedTab" class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p class="text-gray-600">Loading...</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Leader Info Card -->
      <div class="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">{{ leaderName }}</h2>
            <p class="text-sm text-gray-500 mt-0.5">{{ leaderEmail }}</p>
          </div>
          <a
            :href="`https://people.planningcenteronline.com/people/${leaderId}`"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <span>View PCO Profile</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </a>
        </div>
      </div>

      <!-- No Teams -->
      <div v-if="ministries.length === 0" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No Teams</h3>
        <p class="mt-1 text-sm text-gray-500">You are not assigned as a leader for any teams</p>
      </div>

      <!-- Tabs -->
      <div v-else class="mb-6">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8 overflow-x-auto">
            <button
              v-for="ministry in ministries"
              :key="ministry"
              @click="onTabChange(ministry)"
              :class="[
                selectedTab === ministry
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors'
              ]"
            >
              {{ getTeamDisplayName(ministry) }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Volunteers Table -->
      <div v-if="selectedTab" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div v-if="volunteers.length === 0" class="px-6 py-12 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No Volunteers</h3>
          <p class="mt-1 text-sm text-gray-500">No volunteers are currently onboarding for this team</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="sticky left-0 z-10 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style="min-width: 280px;">
                  Name
                </th>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th v-if="isFieldRequired('declaration')" scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Declaration
                </th>
                <th v-if="isFieldRequired('backgroundCheck')" scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  BG Check
                </th>
                <th v-if="isFieldRequired('references')" scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  References
                </th>
                <th v-if="isFieldRequired('childSafety')" scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Child Safety
                </th>
                <th v-if="isFieldRequired('mandatedReporter')" scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mandated Reporter
                </th>
                <th v-if="teamCovenantLevel > 0" scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Covenant
                  <span v-if="teamCovenantLevel === 2" class="block text-xs font-normal text-gray-400">Level 2</span>
                  <span v-if="teamCovenantLevel === 3" class="block text-xs font-normal text-gray-400">Level 3</span>
                </th>
                <th scope="col" class="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Complete
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="volunteer in volunteers" :key="volunteer.id" class="hover:bg-gray-50 transition-colors">
                <!-- Name (Sticky) -->
                <td class="sticky left-0 z-10 bg-white px-6 py-4 border-r border-gray-200" style="min-width: 280px;">
                  <div class="flex items-center gap-3">
                    <img
                      v-if="volunteer.avatar"
                      :src="volunteer.avatar"
                      :alt="volunteer.name"
                      class="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    >
                    <div
                      v-else
                      class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0"
                    >
                      {{ volunteer.name.charAt(0).toUpperCase() }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-900">{{ volunteer.name }}</span>
                        <a
                          :href="`https://people.planningcenteronline.com/people/${volunteer.id}`"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-blue-600 hover:text-blue-700 transition-colors"
                          title="View in Planning Center"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                          </svg>
                        </a>
                      </div>
                      <div class="text-xs text-gray-500">{{ volunteer.email || 'No email' }}</div>
                      <div class="text-xs text-gray-500">{{ formatPhone(volunteer.phone) }}</div>
                    </div>
                  </div>
                </td>

                <!-- Progress -->
                <td class="px-3 py-4 whitespace-nowrap">
                  <div class="flex items-center gap-3">
                    <div class="flex-1">
                      <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-gray-600">{{ volunteer.progress.completed }} / {{ volunteer.progress.total }}</span>
                      </div>
                      <div class="w-full bg-gray-200 rounded-full h-2">
                        <div
                          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          :style="{ width: `${(volunteer.progress.completed / volunteer.progress.total) * 100}%` }"
                        ></div>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Declaration -->
                <td v-if="isFieldRequired('declaration')" class="px-2 py-4 whitespace-nowrap text-center">
                  <div v-if="!volunteer.requiredFields.declaration" class="text-gray-400 text-sm">
                    N/A
                  </div>
                  <div v-else class="flex justify-center">
                    <component :is="getStatusIcon(getDeclarationStatus(volunteer))" class="w-6 h-6" />
                  </div>
                </td>

                <!-- BG Check -->
                <td v-if="isFieldRequired('backgroundCheck')" class="px-2 py-4 whitespace-nowrap text-center">
                  <div v-if="!volunteer.requiredFields.backgroundCheck" class="text-gray-400 text-sm">
                    N/A
                  </div>
                  <div v-else class="flex justify-center">
                    <component :is="getStatusIcon(getBackgroundCheckStatus(volunteer))" class="w-6 h-6" />
                  </div>
                </td>

                <!-- References -->
                <td v-if="isFieldRequired('references')" class="px-2 py-4 whitespace-nowrap text-center">
                  <div v-if="!volunteer.requiredFields.references" class="text-gray-400 text-sm">
                    N/A
                  </div>
                  <div v-else-if="getReferencesStatus(volunteer) === 'pending_admin'" class="flex justify-center">
                    <button
                      @click="openReferencesModal(volunteer)"
                      class="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    >
                      Review
                    </button>
                  </div>
                  <div v-else class="flex justify-center">
                    <component :is="getStatusIcon(getReferencesStatus(volunteer))" class="w-6 h-6" />
                  </div>
                </td>
                <!-- Child Safety -->
                <td v-if="isFieldRequired('childSafety')" class="px-2 py-4 whitespace-nowrap text-center">
                  <div v-if="!volunteer.requiredFields.childSafety" class="text-gray-400 text-sm">
                    N/A
                  </div>
                  <div v-else class="flex justify-center">
                    <component :is="getStatusIcon(getChildSafetyStatus(volunteer))" class="w-6 h-6" />
                  </div>
                </td>

                <!-- Mandated Reporter -->
                <td v-if="isFieldRequired('mandatedReporter')" class="px-2 py-4 whitespace-nowrap text-center">
                  <div v-if="!volunteer.requiredFields.mandatedReporter" class="text-gray-400 text-sm">
                    N/A
                  </div>
                  <div v-else class="flex justify-center">
                    <component :is="getStatusIcon(getMandatedReporterStatus(volunteer))" class="w-6 h-6" />
                  </div>
                </td>

                <!-- Covenant -->
                <td v-if="teamCovenantLevel > 0" class="px-2 py-4 whitespace-nowrap text-center">
                  <div v-if="volunteer.covenantLevel === 0" class="text-gray-400 text-sm">
                    N/A
                  </div>
                  <div v-else class="flex justify-center">
                    <component :is="getStatusIcon(getCovenantStatus(volunteer))" class="w-6 h-6" />
                  </div>
                </td>

                <!-- Complete -->
                <td class="px-2 py-4 whitespace-nowrap text-center">
                  <button
                    @click="openCompleteModal(volunteer)"
                    :disabled="volunteer.progress.completed < volunteer.progress.total"
                    class="inline-flex items-center px-4 py-2 border shadow-sm text-sm font-medium rounded-md transition-colors border-green-600 bg-green-600 text-white"
                    :class="volunteer.progress.completed >= volunteer.progress.total
                      ? 'hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                      : 'opacity-50 cursor-not-allowed'"
                  >
                    <svg v-if="volunteer.progress.completed >= volunteer.progress.total" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    Complete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- References Review Modal -->
  <div
    v-if="showReferencesModal"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center"
    @click.self="closeReferencesModal"
  >
    <div class="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-6 border-b">
        <h3 class="text-xl font-semibold text-gray-900">
          References for {{ currentVolunteerForReferences?.name }}
        </h3>
        <button
          @click="closeReferencesModal"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-6">
        <div v-if="isLoadingReferences" class="text-center py-8">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p class="mt-2 text-gray-600">Loading references...</p>
        </div>

        <div v-else-if="referencesData && referencesData.length > 0" class="space-y-6">
          <template v-for="(ref, index) in referencesData" :key="index">
            <div class="border-b pb-4 last:border-b-0">
              <h4 class="text-lg font-semibold text-gray-900 mb-3">Reference {{ index + 1 }}</h4>

              <div class="space-y-1">
                <!-- Name (Relationship) -->
                <div class="text-base text-gray-900">
                  <span class="font-medium">{{ ref.name || '(No name)' }}</span>
                  <span class="text-gray-600"> ({{ ref.relationship || 'No relationship' }})</span>
                </div>

                <!-- Email | Phone -->
                <div class="text-sm text-gray-700">
                  {{ ref.email || '(No email)' }}
                  <span class="text-gray-400 mx-2">|</span>
                  {{ ref.phone || '(No phone)' }}
                </div>
              </div>
            </div>
          </template>
        </div>

        <div v-else-if="!isLoadingReferences && (!referencesData || referencesData.length === 0)" class="text-center py-8 text-gray-500">
          No references submission found for this volunteer.
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
        <button
          @click="closeReferencesModal"
          :disabled="isSubmittingReferences"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
        >
          Close
        </button>
        <button
          @click="markReferencesAsReviewed"
          :disabled="isLoadingReferences || !referencesData || isSubmittingReferences"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {{ isSubmittingReferences ? 'Submitting...' : 'Mark References as Reviewed' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Complete Onboarding Modal -->
  <div
    v-if="showCompleteModal"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center"
    @click.self="closeCompleteModal"
  >
    <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-6 border-b">
        <h3 class="text-xl font-semibold text-gray-900">
          Complete Onboarding
        </h3>
        <button
          @click="closeCompleteModal"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-6">
        <p class="text-gray-700">
          Are you sure you want to mark <strong>{{ volunteerToComplete?.name }}</strong>'s onboarding as complete for <strong>{{ selectedTab ? getTeamDisplayName(selectedTab) : '' }}</strong>?
        </p>
        <p class="mt-3 text-sm text-gray-600">
          This will remove them from "Onboarding In Progress For" and add them to "Onboarding Completed For".
        </p>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
        <button
          @click="closeCompleteModal"
          :disabled="isCompletingOnboarding"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          @click="confirmCompleteOnboarding"
          :disabled="isCompletingOnboarding"
          class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {{ isCompletingOnboarding ? 'Completing...' : 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.status-icon.empty {
  background-color: #E5E7EB;
  border: 2px solid #D1D5DB;
}

.status-icon.pending-user {
  background-color: #FEF3C7;
  border: 2px solid #FCD34D;
}

.status-icon.pending-admin {
  background-color: #DBEAFE;
  border: 2px solid #93C5FD;
}

.status-icon.complete {
  background-color: #D1FAE5;
  border: 2px solid #6EE7B7;
}

.status-icon.complete::after {
  content: '✓';
  color: #059669;
  font-weight: bold;
  font-size: 14px;
}
</style>
