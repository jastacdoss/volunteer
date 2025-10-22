<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSession, logout, checkPermissions as checkCachedPermissions } from '@/lib/auth'

interface Props {
  title: string
  showAdminSubNav?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAdminSubNav: false
})

const isAdmin = ref(false)
const isLeader = ref(false)

// Check user permissions (uses cache)
async function loadPermissions() {
  const session = getSession()
  if (!session) return

  try {
    const permissions = await checkCachedPermissions()
    isAdmin.value = permissions.isAdmin
    isLeader.value = permissions.isLeader
  } catch (error) {
    console.error('[AppHeader] Failed to check permissions:', error)
  }
}

onMounted(() => {
  loadPermissions()
})
</script>

<template>
  <header class="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900">{{ title }}</h1>
        <div class="flex items-center gap-3">
          <nav class="flex items-center gap-4">
            <router-link
              to="/"
              class="text-sm font-medium transition-colors"
              :class="$route.path === '/' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'"
            >
              My Onboarding
            </router-link>
            <router-link
              v-if="isLeader"
              to="/leader"
              class="text-sm font-medium transition-colors"
              :class="$route.path.startsWith('/leader') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'"
            >
              Leader Dashboard
            </router-link>
            <router-link
              v-if="isAdmin"
              to="/admin"
              class="text-sm font-medium transition-colors"
              :class="$route.path.startsWith('/admin') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'"
            >
              Admin
            </router-link>
          </nav>
          <!-- Additional slot for page-specific actions (like Sync button) -->
          <slot name="actions"></slot>
          <button
            @click="logout"
            class="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>

    <!-- Admin Sub-Navigation -->
    <div v-if="showAdminSubNav" class="border-t border-gray-200 bg-gray-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div class="flex items-center justify-between">
          <nav class="flex items-center gap-6">
            <router-link
              to="/admin"
              class="text-sm font-medium transition-colors border-b-2"
              :class="$route.path === '/admin' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:text-gray-900'"
            >
              Volunteers
            </router-link>
            <router-link
              to="/admin/matrix"
              class="text-sm font-medium transition-colors border-b-2"
              :class="$route.path === '/admin/matrix' ? 'text-blue-600 border-blue-600' : 'text-gray-700 border-transparent hover:text-gray-900'"
            >
              Team Matrix
            </router-link>
          </nav>
          <!-- Slot for admin-specific actions in sub-nav -->
          <div class="flex items-center gap-3">
            <slot name="admin-actions"></slot>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
