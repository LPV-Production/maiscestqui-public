// Types et vocabulaire partagés entre l'interface (src/) et l'API (functions/).

export type Kind = 'character' | 'place' | 'org' | 'event'
export type Kin = 'parent' | 'spouse' | 'sibling'
export type Unit = 'page' | 'chapter'

export interface Book {
  id: string
  title: string
  author: string
  total_pages: number | null
  current_page: number
  scanned_page: number
  finished: number
  isbn: string
  publisher: string
  year: string
  unit: Unit
  total_chapters: number | null
  current_chapter: number
  scanned_chapter: number
  chapter_count?: number
  created_at: string
  has_cover?: number
  entity_count?: number
  relation_count?: number
}

export interface Entity {
  id: string
  book_id: string
  kind: Kind
  name: string
  data: Record<string, string>
  notes: string
  first_page: number | null
  first_chapter: number | null
  to_clarify: number
  created_at: string
}

export interface Relation {
  id: string
  book_id: string
  from_id: string
  to_id: string
  category: string
  from_role: string
  to_role: string
  label: string
  kin: Kin | null
  first_page: number | null
  first_chapter: number | null
  created_at: string
}

export interface ChapterInfo {
  idx: number
  title: string
  words: number
}

// Élément déjà proposé lors d'un appel précédent (extraction en plusieurs morceaux)
export interface PendingRef {
  key: string
  kind: Kind
  name: string
  first?: string
  alias?: string
}

export interface BookFull {
  book: Book
  entities: Entity[]
  relations: Relation[]
  chapters: ChapterInfo[]
}

// Suggestions renvoyées par l'IA, à valider par le lecteur
export interface SuggestedEntity {
  key: string
  kind: Kind
  name: string
  data: Record<string, string>
  first_at: number | null
  confidence: 'high' | 'medium' | 'low'
}
export interface SuggestedUpdate {
  id: string
  name: string
  facts: Record<string, string>
}
export interface SuggestedRelation {
  key: string
  from_ref: string
  to_ref: string
  from_name: string
  to_name: string
  category: string
  from_role: string
  to_role: string
  kin: Kin | null
}
export interface Suggestions {
  unit: Unit
  from: number
  to: number
  source: 'memory' | 'photo' | 'epub'
  // Extraction depuis l'EPUB : un appel par morceau de chapitre
  parts?: number
  // Modèle qui a produit les suggestions (ex. « Gemini 3.8 Flash »)
  engine?: string
  entities: SuggestedEntity[]
  updates: SuggestedUpdate[]
  relations: SuggestedRelation[]
}
export interface ApplyPayload {
  unit: Unit
  at: number
  entities: SuggestedEntity[]
  updates: SuggestedUpdate[]
  relations: SuggestedRelation[]
}

export const KINDS: Record<Kind, { label: string; one: string; short: string; color: string }> = {
  character: { label: 'Personnages', one: 'Personnage', short: 'Personnages', color: '#2E2E38' },
  place: { label: 'Lieux', one: 'Lieu', short: 'Lieux', color: '#3F6B55' },
  org: { label: 'Organisations', one: 'Organisation', short: 'Orgas', color: '#8A6A2F' },
  event: { label: 'Dates', one: 'Date / événement', short: 'Dates', color: '#8E4A63' }
}
export const KIND_ORDER: Kind[] = ['character', 'place', 'org', 'event']

export const NAME_LABEL: Record<Kind, string> = {
  character: 'Nom de famille',
  place: 'Nom du lieu',
  org: 'Nom',
  event: 'Événement'
}

// Champs propres à chaque type de fiche : [clé, libellé, options éventuelles]
export const FIELDS: Record<Kind, [string, string, string[]?][]> = {
  character: [
    ['first', 'Prénom'],
    ['alias', 'Surnom / alias'],
    ['age', 'Âge'],
    ['job', 'Métier / rôle'],
    ['birth_date', 'Naissance (date)'],
    ['birth_place', 'Naissance (lieu)'],
    ['city', 'Vit à'],
    ['status', 'Statut', ['', 'Vivant', 'Mort', 'Disparu', 'Inconnu']]
  ],
  org: [
    ['type', 'Type (entreprise, police…)'],
    ['sector', 'Secteur'],
    ['hq', 'Siège'],
    ['address', 'Adresse']
  ],
  place: [
    ['usage', 'À quoi sert le lieu'],
    ['city', 'Ville'],
    ['country', 'Pays'],
    ['address', 'Adresse']
  ],
  event: [['date', 'Date (ex. 22/09/1966, années 80)']]
}

export const CATEGORIES = ['Famille', 'Amoureuse', 'Ami', 'Professionnelle', 'Ennemi', 'Lieu', 'Autre']

export const displayName = (e: Pick<Entity, 'kind' | 'name' | 'data'>) =>
  e.kind === 'character' ? [e.data.first, e.name].filter(Boolean).join(' ').trim() : e.name

export const initials = (e: Pick<Entity, 'kind' | 'name' | 'data'>) => {
  if (e.kind === 'event') {
    const y = (e.data.date || '').match(/\d{2}(?=\D*$)/)
    if (y) return y[0]
  }
  const words = displayName(e).split(/[\s'’-]+/).filter((w) => w && /\p{L}/u.test(w[0]))
  return ((words[0]?.[0] || '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
}

// Normalise un nom pour les comparaisons (accents, casse, espaces)
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// « p. 212 » ou « ch. 8 »
export const at = (unit: Unit, n: number | null | undefined) => (n ? (unit === 'chapter' ? `ch. ${n}` : `p. ${n}`) : '')
export const firstAt = (e: Pick<Entity, 'first_page' | 'first_chapter'>) => (e.first_chapter ? at('chapter', e.first_chapter) : at('page', e.first_page))

// Progression d'un livre selon son unité : « ch. 8 / 42 » ou « p. 212 / 706 »
export const progress = (b: Pick<Book, 'unit' | 'current_page' | 'total_pages' | 'current_chapter' | 'total_chapters'>) => {
  const ch = b.unit === 'chapter'
  const cur = ch ? b.current_chapter : b.current_page
  const tot = ch ? b.total_chapters : b.total_pages
  return { pct: tot ? Math.min(100, Math.round((cur / tot) * 100)) : 0, label: `${ch ? 'ch.' : 'p.'} ${cur}${tot ? ` / ${tot}` : ''}` }
}
