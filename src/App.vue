<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { computed, watch, onMounted } from 'vue'
import { initEmbedResize, updateEmbedHeight } from '@/lib/embedResize'

const route = useRoute()

const isEmbed = computed(() => route.query.embed === 'true')

// Add/remove embed class on body and initialize resize reporting
watch(isEmbed, (embed) => {
  if (embed) {
    document.body.classList.add('embed-mode')
    document.documentElement.classList.add('embed-mode')
    initEmbedResize()
  } else {
    document.body.classList.remove('embed-mode')
    document.documentElement.classList.remove('embed-mode')
  }
}, { immediate: true })

// Update height on route changes (view switches)
watch(() => route.fullPath, () => {
  if (isEmbed.value) {
    // Small delay to let Vue render the new view
    setTimeout(updateEmbedHeight, 100)
  }
})

onMounted(() => {
  if (isEmbed.value) {
    initEmbedResize()
  }
})
</script>

<template>
  <RouterView />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

/* Embed mode styles - prevent scrolling inside iframe */
html.embed-mode,
body.embed-mode {
  overflow: hidden;
  overflow-x: hidden;
  overflow-y: hidden;
}

/* Ensure no horizontal overflow in embed mode */
.embed-mode {
  max-width: 100vw;
  overflow-x: hidden;
}
</style>
