// Adaptive rate limiter for Planning Center API
// Rate limit: 100 requests per 20 seconds

const rateLimiter = {
  limit: 100,
  remaining: 100,
  resetAt: Date.now() + 20000,
  callCount: 0,
  error429Count: 0
}

/**
 * Make an API request with adaptive rate limiting
 * Automatically monitors X-PCO-API-Request-Rate-* headers
 * Pauses when remaining < 10 to avoid hitting limit
 * Handles 429 responses with Retry-After
 */
export async function makeRequest(url, options = {}) {
  // Proactively wait if we're close to the limit
  if (rateLimiter.remaining <= 10 && Date.now() < rateLimiter.resetAt) {
    const waitTime = rateLimiter.resetAt - Date.now() + 100 // Add 100ms buffer
    console.log(`[Rate Limit] ${rateLimiter.remaining} remaining, waiting ${waitTime}ms until reset`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
    // Reset counters after wait
    rateLimiter.remaining = rateLimiter.limit
    rateLimiter.resetAt = Date.now() + 20000
  }

  // Make the request
  const response = await fetch(url, options)
  rateLimiter.callCount++

  // Update rate limiter from response headers
  const rateLimit = response.headers.get('X-PCO-API-Request-Rate-Limit')
  const rateCount = response.headers.get('X-PCO-API-Request-Rate-Count')

  if (rateLimit) rateLimiter.limit = parseInt(rateLimit)
  if (rateCount) {
    rateLimiter.remaining = rateLimiter.limit - parseInt(rateCount)
  }

  // Handle 429 Too Many Requests
  if (response.status === 429) {
    rateLimiter.error429Count++
    const retryAfter = response.headers.get('Retry-After')
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 20000

    console.warn(`[429] Rate limited! Waiting ${waitTime}ms (Retry-After: ${retryAfter || 'not provided'})`)
    console.warn(`[429] Stats - Calls made: ${rateLimiter.callCount}, 429 errors: ${rateLimiter.error429Count}`)

    await new Promise(resolve => setTimeout(resolve, waitTime))

    // Reset and retry
    rateLimiter.remaining = rateLimiter.limit
    rateLimiter.resetAt = Date.now() + 20000
    return makeRequest(url, options)
  }

  return response
}

/**
 * Get current rate limiter stats
 */
export function getRateLimiterStats() {
  return {
    limit: rateLimiter.limit,
    remaining: rateLimiter.remaining,
    callCount: rateLimiter.callCount,
    error429Count: rateLimiter.error429Count,
    resetAt: rateLimiter.resetAt
  }
}

/**
 * Reset rate limiter stats (call at start of sync)
 */
export function resetRateLimiterStats() {
  rateLimiter.callCount = 0
  rateLimiter.error429Count = 0
  rateLimiter.remaining = rateLimiter.limit
  rateLimiter.resetAt = Date.now() + 20000
}
