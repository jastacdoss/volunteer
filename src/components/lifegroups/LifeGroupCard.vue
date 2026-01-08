<script setup lang="ts">
interface GroupLocation {
  name: string
  address: string
  lat: number
  lng: number
  displayPreference: string
}

interface Group {
  id: string
  name: string
  description: string
  schedule: string | null
  contactEmail: string | null
  membersCount: number
  publicUrl: string | null
  headerImage: string | null
  groupTypeId: string
  hasChildcare: boolean
  location: GroupLocation | null
}

defineProps<{
  group: Group
}>()

defineEmits<{
  (e: 'click'): void
}>()

// Get location display text (respects privacy settings)
function getLocationText(group: Group): string {
  if (!group.location) {
    // Try to extract from description
    const match = group.description?.match(/Meeting Area:\s*([^\n]+)/i)
    return match?.[1] ?? 'Location not specified'
  }

  if (group.location.displayPreference === 'approximate') {
    return group.location.name || 'Approximate area'
  }

  // Return just the city/area from the address
  const address = group.location.address || ''
  const parts = address.split('\n')
  return parts[1] || parts[0] || group.location.name || 'Location available'
}
</script>

<template>
  <div
    class="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer border border-gray-100 group"
    @click="$emit('click')"
  >
    <!-- Header Image -->
    <div
      v-if="group.headerImage"
      class="h-32 bg-cover bg-center"
      :style="{ backgroundImage: `url(${group.headerImage})` }"
    ></div>
    <div v-else class="h-32 bg-gradient-to-br from-[#095879] to-[#0a6d94]"></div>

    <!-- Content -->
    <div class="p-5">
      <h3 class="text-lg font-semibold text-gray-900 mb-2 group-hover:text-[#095879] transition-colors line-clamp-2">
        {{ group.name }}
      </h3>

      <!-- Schedule -->
      <div v-if="group.schedule" class="flex items-center gap-2 text-sm text-gray-600 mb-2">
        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{{ group.schedule }}</span>
      </div>

      <!-- Location -->
      <div class="flex items-center gap-2 text-sm text-gray-600 mb-2">
        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>{{ getLocationText(group) }}</span>
      </div>

      <!-- Childcare -->
      <div class="flex items-center gap-2 text-sm mb-3">
        <svg class="w-4 h-4" :class="group.hasChildcare ? 'text-green-500' : 'text-gray-300'" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-6 8v-2c0-2.21 1.79-4 4-4h4c2.21 0 4 1.79 4 4v2H6zM9 8c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm4 0c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1z"/>
        </svg>
        <span :class="group.hasChildcare ? 'text-green-600' : 'text-gray-400'">
          Childcare {{ group.hasChildcare ? 'Provided' : 'Not Provided' }}
        </span>
      </div>

      <!-- Footer -->
      <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span class="text-xs text-gray-500">
          {{ group.membersCount }} member{{ group.membersCount !== 1 ? 's' : '' }}
        </span>
        <span class="text-sm font-medium text-[#095879] group-hover:underline">
          Learn More
        </span>
      </div>
    </div>
  </div>
</template>
