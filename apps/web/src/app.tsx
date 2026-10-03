import { Shell } from '@core/ui';
import { lazy, Suspense, useState } from 'react';

/**
 * Each module's screens are a chunk of their own, fetched the first time the
 * module opens, so the shell's first load stays small (NFR-24). The module
 * registry (FR-07) replaces this fixed list.
 */
const MODULES = [
  {
    id: 'devtools',
    name: 'Dev Tools',
    Screen: lazy(() => import('@devtools/web')),
  },
  {
    id: 'fiscus',
    name: 'Fiscus',
    Screen: lazy(() => import('@fiscus/web')),
  },
  { id: 'pdf', name: 'PDF Tools', Screen: lazy(() => import('@pdf/web')) },
] as const;

type ModuleId = (typeof MODULES)[number]['id'];

export function App() {
  const [activeId, setActiveId] = useState<ModuleId>('devtools');
  const active = MODULES.find((module) => module.id === activeId) ?? MODULES[0];

  return (
    <Shell
      nav={
        <ul>
          {MODULES.map((module) => (
            <li key={module.id}>
              <button
                type="button"
                aria-current={module.id === activeId ? 'page' : undefined}
                onClick={() => setActiveId(module.id)}
              >
                {module.name}
              </button>
            </li>
          ))}
        </ul>
      }
    >
      <Suspense fallback={<p>Loading…</p>}>
        <active.Screen />
      </Suspense>
    </Shell>
  );
}
