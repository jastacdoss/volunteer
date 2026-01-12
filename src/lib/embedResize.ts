/**
 * Iframe auto-resize utility for embedding in Divi/WordPress
 * Sends height updates to parent window via postMessage
 */

let resizeObserver: ResizeObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function sendHeight() {
  // Debounce to avoid rapid-fire messages during CSS transitions
  if (debounceTimer) clearTimeout(debounceTimer)

  debounceTimer = setTimeout(() => {
    const height = document.documentElement.scrollHeight
    window.parent.postMessage({ type: 'resize', height }, '*')
  }, 50)
}

/**
 * Initialize embed resize monitoring
 * Call this when the app is in embed mode
 */
export function initEmbedResize() {
  // Send initial height after DOM is ready
  if (document.readyState === 'complete') {
    sendHeight()
  } else {
    window.addEventListener('load', sendHeight)
  }

  // Watch for any size changes (dynamic content, accordions, etc.)
  resizeObserver = new ResizeObserver(sendHeight)
  resizeObserver.observe(document.body)

  // Also send on any DOM mutations that might affect height
  const mutationObserver = new MutationObserver(sendHeight)
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  })
}

/**
 * Manually trigger a height update
 * Useful after async data loads or view changes
 */
export function updateEmbedHeight() {
  sendHeight()
}

/**
 * Clean up observers (call on unmount if needed)
 */
export function destroyEmbedResize() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}
