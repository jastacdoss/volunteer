<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSession, logout } from '@/lib/auth'
import { getTeamDisplayName } from '@/lib/teamMatrix'

interface Volunteer {
  id: string
  name: string
  email: string
  avatar: string
  teams: string[]
  childSafetyReviewed: boolean
  mandatedReporterReviewed: boolean
  referencesChecked: boolean
  backgroundCheckOrdered: boolean
  progress: {
    completed: number
    total: number
  }
}

const router = useRouter()
const isLoading = ref(true)
const isAdmin = ref(false)
const volunteers = ref<Volunteer[]>([])
const showCompleteModal = ref(false)
const selectedVolunteer = ref<Volunteer | null>(null)
const selectedTeam = ref<string>('')

// Group volunteers by team
const volunteersByTeam = computed(() => {
  const groups: Record<string, Volunteer[]> = {}

  volunteers.value.forEach(volunteer => {
    volunteer.teams.forEach(team => {
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
  const session = getSession()
  if (!session) {
    router.push('/')
    return
  }

  try {
    const response = await fetch('/api/admin/check', {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to check admin status')
    }

    const data = await response.json()
    isAdmin.value = data.isAdmin

    if (!isAdmin.value) {
      router.push('/')
      return
    }

    await loadVolunteers()
  } catch (error) {
    console.error('Failed to check admin status:', error)
    router.push('/')
  } finally {
    isLoading.value = false
  }
}

// Load all volunteers with "Onboarding In Progress For"
async function loadVolunteers() {
  const session = getSession()
  if (!session) return

  isLoading.value = true

  try {
    const response = await fetch('/api/admin/volunteers', {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to load volunteers')
    }

    const data = await response.json()
    volunteers.value = data.volunteers || []
  } catch (error) {
    console.error('Failed to load volunteers:', error)
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

    // Reload volunteers
    await loadVolunteers()
  } catch (error) {
    console.error('Failed to toggle review:', error)
    alert('Failed to update review status')
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

onMounted(async () => {
  await checkAdminStatus()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <button
              @click="router.push('/')"
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
            </button>
            <h1 class="text-xl font-bold text-gray-900">Admin - Volunteer Onboarding</h1>
          </div>
          <div class="flex items-center gap-3">
            <button
              @click="router.push('/admin/matrix')"
              class="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Team Matrix
            </button>
            <button
              @click="logout"
              class="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>

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
            <h2 class="text-lg font-bold text-gray-900">{{ getTeamDisplayName(team) }}</h2>
            <p class="text-xs text-gray-600">{{ teamVolunteers.length }} volunteer{{ teamVolunteers.length !== 1 ? 's' : '' }}</p>
          </div>

          <!-- Volunteers Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Name</th>
                  <th class="px-2 py-2 text-center font-semibold text-gray-700">Child Safety</th>
                  <th class="px-2 py-2 text-center font-semibold text-gray-700">Mandated Rep.</th>
                  <th class="px-2 py-2 text-center font-semibold text-gray-700">References</th>
                  <th class="px-2 py-2 text-center font-semibold text-gray-700">BG Check</th>
                  <th class="px-3 py-2 text-center font-semibold text-gray-700">Progress</th>
                  <th class="px-2 py-2 text-center font-semibold text-gray-700"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr
                  v-for="volunteer in teamVolunteers"
                  :key="volunteer.id"
                  class="hover:bg-gray-50 transition-colors"
                >
                  <!-- Name -->
                  <td class="px-3 py-1.5">
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
                      <span class="font-medium text-gray-900">{{ volunteer.name }}</span>
                    </div>
                  </td>

                  <!-- Child Safety -->
                  <td class="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      :checked="volunteer.childSafetyReviewed"
                      @change="toggleReview(volunteer.id, 'Child Safety Training Reviewed', volunteer.childSafetyReviewed)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                  </td>

                  <!-- Mandated Reporter -->
                  <td class="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      :checked="volunteer.mandatedReporterReviewed"
                      @change="toggleReview(volunteer.id, 'Mandated Reporter Training Reviewed', volunteer.mandatedReporterReviewed)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                  </td>

                  <!-- References -->
                  <td class="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      :checked="volunteer.referencesChecked"
                      @change="toggleReview(volunteer.id, 'References Checked', volunteer.referencesChecked)"
                      class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                  </td>

                  <!-- Background Check Ordered (Read-only) -->
                  <td class="px-2 py-1.5 text-center">
                    <span
                      v-if="volunteer.backgroundCheckOrdered"
                      class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100"
                    >
                      <svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>

                  <!-- Progress -->
                  <td class="px-3 py-1.5">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-2 min-w-[60px]">
                        <div
                          class="bg-green-500 h-2 rounded-full transition-all duration-300"
                          :style="{ width: `${(volunteer.progress.completed / volunteer.progress.total) * 100}%` }"
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
