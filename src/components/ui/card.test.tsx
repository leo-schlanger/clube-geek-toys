import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'

describe('Card', () => {
  it('should render children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('should render as a div', () => {
    render(<Card data-testid="card">Content</Card>)
    expect(screen.getByTestId('card').tagName).toBe('DIV')
  })

  it('should have rounded border and shadow', () => {
    render(<Card data-testid="card">Content</Card>)
    const el = screen.getByTestId('card')
    expect(el).toHaveClass('rounded-lg')
    expect(el).toHaveClass('border')
    expect(el).toHaveClass('shadow-sm')
  })

  it('should apply custom className', () => {
    render(<Card data-testid="card" className="my-card">Content</Card>)
    expect(screen.getByTestId('card')).toHaveClass('my-card')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Card ref={ref}>Ref</Card>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})

describe('CardHeader', () => {
  it('should render children', () => {
    render(<CardHeader>Header</CardHeader>)
    expect(screen.getByText('Header')).toBeInTheDocument()
  })

  it('should have padding class', () => {
    render(<CardHeader data-testid="header">H</CardHeader>)
    expect(screen.getByTestId('header')).toHaveClass('p-6')
  })

  it('should apply custom className', () => {
    render(<CardHeader data-testid="header" className="custom">H</CardHeader>)
    expect(screen.getByTestId('header')).toHaveClass('custom')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<CardHeader ref={ref}>H</CardHeader>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})

describe('CardTitle', () => {
  it('should render as h3', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByText('Title').tagName).toBe('H3')
  })

  it('should have semantic heading role', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
  })

  it('should have text styling classes', () => {
    render(<CardTitle data-testid="title">T</CardTitle>)
    expect(screen.getByTestId('title')).toHaveClass('text-2xl', 'font-semibold')
  })

  it('should apply custom className', () => {
    render(<CardTitle data-testid="title" className="big">T</CardTitle>)
    expect(screen.getByTestId('title')).toHaveClass('big')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLParagraphElement>()
    render(<CardTitle ref={ref}>T</CardTitle>)
    expect(ref.current).toBeInstanceOf(HTMLHeadingElement)
  })
})

describe('CardDescription', () => {
  it('should render as a paragraph', () => {
    render(<CardDescription>Desc</CardDescription>)
    expect(screen.getByText('Desc').tagName).toBe('P')
  })

  it('should have muted text color', () => {
    render(<CardDescription data-testid="desc">D</CardDescription>)
    expect(screen.getByTestId('desc')).toHaveClass('text-muted-foreground')
  })

  it('should apply custom className', () => {
    render(<CardDescription data-testid="desc" className="custom">D</CardDescription>)
    expect(screen.getByTestId('desc')).toHaveClass('custom')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLParagraphElement>()
    render(<CardDescription ref={ref}>D</CardDescription>)
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement)
  })
})

describe('CardContent', () => {
  it('should render children', () => {
    render(<CardContent>Body</CardContent>)
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('should have padding', () => {
    render(<CardContent data-testid="content">C</CardContent>)
    expect(screen.getByTestId('content')).toHaveClass('p-6', 'pt-0')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<CardContent ref={ref}>C</CardContent>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})

describe('CardFooter', () => {
  it('should render children', () => {
    render(<CardFooter>Footer</CardFooter>)
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('should have flex and padding', () => {
    render(<CardFooter data-testid="footer">F</CardFooter>)
    const el = screen.getByTestId('footer')
    expect(el).toHaveClass('flex', 'items-center', 'p-6', 'pt-0')
  })

  it('should forward ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(<CardFooter ref={ref}>F</CardFooter>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})

describe('Card composition', () => {
  it('should render a full card with all sub-components', () => {
    render(
      <Card data-testid="full-card">
        <CardHeader>
          <CardTitle>My Card</CardTitle>
          <CardDescription>A description</CardDescription>
        </CardHeader>
        <CardContent>Main content here</CardContent>
        <CardFooter>Footer actions</CardFooter>
      </Card>
    )

    expect(screen.getByTestId('full-card')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Card' })).toBeInTheDocument()
    expect(screen.getByText('A description')).toBeInTheDocument()
    expect(screen.getByText('Main content here')).toBeInTheDocument()
    expect(screen.getByText('Footer actions')).toBeInTheDocument()
  })
})
