<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import RccHeader from '@/components/RccHeader.vue'
import { getSession, checkPermissions } from '@/lib/auth'

interface Folder {
  id: string
  name: string
  parentId: string | null
  teamId: string | null
  createdAt: string
  createdBy: string
}

interface FileItem {
  id: string
  name: string
  displayName: string
  contentType: string
  folderId: string | null
  teamId: string | null
  r2Key: string
  createdAt: string
  createdBy: string
}

interface Team {
  key: string
  name: string
}

const router = useRouter()

const isLoading = ref(true)
const isAuthenticated = ref(false)
const isAdmin = ref(false)
const folders = ref<Folder[]>([])
const files = ref<FileItem[]>([])
const currentFolderId = ref<string | null>(null)
const error = ref<string | null>(null)
const selectedTeamId = ref<string>('lifegroups')  // Default to lifegroups for backward compatibility

// Available teams for the dropdown
const availableTeams: Team[] = [
  { key: 'lifegroups', name: 'Life Groups' },
  { key: 'kids', name: 'Kids Ministry' },
  { key: 'students', name: 'Student Ministry' },
  { key: 'worship', name: 'Worship Team' },
  { key: 'production', name: 'Production Team' },
  { key: 'connect', name: 'Connect Team' },
  { key: 'care', name: 'Care Ministry' },
  { key: 'outreach', name: 'Outreach' },
]

// Upload state
const showUploadModal = ref(false)
const uploadFile = ref<File | null>(null)
const uploadDisplayName = ref('')
const isUploading = ref(false)
const uploadError = ref<string | null>(null)

// Folder creation state
const showFolderModal = ref(false)
const newFolderName = ref('')
const isCreatingFolder = ref(false)

// Delete confirmation state
const showDeleteConfirm = ref(false)
const deleteTarget = ref<{ type: 'file' | 'folder', id: string, name: string } | null>(null)
const isDeleting = ref(false)

// Move file state
const showMoveModal = ref(false)
const moveTarget = ref<FileItem | null>(null)
const selectedFolderId = ref<string | null>(null)
const isMoving = ref(false)

// Rename state
const showRenameModal = ref(false)
const renameTarget = ref<{ type: 'file' | 'folder', id: string, currentName: string } | null>(null)
const newName = ref('')
const isRenaming = ref(false)

// Get current folder and its contents
const currentFolder = computed(() => {
  if (!currentFolderId.value) return null
  return folders.value.find(f => f.id === currentFolderId.value)
})

const currentFolders = computed(() => {
  return folders.value.filter(f => f.parentId === currentFolderId.value)
})

const currentFiles = computed(() => {
  return files.value
    .filter(f => f.folderId === currentFolderId.value)
    .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
})

// Get current team's display name
const currentTeamName = computed(() => {
  const team = availableTeams.find(t => t.key === selectedTeamId.value)
  return team ? team.name : 'Resources'
})

// Breadcrumb navigation
const breadcrumbs = computed(() => {
  const crumbs: { id: string | null, name: string }[] = [{ id: null, name: currentTeamName.value }]

  if (currentFolderId.value) {
    let folder = folders.value.find(f => f.id === currentFolderId.value)
    const path: Folder[] = []

    while (folder) {
      path.unshift(folder)
      folder = folder.parentId ? folders.value.find(f => f.id === folder!.parentId) : undefined
    }

    path.forEach(f => crumbs.push({ id: f.id, name: f.name }))
  }

  return crumbs
})

async function fetchResources() {
  const session = getSession()
  if (!session) return

  try {
    // Include teamId filter in the request
    const url = selectedTeamId.value
      ? `/api/resources?teamId=${encodeURIComponent(selectedTeamId.value)}`
      : '/api/resources'

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.token}` }
    })

    if (!response.ok) throw new Error('Failed to fetch resources')

    const data = await response.json()
    folders.value = data.folders || []
    files.value = data.files || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load resources'
  }
}

// Handle team change - reset folder navigation and fetch resources
async function handleTeamChange() {
  currentFolderId.value = null  // Reset to root
  await fetchResources()
}

async function downloadFile(file: FileItem) {
  const session = getSession()
  if (!session) return

  try {
    const response = await fetch(`/api/resources/download/${file.id}`, {
      headers: { Authorization: `Bearer ${session.token}` }
    })

    if (!response.ok) throw new Error('Failed to get download URL')

    const { url } = await response.json()

    // Open download in new tab
    window.open(url, '_blank')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to download file'
  }
}

async function createFolder() {
  if (!newFolderName.value.trim()) return

  const session = getSession()
  if (!session) return

  isCreatingFolder.value = true

  try {
    const response = await fetch('/api/resources/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({
        name: newFolderName.value.trim(),
        parentId: currentFolderId.value,
        teamId: selectedTeamId.value
      })
    })

    if (!response.ok) throw new Error('Failed to create folder')

    const folder = await response.json()
    folders.value.push(folder)

    showFolderModal.value = false
    newFolderName.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create folder'
  } finally {
    isCreatingFolder.value = false
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    uploadFile.value = input.files[0]
  }
}

async function performUpload() {
  if (!uploadFile.value) return

  const session = getSession()
  if (!session) return

  isUploading.value = true
  uploadError.value = null

  try {
    // 1. Get presigned upload URL
    const urlResponse = await fetch('/api/resources/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({
        filename: uploadFile.value.name,
        contentType: uploadFile.value.type || 'application/octet-stream',
        folderId: currentFolderId.value,
        displayName: uploadDisplayName.value.trim() || uploadFile.value.name,
        teamId: selectedTeamId.value
      })
    })

    if (!urlResponse.ok) throw new Error('Failed to get upload URL')

    const { uploadUrl, fileMetadata } = await urlResponse.json()

    // 2. Upload file directly to R2
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': uploadFile.value.type || 'application/octet-stream'
      },
      body: uploadFile.value
    })

    if (!uploadResponse.ok) throw new Error('Failed to upload file')

    // 3. Confirm upload (save metadata)
    const confirmResponse = await fetch('/api/resources/files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({ fileMetadata })
    })

    if (!confirmResponse.ok) throw new Error('Failed to save file metadata')

    const savedFile = await confirmResponse.json()
    files.value.push(savedFile)

    showUploadModal.value = false
    uploadFile.value = null
    uploadDisplayName.value = ''
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  } finally {
    isUploading.value = false
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return

  const session = getSession()
  if (!session) return

  isDeleting.value = true

  try {
    const endpoint = deleteTarget.value.type === 'folder'
      ? `/api/resources/folders/${deleteTarget.value.id}`
      : `/api/resources/files/${deleteTarget.value.id}`

    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.token}` }
    })

    if (!response.ok) throw new Error(`Failed to delete ${deleteTarget.value.type}`)

    if (deleteTarget.value.type === 'folder') {
      folders.value = folders.value.filter(f => f.id !== deleteTarget.value!.id)
      files.value = files.value.filter(f => f.folderId !== deleteTarget.value!.id)
    } else {
      files.value = files.value.filter(f => f.id !== deleteTarget.value!.id)
    }

    showDeleteConfirm.value = false
    deleteTarget.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Delete failed'
  } finally {
    isDeleting.value = false
  }
}

function navigateToFolder(folderId: string | null) {
  currentFolderId.value = folderId
}

function startMove(file: FileItem) {
  moveTarget.value = file
  selectedFolderId.value = file.folderId
  showMoveModal.value = true
}

async function performMove() {
  if (!moveTarget.value) return

  const session = getSession()
  if (!session) return

  isMoving.value = true

  try {
    const response = await fetch(`/api/resources/files/${moveTarget.value.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify({
        folderId: selectedFolderId.value
      })
    })

    if (!response.ok) throw new Error('Failed to move file')

    const updatedFile = await response.json()

    // Update local state
    const fileIndex = files.value.findIndex(f => f.id === moveTarget.value!.id)
    if (fileIndex !== -1) {
      files.value[fileIndex] = updatedFile
    }

    showMoveModal.value = false
    moveTarget.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to move file'
  } finally {
    isMoving.value = false
  }
}

function startRename(type: 'file' | 'folder', id: string, currentName: string) {
  renameTarget.value = { type, id, currentName }
  newName.value = currentName
  showRenameModal.value = true
}

async function performRename() {
  if (!renameTarget.value || !newName.value.trim()) return

  const session = getSession()
  if (!session) return

  isRenaming.value = true

  try {
    const endpoint = renameTarget.value.type === 'folder'
      ? `/api/resources/folders/${renameTarget.value.id}`
      : `/api/resources/files/${renameTarget.value.id}`

    const body = renameTarget.value.type === 'folder'
      ? { name: newName.value.trim() }
      : { displayName: newName.value.trim() }

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) throw new Error(`Failed to rename ${renameTarget.value.type}`)

    const updated = await response.json()

    // Update local state
    if (renameTarget.value.type === 'folder') {
      const folderIndex = folders.value.findIndex(f => f.id === renameTarget.value!.id)
      if (folderIndex !== -1) {
        folders.value[folderIndex] = updated
      }
    } else {
      const fileIndex = files.value.findIndex(f => f.id === renameTarget.value!.id)
      if (fileIndex !== -1) {
        files.value[fileIndex] = updated
      }
    }

    showRenameModal.value = false
    renameTarget.value = null
    newName.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to rename'
  } finally {
    isRenaming.value = false
  }
}

function promptDelete(type: 'file' | 'folder', id: string, name: string) {
  deleteTarget.value = { type, id, name }
  showDeleteConfirm.value = true
}

function getFileIcon(contentType: string): string {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.includes('pdf')) return 'pdf'
  if (contentType.includes('word') || contentType.includes('document')) return 'doc'
  if (contentType.includes('sheet') || contentType.includes('excel')) return 'sheet'
  if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'slides'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  return 'file'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

onMounted(async () => {
  const session = getSession()

  if (!session) {
    isLoading.value = false
    return
  }

  isAuthenticated.value = true

  try {
    const permissions = await checkPermissions()
    isAdmin.value = permissions.isAdmin
    await fetchResources()
  } catch (err) {
    error.value = 'Failed to load permissions'
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <RccHeader :show-portal-nav="true" />

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#095879] mx-auto mb-4"></div>
        <p class="text-gray-600">Loading...</p>
      </div>
    </div>

    <!-- Not Authenticated -->
    <div v-else-if="!isAuthenticated" class="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 class="text-2xl font-bold text-gray-900 mb-4">Sign In Required</h1>
      <p class="text-gray-600 mb-6">Please sign in to access Life Group study materials.</p>
      <button
        @click="router.push('/')"
        class="px-6 py-3 bg-[#095879] text-white rounded-lg hover:bg-[#074863] transition-colors"
      >
        Go to Sign In
      </button>
    </div>

    <!-- Main Content -->
    <main v-else class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Volunteer Resources</h1>
          <p class="text-gray-600 mt-1">Download study materials and resources for your team.</p>
        </div>

        <!-- Admin Actions -->
        <div v-if="isAdmin" class="flex flex-wrap items-center gap-3">
          <!-- Team Selector -->
          <div class="flex items-center gap-2">
            <label for="team-select" class="text-sm font-medium text-gray-700">Team:</label>
            <select
              id="team-select"
              v-model="selectedTeamId"
              @change="handleTeamChange"
              class="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-[#095879] focus:border-transparent"
            >
              <option v-for="team in availableTeams" :key="team.key" :value="team.key">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div class="flex gap-2">
            <button
              @click="showFolderModal = true"
              class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              New Folder
            </button>
            <button
              @click="showUploadModal = true"
              class="px-4 py-2 bg-[#095879] text-white rounded-lg hover:bg-[#074863] transition-colors flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload File
            </button>
          </div>
        </div>
      </div>

      <!-- Breadcrumbs -->
      <nav class="flex items-center gap-2 text-sm mb-6 overflow-x-auto">
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id ?? 'root'">
          <button
            v-if="index < breadcrumbs.length - 1"
            @click="navigateToFolder(crumb.id)"
            class="text-[#095879] hover:underline whitespace-nowrap"
          >
            {{ crumb.name }}
          </button>
          <span v-else class="text-gray-900 font-medium whitespace-nowrap">{{ crumb.name }}</span>
          <span v-if="index < breadcrumbs.length - 1" class="text-gray-400">/</span>
        </template>
      </nav>

      <!-- Error Message -->
      <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p class="text-red-800">{{ error }}</p>
        <button @click="error = null" class="text-red-600 text-sm underline mt-1">Dismiss</button>
      </div>

      <!-- Empty State -->
      <div v-if="currentFolders.length === 0 && currentFiles.length === 0" class="text-center py-16">
        <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-1">No study materials yet</h3>
        <p class="text-gray-500">
          {{ isAdmin ? 'Upload files or create folders to get started.' : 'Check back later for study materials.' }}
        </p>
      </div>

      <!-- Folders Grid -->
      <div v-if="currentFolders.length > 0" class="mb-8">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Folders</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="folder in currentFolders"
            :key="folder.id"
            class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer group"
            @click="navigateToFolder(folder.id)"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <svg class="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 class="font-medium text-gray-900 group-hover:text-[#095879]">{{ folder.name }}</h3>
                  <p class="text-xs text-gray-500">{{ formatDate(folder.createdAt) }}</p>
                </div>
              </div>
              <div v-if="isAdmin" class="flex items-center gap-1">
                <button
                  @click.stop="startRename('folder', folder.id, folder.name)"
                  class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 transition-all"
                  title="Rename"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  @click.stop="promptDelete('folder', folder.id, folder.name)"
                  class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
                  title="Delete"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Files Grid -->
      <div v-if="currentFiles.length > 0">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Files</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="file in currentFiles"
            :key="file.id"
            class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow group"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="font-medium text-gray-900 truncate" :title="file.displayName || file.name">{{ file.displayName || file.name }}</h3>
                  <p class="text-xs text-gray-500">{{ formatDate(file.createdAt) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-1 ml-2">
                <button
                  @click="downloadFile(file)"
                  class="p-2 text-[#095879] hover:bg-blue-50 rounded-lg transition-colors"
                  title="Download"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  v-if="isAdmin"
                  @click="startRename('file', file.id, file.displayName || file.name)"
                  class="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-blue-600 transition-all"
                  title="Rename"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  v-if="isAdmin"
                  @click="startMove(file)"
                  class="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-amber-600 transition-all"
                  title="Move to folder"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h8m-4-4v8" />
                  </svg>
                </button>
                <button
                  v-if="isAdmin"
                  @click="promptDelete('file', file.id, file.displayName || file.name)"
                  class="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-600 transition-all"
                  title="Delete"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Upload Modal -->
    <Teleport to="body">
      <div v-if="showUploadModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showUploadModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 class="text-xl font-bold text-gray-900 mb-4">Upload File</h2>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Select File</label>
            <input
              type="file"
              @change="handleFileSelect"
              class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#095879] file:text-white hover:file:bg-[#074863]"
            />
          </div>

          <div v-if="uploadFile" class="mb-4 p-3 bg-gray-50 rounded-lg">
            <p class="text-sm font-medium text-gray-900">{{ uploadFile.name }}</p>
            <p class="text-xs text-gray-500">{{ (uploadFile.size / 1024 / 1024).toFixed(2) }} MB</p>
          </div>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
            <input
              v-model="uploadDisplayName"
              type="text"
              :placeholder="uploadFile?.name || 'Enter display name'"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#095879] focus:border-transparent"
            />
            <p class="text-xs text-gray-500 mt-1">Optional. If left blank, the filename will be used.</p>
          </div>

          <div v-if="uploadError" class="mb-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
            {{ uploadError }}
          </div>

          <div class="flex gap-3 justify-end">
            <button
              @click="showUploadModal = false"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="performUpload"
              :disabled="!uploadFile || isUploading"
              class="px-4 py-2 bg-[#095879] text-white rounded-lg hover:bg-[#074863] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isUploading ? 'Uploading...' : 'Upload' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- New Folder Modal -->
    <Teleport to="body">
      <div v-if="showFolderModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showFolderModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 class="text-xl font-bold text-gray-900 mb-4">New Folder</h2>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Folder Name</label>
            <input
              v-model="newFolderName"
              type="text"
              placeholder="Enter folder name"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#095879] focus:border-transparent"
              @keyup.enter="createFolder"
            />
          </div>

          <div class="flex gap-3 justify-end">
            <button
              @click="showFolderModal = false"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="createFolder"
              :disabled="!newFolderName.trim() || isCreatingFolder"
              class="px-4 py-2 bg-[#095879] text-white rounded-lg hover:bg-[#074863] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isCreatingFolder ? 'Creating...' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showDeleteConfirm = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 class="text-xl font-bold text-gray-900 mb-2">Delete {{ deleteTarget?.type === 'folder' ? 'Folder' : 'File' }}</h2>
          <p class="text-gray-600 mb-4">
            Are you sure you want to delete "{{ deleteTarget?.name }}"?
            <span v-if="deleteTarget?.type === 'folder'" class="block mt-1 text-red-600 text-sm">
              This will also delete all files inside this folder.
            </span>
          </p>

          <div class="flex gap-3 justify-end">
            <button
              @click="showDeleteConfirm = false"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="confirmDelete"
              :disabled="isDeleting"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {{ isDeleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Move File Modal -->
    <Teleport to="body">
      <div v-if="showMoveModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showMoveModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 class="text-xl font-bold text-gray-900 mb-2">Move File</h2>
          <p class="text-gray-600 mb-4">
            Select a destination folder for "{{ moveTarget?.displayName || moveTarget?.name }}"
          </p>

          <div class="mb-4 max-h-64 overflow-y-auto">
            <!-- Root folder option -->
            <label
              class="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              :class="selectedFolderId === null ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'"
            >
              <input
                type="radio"
                :checked="selectedFolderId === null"
                @change="selectedFolderId = null"
                class="w-4 h-4 text-[#095879]"
              />
              <div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <span class="font-medium text-gray-900">Root (no folder)</span>
            </label>

            <!-- Folder options -->
            <label
              v-for="folder in folders"
              :key="folder.id"
              class="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              :class="selectedFolderId === folder.id ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'"
            >
              <input
                type="radio"
                :checked="selectedFolderId === folder.id"
                @change="selectedFolderId = folder.id"
                class="w-4 h-4 text-[#095879]"
              />
              <div class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
              </div>
              <span class="font-medium text-gray-900">{{ folder.name }}</span>
            </label>
          </div>

          <div class="flex gap-3 justify-end">
            <button
              @click="showMoveModal = false"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="performMove"
              :disabled="isMoving"
              class="px-4 py-2 bg-[#095879] text-white rounded-lg hover:bg-[#074863] transition-colors disabled:opacity-50"
            >
              {{ isMoving ? 'Moving...' : 'Move' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Rename Modal -->
    <Teleport to="body">
      <div v-if="showRenameModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showRenameModal = false"></div>
        <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 class="text-xl font-bold text-gray-900 mb-4">
            Rename {{ renameTarget?.type === 'folder' ? 'Folder' : 'File' }}
          </h2>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              v-model="newName"
              type="text"
              :placeholder="renameTarget?.currentName"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#095879] focus:border-transparent"
              @keyup.enter="performRename"
            />
          </div>

          <div class="flex gap-3 justify-end">
            <button
              @click="showRenameModal = false"
              class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              @click="performRename"
              :disabled="!newName.trim() || isRenaming"
              class="px-4 py-2 bg-[#095879] text-white rounded-lg hover:bg-[#074863] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ isRenaming ? 'Renaming...' : 'Rename' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
