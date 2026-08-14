import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CategoryNav } from './CategoryNav'

const cats = [
  {
    id: '1',
    name: 'Música',
    slug: 'musica',
    description: null,
    active: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
]

describe('CategoryNav', () => {
  it('renders skeleton when loading', () => {
    const { container } = render(
      <MemoryRouter>
        <CategoryNav categories={[]} loading />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('[class*="animate"]').length + container.querySelectorAll('.h-9').length).toBeGreaterThan(0)
  })

  it('returns null when empty', () => {
    const { container } = render(
      <MemoryRouter>
        <CategoryNav categories={[]} />
      </MemoryRouter>
    )
    expect(container.querySelector('nav')).toBeNull()
  })

  it('links categories and Todos', () => {
    render(
      <MemoryRouter>
        <CategoryNav categories={cats} activeSlug="musica" />
      </MemoryRouter>
    )
    expect(screen.getByText('Todos')).toBeInTheDocument()
    expect(screen.getByText('Música')).toBeInTheDocument()
  })

  it('supports atacado queryParam basePath', () => {
    render(
      <MemoryRouter>
        <CategoryNav categories={cats} basePath="/atacado" queryParam />
      </MemoryRouter>
    )
    const link = screen.getByText('Música').closest('a')
    expect(link?.getAttribute('href')).toContain('/atacado')
    expect(link?.getAttribute('href')).toContain('category=musica')
  })

  it('keeps the current catalog sort in category links', () => {
    render(
      <MemoryRouter initialEntries={['/?sort=name']}>
        <CategoryNav categories={cats} />
      </MemoryRouter>
    )
    expect(screen.getByText('Música').closest('a')?.getAttribute('href')).toContain('sort=name')
    expect(screen.getByText('Todos').closest('a')?.getAttribute('href')).toContain('sort=name')
  })
})
