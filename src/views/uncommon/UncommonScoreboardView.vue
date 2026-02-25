<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import UncommonMenu from '@/components/UncommonMenu.vue'

interface TeamScore {
  team_id: string
  team_name: string
  color_hex: string
  display_order: number
  team_bonus: number
  team_leader: string | null
  participant_count: number
  total_black_marks: number
  total_red_marks: number
  completion_bonuses: number
  points_log_total: number
  total_score: number
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

const scores = ref<TeamScore[]>([])
const previousScores = ref<Map<string, number>>(new Map())
const changedTeams = ref<Set<string>>(new Set())
const loading = ref(true)
const error = ref('')
const lastDrawnAt = ref<string | null>(null)
const showWinnerAnimation = ref(false)
const currentWinners = ref<DrawingWinner[]>([])

let scoreInterval: ReturnType<typeof setInterval> | null = null
let drawingInterval: ReturnType<typeof setInterval> | null = null

const sortedScores = computed(() => {
  return [...scores.value].sort((a, b) => b.total_score - a.total_score)
})

async function fetchScores() {
  try {
    const response = await fetch('/api/uncommon/scores')
    if (!response.ok) throw new Error('Failed to fetch scores')
    const data = await response.json()

    // Detect score changes and trigger animation
    const newChangedTeams = new Set<string>()
    for (const team of (data.scores || [])) {
      const prevScore = previousScores.value.get(team.team_id)
      if (prevScore !== undefined && prevScore !== team.total_score) {
        newChangedTeams.add(team.team_id)
      }
      previousScores.value.set(team.team_id, team.total_score)
    }

    if (newChangedTeams.size > 0) {
      changedTeams.value = newChangedTeams
      // Clear animation after 1 second
      setTimeout(() => {
        changedTeams.value = new Set()
      }, 1000)
    }

    scores.value = data.scores
    error.value = ''
  } catch (e) {
    error.value = 'Failed to load scores'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function checkForDrawingWinners() {
  try {
    const response = await fetch('/api/uncommon/drawing/latest')
    if (!response.ok) return
    const data = await response.json()

    if (data.winners?.length > 0 && data.latestDrawnAt !== lastDrawnAt.value) {
      lastDrawnAt.value = data.latestDrawnAt
      currentWinners.value = data.winners
      showWinnerAnimation.value = true

      // Auto-dismiss after 15 seconds (longer for multiple winners)
      setTimeout(() => {
        showWinnerAnimation.value = false
      }, 15000)
    }
  } catch (e) {
    console.error('Error checking for winners:', e)
  }
}

function dismissWinners() {
  showWinnerAnimation.value = false
}

onMounted(() => {
  fetchScores()
  scoreInterval = setInterval(fetchScores, 5000)
  drawingInterval = setInterval(checkForDrawingWinners, 2500)
})

onUnmounted(() => {
  if (scoreInterval) clearInterval(scoreInterval)
  if (drawingInterval) clearInterval(drawingInterval)
})
</script>

<template>
  <div class="h-screen w-screen bg-gray-900 text-white overflow-hidden">
    <UncommonMenu />
    <!-- Winners Animation Overlay -->
    <Transition name="winner">
      <div
        v-if="showWinnerAnimation && currentWinners.length > 0"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
        @click="dismissWinners"
      >
        <div class="winner-container text-center">
          <div class="text-3xl text-orange-400 mb-6 animate-pulse">WINNERS!</div>
          <div class="space-y-4">
            <div
              v-for="winner in currentWinners"
              :key="winner.id"
              class="winner-entry"
            >
              <div
                class="text-4xl md:text-5xl font-black winner-name"
                :style="{ color: winner.participants.teams.color_hex }"
              >
                {{ winner.participants.first_name }} {{ winner.participants.last_name }}
              </div>
              <div class="text-xl text-gray-300">
                #{{ winner.participants.checkin_number }} - {{ winner.participants.teams.name }}
              </div>
            </div>
          </div>
          <div v-if="currentWinners[0]?.prize_name" class="text-xl text-yellow-400 mt-6">
            {{ currentWinners[0].prize_name }}
          </div>
          <div class="fire-effect"></div>
        </div>
      </div>
    </Transition>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="text-xl text-gray-400">Loading scores...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center h-full">
      <div class="text-xl text-red-400">{{ error }}</div>
    </div>

    <!-- Scoreboard Grid - 2 rows of 3, full screen -->
    <div v-else class="grid grid-cols-3 grid-rows-2 gap-6 h-full w-full p-6">
      <div
        v-for="team in sortedScores"
        :key="team.team_id"
        class="team-card rounded-xl text-center relative overflow-hidden flex flex-col justify-center"
        :class="{ 'score-pulse': changedTeams.has(team.team_id) }"
        :style="{
          backgroundColor: team.color_hex + '15',
          borderColor: team.color_hex,
          borderWidth: '4px',
          boxShadow: `0 0 40px ${team.color_hex}50`
        }"
      >
        <!-- Glow effect -->
        <div
          class="absolute inset-0 opacity-25"
          :style="{ background: `radial-gradient(circle at 50% 0%, ${team.color_hex}, transparent 70%)` }"
        ></div>

        <!-- Team Name -->
        <div
          class="text-4xl lg:text-5xl font-black mb-4 relative z-10 tracking-wider"
          :style="{ color: team.color_hex, textShadow: `0 0 30px ${team.color_hex}90` }"
        >
          {{ team.team_name }}
        </div>

        <!-- Total Score -->
        <div
          class="text-8xl lg:text-9xl font-black relative z-10 score-value"
          :style="{ textShadow: `0 0 50px ${team.color_hex}70` }"
        >
          {{ team.total_score }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.team-card {
  transition: all 0.3s ease;
}

.team-card:hover {
  transform: scale(1.02);
}

.score-value {
  transition: all 0.3s ease;
}

.score-pulse {
  animation: scorePulse 0.5s ease-out;
}

@keyframes scorePulse {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(1.08);
    filter: brightness(1.3);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    filter: brightness(1);
  }
}

.winner-enter-active,
.winner-leave-active {
  transition: opacity 0.5s ease;
}

.winner-enter-from,
.winner-leave-to {
  opacity: 0;
}

.winner-container {
  animation: fireGlow 0.5s ease-out;
}

.winner-name {
  text-shadow:
    0 0 20px currentColor,
    0 0 40px currentColor,
    0 0 60px rgba(255, 100, 0, 0.8),
    0 0 80px rgba(255, 50, 0, 0.6);
  animation: flameFlicker 0.1s infinite alternate;
}

@keyframes fireGlow {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes flameFlicker {
  0% {
    text-shadow:
      0 0 20px currentColor,
      0 0 40px currentColor,
      0 0 60px rgba(255, 100, 0, 0.8),
      0 0 80px rgba(255, 50, 0, 0.6);
  }
  100% {
    text-shadow:
      0 0 25px currentColor,
      0 0 45px currentColor,
      0 0 65px rgba(255, 120, 0, 0.9),
      0 0 85px rgba(255, 70, 0, 0.7);
  }
}

.fire-effect {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 150px;
  background: radial-gradient(ellipse at bottom, rgba(255, 100, 0, 0.4) 0%, transparent 70%);
  animation: fireRise 1s ease-out infinite;
  pointer-events: none;
}

@keyframes fireRise {
  0% {
    opacity: 0.8;
    transform: translateX(-50%) translateY(20px);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-50px);
  }
}
</style>
