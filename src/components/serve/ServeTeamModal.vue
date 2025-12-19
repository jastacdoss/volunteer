<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ServeTeam } from '@/data/serveTeams'

const props = defineProps<{
  team: ServeTeam
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'sign-up', team: ServeTeam): void
}>()

// Close on escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
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
        class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-modal-in"
      >
        <!-- Header -->
        <div class="relative p-6 pb-0">
          <button
            @click="$emit('close')"
            class="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>

          <!-- Icon -->
          <div class="inline-flex items-center justify-center w-16 h-16 bg-[#095879]/10 text-[#095879] rounded-xl mb-4 text-4xl">
            {{ team.icon }}
          </div>

          <h2 class="text-2xl font-bold text-gray-900 mb-2 pr-8">
            {{ team.name }}
          </h2>

          <p v-if="team.leader" class="text-sm text-gray-500 mb-4">
            Led by <span class="font-medium text-gray-700">{{ team.leader }}</span>
          </p>
        </div>

        <!-- Content -->
        <div class="p-6 pt-4">
          <p class="text-gray-600 leading-relaxed mb-6">
            {{ team.longDescription || team.description }}
          </p>

          <!-- Details -->
          <div class="space-y-3 mb-6">
            <div v-if="team.schedule" class="flex items-start gap-3">
              <div class="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">When</p>
                <p class="text-gray-900">{{ team.schedule }}</p>
              </div>
            </div>

            <div v-if="team.commitment" class="flex items-start gap-3">
              <div class="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Commitment</p>
                <p class="text-gray-900">{{ team.commitment }}</p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              @click="$emit('close')"
              class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Maybe Later
            </button>
            <button
              @click="$emit('sign-up', team)"
              class="flex-1 px-4 py-3 text-sm font-medium text-white bg-[#095879] hover:bg-[#074863] rounded-xl transition-colors"
            >
              Sign Up Now
            </button>
          </div>
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
