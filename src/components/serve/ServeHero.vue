<script setup lang="ts">
defineEmits<{
  (e: 'scroll-to-teams'): void
}>()
</script>

<template>
  <section class="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
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
          Find Your Place at RCC
        </span>
      </div>

      <h1 class="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
        Get Plugged In
      </h1>

      <p class="text-xl md:text-2xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
        Discover how your unique gifts can make a difference.
        Join a team and be part of something bigger.
      </p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          @click="$emit('scroll-to-teams')"
          class="px-8 py-4 bg-white text-[#095879] font-bold rounded-full hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:scale-105 transform"
        >
          Explore Teams
        </button>
        <button
          class="px-8 py-4 border-2 border-white text-white font-bold rounded-full hover:bg-white/10 transition-all"
        >
          Find Your Fit
        </button>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div class="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
      <button
        @click="$emit('scroll-to-teams')"
        class="text-white/60 hover:text-white transition-colors"
        aria-label="Scroll to teams"
      >
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </button>
    </div>
  </section>
</template>
