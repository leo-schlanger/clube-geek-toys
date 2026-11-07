import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const getCardToken = vi.fn()
vi.mock('../../lib/members', () => ({ getCardToken: (...a: unknown[]) => getCardToken(...a) }))
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props: { value: string }) => <svg data-testid="qr-svg" data-value={props.value} />,
}))

import { CardQrDialog } from './CardQrDialog'

const ID = 'abcd1234-5678-9012-3456-789012345678'
const props = { memberId: ID, fullName: 'Ana Teste', displayNumber: '0000 0000 0001', expiryDate: '2027-05-26T12:00:00Z' }

function token(n: number, ttlMs = 5 * 60_000) {
  return { memberId: ID, token: `t${n}.sig`, expiresAt: new Date(Date.now() + ttlMs).toISOString() }
}

describe('CardQrDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    getCardToken.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('encodes a fresh token in the QR and renews it a minute before it expires', async () => {
    getCardToken.mockResolvedValueOnce(token(1)).mockResolvedValueOnce(token(2))
    render(<CardQrDialog open onOpenChange={() => {}} {...props} />)
    await act(async () => {})
    expect(screen.getByTestId('qr-svg')).toHaveAttribute(
      'data-value',
      `https://club.geeketoys.com.br/verificar/${ID}?t=t1.sig`
    )
    expect(screen.getByText('Ana Teste')).toBeInTheDocument()
    expect(screen.getByText(/Aumente o brilho/)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(4 * 60_000)
    })
    expect(getCardToken).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('qr-svg').getAttribute('data-value')).toContain('?t=t2.sig')
  })

  it('renews when the tab comes back after the token went stale', async () => {
    getCardToken.mockResolvedValueOnce(token(1, 30_000)).mockResolvedValue(token(2))
    render(<CardQrDialog open onOpenChange={() => {}} {...props} />)
    await act(async () => {})
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(getCardToken).toHaveBeenCalledTimes(2)
  })

  it('offline: still shows a QR (without token) and says the door may flag it', async () => {
    getCardToken.mockResolvedValue(null)
    render(<CardQrDialog open onOpenChange={() => {}} {...props} />)
    await act(async () => {})
    expect(screen.getByTestId('qr-svg')).toHaveAttribute('data-value', `https://club.geeketoys.com.br/verificar/${ID}`)
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão')
  })

  it('does nothing while closed', () => {
    render(<CardQrDialog open={false} onOpenChange={() => {}} {...props} />)
    expect(getCardToken).not.toHaveBeenCalled()
    expect(screen.queryByTestId('qr-svg')).not.toBeInTheDocument()
  })

  it('holds a screen wake lock while open and releases it on close', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    getCardToken.mockResolvedValue(token(1))
    const { rerender } = render(<CardQrDialog open onOpenChange={() => {}} {...props} />)
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')
    rerender(<CardQrDialog open={false} onOpenChange={() => {}} {...props} />)
    await act(async () => {})
    expect(release).toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'wakeLock')
  })
})
