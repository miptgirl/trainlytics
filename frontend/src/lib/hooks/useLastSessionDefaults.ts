import { useQueries, type QueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { LastSessionDefaults } from '../strengthSession'

const key = (exerciseId: string) => ['last-session-defaults', exerciseId] as const
const fetchDefaults = (exerciseId: string) =>
  api.get<LastSessionDefaults>(`/exercises/${exerciseId}/last-session-defaults`)

/** Last-session sets per exercise id (missing while loading or on error). */
export function useLastSessionDefaults(exerciseIds: string[]): Map<string, LastSessionDefaults> {
  const ids = [...new Set(exerciseIds.filter(Boolean))]
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: key(id),
      queryFn: () => fetchDefaults(id),
      staleTime: Infinity,
      retry: false,
    })),
    combine: (results) => {
      const map = new Map<string, LastSessionDefaults>()
      results.forEach((r, i) => {
        if (r.data) map.set(ids[i], r.data)
      })
      return map
    },
  })
}

/** Same data for one exercise outside render (e.g. when adding it); null on error. */
export async function fetchLastSessionDefaults(
  qc: QueryClient,
  exerciseId: string,
): Promise<LastSessionDefaults | null> {
  try {
    return await qc.fetchQuery({ queryKey: key(exerciseId), queryFn: () => fetchDefaults(exerciseId), staleTime: Infinity })
  } catch {
    return null
  }
}
