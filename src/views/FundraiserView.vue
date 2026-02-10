<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

// ========================================
// Types
// ========================================

interface Donation {
  id: string
  source: 'local' | 'mm'
  mm_id?: string
  first_name: string
  last_name: string
  phone?: string
  email?: string
  address?: string
  table_number: number | null
  amount: number
  notes?: string
  created_at: string
}

interface TableSummary {
  number: number
  total: number
  donations: Donation[]
  freeAnswersEarned: number
  freeAnswersGiven: number
  isExpanded: boolean
}

interface PcoMatch {
  id: string
  name: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: string
}

// ========================================
// State
// ========================================

// PIN authentication
const isAuthenticated = ref(false)
const pinInput = ref('')
const pinError = ref('')
const isVerifyingPin = ref(false)

// Tab state
const activeTab = ref<'tables' | 'all'>('tables')

// Data state
const donations = ref<Donation[]>([])
const tables = ref<TableSummary[]>([])
const unmatchedDonations = ref<Donation[]>([])
const freeAnswersGiven = ref<Record<number, number>>({})
const isLoading = ref(false)
const lastUpdated = ref<Date | null>(null)

// Form state (preserved across refreshes)
const formData = ref({
  phone: '',
  firstName: '',
  lastName: '',
  email: '',
  address: '',
  tableNumber: '',
  amount: ''
})
const isSubmitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

// PCO lookup state
const pcoMatches = ref<PcoMatch[]>([])
const isLookingUp = ref(false)
const showPcoDropdown = ref(false)
const selectedPcoMatch = ref<PcoMatch | null>(null)

// Edit modal state
const editingDonation = ref<Donation | null>(null)
const editForm = ref({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  tableNumber: '',
  amount: ''
})
const isEditing = ref(false)

// Config
const config = ref({
  freeAnswerThreshold: 250,
  maxFreeAnswersPerTable: 3,
  refreshInterval: 10000
})

// Polling
let refreshInterval: ReturnType<typeof setInterval> | null = null

// ========================================
// Computed
// ========================================

const totalRaised = computed(() => {
  return donations.value.reduce((sum, d) => sum + d.amount, 0)
})

const totalDonations = computed(() => donations.value.length)

const sortedTables = computed(() => {
  return [...tables.value].sort((a, b) => a.number - b.number)
})

// ========================================
// PIN Verification
// ========================================

async function verifyPin() {
  if (!pinInput.value) {
    pinError.value = 'Please enter a PIN'
    return
  }

  isVerifyingPin.value = true
  pinError.value = ''

  try {
    const response = await fetch('/api/fundraiser/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput.value })
    })

    if (response.ok) {
      isAuthenticated.value = true
      sessionStorage.setItem('fundraiser_auth', 'true')
      await fetchDonations()
    } else {
      pinError.value = 'Invalid PIN'
      pinInput.value = ''
    }
  } catch (error) {
    console.error('PIN verification error:', error)
    pinError.value = 'Failed to verify PIN'
  } finally {
    isVerifyingPin.value = false
  }
}

// ========================================
// Data Fetching
// ========================================

async function fetchDonations() {
  try {
    const response = await fetch('/api/fundraiser/donations')
    if (!response.ok) throw new Error('Failed to fetch donations')

    const data = await response.json()
    donations.value = data.donations || []
    freeAnswersGiven.value = data.freeAnswersGiven || {}

    // Group donations by table
    groupDonationsByTable()
    lastUpdated.value = new Date()
  } catch (error) {
    console.error('Error fetching donations:', error)
  }
}

function groupDonationsByTable() {
  const tableMap = new Map<number, Donation[]>()
  const unmatched: Donation[] = []

  for (const donation of donations.value) {
    if (donation.table_number !== null) {
      const existing = tableMap.get(donation.table_number) || []
      existing.push(donation)
      tableMap.set(donation.table_number, existing)
    } else {
      unmatched.push(donation)
    }
  }

  unmatchedDonations.value = unmatched

  // Build table summaries
  const tableSummaries: TableSummary[] = []
  for (const [number, tableDonations] of tableMap) {
    const total = tableDonations.reduce((sum, d) => sum + d.amount, 0)
    const freeAnswersEarned = Math.min(
      Math.floor(total / config.value.freeAnswerThreshold),
      config.value.maxFreeAnswersPerTable
    )
    const given = freeAnswersGiven.value[number] || 0

    // Preserve expanded state if table already exists
    const existingTable = tables.value.find(t => t.number === number)

    tableSummaries.push({
      number,
      total,
      donations: tableDonations.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
      freeAnswersEarned,
      freeAnswersGiven: given,
      isExpanded: existingTable?.isExpanded || false
    })
  }

  tables.value = tableSummaries
}

// ========================================
// Phone Lookup
// ========================================

let lookupTimeout: ReturnType<typeof setTimeout> | null = null

function onPhoneInput() {
  selectedPcoMatch.value = null

  // Debounce lookup
  if (lookupTimeout) clearTimeout(lookupTimeout)

  const phone = formData.value.phone.replace(/\D/g, '')
  if (phone.length >= 10) {
    lookupTimeout = setTimeout(() => lookupPhone(phone), 500)
  } else {
    pcoMatches.value = []
    showPcoDropdown.value = false
  }
}

async function lookupPhone(phone: string) {
  isLookingUp.value = true
  try {
    const response = await fetch(`/api/fundraiser/lookup-phone/${phone}`)
    if (response.ok) {
      const data = await response.json()
      pcoMatches.value = data.matches || []
      showPcoDropdown.value = pcoMatches.value.length > 0
    }
  } catch (error) {
    console.error('Phone lookup error:', error)
  } finally {
    isLookingUp.value = false
  }
}

function selectPcoMatch(match: PcoMatch) {
  selectedPcoMatch.value = match
  formData.value.firstName = match.firstName
  formData.value.lastName = match.lastName
  formData.value.email = match.email || ''
  formData.value.address = match.address || ''
  showPcoDropdown.value = false
}

// ========================================
// Form Submission
// ========================================

async function submitDonation() {
  submitError.value = ''
  submitSuccess.value = false

  // Validate
  if (!formData.value.firstName || !formData.value.lastName) {
    submitError.value = 'First and last name are required'
    return
  }
  if (!formData.value.tableNumber) {
    submitError.value = 'Table number is required'
    return
  }
  if (!formData.value.amount || parseFloat(formData.value.amount) <= 0) {
    submitError.value = 'Valid amount is required'
    return
  }

  isSubmitting.value = true

  try {
    const response = await fetch('/api/fundraiser/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: formData.value.firstName,
        last_name: formData.value.lastName,
        phone: formData.value.phone || null,
        email: formData.value.email || null,
        address: formData.value.address || null,
        table_number: parseInt(formData.value.tableNumber),
        amount: parseFloat(formData.value.amount)
      })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to submit donation')
    }

    // Success - clear form and refresh
    submitSuccess.value = true
    formData.value = {
      phone: '',
      firstName: '',
      lastName: '',
      email: '',
      address: '',
      tableNumber: '',
      amount: ''
    }
    selectedPcoMatch.value = null
    pcoMatches.value = []

    await fetchDonations()

    // Clear success message after 3 seconds
    setTimeout(() => {
      submitSuccess.value = false
    }, 3000)
  } catch (error: any) {
    submitError.value = error.message || 'Failed to submit donation'
  } finally {
    isSubmitting.value = false
  }
}

// ========================================
// Table Actions
// ========================================

function toggleTable(tableNumber: number) {
  const table = tables.value.find(t => t.number === tableNumber)
  if (table) {
    table.isExpanded = !table.isExpanded
  }
}

async function giveFreeAnswer(tableNumber: number) {
  try {
    const response = await fetch('/api/fundraiser/free-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber, action: 'give' })
    })

    if (response.ok) {
      await fetchDonations()
    }
  } catch (error) {
    console.error('Error giving free answer:', error)
  }
}

async function undoFreeAnswer(tableNumber: number) {
  try {
    const response = await fetch('/api/fundraiser/free-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber, action: 'undo' })
    })

    if (response.ok) {
      await fetchDonations()
    }
  } catch (error) {
    console.error('Error undoing free answer:', error)
  }
}

// ========================================
// Assign Unmatched Donation
// ========================================

async function assignToTable(donationId: string, tableNumber: number) {
  try {
    const response = await fetch(`/api/fundraiser/donations/${donationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: tableNumber })
    })

    if (response.ok) {
      await fetchDonations()
    }
  } catch (error) {
    console.error('Error assigning donation:', error)
  }
}

// ========================================
// Edit Donation
// ========================================

function openEditModal(donation: Donation) {
  editingDonation.value = donation
  editForm.value = {
    firstName: donation.first_name,
    lastName: donation.last_name,
    phone: donation.phone || '',
    email: donation.email || '',
    address: donation.address || '',
    tableNumber: donation.table_number?.toString() || '',
    amount: donation.amount.toString()
  }
}

function closeEditModal() {
  editingDonation.value = null
}

async function saveEdit() {
  if (!editingDonation.value) return

  isEditing.value = true

  try {
    const response = await fetch(`/api/fundraiser/donations/${editingDonation.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: editForm.value.firstName,
        last_name: editForm.value.lastName,
        phone: editForm.value.phone || null,
        email: editForm.value.email || null,
        address: editForm.value.address || null,
        table_number: editForm.value.tableNumber ? parseInt(editForm.value.tableNumber) : null,
        amount: parseFloat(editForm.value.amount)
      })
    })

    if (response.ok) {
      closeEditModal()
      await fetchDonations()
    }
  } catch (error) {
    console.error('Error saving edit:', error)
  } finally {
    isEditing.value = false
  }
}

// ========================================
// Formatting Helpers
// ========================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// ========================================
// Lifecycle
// ========================================

onMounted(() => {
  // Check if already authenticated
  if (sessionStorage.getItem('fundraiser_auth') === 'true') {
    isAuthenticated.value = true
    fetchDonations()
  }

  // Setup auto-refresh
  refreshInterval = setInterval(() => {
    if (isAuthenticated.value) {
      fetchDonations()
    }
  }, config.value.refreshInterval)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  if (lookupTimeout) {
    clearTimeout(lookupTimeout)
  }
})
</script>

<template>
  <!-- PIN Entry Screen -->
  <div v-if="!isAuthenticated" class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Fundraiser Tracker</h1>
        <p class="text-gray-600 mt-2">Enter PIN to continue</p>
      </div>

      <form @submit.prevent="verifyPin" class="space-y-4">
        <div>
          <input
            v-model="pinInput"
            type="password"
            maxlength="10"
            placeholder="Enter PIN"
            class="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            :disabled="isVerifyingPin"
            autofocus
          />
        </div>

        <p v-if="pinError" class="text-red-600 text-sm text-center">{{ pinError }}</p>

        <button
          type="submit"
          class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isVerifyingPin"
        >
          <span v-if="isVerifyingPin">Verifying...</span>
          <span v-else>Enter</span>
        </button>
      </form>
    </div>
  </div>

  <!-- Main Dashboard -->
  <div v-else class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Fundraiser Tracker</h1>
            <p class="text-sm text-gray-500 mt-1">
              Last updated: {{ lastUpdated ? formatTime(lastUpdated.toISOString()) : 'Loading...' }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-3xl font-bold text-green-600">{{ formatCurrency(totalRaised) }}</p>
            <p class="text-sm text-gray-500">{{ totalDonations }} donations</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Tab Navigation -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav class="-mb-px flex space-x-8">
          <button
            @click="activeTab = 'tables'"
            :class="[
              activeTab === 'tables'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors'
            ]"
          >
            Tables
          </button>
          <button
            @click="activeTab = 'all'"
            :class="[
              activeTab === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors'
            ]"
          >
            All Donations
          </button>
        </nav>
      </div>
    </div>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <!-- Tables Tab -->
      <div v-if="activeTab === 'tables'" class="space-y-6">
        <!-- Donation Entry Form -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Add Donation</h2>

          <form @submit.prevent="submitDonation" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <!-- Phone with PCO Lookup -->
              <div class="relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <div class="relative">
                  <input
                    v-model="formData.phone"
                    @input="onPhoneInput"
                    type="tel"
                    placeholder="(904) 555-1234"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span v-if="isLookingUp" class="absolute right-3 top-2.5 text-gray-400">
                    <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  </span>
                </div>
                <!-- PCO Matches Dropdown -->
                <div
                  v-if="showPcoDropdown && pcoMatches.length > 0"
                  class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto"
                >
                  <button
                    v-for="match in pcoMatches"
                    :key="match.id"
                    @click="selectPcoMatch(match)"
                    type="button"
                    class="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <p class="font-medium text-gray-900">{{ match.name }}</p>
                    <p class="text-sm text-gray-500">{{ match.email || match.phone || 'No contact info' }}</p>
                  </button>
                </div>
              </div>

              <!-- First Name -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  v-model="formData.firstName"
                  type="text"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- Last Name -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  v-model="formData.lastName"
                  type="text"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- Email -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  v-model="formData.email"
                  type="email"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- Address -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  v-model="formData.address"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- Table Number -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Table # *</label>
                <input
                  v-model="formData.tableNumber"
                  type="number"
                  min="1"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- Amount -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <div class="relative">
                  <span class="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    v-model="formData.amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <!-- Submit Button -->
            <div class="flex items-center justify-between">
              <div>
                <p v-if="submitError" class="text-red-600 text-sm">{{ submitError }}</p>
                <p v-if="submitSuccess" class="text-green-600 text-sm">Donation added successfully!</p>
              </div>
              <button
                type="submit"
                class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isSubmitting"
              >
                <span v-if="isSubmitting">Adding...</span>
                <span v-else>Add Donation</span>
              </button>
            </div>
          </form>
        </div>

        <!-- Unmatched Donations Section -->
        <div v-if="unmatchedDonations.length > 0" class="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h2 class="text-lg font-semibold text-yellow-800 mb-4 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            New Donations - Assign Table ({{ unmatchedDonations.length }})
          </h2>

          <div class="space-y-3">
            <div
              v-for="donation in unmatchedDonations"
              :key="donation.id"
              class="flex items-center justify-between bg-white rounded-lg p-4 border border-yellow-200"
            >
              <div>
                <p class="font-medium text-gray-900">{{ donation.first_name }} {{ donation.last_name }}</p>
                <p class="text-sm text-gray-500">{{ formatCurrency(donation.amount) }} - {{ formatTime(donation.created_at) }}</p>
                <p v-if="donation.notes" class="text-xs text-gray-400 mt-1">Notes: {{ donation.notes }}</p>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-sm text-gray-600">Table:</label>
                <select
                  @change="(e) => assignToTable(donation.id, parseInt((e.target as HTMLSelectElement).value))"
                  class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  <option v-for="n in 50" :key="n" :value="n">{{ n }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Table Cards -->
        <div class="space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">Tables ({{ sortedTables.length }})</h2>

          <div v-if="sortedTables.length === 0" class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <p class="text-gray-500">No donations yet. Add a donation above to get started.</p>
          </div>

          <div v-for="table in sortedTables" :key="table.number" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <!-- Table Header -->
            <button
              @click="toggleTable(table.number)"
              class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-center gap-4">
                <span class="text-2xl font-bold text-gray-900">Table {{ table.number }}</span>
                <span class="text-lg font-semibold text-green-600">{{ formatCurrency(table.total) }}</span>
                <span class="text-sm text-gray-500">({{ table.donations.length }} donations)</span>
              </div>

              <div class="flex items-center gap-4">
                <!-- Free Answers Badges -->
                <div v-if="table.freeAnswersEarned > 0" class="flex items-center gap-2">
                  <span
                    v-for="i in table.freeAnswersEarned"
                    :key="i"
                    :class="[
                      'px-2 py-1 rounded-full text-xs font-medium',
                      i <= table.freeAnswersGiven
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    ]"
                  >
                    {{ i <= table.freeAnswersGiven ? 'Given' : 'Free Answer' }}
                  </span>
                </div>

                <!-- Expand/Collapse Icon -->
                <svg
                  :class="['w-5 h-5 text-gray-400 transition-transform', table.isExpanded ? 'rotate-180' : '']"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </button>

            <!-- Expanded Content -->
            <div v-if="table.isExpanded" class="border-t border-gray-200">
              <!-- Free Answer Controls -->
              <div v-if="table.freeAnswersEarned > 0" class="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span class="text-sm text-gray-600">
                  Free Answers: {{ table.freeAnswersGiven }} / {{ table.freeAnswersEarned }} given
                </span>
                <div class="flex gap-2">
                  <button
                    v-if="table.freeAnswersGiven < table.freeAnswersEarned"
                    @click.stop="giveFreeAnswer(table.number)"
                    class="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Give Answer
                  </button>
                  <button
                    v-if="table.freeAnswersGiven > 0"
                    @click.stop="undoFreeAnswer(table.number)"
                    class="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Undo
                  </button>
                </div>
              </div>

              <!-- Donations List -->
              <div class="divide-y divide-gray-100">
                <div
                  v-for="donation in table.donations"
                  :key="donation.id"
                  class="px-6 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <div>
                    <p class="font-medium text-gray-900">{{ donation.first_name }} {{ donation.last_name }}</p>
                    <p class="text-sm text-gray-500">
                      {{ formatCurrency(donation.amount) }}
                      <span class="text-gray-400">- {{ formatTime(donation.created_at) }}</span>
                      <span v-if="donation.source === 'mm'" class="ml-2 text-xs text-purple-600">(QR)</span>
                    </p>
                  </div>
                  <button
                    @click.stop="openEditModal(donation)"
                    class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- All Donations Tab -->
      <div v-if="activeTab === 'all'" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50 border-b border-gray-200">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Table</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="donation in donations" :key="donation.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <p class="font-medium text-gray-900">{{ donation.first_name }} {{ donation.last_name }}</p>
                  <p v-if="donation.email" class="text-sm text-gray-500">{{ donation.email }}</p>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span v-if="donation.table_number" class="px-2 py-1 bg-gray-100 rounded text-sm">
                    {{ donation.table_number }}
                  </span>
                  <span v-else class="text-yellow-600 text-sm">Unassigned</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap font-medium text-green-600">
                  {{ formatCurrency(donation.amount) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'px-2 py-1 rounded-full text-xs font-medium',
                      donation.source === 'mm' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    ]"
                  >
                    {{ donation.source === 'mm' ? 'QR Code' : 'Direct' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDateTime(donation.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <button
                    @click="openEditModal(donation)"
                    class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="donations.length === 0">
                <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                  No donations yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Edit Modal -->
    <div v-if="editingDonation" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Edit Donation</h3>
          <button @click="closeEditModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <form @submit.prevent="saveEdit" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input v-model="editForm.firstName" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input v-model="editForm.lastName" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input v-model="editForm.phone" type="tel" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input v-model="editForm.email" type="email" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input v-model="editForm.address" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Table #</label>
              <input v-model="editForm.tableNumber" type="number" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input v-model="editForm.amount" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-4">
            <button
              type="button"
              @click="closeEditModal"
              class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              :disabled="isEditing"
            >
              <span v-if="isEditing">Saving...</span>
              <span v-else>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
