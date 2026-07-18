import { PackageOpen } from 'lucide-react'
import type { Product } from '../../types'
import { ProductCard } from './ProductCard'
import { Skeleton } from '../ui/skeleton'

interface ProductGridProps {
  products: Product[]
  loading?: boolean
  isMember?: boolean
  /** Mensagem exibida quando não há produtos. */
  emptyMessage?: string
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  )
}

/**
 * Grade responsiva de produtos. Renderiza skeletons enquanto carrega
 * e um estado vazio amigável quando não há resultados.
 */
export function ProductGrid({
  products,
  loading = false,
  isMember = false,
  emptyMessage = 'Nenhum produto encontrado.',
}: ProductGridProps) {
  if (loading) {
    return <ProductGridSkeleton />
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <PackageOpen className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} isMember={isMember} />
      ))}
    </div>
  )
}

export default ProductGrid
