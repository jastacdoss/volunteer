<script setup lang="ts">
import { ref, onMounted } from 'vue'
import UncommonMenu from '@/components/UncommonMenu.vue'

interface Team {
  id: string
  name: string
  color_hex: string
  leader_pco_id: string | null
  leader_name: string | null
  leader_email: string | null
}

interface SmallGroup {
  id: string
  name: string
  group_type: string
  team_id: string
  teams: {
    name: string
    color_hex: string
  }
  leader_pco_id: string | null
  leader_name: string | null
  leader_email: string | null
}

interface PcoPerson {
  id: string
  name: string
  email: string | null
  phone: string | null
}

const pin = ref('')
const authenticated = ref(false)
const isAdmin = ref(false)
const teams = ref<Team[]>([])
const smallGroups = ref<SmallGroup[]>([])
const loading = ref(true)
const error = ref('')
const successMessage = ref('')

// Assignment modal state
const showModal = ref(false)
const assignmentType = ref<'team' | 'group' | 'youth'>('team')
const assignmentTarget = ref<Team | SmallGroup | null>(null)
const youthType = ref<'jh' | 'hs' | null>(null)
const searchQuery = ref('')
const searchResults = ref<PcoPerson[]>([])
const searching = ref(false)
const assigning = ref(false)

// Get current youth leader (first one found for that type)
function getYouthLeader(type: 'jh' | 'hs') {
  const group = smallGroups.value.find(g => g.group_type === type && g.leader_name)
  return group?.leader_name || null
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function verifyPin() {
  try {
    const response = await fetch('/api/uncommon/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.value })
    })
    const data = await response.json()
    if (data.valid && data.isAdmin) {
      authenticated.value = true
      isAdmin.value = true
      error.value = ''
      fetchData()
    } else if (data.valid) {
      error.value = 'Admin PIN required'
    } else {
      error.value = 'Invalid PIN'
    }
  } catch (e) {
    error.value = 'Failed to verify PIN'
  }
}

async function fetchData() {
  loading.value = true
  try {
    const [teamsRes, groupsRes] = await Promise.all([
      fetch('/api/uncommon/teams', { headers: { 'x-uncommon-pin': pin.value } }),
      fetch('/api/uncommon/small-groups', { headers: { 'x-uncommon-pin': pin.value } })
    ])

    if (!teamsRes.ok || !groupsRes.ok) throw new Error('Failed to fetch data')

    const teamsData = await teamsRes.json()
    const groupsData = await groupsRes.json()

    // Extract teams from scores (which has the team data we need)
    teams.value = teamsData.teams.map((t: any) => ({
      id: t.team_id,
      name: t.team_name,
      color_hex: t.color_hex,
      leader_pco_id: t.leader_pco_id,
      leader_name: t.team_leader,
      leader_email: t.leader_email
    }))
    smallGroups.value = groupsData.groups
  } catch (e) {
    error.value = 'Failed to load data'
  } finally {
    loading.value = false
  }
}

function openAssignModal(type: 'team' | 'group', target: Team | SmallGroup) {
  assignmentType.value = type
  assignmentTarget.value = target
  youthType.value = null
  searchQuery.value = ''
  searchResults.value = []
  showModal.value = true
}

function openYouthModal(type: 'jh' | 'hs') {
  assignmentType.value = 'youth'
  assignmentTarget.value = null
  youthType.value = type
  searchQuery.value = ''
  searchResults.value = []
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  assignmentTarget.value = null
  searchQuery.value = ''
  searchResults.value = []
}

async function searchPeople() {
  if (!searchQuery.value.trim() || searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  searching.value = true
  try {
    const response = await fetch(`/api/uncommon/search-pco?q=${encodeURIComponent(searchQuery.value)}`, {
      headers: { 'x-uncommon-pin': pin.value }
    })
    if (!response.ok) throw new Error('Search failed')
    const data = await response.json()
    searchResults.value = data.people
  } catch (e) {
    console.error('Search error:', e)
  } finally {
    searching.value = false
  }
}

function debounceSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(searchPeople, 300)
}

async function assignLeader(person: PcoPerson) {
  if (!assignmentTarget.value && assignmentType.value !== 'youth') return

  assigning.value = true
  try {
    if (assignmentType.value === 'youth' && youthType.value) {
      // Assign to ALL groups of this youth type
      const groupsToUpdate = smallGroups.value.filter(g => g.group_type === youthType.value)
      await Promise.all(groupsToUpdate.map(group =>
        fetch(`/api/uncommon/small-groups/${group.id}/leader`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-uncommon-pin': pin.value
          },
          body: JSON.stringify({
            pcoId: person.id,
            name: person.name,
            email: person.email
          })
        })
      ))
    } else {
      const endpoint = assignmentType.value === 'team'
        ? `/api/uncommon/teams/${assignmentTarget.value!.id}/leader`
        : `/api/uncommon/small-groups/${assignmentTarget.value!.id}/leader`

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-uncommon-pin': pin.value
        },
        body: JSON.stringify({
          pcoId: person.id,
          name: person.name,
          email: person.email
        })
      })

      if (!response.ok) throw new Error('Assignment failed')
    }

    successMessage.value = `${person.name} assigned as leader!`
    setTimeout(() => successMessage.value = '', 3000)

    closeModal()
    fetchData()

  } catch (e) {
    error.value = 'Failed to assign leader'
    setTimeout(() => error.value = '', 3000)
  } finally {
    assigning.value = false
  }
}

async function removeLeader() {
  if (!assignmentTarget.value && assignmentType.value !== 'youth') return

  assigning.value = true
  try {
    if (assignmentType.value === 'youth' && youthType.value) {
      // Remove from ALL groups of this youth type
      const groupsToUpdate = smallGroups.value.filter(g => g.group_type === youthType.value)
      await Promise.all(groupsToUpdate.map(group =>
        fetch(`/api/uncommon/small-groups/${group.id}/leader`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-uncommon-pin': pin.value
          },
          body: JSON.stringify({
            pcoId: null,
            name: null,
            email: null
          })
        })
      ))
    } else {
      const endpoint = assignmentType.value === 'team'
        ? `/api/uncommon/teams/${assignmentTarget.value!.id}/leader`
        : `/api/uncommon/small-groups/${assignmentTarget.value!.id}/leader`

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-uncommon-pin': pin.value
        },
        body: JSON.stringify({
          pcoId: null,
          name: null,
          email: null
        })
      })

      if (!response.ok) throw new Error('Removal failed')
    }

    successMessage.value = 'Leader removed'
    setTimeout(() => successMessage.value = '', 3000)

    closeModal()
    fetchData()

  } catch (e) {
    error.value = 'Failed to remove leader'
    setTimeout(() => error.value = '', 3000)
  } finally {
    assigning.value = false
  }
}

onMounted(() => {
  // Component mounted
})
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-4">
    <UncommonMenu />
    <!-- PIN Entry -->
    <div v-if="!authenticated" class="max-w-sm mx-auto mt-20">
      <h1 class="text-2xl font-bold text-center mb-6">Leaders Admin</h1>
      <div class="space-y-4">
        <input
          v-model="pin"
          type="password"
          placeholder="Enter Admin PIN"
          class="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-center text-xl"
          @keyup.enter="verifyPin"
        />
        <button
          @click="verifyPin"
          class="w-full py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700"
        >
          Enter
        </button>
        <p v-if="error" class="text-red-400 text-center">{{ error }}</p>
      </div>
    </div>

    <!-- Main Interface -->
    <div v-else class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold text-center mb-4">Leaders Admin</h1>

      <!-- Success Message -->
      <div v-if="successMessage" class="bg-green-600 text-white px-4 py-2 rounded-lg text-center mb-4">
        {{ successMessage }}
      </div>

      <!-- Error Message -->
      <div v-if="error" class="bg-red-600 text-white px-4 py-2 rounded-lg text-center mb-4">
        {{ error }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-10">
        <div class="text-gray-400">Loading...</div>
      </div>

      <div v-else>
        <!-- Team Leaders -->
        <div class="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 class="text-xl font-semibold mb-4">Team Leaders</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div
              v-for="team in teams"
              :key="team.id"
              @click="openAssignModal('team', team)"
              class="p-4 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              :style="{ backgroundColor: team.color_hex + '30', borderColor: team.color_hex, borderWidth: '2px' }"
            >
              <div class="font-bold text-lg mb-2" :style="{ color: team.color_hex }">
                {{ team.name }}
              </div>
              <div v-if="team.leader_name" class="text-sm">
                <div class="font-medium">{{ team.leader_name }}</div>
                <div class="text-gray-400 text-xs truncate">{{ team.leader_email }}</div>
              </div>
              <div v-else class="text-sm text-gray-500 italic">
                Click to assign leader
              </div>
            </div>
          </div>
        </div>

        <!-- Small Group Leaders -->
        <div class="bg-gray-800 rounded-lg p-6">
          <h2 class="text-xl font-semibold mb-4">Small Group Leaders</h2>

          <!-- Adults -->
          <div class="mb-6">
            <h3 class="text-lg font-medium text-gray-400 mb-3">Adults</h3>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div
                v-for="group in smallGroups.filter(g => g.group_type === 'adult')"
                :key="group.id"
                @click="openAssignModal('group', group)"
                class="p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                :style="{ backgroundColor: group.teams.color_hex + '20' }"
              >
                <div class="font-semibold" :style="{ color: group.teams.color_hex }">
                  {{ group.name }}
                </div>
                <div v-if="group.leader_name" class="text-xs mt-1">
                  {{ group.leader_name }}
                </div>
                <div v-else class="text-xs text-gray-500 italic mt-1">
                  No leader
                </div>
              </div>
            </div>
          </div>

          <!-- Youth - Single leader per age group -->
          <div>
            <h3 class="text-lg font-medium text-gray-400 mb-3">Youth</h3>
            <div class="grid grid-cols-2 gap-4">
              <!-- Jr High -->
              <div
                @click="openYouthModal('jh')"
                class="p-4 rounded-lg cursor-pointer hover:opacity-80 transition-opacity bg-purple-900/30 border-2 border-purple-500"
              >
                <div class="font-bold text-lg text-purple-400">Jr High (all teams)</div>
                <div v-if="getYouthLeader('jh')" class="text-sm mt-1">
                  {{ getYouthLeader('jh') }}
                </div>
                <div v-else class="text-sm text-gray-500 italic mt-1">
                  Click to assign leader
                </div>
              </div>
              <!-- High School -->
              <div
                @click="openYouthModal('hs')"
                class="p-4 rounded-lg cursor-pointer hover:opacity-80 transition-opacity bg-indigo-900/30 border-2 border-indigo-500"
              >
                <div class="font-bold text-lg text-indigo-400">High School (all teams)</div>
                <div v-if="getYouthLeader('hs')" class="text-sm mt-1">
                  {{ getYouthLeader('hs') }}
                </div>
                <div v-else class="text-sm text-gray-500 italic mt-1">
                  Click to assign leader
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Assignment Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
        @click.self="closeModal"
      >
        <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md">
          <h3 class="text-xl font-semibold mb-4">
            Assign Leader - {{ assignmentType === 'youth' ? (youthType === 'jh' ? 'Jr High (all)' : 'High School (all)') : (assignmentTarget as any)?.name }}
          </h3>

          <!-- Current Leader -->
          <div v-if="assignmentType === 'youth' ? getYouthLeader(youthType!) : (assignmentTarget as any)?.leader_name" class="mb-4 p-3 bg-gray-700 rounded-lg">
            <div class="text-sm text-gray-400">Current Leader</div>
            <div class="font-medium">{{ assignmentType === 'youth' ? getYouthLeader(youthType!) : (assignmentTarget as any)?.leader_name }}</div>
            <button
              @click="removeLeader"
              :disabled="assigning"
              class="mt-2 text-sm text-red-400 hover:text-red-300"
            >
              Remove Leader
            </button>
          </div>

          <!-- Search -->
          <div class="mb-4">
            <input
              v-model="searchQuery"
              @input="debounceSearch"
              type="text"
              placeholder="Search by name or phone"
              class="w-full px-4 py-3 rounded-lg bg-gray-700"
              autofocus
            />
          </div>

          <!-- Search Results -->
          <div class="max-h-60 overflow-y-auto">
            <div v-if="searching" class="text-center py-4 text-gray-400">
              Searching...
            </div>
            <div v-else-if="searchResults.length === 0 && searchQuery.length >= 2" class="text-center py-4 text-gray-400">
              No results found
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="person in searchResults"
                :key="person.id"
                @click="assignLeader(person)"
                class="p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600"
              >
                <div class="font-medium">{{ person.name }}</div>
                <div class="text-sm text-gray-400">
                  <span v-if="person.email">{{ person.email }}</span>
                  <span v-if="person.email && person.phone"> | </span>
                  <span v-if="person.phone">{{ person.phone }}</span>
                  <span v-if="!person.email && !person.phone">No contact info</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Cancel Button -->
          <button
            @click="closeModal"
            class="mt-4 w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
