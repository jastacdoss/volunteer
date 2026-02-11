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
  street?: string
  city?: string
  state?: string
  zip?: string
  table_number: number | null
  amount: number
  notes?: string
  reference_number?: string
  created_at: string
  deleted_at?: string
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
  firstName: string
  lastName: string
  email?: string
  phone?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  tableNumber?: number
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
const deletedDonations = ref<Donation[]>([])
const freeAnswersGiven = ref<Record<number, number>>({})
const isLoading = ref(false)
const lastUpdated = ref<Date | null>(null)

// Form state (preserved across refreshes)
const formData = ref({
  phone: '',
  firstName: '',
  lastName: '',
  email: '',
  street: '',
  city: '',
  state: '',
  zip: '',
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
  street: '',
  city: '',
  state: '',
  zip: '',
  tableNumber: '',
  amount: ''
})
const isEditing = ref(false)

// Payment state
const paymentMode = ref<'idle' | 'processing' | 'waiting' | 'success' | 'error'>('idle')
const currentCheckoutId = ref<string | null>(null)
const paymentError = ref('')

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
  // Only count non-deleted donations
  return donations.value.filter(d => !d.deleted_at).reduce((sum, d) => sum + d.amount, 0)
})

const totalDonations = computed(() => donations.value.filter(d => !d.deleted_at).length)
const activeDonations = computed(() => donations.value.filter(d => !d.deleted_at))

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
  const deleted: Donation[] = []

  for (const donation of donations.value) {
    // Skip deleted donations from table calculations
    if (donation.deleted_at) {
      deleted.push(donation)
      continue
    }

    if (donation.table_number !== null) {
      const existing = tableMap.get(donation.table_number) || []
      existing.push(donation)
      tableMap.set(donation.table_number, existing)
    } else {
      unmatched.push(donation)
    }
  }

  unmatchedDonations.value = unmatched
  deletedDonations.value = deleted

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
  formData.value.firstName = match.firstName || ''
  formData.value.lastName = match.lastName || ''
  formData.value.email = match.email || ''
  formData.value.street = match.street || ''
  formData.value.city = match.city || ''
  formData.value.state = match.state || ''
  formData.value.zip = match.zip || ''
  // Auto-populate table number if this donor has donated before
  if (match.tableNumber) {
    formData.value.tableNumber = String(match.tableNumber)
  }
  // Keep the phone that was searched with
  showPcoDropdown.value = false
}

// ========================================
// Form Submission
// ========================================

function validateForm(): boolean {
  submitError.value = ''
  paymentError.value = ''

  if (!formData.value.phone || formData.value.phone.replace(/\D/g, '').length < 10) {
    submitError.value = 'Valid phone number is required'
    return false
  }
  if (!formData.value.firstName || !formData.value.lastName) {
    submitError.value = 'First and last name are required'
    return false
  }
  if (!formData.value.tableNumber) {
    submitError.value = 'Table number is required'
    return false
  }
  if (!formData.value.amount || parseFloat(formData.value.amount) <= 0) {
    submitError.value = 'Valid amount is required'
    return false
  }
  return true
}

function clearFormAndRefresh() {
  formData.value = {
    phone: '',
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    tableNumber: '',
    amount: ''
  }
  selectedPcoMatch.value = null
  pcoMatches.value = []
  fetchDonations()
}

async function createDonation(): Promise<boolean> {
  try {
    const response = await fetch('/api/fundraiser/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: formData.value.firstName,
        last_name: formData.value.lastName,
        phone: formData.value.phone || null,
        email: formData.value.email || null,
        street: formData.value.street || null,
        city: formData.value.city || null,
        state: formData.value.state || null,
        zip: formData.value.zip || null,
        table_number: parseInt(formData.value.tableNumber),
        amount: parseFloat(formData.value.amount)
      })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to submit donation')
    }
    return true
  } catch (error: any) {
    submitError.value = error.message || 'Failed to submit donation'
    return false
  }
}

// Cash payment - just create the donation
async function submitCashPayment() {
  if (!validateForm()) return

  submitSuccess.value = false
  isSubmitting.value = true

  try {
    const success = await createDonation()
    if (success) {
      submitSuccess.value = true
      clearFormAndRefresh()
      setTimeout(() => { submitSuccess.value = false }, 3000)
    }
  } finally {
    isSubmitting.value = false
  }
}

// Card payment - create Square checkout, wait for completion, then create donation
async function startCardPayment() {
  if (!validateForm()) return

  paymentMode.value = 'processing'
  paymentError.value = ''

  try {
    // Create Square Terminal checkout
    const response = await fetch('/api/fundraiser/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(formData.value.amount),
        donorInfo: {
          firstName: formData.value.firstName,
          lastName: formData.value.lastName,
          tableNumber: formData.value.tableNumber
        }
      })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to create checkout')
    }

    const data = await response.json()
    currentCheckoutId.value = data.checkoutId
    paymentMode.value = 'waiting'

    // Start polling for payment completion
    pollPaymentStatus()
  } catch (error: any) {
    paymentError.value = error.message || 'Failed to start payment'
    paymentMode.value = 'error'
  }
}

let pollInterval: ReturnType<typeof setInterval> | null = null

let pollStartTime: number | null = null
const POLL_TIMEOUT = 5 * 60 * 1000 // 5 minutes max

async function pollPaymentStatus() {
  if (!currentCheckoutId.value) return

  pollStartTime = Date.now()

  // Poll every 3 seconds
  pollInterval = setInterval(async () => {
    // Stop polling after 5 minutes
    if (pollStartTime && Date.now() - pollStartTime > POLL_TIMEOUT) {
      clearInterval(pollInterval!)
      pollInterval = null
      paymentMode.value = 'error'
      paymentError.value = 'Payment timed out'
      currentCheckoutId.value = null
      return
    }

    try {
      const response = await fetch(`/api/fundraiser/checkout/${currentCheckoutId.value}`)
      const data = await response.json()

      if (data.status === 'COMPLETED') {
        // Payment successful - create the donation
        clearInterval(pollInterval!)
        pollInterval = null

        paymentMode.value = 'processing'
        const success = await createDonation()

        if (success) {
          paymentMode.value = 'success'
          setTimeout(() => {
            paymentMode.value = 'idle'
            clearFormAndRefresh()
          }, 2000)
        } else {
          paymentMode.value = 'error'
          paymentError.value = 'Payment collected but failed to record donation'
        }
        currentCheckoutId.value = null
      } else if (data.status === 'CANCELED' || data.status === 'CANCEL_REQUESTED') {
        clearInterval(pollInterval!)
        pollInterval = null
        paymentMode.value = 'idle'
        currentCheckoutId.value = null
      }
    } catch (error) {
      console.error('Error polling payment status:', error)
    }
  }, 3000)
}

async function cancelPayment() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }

  if (currentCheckoutId.value) {
    try {
      await fetch(`/api/fundraiser/checkout/${currentCheckoutId.value}/cancel`, {
        method: 'POST'
      })
    } catch (error) {
      console.error('Error canceling payment:', error)
    }
  }

  currentCheckoutId.value = null
  paymentMode.value = 'idle'
  paymentError.value = ''
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
    street: donation.street || '',
    city: donation.city || '',
    state: donation.state || '',
    zip: donation.zip || '',
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
    // MM donations: only table number can be edited
    const payload = editingDonation.value.source === 'mm'
      ? { tableNumber: editForm.value.tableNumber ? parseInt(editForm.value.tableNumber) : null }
      : {
          firstName: editForm.value.firstName,
          lastName: editForm.value.lastName,
          phone: editForm.value.phone || null,
          email: editForm.value.email || null,
          street: editForm.value.street || null,
          city: editForm.value.city || null,
          state: editForm.value.state || null,
          zip: editForm.value.zip || null,
          tableNumber: editForm.value.tableNumber ? parseInt(editForm.value.tableNumber) : null,
          amount: parseFloat(editForm.value.amount)
        }

    const response = await fetch(`/api/fundraiser/donations/${editingDonation.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
// Delete Donation
// ========================================

async function confirmDeleteDonation(donation: Donation) {
  const name = `${donation.first_name} ${donation.last_name}`.trim() || 'Anonymous'
  const amount = formatCurrency(donation.amount)

  if (!confirm(`Delete donation from ${name} for ${amount}?\n\nThis will remove it from our system${donation.mm_id ? ' and Managed Missions' : ''}.`)) {
    return
  }

  try {
    const response = await fetch(`/api/fundraiser/donations/${donation.id}`, {
      method: 'DELETE'
    })

    if (response.ok) {
      await fetchDonations()
    } else {
      alert('Failed to delete donation')
    }
  } catch (error) {
    console.error('Error deleting donation:', error)
    alert('Failed to delete donation')
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
  if (pollInterval) {
    clearInterval(pollInterval)
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

          <form @submit.prevent class="space-y-4">
            <!-- Row 1: Phone and Email -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <span class="font-medium text-gray-900">{{ match.firstName }} {{ match.lastName }}</span>
                    <span v-if="match.email" class="text-gray-500"> ({{ match.email }})</span>
                  </button>
                </div>
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

            <!-- Row 2: First Name and Last Name -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- First Name -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  v-model="formData.firstName"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- Last Name -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  v-model="formData.lastName"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <!-- Row 3: Address fields -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <!-- Street -->
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Street</label>
                <input
                  v-model="formData.street"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- City -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  v-model="formData.city"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <!-- State/Zip -->
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    v-model="formData.state"
                    type="text"
                    maxlength="2"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                  <input
                    v-model="formData.zip"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <!-- Row 4: Table # and Amount -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Table Number -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Table # *</label>
                <input
                  v-model="formData.tableNumber"
                  type="number"
                  min="1"
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
                    class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <!-- Payment Buttons -->
            <div class="space-y-3">
              <div v-if="submitError" class="text-red-600 text-sm">{{ submitError }}</div>
              <div v-if="submitSuccess" class="text-green-600 text-sm">Donation added successfully!</div>

              <div class="flex gap-3">
                <button
                  type="button"
                  @click="startCardPayment"
                  class="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  :disabled="isSubmitting || paymentMode !== 'idle'"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                  </svg>
                  Card Payment
                </button>
                <button
                  type="button"
                  @click="submitCashPayment"
                  class="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  :disabled="isSubmitting || paymentMode !== 'idle'"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
                  </svg>
                  <span v-if="isSubmitting">Processing...</span>
                  <span v-else>Cash Payment</span>
                </button>
              </div>
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
                  <option v-for="n in 100" :key="n" :value="n">{{ n }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Table Cards -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Tables ({{ sortedTables.length }})</h2>

          <div v-if="sortedTables.length === 0" class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <p class="text-gray-500">No donations yet. Add a donation above to get started.</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                <!-- Free Answers Summary -->
                <span
                  :class="[
                    'px-3 py-1 rounded-full text-xs font-medium',
                    table.freeAnswersEarned > 0
                      ? (table.freeAnswersGiven >= table.freeAnswersEarned ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800')
                      : 'bg-gray-100 text-gray-600'
                  ]"
                >
                  Free Answers: {{ table.freeAnswersGiven }}/{{ table.freeAnswersEarned }}
                </span>

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
              <!-- Free Answer Controls - Always show -->
              <div class="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span class="text-sm text-gray-600">
                  Free Answers: {{ table.freeAnswersGiven }} / {{ table.freeAnswersEarned }} given
                </span>
                <div class="flex gap-2">
                  <button
                    @click.stop="giveFreeAnswer(table.number)"
                    :disabled="table.freeAnswersGiven >= table.freeAnswersEarned"
                    :class="[
                      'px-3 py-1 text-sm rounded-lg transition-colors',
                      table.freeAnswersGiven < table.freeAnswersEarned
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    ]"
                  >
                    Give Answer
                  </button>
                  <button
                    @click.stop="undoFreeAnswer(table.number)"
                    :disabled="table.freeAnswersGiven <= 0"
                    :class="[
                      'px-3 py-1 text-sm rounded-lg transition-colors',
                      table.freeAnswersGiven > 0
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    ]"
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
                  <div class="flex items-center gap-1">
                    <button
                      @click.stop="openEditModal(donation)"
                      class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </button>
                    <button
                      @click.stop="confirmDeleteDonation(donation)"
                      class="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>
                </div>
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
              <tr
                v-for="donation in donations"
                :key="donation.id"
                :class="[
                  donation.deleted_at ? 'bg-red-50 opacity-60' : 'hover:bg-gray-50'
                ]"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <p :class="['font-medium', donation.deleted_at ? 'text-gray-400 line-through' : 'text-gray-900']">
                    {{ donation.first_name }} {{ donation.last_name }}
                  </p>
                  <p v-if="donation.email" class="text-sm text-gray-500">{{ donation.email }}</p>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span v-if="donation.table_number" class="px-2 py-1 bg-gray-100 rounded text-sm">
                    {{ donation.table_number }}
                  </span>
                  <span v-else class="text-yellow-600 text-sm">Unassigned</span>
                </td>
                <td :class="['px-6 py-4 whitespace-nowrap font-medium', donation.deleted_at ? 'text-gray-400 line-through' : 'text-green-600']">
                  {{ formatCurrency(donation.amount) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    v-if="donation.deleted_at"
                    class="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
                  >
                    DELETED
                  </span>
                  <span
                    v-else
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
                  <div v-if="!donation.deleted_at" class="flex items-center gap-1">
                    <button
                      @click="openEditModal(donation)"
                      class="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                      </svg>
                    </button>
                    <button
                      @click="confirmDeleteDonation(donation)"
                      class="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>
                  <span v-else class="text-xs text-gray-400">-</span>
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
          <!-- MM donations: only table assignment allowed -->
          <div v-if="editingDonation?.source === 'mm'" class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
            <p class="text-sm text-purple-800">
              <strong>QR Code Donation</strong> - Only table assignment can be edited. Other fields are managed in Managed Missions.
            </p>
          </div>

          <!-- Local donations: full editing -->
          <template v-if="editingDonation?.source !== 'mm'">
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

            <div class="grid grid-cols-4 gap-4">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Street</label>
                <input v-model="editForm.street" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input v-model="editForm.city" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input v-model="editForm.state" type="text" maxlength="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                  <input v-model="editForm.zip" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          </template>

          <!-- Table # - always editable -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Table #</label>
            <input v-model="editForm.tableNumber" type="number" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>

          <!-- Amount - only for local donations -->
          <div v-if="editingDonation?.source !== 'mm'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input v-model="editForm.amount" type="number" min="0.01" step="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
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

    <!-- Payment Processing Modal -->
    <div v-if="paymentMode !== 'idle'" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-8 text-center">
        <!-- Processing State -->
        <div v-if="paymentMode === 'processing'">
          <div class="animate-spin w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Processing...</h3>
          <p class="text-gray-600">Please wait</p>
        </div>

        <!-- Waiting for Card State -->
        <div v-if="paymentMode === 'waiting'">
          <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-10 h-10 text-green-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Waiting for Card</h3>
          <p class="text-gray-600 mb-2">
            <span class="font-bold text-2xl text-green-600">{{ formData.amount ? `$${parseFloat(formData.amount).toFixed(2)}` : '' }}</span>
          </p>
          <p class="text-gray-500 mb-6">Please tap or insert card on the terminal</p>
          <button
            @click="cancelPayment"
            class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>

        <!-- Success State -->
        <div v-if="paymentMode === 'success'">
          <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-green-600 mb-2">Payment Successful!</h3>
          <p class="text-gray-600">Donation recorded</p>
        </div>

        <!-- Error State -->
        <div v-if="paymentMode === 'error'">
          <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-red-600 mb-2">Payment Failed</h3>
          <p class="text-gray-600 mb-6">{{ paymentError || 'An error occurred' }}</p>
          <button
            @click="paymentMode = 'idle'; paymentError = ''"
            class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
