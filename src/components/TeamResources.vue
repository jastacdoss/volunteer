<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { getSession } from '@/lib/auth'

interface Folder {
  id: string
  name: string
  parentId: string | null
  teamId: string | null
}

interface FileItem {
  id: string
  name: string
  displayName: string
  contentType: string
  folderId: string | null
  teamId: string | null
  r2Key: string
}

const props = defineProps<{
  teamId: string
}>()

const isLoading = ref(true)
const folders = ref<Folder[]>([])
const files = ref<FileItem[]>([])
const expandedFolders = ref<Set<string>>(new Set())
const error = ref<string | null>(null)

// Get root-level folders (no parent)
const rootFolders = computed(() => {
  return folders.value.filter(f => !f.parentId).sort((a, b) => a.name.localeCompare(b.name))
})

// Get root-level files (not in any folder)
const rootFiles = computed(() => {
  return files.value
    .filter(f => !f.folderId)
    .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
})

// Get child folders for a parent
function getChildFolders(parentId: string): Folder[] {
  return folders.value.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))
}

// Get files in a folder
function getFilesInFolder(folderId: string): FileItem[] {
  return files.value
    .filter(f => f.folderId === folderId)
    .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
}

// Check if folder is expanded
function isFolderExpanded(folderId: string): boolean {
  return expandedFolders.value.has(folderId)
}

// Toggle folder expansion
function toggleFolder(folderId: string) {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId)
  } else {
    expandedFolders.value.add(folderId)
  }
}

// Fetch resources for this team
async function fetchResources() {
  const session = getSession()
  if (!session) return

  isLoading.value = true
  error.value = null

  try {
    const response = await fetch(`/api/resources?teamId=${encodeURIComponent(props.teamId)}`, {
      headers: { Authorization: `Bearer ${session.token}` }
    })

    if (!response.ok) throw new Error('Failed to fetch resources')

    const data = await response.json()
    folders.value = data.folders || []
    files.value = data.files || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load resources'
  } finally {
    isLoading.value = false
  }
}

// Download a file
async function downloadFile(file: FileItem) {
  const session = getSession()
  if (!session) return

  try {
    const response = await fetch(`/api/resources/download/${file.id}`, {
      headers: { Authorization: `Bearer ${session.token}` }
    })

    if (!response.ok) throw new Error('Failed to get download URL')

    const { url } = await response.json()
    window.open(url, '_blank')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to download file'
  }
}

// Check if there are any resources
const hasResources = computed(() => {
  return folders.value.length > 0 || files.value.length > 0
})

onMounted(() => {
  fetchResources()
})

// Re-fetch when teamId changes
watch(() => props.teamId, () => {
  expandedFolders.value.clear()
  fetchResources()
})
</script>

<template>
  <div class="team-resources">
    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-red-600 text-sm py-4">
      {{ error }}
    </div>

    <!-- Empty State -->
    <div v-else-if="!hasResources" class="text-center py-8 text-gray-500">
      <svg class="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <p class="text-sm">No resources available for this team</p>
    </div>

    <!-- Resources Tree -->
    <div v-else class="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <!-- Root Folders -->
      <template v-for="folder in rootFolders" :key="folder.id">
        <!-- Folder Header -->
        <div
          class="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
          @click="toggleFolder(folder.id)"
        >
          <svg
            class="w-4 h-4 text-gray-500 transition-transform"
            :class="{ 'rotate-90': isFolderExpanded(folder.id) }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <svg class="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
          <span class="font-medium text-gray-900">{{ folder.name }}</span>
        </div>

        <!-- Folder Contents (when expanded) -->
        <div v-if="isFolderExpanded(folder.id)" class="bg-white">
          <!-- Child Folders -->
          <template v-for="childFolder in getChildFolders(folder.id)" :key="childFolder.id">
            <div
              class="flex items-center gap-2 px-4 py-2 pl-10 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              @click="toggleFolder(childFolder.id)"
            >
              <svg
                class="w-4 h-4 text-gray-400 transition-transform"
                :class="{ 'rotate-90': isFolderExpanded(childFolder.id) }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
              <span class="text-sm text-gray-800">{{ childFolder.name }}</span>
            </div>

            <!-- Nested folder files -->
            <div v-if="isFolderExpanded(childFolder.id)">
              <div
                v-for="file in getFilesInFolder(childFolder.id)"
                :key="file.id"
                class="flex items-center justify-between px-4 py-2 pl-16 border-b border-gray-100 hover:bg-blue-50 transition-colors"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="text-sm text-gray-700 truncate">{{ file.displayName || file.name }}</span>
                </div>
                <button
                  @click.stop="downloadFile(file)"
                  class="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors flex-shrink-0"
                  title="Download"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>
            </div>
          </template>

          <!-- Files in this folder -->
          <div
            v-for="file in getFilesInFolder(folder.id)"
            :key="file.id"
            class="flex items-center justify-between px-4 py-2 pl-10 border-b border-gray-100 hover:bg-blue-50 transition-colors"
          >
            <div class="flex items-center gap-2 min-w-0">
              <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="text-sm text-gray-700 truncate">{{ file.displayName || file.name }}</span>
            </div>
            <button
              @click.stop="downloadFile(file)"
              class="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors flex-shrink-0"
              title="Download"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>
      </template>

      <!-- Root-level Files (not in any folder) -->
      <div
        v-for="file in rootFiles"
        :key="file.id"
        class="flex items-center justify-between px-4 py-3 border-b border-gray-200 last:border-b-0 hover:bg-blue-50 transition-colors"
      >
        <div class="flex items-center gap-2 min-w-0">
          <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span class="text-gray-900 truncate">{{ file.displayName || file.name }}</span>
        </div>
        <button
          @click="downloadFile(file)"
          class="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors flex-shrink-0"
          title="Download"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
