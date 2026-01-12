<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isEmbed = computed(() => route.query.embed === 'true')
const currentPage = computed(() => route.name as string)

function navigateToServe() {
  if (currentPage.value === 'serve') {
    // Already on serve page, scroll to content
    scrollToContent()
  } else {
    const query = isEmbed.value ? { embed: 'true' } : {}
    router.push({ path: '/serve', query })
  }
}

function navigateToLifeGroups() {
  if (currentPage.value === 'lifegroups') {
    // Already on lifegroups page, scroll to content
    scrollToContent()
  } else {
    const query = isEmbed.value ? { embed: 'true' } : {}
    router.push({ path: '/lifegroups', query })
  }
}

function scrollToContent() {
  document.getElementById('page-content')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <section class="relative h-[500px] flex items-center justify-center overflow-hidden">
    <!-- Background gradient -->
    <div class="absolute inset-0 bg-gradient-to-br from-[#095879] via-[#0a6a8f] to-[#074863]">
      <!-- Decorative elements -->
      <div class="absolute inset-0 opacity-10">
        <div class="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
        <div class="absolute bottom-20 right-10 w-96 h-96 bg-blue-300 rounded-full blur-3xl"></div>
      </div>
    </div>

    <!-- Content -->
    <div class="relative z-10 text-center text-white px-4 max-w-4xl mx-auto">
      <div class="mb-6">
        <span class="inline-block px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium text-blue-100 border border-white/20">
          Discover Your Purpose
        </span>
      </div>

      <h1 class="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
        Find Your Fit
      </h1>

      <p class="text-xl md:text-2xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
        Discover how you can get connected at RCC.
        Whether you want to serve or find community, we have a place for you.
      </p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          @click="navigateToServe"
          :class="[
            'px-8 py-4 font-bold rounded-full transition-all shadow-lg',
            currentPage === 'serve'
              ? 'bg-white text-[#095879] hover:bg-blue-50 hover:shadow-xl hover:scale-105 transform'
              : 'border-2 border-white text-white hover:bg-white/10'
          ]"
        >
          Serve
        </button>
        <button
          @click="navigateToLifeGroups"
          :class="[
            'px-8 py-4 font-bold rounded-full transition-all shadow-lg',
            currentPage === 'lifegroups'
              ? 'bg-white text-[#095879] hover:bg-blue-50 hover:shadow-xl hover:scale-105 transform'
              : 'border-2 border-white text-white hover:bg-white/10'
          ]"
        >
          Life Groups
        </button>
      </div>
    </div>

    <!-- Scroll indicator (only show when there's content below) -->
    <div v-if="currentPage !== 'find-your-fit'" class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
      <button
        @click="scrollToContent"
        class="text-white/60 hover:text-white transition-colors"
        aria-label="Scroll to content"
      >
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </button>
    </div>
  </section>
</template>
