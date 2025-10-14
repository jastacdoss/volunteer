<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSession, logout } from '@/lib/auth'

interface Volunteer {
  id: string
  name: string
  email: string
  avatar: string
}

const router = useRouter()
const isLoading = ref(true)
const isLeader = ref(false)
const leaderName = ref('')
const leaderEmail = ref('')
const ministries = ref<string[]>([])
const selectedMinistry = ref<string | null>(null)
const inProgressVolunteers = ref<Volunteer[]>([])
const completedVolunteers = ref<Volunteer[]>([])

// Check if user is a leader
async function checkLeaderStatus() {
  const session = getSession()
  if (!session) {
    router.push('/')
    return
  }

  // Store leader info from session
  leaderName.value = session.userData?.data?.attributes?.name || 'Leader'
  leaderEmail.value = session.userData?.data?.attributes?.login_identifier || ''

  try {
    const response = await fetch('/api/leader/check', {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to check leader status')
    }

    const data = await response.json()
    isLeader.value = data.isLeader
    ministries.value = data.ministries || []

    if (!isLeader.value) {
      router.push('/')
      return
    }

    // Auto-select first ministry
    if (ministries.value.length > 0) {
      selectedMinistry.value = ministries.value[0]
      await loadVolunteers(selectedMinistry.value)
    }
  } catch (error) {
    console.error('Failed to check leader status:', error)
    router.push('/')
  } finally {
    isLoading.value = false
  }
}

// Load volunteers for selected ministry
async function loadVolunteers(ministry: string) {
  const session = getSession()
  if (!session || !ministry) return

  isLoading.value = true

  try {
    const response = await fetch(`/api/leader/volunteers/${encodeURIComponent(ministry)}`, {
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to load volunteers')
    }

    const data = await response.json()
    inProgressVolunteers.value = data.inProgress || []
    completedVolunteers.value = data.completed || []
  } catch (error) {
    console.error('Failed to load volunteers:', error)
  } finally {
    isLoading.value = false
  }
}

// Handle ministry change
async function onMinistryChange() {
  if (selectedMinistry.value) {
    await loadVolunteers(selectedMinistry.value)
  }
}

// View volunteer's onboarding
function viewVolunteer(volunteerId: string) {
  router.push(`/leader/volunteer/${volunteerId}`)
}

onMounted(async () => {
  await checkLeaderStatus()
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
            <h1 class="text-2xl font-bold text-gray-900">Leader Dashboard</h1>
          </div>
          <button
            @click="logout"
            class="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            Logout
          </button>
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
    <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Leader Info Card -->
      <div v-if="selectedMinistry" class="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{{ leaderName }}</h2>
          <p class="text-sm text-gray-600 mt-1">{{ selectedMinistry }}</p>
          <p class="text-sm text-gray-500 mt-0.5">{{ leaderEmail }}</p>
        </div>
      </div>

      <!-- Ministry Selector -->
      <div v-if="ministries.length > 1" class="mb-8">
        <label for="ministry" class="block text-sm font-medium text-gray-700 mb-2">
          Select Ministry
        </label>
        <select
          id="ministry"
          v-model="selectedMinistry"
          @change="onMinistryChange"
          class="block w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option v-for="ministry in ministries" :key="ministry" :value="ministry">
            {{ ministry }}
          </option>
        </select>
      </div>

      <!-- No Ministry Selected -->
      <div v-if="!selectedMinistry" class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No Ministry Selected</h3>
        <p class="mt-1 text-sm text-gray-500">Select a ministry to view volunteers</p>
      </div>

      <!-- Volunteers Lists -->
      <div v-else class="space-y-8">
        <!-- In Progress Section -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gradient-to-r from-yellow-50 to-orange-50 px-6 py-4 border-b border-yellow-100">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-yellow-100 rounded-lg">
                <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold text-gray-900">Onboarding In Progress</h2>
                <p class="text-sm text-gray-600">{{ inProgressVolunteers.length }} volunteer{{ inProgressVolunteers.length !== 1 ? 's' : '' }}</p>
              </div>
            </div>
          </div>

          <div v-if="inProgressVolunteers.length === 0" class="px-6 py-12 text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p class="mt-2 text-sm text-gray-500">No volunteers currently in progress</p>
          </div>

          <div v-else class="divide-y divide-gray-100">
            <button
              v-for="volunteer in inProgressVolunteers"
              :key="volunteer.id"
              @click="viewVolunteer(volunteer.id)"
              class="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
            >
              <img
                v-if="volunteer.avatar"
                :src="volunteer.avatar"
                :alt="volunteer.name"
                class="w-12 h-12 rounded-full object-cover"
              >
              <div
                v-else
                class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg"
              >
                {{ volunteer.name.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-gray-900 truncate">{{ volunteer.name }}</h3>
                <p class="text-sm text-gray-500 truncate">{{ volunteer.email || 'No email' }}</p>
              </div>
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Completed Section -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-green-100">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-green-100 rounded-lg">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold text-gray-900">Onboarding Completed</h2>
                <p class="text-sm text-gray-600">{{ completedVolunteers.length }} volunteer{{ completedVolunteers.length !== 1 ? 's' : '' }}</p>
              </div>
            </div>
          </div>

          <div v-if="completedVolunteers.length === 0" class="px-6 py-12 text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p class="mt-2 text-sm text-gray-500">No volunteers have completed onboarding yet</p>
          </div>

          <div v-else class="divide-y divide-gray-100">
            <button
              v-for="volunteer in completedVolunteers"
              :key="volunteer.id"
              @click="viewVolunteer(volunteer.id)"
              class="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
            >
              <img
                v-if="volunteer.avatar"
                :src="volunteer.avatar"
                :alt="volunteer.name"
                class="w-12 h-12 rounded-full object-cover"
              >
              <div
                v-else
                class="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-lg"
              >
                {{ volunteer.name.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-gray-900 truncate">{{ volunteer.name }}</h3>
                <p class="text-sm text-gray-500 truncate">{{ volunteer.email || 'No email' }}</p>
              </div>
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
