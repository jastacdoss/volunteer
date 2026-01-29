<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'

interface Checkin {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  number: number | null
  category: 'car-show' | 'chili-cookoff' | 'other'
  subCategory: string | null
  checkedInAt: string
  carYear: string | null
  carMake: string | null
  carModel: string | null
  carColor: string | null
}

interface SubCategoryGroup {
  name: string
  checkins: Checkin[]
}

const route = useRoute()
const eventId = computed(() => route.params.eventId as string)
const eventPeriodId = computed(() => route.params.eventPeriodId as string)

const checkins = ref<Checkin[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)
const isRefreshing = ref(false)

// Registration upload state
const registrationCount = ref<number>(0)
const registrationUploadedAt = ref<string | null>(null)
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function fetchRegistrationInfo() {
  try {
    const response = await fetch(`/api/registrations/${eventId.value}`)
    if (response.ok) {
      const data = await response.json()
      registrationCount.value = data.count || 0
      registrationUploadedAt.value = data.uploadedAt || null
    }
  } catch (err) {
    console.error('Failed to fetch registration info:', err)
  }
}

function triggerFileUpload() {
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  isUploading.value = true
  uploadError.value = null

  try {
    const csvContent = await file.text()
    const response = await fetch(`/api/registrations/${eventId.value}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: csvContent
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Upload failed')
    }

    const data = await response.json()
    registrationCount.value = data.count
    registrationUploadedAt.value = new Date().toISOString()

    // Refresh check-ins to get updated car data
    await fetchCheckins()
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  } finally {
    isUploading.value = false
    input.value = '' // Reset file input
  }
}

// Filter check-ins by category
const carShowCheckins = computed(() =>
  checkins.value.filter(c => c.category === 'car-show')
)

const chiliCookoffCheckins = computed(() =>
  checkins.value.filter(c => c.category === 'chili-cookoff')
)

// Group car show check-ins by sub-category
const carShowBySubCategory = computed((): SubCategoryGroup[] => {
  const groups = new Map<string, Checkin[]>()

  carShowCheckins.value.forEach(checkin => {
    const key = checkin.subCategory || 'Uncategorized'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(checkin)
  })

  // Sort groups alphabetically, but put "Uncategorized" last
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1
      if (b === 'Uncategorized') return -1
      return a.localeCompare(b)
    })
    .map(([name, checkins]) => ({ name, checkins }))
})

// Group chili cook-off check-ins by sub-category
const chiliBySubCategory = computed((): SubCategoryGroup[] => {
  const groups = new Map<string, Checkin[]>()

  chiliCookoffCheckins.value.forEach(checkin => {
    const key = checkin.subCategory || 'Uncategorized'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(checkin)
  })

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1
      if (b === 'Uncategorized') return -1
      return a.localeCompare(b)
    })
    .map(([name, checkins]) => ({ name, checkins }))
})

async function fetchCheckins() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  error.value = null

  try {
    const response = await fetch(`/api/checkins/${eventId.value}/${eventPeriodId.value}`)

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to fetch check-ins')
    }

    const data = await response.json()
    checkins.value = data.checkins || []
    lastUpdated.value = new Date()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

function formatTime(dateString: string): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatLastUpdated(): string {
  if (!lastUpdated.value) return ''
  return lastUpdated.value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
}

// Auto-refresh every 30 seconds
let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchCheckins()
  fetchRegistrationInfo()
  refreshInterval = setInterval(fetchCheckins, 30000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">
              Car Show & Chili Cook-Off
            </h1>
            <p class="text-gray-600 mt-1">
              Check-in Dashboard
            </p>
          </div>
          <div class="flex items-center gap-6">
            <div class="text-center">
              <p class="text-2xl font-bold text-blue-600">{{ carShowCheckins.length }}</p>
              <p class="text-xs text-gray-500">Car Show</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-orange-600">{{ chiliCookoffCheckins.length }}</p>
              <p class="text-xs text-gray-500">Chili</p>
            </div>
            <div class="text-center border-l pl-6">
              <p class="text-2xl font-bold text-[#095879]">{{ checkins.length }}</p>
              <p class="text-xs text-gray-500">Total</p>
            </div>
            <button
              @click="fetchCheckins"
              :disabled="isRefreshing"
              class="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 print:hidden"
              title="Refresh"
            >
              <svg
                class="w-5 h-5 text-gray-600"
                :class="{ 'animate-spin': isRefreshing }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Status bar -->
        <div class="mt-4 flex items-center justify-between text-sm text-gray-500 print:hidden">
          <div class="flex items-center gap-4">
            <span class="inline-flex items-center gap-1">
              <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Auto-refreshing every 30 seconds
            </span>
            <span class="text-gray-300">|</span>
            <!-- Registration upload -->
            <input
              ref="fileInput"
              type="file"
              accept=".csv"
              class="hidden"
              @change="handleFileUpload"
            />
            <button
              @click="triggerFileUpload"
              :disabled="isUploading"
              class="text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {{ isUploading ? 'Uploading...' : 'Upload Registrations CSV' }}
            </button>
            <span v-if="registrationCount > 0" class="text-green-600">
              ({{ registrationCount }} with car data)
            </span>
            <span v-if="uploadError" class="text-red-600">{{ uploadError }}</span>
          </div>
          <span v-if="lastUpdated">Last updated: {{ formatLastUpdated() }}</span>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-[#095879] mx-auto mb-4"></div>
          <p class="text-gray-600">Loading check-ins...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p class="text-red-800 font-medium">{{ error }}</p>
        <button
          @click="fetchCheckins"
          class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="checkins.length === 0" class="bg-white rounded-lg shadow p-12 text-center">
        <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p class="text-gray-500 text-lg">No check-ins yet</p>
        <p class="text-gray-400 text-sm mt-1">Check-ins will appear here automatically</p>
      </div>

      <!-- Check-ins Display -->
      <div v-else class="space-y-12">
        <!-- Car Show Section -->
        <div class="space-y-4">
          <div class="bg-blue-600 px-6 py-4 rounded-t-lg">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m-8 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <h2 class="text-xl font-bold text-white">Car Show</h2>
              </div>
              <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-semibold">
                {{ carShowCheckins.length }}
              </span>
            </div>
          </div>

          <div v-if="carShowCheckins.length === 0" class="bg-white rounded-lg shadow p-8 text-center text-gray-400">
            No car show entries checked in yet
          </div>

          <!-- Sub-category groups -->
          <div v-for="group in carShowBySubCategory" :key="group.name" class="bg-white rounded-lg shadow overflow-hidden">
            <div class="bg-blue-50 px-4 py-2 border-b border-blue-100">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-blue-800">{{ group.name }}</span>
                <span class="text-sm text-blue-600">{{ group.checkins.length }}</span>
              </div>
            </div>
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase w-12">#</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase w-36">Name</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style="min-width: 320px;">Vehicle</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr
                  v-for="checkin in group.checkins"
                  :key="checkin.id"
                  class="hover:bg-blue-50"
                >
                  <td class="px-2 py-1 whitespace-nowrap text-center">
                    <span
                      v-if="checkin.number"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-blue-100 text-blue-800"
                    >
                      {{ checkin.number }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-2 py-1 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">{{ checkin.name }}</div>
                  </td>
                  <td class="px-2 py-1 whitespace-nowrap">
                    <div v-if="checkin.carYear || checkin.carMake || checkin.carModel" class="text-sm text-gray-900">
                      <span class="font-medium">{{ checkin.carYear }} {{ checkin.carMake }} {{ checkin.carModel }}</span>
                      <span v-if="checkin.carColor" class="text-gray-500 ml-1">({{ checkin.carColor }})</span>
                    </div>
                    <span v-else class="text-gray-400 text-sm">-</span>
                  </td>
                  <td class="px-2 py-1">
                    <!-- Empty column for handwritten judging notes -->
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Chili Cook-Off Section -->
        <div class="space-y-4">
          <div class="bg-orange-600 px-6 py-4 rounded-t-lg">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                </svg>
                <h2 class="text-xl font-bold text-white">Chili Cook-Off</h2>
              </div>
              <span class="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-semibold">
                {{ chiliCookoffCheckins.length }}
              </span>
            </div>
          </div>

          <div v-if="chiliCookoffCheckins.length === 0" class="bg-white rounded-lg shadow p-8 text-center text-gray-400">
            No chili cook-off entries checked in yet
          </div>

          <!-- Sub-category groups -->
          <div v-for="group in chiliBySubCategory" :key="group.name" class="bg-white rounded-lg shadow overflow-hidden">
            <div class="bg-orange-50 px-4 py-2 border-b border-orange-100">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-orange-800">{{ group.name }}</span>
                <span class="text-sm text-orange-600">{{ group.checkins.length }}</span>
              </div>
            </div>
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase w-12">#</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase w-48">Name</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr
                  v-for="checkin in group.checkins"
                  :key="checkin.id"
                  class="hover:bg-orange-50"
                >
                  <td class="px-2 py-1 whitespace-nowrap text-center">
                    <span
                      v-if="checkin.number"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold bg-orange-100 text-orange-800"
                    >
                      {{ checkin.number }}
                    </span>
                    <span v-else class="text-gray-400">-</span>
                  </td>
                  <td class="px-2 py-1 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">{{ checkin.name }}</div>
                  </td>
                  <td class="px-2 py-1">
                    <!-- Empty column for handwritten judging notes -->
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
