import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { getReservationMock } = vi.hoisted(() => ({ getReservationMock: vi.fn() }))
vi.mock('../lib/event-tickets', () => ({ getPublicReservation: getReservationMock }))

import {
  RESERVATION_POLL_INTERVAL_MS,
  RESERVATION_POLL_TIMEOUT_MS,
  useReservationPolling,
} from './useReservationPolling'

const pending = { code: 'R-1', status: 'pending', pixExpired: false }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RESERVATION_POLL_INTERVAL_MS)
  })
}

describe('useReservationPolling', () => {
  it('consulta até a reserva sair de pendente, e para', async () => {
    getReservationMock
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: 'confirmed' })
    const onUpdate = vi.fn()
    renderHook(() => useReservationPolling('R-1', true, onUpdate))

    await tick()
    await tick()
    await tick()

    expect(getReservationMock).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'confirmed' }))
  })

  it('para quando o PIX vence', async () => {
    getReservationMock.mockResolvedValue({ ...pending, pixExpired: true })
    renderHook(() => useReservationPolling('R-1', true, vi.fn()))

    await tick()
    await tick()

    expect(getReservationMock).toHaveBeenCalledTimes(1)
  })

  it('não consulta quando inativo', async () => {
    renderHook(() => useReservationPolling('R-1', false, vi.fn()))
    await tick()
    expect(getReservationMock).not.toHaveBeenCalled()
  })

  it('segue depois de uma falha de rede e desiste no teto de tempo', async () => {
    getReservationMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(pending)
    renderHook(() => useReservationPolling('R-1', true, vi.fn()))

    await tick()
    await tick()
    expect(getReservationMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESERVATION_POLL_TIMEOUT_MS + RESERVATION_POLL_INTERVAL_MS * 2)
    })
    const calls = getReservationMock.mock.calls.length
    await tick()
    expect(getReservationMock.mock.calls.length).toBe(calls)
  })
})
