<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ServeTeam } from '@/data/serveTeams'
import { PC_SERVE_FORM_URL } from '@/data/serveTeams'

defineProps<{
  team: ServeTeam | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Close on escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

// Get the form URL (could potentially add team parameter if PC supports it)
function getFormUrl(): string {
  return PC_SERVE_FORM_URL
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="$emit('close')"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-modal-in"
      >
        <div class="p-8 text-center">
          <!-- Success icon -->
          <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-6">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>

          <h3 class="text-2xl font-bold text-gray-900 mb-2">
            Ready to Serve?
          </h3>

          <p v-if="team" class="text-gray-600 mb-2">
            You're signing up for the <strong class="text-gray-900">{{ team.name }}</strong>
          </p>

          <p class="text-gray-500 text-sm mb-8">
            Complete a quick form to let us know you're interested. A team leader will reach out to you soon!
          </p>

          <div class="space-y-3">
            <a
              :href="getFormUrl()"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-center gap-2 w-full px-6 py-4 bg-[#095879] hover:bg-[#074863] text-white font-bold rounded-xl transition-colors"
            >
              Complete Sign-Up Form
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>

            <button
              @click="$emit('close')"
              class="w-full px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              Maybe Later
            </button>
          </div>

          <p class="mt-6 text-xs text-gray-400">
            You'll be redirected to Planning Center to complete your sign-up.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-modal-in {
  animation: modal-in 0.2s ease-out;
}
</style>
