<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getSession, checkPermissions as checkCachedPermissions } from '@/lib/auth'
import { type TeamRequirements, getTeamDisplayName, getTeamRequirements } from '@/lib/teamMatrix'
import AppHeader from '@/components/AppHeader.vue'

interface TeamRow {
  key: string
  displayName: string
  requirements: TeamRequirements
}

const isLoading = ref(true)
const isAdmin = ref(false)
const teamData = ref<TeamRow[]>([])
const searchQuery = ref('')
const categoryFilter = ref<string>('all')
const hasChanges = ref(false)

// Column groups
const columnGroups = [
  {
    title: 'CLEARANCE & COMMITMENTS',
    bgColor: 'bg-blue-50',
    groupHeaderColor: 'bg-blue-400',  // Darkest - top row
    headerColor: 'bg-blue-200',        // Middle - column names row
    columns: [
      { key: 'backgroundCheck', label: 'Background Check' },
      { key: 'references', label: 'References' },
      { key: 'membership', label: 'RCC Member' },
      { key: 'covenant', label: 'Covenant', type: 'dropdown' }
    ]
  },
  {
    title: 'ORIENTATION & TRAINING',
    bgColor: 'bg-purple-50',
    groupHeaderColor: 'bg-purple-400',  // Darkest - top row
    headerColor: 'bg-purple-200',        // Middle - column names row
    columns: [
      { key: 'welcomeToRCC', label: 'Welcome to RCC' },
      { key: 'childSafety', label: 'Child Safety' },
      { key: 'mandatedReporter', label: 'Mandated Reporter' },
      { key: 'discipleship', label: 'Discipleship' },
      { key: 'leadership', label: 'Leadership' }
    ]
  },
  {
    title: 'SPIRITUAL GROWTH',
    bgColor: 'bg-green-50',
    groupHeaderColor: 'bg-green-400',  // Darkest - top row
    headerColor: 'bg-green-200',        // Middle - column names row
    columns: [
      { key: 'lifeGroup', label: 'LifeGroup Attendance' }
    ]
  }
]

// Team categories with proper organization
const teamGroups = [
  {
    title: 'LEADERSHIP',
    color: 'bg-purple-600',
    teams: ['staff', 'elder', 'ministry-leader', 'life-group']  // Specific order, not alphabetized
  },
  {
    title: 'RIVER PRESCHOOL',
    color: 'bg-pink-600',
    teams: ['preschool-leadership', 'preschool-staff']
  },
  {
    title: 'SERVICE TEAMS',
    color: 'bg-blue-600',
    teams: ['baptism', 'cafe', 'communion', 'connect', 'counting', 'kids-check-in', 'online-services', 'parking', 'production', 'reach-out', 'usher', 'worship']
  },
  {
    title: 'MINISTRIES',
    color: 'bg-green-600',
    teams: ['care', 'celebrate-recovery', 'core', 'divorce-care', 'fpu', 'grief-share', 'kids', 'marriage', 'men', 'moms', 'outreach', 'students', 'women']
  },
  {
    title: 'OPERATIONS',
    color: 'bg-gray-600',
    teams: ['finance', 'maintenance']
  }
]

// Get grouped teams for display
const groupedTeams = computed(() => {
  return teamGroups.map(group => {
    const teamsInGroup = teamData.value.filter(team => group.teams.includes(team.key))

    // Apply search filter
    let filtered = teamsInGroup
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      filtered = filtered.filter(team =>
        team.displayName.toLowerCase().includes(query) ||
        team.key.toLowerCase().includes(query)
      )
    }

    // Sort teams: Leadership uses specific order, others alphabetically
    if (group.title === 'LEADERSHIP') {
      // Sort by the order defined in group.teams array
      filtered.sort((a, b) => {
        return group.teams.indexOf(a.key) - group.teams.indexOf(b.key)
      })
    } else {
      // Sort alphabetically by display name
      filtered.sort((a, b) => a.displayName.localeCompare(b.displayName))
    }

    return {
      ...group,
      teams: filtered
    }
  }).filter(group => group.teams.length > 0) // Only show groups with teams
})

// Get covenant level from requirements
function getCovenantLevel(requirements: TeamRequirements): number {
  if (requirements.publicPresence) return 3
  if (requirements.moralConduct) return 2
  if (requirements.covenant) return 1
  return 0
}

// Set covenant level
function setCovenantLevel(teamKey: string, level: number) {
  const team = teamData.value.find(t => t.key === teamKey)
  if (team) {
    team.requirements.covenant = level >= 1
    team.requirements.moralConduct = level >= 2
    team.requirements.publicPresence = level >= 3
    hasChanges.value = true
  }
}

// Toggle requirement
function toggleRequirement(teamKey: string, requirementKey: keyof TeamRequirements) {
  const team = teamData.value.find(t => t.key === teamKey)
  if (team) {
    team.requirements[requirementKey] = !team.requirements[requirementKey]
    hasChanges.value = true
  }
}

// Save changes
async function saveChanges() {
  try {
    const session = getSession()
    if (!session) return

    // Call API to save changes
    const response = await fetch('/api/admin/team-requirements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        teams: teamData.value.reduce((acc, team) => {
          acc[team.key] = team.requirements
          return acc
        }, {} as Record<string, TeamRequirements>)
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save changes')
    }

    hasChanges.value = false
    alert('Changes saved successfully!')
  } catch (error) {
    console.error('Failed to save changes:', error)
    alert('Failed to save changes. Please try again.')
  }
}

// Reset changes
function resetChanges() {
  if (confirm('Are you sure you want to discard all changes?')) {
    loadTeamData()
    hasChanges.value = false
  }
}

// Load team data
async function loadTeamData() {
  try {
    const session = getSession()

    // First, load defaults from the matrix
    const defaults = Object.entries(getTeamRequirements()).reduce((acc, [key, requirements]) => {
      acc[key] = { ...requirements }
      return acc
    }, {} as Record<string, TeamRequirements>)

    // Then try to load saved overrides from the API
    if (session) {
      try {
        const response = await fetch('/api/admin/team-requirements', {
          headers: {
            'Authorization': `Bearer ${session.token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          // Merge saved config with defaults
          Object.assign(defaults, data.teams)
        }
      } catch (error) {
        console.warn('Could not load saved team requirements, using defaults:', error)
      }
    }

    // Convert to array for display
    teamData.value = Object.entries(defaults).map(([key, requirements]) => ({
      key,
      displayName: getTeamDisplayName(key),
      requirements
    }))
  } catch (error) {
    console.error('Failed to load team data:', error)
    // Fall back to defaults only
    teamData.value = Object.entries(getTeamRequirements()).map(([key, requirements]) => ({
      key,
      displayName: getTeamDisplayName(key),
      requirements: { ...requirements }
    }))
  }
}

// Check if user is admin (uses cache)
async function checkAdminStatus() {
  try {
    const session = getSession()
    if (!session) {
      isLoading.value = false
      return
    }

    // Use cached permissions
    const permissions = await checkCachedPermissions()
    isAdmin.value = permissions.isAdmin

    isLoading.value = false
  } catch (error) {
    console.error('Failed to check admin status:', error)
    isLoading.value = false
  }
}

onMounted(async () => {
  await checkAdminStatus()
  if (isAdmin.value) {
    await loadTeamData()
  }
})
</script>

<template>
  <!-- Loading -->
  <div v-if="isLoading" class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
    <div class="text-center">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-gray-600">Checking permissions...</p>
    </div>
  </div>

  <!-- Not Admin -->
  <div v-else-if="!isAdmin" class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-lg p-12 max-w-md w-full text-center">
      <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
      <p class="text-gray-600 mb-6">You must be a Planning Center admin to access this page.</p>
      <a href="/" class="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
        Go to Home
      </a>
    </div>
  </div>

  <!-- Admin Interface -->
  <div v-else class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
    <!-- Header with Sub-Navigation -->
    <AppHeader title="Admin" :showAdminSubNav="true">
      <template #admin-actions>
        <button
          v-if="hasChanges"
          @click="resetChanges"
          class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
        >
          Discard Changes
        </button>
        <button
          v-if="hasChanges"
          @click="saveChanges"
          class="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all shadow-md hover:shadow-lg text-sm"
        >
          Save Changes
        </button>
      </template>
    </AppHeader>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-4">
        <h2 class="text-2xl font-bold text-gray-900">Team Requirements Matrix</h2>
        <p class="text-sm text-gray-600 mt-1">Manage onboarding requirements for all volunteer teams</p>
      </div>

      <!-- Search -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <label class="block text-sm font-semibold text-gray-700 mb-2">Search Teams</label>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by team name..."
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <!-- Change indicator -->
      <div v-if="hasChanges" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          <p class="text-sm font-semibold text-yellow-800">You have unsaved changes</p>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <!-- Header with column groups -->
            <thead>
              <tr>
                <th rowspan="2" class="px-6 py-4 text-left text-sm font-bold text-white bg-slate-700 sticky left-0 z-20 border-r border-slate-600">
                  TEAM
                </th>
                <th
                  v-for="group in columnGroups"
                  :key="group.title"
                  :colspan="group.columns.length"
                  class="px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-700 border-b border-gray-300"
                  :class="group.groupHeaderColor"
                >
                  {{ group.title }}
                </th>
              </tr>
              <tr>
                <template v-for="group in columnGroups" :key="'cols-' + group.title">
                  <th
                    v-for="col in group.columns"
                    :key="col.key"
                    class="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-600 border-b-2 border-gray-400"
                    :class="group.headerColor"
                  >
                    {{ col.label }}
                  </th>
                </template>
              </tr>
            </thead>

            <!-- Body with grouped teams -->
            <tbody>
              <template v-for="group in groupedTeams" :key="group.title">
                <!-- Category Header Row -->
                <tr>
                  <td :colspan="columnGroups.reduce((sum, g) => sum + g.columns.length, 0) + 1" class="px-4 py-2 text-xs font-bold uppercase tracking-wide text-white" :class="group.color">
                    {{ group.title }}
                  </td>
                </tr>

                <!-- Team Rows -->
                <tr
                  v-for="team in group.teams"
                  :key="team.key"
                  class="hover:bg-gray-50 transition-colors border-b border-gray-200"
                >
                  <td class="px-6 py-3 text-sm font-semibold text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200">
                    {{ team.displayName }}
                  </td>

                  <!-- Column groups -->
                  <template v-for="group in columnGroups" :key="'data-' + group.title">
                    <td
                      v-for="col in group.columns"
                      :key="col.key"
                      class="px-3 py-3 text-center"
                      :class="group.bgColor"
                    >
                      <!-- Covenant Dropdown -->
                      <select
                        v-if="col.type === 'dropdown'"
                        :value="getCovenantLevel(team.requirements)"
                        @change="setCovenantLevel(team.key, Number(($event.target as HTMLSelectElement).value))"
                        class="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="0">None</option>
                        <option value="1">Level 1</option>
                        <option value="2">Level 2</option>
                        <option value="3">Level 3</option>
                      </select>

                      <!-- Regular Checkbox -->
                      <input
                        v-else
                        type="checkbox"
                        :checked="team.requirements[col.key as keyof TeamRequirements]"
                        @change="toggleRequirement(team.key, col.key as keyof TeamRequirements)"
                        class="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                      />
                    </td>
                  </template>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Results count -->
      <div class="mt-4 text-center text-sm text-gray-600">
        Showing {{ groupedTeams.reduce((sum, g) => sum + g.teams.length, 0) }} teams
      </div>
    </main>
  </div>
</template>
