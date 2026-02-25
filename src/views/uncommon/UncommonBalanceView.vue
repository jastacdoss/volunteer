<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import UncommonMenu from '@/components/UncommonMenu.vue'

interface TeamBalance {
  team_id: string
  team_name: string
  color_hex: string
  leader_name: string | null
  count: number
}

interface GroupCount {
  small_group_id: string
  group_name: string
  group_type: string
  team_name: string
  color_hex: string
  leader_name: string | null
  participant_count: number
}

interface GroupParticipant {
  id: string
  first_name: string
  last_name: string
  checkin_number: number
  small_groups: {
    name: string
    group_type: string
    teams: {
      name: string
      color_hex: string
    }
  } | null
}

const teamBalances = ref<TeamBalance[]>([])
const groupCounts = ref<GroupCount[]>([])
const loading = ref(true)
const error = ref('')

// Modal state
const showModal = ref(false)
const modalTitle = ref('')
const modalColor = ref('#888')
const modalParticipants = ref<GroupParticipant[]>([])
const modalLoading = ref(false)

let pollInterval: ReturnType<typeof setInterval> | null = null

const minTeamCount = computed(() => Math.min(...teamBalances.value.map(t => t.count)))

// Only adult groups for the table
const adultGroups = computed(() => groupCounts.value.filter(g => g.group_type === 'adult'))

// Aggregated youth counts
const jhTotal = computed(() =>
  groupCounts.value.filter(g => g.group_type === 'jh').reduce((sum, g) => sum + g.participant_count, 0)
)
const hsTotal = computed(() =>
  groupCounts.value.filter(g => g.group_type === 'hs').reduce((sum, g) => sum + g.participant_count, 0)
)

async function fetchBalance() {
  try {
    const response = await fetch('/api/uncommon/balance')
    if (!response.ok) throw new Error('Failed to fetch balance')
    const data = await response.json()
    teamBalances.value = data.teams.map((t: any) => ({
      team_id: t.team_id,
      team_name: t.team_name,
      color_hex: t.color_hex,
      leader_name: t.team_leader,
      count: t.participant_count
    }))
    groupCounts.value = data.smallGroups
    error.value = ''
  } catch (e) {
    error.value = 'Failed to load balance data'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function openGroupModal(group: GroupCount) {
  modalTitle.value = group.group_name
  modalColor.value = group.color_hex
  showModal.value = true
  modalLoading.value = true
  modalParticipants.value = []

  try {
    const response = await fetch(`/api/uncommon/small-groups/${group.small_group_id}/participants`)
    if (!response.ok) throw new Error('Failed to fetch participants')
    const data = await response.json()
    modalParticipants.value = data.participants
  } catch (e) {
    console.error('Error loading participants:', e)
  } finally {
    modalLoading.value = false
  }
}

async function openYouthModal(type: 'jh' | 'hs') {
  modalTitle.value = type === 'jh' ? 'Jr High (all)' : 'High School (all)'
  modalColor.value = '#9333ea' // purple
  showModal.value = true
  modalLoading.value = true
  modalParticipants.value = []

  try {
    const response = await fetch(`/api/uncommon/small-groups/${type}/participants`)
    if (!response.ok) throw new Error('Failed to fetch participants')
    const data = await response.json()
    modalParticipants.value = data.participants
  } catch (e) {
    console.error('Error loading participants:', e)
  } finally {
    modalLoading.value = false
  }
}

function closeModal() {
  showModal.value = false
}

function getAgeChip(groupType: string | undefined) {
  if (groupType === 'jh') return { label: 'JH', color: 'bg-purple-500' }
  if (groupType === 'hs') return { label: 'HS', color: 'bg-indigo-500' }
  return { label: 'Adult', color: 'bg-gray-500' }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showModal.value) {
    closeModal()
  }
}

onMounted(() => {
  fetchBalance()
  pollInterval = setInterval(fetchBalance, 10000)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-4">
    <UncommonMenu />
    <!-- Header -->
    <div class="text-center mb-4">
      <h1 class="text-2xl font-bold text-gray-800">Team and Group Counts</h1>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-10">
      <div class="text-lg text-gray-500">Loading...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-10">
      <div class="text-lg text-red-500">{{ error }}</div>
    </div>

    <template v-else>
      <!-- Team Totals Row -->
      <div class="flex flex-wrap justify-center gap-2 mb-6">
        <div
          v-for="team in teamBalances"
          :key="team.team_id"
          class="px-4 py-2 rounded-lg text-center min-w-[100px]"
          :class="{ 'ring-4 ring-green-400': team.count === minTeamCount && minTeamCount > 0 }"
          :style="{ backgroundColor: team.color_hex + '30', borderColor: team.color_hex, borderWidth: '2px' }"
        >
          <div class="font-bold text-xl" :style="{ color: team.color_hex }">
            {{ team.count }}
          </div>
          <div class="text-sm text-gray-600">{{ team.team_name }}</div>
        </div>
      </div>

      <!-- Small Groups Table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-200">
            <tr>
              <th class="px-3 py-1 text-left">Group</th>
              <th class="px-3 py-1 text-left">Leader</th>
              <th class="px-3 py-1 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="group in adultGroups"
              :key="group.small_group_id"
              class="border-t cursor-pointer hover:bg-gray-50"
              @click="openGroupModal(group)"
            >
              <td class="px-3 py-0.5">
                <span class="font-semibold" :style="{ color: group.color_hex }">{{ group.group_name }}</span>
              </td>
              <td class="px-3 py-0.5 text-gray-600">
                {{ group.leader_name || '—' }}
              </td>
              <td class="px-3 py-0.5 text-right font-mono">
                {{ group.participant_count }}
              </td>
            </tr>
            <!-- Aggregated Youth Rows -->
            <tr
              class="border-t bg-gray-50 cursor-pointer hover:bg-gray-100"
              @click="openYouthModal('jh')"
            >
              <td class="px-3 py-0.5">
                <span class="font-semibold text-purple-600">Jr High (all)</span>
              </td>
              <td class="px-3 py-0.5 text-gray-600">—</td>
              <td class="px-3 py-0.5 text-right font-mono">{{ jhTotal }}</td>
            </tr>
            <tr
              class="border-t bg-gray-50 cursor-pointer hover:bg-gray-100"
              @click="openYouthModal('hs')"
            >
              <td class="px-3 py-0.5">
                <span class="font-semibold text-purple-600">High School (all)</span>
              </td>
              <td class="px-3 py-0.5 text-gray-600">—</td>
              <td class="px-3 py-0.5 text-right font-mono">{{ hsTotal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Participants Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div
            v-if="showModal"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            @click.self="closeModal"
          >
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
              <!-- Modal Header -->
              <div
                class="px-4 py-3 rounded-t-lg flex justify-between items-center"
                :style="{ backgroundColor: modalColor + '20', borderBottom: `3px solid ${modalColor}` }"
              >
                <h3 class="text-lg font-bold" :style="{ color: modalColor }">{{ modalTitle }}</h3>
                <button @click="closeModal" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
              </div>

              <!-- Modal Body -->
              <div class="p-4 overflow-y-auto flex-1">
                <div v-if="modalLoading" class="text-center py-8 text-gray-500">
                  Loading...
                </div>
                <div v-else-if="modalParticipants.length === 0" class="text-center py-8 text-gray-500">
                  No participants
                </div>
                <div v-else class="space-y-2">
                  <div
                    v-for="p in modalParticipants"
                    :key="p.id"
                    class="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div class="flex items-center gap-3">
                      <span class="text-gray-500 text-sm font-mono">#{{ p.checkin_number }}</span>
                      <span class="font-medium">{{ p.first_name }} {{ p.last_name }}</span>
                    </div>
                    <span
                      class="text-xs px-2 py-0.5 rounded text-white"
                      :class="getAgeChip(p.small_groups?.group_type).color"
                    >
                      {{ getAgeChip(p.small_groups?.group_type).label }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Modal Footer -->
              <div class="px-4 py-3 border-t text-right">
                <button
                  @click="closeModal"
                  class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Last Updated -->
      <div class="text-center text-sm text-gray-400 mt-4">
        Auto-refreshes every 10 seconds
      </div>
    </template>
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

.modal-enter-active .bg-white,
.modal-leave-active .bg-white {
  transition: transform 0.2s ease;
}

.modal-enter-from .bg-white,
.modal-leave-to .bg-white {
  transform: scale(0.95);
}
</style>
