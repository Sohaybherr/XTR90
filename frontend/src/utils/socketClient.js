let socketClientPromise = null

export function loadSocketClient() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null)
  }

  if (typeof window.io === 'function') {
    return Promise.resolve(window.io)
  }

  if (socketClientPromise) {
    return socketClientPromise
  }

  socketClientPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = '/socket.io/socket.io.js'
    script.async = true
    script.onload = () => resolve(typeof window.io === 'function' ? window.io : null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })

  return socketClientPromise
}
