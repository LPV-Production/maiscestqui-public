import type { Env } from './env'
import {
  CATEGORIES,
  displayName,
  norm,
  type Book,
  type Entity,
  type Kin,
  type Kind,
  type PendingRef,
  type Relation,
  type SuggestedEntity,
  type SuggestedRelation,
  type SuggestedUpdate,
  type Suggestions,
  type Unit
} from '../../shared/model'

// Llama 3.3 70B : bon en extraction depuis un texte, rapide, ~430 neurones par chapitre (quota gratuit : 10 000/jour)
const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// Les modèles n'emploient pas toujours nos mots : on accepte les synonymes courants
const KIND_WORDS: Record<string, Kind> = {
  character: 'character', person: 'character', personnage: 'character', people: 'character',
  place: 'place', location: 'place', lieu: 'place', city: 'place',
  org: 'org', organization: 'org', organisation: 'org', group: 'org', company: 'org',
  event: 'event', date: 'event', evenement: 'event', 'événement': 'event'
}
const FACT_KEYS = ['first', 'alias', 'age', 'job', 'city', 'status', 'birth_date', 'birth_place', 'usage', 'type', 'sector', 'country', 'date']

interface RawEntity {
  kind?: string
  name?: string
  description?: string
  confidence?: string
  [k: string]: unknown
}
interface RawOutput {
  entities?: RawEntity[]
  updates?: { name?: string; facts?: Record<string, unknown> }[]
  relations?: { a?: string; b?: string; category?: string; a_role?: string; b_role?: string; kin?: string | null }[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['character', 'place', 'org', 'event'] },
          name: { type: 'string' },
          first: { type: 'string' },
          alias: { type: 'string' },
          description: { type: 'string' },
          job: { type: 'string' },
          age: { type: 'string' },
          city: { type: 'string' },
          usage: { type: 'string' },
          type: { type: 'string' },
          date: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['kind', 'name']
      }
    },
    updates: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, facts: { type: 'object' } }, required: ['name', 'facts'] }
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          category: { type: 'string' },
          a_role: { type: 'string' },
          b_role: { type: 'string' },
          kin: { type: 'string', enum: ['parent', 'spouse', 'sibling', 'none'] }
        },
        required: ['a', 'b', 'category']
      }
    }
  },
  required: ['entities', 'updates', 'relations']
}

const RULES = `Règles :
- Personnages : "name" = nom de famille (ou surnom s'il n'a pas de nom), "first" = prénom. Prénom inconnu : laisse "first" vide (n'écris pas « inconnu »). Lieux, organisations : "name" = nom complet. Dates / événements : "name" = l'événement, "date" = la date.
- Sois exhaustif : chaque personnage, lieu et organisation NOMMÉ dans l'extrait doit avoir sa fiche, même secondaire, avec ses liens.
- Ne crée pas de fiche pour un personnage anonyme sans importance (« l'hôte », « un passant »).
- Si un élément figure déjà dans les fiches existantes, ne le recrée pas : mets seulement les informations NOUVELLES dans "updates" avec son nom exact.
- Pour chaque nouvel élément, remplis "description" (quelques mots : rôle dans l'histoire, métier, lien avec le héros) et les champs connus (job, age, city, usage…).
- Relations : "a_role" = ce que A est pour B, "b_role" = ce que B est pour A (ex. a_role "père", b_role "fils"). "category" parmi : ${CATEGORIES.join(', ')}. "kin" : "parent" si A est le père ou la mère de B, "spouse" si époux, "sibling" si frère ou sœur, sinon "none". Pense aussi aux liens entre deux nouveaux personnages.
- Réponses courtes, en français.
- Réponds uniquement avec un objet JSON {"entities": [...], "updates": [...], "relations": [...]}.`

const knownList = (entities: Entity[], pending: PendingRef[]) =>
  [
    ...entities.slice(0, 250).map((e) => `- ${displayName(e)} (${e.kind}${e.data.alias ? ` alias ${e.data.alias}` : ''})`),
    ...pending.map((p) => `- ${[p.first, p.name].filter(Boolean).join(' ')} (${p.kind})`)
  ].join('\n') || '(aucune)'

// Mode « texte » : l'IA lit un extrait réel (chapitre d'EPUB ou photo de page). Fiable pour tous les livres.
// Deuxième passe : uniquement les liens entre les noms déjà connus, d'après le texte
function promptRelations(book: Book, where: string, text: string, names: string[]) {
  return `Tu aides un lecteur à tenir le carnet du roman « ${book.title} ». Voici un extrait (${where}) et la liste des personnages, lieux et organisations connus.

Liste TOUS les liens que cet extrait établit entre eux : famille (parent, enfant, époux, frère, sœur, grand-parent), amour, amitié, travail (employeur, chef, collègue, membre d'une organisation), rivalité, lieu de vie ou de travail. Utilise exactement les noms de la liste. Uniquement ce que dit l'extrait.

"a_role" = ce que A est pour B, "b_role" = ce que B est pour A. "category" parmi : ${CATEGORIES.join(', ')}. "kin" : "parent" si A est le père ou la mère de B, "spouse" si époux, "sibling" si frère ou sœur, sinon "none".
Réponds uniquement avec {"entities": [], "updates": [], "relations": [...]}.

Noms connus :
${names.map((n) => `- ${n}`).join('\n')}

Extrait :
"""
${text}
"""`
}

function promptFromText(book: Book, where: string, text: string, known: string) {
  return {
    system: `Tu aides un lecteur à tenir le carnet d'un roman : personnages, lieux, organisations, dates et liens entre eux. On te donne un extrait du livre. Tu extrais UNIQUEMENT ce qui est dans cet extrait, sans rien ajouter de ce que tu saurais par ailleurs sur la suite du livre.

${RULES}`,
    user: `Livre : « ${book.title} »${book.author ? ` de ${book.author}` : ''}. Extrait : ${where}.

Fiches existantes :
${known}

Texte :
"""
${text}
"""`
  }
}

// Mode « mémoire » : l'IA s'appuie sur ce qu'elle sait du livre. Seulement pour les livres très connus.
function promptFromMemory(book: Book, where: string, upTo: string, known: string) {
  return {
    system: `Tu aides un lecteur à tenir le carnet d'un roman : personnages, lieux, organisations, dates et liens entre eux.

RÈGLE ABSOLUE ANTI-SPOILER : ne donne QUE ce que le lecteur sait arrivé ${upTo}. Ne révèle jamais un événement, une identité cachée, un coupable, une mort ou un rebondissement révélé plus tard. Dans le doute, n'en parle pas.
Si tu ne connais pas assez ce livre pour ce passage, renvoie des listes vides plutôt que d'inventer. "confidence" = "low" si tu n'es pas sûr.

${RULES}`,
    user: `Livre : « ${book.title} »${book.author ? ` de ${book.author}` : ''}. Le lecteur vient de lire ${where}.

Fiches existantes :
${known}

Quelles sont les nouveautés de ce passage ?`
  }
}

function parseOutput(res: unknown): RawOutput | null {
  // Selon le modèle, la réponse est dans `response` ou au format OpenAI (`choices[0].message.content`)
  const r = res as { response?: unknown; choices?: { message?: { content?: unknown } }[] }
  let out: unknown = r && typeof r === 'object' && r.response !== undefined ? r.response : (r?.choices?.[0]?.message?.content ?? res)
  if (typeof out === 'string') {
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      out = JSON.parse(m[0])
    } catch {
      return null
    }
  }
  if (!out || typeof out !== 'object') return null
  const o = out as RawOutput
  return Array.isArray(o.entities) || Array.isArray(o.updates) || Array.isArray(o.relations) ? o : null
}

// Modèles Gemini gratuits, chacun avec son propre quota quotidien : on passe au suivant quand l'un est épuisé.
// Flash-Lite 3.5 lit un chapitre en quelques secondes ; 3.1 est plus lent ; 3.8 Flash très lent (plus de 2 min).
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']
const GEMINI_NAMES: Record<string, string> = {
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite',
  'gemini-3.8-flash': 'Gemini 3.8 Flash'
}
// Taille d'un morceau de chapitre : Gemini lit un chapitre entier, l'IA de Cloudflare a besoin de morceaux
export const partSize = (env: Env) => (env.GEMINI_API_KEY ? 400_000 : 24_000)

class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function runGemini(env: Env, model: string, system: string, user: string): Promise<RawOutput> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        // Format imposé : le modèle ne peut pas oublier le type de fiche
        responseJsonSchema: SCHEMA,
        // Réflexion courte : l'extraction n'en a pas besoin et ça divise le temps de réponse
        thinkingConfig: { thinkingLevel: 'low' }
      }
    })
  })
  if (!res.ok) throw new GeminiError(res.status, (await res.text()).slice(0, 300))
  const data = await res.json<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>()
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
  const raw = parseOutput(text)
  if (!raw) throw new GeminiError(502, 'réponse illisible : ' + text.slice(0, 200))
  return raw
}

// Essaie les modèles Gemini dans l'ordre ; null si aucun n'a pu répondre (quota, panne, pas de clé)
async function runGeminiChain(env: Env, system: string, user: string): Promise<{ raw: RawOutput; engine: string } | null> {
  if (!env.GEMINI_API_KEY) return null
  for (const model of GEMINI_MODELS) {
    try {
      return { raw: await runGemini(env, model, system, user), engine: GEMINI_NAMES[model] }
    } catch (e) {
      const status = e instanceof GeminiError ? e.status : 0
      console.error(`Gemini ${model} indisponible (${status}) :`, String(e).slice(0, 200))
      // Clé refusée : inutile d'essayer les autres modèles
      if (status === 401 || status === 403) return null
    }
  }
  return null
}

async function runModel(env: Env, system: string, user: string): Promise<RawOutput> {
  const model = env.AI_MODEL || DEFAULT_MODEL
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  const base = { messages, max_tokens: 4000, temperature: 0.2 }
  let res: unknown
  try {
    res = await env.AI.run(model as keyof AiModels, { ...base, response_format: { type: 'json_schema', json_schema: SCHEMA } } as never)
  } catch (e) {
    // Certains modèles refusent le mode JSON : on réessaie sans
    if (String(e).includes('response_format')) res = await env.AI.run(model as keyof AiModels, base as never)
    else throw e
  }
  const raw = parseOutput(res)
  if (!raw) {
    console.error('Réponse IA illisible :', JSON.stringify(res).slice(0, 500))
    throw new Error("L'IA n'a pas répondu correctement. Réessaie dans un instant.")
  }
  return raw
}

// Les modèles écrivent parfois « null » ou « N/A » au lieu de laisser un champ vide
const EMPTY = /^(null|none|undefined|n\/?a|nan|-+|\?+|null ans|inconnu ans)$/i
const str = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return EMPTY.test(s) ? '' : s
}
const PARENT_WORDS = /^(le |la |son |sa )?(père|mère|parent|papa|maman|beau-père|belle-mère)\b/i
const CHILD_WORDS = /^(le |la |son |sa )?(fils|fille|enfant)\b/i

// Transforme la réponse brute en suggestions : fusion avec l'existant, résolution des noms, sens des liens
function toSuggestions(raw: RawOutput, entities: Entity[], relations: Relation[], pending: PendingRef[], keyPrefix: string) {
  const index = new Map<string, { ref: string; label: string; entity?: Entity }>()
  for (const e of entities) {
    const v = { ref: e.id, label: displayName(e), entity: e }
    index.set(norm(displayName(e)), v)
    if (e.data.alias) index.set(norm(e.data.alias), v)
    if (e.kind !== 'character' || !e.data.first) index.set(norm(e.name), v)
  }
  for (const p of pending) {
    const label = [p.first, p.name].filter(Boolean).join(' ')
    const v = { ref: p.key, label }
    index.set(norm(label), v)
    if (!p.first) index.set(norm(p.name), v)
    if (p.alias) index.set(norm(p.alias), v)
  }
  const find = (name: string) => index.get(norm(name))

  const fresh = new Map<string, SuggestedEntity>()
  const updates = new Map<string, SuggestedUpdate>()
  const addFacts = (e: Entity, facts: Record<string, string>) => {
    const add: Record<string, string> = {}
    for (const [k, v] of Object.entries(facts)) if (v && FACT_KEYS.includes(k) && !e.data[k]) add[k] = v
    if (!Object.keys(add).length) return
    const u = updates.get(e.id) || { id: e.id, name: displayName(e), facts: {} }
    Object.assign(u.facts, add)
    updates.set(e.id, u)
  }

  let n = 0
  for (const re of raw.entities || []) {
    const kind = KIND_WORDS[str(re.kind).toLowerCase()] || 'character'
    let name = str(re.name)
    if (!name) continue
    const data: Record<string, string> = {}
    // Un champ qui ne contient que le type de fiche (« person », « location »…) n'apporte rien
    for (const k of FACT_KEYS) if (str(re[k]) && !KIND_WORDS[str(re[k]).toLowerCase()]) data[k] = str(re[k])
    // Le modèle met parfois « M. » ou « Mme » en prénom
    if (data.first && /^(m\.|mme|mlle|monsieur|madame)( d[e']?)?$/i.test(data.first)) delete data.first
    if (data.first && /^(inconnu|inconnue|unknown|aucun|non précisé)/i.test(data.first)) delete data.first
    if (data.first && norm(data.first) === norm(name)) delete data.first
    // « Louis » + « XIII » : le chiffre romain fait partie du nom
    if (data.first && /^[IVXLC]+$/.test(data.first)) (name = `${name} ${data.first}`), delete data.first
    if (kind === 'character' && data.first && name.startsWith(data.first + ' ')) name = name.slice(data.first.length + 1)
    if (!data.job && !data.usage && !data.type && str(re.description)) data[kind === 'place' ? 'usage' : kind === 'org' ? 'type' : 'job'] = str(re.description)
    const full = kind === 'character' ? [data.first, name].filter(Boolean).join(' ') : name
    const hit = find(full) || find(name)
    if (hit) {
      if (hit.entity) addFacts(hit.entity, data)
      continue
    }
    if (fresh.has(norm(full))) continue
    const conf = str(re.confidence)
    const s: SuggestedEntity = { key: `${keyPrefix}${n++}`, kind, name, data, first_at: null, confidence: conf === 'high' || conf === 'low' ? conf : 'medium' }
    fresh.set(norm(full), s)
    index.set(norm(full), { ref: s.key, label: full })
    if (!data.first) index.set(norm(name), { ref: s.key, label: full })
  }

  for (const ru of raw.updates || []) {
    const hit = find(str(ru.name))
    if (!hit?.entity || !ru.facts || typeof ru.facts !== 'object') continue
    const facts: Record<string, string> = {}
    for (const [k, v] of Object.entries(ru.facts)) if (str(v)) facts[k] = str(v)
    addFacts(hit.entity, facts)
  }

  const pairs = new Set(relations.map((r) => [r.from_id, r.to_id].sort().join('|')))
  const rels: SuggestedRelation[] = []
  let k = 0
  for (const rr of raw.relations || []) {
    let a = find(str(rr.a))
    let b = find(str(rr.b))
    if (!a || !b || a.ref === b.ref) continue
    const pair = [a.ref, b.ref].sort().join('|')
    if (pairs.has(pair)) continue
    pairs.add(pair)
    let aRole = str(rr.a_role)
    let bRole = str(rr.b_role)
    let kin = str(rr.kin)
    // « parent » = A est le parent de B : on corrige le sens d'après les rôles si le modèle s'est trompé
    if (kin === 'parent' && (CHILD_WORDS.test(aRole) || PARENT_WORDS.test(bRole))) [a, b, aRole, bRole] = [b, a, bRole, aRole]
    if (kin !== 'parent' && kin !== 'spouse' && kin !== 'sibling') kin = ''
    const cat = str(rr.category)
    rels.push({
      key: `${keyPrefix}r${k++}`,
      from_ref: a.ref,
      to_ref: b.ref,
      from_name: a.label,
      to_name: b.label,
      category: CATEGORIES.includes(cat) ? cat : kin ? 'Famille' : 'Autre',
      from_role: aRole,
      to_role: bRole,
      kin: (kin || null) as Kin | null
    })
  }
  return { entities: [...fresh.values()], updates: [...updates.values()], relations: rels }
}

// Découpe un long chapitre en morceaux d'environ 24 000 caractères (≈ 6 000 mots), aux fins de paragraphe
export function splitText(text: string, size = 24000): string[] {
  if (text.length <= size * 1.2) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > size * 1.2) {
    let cut = rest.lastIndexOf('\n', size)
    if (cut < size * 0.6) cut = rest.lastIndexOf('. ', size) + 1
    if (cut <= 0) cut = size
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  parts.push(rest)
  return parts
}

interface Ctx {
  env: Env
  book: Book
  entities: Entity[]
  relations: Relation[]
  pending: PendingRef[]
}

// Extraction depuis un extrait réel (EPUB ou photo)
export async function suggestFromText(c: Ctx, unit: Unit, at: number, where: string, text: string, source: 'epub' | 'photo', keyPrefix: string): Promise<Suggestions> {
  const known = knownList(c.entities, c.pending)
  const { system, user } = promptFromText(c.book, where, text, known)
  let raw: RawOutput
  let engine: string
  const g = await runGeminiChain(c.env, system, user)
  if (g) {
    ;({ raw, engine } = g)
    // Deuxième lecture consacrée aux liens : les petits modèles en oublient beaucoup quand on leur demande tout à la fois
    const people = [
      ...c.entities.filter((e) => e.kind !== 'event').map((e) => displayName(e)),
      ...c.pending.map((p) => [p.first, p.name].filter(Boolean).join(' ')),
      ...(raw.entities || []).filter((e) => str(e.kind).toLowerCase() !== 'event').map((e) => [str(e.first), str(e.name)].filter(Boolean).join(' '))
    ]
    const names = [...new Set(people.filter(Boolean))].slice(0, 300)
    if (names.length > 1) {
      const rel = await runGeminiChain(c.env, promptRelations(c.book, where, text, names), 'Liste les liens.')
      if (rel?.raw.relations?.length) raw.relations = [...(raw.relations || []), ...rel.raw.relations]
    }
  } else {
    // Secours : l'IA de Cloudflare lit le texte par morceaux, et on réunit les réponses
    const pieces = splitText(text)
    raw = { entities: [], updates: [], relations: [] }
    for (const [i, piece] of pieces.entries()) {
      const p = promptFromText(c.book, pieces.length > 1 ? `${where} (morceau ${i + 1} sur ${pieces.length})` : where, piece, known)
      const r = await runModel(c.env, p.system, p.user)
      raw.entities!.push(...(r.entities || []))
      raw.updates!.push(...(r.updates || []))
      raw.relations!.push(...(r.relations || []))
    }
    engine = 'Llama 3.3 (Cloudflare, secours)'
  }
  const s = toSuggestions(raw, c.entities, c.relations, c.pending, keyPrefix)
  s.entities.forEach((e) => (e.first_at = at))
  return { unit, from: at, to: at, source, engine, ...s }
}

// Suggestions de mémoire, pour un intervalle de pages ou de chapitres
export async function suggestFromMemory(c: Ctx, unit: Unit, from: number, to: number): Promise<Suggestions> {
  const b = c.book
  const total = unit === 'chapter' ? b.total_chapters : b.total_pages
  const of = total ? ` sur ${total} (environ ${Math.round((to / total) * 100)} % du livre)` : ''
  const ch = unit === 'chapter'
  const where = ch
    ? from === to ? `le chapitre ${to}${of}` : `du chapitre ${from} au chapitre ${to}${of}`
    : from === to ? `la page ${to}${of}` : `de la page ${from} à la page ${to}${of}`
  const upTo = ch ? `à la fin du chapitre ${to}` : `à la page ${to}`
  const { system, user } = promptFromMemory(b, where, upTo, knownList(c.entities, c.pending))
  const g = await runGeminiChain(c.env, system, user)
  const raw = g ? g.raw : await runModel(c.env, system, user)
  const engine = g ? g.engine : 'Llama 3.3 (Cloudflare, secours)'
  return { unit, from, to, source: 'memory', engine, ...toSuggestions(raw, c.entities, c.relations, c.pending, 'new:') }
}
