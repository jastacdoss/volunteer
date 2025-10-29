// PCO OAuth helper functions

const CLIENT_ID = import.meta.env.VITE_PCO_OAUTH_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_PCO_OAUTH_SECRET
const REDIRECT_URI = `${window.location.origin}/auth/callback`

export function initiateLogin() {
  const authUrl = new URL('https://api.planningcenteronline.com/oauth/authorize')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'people')

  window.location.href = authUrl.toString()
}

export async function exchangeCodeForToken(code: string): Promise<{ accessToken: string, userData: any }> {
  // Call our server-side API to exchange code (keeps client secret secure)
  const response = await fetch(`/api/auth/callback?code=${code}`)

  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }

  return response.json()
}

export function saveSession(accessToken: string, userData: any) {
  sessionStorage.setItem('pco_token', accessToken)
  sessionStorage.setItem('pco_user', JSON.stringify(userData))
}

export function getSession() {
  const token = sessionStorage.getItem('pco_token')
  const userStr = sessionStorage.getItem('pco_user')

  if (!token || !userStr) return null

  return {
    token,
    user: JSON.parse(userStr)
  }
}

export function clearSession() {
  sessionStorage.removeItem('pco_token')
  sessionStorage.removeItem('pco_user')
  clearCachedPermissions()
}

export function logout() {
  clearSession()
  window.location.href = '/'
}

export async function refreshUserData() {
  const session = getSession()
  if (!session) return null

  try {
    // Fetch fresh user data from our API server
    // The server will include field data using admin PAT
    const response = await fetch(`/api/user/refresh`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user data')
    }

    const { userData } = await response.json()

    // Update session storage with fresh data
    sessionStorage.setItem('pco_user', JSON.stringify(userData))

    return userData
  } catch (error) {
    console.error('Failed to refresh user data:', error)
    // Clear invalid session and redirect to login
    clearSession()
    window.location.href = '/'
    return null
  }
}

// Cached permissions interface
interface CachedPermissions {
  isAdmin: boolean
  isLeader: boolean
  ministries: string[]
  timestamp: number
}

const PERMISSIONS_CACHE_KEY = 'pco_permissions_cache'
const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes

export function getCachedPermissions(): CachedPermissions | null {
  const cached = sessionStorage.getItem(PERMISSIONS_CACHE_KEY)
  if (!cached) return null

  try {
    const data = JSON.parse(cached) as CachedPermissions

    // Check if cache is still valid (within 10 minutes)
    if (Date.now() - data.timestamp < CACHE_DURATION) {
      console.log('[Auth Cache] Using cached permissions')
      return data
    }

    console.log('[Auth Cache] Cache expired, will fetch fresh data')
    return null
  } catch (error) {
    console.error('[Auth Cache] Failed to parse cached permissions:', error)
    return null
  }
}

export function setCachedPermissions(permissions: Omit<CachedPermissions, 'timestamp'>) {
  const data: CachedPermissions = {
    ...permissions,
    timestamp: Date.now()
  }
  sessionStorage.setItem(PERMISSIONS_CACHE_KEY, JSON.stringify(data))
  console.log('[Auth Cache] Cached permissions:', permissions)
}

export function clearCachedPermissions() {
  sessionStorage.removeItem(PERMISSIONS_CACHE_KEY)
}

export async function checkPermissions(): Promise<CachedPermissions> {
  // Check cache first
  const cached = getCachedPermissions()
  if (cached) {
    return cached
  }

  console.log('[Auth Cache] Fetching fresh permissions from API')

  const session = getSession()
  if (!session) {
    throw new Error('No session found')
  }

  try {
    // Fetch both in parallel
    const [leaderResponse, adminResponse] = await Promise.all([
      fetch('/api/leader/check', {
        headers: { 'Authorization': `Bearer ${session.token}` },
      }),
      fetch('/api/admin/check', {
        headers: { 'Authorization': `Bearer ${session.token}` },
      }),
    ])

    if (!leaderResponse.ok) {
      throw new Error('Failed to check leader status')
    }

    const leaderData = await leaderResponse.json()
    const isLeader = leaderData.isLeader
    const ministries = leaderData.ministries || []

    let isAdmin = false
    if (adminResponse.ok) {
      const adminData = await adminResponse.json()
      isAdmin = adminData.isAdmin
    }

    const permissions = { isAdmin, isLeader, ministries }

    // Cache the results
    setCachedPermissions(permissions)

    return { ...permissions, timestamp: Date.now() }
  } catch (error) {
    console.error('Failed to check permissions:', error)
    throw error
  }
}

// View As functionality for admins
interface ViewAsMode {
  personId: string
  personName: string
}

export function setViewAsMode(personId: string, personName: string) {
  sessionStorage.setItem('view_as_person_id', personId)
  sessionStorage.setItem('view_as_person_name', personName)
  console.log('[View As] Enabled for:', personName, personId)
}

export function getViewAsMode(): ViewAsMode | null {
  const personId = sessionStorage.getItem('view_as_person_id')
  const personName = sessionStorage.getItem('view_as_person_name')

  if (!personId || !personName) return null

  return { personId, personName }
}

export function clearViewAsMode() {
  sessionStorage.removeItem('view_as_person_id')
  sessionStorage.removeItem('view_as_person_name')
  console.log('[View As] Mode cleared')
}
