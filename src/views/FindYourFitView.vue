<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import RccHeader from '@/components/RccHeader.vue'
import FindYourFitHero from '@/components/shared/FindYourFitHero.vue'

const route = useRoute()

// Check if we're in embed mode (for WordPress iframe)
const isEmbed = computed(() => route.query.embed === 'true')
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header (hidden in embed mode) -->
    <RccHeader v-if="!isEmbed" :show-portal-nav="false" />

    <!-- Hero Section -->
    <FindYourFitHero />
  </div>
</template>
