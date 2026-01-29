<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

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
  neighborhood: string | null
  tags: string[]
  location: GroupLocation | null
}

const props = defineProps<{
  group: Group
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

// Get location display text - prefer neighborhood tag
function getLocationText(): string {
  // Prefer neighborhood tag if available
  if (props.group.neighborhood) {
    return props.group.neighborhood
  }

  const loc = props.group.location
  if (!loc) {
    const match = props.group.description?.match(/Meeting Area:\s*([^\n]+)/i)
    return match?.[1] ?? 'Contact leader for location'
  }

  if (loc.displayPreference === 'approximate' || loc.displayPreference === 'hidden') {
    return loc.name || 'Contact leader for exact location'
  }

  const address = loc.address || ''
  return address.replace('\n', ', ') || loc.name || 'Contact leader for location'
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
      class="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style="z-index: 9999;"
      @click.self="$emit('close')"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-modal-in"
      >
        <!-- Header Image -->
        <div
          v-if="group.headerImage"
          class="h-40 bg-cover bg-center relative"
          :style="{ backgroundImage: `url(${group.headerImage})` }"
        >
          <button
            @click="$emit('close')"
            class="absolute top-4 right-4 p-2 bg-black/30 text-white hover:bg-black/50 rounded-full transition-colors"
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div v-else class="h-40 bg-gradient-to-br from-[#095879] to-[#0a6d94] relative">
          <button
            @click="$emit('close')"
            class="absolute top-4 right-4 p-2 bg-white/20 text-white hover:bg-white/30 rounded-full transition-colors"
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="p-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-4">
            {{ group.name }}
          </h2>

          <!-- Details Grid -->
          <div class="space-y-4 mb-6">
            <!-- Schedule -->
            <div v-if="group.schedule" class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 bg-[#095879]/10 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-[#095879]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">When</p>
                <p class="text-gray-900">{{ group.schedule }}</p>
              </div>
            </div>

            <!-- Location -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 bg-[#095879]/10 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-[#095879]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Where</p>
                <p class="text-gray-900">{{ getLocationText() }}</p>
              </div>
            </div>

            <!-- Members -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 bg-[#095879]/10 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-[#095879]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Members</p>
                <p class="text-gray-900">{{ group.membersCount }} member{{ group.membersCount !== 1 ? 's' : '' }}</p>
              </div>
            </div>

            <!-- Childcare -->
            <div class="flex items-start gap-3">
              <div :class="[
                'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                group.hasChildcare ? 'bg-green-100' : 'bg-gray-100'
              ]">
                <svg :class="['w-5 h-5', group.hasChildcare ? 'text-green-600' : 'text-gray-400']" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-6 8v-2c0-2.21 1.79-4 4-4h4c2.21 0 4 1.79 4 4v2H6zM9 8c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm4 0c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1z"/>
                </svg>
              </div>
              <div>
                <p class="text-xs text-gray-500 font-medium uppercase tracking-wide">Childcare</p>
                <p :class="group.hasChildcare ? 'text-green-600 font-medium' : 'text-gray-500'">
                  {{ group.hasChildcare ? 'Provided' : 'Not Provided' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              @click="$emit('close')"
              class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              Close
            </button>
            <a
              v-if="group.publicUrl"
              :href="group.publicUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 px-4 py-3 text-sm font-medium text-white bg-[#095879] hover:bg-[#074863] rounded-xl transition-colors text-center"
            >
              Join This Group
            </a>
            <a
              v-else-if="group.contactEmail"
              :href="`mailto:${group.contactEmail}?subject=Interest in ${encodeURIComponent(group.name)}`"
              class="flex-1 px-4 py-3 text-sm font-medium text-white bg-[#095879] hover:bg-[#074863] rounded-xl transition-colors text-center"
            >
              Contact Leader
            </a>
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
