<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

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

const props = defineProps<{
  groups: Group[]
}>()

const emit = defineEmits<{
  (e: 'marker-click', group: Group): void
}>()

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let markerClusterGroup: L.MarkerClusterGroup | null = null

// Custom marker icon
const createIcon = (isCluster = false, count = 0) => {
  if (isCluster) {
    return L.divIcon({
      html: `<div class="cluster-icon">${count}</div>`,
      className: 'custom-cluster-icon',
      iconSize: L.point(40, 40)
    })
  }

  return L.divIcon({
    html: `<div class="marker-icon">
      <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
        <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
      </svg>
    </div>`,
    className: 'custom-marker-icon',
    iconSize: L.point(36, 36),
    iconAnchor: L.point(18, 36)
  })
}

function initMap() {
  if (!mapContainer.value) return

  // RCC church location as default center
  const defaultCenter: [number, number] = [30.09, -81.707174]

  map = L.map(mapContainer.value, {
    center: defaultCenter,
    zoom: 11,
    zoomControl: true
  })

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map)

  // Initialize marker cluster group
  markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: (cluster: L.MarkerCluster) => {
      return L.divIcon({
        html: `<div class="cluster-icon">${cluster.getChildCount()}</div>`,
        className: 'custom-cluster-icon',
        iconSize: L.point(44, 44)
      })
    }
  })

  map.addLayer(markerClusterGroup)

  // Add markers
  updateMarkers()
}

function updateMarkers() {
  if (!markerClusterGroup || !map) return

  const cluster = markerClusterGroup
  const mapInstance = map

  cluster.clearLayers()

  props.groups.forEach(group => {
    if (!group.location) return

    const marker = L.marker([group.location.lat, group.location.lng], {
      icon: createIcon()
    })

    // Create popup content with all details and icons
    const locationText = group.location.displayPreference === 'approximate'
      ? (group.location.name || 'Approximate location')
      : (group.location.address?.split('\n')[0] || group.location.name || '')

    const popupContent = `
      <div class="group-popup" style="min-width: 240px;">
        <h3 style="font-weight: 600; color: #111827; font-size: 1rem; margin-bottom: 12px; line-height: 1.3;">${group.name}</h3>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${group.schedule ? `
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg style="width: 16px; height: 16px; color: #9CA3AF; flex-shrink: 0;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span style="font-size: 0.875rem; color: #4B5563;">${group.schedule}</span>
          </div>
          ` : ''}

          <div style="display: flex; align-items: center; gap: 8px;">
            <svg style="width: 16px; height: 16px; color: #9CA3AF; flex-shrink: 0;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span style="font-size: 0.875rem; color: #4B5563;">${locationText}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <svg style="width: 16px; height: 16px; color: ${group.hasChildcare ? '#22C55E' : '#9CA3AF'}; flex-shrink: 0;" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-6 8v-2c0-2.21 1.79-4 4-4h4c2.21 0 4 1.79 4 4v2H6zM9 8c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm4 0c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1z"/>
            </svg>
            <span style="font-size: 0.875rem; color: ${group.hasChildcare ? '#16A34A' : '#9CA3AF'};">
              Childcare ${group.hasChildcare ? 'Provided' : 'Not Provided'}
            </span>
          </div>
        </div>

        ${group.publicUrl ? `
        <a href="${group.publicUrl}" target="_blank" rel="noopener noreferrer"
           style="display: block; margin-top: 12px; padding: 8px 16px; background: #095879; color: white;
                  text-align: center; border-radius: 8px; font-size: 0.875rem; font-weight: 500;
                  text-decoration: none; transition: background 0.2s;"
           onmouseover="this.style.background='#074863'" onmouseout="this.style.background='#095879'">
          Join This Group
        </a>
        ` : (group.contactEmail ? `
        <a href="mailto:${group.contactEmail}?subject=Interest in ${encodeURIComponent(group.name)}"
           style="display: block; margin-top: 12px; padding: 8px 16px; background: #095879; color: white;
                  text-align: center; border-radius: 8px; font-size: 0.875rem; font-weight: 500;
                  text-decoration: none; transition: background 0.2s;"
           onmouseover="this.style.background='#074863'" onmouseout="this.style.background='#095879'">
          Contact Leader
        </a>
        ` : '')}
      </div>
    `

    marker.bindPopup(popupContent, {
      className: 'custom-popup',
      maxWidth: 320,
      minWidth: 260
    })

    cluster.addLayer(marker)
  })

  // Fit bounds if we have markers
  if (props.groups.length > 0) {
    const bounds = cluster.getBounds()
    if (bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 })
    }
  }
}

watch(() => props.groups, () => {
  updateMarkers()
}, { deep: true })

onMounted(() => {
  initMap()
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div ref="mapContainer" class="w-full h-full"></div>
</template>

<style>
/* Custom marker styles */
.custom-marker-icon {
  background: transparent;
  border: none;
}

.marker-icon {
  width: 36px;
  height: 36px;
  color: #095879;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.marker-icon svg {
  width: 100%;
  height: 100%;
}

/* Cluster icon styles */
.custom-cluster-icon {
  background: transparent;
  border: none;
}

.cluster-icon {
  width: 44px;
  height: 44px;
  background: #095879;
  border: 3px solid white;
  border-radius: 50%;
  color: white;
  font-weight: bold;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* Custom popup styles */
.custom-popup .leaflet-popup-content-wrapper {
  border-radius: 16px;
  padding: 8px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
}

.custom-popup .leaflet-popup-content {
  margin: 20px 24px;
  font-family: system-ui, -apple-system, sans-serif;
}

.custom-popup .leaflet-popup-tip {
  background: white;
}

.custom-popup .leaflet-popup-close-button {
  top: 12px !important;
  right: 12px !important;
  width: 28px;
  height: 28px;
  font-size: 22px;
  line-height: 28px;
  color: #6B7280;
  background: #F3F4F6;
  border-radius: 50%;
  text-align: center;
}

.custom-popup .leaflet-popup-close-button:hover {
  color: #111827;
  background: #E5E7EB;
}

/* Fix Leaflet default icon issue */
.leaflet-default-icon-path {
  background-image: url(https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png);
}
</style>
