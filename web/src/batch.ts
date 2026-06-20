import type { ProjectConfig } from './types'
import type { SimClient } from './worker/client'

export interface BatchSpec {
  runs: number
  baseSeed: number
  varyEntranceRate?: [number, number]
  varyHeadway?: [number, number]
}

// 재현 가능한 PRNG
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clone(p: ProjectConfig): ProjectConfig {
  return JSON.parse(JSON.stringify(p)) as ProjectConfig
}

export function buildRunConfigs(base: ProjectConfig, spec: BatchSpec): ProjectConfig[] {
  const out: ProjectConfig[] = []
  for (let i = 0; i < spec.runs; i += 1) {
    const seed = spec.baseSeed + i
    const cfg = clone(base)
    cfg.config.seed = seed
    cfg.config.stochastic = true
    const rnd = mulberry32(seed)
    if (spec.varyEntranceRate) {
      const [lo, hi] = spec.varyEntranceRate
      const r = lo + rnd() * (hi - lo)
      for (const n of cfg.graph.nodes) {
        if (n.type === 'entrance' && n.generation && (n.generation.kind === 'poisson' || n.generation.kind === 'constant' || n.generation.kind === 'batch')) {
          const profile = n.generation.profile
          if (profile && profile.length > 0) {
            // profile-based entrances: scale every profile entry's rate by factor
            const baseRate = n.generation.rate ?? profile[0][1] ?? 1
            const factor = r / (baseRate || 1)
            n.generation.profile = profile.map(([t, pr]) => [t, pr * factor])
          }
          n.generation.rate = r
        }
      }
    }
    if (spec.varyHeadway) {
      const [lo, hi] = spec.varyHeadway
      const h = lo + rnd() * (hi - lo)
      for (const n of cfg.graph.nodes) {
        if (n.type === 'platform' && n.train) n.train.headway_sec = h
      }
    }
    out.push(cfg)
  }
  return out
}

export async function runBatch(
  client: SimClient,
  base: ProjectConfig,
  spec: BatchSpec,
  onProgress: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const configs = buildRunConfigs(base, spec)
  const files: Record<string, string> = {}
  const manifest: { run: number; seed: number; file: string }[] = []
  for (let i = 0; i < configs.length; i += 1) {
    const cfg = configs[i]
    await client.load(JSON.stringify(cfg))
    await client.runAll()
    const csv = await client.exportCsv('wide')
    const file = `run_${i}_seed_${cfg.config.seed}.csv`
    files[file] = csv
    manifest.push({ run: i, seed: cfg.config.seed, file })
    if (i === 0) {
      const gnn = await client.exportGnn()
      files['graph/adjacency.csv'] = gnn.adjacency
      files['graph/distance.csv'] = gnn.distance
      files['graph/travel_time.csv'] = gnn.travel_time
      files['graph/node_features.csv'] = gnn.node_features
    }
    onProgress(i + 1, configs.length)
  }
  files['manifest.json'] = JSON.stringify({ spec, runs: manifest }, null, 2)
  return files
}
