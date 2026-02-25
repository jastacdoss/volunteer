<script setup lang="ts">
import { ref, onMounted } from 'vue'
import UncommonMenu from '@/components/UncommonMenu.vue'

interface PoolEntry {
  participant_id: string
  first_name: string
  last_name: string
  checkin_number: number
  team_name: string
  color_hex: string
  red_marks: number
}

interface DrawingWinner {
  id: string
  participant_id: string
  prize_name: string | null
  drawn_at: string
  participants: {
    first_name: string
    last_name: string
    checkin_number: number
    teams: {
      name: string
      color_hex: string
    }
  }
}

const pin = ref('')
const authenticated = ref(false)
const pool = ref<PoolEntry[]>([])
const winners = ref<DrawingWinner[]>([])
const prizeName = ref('')
const winnerCount = ref(1)
const loading = ref(true)
const drawing = ref(false)
const lastWinners = ref<DrawingWinner[]>([])
const error = ref('')
const successMessage = ref('')

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
      fetchData()
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
    const [poolRes, winnersRes] = await Promise.all([
      fetch('/api/uncommon/drawing/pool', { headers: { 'x-uncommon-pin': pin.value } }),
      fetch('/api/uncommon/drawing/winners', { headers: { 'x-uncommon-pin': pin.value } })
    ])

    if (!poolRes.ok || !winnersRes.ok) throw new Error('Failed to fetch data')

    const poolData = await poolRes.json()
    const winnersData = await winnersRes.json()

    pool.value = poolData.pool
    winners.value = winnersData.winners
  } catch (e) {
    error.value = 'Failed to load drawing data'
  } finally {
    loading.value = false
  }
}

async function drawWinners() {
  if (pool.value.length === 0) {
    error.value = 'No eligible participants in the pool'
    return
  }

  drawing.value = true
  try {
    const response = await fetch('/api/uncommon/drawing/draw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-uncommon-pin': pin.value
      },
      body: JSON.stringify({
        prize_name: prizeName.value || null,
        count: winnerCount.value
      })
    })

    if (!response.ok) throw new Error('Draw failed')

    const data = await response.json()
    lastWinners.value = data.winners.map((w: any) => w.drawing)

    const names = data.winners.map((w: any) => w.winner.first_name).join(', ')
    successMessage.value = `${data.count} Winner${data.count > 1 ? 's' : ''}: ${names}!`

    // Refresh data
    fetchData()
    prizeName.value = ''

  } catch (e) {
    error.value = 'Failed to draw winners'
  } finally {
    drawing.value = false
  }
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
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
      <h1 class="text-2xl font-bold text-center mb-6">Drawing Admin</h1>
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
    <div v-else class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold text-center mb-4">Drawing Admin</h1>

      <!-- Success Message -->
      <div v-if="successMessage" class="bg-green-600 text-white px-4 py-3 rounded-lg text-center mb-4 text-lg">
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

      <div v-else class="grid md:grid-cols-2 gap-6">
        <!-- Draw Section -->
        <div class="bg-gray-800 rounded-lg p-6">
          <h2 class="text-xl font-semibold mb-4">Draw Winners</h2>

          <div class="text-center mb-6">
            <div class="text-5xl font-black text-orange-400">{{ pool.length }}</div>
            <div class="text-gray-400">Eligible Participants</div>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-1"># Winners</label>
                <input
                  v-model.number="winnerCount"
                  type="number"
                  min="1"
                  max="10"
                  class="w-full px-4 py-3 rounded-lg bg-gray-700 text-center text-xl font-bold"
                />
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-1">Prize (optional)</label>
                <input
                  v-model="prizeName"
                  type="text"
                  placeholder="e.g., Gift Card"
                  class="w-full px-4 py-3 rounded-lg bg-gray-700"
                />
              </div>
            </div>

            <button
              @click="drawWinners"
              :disabled="drawing || pool.length === 0"
              class="w-full py-4 bg-orange-600 rounded-lg text-xl font-bold hover:bg-orange-700 disabled:opacity-50 transition-all"
            >
              {{ drawing ? 'Drawing...' : `DRAW ${winnerCount} WINNER${winnerCount > 1 ? 'S' : ''}` }}
            </button>
          </div>

          <!-- Last Winners Display -->
          <div v-if="lastWinners.length > 0" class="mt-6 p-4 bg-gray-700 rounded-lg">
            <div class="text-sm text-gray-400 mb-2 text-center">Last Draw ({{ lastWinners.length }} winners)</div>
            <div class="space-y-2">
              <div
                v-for="winner in lastWinners"
                :key="winner.id"
                class="flex items-center justify-between"
              >
                <div
                  class="font-bold"
                  :style="{ color: winner.participants.teams.color_hex }"
                >
                  {{ winner.participants.first_name }} {{ winner.participants.last_name }}
                </div>
                <div class="text-sm text-gray-400">
                  #{{ winner.participants.checkin_number }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Winners List -->
        <div class="bg-gray-800 rounded-lg p-6">
          <h2 class="text-xl font-semibold mb-4">Past Winners ({{ winners.length }})</h2>

          <div v-if="winners.length === 0" class="text-center text-gray-400 py-8">
            No winners yet
          </div>

          <div v-else class="space-y-2 max-h-96 overflow-y-auto">
            <div
              v-for="winner in winners"
              :key="winner.id"
              class="flex justify-between items-center p-3 bg-gray-700 rounded-lg"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: winner.participants.teams.color_hex }"
                ></div>
                <div>
                  <div class="font-semibold">
                    {{ winner.participants.first_name }} {{ winner.participants.last_name }}
                  </div>
                  <div class="text-sm text-gray-400">
                    #{{ winner.participants.checkin_number }}
                    <span v-if="winner.prize_name" class="text-yellow-400 ml-2">{{ winner.prize_name }}</span>
                  </div>
                </div>
              </div>
              <div class="text-sm text-gray-400">
                {{ formatTime(winner.drawn_at) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pool Preview -->
      <div class="mt-6 bg-gray-800 rounded-lg p-4">
        <h2 class="text-lg font-semibold mb-3">Drawing Pool</h2>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="entry in pool.slice(0, 50)"
            :key="entry.participant_id"
            class="px-2 py-1 rounded text-sm"
            :style="{ backgroundColor: entry.color_hex + '30' }"
          >
            {{ entry.first_name }} {{ entry.last_name.charAt(0) }}.
            <span class="text-red-400">({{ entry.red_marks }})</span>
          </div>
          <div v-if="pool.length > 50" class="px-2 py-1 text-gray-400 text-sm">
            +{{ pool.length - 50 }} more
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
