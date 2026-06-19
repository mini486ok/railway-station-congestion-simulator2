# 웹 프런트엔드(Pyodide) Implementation Plan — 계획 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 1의 순수 Python 시뮬레이션 코어(`sim/`)를 브라우저에서 Pyodide로 구동하는 GitHub Pages 정적 React 앱을 만든다. 노드-링크 GUI 편집, 실시간 대시보드, 시뮬레이션 제어(배속/일시정지/스텝/리셋), CSV·GNN 내보내기, 브라우저 내 N회 배치 실행→ZIP을 제공한다.

**Architecture:** React+TypeScript+Vite 정적 빌드. 시뮬레이션은 Web Worker 안의 Pyodide(=`sim` 패키지)에서 실행하고, 워커는 얇은 Python 파사드 `sim/webapi.py`를 호출한다. 메인 스레드(React)는 Comlink로 워커와 통신하며, 그래프 편집(React Flow)·차트(Plotly)·상태관리(Zustand)를 담당한다. 워커가 스텝을 구동(배속/일시정지)하고 스냅샷을 메인으로 보낸다. 배치/내보내기는 모두 브라우저 안에서 수행(JSZip).

**Tech Stack:** Python(`sim`, 계획1) + Pyodide(CDN, WASM) / React 18 + TypeScript + Vite / React Flow(그래프 편집) / Plotly.js(차트) / Zustand(상태) / Comlink(워커 RPC) / JSZip + file-saver(내보내기) / Vitest + @testing-library/react(테스트) / GitHub Actions(배포).

## Global Constraints

- 시뮬레이션 핵심 알고리즘은 계획 1의 Python `sim/` 패키지를 그대로 사용한다. JS로 시뮬레이션 로직을 재구현하지 않는다.
- 정적 호스팅(GitHub Pages)만으로 동작해야 한다. 런타임 백엔드 서버 금지. 모든 연산은 브라우저(메인+Worker)에서 수행.
- Pyodide·numpy는 CDN(jsdelivr)에서 로드한다. `sim/*.py`는 빌드시 `web/public/pysim/sim/`로 복사하여 정적 제공하고, Worker가 fetch하여 Pyodide FS에 기록 후 import한다.
- 무거운 연산(시뮬레이션)은 반드시 Web Worker에서 실행하여 메인 스레드(UI)를 막지 않는다.
- 저장/불러오기 JSON 형식은 계획1 `io.save_config`와 동일: `{"graph": <to_json>, "config": <asdict(SimConfig)>}`.
- NodeType 값(영문 소문자): entrance, passage, stairs, escalator, elevator, gate, platform.
- SimConfig 기본값: dt_seconds=5.0, duration_seconds=3600.0, default_walk_speed=1.34, stochastic=false, seed=0, observation_noise_std=0.0, missing_prob=0.0.
- Vite `base`는 GitHub Pages 리포 경로에 맞춘다(환경변수 `VITE_BASE`, 로컬 기본 `/`).
- 모든 명령은 `web/` 디렉터리에서 실행(`cd web`). Node 18+ 가정. Windows에서 `pytest`는 PATH에 없으므로 `python -m pytest` 사용.
- TypeScript strict 모드. 가능한 한 순수 로직(스토어/마샬링/배치/검증)은 Vitest 단위테스트로 TDD. UI 컴포넌트는 @testing-library/react로 핵심 동작만 테스트. 외부 라이브러리 자체는 테스트하지 않는다.

---

### Task 1: Python 웹 파사드 `sim/webapi.py`

워커가 호출할 얇은 파사드. Pyodide 없이 pytest로 검증 가능(순수 Python). 전역 `_engine`을 들고 interactive step/run/reset과 export를 JSON/CSV 문자열로 노출.

**Files:**
- Create: `sim/webapi.py`
- Test: `tests/test_webapi.py`

**Interfaces:**
- Consumes (계획1): `sim.io.load_config(text)->(StationGraph,SimConfig)`, `sim.io.history_to_csv(history,node_ids,dt,layout)->str`, `sim.io.gnn_bundle(graph)->dict[str,str]`, `sim.engine.Engine(graph,config)` with `.step()`, `.run()`, `.reset()`, `.snapshot()`, `.history`, `.node_ids`, `.num_steps`, `.config`.
- Produces (워커가 `pyodide.runPython`/proxy로 호출):
  - `validate(config_text:str)->str` (JSON 배열 문자열, 오류 메시지들; 빈 배열이면 통과)
  - `load(config_text:str)->str` (JSON `{"node_ids":[...],"num_steps":int}`; 검증 실패 시 ValueError)
  - `step(n:int)->str` (n스텝 진행, history 기록, snapshot JSON 반환)
  - `run_all()->str` (engine.run() 전체 실행, 최종 snapshot JSON)
  - `reset()->str` (reset 후 snapshot JSON)
  - `snapshot()->str` (현재 snapshot JSON)
  - `export_csv(layout:str)->str` (혼잡도 시계열 CSV)
  - `export_gnn()->str` (JSON: {adjacency,distance,travel_time,node_features} 각 CSV 문자열)

- [ ] **Step 1: Write the failing test**

Create `tests/test_webapi.py`:

```python
import json
from sim import webapi


def _cfg_text(duration=20.0, dt=5.0):
    graph = {
        "nodes": [
            {"id": "A", "name": "입구", "type": "entrance", "area": 50.0,
             "base_stay_prob": 0.5, "congestion_enabled": False,
             "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
             "initial_population": 0.0, "exit_weight": 0.0,
             "generation": {"kind": "constant", "rate": 2.0}, "train": None},
            {"id": "B", "name": "통로", "type": "passage", "area": 50.0,
             "base_stay_prob": 0.5, "congestion_enabled": False,
             "weidmann": {"v_free": 1.34, "rho_max": 5.4, "gamma": 1.913},
             "initial_population": 0.0, "exit_weight": 1.0,
             "generation": None, "train": None},
        ],
        "links": [{"source": "A", "target": "B", "distance": 5.0,
                   "weight": 1.0, "travel_time": 1}],
    }
    config = {"dt_seconds": dt, "duration_seconds": duration,
              "default_walk_speed": 1.34, "stochastic": False, "seed": 0,
              "observation_noise_std": 0.0, "missing_prob": 0.0}
    return json.dumps({"graph": graph, "config": config})


def test_validate_ok_and_error():
    assert json.loads(webapi.validate(_cfg_text())) == []
    bad = json.loads(_cfg_text())
    bad["graph"]["links"][0]["weight"] = 0.5  # A 출력합 0.5 != 1
    errs = json.loads(webapi.validate(json.dumps(bad)))
    assert any("가중치 합" in e for e in errs)


def test_load_step_run_reset_roundtrip():
    info = json.loads(webapi.load(_cfg_text(duration=20.0, dt=5.0)))
    assert info["node_ids"] == ["A", "B"]
    assert info["num_steps"] == 4
    snap = json.loads(webapi.step(1))
    assert snap["t"] == 1 and abs(snap["N"][0] - 10.0) < 1e-9  # 발생 2*5=10
    final = json.loads(webapi.run_all())  # run()은 reset 후 전체 실행
    assert final["t"] == 4
    r = json.loads(webapi.reset())
    assert r["t"] == 0 and r["total_generated"] == 0.0


def test_load_invalid_raises():
    bad = json.loads(_cfg_text())
    bad["graph"]["links"][0]["weight"] = 0.5
    try:
        webapi.load(json.dumps(bad))
        assert False, "should raise"
    except ValueError as e:
        assert "가중치 합" in str(e)


def test_export_csv_and_gnn():
    webapi.load(_cfg_text(duration=10.0, dt=5.0))
    webapi.run_all()
    csv = webapi.export_csv("wide")
    assert csv.splitlines()[0] == "step,time_sec,A,B"
    bundle = json.loads(webapi.export_gnn())
    assert set(bundle.keys()) == {"adjacency", "distance", "travel_time", "node_features"}
    assert bundle["adjacency"].splitlines()[0] == ",A,B"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_webapi.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sim.webapi'`

- [ ] **Step 3: Write minimal implementation**

Create `sim/webapi.py`:

```python
"""브라우저(Pyodide) Worker가 호출하는 얇은 파사드. 순수 Python."""
from __future__ import annotations

import json

from sim.io import load_config, history_to_csv, gnn_bundle
from sim.engine import Engine

_engine: Engine | None = None


def validate(config_text: str) -> str:
    graph, _ = load_config(config_text)
    return json.dumps(graph.validate(), ensure_ascii=False)


def _snapshot_text() -> str:
    assert _engine is not None
    return json.dumps(_engine.snapshot(), ensure_ascii=False)


def load(config_text: str) -> str:
    global _engine
    graph, config = load_config(config_text)
    errors = graph.validate()
    if errors:
        raise ValueError("; ".join(errors))
    _engine = Engine(graph, config)
    return json.dumps(
        {"node_ids": _engine.node_ids, "num_steps": _engine.num_steps},
        ensure_ascii=False,
    )


def step(n: int) -> str:
    assert _engine is not None
    for _ in range(int(n)):
        if _engine.t >= _engine.num_steps:
            break
        _engine.step()
        _engine.history[_engine.t] = _engine.N
    return _snapshot_text()


def run_all() -> str:
    assert _engine is not None
    _engine.run()
    return _snapshot_text()


def reset() -> str:
    assert _engine is not None
    _engine.reset()
    return _snapshot_text()


def snapshot() -> str:
    return _snapshot_text()


def export_csv(layout: str = "wide") -> str:
    assert _engine is not None
    return history_to_csv(_engine.history, _engine.node_ids,
                          _engine.config.dt_seconds, layout)


def export_gnn() -> str:
    assert _engine is not None
    return json.dumps(gnn_bundle(_engine.graph), ensure_ascii=False)
```

> 주의: `step()`은 interactive 스테핑용으로 history를 직접 기록한다. `run_all()`은 `Engine.run()`(시작 시 reset)을 호출하므로 step 이후 호출해도 전체가 처음부터 다시 계산된다(의도된 동작).

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_webapi.py -v`
Expected: PASS (5 tests)

추가 회귀: `python -m pytest -q` → 전체 통과(기존 49 + 신규 5 = 54).

- [ ] **Step 5: Commit**

```bash
git add sim/webapi.py tests/test_webapi.py
git commit -m "feat(web): Pyodide Worker용 Python 파사드 webapi"
```

---

### Task 2: Vite + React + TS 스캐폴드 + 빌드/테스트 인프라

`web/` 디렉터리에 Vite React-TS 앱을 만들고, Vitest와 GitHub Pages용 `base`를 설정한다. sim 파일 복사 스크립트도 포함.

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/vitest.setup.ts`, `web/scripts/copy-sim.mjs`, `web/.gitignore`
- Test: `web/src/smoke.test.ts`

**Interfaces:**
- Produces: 빌드 가능한 React 앱(`npm run build`), 테스트 러너(`npm test`), sim 복사(`npm run copy-sim` → `web/public/pysim/sim/*.py`), `App` 컴포넌트.

- [ ] **Step 1: Write the failing test**

Create `web/src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { add } from './smoke'

describe('build/test infra', () => {
  it('runs vitest', () => {
    expect(add(2, 3)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm install && npm test`
Expected: FAIL — `Cannot find module './smoke'` (and infra must exist first).

- [ ] **Step 3: Write minimal implementation**

Create `web/package.json`:

```json
{
  "name": "railway-congestion-simulator-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "copy-sim": "node scripts/copy-sim.mjs",
    "dev": "npm run copy-sim && vite",
    "build": "npm run copy-sim && tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "reactflow": "^11.11.4",
    "zustand": "^4.5.5",
    "comlink": "^4.4.1",
    "plotly.js-dist-min": "^2.35.2",
    "jszip": "^3.10.1",
    "file-saver": "^2.0.5"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@types/file-saver": "^2.0.7",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

Create `web/scripts/copy-sim.mjs`:

```js
// sim/*.py 를 web/public/pysim/sim/ 로 복사 (Pyodide가 정적으로 fetch)
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const src = join(repoRoot, 'sim')
const dest = join(here, '..', 'public', 'pysim', 'sim')

mkdirSync(dest, { recursive: true })
const files = readdirSync(src).filter((f) => f.endsWith('.py'))
for (const f of files) {
  copyFileSync(join(src, f), join(dest, f))
}
console.log(`copied ${files.length} py files -> public/pysim/sim`)
```

Create `web/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'], // e2e(.spec.ts)는 Playwright가 담당
  },
})
```

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `web/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "scripts/*.mjs"]
}
```

Create `web/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>철도역사 혼잡도 합성데이터 시뮬레이터</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/src/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom'
```

Create `web/src/smoke.ts`:

```ts
export function add(a: number, b: number): number {
  return a + b
}
```

Create `web/src/App.tsx`:

```tsx
export default function App() {
  return <h1>철도역사 혼잡도 합성데이터 시뮬레이터</h1>
}
```

Create `web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Create `web/.gitignore`:

```
node_modules/
dist/
public/pysim/
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm install && npm run copy-sim && npm test`
Expected: PASS (1 test). Then `npm run build` → builds with no TS errors (dist/ produced).

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/tsconfig.json web/tsconfig.node.json web/vite.config.ts web/index.html web/src/main.tsx web/src/App.tsx web/src/vitest.setup.ts web/src/smoke.ts web/src/smoke.test.ts web/scripts/copy-sim.mjs web/.gitignore web/package-lock.json
git commit -m "feat(web): Vite+React+TS 스캐폴드 및 테스트 인프라"
```

---

### Task 3: 도메인 타입 + 기본값 + 검증 미러

Python 데이터클래스를 미러링한 TS 타입과 기본값 팩토리, 그리고 GUI 즉시 피드백용 클라이언트 검증(Python `validate`와 동일 규칙)을 만든다.

**Files:**
- Create: `web/src/types.ts`, `web/src/defaults.ts`, `web/src/validation.ts`
- Test: `web/src/validation.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `NodeType`, `WeidmannParams`, `GenerationConfig`, `TrainConfig`, `StationNode`, `StationLink`, `SimConfig`, `StationGraphJSON`, `ProjectConfig`, `Snapshot` (Global Constraints의 형식과 동일).
  - `defaults.ts`: `defaultWeidmann()`, `defaultSimConfig()`, `makeNode(type, id)`, `makeLink(source,target)`, `NODE_TYPE_LABELS: Record<NodeType,string>`, `NODE_TYPE_DEFAULTS` (종류별 v_free/congestion_enabled).
  - `validation.ts`: `validateGraph(graph: StationGraphJSON): string[]` (Python `StationGraph.validate`와 동일 규칙, tol 1e-6).

- [ ] **Step 1: Write the failing test**

Create `web/src/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateGraph } from './validation'
import { makeNode, makeLink } from './defaults'
import type { StationGraphJSON } from './types'

function okGraph(): StationGraphJSON {
  const a = makeNode('entrance', 'A')
  a.base_stay_prob = 0.2
  a.generation = { kind: 'constant', rate: 1.0 }
  const p = makeNode('platform', 'P')
  p.base_stay_prob = 0.5
  p.exit_weight = 1.0
  p.train = { first_arrival_sec: 60, headway_sec: 300 }
  const link = makeLink('A', 'P')
  link.distance = 40
  link.weight = 1.0
  return { nodes: [a, p], links: [link] }
}

describe('validateGraph', () => {
  it('passes a valid graph', () => {
    expect(validateGraph(okGraph())).toEqual([])
  })

  it('flags out-weight + exit != 1', () => {
    const g = okGraph()
    g.links[0].weight = 0.5
    expect(validateGraph(g).some((e) => e.includes('가중치 합'))).toBe(true)
  })

  it('flags generation on non-source type', () => {
    const g = okGraph()
    const c = makeNode('passage', 'C')
    c.base_stay_prob = 1.0
    c.generation = { kind: 'constant', rate: 1.0 }
    g.nodes.push(c)
    expect(validateGraph(g).some((e) => e.includes('발생'))).toBe(true)
  })

  it('flags platform without train', () => {
    const g = okGraph()
    g.nodes[1].train = null
    expect(validateGraph(g).some((e) => e.includes('열차'))).toBe(true)
  })

  it('flags link to missing node', () => {
    const g = okGraph()
    g.links.push({ source: 'A', target: 'ZZZ', distance: 10, weight: 0 })
    expect(validateGraph(g).some((e) => e.includes('존재하지 않는'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- validation`
Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/types.ts`:

```ts
export type NodeType =
  | 'entrance' | 'passage' | 'stairs' | 'escalator'
  | 'elevator' | 'gate' | 'platform'

export interface WeidmannParams { v_free: number; rho_max: number; gamma: number }

export interface GenerationConfig {
  kind: 'constant' | 'poisson' | 'normal_pulse' | 'none'
  rate?: number
  profile?: [number, number][] | null
  center_sec?: number
  sigma_sec?: number
  total?: number
}

export interface TrainConfig {
  first_arrival_sec: number
  headway_sec: number
  jitter_sigma_sec?: number
  capacity?: number
  alight_kind?: 'constant' | 'poisson' | 'normal'
  alight_mean?: number
  alight_std?: number
}

export interface StationNode {
  id: string
  name: string
  type: NodeType
  area: number
  base_stay_prob: number
  congestion_enabled?: boolean
  weidmann?: WeidmannParams
  initial_population?: number
  exit_weight?: number
  generation?: GenerationConfig | null
  train?: TrainConfig | null
}

export interface StationLink {
  source: string
  target: string
  distance: number
  weight: number
  travel_time?: number
}

export interface SimConfig {
  dt_seconds: number
  duration_seconds: number
  default_walk_speed: number
  stochastic: boolean
  seed: number
  observation_noise_std: number
  missing_prob: number
}

export interface StationGraphJSON { nodes: StationNode[]; links: StationLink[] }
export interface ProjectConfig { graph: StationGraphJSON; config: SimConfig }

export interface Snapshot {
  t: number
  time_sec: number
  N: number[]
  node_ids: string[]
  total_generated: number
  total_exited: number
}
```

Create `web/src/defaults.ts`:

```ts
import type {
  NodeType, WeidmannParams, SimConfig, StationNode, StationLink,
} from './types'

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  entrance: '출입구', passage: '통로', stairs: '계단', escalator: '에스컬레이터',
  elevator: '엘리베이터', gate: '게이트', platform: '승강장',
}

// 종류별 기본 보행속도/혼잡민감도 (설계 §4.3)
export const NODE_TYPE_DEFAULTS: Record<NodeType, { v_free: number; congestion: boolean }> = {
  entrance: { v_free: 1.34, congestion: true },
  passage: { v_free: 1.34, congestion: true },
  stairs: { v_free: 0.65, congestion: true },
  escalator: { v_free: 0.75, congestion: false },
  elevator: { v_free: 0.75, congestion: false },
  gate: { v_free: 1.0, congestion: true },
  platform: { v_free: 1.2, congestion: true },
}

export function defaultWeidmann(vFree = 1.34): WeidmannParams {
  return { v_free: vFree, rho_max: 5.4, gamma: 1.913 }
}

export function defaultSimConfig(): SimConfig {
  return {
    dt_seconds: 5.0, duration_seconds: 3600.0, default_walk_speed: 1.34,
    stochastic: false, seed: 0, observation_noise_std: 0.0, missing_prob: 0.0,
  }
}

export function makeNode(type: NodeType, id: string): StationNode {
  const d = NODE_TYPE_DEFAULTS[type]
  const node: StationNode = {
    id, name: id, type, area: 50.0, base_stay_prob: 0.3,
    congestion_enabled: d.congestion, weidmann: defaultWeidmann(d.v_free),
    initial_population: 0.0, exit_weight: 0.0, generation: null, train: null,
  }
  if (type === 'entrance') node.generation = { kind: 'poisson', rate: 1.0 }
  if (type === 'platform') {
    node.train = {
      first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 0,
      capacity: 200, alight_kind: 'constant', alight_mean: 100, alight_std: 0,
    }
  }
  return node
}

export function makeLink(source: string, target: string): StationLink {
  return { source, target, distance: 20.0, weight: 1.0, travel_time: 0 }
}
```

Create `web/src/validation.ts`:

```ts
import type { StationGraphJSON } from './types'

const TOL = 1e-6
const SOURCE_TYPES = new Set(['entrance', 'platform'])

// 계획1 StationGraph.validate 와 동일 규칙 (즉시 GUI 피드백용)
export function validateGraph(graph: StationGraphJSON): string[] {
  const errors: string[] = []
  const ids = new Set(graph.nodes.map((n) => n.id))
  const outWeight: Record<string, number> = {}
  const outCount: Record<string, number> = {}
  for (const n of graph.nodes) { outWeight[n.id] = 0; outCount[n.id] = 0 }

  for (const l of graph.links) {
    if (!ids.has(l.source)) { errors.push(`링크 source가 존재하지 않는 노드: ${l.source}`); continue }
    if (!ids.has(l.target)) { errors.push(`링크 target이 존재하지 않는 노드: ${l.target}`); continue }
    if (l.distance <= 0) errors.push(`링크 거리는 0보다 커야 함: ${l.source}->${l.target}`)
    if (l.weight < 0 || l.weight > 1) errors.push(`링크 가중치는 [0,1]: ${l.source}->${l.target}`)
    outWeight[l.source] += l.weight
    outCount[l.source] += 1
  }

  for (const n of graph.nodes) {
    if (n.base_stay_prob < 0 || n.base_stay_prob > 1) errors.push(`노드 ${n.id}: 체류확률은 [0,1]`)
    if (n.area <= 0) errors.push(`노드 ${n.id}: 면적은 0보다 커야 함`)
    const exitW = n.exit_weight ?? 0
    if (exitW < 0 || exitW > 1) errors.push(`노드 ${n.id}: exit_weight는 [0,1]`)

    const totalOut = outWeight[n.id] + exitW
    const hasOutflow = outCount[n.id] > 0 || exitW > 0
    if (hasOutflow) {
      if (Math.abs(totalOut - 1) > TOL) errors.push(`노드 ${n.id}: 출력 가중치 합(+exit)이 1이 아님 (${totalOut.toFixed(4)})`)
    } else if (Math.abs(n.base_stay_prob - 1) > TOL) {
      errors.push(`노드 ${n.id}: 이동인원이 갈 곳이 없음(출력/exit 없음, 체류확률<1)`)
    }

    if (n.generation && !SOURCE_TYPES.has(n.type)) errors.push(`노드 ${n.id}: 발생은 출입구/승강장만 가능`)
    if (n.type === 'platform' && !n.train) errors.push(`노드 ${n.id}: 승강장은 열차 설정(train)이 필요`)
    if (n.type !== 'platform' && n.train) errors.push(`노드 ${n.id}: 열차 설정은 승강장만 가능`)
  }
  return errors
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- validation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/types.ts web/src/defaults.ts web/src/validation.ts web/src/validation.test.ts
git commit -m "feat(web): 도메인 타입/기본값/클라이언트 검증"
```

---

### Task 4: Zustand 스토어 (그래프/설정 CRUD + JSON 입출력)

역 구성과 SimConfig를 보관하고, 노드/링크 추가·수정·삭제, JSON export/import, localStorage 자동저장, 출력가중치 정규화를 제공.

**Files:**
- Create: `web/src/store.ts`
- Test: `web/src/store.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `defaults.ts`.
- Produces: `useStore` (Zustand). State: `nodes: StationNode[]`, `links: StationLink[]`, `config: SimConfig`. Actions:
  - `addNode(type, position?)`, `updateNode(id, patch)`, `removeNode(id)`
  - `addLink(source, target)`, `updateLink(index, patch)`, `removeLink(index)`
  - `setConfig(patch)`
  - `normalizeOutWeights(nodeId)` (해당 노드의 출력링크 가중치 합 + exit_weight = 1 이 되도록 링크 weight 비례 조정)
  - `toProject(): ProjectConfig`, `loadProject(p: ProjectConfig)`
  - `nextNodeId(): string` (N1, N2, ...)
- 비-React 사용을 위해 `useStore.getState()` 접근 가능(테스트에서 사용).

- [ ] **Step 1: Write the failing test**

Create `web/src/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'

beforeEach(() => {
  useStore.getState().loadProject({ nodes: [], links: [] } as never)
})

describe('store', () => {
  it('adds nodes with unique ids', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    const b = s.addNode('passage')
    expect(a).not.toBe(b)
    expect(useStore.getState().nodes).toHaveLength(2)
  })

  it('updates and removes a node (and its links)', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    const b = s.addNode('passage')
    s.addLink(a, b)
    s.updateNode(a, { name: '정문' })
    expect(useStore.getState().nodes.find((n) => n.id === a)!.name).toBe('정문')
    s.removeNode(a)
    expect(useStore.getState().nodes).toHaveLength(1)
    expect(useStore.getState().links).toHaveLength(0) // 연결 링크도 제거
  })

  it('normalizes out weights to sum 1 with exit_weight', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    const b = s.addNode('passage')
    const c = s.addNode('passage')
    s.updateNode(a, { exit_weight: 0 })
    s.addLink(a, b) // weight 1
    s.addLink(a, c) // weight 1 -> 합 2
    s.normalizeOutWeights(a)
    const outs = useStore.getState().links.filter((l) => l.source === a)
    const sum = outs.reduce((acc, l) => acc + l.weight, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
  })

  it('round-trips project export/import', () => {
    const s = useStore.getState()
    const a = s.addNode('entrance')
    s.setConfig({ seed: 42 })
    const p = useStore.getState().toProject()
    useStore.getState().loadProject({ nodes: [], links: [] } as never)
    useStore.getState().loadProject(p)
    expect(useStore.getState().config.seed).toBe(42)
    expect(useStore.getState().nodes[0].id).toBe(a)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- store`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/store.ts`:

```ts
import { create } from 'zustand'
import type {
  StationNode, StationLink, SimConfig, NodeType, ProjectConfig,
} from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

const STORAGE_KEY = 'railway-sim-project-v1'

interface State {
  nodes: StationNode[]
  links: StationLink[]
  config: SimConfig
  positions: Record<string, { x: number; y: number }>
  addNode: (type: NodeType, position?: { x: number; y: number }) => string
  updateNode: (id: string, patch: Partial<StationNode>) => void
  removeNode: (id: string) => void
  addLink: (source: string, target: string) => void
  updateLink: (index: number, patch: Partial<StationLink>) => void
  removeLink: (index: number) => void
  setConfig: (patch: Partial<SimConfig>) => void
  setPosition: (id: string, pos: { x: number; y: number }) => void
  normalizeOutWeights: (nodeId: string) => void
  nextNodeId: () => string
  toProject: () => ProjectConfig
  loadProject: (p: ProjectConfig) => void
}

function persist(get: () => State) {
  try {
    const { nodes, links, config, positions } = get()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, links, config, positions }))
  } catch { /* localStorage 불가 환경 무시 */ }
}

function loadInitial(): Pick<State, 'nodes' | 'links' | 'config' | 'positions'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        nodes: p.nodes ?? [], links: p.links ?? [],
        config: { ...defaultSimConfig(), ...(p.config ?? {}) },
        positions: p.positions ?? {},
      }
    }
  } catch { /* 무시 */ }
  return { nodes: [], links: [], config: defaultSimConfig(), positions: {} }
}

export const useStore = create<State>((set, get) => ({
  ...loadInitial(),

  nextNodeId: () => {
    const ids = new Set(get().nodes.map((n) => n.id))
    let i = 1
    while (ids.has(`N${i}`)) i += 1
    return `N${i}`
  },

  addNode: (type, position) => {
    const id = get().nextNodeId()
    const node = makeNode(type, id)
    const pos = position ?? { x: 100 + get().nodes.length * 40, y: 100 }
    set((st) => ({ nodes: [...st.nodes, node], positions: { ...st.positions, [id]: pos } }))
    persist(get)
    return id
  },

  updateNode: (id, patch) => {
    set((st) => ({ nodes: st.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
    persist(get)
  },

  removeNode: (id) => {
    set((st) => {
      const positions = { ...st.positions }
      delete positions[id]
      return {
        nodes: st.nodes.filter((n) => n.id !== id),
        links: st.links.filter((l) => l.source !== id && l.target !== id),
        positions,
      }
    })
    persist(get)
  },

  addLink: (source, target) => {
    if (source === target) return
    if (get().links.some((l) => l.source === source && l.target === target)) return
    set((st) => ({ links: [...st.links, makeLink(source, target)] }))
    persist(get)
  },

  updateLink: (index, patch) => {
    set((st) => ({ links: st.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))
    persist(get)
  },

  removeLink: (index) => {
    set((st) => ({ links: st.links.filter((_, i) => i !== index) }))
    persist(get)
  },

  setConfig: (patch) => {
    set((st) => ({ config: { ...st.config, ...patch } }))
    persist(get)
  },

  setPosition: (id, pos) => {
    set((st) => ({ positions: { ...st.positions, [id]: pos } }))
    persist(get)
  },

  normalizeOutWeights: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    const exitW = node?.exit_weight ?? 0
    const outIdx = get().links
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.source === nodeId)
    const sum = outIdx.reduce((acc, { l }) => acc + l.weight, 0)
    const remaining = Math.max(0, 1 - exitW)
    set((st) => ({
      links: st.links.map((l, i) => {
        const hit = outIdx.find((o) => o.i === i)
        if (!hit) return l
        const w = sum > 0 ? (l.weight / sum) * remaining : remaining / outIdx.length
        return { ...l, weight: w }
      }),
    }))
    persist(get)
  },

  toProject: () => {
    const { nodes, links, config } = get()
    return { graph: { nodes, links }, config }
  },

  loadProject: (p) => {
    set({
      nodes: p.graph?.nodes ?? [],
      links: p.graph?.links ?? [],
      config: { ...defaultSimConfig(), ...(p.config ?? {}) },
    })
    persist(get)
  },
}))
```

> 참고: `toProject()`는 계획1 `save_config` 형식과 동일한 `{graph:{nodes,links}, config}`를 반환한다. `positions`는 화면 배치용으로 localStorage에만 저장하고 Python에는 보내지 않는다.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- store`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/store.ts web/src/store.test.ts
git commit -m "feat(web): Zustand 그래프/설정 스토어"
```

---

### Task 5: Pyodide Web Worker + Comlink 브리지

Pyodide를 로드하고 numpy 설치, `sim/*.py`를 FS에 기록 후 `sim.webapi`를 import. Comlink로 메인 스레드에 API 노출. 순수 마샬링 헬퍼는 단위테스트한다.

**Files:**
- Create: `web/src/worker/simWorker.ts`, `web/src/worker/paths.ts`, `web/src/worker/client.ts`
- Test: `web/src/worker/paths.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`ProjectConfig`, `Snapshot`), `sim.webapi`(Python).
- Produces:
  - `paths.ts`: `simFileUrls(base: string): string[]` (pysim/sim의 .py URL 목록), `PYODIDE_INDEX_URL` 상수.
  - `simWorker.ts`: Comlink로 노출되는 `SimApi` 클래스 — `init()`, `validate(text)`, `load(text)`, `step(n)`, `runAll()`, `reset()`, `snapshot()`, `exportCsv(layout)`, `exportGnn()`.
  - `client.ts`: `createSimClient(): Comlink.Remote<SimApi>` (Worker 생성 + Comlink.wrap; `import.meta.env.BASE_URL` 사용).
- `SimApi` 메서드 시그니처 (모든 입력/출력은 JSON 문자열 또는 파싱된 객체):
  - `init(): Promise<void>`
  - `validate(text: string): Promise<string[]>`
  - `load(text: string): Promise<{ node_ids: string[]; num_steps: number }>`
  - `step(n: number): Promise<Snapshot>`
  - `runAll(): Promise<Snapshot>`
  - `reset(): Promise<Snapshot>`
  - `snapshot(): Promise<Snapshot>`
  - `exportCsv(layout: string): Promise<string>`
  - `exportGnn(): Promise<Record<string, string>>`

- [ ] **Step 1: Write the failing test**

Create `web/src/worker/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { simFileUrls, SIM_FILES } from './paths'

describe('simFileUrls', () => {
  it('joins base with pysim sim files', () => {
    const urls = simFileUrls('/myrepo/')
    expect(urls).toHaveLength(SIM_FILES.length)
    expect(urls[0]).toBe(`/myrepo/pysim/sim/${SIM_FILES[0]}`)
    expect(urls.every((u) => u.includes('/pysim/sim/'))).toBe(true)
  })

  it('handles base without trailing slash', () => {
    const urls = simFileUrls('/myrepo')
    expect(urls[0]).toBe(`/myrepo/pysim/sim/${SIM_FILES[0]}`)
  })

  it('includes all required sim modules', () => {
    expect(SIM_FILES).toEqual(
      expect.arrayContaining([
        '__init__.py', 'model.py', 'pedestrian.py',
        'generation.py', 'engine.py', 'io.py', 'webapi.py',
      ]),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- paths`
Expected: FAIL — `Cannot find module './paths'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/worker/paths.ts`:

```ts
export const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/'

// sim 패키지 파일 (의존성 순서 무관, import 시 해석됨)
export const SIM_FILES = [
  '__init__.py', 'model.py', 'pedestrian.py',
  'generation.py', 'engine.py', 'io.py', 'webapi.py',
] as const

export function simFileUrls(base: string): string[] {
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  return SIM_FILES.map((f) => `${b}/pysim/sim/${f}`)
}
```

Create `web/src/worker/simWorker.ts`:

```ts
import * as Comlink from 'comlink'
import type { Snapshot } from '../types'
import { PYODIDE_INDEX_URL, SIM_FILES, simFileUrls } from './paths'

class SimApi {
  private pyodide: any = null

  async init(base: string): Promise<void> {
    if (this.pyodide) return
    // ES 모듈 워커에서는 importScripts 불가 → Pyodide ESM(pyodide.mjs)을 동적 import
    const mod = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)
    this.pyodide = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL })
    await this.pyodide.loadPackage('numpy')
    // sim 패키지 파일을 FS에 기록
    this.pyodide.FS.mkdirTree('sim')
    const urls = simFileUrls(base)
    const texts = await Promise.all(
      urls.map((u) => fetch(u).then((r) => {
        if (!r.ok) throw new Error(`sim 파일 로드 실패: ${u}`)
        return r.text()
      })),
    )
    SIM_FILES.forEach((name, i) => {
      this.pyodide.FS.writeFile(`sim/${name}`, texts[i])
    })
    this.pyodide.runPython('import sim.webapi as webapi')
  }

  private call(expr: string): string {
    return this.pyodide.runPython(`webapi.${expr}`) as string
  }

  async validate(text: string): Promise<string[]> {
    this.pyodide.globals.set('_cfg', text)
    return JSON.parse(this.call('validate(_cfg)'))
  }

  async load(text: string): Promise<{ node_ids: string[]; num_steps: number }> {
    this.pyodide.globals.set('_cfg', text)
    return JSON.parse(this.call('load(_cfg)'))
  }

  async step(n: number): Promise<Snapshot> {
    return JSON.parse(this.call(`step(${Math.trunc(n)})`))
  }

  async runAll(): Promise<Snapshot> { return JSON.parse(this.call('run_all()')) }
  async reset(): Promise<Snapshot> { return JSON.parse(this.call('reset()')) }
  async snapshot(): Promise<Snapshot> { return JSON.parse(this.call('snapshot()')) }

  async exportCsv(layout: string): Promise<string> {
    this.pyodide.globals.set('_layout', layout)
    return this.call('export_csv(_layout)')
  }

  async exportGnn(): Promise<Record<string, string>> {
    return JSON.parse(this.call('export_gnn()'))
  }
}

export type { SimApi }
Comlink.expose(new SimApi())
```

Create `web/src/worker/client.ts`:

```ts
import * as Comlink from 'comlink'
import type { SimApi } from './simWorker'

export interface SimClient extends Comlink.Remote<SimApi> {}

export function createSimClient(): SimClient {
  const worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' })
  return Comlink.wrap<SimApi>(worker)
}

export const APP_BASE = import.meta.env.BASE_URL
```

> 주의: `init(base)`에 `import.meta.env.BASE_URL`을 넘겨 GitHub Pages 하위 경로에서도 sim 파일을 올바르게 fetch한다. Pyodide 버전(v0.26.2)은 numpy 호환 버전이 포함된 것으로 사용한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- paths`
Expected: PASS (3 tests). 그리고 `npm run build`로 TS 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/worker/paths.ts web/src/worker/paths.test.ts web/src/worker/simWorker.ts web/src/worker/client.ts
git commit -m "feat(web): Pyodide Web Worker + Comlink 브리지"
```

---

### Task 6: 시뮬레이션 러너 훅 (배속/일시정지/스텝/리셋)

워커를 구동하여 스텝을 진행하고 스냅샷 이력을 모으는 React 훅. 배속(steps/sec)·일시정지·단일스텝·리셋·즉시실행을 제공.

**Files:**
- Create: `web/src/useSimulation.ts`
- Test: `web/src/useSimulation.test.ts`

**Interfaces:**
- Consumes: `client.ts` (`createSimClient`, `SimClient`), `store.ts`, `validation.ts`, `types.ts`.
- Produces: `useSimulation()` 반환:
  - 상태: `status: 'idle'|'loading'|'ready'|'running'|'paused'|'done'|'error'`, `snapshot: Snapshot|null`, `history: Snapshot[]`, `progress: number(0..1)`, `error: string|null`, `numSteps: number`, `speed: number`.
  - 액션: `prepare()` (validate+load), `play()`, `pause()`, `stepOnce()`, `reset()`, `runInstant()`, `setSpeed(n)`.
  - 테스트 가능성을 위해 워커 클라이언트를 주입할 수 있는 내부 팩토리 사용: `useSimulation({ clientFactory })` (기본은 `createSimClient`).
- 별도 순수 함수 `computeProgress(t, numSteps): number` 도 export (테스트 대상).

- [ ] **Step 1: Write the failing test**

Create `web/src/useSimulation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeProgress } from './useSimulation'

describe('computeProgress', () => {
  it('is 0 at start and 1 at end', () => {
    expect(computeProgress(0, 10)).toBe(0)
    expect(computeProgress(10, 10)).toBe(1)
    expect(computeProgress(5, 10)).toBe(0.5)
  })
  it('guards against zero steps', () => {
    expect(computeProgress(0, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- useSimulation`
Expected: FAIL — `Cannot find module './useSimulation'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/useSimulation.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSimClient, type SimClient, APP_BASE } from './worker/client'
import { useStore } from './store'
import { validateGraph } from './validation'
import type { Snapshot } from './types'

export function computeProgress(t: number, numSteps: number): number {
  if (numSteps <= 0) return 0
  return Math.min(1, t / numSteps)
}

export type SimStatus =
  | 'idle' | 'loading' | 'ready' | 'running' | 'paused' | 'done' | 'error'

interface Options { clientFactory?: () => SimClient }

export function useSimulation(opts: Options = {}) {
  const clientRef = useRef<SimClient | null>(null)
  const initedRef = useRef(false)
  const [status, setStatus] = useState<SimStatus>('idle')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [numSteps, setNumSteps] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [speed, setSpeed] = useState(10) // steps/sec
  const runningRef = useRef(false)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const client = useCallback((): SimClient => {
    if (!clientRef.current) {
      clientRef.current = (opts.clientFactory ?? createSimClient)()
    }
    return clientRef.current
  }, [opts])

  const ensureInit = useCallback(async () => {
    if (!initedRef.current) {
      setStatus('loading')
      await client().init(APP_BASE)
      initedRef.current = true
    }
  }, [client])

  const prepare = useCallback(async () => {
    setError(null)
    const project = useStore.getState().toProject()
    const errs = validateGraph(project.graph)
    if (errs.length) { setError(errs.join('\n')); setStatus('error'); return false }
    try {
      await ensureInit()
      const info = await client().load(JSON.stringify(project))
      setNumSteps(info.num_steps)
      const snap = await client().snapshot()
      setSnapshot(snap); setHistory([snap]); setStatus('ready')
      return true
    } catch (e) {
      setError(String(e)); setStatus('error'); return false
    }
  }, [client, ensureInit])

  const loop = useCallback(async () => {
    while (runningRef.current) {
      const snap = await client().step(1)
      setSnapshot(snap)
      setHistory((h) => [...h, snap])
      if (snap.t >= numSteps) { runningRef.current = false; setStatus('done'); break }
      const delayMs = 1000 / Math.max(1, speedRef.current)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }, [client, numSteps])

  const play = useCallback(async () => {
    if (status === 'idle' || status === 'error') { const ok = await prepare(); if (!ok) return }
    runningRef.current = true; setStatus('running'); void loop()
  }, [status, prepare, loop])

  const pause = useCallback(() => { runningRef.current = false; setStatus('paused') }, [])

  const stepOnce = useCallback(async () => {
    if (status === 'idle' || status === 'error') { const ok = await prepare(); if (!ok) return }
    const snap = await client().step(1)
    setSnapshot(snap); setHistory((h) => [...h, snap])
    if (snap.t >= numSteps) setStatus('done'); else setStatus('paused')
  }, [status, prepare, client, numSteps])

  const reset = useCallback(async () => {
    runningRef.current = false
    if (!initedRef.current) { await prepare(); return }
    const snap = await client().reset()
    setSnapshot(snap); setHistory([snap]); setStatus('ready')
  }, [client, prepare])

  const runInstant = useCallback(async () => {
    if (status === 'idle' || status === 'error') { const ok = await prepare(); if (!ok) return }
    setStatus('running')
    const snap = await client().runAll()
    setSnapshot(snap); setStatus('done')
  }, [status, prepare, client])

  useEffect(() => () => { runningRef.current = false }, [])

  return {
    status, snapshot, history, numSteps, error, speed,
    progress: computeProgress(snapshot?.t ?? 0, numSteps),
    prepare, play, pause, stepOnce, reset, runInstant, setSpeed,
    getClient: client,
  }
}
```

> 참고: 즉시실행(`runInstant`)은 워커의 `run_all`로 전체를 한 번에 계산하므로 history 누적 차트가 아닌 최종 CSV 내보내기에 적합. 실시간 차트는 `play`(스텝 누적)로 채운다.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- useSimulation`
Expected: PASS (2 tests). `npm run build`로 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/useSimulation.ts web/src/useSimulation.test.ts
git commit -m "feat(web): 시뮬레이션 러너 훅(배속/일시정지/스텝/리셋)"
```

---

### Task 7: 그래프 에디터 (React Flow) + 노드 팔레트

React Flow로 노드 드래그 배치·링크 드로잉, 종류별 팔레트, 선택 상태를 스토어와 연동.

**Files:**
- Create: `web/src/components/GraphEditor.tsx`, `web/src/components/NodePalette.tsx`, `web/src/graphAdapter.ts`
- Test: `web/src/graphAdapter.test.ts`

**Interfaces:**
- Consumes: `store.ts`, `types.ts`, `defaults.ts` (`NODE_TYPE_LABELS`), `reactflow`.
- Produces:
  - `graphAdapter.ts`: `toFlowNodes(nodes, positions, selectedId): RFNode[]`, `toFlowEdges(links, selectedIndex): RFEdge[]` (스토어 ↔ React Flow 변환). 순수 함수.
  - `GraphEditor.tsx`: `<GraphEditor selectedNodeId selectedLinkIndex onSelectNode onSelectLink />` — React Flow 캔버스, 노드 이동→`setPosition`, 엣지 연결→`addLink`.
  - `NodePalette.tsx`: 종류 버튼들, 클릭 시 `addNode(type)`.

- [ ] **Step 1: Write the failing test**

Create `web/src/graphAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges } from './graphAdapter'
import { makeNode, makeLink } from './defaults'

describe('graphAdapter', () => {
  it('maps nodes to react-flow nodes with positions and labels', () => {
    const n = makeNode('platform', 'P')
    const rf = toFlowNodes([n], { P: { x: 10, y: 20 } }, 'P')
    expect(rf[0].id).toBe('P')
    expect(rf[0].position).toEqual({ x: 10, y: 20 })
    expect(rf[0].data.label).toContain('승강장')
    expect(rf[0].selected).toBe(true)
  })

  it('defaults missing position to origin-ish and maps edges', () => {
    const a = makeNode('entrance', 'A')
    const b = makeNode('passage', 'B')
    const link = makeLink('A', 'B')
    const edges = toFlowEdges([link], 0)
    expect(edges[0].source).toBe('A')
    expect(edges[0].target).toBe('B')
    expect(edges[0].selected).toBe(true)
    const rf = toFlowNodes([a, b], {}, null)
    expect(rf[0].position).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- graphAdapter`
Expected: FAIL — `Cannot find module './graphAdapter'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/graphAdapter.ts`:

```ts
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'
import type { StationNode, StationLink } from './types'
import { NODE_TYPE_LABELS } from './defaults'

export function toFlowNodes(
  nodes: StationNode[],
  positions: Record<string, { x: number; y: number }>,
  selectedId: string | null,
): RFNode[] {
  return nodes.map((n, i) => ({
    id: n.id,
    position: positions[n.id] ?? { x: 80 + i * 60, y: 80 + (i % 3) * 60 },
    data: { label: `${n.name}\n[${NODE_TYPE_LABELS[n.type]}]` },
    selected: n.id === selectedId,
    type: 'default',
  }))
}

export function toFlowEdges(links: StationLink[], selectedIndex: number | null): RFEdge[] {
  return links.map((l, i) => ({
    id: `e${i}-${l.source}-${l.target}`,
    source: l.source,
    target: l.target,
    label: `w=${l.weight.toFixed(2)} τ=${l.travel_time ?? 0}`,
    selected: i === selectedIndex,
    animated: i === selectedIndex,
  }))
}
```

Create `web/src/components/NodePalette.tsx`:

```tsx
import { useStore } from '../store'
import { NODE_TYPE_LABELS } from '../defaults'
import type { NodeType } from '../types'

const TYPES: NodeType[] = [
  'entrance', 'passage', 'stairs', 'escalator', 'elevator', 'gate', 'platform',
]

export function NodePalette({ onAdded }: { onAdded: (id: string) => void }) {
  const addNode = useStore((s) => s.addNode)
  return (
    <div className="palette">
      <strong>노드 추가</strong>
      <div className="palette-buttons">
        {TYPES.map((t) => (
          <button key={t} onClick={() => onAdded(addNode(t))}>
            {NODE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  )
}
```

Create `web/src/components/GraphEditor.tsx`:

```tsx
import { useCallback } from 'react'
import ReactFlow, {
  Background, Controls, type Connection, type NodeChange,
  applyNodeChanges, type Node as RFNode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '../store'
import { toFlowNodes, toFlowEdges } from '../graphAdapter'

interface Props {
  selectedNodeId: string | null
  selectedLinkIndex: number | null
  onSelectNode: (id: string | null) => void
  onSelectLink: (index: number | null) => void
}

export function GraphEditor({ selectedNodeId, selectedLinkIndex, onSelectNode, onSelectLink }: Props) {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const positions = useStore((s) => s.positions)
  const setPosition = useStore((s) => s.setPosition)
  const addLink = useStore((s) => s.addLink)

  const rfNodes = toFlowNodes(nodes, positions, selectedNodeId)
  const rfEdges = toFlowEdges(links, selectedLinkIndex)

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const updated = applyNodeChanges(changes, rfNodes) as RFNode[]
    for (const u of updated) setPosition(u.id, u.position)
  }, [rfNodes, setPosition])

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) addLink(c.source, c.target)
  }, [addLink])

  return (
    <div className="graph-editor" style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => { onSelectNode(n.id); onSelectLink(null) }}
        onEdgeClick={(_, e) => {
          const idx = rfEdges.findIndex((x) => x.id === e.id)
          onSelectLink(idx); onSelectNode(null)
        }}
        onPaneClick={() => { onSelectNode(null); onSelectLink(null) }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- graphAdapter`
Expected: PASS (2 tests). `npm run build`로 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/graphAdapter.ts web/src/graphAdapter.test.ts web/src/components/GraphEditor.tsx web/src/components/NodePalette.tsx
git commit -m "feat(web): React Flow 그래프 에디터 + 노드 팔레트"
```

---

### Task 8: 인스펙터 패널 (노드/링크 속성 편집)

선택된 노드/링크의 속성을 편집하는 폼. 노드 종류별 발생/열차 설정, 출력가중치 정규화 버튼, 실시간 검증 메시지 표시.

**Files:**
- Create: `web/src/components/NodeInspector.tsx`, `web/src/components/LinkInspector.tsx`, `web/src/components/ValidationBanner.tsx`
- Test: `web/src/components/NodeInspector.test.tsx`

**Interfaces:**
- Consumes: `store.ts`, `types.ts`, `defaults.ts`, `validation.ts`, `@testing-library/react`.
- Produces:
  - `NodeInspector.tsx`: `<NodeInspector nodeId />` — 노드명/종류/면적/체류확률/exit_weight/혼잡 on-off/Weidmann 편집; 종류가 entrance/platform이면 발생/열차 폼 노출(다른 종류는 숨김).
  - `LinkInspector.tsx`: `<LinkInspector index />` — 거리/가중치/소요시간 편집 + "출력가중치 정규화" 버튼(`normalizeOutWeights(source)`).
  - `ValidationBanner.tsx`: `<ValidationBanner />` — `validateGraph` 결과를 목록으로 표시(없으면 "검증 통과").

- [ ] **Step 1: Write the failing test**

Create `web/src/components/NodeInspector.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodeInspector } from './NodeInspector'
import { useStore } from '../store'

beforeEach(() => {
  useStore.getState().loadProject({ nodes: [], links: [] } as never)
})

describe('NodeInspector', () => {
  it('edits node name and shows generation form for entrance', () => {
    const id = useStore.getState().addNode('entrance')
    render(<NodeInspector nodeId={id} />)
    const nameInput = screen.getByLabelText('노드명') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '정문' } })
    expect(useStore.getState().nodes[0].name).toBe('정문')
    expect(screen.getByText(/발생/)).toBeInTheDocument() // 발생 폼 노출
  })

  it('does not show train form for passage', () => {
    const id = useStore.getState().addNode('passage')
    render(<NodeInspector nodeId={id} />)
    expect(screen.queryByText(/열차/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- NodeInspector`
Expected: FAIL — `Cannot find module './NodeInspector'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/components/NodeInspector.tsx`:

```tsx
import { useStore } from '../store'
import { NODE_TYPE_LABELS, defaultWeidmann } from '../defaults'
import type { NodeType, GenerationConfig, TrainConfig } from '../types'

const TYPES: NodeType[] = [
  'entrance', 'passage', 'stairs', 'escalator', 'elevator', 'gate', 'platform',
]

function numField(label: string, value: number, onChange: (v: number) => void) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}

export function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId))
  const updateNode = useStore((s) => s.updateNode)
  const removeNode = useStore((s) => s.removeNode)
  if (!node) return null

  const isSource = node.type === 'entrance' || node.type === 'platform'
  const gen: GenerationConfig = node.generation ?? { kind: 'poisson', rate: 1.0 }
  const train: TrainConfig = node.train ?? {
    first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 0,
    capacity: 200, alight_kind: 'constant', alight_mean: 100, alight_std: 0,
  }
  const w = node.weidmann ?? defaultWeidmann()

  return (
    <div className="inspector">
      <h3>노드: {node.id}</h3>
      <label className="field">
        <span>노드명</span>
        <input value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} />
      </label>
      <label className="field">
        <span>종류</span>
        <select
          value={node.type}
          onChange={(e) => {
            const t = e.target.value as NodeType
            updateNode(node.id, {
              type: t,
              generation: t === 'entrance' || t === 'platform' ? node.generation : null,
              train: t === 'platform' ? train : null,
            })
          }}
        >
          {TYPES.map((t) => <option key={t} value={t}>{NODE_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      {numField('면적(m²)', node.area, (v) => updateNode(node.id, { area: v }))}
      {numField('기본 체류확률', node.base_stay_prob, (v) => updateNode(node.id, { base_stay_prob: v }))}
      {numField('이탈 가중치(exit)', node.exit_weight ?? 0, (v) => updateNode(node.id, { exit_weight: v }))}
      {numField('초기 인원', node.initial_population ?? 0, (v) => updateNode(node.id, { initial_population: v }))}
      <label className="field">
        <span>혼잡 동적 체류</span>
        <input
          type="checkbox"
          checked={node.congestion_enabled ?? true}
          onChange={(e) => updateNode(node.id, { congestion_enabled: e.target.checked })}
        />
      </label>
      <fieldset>
        <legend>Weidmann</legend>
        {numField('자유속도 v_free', w.v_free, (v) => updateNode(node.id, { weidmann: { ...w, v_free: v } }))}
        {numField('임계밀도 ρ_max', w.rho_max, (v) => updateNode(node.id, { weidmann: { ...w, rho_max: v } }))}
        {numField('γ', w.gamma, (v) => updateNode(node.id, { weidmann: { ...w, gamma: v } }))}
      </fieldset>

      {isSource && (
        <fieldset>
          <legend>발생 설정</legend>
          <label className="field">
            <span>분포</span>
            <select
              value={gen.kind}
              onChange={(e) => updateNode(node.id, { generation: { ...gen, kind: e.target.value as GenerationConfig['kind'] } })}
            >
              <option value="constant">상수</option>
              <option value="poisson">Poisson</option>
              <option value="normal_pulse">정규 펄스</option>
              <option value="none">없음</option>
            </select>
          </label>
          {(gen.kind === 'constant' || gen.kind === 'poisson') &&
            numField('발생률(인/초)', gen.rate ?? 0, (v) => updateNode(node.id, { generation: { ...gen, rate: v } }))}
          {gen.kind === 'normal_pulse' && (
            <>
              {numField('중심시각(초)', gen.center_sec ?? 0, (v) => updateNode(node.id, { generation: { ...gen, center_sec: v } }))}
              {numField('표준편차(초)', gen.sigma_sec ?? 1, (v) => updateNode(node.id, { generation: { ...gen, sigma_sec: v } }))}
              {numField('총 인원', gen.total ?? 0, (v) => updateNode(node.id, { generation: { ...gen, total: v } }))}
            </>
          )}
        </fieldset>
      )}

      {node.type === 'platform' && (
        <fieldset>
          <legend>열차(승강장)</legend>
          {numField('첫 도착(초)', train.first_arrival_sec, (v) => updateNode(node.id, { train: { ...train, first_arrival_sec: v } }))}
          {numField('배차간격(초)', train.headway_sec, (v) => updateNode(node.id, { train: { ...train, headway_sec: v } }))}
          {numField('도착 지터σ(초)', train.jitter_sigma_sec ?? 0, (v) => updateNode(node.id, { train: { ...train, jitter_sigma_sec: v } }))}
          {numField('열차 정원', train.capacity ?? 0, (v) => updateNode(node.id, { train: { ...train, capacity: v } }))}
          <label className="field">
            <span>하차 분포</span>
            <select
              value={train.alight_kind ?? 'constant'}
              onChange={(e) => updateNode(node.id, { train: { ...train, alight_kind: e.target.value as TrainConfig['alight_kind'] } })}
            >
              <option value="constant">상수</option>
              <option value="poisson">Poisson</option>
              <option value="normal">정규</option>
            </select>
          </label>
          {numField('하차 평균', train.alight_mean ?? 0, (v) => updateNode(node.id, { train: { ...train, alight_mean: v } }))}
          {(train.alight_kind === 'normal') &&
            numField('하차 표준편차', train.alight_std ?? 0, (v) => updateNode(node.id, { train: { ...train, alight_std: v } }))}
        </fieldset>
      )}

      <button className="danger" onClick={() => removeNode(node.id)}>노드 삭제</button>
    </div>
  )
}
```

Create `web/src/components/LinkInspector.tsx`:

```tsx
import { useStore } from '../store'

export function LinkInspector({ index }: { index: number }) {
  const link = useStore((s) => s.links[index])
  const updateLink = useStore((s) => s.updateLink)
  const removeLink = useStore((s) => s.removeLink)
  const normalize = useStore((s) => s.normalizeOutWeights)
  if (!link) return null
  return (
    <div className="inspector">
      <h3>링크: {link.source} → {link.target}</h3>
      <label className="field">
        <span>거리(m)</span>
        <input type="number" value={link.distance}
          onChange={(e) => updateLink(index, { distance: parseFloat(e.target.value) })} />
      </label>
      <label className="field">
        <span>가중치</span>
        <input type="number" value={link.weight}
          onChange={(e) => updateLink(index, { weight: parseFloat(e.target.value) })} />
      </label>
      <label className="field">
        <span>소요시간(스텝, 0=자동)</span>
        <input type="number" value={link.travel_time ?? 0}
          onChange={(e) => updateLink(index, { travel_time: parseInt(e.target.value, 10) })} />
      </label>
      <button onClick={() => normalize(link.source)}>출력 가중치 정규화(합=1)</button>
      <button className="danger" onClick={() => removeLink(index)}>링크 삭제</button>
    </div>
  )
}
```

Create `web/src/components/ValidationBanner.tsx`:

```tsx
import { useStore } from '../store'
import { validateGraph } from '../validation'

export function ValidationBanner() {
  const nodes = useStore((s) => s.nodes)
  const links = useStore((s) => s.links)
  const errors = validateGraph({ nodes, links })
  if (errors.length === 0) return <div className="validation ok">검증 통과 ✓</div>
  return (
    <div className="validation err">
      <strong>검증 오류 {errors.length}건</strong>
      <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- NodeInspector`
Expected: PASS (2 tests). `npm run build`로 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/NodeInspector.tsx web/src/components/LinkInspector.tsx web/src/components/ValidationBanner.tsx web/src/components/NodeInspector.test.tsx
git commit -m "feat(web): 노드/링크 인스펙터 + 검증 배너"
```

---

### Task 9: 시뮬레이션 제어판 + 대시보드(Plotly 차트 + 지표)

duration/dt/시드/배속/확률모드 설정과 재생 제어, 실시간 혼잡도 라인차트와 집계 지표.

**Files:**
- Create: `web/src/components/SimControls.tsx`, `web/src/components/Dashboard.tsx`, `web/src/chartData.ts`
- Test: `web/src/chartData.test.ts`

**Interfaces:**
- Consumes: `store.ts`, `useSimulation.ts`, `types.ts`, `plotly.js-dist-min`.
- Produces:
  - `chartData.ts`: `buildSeries(history: Snapshot[]): { node: string; x: number[]; y: number[] }[]` (노드별 (time_sec, 인원) 시계열). 순수 함수.
  - `SimControls.tsx`: `<SimControls sim={ReturnType<typeof useSimulation>} />` — duration/dt/seed/stochastic 편집(store.setConfig), 배속 슬라이더, ▶/⏸/⏭/⟲/즉시실행 버튼, 진행률.
  - `Dashboard.tsx`: `<Dashboard sim={...} />` — Plotly 라인차트(노드별 시계열) + 지표(현재시각/총재실/누적발생/누적이탈).

- [ ] **Step 1: Write the failing test**

Create `web/src/chartData.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSeries } from './chartData'
import type { Snapshot } from './types'

const hist: Snapshot[] = [
  { t: 0, time_sec: 0, N: [0, 0], node_ids: ['A', 'B'], total_generated: 0, total_exited: 0 },
  { t: 1, time_sec: 5, N: [10, 2], node_ids: ['A', 'B'], total_generated: 10, total_exited: 0 },
  { t: 2, time_sec: 10, N: [15, 5], node_ids: ['A', 'B'], total_generated: 20, total_exited: 0 },
]

describe('buildSeries', () => {
  it('builds per-node time series', () => {
    const series = buildSeries(hist)
    expect(series).toHaveLength(2)
    const a = series.find((s) => s.node === 'A')!
    expect(a.x).toEqual([0, 5, 10])
    expect(a.y).toEqual([0, 10, 15])
  })
  it('returns empty for empty history', () => {
    expect(buildSeries([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- chartData`
Expected: FAIL — `Cannot find module './chartData'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/chartData.ts`:

```ts
import type { Snapshot } from './types'

export function buildSeries(history: Snapshot[]): { node: string; x: number[]; y: number[] }[] {
  if (history.length === 0) return []
  const ids = history[0].node_ids
  return ids.map((node, j) => ({
    node,
    x: history.map((s) => s.time_sec),
    y: history.map((s) => s.N[j]),
  }))
}
```

Create `web/src/components/SimControls.tsx`:

```tsx
import { useStore } from '../store'
import type { useSimulation } from '../useSimulation'

export function SimControls({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const config = useStore((s) => s.config)
  const setConfig = useStore((s) => s.setConfig)
  return (
    <div className="controls">
      <div className="row">
        <label>총 시간(초)
          <input type="number" value={config.duration_seconds}
            onChange={(e) => setConfig({ duration_seconds: parseFloat(e.target.value) })} />
        </label>
        <label>Δt(초)
          <input type="number" value={config.dt_seconds}
            onChange={(e) => setConfig({ dt_seconds: parseFloat(e.target.value) })} />
        </label>
        <label>시드
          <input type="number" value={config.seed}
            onChange={(e) => setConfig({ seed: parseInt(e.target.value, 10) })} />
        </label>
        <label>확률모드
          <input type="checkbox" checked={config.stochastic}
            onChange={(e) => setConfig({ stochastic: e.target.checked })} />
        </label>
      </div>
      <div className="row">
        <label>배속 {sim.speed} step/s
          <input type="range" min={1} max={200} value={sim.speed}
            onChange={(e) => sim.setSpeed(parseInt(e.target.value, 10))} />
        </label>
      </div>
      <div className="row">
        <button onClick={() => void sim.play()} disabled={sim.status === 'running'}>▶ 재생</button>
        <button onClick={() => sim.pause()} disabled={sim.status !== 'running'}>⏸ 일시정지</button>
        <button onClick={() => void sim.stepOnce()}>⏭ 한 스텝</button>
        <button onClick={() => void sim.reset()}>⟲ 리셋</button>
        <button onClick={() => void sim.runInstant()}>⚡ 즉시 실행</button>
      </div>
      <div className="row">
        <progress value={sim.progress} max={1} />
        <span>{Math.round(sim.progress * 100)}% (status: {sim.status})</span>
      </div>
      {sim.error && <pre className="validation err">{sim.error}</pre>}
    </div>
  )
}
```

Create `web/src/components/Dashboard.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { buildSeries } from '../chartData'
import type { useSimulation } from '../useSimulation'

export function Dashboard({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const series = buildSeries(sim.history)
    const traces = series.map((s) => ({
      x: s.x, y: s.y, name: s.node, type: 'scatter' as const, mode: 'lines' as const,
    }))
    Plotly.react(ref.current, traces, {
      margin: { t: 20, r: 10, b: 40, l: 50 },
      xaxis: { title: '시간(초)' }, yaxis: { title: '혼잡도(인원수)' },
      showlegend: true,
    }, { responsive: true, displaylogo: false })
  }, [sim.history])

  const snap = sim.snapshot
  const total = snap ? snap.N.reduce((a, b) => a + b, 0) : 0
  return (
    <div className="dashboard">
      <div className="metrics">
        <span>현재 시각: {snap?.time_sec ?? 0}s</span>
        <span>총 재실: {total.toFixed(1)}</span>
        <span>누적 발생: {snap?.total_generated.toFixed(1) ?? 0}</span>
        <span>누적 이탈: {snap?.total_exited.toFixed(1) ?? 0}</span>
      </div>
      <div ref={ref} className="chart" style={{ width: '100%', height: 360 }} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- chartData`
Expected: PASS (2 tests). `npm run build`로 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/chartData.ts web/src/chartData.test.ts web/src/components/SimControls.tsx web/src/components/Dashboard.tsx
git commit -m "feat(web): 시뮬레이션 제어판 + Plotly 대시보드"
```

---

### Task 10: 내보내기 (CSV / 설정 JSON / GNN 번들)

워커를 통해 시계열 CSV, GNN 번들(인접/거리/소요시간/특성)을 받아 파일로 저장. 설정 JSON 저장/불러오기.

**Files:**
- Create: `web/src/components/ExportPanel.tsx`, `web/src/download.ts`
- Test: `web/src/download.test.ts`

**Interfaces:**
- Consumes: `useSimulation.ts`(`getClient`), `store.ts`, `file-saver`, `jszip`.
- Produces:
  - `download.ts`: `saveText(filename, text)`, `saveBlob(filename, blob)`, `bundleToZip(files: Record<string,string>): Promise<Blob>` (순수 로직 — JSZip으로 파일맵→Blob).
  - `ExportPanel.tsx`: `<ExportPanel sim={...} />` — "혼잡도 CSV", "GNN 번들(zip)", "설정 JSON 저장", "설정 불러오기" 버튼.

- [ ] **Step 1: Write the failing test**

Create `web/src/download.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { bundleToZip } from './download'

describe('bundleToZip', () => {
  it('packs files into a zip blob that can be re-read', async () => {
    const blob = await bundleToZip({ 'a.csv': 'hello', 'b.csv': 'world' })
    expect(blob).toBeInstanceOf(Blob)
    const zip = await JSZip.loadAsync(blob)
    expect(await zip.file('a.csv')!.async('string')).toBe('hello')
    expect(await zip.file('b.csv')!.async('string')).toBe('world')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- download`
Expected: FAIL — `Cannot find module './download'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/download.ts`:

```ts
import { saveAs } from 'file-saver'
import JSZip from 'jszip'

export function saveText(filename: string, text: string): void {
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename)
}

export function saveBlob(filename: string, blob: Blob): void {
  saveAs(blob, filename)
}

export async function bundleToZip(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'blob' })
}
```

Create `web/src/components/ExportPanel.tsx`:

```tsx
import { useRef } from 'react'
import { useStore } from '../store'
import { saveText, saveBlob, bundleToZip } from '../download'
import type { useSimulation } from '../useSimulation'
import type { ProjectConfig } from '../types'

export function ExportPanel({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const toProject = useStore((s) => s.toProject)
  const loadProject = useStore((s) => s.loadProject)
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportCsv() {
    await sim.runInstant()
    const csv = await sim.getClient().exportCsv('wide')
    saveText('congestion_timeseries.csv', csv)
  }

  async function exportGnn() {
    await sim.runInstant()
    const bundle = await sim.getClient().exportGnn()
    const files: Record<string, string> = {
      'adjacency.csv': bundle.adjacency,
      'distance.csv': bundle.distance,
      'travel_time.csv': bundle.travel_time,
      'node_features.csv': bundle.node_features,
    }
    saveBlob('gnn_bundle.zip', await bundleToZip(files))
  }

  function saveConfig() {
    saveText('station_config.json', JSON.stringify(toProject(), null, 2))
  }

  function onLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const project = JSON.parse(String(reader.result)) as ProjectConfig
        loadProject(project)
      } catch (err) { alert(`불러오기 실패: ${err}`) }
    }
    reader.readAsText(file)
  }

  return (
    <div className="export-panel">
      <strong>내보내기 / 설정</strong>
      <div className="row">
        <button onClick={() => void exportCsv()}>혼잡도 CSV</button>
        <button onClick={() => void exportGnn()}>GNN 번들(zip)</button>
        <button onClick={saveConfig}>설정 JSON 저장</button>
        <button onClick={() => fileRef.current?.click()}>설정 불러오기</button>
        <input ref={fileRef} type="file" accept="application/json"
          style={{ display: 'none' }} onChange={onLoadFile} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- download`
Expected: PASS (1 test). `npm run build`로 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/download.ts web/src/download.test.ts web/src/components/ExportPanel.tsx
git commit -m "feat(web): 내보내기(CSV/GNN/설정 JSON)"
```

---

### Task 11: 배치 실행 (N회 시드/파라미터 변주 → ZIP)

브라우저 안에서 동일 역 구성을 시드(및 선택적 파라미터 범위)를 바꿔가며 N회 실행, 각 회차 CSV + 공통 GNN 번들 + manifest를 ZIP으로 묶어 다운로드.

**Files:**
- Create: `web/src/batch.ts`, `web/src/components/BatchPanel.tsx`
- Test: `web/src/batch.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `client.ts`(`SimClient`).
- Produces:
  - `batch.ts`:
    - `buildRunConfigs(base: ProjectConfig, spec: BatchSpec): ProjectConfig[]` (순수: 시드 변주 + 선택적 파라미터 스윕으로 N개 ProjectConfig 생성. seed = spec.baseSeed + i. 파라미터 변주: 결정론적 의사난수 `mulberry32(seed)`로 범위 내 값 적용).
    - `BatchSpec` 타입: `{ runs: number; baseSeed: number; varyEntranceRate?: [number, number]; varyHeadway?: [number, number] }`.
    - `runBatch(client, base, spec, onProgress): Promise<Record<string,string>>` (각 config를 load→run_all→export_csv, files 맵 구성: `run_{i}_seed_{seed}.csv`; 1회차 graph로 GNN 번들 4개; `manifest.json`).
    - `mulberry32(seed): () => number` (재현 가능한 PRNG, 순수).
  - `BatchPanel.tsx`: `<BatchPanel sim={...} />` — runs/baseSeed/변주 범위 입력, 실행 버튼, 진행률, 완료 시 ZIP 저장.

- [ ] **Step 1: Write the failing test**

Create `web/src/batch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRunConfigs, mulberry32, type BatchSpec } from './batch'
import { makeNode } from './defaults'
import { defaultSimConfig } from './defaults'
import type { ProjectConfig } from './types'

function base(): ProjectConfig {
  const a = makeNode('entrance', 'A')
  a.generation = { kind: 'poisson', rate: 2.0 }
  return { graph: { nodes: [a], links: [] }, config: { ...defaultSimConfig(), seed: 0 } }
}

describe('batch', () => {
  it('mulberry32 is deterministic for same seed', () => {
    const r1 = mulberry32(7); const r2 = mulberry32(7)
    expect(r1()).toBe(r2())
  })

  it('builds N run configs with incrementing seeds', () => {
    const spec: BatchSpec = { runs: 3, baseSeed: 100 }
    const cfgs = buildRunConfigs(base(), spec)
    expect(cfgs).toHaveLength(3)
    expect(cfgs.map((c) => c.config.seed)).toEqual([100, 101, 102])
    expect(cfgs[0].config.stochastic).toBe(true) // 변주는 확률모드 강제
  })

  it('applies entrance-rate variation within range', () => {
    const spec: BatchSpec = { runs: 5, baseSeed: 0, varyEntranceRate: [1, 3] }
    const cfgs = buildRunConfigs(base(), spec)
    for (const c of cfgs) {
      const rate = c.graph.nodes[0].generation!.rate!
      expect(rate).toBeGreaterThanOrEqual(1)
      expect(rate).toBeLessThanOrEqual(3)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- batch`
Expected: FAIL — `Cannot find module './batch'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/batch.ts`:

```ts
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
    if (spec.varyEntranceRate || spec.varyHeadway) cfg.config.stochastic = true
    const rnd = mulberry32(seed)
    if (spec.varyEntranceRate) {
      const [lo, hi] = spec.varyEntranceRate
      const r = lo + rnd() * (hi - lo)
      for (const n of cfg.graph.nodes) {
        if (n.type === 'entrance' && n.generation && (n.generation.kind === 'poisson' || n.generation.kind === 'constant')) {
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
```

Create `web/src/components/BatchPanel.tsx`:

```tsx
import { useState } from 'react'
import { useStore } from '../store'
import { runBatch, type BatchSpec } from '../batch'
import { bundleToZip, saveBlob } from '../download'
import { validateGraph } from '../validation'
import type { useSimulation } from '../useSimulation'

export function BatchPanel({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const toProject = useStore((s) => s.toProject)
  const [runs, setRuns] = useState(10)
  const [baseSeed, setBaseSeed] = useState(0)
  const [varyRate, setVaryRate] = useState(false)
  const [varyHeadway, setVaryHeadway] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  async function go() {
    const project = toProject()
    const errs = validateGraph(project.graph)
    if (errs.length) { alert(`검증 오류:\n${errs.join('\n')}`); return }
    const spec: BatchSpec = {
      runs, baseSeed,
      varyEntranceRate: varyRate ? [1, 3] : undefined,
      varyHeadway: varyHeadway ? [180, 420] : undefined,
    }
    setBusy(true); setDone(0)
    try {
      await sim.prepare() // 워커 init 보장
      const files = await runBatch(sim.getClient(), project, spec, (d) => setDone(d))
      saveBlob(`batch_${runs}runs.zip`, await bundleToZip(files))
    } catch (e) { alert(`배치 실패: ${e}`) } finally { setBusy(false) }
  }

  return (
    <div className="batch-panel">
      <strong>배치 생성(GNN 학습셋)</strong>
      <div className="row">
        <label>실행 횟수<input type="number" value={runs} onChange={(e) => setRuns(parseInt(e.target.value, 10))} /></label>
        <label>기준 시드<input type="number" value={baseSeed} onChange={(e) => setBaseSeed(parseInt(e.target.value, 10))} /></label>
      </div>
      <div className="row">
        <label><input type="checkbox" checked={varyRate} onChange={(e) => setVaryRate(e.target.checked)} /> 출입구 발생률 변주(1~3)</label>
        <label><input type="checkbox" checked={varyHeadway} onChange={(e) => setVaryHeadway(e.target.checked)} /> 배차간격 변주(180~420s)</label>
      </div>
      <button onClick={() => void go()} disabled={busy}>
        {busy ? `실행 중 ${done}/${runs}` : 'N회 실행 → ZIP 다운로드'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- batch`
Expected: PASS (3 tests). `npm run build`로 타입체크 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add web/src/batch.ts web/src/batch.test.ts web/src/components/BatchPanel.tsx
git commit -m "feat(web): 배치 실행(N회 변주) + ZIP 내보내기"
```

---

### Task 12: 예제 템플릿 + 앱 레이아웃 조립 + 스타일

예제 역 구성을 제공하고, 모든 컴포넌트를 App에 배치하며 기본 스타일을 적용.

**Files:**
- Create: `web/src/templates.ts`, `web/src/styles.css`
- Modify: `web/src/App.tsx`
- Test: `web/src/templates.test.ts`

**Interfaces:**
- Consumes: 모든 이전 컴포넌트, `validation.ts`, `store.ts`.
- Produces:
  - `templates.ts`: `SAMPLE_TEMPLATES: { name: string; project: ProjectConfig }[]` (최소 1개: 입구→게이트→승강장 + 출구, 검증 통과). `loadTemplate(name)` 헬퍼.
  - `App.tsx`: 좌(팔레트+에디터) / 중(대시보드+제어) / 우(인스펙터+검증+내보내기+배치) 레이아웃. 템플릿 드롭다운.

- [ ] **Step 1: Write the failing test**

Create `web/src/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SAMPLE_TEMPLATES } from './templates'
import { validateGraph } from './validation'

describe('templates', () => {
  it('has at least one template and all pass validation', () => {
    expect(SAMPLE_TEMPLATES.length).toBeGreaterThan(0)
    for (const t of SAMPLE_TEMPLATES) {
      expect(validateGraph(t.project.graph)).toEqual([])
    }
  })
  it('sample has source(entrance) and sink behaviors', () => {
    const g = SAMPLE_TEMPLATES[0].project.graph
    expect(g.nodes.some((n) => n.type === 'entrance')).toBe(true)
    expect(g.nodes.some((n) => n.type === 'platform')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- templates`
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/src/templates.ts`:

```ts
import type { ProjectConfig } from './types'
import { makeNode, makeLink, defaultSimConfig } from './defaults'

function smallStation(): ProjectConfig {
  // 입구A -> 게이트G -> 승강장P(탑승 sink) ; 승강장 하차객 -> 게이트G -> 출구X(이탈)
  const A = makeNode('entrance', 'A'); A.name = '입구'
  A.base_stay_prob = 0.2; A.exit_weight = 0
  A.generation = { kind: 'poisson', rate: 1.5 }
  const G = makeNode('gate', 'G'); G.name = '게이트'; G.base_stay_prob = 0.3
  const P = makeNode('platform', 'P'); P.name = '승강장'
  P.base_stay_prob = 0.5; P.exit_weight = 0
  P.train = { first_arrival_sec: 60, headway_sec: 300, jitter_sigma_sec: 5,
    capacity: 150, alight_kind: 'poisson', alight_mean: 80, alight_std: 0 }
  const X = makeNode('entrance', 'X'); X.name = '출구'
  X.base_stay_prob = 0.2; X.exit_weight = 1.0; X.generation = null

  // A -> G (전량 진입)
  const ag = makeLink('A', 'G'); ag.distance = 30; ag.weight = 1.0
  // G -> P (진입객) 와 G -> X (하차객 출구) : G 출력 2개 weight 합 1
  const gp = makeLink('G', 'P'); gp.distance = 40; gp.weight = 0.5
  const gx = makeLink('G', 'X'); gx.distance = 30; gx.weight = 0.5
  // P -> G (하차객이 게이트로 되돌아 나감)
  const pg = makeLink('P', 'G'); pg.distance = 40; pg.weight = 1.0

  return {
    graph: { nodes: [A, G, P, X], links: [ag, gp, gx, pg] },
    config: { ...defaultSimConfig(), duration_seconds: 1800, dt_seconds: 5 },
  }
}

export const SAMPLE_TEMPLATES: { name: string; project: ProjectConfig }[] = [
  { name: '소형 역 (입구-게이트-승강장-출구)', project: smallStation() },
]
```

> 검증 주의: G는 출력 gp(0.5)+gx(0.5)=1.0, exit_weight=0 → 합 1 ✓. A는 ag(1.0)+exit0=1 ✓. P는 pg(1.0)+exit0=1 ✓. X는 출력 없음+exit_weight 1.0 → 합 1 ✓. 모두 통과.

Replace `web/src/App.tsx`:

```tsx
import { useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import './styles.css'
import { useStore } from './store'
import { useSimulation } from './useSimulation'
import { GraphEditor } from './components/GraphEditor'
import { NodePalette } from './components/NodePalette'
import { NodeInspector } from './components/NodeInspector'
import { LinkInspector } from './components/LinkInspector'
import { ValidationBanner } from './components/ValidationBanner'
import { SimControls } from './components/SimControls'
import { Dashboard } from './components/Dashboard'
import { ExportPanel } from './components/ExportPanel'
import { BatchPanel } from './components/BatchPanel'
import { SAMPLE_TEMPLATES } from './templates'

export default function App() {
  const [selNode, setSelNode] = useState<string | null>(null)
  const [selLink, setSelLink] = useState<number | null>(null)
  const loadProject = useStore((s) => s.loadProject)
  const sim = useSimulation()

  return (
    <ReactFlowProvider>
      <div className="app">
        <header>
          <h1>철도역사 혼잡도 합성데이터 시뮬레이터</h1>
          <select onChange={(e) => {
            const t = SAMPLE_TEMPLATES.find((x) => x.name === e.target.value)
            if (t) loadProject(t.project)
          }} defaultValue="">
            <option value="" disabled>예제 템플릿 불러오기…</option>
            {SAMPLE_TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </header>
        <div className="layout">
          <section className="left">
            <NodePalette onAdded={(id) => { setSelNode(id); setSelLink(null) }} />
            <GraphEditor
              selectedNodeId={selNode} selectedLinkIndex={selLink}
              onSelectNode={setSelNode} onSelectLink={setSelLink}
            />
          </section>
          <section className="center">
            <SimControls sim={sim} />
            <Dashboard sim={sim} />
          </section>
          <section className="right">
            <ValidationBanner />
            {selNode && <NodeInspector nodeId={selNode} />}
            {selLink !== null && <LinkInspector index={selLink} />}
            <ExportPanel sim={sim} />
            <BatchPanel sim={sim} />
          </section>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
```

Create `web/src/styles.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: #1a1a1a; }
.app { display: flex; flex-direction: column; height: 100vh; }
header { display: flex; gap: 16px; align-items: center; padding: 8px 16px; background: #0f2a4a; color: #fff; }
header h1 { font-size: 18px; margin: 0; }
.layout { display: grid; grid-template-columns: 1fr 1fr 360px; flex: 1; min-height: 0; }
.left, .center, .right { padding: 8px; overflow: auto; border-right: 1px solid #ddd; }
.left { display: flex; flex-direction: column; }
.graph-editor { flex: 1; border: 1px solid #ddd; border-radius: 6px; }
.palette-buttons, .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
button { padding: 6px 10px; border: 1px solid #2a5; background: #eafaef; border-radius: 4px; cursor: pointer; }
button.danger { border-color: #c33; background: #fdeaea; }
.field, label { display: flex; flex-direction: column; font-size: 12px; gap: 2px; margin: 4px 0; }
input, select { padding: 4px; }
.inspector, .export-panel, .batch-panel { border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin: 8px 0; }
.validation { padding: 8px; border-radius: 6px; margin: 8px 0; font-size: 13px; }
.validation.ok { background: #eafaef; color: #161; }
.validation.err { background: #fdeaea; color: #911; white-space: pre-wrap; }
.metrics { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; margin-bottom: 8px; }
progress { width: 200px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- templates`
Expected: PASS (2 tests). 전체 테스트 `npm test` 통과, `npm run build` 성공(타입체크 + 번들).

- [ ] **Step 5: Commit**

```bash
git add web/src/templates.ts web/src/templates.test.ts web/src/App.tsx web/src/styles.css
git commit -m "feat(web): 예제 템플릿 + 앱 레이아웃/스타일 조립"
```

---

### Task 13: 브라우저 통합 스모크 테스트 (Playwright)

실제 브라우저에서 앱이 뜨고, 예제 템플릿 로드 → 즉시 실행 → 차트/지표가 갱신되는지 확인(Pyodide 실동작 검증).

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/smoke.spec.ts`
- Modify: `web/package.json` (devDependency `@playwright/test`, script `test:e2e`)

**Interfaces:**
- Consumes: 빌드된 앱(`vite preview` 또는 dev 서버).
- Produces: `npm run test:e2e` — 헤드리스 브라우저로 앱 로드, 템플릿 선택, "즉시 실행" 클릭, 지표의 "누적 발생"이 0보다 커짐을 확인.

- [ ] **Step 1: Write the failing test**

Create `web/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('앱 로드 → 템플릿 → 즉시 실행 → 데이터 생성', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /시뮬레이터/ })).toBeVisible()
  // 예제 템플릿 로드
  await page.getByRole('combobox').first().selectOption({ index: 1 })
  // 즉시 실행 (Pyodide 로드 포함하여 시간이 걸릴 수 있음)
  await page.getByRole('button', { name: /즉시 실행/ }).click()
  // 누적 발생이 0보다 커질 때까지 대기 (Pyodide 초기 로드 여유 60s)
  await expect(page.getByText(/누적 발생: /)).not.toHaveText(/누적 발생: 0(\.0)?$/, { timeout: 60000 })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm i -D @playwright/test && npx playwright install chromium && npm run build && npm run test:e2e`
Expected: FAIL initially (config/script absent).

- [ ] **Step 3: Write minimal implementation**

Add to `web/package.json` scripts: `"test:e2e": "playwright test"` and devDependency `"@playwright/test": "^1.47.0"`.

Create `web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    timeout: 120000,
    reuseExistingServer: false,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm run test:e2e`
Expected: PASS (1 test). Pyodide가 CDN에서 로드되므로 네트워크 필요.

> 네트워크가 막힌 CI에서는 이 테스트를 `test:e2e`로 분리해 선택 실행한다(기본 `npm test`에는 포함하지 않음).

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/e2e/smoke.spec.ts web/package.json
git commit -m "test(web): Playwright 브라우저 스모크 테스트"
```

---

### Task 14: GitHub Pages 배포 워크플로

`web/`를 빌드하여 GitHub Pages로 배포하는 Actions. `base`를 리포 경로로 설정.

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `web/public/.nojekyll`
- Modify: `docs/superpowers/plans/2026-06-19-web-frontend.md` (배포 URL 메모 — 실행자가 채움)

**Interfaces:**
- Produces: main 브랜치 push 시 `web/dist`를 Pages로 배포하는 워크플로. `VITE_BASE`를 `/<repo>/`로 주입.

- [ ] **Step 1: Write the failing test**

이 Task는 자동화 테스트 대신 빌드 검증으로 대체한다. 먼저 로컬에서 base를 적용해 빌드가 성공하는지 확인:

Run: `cd web && VITE_BASE=/railway-sim/ npm run build`
Expected: 성공 시 `dist/index.html`의 자산 경로가 `/railway-sim/`로 시작. (실패하면 워크플로 작성 전 수정)

- [ ] **Step 2: Verify current state**

`.github/workflows/deploy.yml`이 아직 없음 → Pages 자동배포 불가(수동 확인).

- [ ] **Step 3: Write minimal implementation**

Create `web/public/.nojekyll` (빈 파일):

```
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy web to GitHub Pages

on:
  push:
    branches: [main, master]
    paths: ['web/**', 'sim/**', '.github/workflows/deploy.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Derive base path
        id: base
        run: echo "base=/${GITHUB_REPOSITORY##*/}/" >> "$GITHUB_OUTPUT"
      - name: Install & build
        working-directory: web
        env:
          VITE_BASE: ${{ steps.base.outputs.base }}
        run: |
          npm ci
          npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> 주의: `npm ci`는 `web/package-lock.json`을 요구한다(Task 2에서 커밋됨). `copy-sim`은 `npm run build`가 호출(package.json scripts). 저장소 Settings→Pages에서 Source를 "GitHub Actions"로 설정해야 한다(실행자가 1회 수동 설정).

- [ ] **Step 4: Verify build with base**

Run: `cd web && VITE_BASE=/test/ npm run build && grep -q '/test/' dist/index.html && echo OK`
Expected: `OK` (자산 경로에 base 반영).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml web/public/.nojekyll
git commit -m "ci(web): GitHub Pages 배포 워크플로"
```

---

## 완료 기준 (Definition of Done)

- `python -m pytest -q` 전체 통과(코어 + webapi).
- `cd web && npm test` 전체 통과(단위/컴포넌트 테스트).
- `cd web && npm run build` 성공(타입체크 + 정적 번들 생성).
- (네트워크 가능 시) `npm run test:e2e` 통과 — 브라우저에서 Pyodide 실행, 템플릿→즉시실행→데이터 생성 확인.
- GitHub Actions로 Pages 배포 가능(Settings→Pages: Source=GitHub Actions 설정 후).
- 기능: 노드-링크 GUI 편집, 실시간 대시보드, 배속/일시정지/스텝/리셋, CSV·GNN 내보내기, N회 배치→ZIP, 예제 템플릿, 설정 저장/불러오기 동작.

## 요구사항 추적 (설계 §대비)

| 요구사항 | Task |
|---|---|
| 웹 기반(Pyodide)·Python 코어 구동 | 1, 5 |
| GitHub Pages 정적 배포 | 2, 14 |
| GUI 노드-링크 입력 | 7 |
| 노드/링크 속성 편집(발생/열차/Weidmann/exit) | 8 |
| 체류+이동=1, 출력가중치 합=1 검증·정규화 | 3, 4, 8 |
| 시뮬레이션 시간/Δt/배속/일시정지/스텝/리셋 | 6, 9 |
| 실시간 대시보드(차트/지표) | 9 |
| CSV 출력 | 1, 10 |
| GNN(STGCN) 번들 | 1, 10 |
| N회 배치 변주 → ZIP | 11 |
| 설정 저장/불러오기 + 예제 템플릿 | 4, 10, 12 |
| Web Worker(메인 스레드 비차단) | 5, 6 |

## 스코프 제외(YAGNI)

- 그래프 위 실시간 히트맵(노드 색=혼잡도)은 차트로 충분하다고 보고 1차 범위에서 제외(추후 React Flow 노드 색상 바인딩으로 확장 가능).
- 서버측 저장/계정/공유 — 정적 호스팅 원칙상 제외(설정 JSON 파일 입출력으로 대체).
- 동적 링크 혼잡 — 계획1과 동일(노드 체류확률로 표현).
