import { describe, it, expect } from 'vitest'
import { isDisposableEmail } from './disposable-emails.js'

describe('disposable emails', () => {
  it('flags known disposable domains', () => {
    expect(isDisposableEmail('user@mailinator.com')).toBe(true)
    expect(isDisposableEmail('x@tempmail.com') || isDisposableEmail('x@guerrillamail.com')).toBe(
      true
    )
  })

  it('allows normal providers', () => {
    expect(isDisposableEmail('user@gmail.com')).toBe(false)
    expect(isDisposableEmail('geeketoys@gmail.com')).toBe(false)
  })
})
