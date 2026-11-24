import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFound from './NotFound'

describe('NotFound', () => {
  it('shows the page, a way back and marks it noindex', async () => {
    render(
      <MemoryRouter initialEntries={['/nao-existe']}>
        <NotFound homeHref="/" homeLabel="Ir para a loja" />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para a loja' })).toHaveAttribute('href', '/')
    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    )
  })
})
