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

  describe('subcategories', () => {
    const tree = [
      { ...cats[0], id: 'p1', name: 'Photocards', slug: 'photocards', parentId: null },
      { ...cats[0], id: 'p2', name: 'Álbuns', slug: 'albuns', parentId: null },
      { ...cats[0], id: 'c1', name: 'BTS', slug: 'bts', parentId: 'p1' },
      { ...cats[0], id: 'c2', name: 'NewJeans', slug: 'newjeans', parentId: 'p1' },
    ]

    it('keeps children out of the top row', () => {
      render(
        <MemoryRouter>
          <CategoryNav categories={tree} />
        </MemoryRouter>
      )
      const top = screen.getByRole('navigation', { name: 'Categorias' })
      expect(top).toHaveTextContent('Photocards')
      expect(top).toHaveTextContent('Álbuns')
      expect(top).not.toHaveTextContent('BTS')
    })

    it('shows no second row until a branch is selected', () => {
      render(
        <MemoryRouter>
          <CategoryNav categories={tree} />
        </MemoryRouter>
      )
      expect(screen.queryByRole('navigation', { name: 'Subcategorias' })).not.toBeInTheDocument()
    })

    it('opens the children of the selected parent', () => {
      render(
        <MemoryRouter>
          <CategoryNav categories={tree} activeSlug="photocards" />
        </MemoryRouter>
      )
      const sub = screen.getByRole('navigation', { name: 'Subcategorias' })
      expect(sub).toHaveTextContent('BTS')
      expect(sub).toHaveTextContent('NewJeans')
    })

    it('keeps the parent open and highlighted while a child is selected', () => {
      render(
        <MemoryRouter>
          <CategoryNav categories={tree} activeSlug="bts" />
        </MemoryRouter>
      )
      // The child row stays visible so the shopper can switch siblings.
      expect(screen.getByRole('navigation', { name: 'Subcategorias' })).toHaveTextContent('NewJeans')
      const parentLink = screen.getByRole('link', { name: /Photocards/ })
      expect(parentLink.className).toContain('bg-primary')
    })

    it('shows no second row for a parent with no children', () => {
      render(
        <MemoryRouter>
          <CategoryNav categories={tree} activeSlug="albuns" />
        </MemoryRouter>
      )
      expect(screen.queryByRole('navigation', { name: 'Subcategorias' })).not.toBeInTheDocument()
    })
  })
})
