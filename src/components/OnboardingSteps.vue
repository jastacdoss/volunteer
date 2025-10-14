<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'

interface Step {
  id: number
  title: string
  description: string
  link?: string
  linkText?: string
  completed: boolean
  pending?: boolean
  completedDate?: string
  email?: string
  action?: 'submit' | 'external' | 'pending-only'
  fieldName?: string
  covenantLevel?: 1 | 2 | 3
}

const props = defineProps<{
  steps: Step[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  (e: 'mark-submitted', step: Step): void
}>()

function handleMarkSubmitted(step: Step) {
  emit('mark-submitted', step)
}
</script>

<template>
  <div class="space-y-6">
    <div
      v-for="step in steps"
      :key="step.id"
      class="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden border border-gray-200"
    >
      <div class="p-6">
        <div class="flex items-start gap-4">
          <!-- Step Number/Checkmark/Pending -->
          <div class="flex-shrink-0">
            <!-- Completed -->
            <div
              v-if="step.completed"
              class="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center"
            >
              <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <!-- Pending -->
            <div
              v-else-if="step.pending"
              class="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center"
            >
              <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <!-- Not started -->
            <div
              v-else
              class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md"
            >
              {{ step.id }}
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <h4 class="text-xl font-bold text-gray-900">
                Step {{ step.id }} - {{ step.title }}
              </h4>
              <span
                v-if="step.completed"
                class="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full"
              >
                Completed
              </span>
              <template v-else-if="step.pending">
                <span class="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                  Submitted
                </span>
                <span class="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                  Pending Review
                </span>
              </template>
            </div>

            <p class="text-gray-700 mb-4 leading-relaxed">
              {{ step.description }}
            </p>

            <div v-if="step.completedDate" class="text-sm text-gray-500 mb-3">
              Completed on {{ step.completedDate }}
            </div>

            <div v-if="step.email && !step.completed && !step.pending" class="mb-3">
              <span class="text-sm text-gray-600">
                Watch for email from: <span class="font-medium text-gray-900">{{ step.email }}</span>
              </span>
            </div>

            <!-- Interactive buttons (readonly=false) -->
            <div v-if="!readonly && !step.completed && !step.pending" class="flex gap-3 flex-wrap">
              <!-- External link button -->
              <a
                v-if="step.link"
                :href="step.link"
                target="_blank"
                class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <span>{{ step.linkText }}</span>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                </svg>
              </a>

              <!-- Mark as submitted button -->
              <button
                v-if="step.action === 'submit'"
                @click="handleMarkSubmitted(step)"
                class="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Mark as Submitted</span>
              </button>
            </div>

            <!-- Read-only: Show links as text only (no buttons) -->
            <div v-if="readonly && !step.completed && !step.pending && step.link" class="flex gap-3 flex-wrap">
              <div class="text-sm text-gray-600">
                <span class="font-medium">Link:</span>
                <a
                  :href="step.link"
                  target="_blank"
                  class="text-blue-600 hover:text-blue-700 ml-1"
                >
                  {{ step.linkText || step.link }}
                </a>
              </div>
            </div>

            <!-- Pending message -->
            <div v-if="step.pending" class="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg">
              <template v-if="readonly">
                Submission is pending review. Status will be updated once it's been processed.
              </template>
              <template v-else>
                Your submission is pending review. We'll update your status once it's been processed.
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
