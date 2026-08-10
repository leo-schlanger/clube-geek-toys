import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { SeoHead } from './SeoHead'

describe('SeoHead', () => {
  const originalTitle = document.title

  beforeEach(() => {
    document.title = ''
  })

  afterEach(() => {
    document.title = originalTitle
  })

  it('sets document title', () => {
    render(<SeoHead title="Atacado | GeekPop" description="B2B" path="/atacado" />)
    expect(document.title).toMatch(/Atacado/)
  })
})
