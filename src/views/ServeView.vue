<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import RccHeader from '@/components/RccHeader.vue'
import ServeHero from '@/components/serve/ServeHero.vue'
import ServeCategoryNav from '@/components/serve/ServeCategoryNav.vue'
import ServeCategorySection from '@/components/serve/ServeCategorySection.vue'
import ServeTeamModal from '@/components/serve/ServeTeamModal.vue'
import ServePCFormModal from '@/components/serve/ServePCFormModal.vue'
import ServeQuizCTA from '@/components/serve/ServeQuizCTA.vue'
import {
  SERVE_CATEGORIES,
  SERVE_TEAMS,
  getTeamsByCategory,
  type ServeTeam,
  type ServeCategory,
  type TeamCategory,
} from '@/data/serveTeams'

// State
const activeCategory = ref<TeamCategory | null>(null)
const selectedTeam = ref<ServeTeam | null>(null)
const showSignUpModal = ref(false)
const signUpTeam = ref<ServeTeam | null>(null)

// Category refs for scroll tracking
const categoryRefs = ref<Record<string, HTMLElement | null>>({})

// Sorted categories
const sortedCategories = computed(() => {
  return [...SERVE_CATEGORIES].sort((a, b) => a.order - b.order)
})

// Scroll to teams section
function scrollToTeams() {
  const firstCategory = sortedCategories.value[0]
  if (firstCategory) {
    scrollToCategory(firstCategory.id)
  }
}

// Scroll to specific category
function scrollToCategory(categoryId: TeamCategory) {
  const element = document.getElementById(`category-${categoryId}`)
  if (element) {
    const headerOffset = 180 // Account for sticky headers
    const elementPosition = element.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    })
  }
}

// Handle team selection (show details modal)
function handleTeamSelect(team: ServeTeam) {
  selectedTeam.value = team
}

// Handle sign up click
function handleSignUp(team: ServeTeam) {
  signUpTeam.value = team
  showSignUpModal.value = true
  selectedTeam.value = null // Close details modal if open
}

// Close team modal
function closeTeamModal() {
  selectedTeam.value = null
}

// Close sign up modal
function closeSignUpModal() {
  showSignUpModal.value = false
  signUpTeam.value = null
}

// Track active category on scroll
let observer: IntersectionObserver | null = null

function setupScrollObserver() {
  const options = {
    root: null,
    rootMargin: '-200px 0px -50% 0px',
    threshold: 0,
  }

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const categoryId = entry.target.id.replace('category-', '') as TeamCategory
        activeCategory.value = categoryId
      }
    })
  }, options)

  // Observe all category sections
  sortedCategories.value.forEach((category) => {
    const element = document.getElementById(`category-${category.id}`)
    if (element) {
      observer?.observe(element)
    }
  })
}

onMounted(() => {
  // Set up scroll observer after a short delay to ensure elements are rendered
  setTimeout(setupScrollObserver, 100)
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<template>
  <div class="min-h-screen bg-white">
    <!-- Header (public mode - no portal nav) -->
    <RccHeader :show-portal-nav="false" />

    <!-- Hero Section -->
    <ServeHero @scroll-to-teams="scrollToTeams" />

    <!-- Category Navigation (sticky) -->
    <ServeCategoryNav
      :categories="sortedCategories"
      :active-category="activeCategory"
      @select="scrollToCategory"
    />

    <!-- Main Content -->
    <main class="py-8">
      <!-- Category Sections with alternating backgrounds -->
      <div
        v-for="(category, index) in sortedCategories"
        :key="category.id"
        :class="index % 2 === 1 ? 'bg-gray-50/70' : 'bg-white'"
      >
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ServeCategorySection
            :id="`category-${category.id}`"
            :category="category"
            :teams="getTeamsByCategory(category.id)"
            @select-team="handleTeamSelect"
            @sign-up="handleSignUp"
          />
        </div>
      </div>

      <!-- Find Your Fit CTA -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ServeQuizCTA />
      </div>
    </main>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-12">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 class="text-lg font-semibold mb-4">River Christian Church</h3>
            <p class="text-gray-400 text-sm">
              5900 US 17<br>
              Fleming Island, FL 32003
            </p>
          </div>
          <div>
            <h3 class="text-lg font-semibold mb-4">Service Times</h3>
            <p class="text-gray-400 text-sm">
              Sundays at 9:00 AM & 10:45 AM
            </p>
          </div>
          <div>
            <h3 class="text-lg font-semibold mb-4">Contact</h3>
            <p class="text-gray-400 text-sm">
              <a href="mailto:info@riverchristian.church" class="hover:text-white transition-colors">
                info@riverchristian.church
              </a>
            </p>
          </div>
        </div>
        <div class="mt-8 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          &copy; {{ new Date().getFullYear() }} River Christian Church. All rights reserved.
        </div>
      </div>
    </footer>

    <!-- Team Details Modal -->
    <ServeTeamModal
      v-if="selectedTeam"
      :team="selectedTeam"
      @close="closeTeamModal"
      @sign-up="handleSignUp"
    />

    <!-- Planning Center Sign Up Modal -->
    <ServePCFormModal
      v-if="showSignUpModal"
      :team="signUpTeam"
      @close="closeSignUpModal"
    />
  </div>
</template>
