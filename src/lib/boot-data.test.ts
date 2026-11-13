import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { bootDataReady, peekBootData, resetBootData, seedQueriesFromBoot, withBootData } from './boot-data'
import { SHOP_PROMO_QUERY_KEY } from '../hooks/useShopPromo'
import { ACTIVE_EVENT_QUERY_KEY } from '../hooks/useActiveEvent'

afterEach(() => {
  delete window.__geekpopBoot
  resetBootData()
  vi.useRealTimers()
})

const PROMO = { enabled: true, percent: 5, bannerEnabled: true, bannerText: 'No site é 5% mais barato' }

describe('boot data', () => {
  it('does nothing and waits for nothing without boot.js answers', async () => {
    await bootDataReady(10_000)
    expect(peekBootData('/promo')).toBeUndefined()
  })

  it('keeps what boot.js fetched, and drops failed answers', async () => {
    window.__geekpopBoot = { '/promo': Promise.resolve(PROMO), '/events/active': Promise.resolve(null) }
    await bootDataReady()
    expect(peekBootData('/promo')).toEqual(PROMO)
    expect(peekBootData('/events/active')).toBeUndefined()
  })

  it('never holds a page longer than the cap', async () => {
    vi.useFakeTimers()
    window.__geekpopBoot = { '/promo': new Promise(() => {}) }
    let done = false
    withBootData(Promise.resolve('page'), 250).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(249)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('stops trusting an answer after a minute', async () => {
    vi.useFakeTimers()
    window.__geekpopBoot = { '/promo': Promise.resolve(PROMO) }
    await bootDataReady()
    vi.advanceTimersByTime(60_001)
    expect(peekBootData('/promo')).toBeUndefined()
  })

  it('seeds the promo and event queries the strips read', async () => {
    window.__geekpopBoot = { '/promo': Promise.resolve(PROMO), '/events/active': Promise.resolve({ event: null }) }
    await bootDataReady()
    const client = new QueryClient()
    seedQueriesFromBoot(client)
    expect(client.getQueryData(SHOP_PROMO_QUERY_KEY)).toEqual(PROMO)
    expect(client.getQueryState(ACTIVE_EVENT_QUERY_KEY)?.status).toBe('success')
    expect(client.getQueryData(ACTIVE_EVENT_QUERY_KEY)).toBeNull()
  })
})
