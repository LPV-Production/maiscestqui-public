import { displayName, type Entity, type Relation } from '../../shared/model'

export interface Family {
  id: string
  name: string
  members: string[]
}

export interface FamilyGraph {
  families: Family[]
  familyOf: Map<string, Family>
  parents: (id: string) => string[]
  children: (id: string) => string[]
  siblings: (id: string) => string[]
  spouses: (id: string) => string[]
  primaryParent: (id: string) => string | undefined
  lineage: (id: string) => string[]
}

// Construit les familles à partir des liens de parenté (kin) entre personnages.
// Les frères et sœurs partagent leurs parents : si on connaît la mère de l'un, c'est celle de tous.
export function buildFamilies(entities: Entity[], relations: Relation[]): FamilyGraph {
  const byId = new Map(entities.map((e) => [e.id, e]))
  const isChar = (id: string) => byId.get(id)?.kind === 'character'
  const parentsOf = new Map<string, Set<string>>()
  const spousesOf = new Map<string, Set<string>>()
  const sib = new Map<string, string>()
  const add = (m: Map<string, Set<string>>, k: string, v: string) => (m.get(k) || m.set(k, new Set()).get(k)!).add(v)
  const find = (x: string): string => {
    while (sib.get(x) && sib.get(x) !== x) x = sib.get(x)!
    return x
  }
  const union = (a: string, b: string) => {
    sib.set(a, find(a)), sib.set(b, find(b))
    sib.set(find(a), find(b))
  }
  const members = new Set<string>()

  for (const r of relations) {
    if (!r.kin || !isChar(r.from_id) || !isChar(r.to_id)) continue
    members.add(r.from_id), members.add(r.to_id)
    if (r.kin === 'parent') add(parentsOf, r.to_id, r.from_id)
    else if (r.kin === 'spouse') add(spousesOf, r.from_id, r.to_id), add(spousesOf, r.to_id, r.from_id)
    else union(r.from_id, r.to_id)
  }
  // Les enfants d'un même parent sont frères et sœurs
  const childrenOf = new Map<string, Set<string>>()
  for (const [child, ps] of parentsOf) for (const p of ps) add(childrenOf, p, child)
  for (const kids of childrenOf.values()) {
    const arr = [...kids]
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i])
  }
  // Partage des parents dans chaque fratrie
  const groups = new Map<string, string[]>()
  for (const id of members) if (sib.has(id)) (groups.get(find(id)) || groups.set(find(id), []).get(find(id))!).push(id)
  for (const g of groups.values()) {
    const shared = new Set(g.flatMap((id) => [...(parentsOf.get(id) || [])]))
    for (const id of g) for (const p of shared) add(parentsOf, id, p)
  }
  childrenOf.clear()
  for (const [child, ps] of parentsOf) for (const p of ps) add(childrenOf, p, child)

  const parents = (id: string) => [...(parentsOf.get(id) || [])]
  const children = (id: string) => [...(childrenOf.get(id) || [])]
  const spouses = (id: string) => [...(spousesOf.get(id) || [])]
  const siblings = (id: string) => (sib.has(id) ? (groups.get(find(id)) || []).filter((x) => x !== id) : [])

  // Parent « principal » pour dessiner l'arbre : celui qui a lui-même une ascendance (la lignée de sang)
  const depthMemo = new Map<string, number>()
  const depth = (id: string, seen = new Set<string>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const d = Math.max(0, ...parents(id).map((p) => depth(p, seen) + 1))
    depthMemo.set(id, d)
    return d
  }
  const primaryParent = (id: string) => parents(id).sort((a, b) => depth(b) - depth(a))[0]
  const lineage = (id: string) => {
    const chain = [id]
    const seen = new Set([id])
    for (let p = primaryParent(id); p && !seen.has(p); p = primaryParent(p)) chain.unshift(p), seen.add(p)
    return chain
  }

  // Familles = groupes connectés, nommées d'après le nom le plus fréquent
  const families: Family[] = []
  const familyOf = new Map<string, Family>()
  const seen = new Set<string>()
  for (const start of members) {
    if (seen.has(start)) continue
    const comp: string[] = []
    const stack = [start]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      comp.push(id)
      stack.push(...parents(id), ...children(id), ...spouses(id), ...siblings(id))
    }
    const counts = new Map<string, number>()
    for (const id of comp) {
      const n = byId.get(id)!.name.trim()
      counts.set(n, (counts.get(n) || 0) + 1)
    }
    const name = [...counts].sort((a, b) => b[1] - a[1])[0][0]
    const fam = { id: start, name, members: comp.sort((a, b) => displayName(byId.get(a)!).localeCompare(displayName(byId.get(b)!))) }
    families.push(fam)
    for (const id of comp) familyOf.set(id, fam)
  }
  families.sort((a, b) => b.members.length - a.members.length)

  return { families, familyOf, parents, children, siblings, spouses, primaryParent, lineage }
}

export interface LaidNode {
  id: string
  x: number
  y: number
  partner?: string
}

// Dispose une famille en arbre classique (de haut en bas). Les conjoints sans ascendance
// apparaissent sur la case de leur partenaire plutôt qu'en case séparée.
export function layoutFamily(g: FamilyGraph, fam: Family, W: number, H: number, GAP: number, V: number, PAD: number) {
  const inFam = new Set(fam.members)
  const treeKids = (id: string) => g.children(id).filter((c) => inFam.has(c) && g.primaryParent(c) === id)
  const roots = fam.members.filter((id) => !g.primaryParent(id) || !inFam.has(g.primaryParent(id)!))
  // Un « racine » sans enfant dans l'arbre mais en couple (ou co-parent) est rattaché à son partenaire
  const attached = new Map<string, string>()
  for (const r of roots) {
    if (treeKids(r).length) continue
    const partner = g.spouses(r).find((s) => inFam.has(s)) || g.children(r).map((c) => g.primaryParent(c)).find((p) => p && p !== r)
    if (partner && !attached.has(partner)) attached.set(partner, r)
  }
  const attachedSet = new Set(attached.values())
  const realRoots = roots.filter((r) => !attachedSet.has(r))

  const nodes: LaidNode[] = []
  const lines: { x: number; y: number; w: number; h: number }[] = []
  let leaf = 0
  let maxDepth = 0
  const place = (id: string, d: number, seen: Set<string>): number => {
    seen.add(id)
    maxDepth = Math.max(maxDepth, d)
    const kids = treeKids(id).filter((k) => !seen.has(k))
    let x: number
    if (!kids.length) x = PAD + leaf++ * (W + GAP)
    else {
      const xs = kids.map((k) => place(k, d + 1, seen))
      x = (xs[0] + xs[xs.length - 1]) / 2
      const y = PAD + d * (H + V)
      const mid = y + H + V / 2
      lines.push({ x: x + W / 2 - 1, y: y + H, w: 2, h: V / 2 })
      if (xs.length > 1) lines.push({ x: xs[0] + W / 2, y: mid - 1, w: xs[xs.length - 1] - xs[0], h: 2 })
      for (const cx of xs) lines.push({ x: cx + W / 2 - 1, y: mid, w: 2, h: V / 2 })
    }
    nodes.push({ id, x, y: PAD + d * (H + V), partner: attached.get(id) })
    return x
  }
  const seen = new Set<string>()
  for (const r of realRoots) if (!seen.has(r)) place(r, 0, seen)
  // Ce qui reste (cycles, données incohérentes) est ajouté à la fin
  for (const id of fam.members) if (!seen.has(id) && !attachedSet.has(id)) place(id, 0, seen)

  return { nodes, lines, width: PAD * 2 + Math.max(1, leaf) * (W + GAP) - GAP, height: PAD * 2 + (maxDepth + 1) * H + maxDepth * V }
}
