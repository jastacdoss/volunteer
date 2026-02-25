<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import UncommonMenu from '@/components/UncommonMenu.vue'

interface Participant {
  id: string
  first_name: string
  last_name: string
  checkin_number: number
  location_name: string
  teams: {
    name: string
    color_hex: string
  } | null
  man_cards: Array<{
    id: string
    black_marks: number
    red_marks: number
    completed: boolean
  }>
}

interface TeamScore {
  team_id: string
  team_name: string
  color_hex: string
  total_score: number
  participant_count: number
  points_log_total: number
}

const pin = ref('')
const authenticated = ref(false)
const searchQuery = ref('')
const allParticipants = ref<Participant[]>([])
const teamScores = ref<TeamScore[]>([])
const selectedParticipant = ref<Participant | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const successMessage = ref('')

// Local form values for optimistic updates
const localBlackMarks = ref(0)
const localRedMarks = ref(0)
const previousBlackMarks = ref(0)
const previousRedMarks = ref(0)

// Team points modal state
const showTeamModal = ref(false)
const selectedTeam = ref<TeamScore | null>(null)
const teamPoints = ref(0)
const teamReason = ref('')
const savingTeamPoints = ref(false)

// Filter participants by search query
const filteredParticipants = computed(() => {
  if (!searchQuery.value.trim()) {
    return allParticipants.value
  }
  const q = searchQuery.value.toLowerCase()
  return allParticipants.value.filter(p =>
    p.first_name.toLowerCase().includes(q) ||
    p.last_name.toLowerCase().includes(q) ||
    String(p.checkin_number).includes(q)
  )
})

async function verifyPin() {
  try {
    const response = await fetch('/api/uncommon/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin.value })
    })
    const data = await response.json()
    if (data.valid) {
      authenticated.value = true
      error.value = ''
      loadAllParticipants()
    } else {
      error.value = 'Invalid PIN'
    }
  } catch (e) {
    error.value = 'Failed to verify PIN'
  }
}

async function loadAllParticipants() {
  loading.value = true
  try {
    const [participantsRes, scoresRes] = await Promise.all([
      fetch('/api/uncommon/participants?all=true', { headers: { 'x-uncommon-pin': pin.value } }),
      fetch('/api/uncommon/scores')
    ])
    if (!participantsRes.ok) throw new Error('Failed to load participants')
    const participantsData = await participantsRes.json()
    allParticipants.value = participantsData.participants

    if (scoresRes.ok) {
      const scoresData = await scoresRes.json()
      teamScores.value = scoresData.scores || []
    }
    error.value = ''
  } catch (e) {
    error.value = 'Failed to load participants'
  } finally {
    loading.value = false
  }
}

function selectParticipant(p: Participant) {
  selectedParticipant.value = p
  const card = p.man_cards?.[0]
  localBlackMarks.value = card?.black_marks || 0
  localRedMarks.value = card?.red_marks || 0
  previousBlackMarks.value = localBlackMarks.value
  previousRedMarks.value = localRedMarks.value
  // Auto-focus black marks input
  nextTick(() => {
    document.getElementById('black-marks-input')?.focus()
  })
}

function clearSelection() {
  selectedParticipant.value = null
  searchQuery.value = ''
  // Auto-focus search input
  nextTick(() => {
    document.getElementById('search-input')?.focus()
  })
}

function refreshAndClear() {
  clearSelection()
  loadAllParticipants()
}

async function saveMarks() {
  if (!selectedParticipant.value) return

  saving.value = true

  // Store previous values for rollback
  previousBlackMarks.value = selectedParticipant.value.man_cards?.[0]?.black_marks || 0
  previousRedMarks.value = selectedParticipant.value.man_cards?.[0]?.red_marks || 0

  try {
    const response = await fetch(`/api/uncommon/participants/${selectedParticipant.value.id}/marks`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-uncommon-pin': pin.value
      },
      body: JSON.stringify({
        black_marks: localBlackMarks.value,
        red_marks: localRedMarks.value
      })
    })

    if (!response.ok) {
      // Rollback on error
      localBlackMarks.value = previousBlackMarks.value
      localRedMarks.value = previousRedMarks.value
      throw new Error('Failed to save')
    }

    const data = await response.json()

    // Update local data with server response
    if (selectedParticipant.value.man_cards?.[0]) {
      selectedParticipant.value.man_cards[0] = data.manCard
    }

    successMessage.value = 'Saved!'
    setTimeout(() => successMessage.value = '', 2000)

    // Refresh data and go back to search
    refreshAndClear()

  } catch (e) {
    error.value = 'Failed to save marks'
    setTimeout(() => error.value = '', 3000)
  } finally {
    saving.value = false
  }
}

function handleEnter(field: 'black' | 'red') {
  if (field === 'black') {
    // Move to red marks input
    const redInput = document.getElementById('red-marks-input')
    redInput?.focus()
  } else {
    // Save and close
    saveMarks()
  }
}

const isComplete = () => localBlackMarks.value + localRedMarks.value >= 10

// Team points modal functions
function openTeamModal(team: TeamScore) {
  selectedTeam.value = team
  teamPoints.value = 0
  teamReason.value = ''
  showTeamModal.value = true
  nextTick(() => {
    document.getElementById('team-points-input')?.focus()
  })
}

function closeTeamModal() {
  showTeamModal.value = false
  selectedTeam.value = null
  teamPoints.value = 0
  teamReason.value = ''
}

async function saveTeamPoints() {
  if (!selectedTeam.value || teamPoints.value === 0) return

  savingTeamPoints.value = true
  try {
    const response = await fetch(`/api/uncommon/teams/${selectedTeam.value.team_id}/points`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-uncommon-pin': pin.value
      },
      body: JSON.stringify({
        points: teamPoints.value,
        reason: teamReason.value || null
      })
    })

    if (!response.ok) throw new Error('Failed to add points')

    successMessage.value = `${teamPoints.value > 0 ? '+' : ''}${teamPoints.value} points added to ${selectedTeam.value.team_name}!`
    setTimeout(() => successMessage.value = '', 3000)

    closeTeamModal()
    loadAllParticipants() // Refresh scores

  } catch (e) {
    error.value = 'Failed to add team points'
    setTimeout(() => error.value = '', 3000)
  } finally {
    savingTeamPoints.value = false
  }
}

function handleTeamEnter() {
  if (teamPoints.value !== 0) {
    saveTeamPoints()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showTeamModal.value) {
      closeTeamModal()
    } else if (selectedParticipant.value) {
      clearSelection()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-4">
    <UncommonMenu />
    <!-- PIN Entry -->
    <div v-if="!authenticated" class="max-w-sm mx-auto mt-20">
      <h1 class="text-2xl font-bold text-center mb-6">Points Entry</h1>
      <div class="space-y-4">
        <input
          v-model="pin"
          type="password"
          placeholder="Enter PIN"
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
    <div v-else class="flex gap-4 max-w-6xl mx-auto">
      <!-- Left Column: Participants -->
      <div class="flex-1 min-w-0">
        <h1 class="text-2xl font-bold text-center mb-4">Points Entry</h1>

        <!-- Success Message -->
        <div v-if="successMessage" class="bg-green-600 text-white px-4 py-2 rounded-lg text-center mb-4">
          {{ successMessage }}
        </div>

        <!-- Error Message -->
        <div v-if="error" class="bg-red-600 text-white px-4 py-2 rounded-lg text-center mb-4">
          {{ error }}
        </div>

        <!-- Selected Participant -->
        <div v-if="selectedParticipant" class="bg-gray-800 rounded-lg p-4 mb-4">
        <div class="flex justify-between items-start mb-4">
          <div>
            <div class="text-xl font-bold">
              {{ selectedParticipant.first_name }} {{ selectedParticipant.last_name }}
            </div>
            <div class="text-gray-400">
              #{{ selectedParticipant.checkin_number }} - {{ selectedParticipant.location_name }}
            </div>
          </div>
          <div
            v-if="selectedParticipant.teams"
            class="px-3 py-1 rounded font-bold"
            :style="{ backgroundColor: selectedParticipant.teams.color_hex }"
          >
            {{ selectedParticipant.teams.name }}
          </div>
        </div>

        <!-- Marks Input -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">Black Marks</label>
            <input
              id="black-marks-input"
              v-model.number="localBlackMarks"
              type="number"
              min="0"
              max="12"
              class="w-full px-4 py-3 rounded-lg bg-gray-700 text-center text-2xl font-bold"
              @keyup.enter="handleEnter('black')"
              @keyup.escape="clearSelection"
            />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Red Marks</label>
            <input
              id="red-marks-input"
              v-model.number="localRedMarks"
              type="number"
              min="0"
              max="12"
              class="w-full px-4 py-3 rounded-lg bg-gray-700 text-center text-2xl font-bold text-red-400"
              @keyup.enter="handleEnter('red')"
              @keyup.escape="clearSelection"
            />
          </div>
        </div>

        <!-- Completion Status -->
        <div v-if="isComplete()" class="text-center text-green-400 font-bold mb-4">
          COMPLETE! (+5 bonus points)
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-4">
          <button
            @click="clearSelection"
            class="flex-1 py-3 bg-gray-700 rounded-lg font-semibold hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            @click="saveMarks"
            :disabled="saving"
            class="flex-1 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>

      <!-- Search and List -->
      <div v-else>
        <input
          id="search-input"
          v-model="searchQuery"
          type="text"
          placeholder="Search by name or check-in #"
          class="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-lg mb-4"
          autofocus
        />

        <!-- Loading -->
        <div v-if="loading" class="text-center py-8 text-gray-400">
          Loading participants...
        </div>

        <!-- Results -->
        <div v-else-if="filteredParticipants.length > 0" class="space-y-2 max-h-[70vh] overflow-y-auto">
          <div
            v-for="p in filteredParticipants"
            :key="p.id"
            @click="selectParticipant(p)"
            class="bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-700 flex justify-between items-center"
          >
            <div>
              <div class="font-semibold">{{ p.first_name }} {{ p.last_name }}</div>
              <div class="text-sm text-gray-400">#{{ p.checkin_number }} - {{ p.location_name }}</div>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-sm">
                <span class="text-gray-400">B:</span> {{ p.man_cards?.[0]?.black_marks || 0 }}
                <span class="text-red-400 ml-2">R:</span> {{ p.man_cards?.[0]?.red_marks || 0 }}
              </div>
              <div
                v-if="p.teams"
                class="w-4 h-4 rounded-full"
                :style="{ backgroundColor: p.teams.color_hex }"
              ></div>
            </div>
          </div>
        </div>

        <!-- No Results -->
        <div v-else-if="!loading" class="text-center py-8 text-gray-400">
          No participants found
        </div>
      </div>
      </div>

      <!-- Right Column: Team Scores (sticky, clickable for bonus points) -->
      <div class="w-48 flex-shrink-0">
        <div class="sticky top-4">
          <h2 class="text-lg font-bold mb-3 text-center">Team Scores</h2>
          <p class="text-xs text-gray-500 text-center mb-2">Click to add bonus points</p>
          <div class="space-y-2">
            <div
              v-for="team in teamScores"
              :key="team.team_id"
              @click="openTeamModal(team)"
              class="rounded-lg p-2 text-center cursor-pointer hover:scale-105 transition-transform"
              :style="{ backgroundColor: team.color_hex + '30', borderColor: team.color_hex, borderWidth: '1px' }"
            >
              <div class="text-2xl font-black">{{ team.total_score }}</div>
              <div class="text-xs" :style="{ color: team.color_hex }">{{ team.team_name }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Team Points Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showTeamModal && selectedTeam"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          @click.self="closeTeamModal"
        >
          <div class="bg-gray-800 rounded-lg shadow-xl w-80 mx-4">
            <!-- Modal Header -->
            <div
              class="px-4 py-3 rounded-t-lg text-center"
              :style="{ backgroundColor: selectedTeam.color_hex }"
            >
              <h3 class="text-xl font-bold text-white">{{ selectedTeam.team_name }}</h3>
            </div>

            <!-- Modal Body -->
            <div class="p-4">
              <div class="text-center text-gray-400 mb-4">
                Current Bonus: {{ selectedTeam.points_log_total || 0 }}
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm text-gray-400 mb-1">Points (negative to subtract)</label>
                  <input
                    id="team-points-input"
                    v-model.number="teamPoints"
                    type="number"
                    class="w-full px-4 py-3 rounded-lg bg-gray-700 text-center text-3xl font-bold text-white"
                    @keyup.enter="handleTeamEnter"
                  />
                </div>

                <div>
                  <label class="block text-sm text-gray-400 mb-1">Reason (optional)</label>
                  <input
                    v-model="teamReason"
                    type="text"
                    placeholder="e.g., Won challenge"
                    class="w-full px-4 py-2 rounded-lg bg-gray-700 text-white"
                    @keyup.enter="handleTeamEnter"
                  />
                </div>

                <div class="flex gap-3 pt-2">
                  <button
                    @click="closeTeamModal"
                    class="flex-1 py-2 bg-gray-700 rounded-lg font-semibold hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    @click="saveTeamPoints"
                    :disabled="savingTeamPoints || teamPoints === 0"
                    class="flex-1 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {{ savingTeamPoints ? 'Adding...' : 'Add' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
