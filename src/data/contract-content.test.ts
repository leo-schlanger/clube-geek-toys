import { describe, it, expect } from 'vitest'
import {
  CONTRACT_SECTIONS,
  CONTRACT_TITLE,
  CONTRACT_SUBTITLE,
  CONTRACT_DECLARATION,
  type ContractSection,
} from './contract-content'

describe('contract-content', () => {
  // --- Exports exist and have content ---

  it('should export CONTRACT_TITLE as a non-empty string', () => {
    expect(typeof CONTRACT_TITLE).toBe('string')
    expect(CONTRACT_TITLE.length).toBeGreaterThan(0)
  })

  it('should export CONTRACT_SUBTITLE as a non-empty string', () => {
    expect(typeof CONTRACT_SUBTITLE).toBe('string')
    expect(CONTRACT_SUBTITLE.length).toBeGreaterThan(0)
  })

  it('should export CONTRACT_DECLARATION as a non-empty string', () => {
    expect(typeof CONTRACT_DECLARATION).toBe('string')
    expect(CONTRACT_DECLARATION.length).toBeGreaterThan(0)
  })

  it('should export CONTRACT_SECTIONS as an array with at least 1 section', () => {
    expect(Array.isArray(CONTRACT_SECTIONS)).toBe(true)
    expect(CONTRACT_SECTIONS.length).toBeGreaterThan(0)
  })

  // --- Section structure ---

  it('should have 9 sections', () => {
    expect(CONTRACT_SECTIONS).toHaveLength(9)
  })

  it('every section should have a title and non-empty content array', () => {
    for (const section of CONTRACT_SECTIONS) {
      expect(typeof section.title).toBe('string')
      expect(section.title.length).toBeGreaterThan(0)
      expect(Array.isArray(section.content)).toBe(true)
      expect(section.content.length).toBeGreaterThan(0)
    }
  })

  it('every section content paragraph should be a non-empty string', () => {
    for (const section of CONTRACT_SECTIONS) {
      for (const paragraph of section.content) {
        expect(typeof paragraph).toBe('string')
        expect(paragraph.length).toBeGreaterThan(0)
      }
    }
  })

  it('section titles should be numbered 1 through 9', () => {
    CONTRACT_SECTIONS.forEach((section, index) => {
      expect(section.title).toMatch(new RegExp(`^${index + 1}\\.`))
    })
  })

  // --- Specific content checks ---

  it('should describe the single annual plan and its benefits', () => {
    const planSection = CONTRACT_SECTIONS.find(s => s.title.includes('PLANO E BENEFÍCIOS'))
    expect(planSection).toBeDefined()
    const allContent = planSection!.content.join(' ')
    // Plano único e anual, com 15% de desconto em qualquer produto
    expect(allContent).toContain('único plano')
    expect(allContent).toContain('15%')
    expect(allContent).toContain('qualquer produto')
    // Não há mais menção aos planos Silver/Gold/Black
    expect(allContent).not.toContain('SILVER')
    expect(allContent).not.toContain('GOLD')
    expect(allContent).not.toContain('BLACK')
  })

  it('should NOT contain a points program ("PROGRAMA DE PONTOS") section', () => {
    const pointsSection = CONTRACT_SECTIONS.find(s => s.title.includes('PONTOS'))
    expect(pointsSection).toBeUndefined()
  })

  it('should reference LGPD in the privacy section', () => {
    const privacySection = CONTRACT_SECTIONS.find(s => s.title.includes('PRIVACIDADE'))
    expect(privacySection).toBeDefined()
    const allContent = privacySection!.content.join(' ')
    expect(allContent).toContain('LGPD')
  })

  it('CONTRACT_DECLARATION should mention acceptance of terms', () => {
    expect(CONTRACT_DECLARATION).toContain('li integralmente')
    expect(CONTRACT_DECLARATION).toContain('concordância')
  })

  // --- Type check ---

  it('ContractSection type should be compatible with the exported data', () => {
    const section: ContractSection = { title: 'Test', content: ['paragraph'] }
    expect(section.title).toBe('Test')
    expect(section.content).toEqual(['paragraph'])
  })
})
