<script setup lang="ts">
import { defineProps } from 'vue'

interface AdditionalRequirement {
  title: string
  description: string
  link?: string
  linkText?: string
  fieldName?: string
  completed?: boolean
}

defineProps<{
  requirements: AdditionalRequirement[]
}>()
</script>

<template>
  <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-8 border border-purple-100">
    <h3 class="text-2xl font-bold text-gray-900 mb-3">Additional Requirements</h3>
    <p class="text-gray-600 mb-6">
      Based on the selected team(s), the volunteer may also need to complete the following:
    </p>

    <div class="space-y-4">
      <div
        v-for="(req, index) in requirements"
        :key="index"
        class="flex items-start gap-4 p-4 bg-white rounded-lg shadow-sm"
      >
        <!-- Checkmark if completed, info icon if not -->
        <svg v-if="req.completed" class="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <svg v-else class="w-6 h-6 text-purple-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="flex-1">
          <h4 class="font-bold text-gray-900 mb-1">{{ req.title }}</h4>
          <p class="text-sm text-gray-600 mb-2">{{ req.description }}</p>
          <a
            v-if="req.link"
            :href="req.link"
            target="_blank"
            class="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            <span>{{ req.linkText }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
