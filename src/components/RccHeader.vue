<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSession, logout, checkPermissions as checkCachedPermissions, getViewAsMode, clearViewAsMode, initiateLogin } from '@/lib/auth'

interface Props {
  showPortalNav?: boolean
  portalTitle?: string
  showAdminSubNav?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showPortalNav: true,
  portalTitle: 'Volunteer Portal',
  showAdminSubNav: false
})

const router = useRouter()
const isAuthenticated = ref(false)
const isAdmin = ref(false)
const isLeader = ref(false)
const viewAsMode = ref<{ personId: string; personName: string } | null>(null)
const mobileMenuOpen = ref(false)
const showUserMenu = ref(false)

// Main site navigation items (links to WordPress)
const mainNavItems = [
  { label: 'Home', href: 'https://riverchristian.church/' },
  {
    label: 'About',
    href: 'https://riverchristian.church/about-us/',
    children: [
      { label: 'Our Story', href: 'https://riverchristian.church/about-us/our-story/' },
      { label: 'Our Team', href: 'https://riverchristian.church/about-us/our-team/' },
      { label: 'Beliefs', href: 'https://riverchristian.church/about-us/beliefs/' },
      { label: 'What to Expect', href: 'https://riverchristian.church/about-us/what-to-expect/' },
      { label: 'Contact', href: 'https://riverchristian.church/about-us/contact/' },
    ]
  },
  {
    label: 'Next Steps',
    href: 'https://riverchristian.church/next-steps/',
    children: [
      { label: 'Growth Track', href: 'https://riverchristian.church/next-steps/growth-track/' },
      { label: 'LifeGroups', href: 'https://riverchristian.church/next-steps/lifegroups' },
      { label: 'Baptism', href: 'https://riverchristian.church/next-steps/baptism/' },
      { label: 'Serve', href: 'https://riverchristian.church/next-steps/serve' },
      { label: 'Prayer', href: 'https://riverchristian.church/next-steps/prayer/' },
    ]
  },
  { label: 'Watch', href: 'https://riverchristian.church/watch/' },
  {
    label: 'Ministries',
    href: 'https://riverchristian.church/ministries/',
    children: [
      { label: 'Kids', href: 'https://riverchristian.church/ministries/kids/' },
      { label: 'Students', href: 'https://riverchristian.church/ministries/students/' },
      { label: 'Men', href: 'https://riverchristian.church/ministries/men/' },
      { label: 'Women', href: 'https://riverchristian.church/ministries/women/' },
      { label: 'Care', href: 'https://riverchristian.church/ministries/care/' },
      { label: 'Outreach & Missions', href: 'https://riverchristian.church/ministries/outreach-missions/' },
    ]
  },
  { label: 'Events', href: 'https://riverchristian.church/events/' },
  { label: 'Give', href: 'https://riverchristian.church/give/' },
]

// Super header quick links
const superHeaderLinks = [
  { label: 'River Preschool', href: 'https://riverchristian.church/river-preschool/' },
  { label: 'New? Start Here!', href: 'https://riverchristian.church/about-us/what-to-expect/' },
  { label: 'Connect Card', href: 'https://riverchristianchurch.churchcenter.com/people/forms/894794' },
]

async function loadPermissions() {
  const session = getSession()
  isAuthenticated.value = !!session
  if (!session) return

  try {
    const permissions = await checkCachedPermissions()
    isAdmin.value = permissions.isAdmin
    isLeader.value = permissions.isLeader
  } catch (error) {
    console.error('[RccHeader] Failed to check permissions:', error)
  }
}

function checkViewAsMode() {
  viewAsMode.value = getViewAsMode()
}

function exitViewAs() {
  clearViewAsMode()
  viewAsMode.value = null
  router.push('/admin')
}

function handleLogin() {
  initiateLogin()
}

function handleLogout() {
  logout()
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function closeUserMenu() {
  showUserMenu.value = false
}

function isInternalLink(href: string): boolean {
  return href.startsWith('/')
}

onMounted(() => {
  loadPermissions()
  checkViewAsMode()

  // Close user menu when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.user-menu-container')) {
      closeUserMenu()
    }
  })
})
</script>

<template>
  <!-- View As Banner (shown when admin is viewing as another user) -->
  <div v-if="viewAsMode" class="bg-gradient-to-r from-amber-500 to-orange-500 text-white sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
          </svg>
          <span class="text-sm font-medium">
            Viewing as: <strong>{{ viewAsMode.personName }}</strong>
          </span>
        </div>
        <button
          @click="exitViewAs"
          class="px-3 py-1 text-sm font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
        >
          Exit View As Mode
        </button>
      </div>
    </div>
  </div>

  <!-- Super Header (teal bar with quick links) -->
  <div class="bg-[#095879] text-white text-sm hidden md:block">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-end gap-6 py-2">
        <a
          v-for="link in superHeaderLinks"
          :key="link.label"
          :href="link.href"
          target="_blank"
          class="hover:text-blue-200 transition-colors"
        >
          {{ link.label }}
        </a>
      </div>
    </div>
  </div>

  <!-- Main Header (logo + navigation) -->
  <header class="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <a href="https://riverchristian.church/" class="flex-shrink-0">
          <img
            src="https://riverchristian.church/wp-content/uploads/2024/09/rcc_logo_short_dark.png"
            alt="River Christian Church"
            class="h-10 w-auto"
          >
        </a>

        <!-- Desktop Navigation -->
        <nav class="hidden lg:flex items-center gap-1">
          <template v-for="item in mainNavItems" :key="item.label">
            <!-- Item with dropdown -->
            <div v-if="item.children" class="relative group">
              <a
                :href="item.href"
                class="px-3 py-2 text-gray-700 hover:text-[#095879] font-medium transition-colors inline-flex items-center gap-1"
              >
                {{ item.label }}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </a>
              <!-- Dropdown menu -->
              <div class="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div class="bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[200px]">
                  <template v-for="child in item.children" :key="child.label">
                    <router-link
                      v-if="isInternalLink(child.href)"
                      :to="child.href"
                      class="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#095879] transition-colors"
                    >
                      {{ child.label }}
                    </router-link>
                    <a
                      v-else
                      :href="child.href"
                      class="block px-4 py-2 text-gray-700 hover:bg-gray-50 hover:text-[#095879] transition-colors"
                    >
                      {{ child.label }}
                    </a>
                  </template>
                </div>
              </div>
            </div>

            <!-- Simple item -->
            <a
              v-else
              :href="item.href"
              class="px-3 py-2 text-gray-700 hover:text-[#095879] font-medium transition-colors"
            >
              {{ item.label }}
            </a>
          </template>
        </nav>

        <!-- Auth buttons (desktop) -->
        <div class="hidden lg:flex items-center gap-3">
          <template v-if="isAuthenticated">
            <router-link
              to="/"
              class="text-sm font-medium text-gray-600 hover:text-[#095879] transition-colors"
            >
              My Portal
            </router-link>
            <!-- User Menu Dropdown -->
            <div class="relative user-menu-container">
              <button
                @click.stop="toggleUserMenu"
                class="p-2 text-gray-600 hover:text-[#095879] hover:bg-gray-100 rounded-full transition-colors"
                title="Account menu"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </button>
              <!-- Dropdown Menu -->
              <div
                v-if="showUserMenu"
                class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
              >
                <a
                  href="https://riverchristianchurch.churchcenter.com/me/profile-and-household"
                  target="_blank"
                  class="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  @click="closeUserMenu"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                  </svg>
                  Edit Profile
                </a>
                <router-link
                  v-if="isAdmin"
                  to="/admin"
                  class="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  @click="closeUserMenu"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                  Admin
                </router-link>
                <button
                  @click="handleLogout"
                  class="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                  </svg>
                  Logout
                </button>
              </div>
            </div>
          </template>
          <button
            v-else
            @click="handleLogin"
            class="px-4 py-2 text-sm font-medium text-white bg-[#095879] hover:bg-[#074863] rounded-lg transition-colors"
          >
            Volunteer Login
          </button>
        </div>

        <!-- Mobile menu button -->
        <button
          @click="toggleMobileMenu"
          class="lg:hidden p-2 text-gray-600 hover:text-gray-900"
        >
          <svg v-if="!mobileMenuOpen" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="mobileMenuOpen" class="lg:hidden border-t border-gray-200 bg-white">
      <div class="px-4 py-4 space-y-2">
        <template v-for="item in mainNavItems" :key="item.label">
          <a
            :href="item.href"
            class="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium"
          >
            {{ item.label }}
          </a>
          <template v-if="item.children">
            <template v-for="child in item.children" :key="child.label">
              <router-link
                v-if="isInternalLink(child.href)"
                :to="child.href"
                class="block px-6 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm"
                @click="mobileMenuOpen = false"
              >
                {{ child.label }}
              </router-link>
              <a
                v-else
                :href="child.href"
                class="block px-6 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm"
              >
                {{ child.label }}
              </a>
            </template>
          </template>
        </template>

        <div class="pt-4 border-t border-gray-200">
          <template v-if="isAuthenticated">
            <router-link
              to="/"
              class="block px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg font-medium"
              @click="mobileMenuOpen = false"
            >
              My Portal
            </router-link>
            <button
              @click="handleLogout"
              class="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium"
            >
              Logout
            </button>
          </template>
          <button
            v-else
            @click="handleLogin"
            class="block w-full px-3 py-2 text-white bg-[#095879] hover:bg-[#074863] rounded-lg font-medium text-center"
          >
            Volunteer Login
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Portal Navigation (shown when authenticated and showPortalNav is true) -->
  <div v-if="showPortalNav && isAuthenticated" class="bg-gray-50 border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-6">
          <span class="text-sm font-semibold text-gray-500 uppercase tracking-wide">{{ portalTitle }}</span>
          <nav class="flex items-center gap-4">
            <router-link
              to="/"
              class="text-sm font-medium transition-colors"
              :class="$route.path === '/' ? 'text-[#095879]' : 'text-gray-600 hover:text-gray-900'"
            >
              My Teams
            </router-link>
            <router-link
              to="/resources"
              class="text-sm font-medium transition-colors"
              :class="$route.path === '/resources' ? 'text-[#095879]' : 'text-gray-600 hover:text-gray-900'"
            >
              Study Materials
            </router-link>
            <router-link
              v-if="isLeader"
              to="/leader"
              class="text-sm font-medium transition-colors"
              :class="$route.path.startsWith('/leader') ? 'text-[#095879]' : 'text-gray-600 hover:text-gray-900'"
            >
              Leader Dashboard
            </router-link>
          </nav>
        </div>
        <slot name="actions"></slot>
      </div>
    </div>

    <!-- Admin Sub-Navigation -->
    <div v-if="showAdminSubNav" class="border-t border-gray-200 bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div class="flex items-center justify-between">
          <nav class="flex items-center gap-6">
            <router-link
              to="/admin"
              class="text-sm font-medium transition-colors border-b-2"
              :class="$route.path === '/admin' ? 'text-[#095879] border-[#095879]' : 'text-gray-700 border-transparent hover:text-gray-900'"
            >
              Volunteers
            </router-link>
            <router-link
              to="/admin/matrix"
              class="text-sm font-medium transition-colors border-b-2"
              :class="$route.path === '/admin/matrix' ? 'text-[#095879] border-[#095879]' : 'text-gray-700 border-transparent hover:text-gray-900'"
            >
              Team Matrix
            </router-link>
          </nav>
          <div class="flex items-center gap-3">
            <slot name="admin-actions"></slot>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
