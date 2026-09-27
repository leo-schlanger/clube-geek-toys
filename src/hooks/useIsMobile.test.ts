import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsMobile } from './useIsMobile'
import { mockPhoneScreen } from '../test/mobile'

describe('useIsMobile', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is false on a wide screen', () => {
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })

  it('is true below the sm breakpoint', () => {
    mockPhoneScreen()
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
  })
})
