import { Link } from 'react-router-dom'
import { usePanels } from '@/hooks/usePanels'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores } from '@/hooks/useFluorophores'
import { useInstruments } from '@/hooks/useInstruments'
import { useSecondaries } from '@/hooks/useSecondaries'
import { usePlateMaps } from '@/hooks/usePlateMaps'

function StatCard({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="rounded-lg bg-surface p-4">
      {value === null ? (
        <div className="animate-pulse rounded bg-gray-200 dark:bg-gray-700 h-8 w-16 mb-1" />
      ) : (
        <p className="text-3xl font-bold text-foreground">{value}</p>
      )}
      <p className="text-sm text-foreground-muted">{label}</p>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  active,
  children,
}: {
  icon: string
  title: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={
        'rounded-lg border bg-white dark:bg-gray-800 p-5 shadow-sm ' +
        (active
          ? 'border-l-4 border-l-blue-500 border-gray-200 dark:border-gray-700'
          : 'border-gray-200 dark:border-gray-700 opacity-60')
      }
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl" aria-hidden="true">{icon}</span>
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ComingSoon() {
  return (
    <span className="inline-block rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs font-medium text-foreground-muted">
      Coming Soon
    </span>
  )
}

export default function Homepage() {
  const panelsQuery = usePanels(0, 500)
  const antibodiesQuery = useAntibodies({})
  const fluorophoresQuery = useFluorophores({})
  const instrumentsQuery = useInstruments(0, 500)
  const secondariesQuery = useSecondaries({})
  const plateMapsQuery = usePlateMaps(0, 1)

  const panelCount = panelsQuery.data?.total ?? null
  const antibodyCount = antibodiesQuery.data?.total ?? null
  const fluorophoreCount = fluorophoresQuery.data?.total ?? null
  const instrumentCount = instrumentsQuery.data?.total ?? null
  const secondaryCount = secondariesQuery.data?.total ?? null
  const plateMapCount = plateMapsQuery.data?.total ?? null

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Welcome to Lab Tools</h1>
        <p className="mt-1 text-foreground-muted">Your experiment design workspace</p>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SectionCard icon="🔬" title="Flow Cytometry" active>
          <div className="space-y-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
            {panelCount === null ? (
              <div className="animate-pulse rounded bg-gray-200 dark:bg-gray-700 h-4 w-24" />
            ) : (
              <p>{panelCount} panel{panelCount !== 1 ? 's' : ''}</p>
            )}
            {antibodyCount === null ? (
              <div className="animate-pulse rounded bg-gray-200 dark:bg-gray-700 h-4 w-28 mt-1" />
            ) : (
              <p>{antibodyCount} antibod{antibodyCount !== 1 ? 'ies' : 'y'}</p>
            )}
            {secondaryCount === null ? (
              <div className="animate-pulse rounded bg-gray-200 dark:bg-gray-700 h-4 w-28 mt-1" />
            ) : (
              <p>{secondaryCount} secondar{secondaryCount !== 1 ? 'ies' : 'y'}</p>
            )}
          </div>
          <Link
            to="/flow/panels"
            className="inline-flex items-center gap-1 rounded bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 text-sm font-medium"
          >
            Open Panels →
          </Link>
        </SectionCard>

        <SectionCard icon="🧫" title="Plate Maps" active>
          <div className="space-y-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
            {plateMapCount === null ? (
              <div className="animate-pulse rounded bg-gray-200 dark:bg-gray-700 h-4 w-24" />
            ) : (
              <p>{plateMapCount} plate map{plateMapCount !== 1 ? 's' : ''}</p>
            )}
          </div>
          <Link
            to="/plate-maps"
            className="inline-flex items-center gap-1 rounded bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 text-sm font-medium"
          >
            Open Plate Maps →
          </Link>
        </SectionCard>

        <SectionCard icon="🔬" title="IF / IHC" active={false}>
          <ComingSoon />
        </SectionCard>

        <SectionCard icon="🧬" title="qPCR" active={false}>
          <ComingSoon />
        </SectionCard>
      </div>

      {/* Quick Stats */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Quick Stats
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard value={antibodyCount} label="Antibodies" />
          <StatCard value={fluorophoreCount} label="Fluorophores" />
          <StatCard value={panelCount} label="Panels" />
          <StatCard value={instrumentCount} label="Instruments" />
          <StatCard value={plateMapCount} label="Plate Maps" />
        </div>
      </div>

      {/* Recent Activity (placeholder) */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground-muted">
          Recent Activity
        </h2>
        <div className="rounded-lg border border-border bg-elevated px-5 py-8 text-center">
          <p className="text-sm text-foreground-muted">
            No recent activity yet. Start by creating a panel or importing antibodies.
          </p>
        </div>
      </div>
    </div>
  )
}
