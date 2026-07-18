/**
 * PrivacyPolicy Page Tests
 *
 * Covers: rendering title, all section headings, key content,
 * back link, and LGPD-required elements.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyPolicy from './PrivacyPolicy'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPolicy />
    </MemoryRouter>
  )
}

describe('PrivacyPolicy', () => {
  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Política de Privacidade')).toBeInTheDocument()
  })

  it('renders the company name', () => {
    renderPage()
    expect(screen.getByText(/N\. STANLEY SCHLANGER/)).toBeInTheDocument()
  })

  it('renders CNPJ', () => {
    renderPage()
    expect(screen.getByText(/52\.846\.344\/0001-10/)).toBeInTheDocument()
  })

  it('renders all section headings', () => {
    renderPage()
    const sections = [
      'Controlador dos Dados',
      '1. Dados Coletados',
      '2. Base Legal e Finalidade',
      '3. Tempo de Retenção',
      '4. Direitos do Titular (Art. 18, LGPD)',
      '5. Compartilhamento de Dados',
      '6. Transferência Internacional',
      '7. Medidas de Segurança',
      '8. Cookies',
      '9. Contato e Reclamações',
      '10. Alterações',
    ]

    for (const heading of sections) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it('renders the DPO contact email', () => {
    renderPage()
    const emailLinks = screen.getAllByText('contato@geeketoys.com.br')
    expect(emailLinks.length).toBeGreaterThan(0)
    expect(emailLinks[0].closest('a')).toHaveAttribute('href', 'mailto:contato@geeketoys.com.br')
  })

  it('renders back link pointing to /', () => {
    renderPage()
    const backLink = screen.getByText('Voltar')
    expect(backLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders last-updated date', () => {
    renderPage()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
    expect(screen.getByText(/26 de março de 2026/)).toBeInTheDocument()
  })

  it('mentions LGPD compliance', () => {
    renderPage()
    expect(screen.getByText(/Lei Geral de Proteção de Dados/)).toBeInTheDocument()
  })

  it('mentions Stripe as payment processor', () => {
    renderPage()
    const matches = screen.getAllByText(/Stripe/)
    expect(matches.length).toBeGreaterThan(0)
  })
})
