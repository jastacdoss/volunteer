<script setup lang="ts">
import type { ServeCategory, ServeTeam } from '@/data/serveTeams'
import ServeTeamCard from './ServeTeamCard.vue'
import ServeIcon from './ServeIcon.vue'

defineProps<{
  category: ServeCategory
  teams: ServeTeam[]
}>()

defineEmits<{
  (e: 'select-team', team: ServeTeam): void
  (e: 'sign-up', team: ServeTeam): void
}>()

// Get color classes for badge
function getBadgeClasses(color: string): string {
  const classes = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
    pink: 'bg-pink-100 text-pink-800',
  } as const

  type ColorKey = keyof typeof classes
  return classes[color as ColorKey] ?? classes.blue
}
</script>

<template>
  <section class="py-12 scroll-mt-24">
    <!-- Category Header -->
    <div class="mb-8">
      <div class="flex flex-wrap items-center gap-4 mb-3">
        <h2 class="text-3xl md:text-4xl font-bold text-gray-900">
          {{ category.name }}
        </h2>
        <div
          :class="[
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
            getBadgeClasses(category.color)
          ]"
        >
          <ServeIcon :name="category.icon" class="w-4 h-4" />
          <span class="font-medium text-sm">{{ teams.length }} teams</span>
        </div>
      </div>

      <p class="text-lg text-gray-600 max-w-3xl">
        {{ category.description }}
      </p>
    </div>

    <!-- Teams Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <ServeTeamCard
        v-for="team in teams"
        :key="team.id"
        :team="team"
        :category-color="category.color"
        @click="$emit('select-team', team)"
        @sign-up="$emit('sign-up', team)"
      />
    </div>
  </section>
</template>
