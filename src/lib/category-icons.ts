import {
  Sparkles,
  Music,
  Gamepad2,
  Shirt,
  Cookie,
  Baby,
  PawPrint,
  Palette,
  BookOpen,
  Home,
  Heart,
  Star,
  Gift,
  Camera,
  Cat,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Icons an admin can pick per category. The database stores only the key and
 * the component lives here, so swapping icon libraries never touches the schema.
 */
export const CATEGORY_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'sparkles', label: 'Brilho', Icon: Sparkles },
  { key: 'music', label: 'Música', Icon: Music },
  { key: 'star', label: 'K-pop / Estrela', Icon: Star },
  { key: 'gamepad', label: 'Jogos', Icon: Gamepad2 },
  { key: 'cat', label: 'Anime / Gato', Icon: Cat },
  { key: 'zap', label: 'Pokémon / Raio', Icon: Zap },
  { key: 'shirt', label: 'Moda / Vestuário', Icon: Shirt },
  { key: 'heart', label: 'Beleza / Coração', Icon: Heart },
  { key: 'cookie', label: 'Comidas', Icon: Cookie },
  { key: 'baby', label: 'Bebê', Icon: Baby },
  { key: 'paw', label: 'Pet', Icon: PawPrint },
  { key: 'palette', label: 'Decoração', Icon: Palette },
  { key: 'book', label: 'Papelaria', Icon: BookOpen },
  { key: 'home', label: 'Casa', Icon: Home },
  { key: 'gift', label: 'Presentes', Icon: Gift },
  { key: 'camera', label: 'Photocard', Icon: Camera },
]

const BY_KEY = new Map(CATEGORY_ICONS.map((i) => [i.key, i.Icon]))

export function categoryIcon(key?: string | null): LucideIcon | null {
  return key ? (BY_KEY.get(key) ?? null) : null
}

/**
 * Guesses an icon from the category name, for those created before the field
 * existed. Only an opening guess; the admin can change it.
 */
export function guessCategoryIcon(name: string): string | null {
  const n = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

  const rules: [RegExp, string][] = [
    [/k-?pop/, 'star'],
    [/music|musica/, 'music'],
    [/pokemon/, 'zap'],
    [/anime|mang/, 'cat'],
    [/beleza|maquia/, 'heart'],
    [/moda|vestuario|roupa|camiseta/, 'shirt'],
    [/jogo|game/, 'gamepad'],
    [/comida|food|doce/, 'cookie'],
    [/bebe/, 'baby'],
    [/pet|animal/, 'paw'],
    [/decora/, 'palette'],
    [/papelaria|caderno/, 'book'],
    [/acessorio/, 'sparkles'],
    [/brinquedo/, 'gift'],
    [/photocard|foto/, 'camera'],
  ]
  for (const [pattern, key] of rules) {
    if (pattern.test(n)) return key
  }
  return null
}
