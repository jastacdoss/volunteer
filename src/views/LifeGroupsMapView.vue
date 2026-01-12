<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import FindYourFitHero from '@/components/shared/FindYourFitHero.vue'
import LifeGroupsMap from '@/components/lifegroups/LifeGroupsMap.vue'
import LifeGroupCard from '@/components/lifegroups/LifeGroupCard.vue'
import LifeGroupModal from '@/components/lifegroups/LifeGroupModal.vue'
import { updateEmbedHeight } from '@/lib/embedResize'

interface GroupLocation {
  name: string
  address: string
  lat: number
  lng: number
  displayPreference: string
}

interface Group {
  id: string
  name: string
  description: string
  schedule: string | null
  contactEmail: string | null
  membersCount: number
  publicUrl: string | null
  headerImage: string | null
  groupTypeId: string
  hasChildcare: boolean
  location: GroupLocation | null
}

interface GroupType {
  id: string
  name: string
  description: string | null
}

const route = useRoute()

// Check if we're in embed mode (for WordPress iframe)
const isEmbed = computed(() => route.query.embed === 'true')

const groups = ref<Group[]>([])
const groupTypes = ref<GroupType[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedGroup = ref<Group | null>(null)
const showList = ref(false)
const lifeGroupTypeId = ref<string | null>(null)

// Day of week colors
const dayColors: Record<string, { bg: string; text: string; pin: string }> = {
  Sunday: { bg: 'bg-red-100', text: 'text-red-800', pin: '#DC2626' },
  Monday: { bg: 'bg-orange-100', text: 'text-orange-800', pin: '#EA580C' },
  Tuesday: { bg: 'bg-amber-100', text: 'text-amber-800', pin: '#D97706' },
  Wednesday: { bg: 'bg-green-100', text: 'text-green-800', pin: '#16A34A' },
  Thursday: { bg: 'bg-blue-100', text: 'text-blue-800', pin: '#2563EB' },
  Friday: { bg: 'bg-purple-100', text: 'text-purple-800', pin: '#9333EA' },
  Saturday: { bg: 'bg-pink-100', text: 'text-pink-800', pin: '#DB2777' },
  Unknown: { bg: 'bg-gray-100', text: 'text-gray-800', pin: '#6B7280' },
}

// Day order for sorting
const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Unknown']

// Extract day of week from schedule string
// Handles formats like "Sundays 5-7pm", "Meets weekly on Sundays from 5-7pm", "Thursdays from 6:30-8pm"
function getDayFromSchedule(schedule: string | null): string {
  if (!schedule) return 'Unknown'
  // Match day of week anywhere in the string
  const match = schedule.match(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?/i)
  if (match && match[1]) {
    // Capitalize first letter, rest lowercase
    const day = match[1]
    return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase()
  }
  return 'Unknown'
}

// Filter to only LifeGroups
const filteredGroups = computed(() => {
  if (!lifeGroupTypeId.value) return groups.value
  return groups.value.filter(g => g.groupTypeId === lifeGroupTypeId.value)
})

// Groups organized by day of week
const groupsByDay = computed(() => {
  const byDay: Record<string, Group[]> = {}

  filteredGroups.value.forEach(group => {
    const day = getDayFromSchedule(group.schedule)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(group)
  })

  // Sort by day order and return as array of [day, groups] pairs
  return dayOrder
    .filter(day => byDay[day] && byDay[day].length > 0)
    .map(day => ({ day, groups: byDay[day] as Group[], colors: dayColors[day] }))
})

// Groups with valid locations for mapping
const mappableGroups = computed(() => {
  return filteredGroups.value.filter(g => g.location && g.location.lat && g.location.lng)
})

// Fetch groups from API
async function fetchGroups() {
  loading.value = true
  error.value = null

  try {
    const response = await fetch('/api/groups')
    if (!response.ok) {
      throw new Error('Failed to fetch groups')
    }

    const data = await response.json()
    groups.value = data.groups
    groupTypes.value = data.groupTypes

    // Find and set LifeGroups type ID
    const lifeGroupType = groupTypes.value.find(t =>
      t.name.toLowerCase().includes('lifegroup') || t.name.toLowerCase().includes('life group')
    )
    if (lifeGroupType) {
      lifeGroupTypeId.value = lifeGroupType.id
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

function handleMarkerClick(group: Group) {
  selectedGroup.value = group
}

function closeModal() {
  selectedGroup.value = null
}

onMounted(() => {
  fetchGroups()
})

// Update embed height when view changes or data loads
watch([showList, loading], () => {
  if (isEmbed.value) {
    setTimeout(updateEmbedHeight, 100)
  }
})
</script>

<template>
  <div :class="['min-h-screen bg-gray-50', { 'embed-mode': isEmbed }]">
    <!-- Main Content -->
    <main>
      <!-- Hero Section -->
      <FindYourFitHero />

      <!-- Filter Bar -->
      <div
        id="page-content"
        :class="[
          'bg-white border-b border-gray-200 sticky z-40',
          'top-0'
        ]"
      >
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <!-- View Toggle -->
            <div class="flex items-center gap-2">
              <button
                @click="showList = false"
                :class="[
                  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  !showList ? 'bg-[#095879] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
              >
                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Map
              </button>
              <button
                @click="showList = true"
                :class="[
                  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  showList ? 'bg-[#095879] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                ]"
              >
                <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                List
              </button>
            </div>

            <!-- Stats -->
            <div class="text-sm text-gray-500">
              {{ filteredGroups.length }} LifeGroups
              <span v-if="mappableGroups.length !== filteredGroups.length">
                ({{ mappableGroups.length }} on map)
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#095879] mx-auto mb-4"></div>
          <p class="text-gray-600">Loading groups...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="max-w-7xl mx-auto px-4 py-12">
        <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p class="text-red-800">{{ error }}</p>
          <button
            @click="fetchGroups"
            class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>

      <!-- Map View -->
      <div v-else-if="!showList" class="relative h-[600px]">
        <LifeGroupsMap
          :groups="mappableGroups"
          :day-colors="dayColors"
          :get-day-from-schedule="getDayFromSchedule"
          @marker-click="handleMarkerClick"
        />
        <!-- Legend -->
        <div class="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[1000]">
          <div class="text-xs font-semibold text-gray-700 mb-2">Meeting Day</div>
          <div class="flex flex-col gap-1">
            <div v-for="dayGroup in groupsByDay" :key="dayGroup.day" class="flex items-center gap-2">
              <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: dayGroup.colors?.pin }"></div>
              <span class="text-xs text-gray-600">{{ dayGroup.day }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- List View (grouped by day) -->
      <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div v-for="dayGroup in groupsByDay" :key="dayGroup.day" class="mb-10">
          <!-- Day Header -->
          <div class="flex items-center gap-3 mb-4">
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: dayGroup.colors?.pin }"></div>
            <h2 class="text-xl font-bold text-gray-900">{{ dayGroup.day }}</h2>
            <span class="text-sm text-gray-500">({{ dayGroup.groups?.length }} groups)</span>
          </div>
          <!-- Groups Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <LifeGroupCard
              v-for="group in dayGroup.groups"
              :key="group.id"
              :group="group"
              @click="selectedGroup = group"
            />
          </div>
        </div>
      </div>
    </main>

    <!-- Group Detail Modal -->
    <LifeGroupModal
      v-if="selectedGroup"
      :group="selectedGroup"
      @close="closeModal"
    />
  </div>
</template>

<style scoped>
.embed-mode {
  /* Remove any extra spacing for embedded mode */
}
</style>
