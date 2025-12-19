<script setup lang="ts">
import type { ServeTeam } from '@/data/serveTeams'

defineProps<{
  team: ServeTeam
  categoryColor: string
}>()

defineEmits<{
  (e: 'click'): void
  (e: 'sign-up', team: ServeTeam): void
}>()

// Get button color classes
function getButtonClasses(color: string): string {
  const classes = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
    orange: 'bg-orange-600 hover:bg-orange-700',
    red: 'bg-red-600 hover:bg-red-700',
    pink: 'bg-pink-600 hover:bg-pink-700',
  } as const

  type ColorKey = keyof typeof classes
  return classes[color as ColorKey] ?? classes.blue
}

// Get icon background classes
function getIconBgClasses(color: string): string {
  const classes = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
    pink: 'bg-pink-100 text-pink-600',
  } as const

  type ColorKey = keyof typeof classes
  return classes[color as ColorKey] ?? classes.blue
}
</script>

<template>
  <div
    class="group relative bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 hover:border-gray-200 cursor-pointer"
    @click="$emit('click')"
  >
    <!-- Content -->
    <div class="p-6">
      <!-- Icon Badge -->
      <div
        :class="[
          'inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 text-3xl',
          getIconBgClasses(categoryColor)
        ]"
      >
        {{ team.icon }}
      </div>

      <h3 class="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#095879] transition-colors">
        {{ team.name }}
      </h3>

      <p class="text-gray-600 mb-4 line-clamp-2">
        {{ team.description }}
      </p>

      <!-- Quick Info -->
      <div class="flex flex-wrap gap-2 mb-5">
        <span
          v-if="team.schedule"
          class="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          {{ team.schedule }}
        </span>
        <span
          v-if="team.commitment"
          class="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          {{ team.commitment }}
        </span>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          @click.stop
        >
          Learn More
        </button>
        <button
          @click.stop="$emit('sign-up', team)"
          :class="[
            'flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors',
            getButtonClasses(categoryColor)
          ]"
        >
          Sign Up
        </button>
      </div>
    </div>

    <!-- Hover accent line -->
    <div
      :class="[
        'absolute bottom-0 left-0 right-0 h-1 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left',
        categoryColor === 'blue' ? 'bg-blue-600' :
        categoryColor === 'green' ? 'bg-green-600' :
        categoryColor === 'purple' ? 'bg-purple-600' :
        categoryColor === 'orange' ? 'bg-orange-600' :
        categoryColor === 'red' ? 'bg-red-600' :
        'bg-blue-600'
      ]"
    ></div>
  </div>
</template>
