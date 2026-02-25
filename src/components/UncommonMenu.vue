<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const showMenu = ref(false)

const menuItems = [
  { name: 'Scoreboard', path: '/uncommon/scoreboard', description: 'Live team scores' },
  { name: 'Group Counts', path: '/uncommon/balance', description: 'Team and group counts' },
  { name: 'Points Entry', path: '/uncommon/points', description: 'Man cards & team bonus' },
  { name: 'Drawing', path: '/uncommon/drawing', description: 'Prize drawings' },
  { name: 'Leaders', path: '/uncommon/leaders', description: 'Assign leaders' },
]

function handleKeydown(e: KeyboardEvent) {
  // Ctrl+Escape to toggle menu
  if (e.ctrlKey && e.key === 'Escape') {
    e.preventDefault()
    showMenu.value = !showMenu.value
  }
  // Escape alone to close
  if (e.key === 'Escape' && !e.ctrlKey && showMenu.value) {
    showMenu.value = false
  }
}

function navigate(path: string) {
  showMenu.value = false
  router.push(path)
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showMenu"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        @click.self="showMenu = false"
      >
        <div class="bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-2xl">
          <h2 class="text-xl font-bold text-white mb-4 text-center">Uncommon Menu</h2>
          <div class="space-y-2">
            <button
              v-for="item in menuItems"
              :key="item.path"
              @click="navigate(item.path)"
              class="w-full text-left px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <div class="text-white font-semibold">{{ item.name }}</div>
              <div class="text-sm text-gray-400">{{ item.description }}</div>
            </button>
          </div>
          <div class="mt-4 text-center text-xs text-gray-500">
            Press Ctrl+Esc to close
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
