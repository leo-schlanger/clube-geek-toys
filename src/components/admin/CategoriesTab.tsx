import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, GripVertical, Package, Plus, Search, Trash2 } from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Loading } from '../ui/loading'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { useConfirm } from '../../hooks/useConfirm'
import {
  createCategory,
  deleteCategory,
  listCategoriesForAdmin,
  updateCategory,
} from '../../lib/products'
import { CATEGORY_ICONS, categoryIcon, guessCategoryIcon } from '../../lib/category-icons'
import type { AdminCategory } from '../../types'

/**
 * Shop categories.
 *
 * Before this the only way to edit a category was to open a product: the
 * manager lived inside `ProductModal`, and the icon was a `<select>` of
 * labels — you could pick "Comidas" without ever seeing the artwork that
 * hits the storefront. Here the icon is chosen by drawing, and rename,
 * reorder, hide, and delete are first-class operations.
 *
 * Delete is **deactivate** (backend soft delete): the category leaves the
 * shop but products stay linked, and reactivating brings them all back.
 */

type Draft = {
  name: string
  description: string
  icon: string
  sortOrder: string
  /** '' means top-level. */
  parentId: string
}

function toDraft(category: AdminCategory): Draft {
  return {
    name: category.name,
    description: category.description ?? '',
    icon: category.icon ?? '',
    sortOrder: String(category.sortOrder ?? 0),
    parentId: category.parentId ?? '',
  }
}

/** Icon grid. Shows the drawing, not the name — that is what hits the storefront. */
function IconPicker({
  value,
  onChange,
  id,
}: {
  value: string
  onChange: (key: string) => void
  id?: string
}) {
  return (
    <div id={id} role="radiogroup" aria-label="Ícone da categoria" className="flex flex-wrap gap-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === ''}
        onClick={() => onChange('')}
        title="Sem ícone"
        className={cn(
          'flex h-9 items-center rounded-md border px-2 text-xs transition-colors',
          value === ''
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-input hover:bg-accent hover:text-accent-foreground'
        )}
      >
        nenhum
      </button>
      {CATEGORY_ICONS.map((opt) => {
        const Icon = opt.Icon
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.key)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

export function CategoriesTab() {
  const confirm = useConfirm()
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await listCategoriesForAdmin())
    } catch (error) {
      logger.error('Error loading categories:', error)
      toast.error('Erro ao carregar as categorias')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
     
    void fetchCategories()
  }, [fetchCategories])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(term))
  }, [categories, search])

  const missingIcons = useMemo(
    () => categories.filter((c) => !c.icon).length,
    [categories]
  )

  // Only top-level rows can be a parent — the API refuses a third level.
  const topLevel = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const parentName = useCallback(
    (parentId?: string | null) =>
      parentId ? (categories.find((c) => c.id === parentId)?.name ?? null) : null,
    [categories]
  )

  function replaceCategory(saved: AdminCategory) {
    setCategories((prev) =>
      prev.map((c) => (c.id === saved.id ? { ...saved, productCount: c.productCount } : c))
    )
  }

  function startEdit(category: AdminCategory) {
    setEditingId(category.id)
    setDraft(toDraft(category))
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }

  async function handleSave(category: AdminCategory) {
    if (!draft) return
    if (!draft.name.trim()) {
      toast.error('A categoria precisa de um nome.')
      return
    }

    setSavingId(category.id)
    try {
      const saved = await updateCategory(category.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        icon: draft.icon || null,
        sortOrder: Number(draft.sortOrder) || 0,
        parentId: draft.parentId || null,
      })
      if (!saved) throw new Error('Resposta vazia do servidor.')
      replaceCategory(saved as AdminCategory)
      cancelEdit()
      toast.success('Categoria salva')
    } catch (error) {
      logger.error('Error saving category:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a categoria')
    }
    setSavingId(null)
  }

  /** Icon shortcut without entering edit — the most common fix. */
  async function handleQuickIcon(category: AdminCategory, icon: string) {
    setSavingId(category.id)
    try {
      const saved = await updateCategory(category.id, { icon: icon || null })
      if (saved) replaceCategory(saved as AdminCategory)
    } catch (error) {
      logger.error('Error setting category icon:', error)
      toast.error('Erro ao trocar o ícone')
    }
    setSavingId(null)
  }

  async function handleToggleActive(category: AdminCategory) {
    setSavingId(category.id)
    try {
      const saved = await updateCategory(category.id, { active: !category.active })
      if (saved) replaceCategory(saved as AdminCategory)
      toast.success(category.active ? 'Categoria escondida da loja' : 'Categoria de volta à loja')
    } catch (error) {
      logger.error('Error toggling category:', error)
      toast.error('Erro ao mudar a visibilidade')
    }
    setSavingId(null)
  }

  async function handleDelete(category: AdminCategory) {
    const ok = await confirm({
      title: `Excluir "${category.name}"`,
      description:
        category.productCount > 0
          ? `${category.productCount} produto(s) usam esta categoria. Ela sai da loja, mas os produtos continuam ligados a ela e voltam se você reativar.`
          : 'A categoria sai da loja. Dá para reativar depois.',
      confirmText: 'Excluir',
      variant: 'destructive',
    })
    if (!ok) return

    try {
      const done = await deleteCategory(category.id)
      if (!done) throw new Error('Falha ao excluir.')
      setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, active: false } : c)))
      toast.success('Categoria excluída')
    } catch (error) {
      logger.error('Error deleting category:', error)
      toast.error('Erro ao excluir a categoria')
    }
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return

    setCreating(true)
    try {
      const created = await createCategory({
        name,
        // With no explicit pick, guess from the name — better than being born icon-less.
        icon: newIcon || guessCategoryIcon(name),
        parentId: newParentId || null,
      })
      if (!created) throw new Error('Resposta vazia do servidor.')
      setNewName('')
      setNewIcon('')
      setNewParentId('')
      await fetchCategories()
      toast.success('Categoria criada')
    } catch (error) {
      logger.error('Error creating category:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao criar a categoria')
    }
    setCreating(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Categorias</h2>
          <p className="text-sm text-muted-foreground">
            Nome, ícone e ordem em que aparecem na loja e no site.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar categoria"
            className="pl-9"
            aria-label="Buscar categoria"
          />
        </div>
      </div>

      {missingIcons > 0 && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="py-3 text-sm">
            {missingIcons} categoria(s) sem ícone. Sem ele a vitrine cai num desenho genérico —
            escolha um na grade ao lado de cada uma.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 py-5">
          <Label htmlFor="new-category">Nova categoria</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="new-category"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreate()
                }
              }}
              placeholder="Ex.: Photocards"
              className="max-w-xs"
            />
            <select
              aria-label="Categoria pai"
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Categoria principal</option>
              {topLevel.map((c) => (
                <option key={c.id} value={c.id}>
                  Subcategoria de {c.name}
                </option>
              ))}
            </select>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="gap-1.5"
            >
              {creating ? <Loading size="sm" /> : <Plus className="h-4 w-4" />}
              Criar
            </Button>
          </div>
          <IconPicker value={newIcon} onChange={setNewIcon} />
          {!newIcon && newName.trim() && (
            <p className="text-xs text-muted-foreground">
              Sem escolha, entra o ícone sugerido pelo nome.
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loading />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {search ? 'Nenhuma categoria com esse nome.' : 'Nenhuma categoria cadastrada.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((category) => {
            const isEditing = editingId === category.id
            const iconKey = isEditing ? (draft?.icon ?? '') : (category.icon ?? '')
            const Icon = categoryIcon(iconKey)
            const busy = savingId === category.id

            return (
              <Card key={category.id} className={cn(!category.active && 'opacity-60')}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
                      {Icon ? (
                        <Icon className="h-4 w-4 text-primary" aria-hidden />
                      ) : (
                        <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden />
                      )}
                    </span>

                    {isEditing ? (
                      <Input
                        value={draft?.name ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                        }
                        className="max-w-xs"
                        aria-label="Nome da categoria"
                      />
                    ) : (
                      <span className="font-medium">
                        {parentName(category.parentId) && (
                          <span className="text-muted-foreground">
                            {parentName(category.parentId)} ›{' '}
                          </span>
                        )}
                        {category.name}
                      </span>
                    )}

                    <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                      <Package className="h-3 w-3" />
                      {category.productCount}
                    </Badge>
                    {!category.active && (
                      <Badge variant="secondary" className="text-[11px]">
                        oculta
                      </Badge>
                    )}

                    <div className="ml-auto flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={() => handleSave(category)} disabled={busy}>
                            {busy ? <Loading size="sm" /> : 'Salvar'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(category)}>
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(category)}
                            title={category.active ? 'Esconder da loja' : 'Mostrar na loja'}
                            disabled={busy}
                          >
                            {category.active ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDelete(category)}
                            title="Excluir categoria"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3 border-t border-border pt-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cat-icon-${category.id}`}>Ícone</Label>
                        <IconPicker
                          id={`cat-icon-${category.id}`}
                          value={draft?.icon ?? ''}
                          onChange={(icon) =>
                            setDraft((prev) => (prev ? { ...prev, icon } : prev))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`cat-parent-${category.id}`}>Categoria pai</Label>
                        <select
                          id={`cat-parent-${category.id}`}
                          value={draft?.parentId ?? ''}
                          onChange={(e) =>
                            setDraft((prev) => (prev ? { ...prev, parentId: e.target.value } : prev))
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
                        >
                          <option value="">Categoria principal</option>
                          {topLevel
                            .filter((c) => c.id !== category.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                Subcategoria de {c.name}
                              </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          A loja mostra um nível só: uma subcategoria não pode ter subcategorias.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                        <div className="space-y-1.5">
                          <Label htmlFor={`cat-desc-${category.id}`}>Descrição</Label>
                          <Input
                            id={`cat-desc-${category.id}`}
                            value={draft?.description ?? ''}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, description: e.target.value } : prev
                              )
                            }
                            placeholder="Opcional"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`cat-order-${category.id}`}>Ordem</Label>
                          <Input
                            id={`cat-order-${category.id}`}
                            inputMode="numeric"
                            value={draft?.sortOrder ?? '0'}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, sortOrder: e.target.value } : prev
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <IconPicker
                      value={category.icon ?? ''}
                      onChange={(icon) => void handleQuickIcon(category, icon)}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CategoriesTab
