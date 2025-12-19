<script setup lang="ts">
import type { ServeCategory, TeamCategory } from '@/data/serveTeams'

defineProps<{
  categories: ServeCategory[]
  activeCategory: TeamCategory | null
}>()

defineEmits<{
  (e: 'select', categoryId: TeamCategory): void
}>()

// Get icon for category
function getCategoryIcon(iconName: string): string {
  const icons: Record<string, string> = {
    'hand-wave': '👋',
    'child': '🧒',
    'users': '👥',
    'globe': '🌍',
    'music': '🎵',
    'heart': '❤️',
  }
  return icons[iconName] || '📌'
}

// Get color classes for category
function getColorClasses(color: string, isActive: boolean): string {
  const activeClasses = {
    blue: 'bg-blue-600 text-white shadow-lg shadow-blue-200',
    green: 'bg-green-600 text-white shadow-lg shadow-green-200',
    purple: 'bg-purple-600 text-white shadow-lg shadow-purple-200',
    orange: 'bg-orange-600 text-white shadow-lg shadow-orange-200',
    red: 'bg-red-600 text-white shadow-lg shadow-red-200',
    pink: 'bg-pink-600 text-white shadow-lg shadow-pink-200',
  } as const

  const inactiveClasses = {
    blue: 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700',
    green: 'bg-gray-100 text-gray-700 hover:bg-green-50 hover:text-green-700',
    purple: 'bg-gray-100 text-gray-700 hover:bg-purple-50 hover:text-purple-700',
    orange: 'bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-700',
    red: 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700',
    pink: 'bg-gray-100 text-gray-700 hover:bg-pink-50 hover:text-pink-700',
  } as const

  type ColorKey = keyof typeof activeClasses
  const colorKey = color as ColorKey
  const defaultActive = activeClasses.blue
  const defaultInactive = inactiveClasses.blue

  if (isActive) {
    return activeClasses[colorKey] ?? defaultActive
  }
  return inactiveClasses[colorKey] ?? defaultInactive
}
</script>

<template>
  <nav class="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex overflow-x-auto gap-2 py-4 scrollbar-hide -mx-4 px-4">
        <button
          v-for="category in categories"
          :key="category.id"
          @click="$emit('select', category.id)"
          :class="[
            'flex-shrink-0 px-5 py-2.5 rounded-full font-medium transition-all duration-200',
            'flex items-center gap-2 text-sm',
            getColorClasses(category.color, activeCategory === category.id)
          ]"
        >
          <span class="text-lg">{{ getCategoryIcon(category.icon) }}</span>
          <span>{{ category.name }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
/* Hide scrollbar but allow scrolling */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
