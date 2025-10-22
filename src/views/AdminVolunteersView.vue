<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
const isAdmin = ref(false)
const isLeader = ref(false)
const isSyncing = ref(false)
const volunteers = ref<Volunteer[]>([])
const showCompleteModal = ref(false)
const selectedVolunteer = ref<Volunteer | null>(null)
const selectedTeam = ref<string>('')

// Field status helpers
type FieldStatus = 'empty' | 'pending_user' | 'pending_admin' | 'complete'

function getFieldStatus(fieldValue: string | null, hasAdminReview: boolean): FieldStatus {
  if (!fieldValue) return 'empty'
  if (hasAdminReview) return 'complete'
  return 'pending_admin'
}

function getBackgroundCheckStatus(bgCheck: BackgroundCheck | null): FieldStatus {
  if (!bgCheck) return 'empty'
  if (bgCheck.status === 'pending_applicant') return 'pending_user'
  if (bgCheck.status === 'needs_review') return 'pending_admin'
  if (bgCheck.status === 'completed' || bgCheck.status === 'manual_clear') return 'complete'
  return 'empty'
}

function getCovenantStatus(volunteer: Volunteer): FieldStatus {
  const level = volunteer.covenantLevel
  if (level === 0) return 'empty'
  if (level === 1 && volunteer.fields.covenantSigned) return 'complete'
  if (level === 2 && volunteer.fields.moralConduct) return 'complete'
  if (level === 3 && volunteer.fields.publicPresence) return 'complete'
  return 'pending_user'
}

// Check if background check is expired
function isBackgroundCheckExpired(bgCheck: BackgroundCheck | null): boolean {
  if (!bgCheck || !bgCheck.expiresOn) return false
  const expiresDate = new Date(bgCheck.expiresOn)
  const today = new Date()
  return expiresDate < today
}

// Status icon CSS classes
function getStatusIconClass(status: FieldStatus): string {
  if (status === 'empty') return 'empty'
  if (status === 'pending_user') return 'pending-user'
  if (status === 'pending_admin') return 'pending-admin'
  if (status === 'complete') return 'complete'
  return 'empty'
}

// Get required columns for a team (union of all volunteers' requirements)
function getTeamRequiredColumns(teamVolunteers: Volunteer[]) {
  const required = {
    declaration: false,
    welcomeToRCC: false,
    childSafety: false,
    mandatedReporter: false,
    references: false,
    backgroundCheck: false,
    covenant: false,
    membership: false
  }

  teamVolunteers.forEach(volunteer => {
    if (volunteer.requiredFields.declaration) required.declaration = true
    if (volunteer.requiredFields.welcomeToRCC) required.welcomeToRCC = true
    if (volunteer.requiredFields.childSafety) required.childSafety = true
    if (volunteer.requiredFields.mandatedReporter) required.mandatedReporter = true
    if (volunteer.requiredFields.references) required.references = true
    if (volunteer.requiredFields.backgroundCheck) required.backgroundCheck = true
    if (volunteer.covenantLevel > 0) required.covenant = true
    if (volunteer.requiredFields.membership) required.membership = true
  })

  return required
}

// Check if any volunteer in team requires a field
function isFieldRequired(teamVolunteers: Volunteer[], field: keyof typeof teamVolunteers[0]['requiredFields'] | 'covenant'): boolean {
  return teamVolunteers.some(v => {
    if (field === 'covenant') return v.covenantLevel > 0
    return v.requiredFields[field]
  })
}

// Get covenant level for team (max level across all volunteers)
function getTeamCovenantLevel(teamVolunteers: Volunteer[]): number {
  return Math.max(...teamVolunteers.map(v => v.covenantLevel), 0)
}

// Group volunteers by team
const volunteersByTeam = computed(() => {
  const groups: Record<string, Volunteer[]> = {}

  volunteers.value.forEach(volunteer => {
    volunteer.teams.forEach(team => {
      // Filter out "Ministry Leader" team
      if (team.toLowerCase() === 'ministry leader') return

      if (!groups[team]) {
        groups[team] = []
      }
      groups[team].push(volunteer)
    })
  })

  // Sort teams alphabetically
  return Object.keys(groups)
    .sort()
    .reduce((acc, team) => {
      const teamVolunteers = groups[team]
      if (teamVolunteers) {
        acc[team] = teamVolunteers
      }
      return acc
    }, {} as Record<string, Volunteer[]>)
})

// Check if user is admin
async function checkAdminStatus() {
  console.log('[AdminVolunteersView] checkAdminStatus called')
  const session = getSession()
  if (!session) {
    console.log('[AdminVolunteersView] No session, redirecting to /')
    router.push('/')
    return
  }

  try {
    console.log('[AdminVolunteersView] Checking admin status...')
    // Use cached permissions (or fetch if not cached)
    const permissions = await checkPermissions()

    isAdmin.value = permissions.isAdmin
    isLeader.value = permissions.isLeader

    console.log('[AdminVolunteersView] isAdmin:', isAdmin.value)
    console.log('[AdminVolunteersView] isLeader:', isLeader.value)

    if (!isAdmin.value) {
      console.log('[AdminVolunteersView] Not admin, redirecting to /')
      router.push('/')
      return
    }

    console.log('[AdminVolunteersView] Calling loadVolunteers...')
    await loadVolunteers()
  } catch (error) {
    console.error('[AdminVolunteersView] Failed to check admin status:', error)
    router.push('/')
  } finally {
    isLoading.value = false
  }
}

// Load all volunteers with "Onboarding In Progress For"
async function loadVolunteers() {
  console.log('[AdminVolunteersView] loadVolunteers called')
  const session = getSession()
  if (!session) {
    console.log('[AdminVolunteersView] No session in loadVolunteers')
    return
  }

  isLoading.value = true

  try {
    console.log('[AdminVolunteersView] Fetching /api/admin/volunteers...')
    const response = await fetch('/api/admin/volunteers', {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    console.log('[AdminVolunteersView] Response status:', response.status)

    if (!response.ok) {
      throw new Error('Failed to load volunteers')
    }

    const data = await response.json()
    console.log('[AdminVolunteersView] Got volunteers:', data.volunteers?.length || 0)
    volunteers.value = data.volunteers || []
  } catch (error) {
    console.error('[AdminVolunteersView] Failed to load volunteers:', error)
  } finally {
    isLoading.value = false
  }
}

// Toggle review checkbox
async function toggleReview(volunteerId: string, fieldName: string, currentValue: boolean) {
  const session = getSession()
  if (!session) return

  try {
    const response = await fetch('/api/admin/toggle-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        personId: volunteerId,
        fieldName,
        value: !currentValue,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to update review status')
    }

    // Update local volunteer state instead of reloading
    const volunteer = volunteers.value.find(v => v.id === volunteerId)
    if (volunteer) {
      // Map field names to volunteer.fields properties
      const fieldMap: Record<string, keyof VolunteerFields> = {
        'Child Safety Training Last Completed': 'childSafety',
        'Mandated Reporter Training Last Completed': 'mandatedReporter',
        'References Checked': 'references'
      }

      const fieldKey = fieldMap[fieldName]
      if (fieldKey) {
        // Toggle the date field (set to today's date if checking, null if unchecking)
        if (!currentValue) {
          volunteer.fields[fieldKey] = new Date().toISOString().split('T')[0]
          volunteer.progress.completed = Math.min(volunteer.progress.completed + 1, volunteer.progress.total)
        } else {
          volunteer.fields[fieldKey] = null
          volunteer.progress.completed = Math.max(volunteer.progress.completed - 1, 0)
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle review:', error)
    alert('Failed to update review status')
  }
}

// Set field date to today when admin checks checkbox
async function setFieldDate(volunteerId: string, fieldName: string) {
  const session = getSession()
  if (!session) return

  try {
    // Set today's date in ISO format (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0]

    const response = await fetch('/api/admin/set-field-date', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        personId: volunteerId,
        fieldName,
        date: today,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to set field date')
    }

    // Update local volunteer state
    const volunteer = volunteers.value.find(v => v.id === volunteerId)
    if (volunteer) {
      const fieldMap: Record<string, keyof VolunteerFields> = {
        'Declaration Reviewed': 'declaration',
        'Child Safety Training Last Completed': 'childSafety',
        'Mandated Reporter Training Last Completed': 'mandatedReporter',
        'References Checked': 'references',
      }

      const fieldKey = fieldMap[fieldName]
      if (fieldKey) {
        volunteer.fields[fieldKey] = today
        // Update progress if this field is required
        const requiredFieldMap: Record<string, keyof RequiredFields> = {
          'Declaration Reviewed': 'declaration',
          'Child Safety Training Last Completed': 'childSafety',
          'Mandated Reporter Training Last Completed': 'mandatedReporter',
          'References Checked': 'references',
        }
        const requiredKey = requiredFieldMap[fieldName]
        if (requiredKey && volunteer.requiredFields[requiredKey]) {
          volunteer.progress.completed = Math.min(volunteer.progress.completed + 1, volunteer.progress.total)
        }
      }
    }
  } catch (error) {
    console.error('Failed to set field date:', error)
    alert('Failed to set field date')
  }
}

// Show complete confirmation modal
function showComplete(volunteer: Volunteer, team: string) {
  selectedVolunteer.value = volunteer
  selectedTeam.value = team
  showCompleteModal.value = true
}

// Mark volunteer as complete for a team
async function markComplete() {
  if (!selectedVolunteer.value || !selectedTeam.value) return

  const session = getSession()
  if (!session) return

  try {
    const response = await fetch('/api/admin/complete-onboarding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        personId: selectedVolunteer.value.id,
        team: selectedTeam.value,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to mark as complete')
    }

    // Close modal and reload
    showCompleteModal.value = false
    selectedVolunteer.value = null
    selectedTeam.value = ''
    await loadVolunteers()
  } catch (error) {
    console.error('Failed to mark as complete:', error)
    alert('Failed to mark volunteer as complete')
  }
}

// Sync volunteers from PCO to Redis cache
async function syncVolunteers() {
  const session = getSession()
  if (!session) return

  isSyncing.value = true

  try {
    const response = await fetch('/api/admin/volunteers/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to sync volunteers')
    }

    const result = await response.json()
    console.log('Sync result:', result)

    // Reload volunteers after sync
    await loadVolunteers()
  } catch (error) {
    console.error('Failed to sync volunteers:', error)
  } finally {
    isSyncing.value = false
  }
}

// Polling interval reference
let pollingInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await checkAdminStatus()

  // Poll for updates every 30 seconds
  pollingInterval = setInterval(() => {
    loadVolunteers()
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
    <AppHeader title="Admin - Volunteer Onboarding" :show-admin-sub-nav="true">
      <template #admin-actions>
        <button
          @click="syncVolunteers"
          :disabled="isSyncing"
          class="px-3 py-1.5 text-sm font-medium text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ isSyncing ? 'Syncing...' : 'Refresh' }}
        </button>
      </template>
    </AppHeader>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p class="text-gray-600">Loading volunteers...</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Team Groups -->
      <div class="space-y-6">
        <div
          v-for="(teamVolunteers, team) in volunteersByTeam"
          :key="team"
          class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
        >
          <!-- Team Header -->
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 border-b border-blue-100">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-bold text-gray-900">{{ getTeamDisplayName(team) }}</h2>
                <p class="text-xs text-gray-600">{{ teamVolunteers.length }} volunteer{{ teamVolunteers.length !== 1 ? 's' : '' }}</p>
              </div>
            </div>
          </div>

          <!-- Volunteers Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th rowspan="2" class="px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-300" style="width: 200px;">Name</th>
                  <th :colspan="isFieldRequired(teamVolunteers, 'declaration') ? 2 : 1" class="px-2 py-1 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 100px;">Declaration</th>
                  <th :colspan="isFieldRequired(teamVolunteers, 'backgroundCheck') ? 2 : 1" class="px-2 py-1 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 100px;">BG Check</th>
                  <th :colspan="isFieldRequired(teamVolunteers, 'childSafety') ? 2 : 1" class="px-2 py-1 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 100px;">Child Safety</th>
                  <th :colspan="isFieldRequired(teamVolunteers, 'mandatedReporter') ? 2 : 1" class="px-2 py-1 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 100px;">Mand. Rep.</th>
                  <th :colspan="isFieldRequired(teamVolunteers, 'references') ? 2 : 1" class="px-2 py-1 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 100px;">References</th>
                  <th class="px-2 py-1 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 80px;">Covenant</th>
                  <th rowspan="2" class="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-300" style="width: 120px;">Progress</th>
                  <th rowspan="2" class="px-2 py-2 text-center font-semibold text-gray-700" style="width: 80px;"></th>
                </tr>
                <tr class="text-xs text-gray-500">
                  <!-- Declaration sub-headers -->
                  <template v-if="isFieldRequired(teamVolunteers, 'declaration')">
                    <th class="px-1 py-1 border-r border-gray-200">Vol</th>
                    <th class="px-1 py-1 border-r border-gray-300">Admin</th>
                  </template>
                  <template v-else>
                    <th class="px-1 py-1 border-r border-gray-300"></th>
                  </template>

                  <!-- BG Check sub-headers -->
                  <template v-if="isFieldRequired(teamVolunteers, 'backgroundCheck')">
                    <th class="px-1 py-1 border-r border-gray-200">Vol</th>
                    <th class="px-1 py-1 border-r border-gray-300">Admin</th>
                  </template>
                  <template v-else>
                    <th class="px-1 py-1 border-r border-gray-300"></th>
                  </template>

                  <!-- W2RCC - no sub-header needed (rowspan=2 in first row) -->

                  <!-- Child Safety sub-headers -->
                  <template v-if="isFieldRequired(teamVolunteers, 'childSafety')">
                    <th class="px-1 py-1 border-r border-gray-200">Vol</th>
                    <th class="px-1 py-1 border-r border-gray-300">Admin</th>
                  </template>
                  <template v-else>
                    <th class="px-1 py-1 border-r border-gray-300"></th>
                  </template>

                  <!-- Mandated Reporter sub-headers -->
                  <template v-if="isFieldRequired(teamVolunteers, 'mandatedReporter')">
                    <th class="px-1 py-1 border-r border-gray-200">Vol</th>
                    <th class="px-1 py-1 border-r border-gray-300">Admin</th>
                  </template>
                  <template v-else>
                    <th class="px-1 py-1 border-r border-gray-300"></th>
                  </template>

                  <!-- References sub-headers -->
                  <template v-if="isFieldRequired(teamVolunteers, 'references')">
                    <th class="px-1 py-1 border-r border-gray-200">Vol</th>
                    <th class="px-1 py-1 border-r border-gray-300">Admin</th>
                  </template>
                  <template v-else>
                    <th class="px-1 py-1 border-r border-gray-300"></th>
                  </template>

                  <!-- Covenant sub-header -->
                  <th class="px-1 py-1 border-r border-gray-300">
                    <span v-if="getTeamCovenantLevel(teamVolunteers) > 0" class="text-xs italic font-normal text-gray-500">Level {{ getTeamCovenantLevel(teamVolunteers) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr
                  v-for="volunteer in teamVolunteers"
                  :key="volunteer.id"
                  class="hover:bg-gray-50 transition-colors"
                >
                  <!-- Name -->
                  <td class="px-3 py-1.5 border-r border-gray-300">
                    <div class="flex items-center gap-2">
                      <img
                        v-if="volunteer.avatar"
                        :src="volunteer.avatar"
                        :alt="volunteer.name"
                        class="w-6 h-6 rounded-full object-cover"
                      >
                      <div
                        v-else
                        class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs"
                      >
                        {{ volunteer.name.charAt(0).toUpperCase() }}
                      </div>
                      <router-link
                        :to="`/leader/volunteer/${volunteer.id}`"
                        class="font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                      >
                        {{ volunteer.name }}
                      </router-link>
                      <a
                        :href="`https://people.planningcenteronline.com/people/${volunteer.id}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-gray-400 hover:text-blue-600 transition-colors"
                        title="Open in Planning Center"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                      </a>
                    </div>
                  </td>

                  <!-- Declaration: Conditional VOL + ADMIN or single N/A -->
                  <template v-if="isFieldRequired(teamVolunteers, 'declaration')">
                    <!-- VOL column -->
                    <td class="px-2 py-1.5 text-center border-r border-gray-200">
                      <span v-if="!volunteer.fields.declarationSubmitted || volunteer.fields.declarationSubmitted === 'No'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                    <!-- ADMIN column -->
                    <td class="px-2 py-1.5 text-center border-r border-gray-300">
                      <input v-if="!volunteer.fields.declaration"
                             type="checkbox"
                             class="w-4 h-4 cursor-pointer"
                             @change="setFieldDate(volunteer.id, 'Declaration Reviewed')">
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                  </template>
                  <td v-else class="px-2 py-1.5 text-center border-r border-gray-300">
                    <span class="text-gray-400 text-xs">N/A</span>
                  </td>

                  <!-- Background Check: Conditional VOL + ADMIN or single N/A -->
                  <template v-if="isFieldRequired(teamVolunteers, 'backgroundCheck')">
                    <!-- VOL column -->
                    <td class="px-2 py-1.5 text-center border-r border-gray-200">
                      <!-- Expired or No BG Check: Red exclamation triangle -->
                      <span v-if="!volunteer.backgroundCheck || isBackgroundCheckExpired(volunteer.backgroundCheck)" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100">
                        <svg class="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <!-- Awaiting Applicant: Yellow user icon -->
                      <div v-else-if="volunteer.backgroundCheck.status === 'awaiting_applicant'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                        </svg>
                      </div>
                      <!-- Completed or Manual Clear: Green check -->
                      <div v-else-if="volunteer.backgroundCheck.status === 'complete_clear' || volunteer.backgroundCheck.status === 'manual_clear'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                    <!-- ADMIN column -->
                    <td class="px-2 py-1.5 text-center border-r border-gray-300">
                      <!-- Report Processing: Yellow clock -->
                      <div v-if="volunteer.backgroundCheck && volunteer.backgroundCheck.status === 'report_processing'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100" title="Background check report processing">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                        </svg>
                      </div>
                      <!-- Pending Review: Yellow eye icon with link to PCO -->
                      <a v-else-if="volunteer.backgroundCheck && volunteer.backgroundCheck.status === 'pending_review'"
                         :href="`https://people.planningcenteronline.com/people/${volunteer.id}`"
                         target="_blank" rel="noopener noreferrer"
                         class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100 hover:bg-yellow-200 transition-colors"
                         title="Review background check in PCO">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
                        </svg>
                      </a>
                      <!-- Complete Clear or Manual Clear: Green check -->
                      <div v-else-if="volunteer.backgroundCheck && (volunteer.backgroundCheck.status === 'complete_clear' || volunteer.backgroundCheck.status === 'manual_clear')" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <!-- Default: Dash -->
                      <span v-else class="text-gray-400 text-xs">-</span>
                    </td>
                  </template>
                  <td v-else class="px-2 py-1.5 text-center border-r border-gray-300">
                    <span class="text-gray-400 text-xs">N/A</span>
                  </td>

                  <!-- Child Safety: Conditional VOL + ADMIN or single N/A -->
                  <template v-if="isFieldRequired(teamVolunteers, 'childSafety')">
                    <td class="px-2 py-1.5 text-center border-r border-gray-200">
                      <span v-if="!volunteer.fields.childSafetySubmitted || volunteer.fields.childSafetySubmitted === 'No'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-center border-r border-gray-300">
                      <input v-if="!volunteer.fields.childSafety"
                             type="checkbox"
                             class="w-4 h-4 cursor-pointer"
                             @change="setFieldDate(volunteer.id, 'Child Safety Training Last Completed')">
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                  </template>
                  <td v-else class="px-2 py-1.5 text-center border-r border-gray-300">
                    <span class="text-gray-400 text-xs">N/A</span>
                  </td>

                  <!-- Mandated Reporter: Conditional VOL + ADMIN or single N/A -->
                  <template v-if="isFieldRequired(teamVolunteers, 'mandatedReporter')">
                    <td class="px-2 py-1.5 text-center border-r border-gray-200">
                      <span v-if="!volunteer.fields.mandatedReporterSubmitted || volunteer.fields.mandatedReporterSubmitted === 'No'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-center border-r border-gray-300">
                      <input v-if="!volunteer.fields.mandatedReporter"
                             type="checkbox"
                             class="w-4 h-4 cursor-pointer"
                             @change="setFieldDate(volunteer.id, 'Mandated Reporter Training Last Completed')">
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                  </template>
                  <td v-else class="px-2 py-1.5 text-center border-r border-gray-300">
                    <span class="text-gray-400 text-xs">N/A</span>
                  </td>

                  <!-- References: Conditional VOL + ADMIN or single N/A -->
                  <template v-if="isFieldRequired(teamVolunteers, 'references')">
                    <td class="px-2 py-1.5 text-center border-r border-gray-200">
                      <span v-if="!volunteer.fields.referencesSubmitted || volunteer.fields.referencesSubmitted === 'No'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-center border-r border-gray-300">
                      <input v-if="!volunteer.fields.references"
                             type="checkbox"
                             class="w-4 h-4 cursor-pointer"
                             @change="setFieldDate(volunteer.id, 'References Checked')">
                      <div v-else class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </td>
                  </template>
                  <td v-else class="px-2 py-1.5 text-center border-r border-gray-300">
                    <span class="text-gray-400 text-xs">N/A</span>
                  </td>

                  <!-- Covenant (single column) -->
                  <td class="px-2 py-1.5 text-center border-r border-gray-300">
                    <template v-if="volunteer.covenantLevel === 0">
                      <span class="text-gray-400 text-xs">N/A</span>
                    </template>
                    <template v-else>
                      <span v-if="getCovenantStatus(volunteer) === 'pending_user'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-100">
                        <svg class="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <div v-else-if="getCovenantStatus(volunteer) === 'complete'" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                        <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                    </template>
                  </td>

                  <!-- Progress -->
                  <td class="px-3 py-1.5 border-r border-gray-300">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-2 min-w-[60px]">
                        <div
                          class="bg-green-500 h-2 rounded-full transition-all duration-300"
                          :style="{ width: `${volunteer.progress.total > 0 ? (volunteer.progress.completed / volunteer.progress.total) * 100 : 0}%` }"
                        ></div>
                      </div>
                      <span class="text-xs text-gray-600 whitespace-nowrap">{{ volunteer.progress.completed }}/{{ volunteer.progress.total }}</span>
                    </div>
                  </td>

                  <!-- Complete Button -->
                  <td class="px-2 py-1.5 text-center">
                    <button
                      @click="showComplete(volunteer, team)"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                      title="Mark as Complete"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- No Volunteers -->
        <div v-if="Object.keys(volunteersByTeam).length === 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No Volunteers In Progress</h3>
          <p class="mt-1 text-sm text-gray-500">No volunteers are currently onboarding</p>
        </div>
      </div>
    </div>

    <!-- Complete Confirmation Modal -->
    <div
      v-if="showCompleteModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="showCompleteModal = false"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">Mark as Complete?</h3>
        <p class="text-gray-700 mb-6">
          <strong>{{ selectedVolunteer?.name }}</strong> will be marked as complete for
          <strong>{{ getTeamDisplayName(selectedTeam) }}</strong> and cleared to serve.
        </p>
        <div class="flex gap-3 justify-end">
          <button
            @click="showCompleteModal = false"
            class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            @click="markComplete"
            class="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
