<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { exchangeCodeForToken, saveSession } from '@/lib/auth'

const router = useRouter()
const error = ref<string | null>(null)

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')

  if (!code) {
    error.value = 'No authorization code received'
    return
  }

  try {
    // Exchange code for access token (calls server-side API)
    const { accessToken, userData } = await exchangeCodeForToken(code)

    // Save to session
    saveSession(accessToken, userData)

    // Redirect to home
    router.push('/')
  } catch (err) {
    console.error('OAuth callback error:', err)
    error.value = 'Failed to complete authentication'
  }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
      <div v-if="error" class="text-center">
        <div class="text-red-600 font-semibold mb-4">{{ error }}</div>
        <a href="/" class="text-blue-600 hover:text-blue-700 font-medium">Return to home</a>
      </div>
      <div v-else class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <div class="text-gray-700">Completing sign in...</div>
      </div>
    </div>
  </div>
</template>
