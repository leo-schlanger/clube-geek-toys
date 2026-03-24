/**
 * Signature Utilities
 * Hash SHA-256 e utilitários para assinatura digital
 */

/**
 * Generate SHA-256 hash of a string
 */
export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate document hash for contract validation
 * Includes all critical data points for integrity verification
 */
export async function generateContractHash(params: {
  memberId: string
  memberName: string
  memberCPF: string
  memberEmail: string
  plan: string
  signedAt: string
  ipAddress: string
}): Promise<string> {
  const dataString = [
    params.memberId,
    params.memberName,
    params.memberCPF,
    params.memberEmail,
    params.plan,
    params.signedAt,
    params.ipAddress,
  ].join('|')

  return generateSHA256(dataString)
}

/**
 * Get client IP address
 * Tries multiple sources: headers, WebRTC, or fallback to API
 */
export async function getClientIP(): Promise<string> {
  try {
    // Try ipify API (free, no CORS issues)
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000),
    })
    const data = await response.json()
    return data.ip || 'Não identificado'
  } catch {
    // Fallback
    return 'Não identificado'
  }
}

/**
 * Get current user agent (truncated for display)
 */
export function getUserAgent(maxLength = 100): string {
  const ua = navigator.userAgent || 'Não identificado'
  return ua.length > maxLength ? ua.substring(0, maxLength) + '...' : ua
}

/**
 * Format date in Brazilian Portuguese (extenso)
 */
export function formatDateExtensive(date: Date): string {
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ]

  const day = date.getDate()
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')

  return `${day} de ${month} de ${year}, às ${hours}:${minutes}`
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Validate signature image (must be a valid base64 PNG)
 */
export function validateSignatureImage(base64: string): boolean {
  if (!base64) return false

  // Check if it starts with PNG data URL prefix
  if (!base64.startsWith('data:image/png;base64,')) {
    return false
  }

  // Check minimum size (empty canvas would be very small)
  const dataOnly = base64.replace('data:image/png;base64,', '')
  if (dataOnly.length < 1000) {
    // Too small, likely empty or just background
    return false
  }

  return true
}

/**
 * Check if signature canvas is essentially empty
 * (all white or transparent)
 */
export function isSignatureEmpty(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  // Check if there's any non-white/non-transparent pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]

    // If pixel is not white (255,255,255) and not fully transparent (a=0)
    // and has some opacity, then there's content
    if (a > 0 && (r < 250 || g < 250 || b < 250)) {
      return false
    }
  }

  return true
}
