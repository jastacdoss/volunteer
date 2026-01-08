<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import LifeGroupsMap from '@/components/lifegroups/LifeGroupsMap.vue'
import LifeGroupCard from '@/components/lifegroups/LifeGroupCard.vue'
import LifeGroupModal from '@/components/lifegroups/LifeGroupModal.vue'

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

// Filter to only LifeGroups
const filteredGroups = computed(() => {
  if (!lifeGroupTypeId.value) return groups.value
  return groups.value.filter(g => g.groupTypeId === lifeGroupTypeId.value)
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
</script>

<template>
  <div :class="['min-h-screen bg-gray-50', { 'embed-mode': isEmbed }]">
    <!-- Main Content -->
    <main>
      <!-- Hero Section (hidden in embed mode) -->
      <section v-if="!isEmbed" class="bg-gradient-to-br from-[#095879] to-[#0a6d94] text-white py-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center">
            <h1 class="text-4xl md:text-5xl font-bold mb-4">Find a LifeGroup</h1>
            <p class="text-xl text-white/90 max-w-2xl mx-auto">
              LifeGroups meet in homes throughout the week. Find one near you and start building meaningful relationships.
            </p>
          </div>
        </div>
      </section>

      <!-- Filter Bar -->
      <div :class="[
        'bg-white border-b border-gray-200 sticky z-40',
        isEmbed ? 'top-0' : 'top-0'
      ]">
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
      <div v-else-if="!showList" :class="isEmbed ? 'h-[calc(100vh-56px)]' : 'h-[600px]'">
        <LifeGroupsMap
          :groups="mappableGroups"
          @marker-click="handleMarkerClick"
        />
      </div>

      <!-- List View -->
      <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LifeGroupCard
            v-for="group in filteredGroups"
            :key="group.id"
            :group="group"
            @click="selectedGroup = group"
          />
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
