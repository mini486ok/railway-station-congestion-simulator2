# Named User Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add localStorage-backed named user templates that appear in the template dropdown alongside built-in sample templates.

**Architecture:** Create a pure-logic module (`userTemplates.ts`) for localStorage CRUD, add Vitest unit tests, then wire up the React UI in `App.tsx` with two `<optgroup>` elements — "기본 예제" for built-ins, "내 템플릿" for user-saved entries. Prefix option values (`user:<name>` vs `builtin:<name>`) to avoid name collision.

**Tech Stack:** TypeScript, React (useState), Vitest (jsdom), localStorage API, Zustand (useStore.toProject), existing styles.css `.row`/button classes.

## Global Constraints

- Branch: `feature/revision-1`
- Working directory for all commands: `C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/web`
- Test runner: `npm test` (Vitest, jsdom environment, globals:true)
- Build: `npm run build` (TypeScript strict mode)
- localStorage key: `railway-sim-user-templates-v1`
- All localStorage access wrapped in try/catch; failures return `[]` or no-op
- Report file: `C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/.superpowers/sdd/rev1-templates.md`
- Commit staged via: `git add web/src && git commit -m "feat(web): 명명 사용자 템플릿 저장/불러오기(localStorage)"`

---

### Task 1: Create userTemplates.ts + unit tests (RED → GREEN)

**Files:**
- Create: `web/src/userTemplates.ts`
- Create: `web/src/userTemplates.test.ts`

**Interfaces:**
- Consumes: `ProjectConfig` from `./types`, `defaultSimConfig` from `./defaults`
- Produces:
  - `NamedTemplate { name: string; project: ProjectConfig }`
  - `listUserTemplates(): NamedTemplate[]`
  - `saveUserTemplate(name: string, project: ProjectConfig): NamedTemplate[]`
  - `deleteUserTemplate(name: string): NamedTemplate[]`

- [ ] **Step 1: Write the failing test file**

Create `web/src/userTemplates.test.ts` with these exact contents:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { listUserTemplates, saveUserTemplate, deleteUserTemplate } from './userTemplates'
import { defaultSimConfig } from './defaults'

const proj = () => ({ graph: { nodes: [], links: [] }, config: defaultSimConfig() })
beforeEach(() => localStorage.clear())

describe('userTemplates', () => {
  it('starts empty', () => {
    expect(listUserTemplates()).toEqual([])
  })
  it('saves and lists', () => {
    saveUserTemplate('내역', proj())
    const list = listUserTemplates()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('내역')
  })
  it('overwrites same name', () => {
    saveUserTemplate('A', proj())
    const l = saveUserTemplate('A', proj())
    expect(l).toHaveLength(1)
  })
  it('deletes', () => {
    saveUserTemplate('A', proj())
    const l = deleteUserTemplate('A')
    expect(l).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/web" && npm test -- userTemplates
```

Expected output: FAIL — `Cannot find module './userTemplates'`

- [ ] **Step 3: Implement userTemplates.ts**

Create `web/src/userTemplates.ts`:

```ts
import type { ProjectConfig } from './types'

export interface NamedTemplate { name: string; project: ProjectConfig }

const KEY = 'railway-sim-user-templates-v1'

export function listUserTemplates(): NamedTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw) as NamedTemplate[]
  } catch {
    return []
  }
}

export function saveUserTemplate(name: string, project: ProjectConfig): NamedTemplate[] {
  try {
    const existing = listUserTemplates().filter((t) => t.name !== name)
    const updated = [...existing, { name, project }]
    localStorage.setItem(KEY, JSON.stringify(updated))
    return updated
  } catch {
    return listUserTemplates()
  }
}

export function deleteUserTemplate(name: string): NamedTemplate[] {
  try {
    const updated = listUserTemplates().filter((t) => t.name !== name)
    localStorage.setItem(KEY, JSON.stringify(updated))
    return updated
  } catch {
    return listUserTemplates()
  }
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/web" && npm test -- userTemplates
```

Expected output: 4 tests PASS in `userTemplates.test.ts`

- [ ] **Step 5: Run full test suite — all pass**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/web" && npm test
```

Expected: all existing tests still pass (previously ~30 tests).

---

### Task 2: Wire UI in App.tsx

**Files:**
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes:
  - `listUserTemplates(): NamedTemplate[]` from `./userTemplates`
  - `saveUserTemplate(name, project): NamedTemplate[]` from `./userTemplates`
  - `deleteUserTemplate(name): NamedTemplate[]` from `./userTemplates`
  - `useStore((s) => s.toProject)` — already available in store
  - `SAMPLE_TEMPLATES`, `loadTemplate` — already imported
  - `loadProject` — already in useStore

- [ ] **Step 1: Update imports in App.tsx**

Replace the existing import block at the top of `web/src/App.tsx`:

Old:
```ts
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
```

New:
```ts
import { SAMPLE_TEMPLATES, loadTemplate } from './templates'
import { listUserTemplates, saveUserTemplate, deleteUserTemplate } from './userTemplates'
import type { NamedTemplate } from './userTemplates'
```

- [ ] **Step 2: Add state and selector inside App() function**

In `App.tsx`, inside the `export default function App()` body, after the existing `const loadProject = useStore(...)` line, add:

```ts
const toProject = useStore((s) => s.toProject)
const [userTemplates, setUserTemplates] = useState<NamedTemplate[]>(listUserTemplates)
const [selectedValue, setSelectedValue] = useState<string>('')
```

- [ ] **Step 3: Replace the template `<select>` in the JSX**

Find the existing `<select>` block in the `<header>`:

```tsx
<select onChange={(e) => {
  const project = loadTemplate(e.target.value)
  if (project) loadProject(project)
}} defaultValue="">
  <option value="" disabled>예제 템플릿 불러오기…</option>
  {SAMPLE_TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
</select>
```

Replace it with:

```tsx
<div className="row" style={{ gap: '6px', alignItems: 'center' }}>
  <select
    value={selectedValue}
    onChange={(e) => {
      const val = e.target.value
      setSelectedValue(val)
      if (val.startsWith('builtin:')) {
        const name = val.slice('builtin:'.length)
        const project = loadTemplate(name)
        if (project) loadProject(project)
      } else if (val.startsWith('user:')) {
        const name = val.slice('user:'.length)
        const tmpl = userTemplates.find((t) => t.name === name)
        if (tmpl) loadProject(tmpl.project)
      }
    }}
  >
    <option value="" disabled>예제 템플릿 불러오기…</option>
    <optgroup label="기본 예제">
      {SAMPLE_TEMPLATES.map((t) => (
        <option key={t.name} value={`builtin:${t.name}`}>{t.name}</option>
      ))}
    </optgroup>
    {userTemplates.length > 0 && (
      <optgroup label="내 템플릿">
        {userTemplates.map((t) => (
          <option key={t.name} value={`user:${t.name}`}>{t.name}</option>
        ))}
      </optgroup>
    )}
  </select>
  <button
    onClick={() => {
      const name = prompt('템플릿 이름을 입력하세요')
      if (name && name.trim()) {
        setUserTemplates(saveUserTemplate(name.trim(), toProject()))
        setSelectedValue(`user:${name.trim()}`)
      }
    }}
    title="현재 구성을 템플릿으로 저장"
  >
    저장
  </button>
  {selectedValue.startsWith('user:') && (
    <button
      onClick={() => {
        const name = selectedValue.slice('user:'.length)
        if (confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) {
          setUserTemplates(deleteUserTemplate(name))
          setSelectedValue('')
        }
      }}
      title="선택한 내 템플릿 삭제"
    >
      ✕
    </button>
  )}
</div>
```

- [ ] **Step 4: Run full test suite**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/web" && npm test
```

Expected: all tests pass (now 34 total, including 4 new userTemplates tests).

- [ ] **Step 5: Run build to verify TypeScript**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/web" && npm run build
```

Expected: zero TypeScript errors, build succeeds.

---

### Task 3: Commit + Write report

**Files:**
- Modify: `C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/.superpowers/sdd/rev1-templates.md`

- [ ] **Step 1: Stage and commit**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)" && git add web/src && git commit -m "feat(web): 명명 사용자 템플릿 저장/불러오기(localStorage)"
```

Expected: commit succeeds, shows `web/src/userTemplates.ts` and `web/src/userTemplates.test.ts` as new files, `web/src/App.tsx` as modified.

- [ ] **Step 2: Record commit SHA**

```bash
cd "C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)" && git log --oneline -1
```

Note the SHA for the report.

- [ ] **Step 3: Write report to .superpowers/sdd/rev1-templates.md**

Write the file at `C:/업무자료/claude_project/202606_철도역사 혼잡도 합성데이터 생성 시뮬레이터 개발(superpowers)/.superpowers/sdd/rev1-templates.md`:

```markdown
# rev1-templates: 명명 사용자 템플릿

## Changes
- **web/src/userTemplates.ts** (신규): localStorage CRUD — listUserTemplates / saveUserTemplate / deleteUserTemplate. 모든 접근 try/catch로 보호. 동일 이름 덮어쓰기 지원.
- **web/src/userTemplates.test.ts** (신규): Vitest 4개 테스트 — 초기 비어있음, 저장+목록, 동일이름 덮어쓰기, 삭제.
- **web/src/App.tsx** (수정): useState로 userTemplates 관리, <select>를 두 <optgroup>으로 교체(기본예제/내템플릿), 저장 버튼, 선택된 사용자 템플릿 삭제 ✕ 버튼 추가.

## Test + Build
- npm test: 전체 34개 PASS (신규 4개 포함)
- npm run build: TypeScript 오류 없음

## Commit
- SHA: [기록된 커밋 SHA]
- Subject: feat(web): 명명 사용자 템플릿 저장/불러오기(localStorage)

## Self-Review
- localStorage 실패 시 [] 반환으로 안전 처리 확인
- option value 접두어(user:/builtin:)로 이름 충돌 방지 확인
- 사용자 템플릿 없을 때 <optgroup> 숨김 처리 확인
- toProject()는 Zustand selector로 리렌더마다 최신 상태 반영
- prompt/confirm 사용으로 별도 모달 없이 단순 UX 유지
```

---

## Self-Review Against Spec

**Spec coverage:**
1. ✅ `userTemplates.ts` with `listUserTemplates`, `saveUserTemplate`, `deleteUserTemplate` — Task 1
2. ✅ `NamedTemplate` interface exported — Task 1
3. ✅ localStorage key `railway-sim-user-templates-v1` — Task 1
4. ✅ try/catch on all localStorage access — Task 1
5. ✅ Same-name overwrites (no duplicates) — Task 1
6. ✅ 4 Vitest unit tests with beforeEach localStorage.clear() — Task 1
7. ✅ `userTemplates` React state initialized from `listUserTemplates()` — Task 2
8. ✅ Two `<optgroup>` labels "기본 예제" and "내 템플릿" — Task 2
9. ✅ User optgroup only rendered if non-empty — Task 2
10. ✅ Option values prefixed `user:` / `builtin:` — Task 2
11. ✅ Lookup user templates first, else built-in — Task 2 (via value prefix)
12. ✅ "현재 구성을 템플릿으로 저장" button with prompt — Task 2
13. ✅ Delete ✕ button appears only when user template selected — Task 2
14. ✅ `toProject()` imported via useStore — Task 2
15. ✅ Commit message exact match — Task 3
16. ✅ Report written to `.superpowers/sdd/rev1-templates.md` — Task 3

**Placeholder scan:** No TBD, no "similar to Task N", all code blocks complete.

**Type consistency:**
- `NamedTemplate` defined in Task 1, used in Task 2 as `useState<NamedTemplate[]>` ✅
- `saveUserTemplate` returns `NamedTemplate[]`, assigned to `setUserTemplates` ✅
- `deleteUserTemplate` returns `NamedTemplate[]`, assigned to `setUserTemplates` ✅
- `toProject` typed as `() => ProjectConfig` from store ✅
