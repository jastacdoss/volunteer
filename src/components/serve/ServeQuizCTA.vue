<script setup lang="ts">
// Future: This component will link to an interactive "Find Your Fit" quiz
</script>

<template>
  <section class="py-8 my-16">
    <div class="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-3xl overflow-hidden">
      <div class="px-8 py-16 md:py-20 text-center relative">
        <!-- Decorative elements -->
        <div class="absolute inset-0 opacity-10">
          <div class="absolute top-0 left-1/4 w-64 h-64 bg-white rounded-full blur-3xl"></div>
          <div class="absolute bottom-0 right-1/4 w-48 h-48 bg-white rounded-full blur-3xl"></div>
        </div>

        <div class="relative z-10">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium text-white/90 border border-white/20 mb-6">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
            </svg>
            Coming Soon
          </div>

          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
            Not Sure Where to Start?
          </h2>

          <p class="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
            Take our quick assessment to discover which team is the perfect fit for your gifts, personality, and availability.
          </p>

          <button
            disabled
            class="px-8 py-4 bg-white/20 text-white font-bold rounded-full cursor-not-allowed border-2 border-white/30"
          >
            Find Your Fit - Coming Soon
          </button>

          <p class="mt-6 text-sm text-purple-200">
            In the meantime, explore the teams above or contact us at
            <a href="mailto:info@riverchristian.church" class="underline hover:text-white">info@riverchristian.church</a>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
