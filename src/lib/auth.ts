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
    return null
  }
}
