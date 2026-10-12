import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import {
  chooseRestLength,
  clearRestLengthError,
  getRestLengthState,
  reconcileRestLength,
  subscribeRestLength,
} from '../restLengthSync'

/**
 * Rest timer length: this device's value, kept in line with the profile's
 * `rest_seconds` (see restLengthSync for the rules).
 */
export function useRestLength() {
  const qc = useQueryClient()
  const state = useSyncExternalStore(subscribeRestLength, getRestLengthState)
  const { data: profile } = useQuery<{ rest_seconds?: number | null }>({
    queryKey: ['profile'],
    queryFn: () => api.get('/profile'),
  })

  // Unsynced or pre-sync lengths are sent once per mount, when the profile first loads
  const firstLoad = useRef(true)
  useEffect(() => {
    if (profile === undefined) return
    reconcileRestLength(qc, profile?.rest_seconds, firstLoad.current)
    firstLoad.current = false
  }, [profile, qc])

  return {
    restLength: state.restLength,
    unsynced: state.unsynced,
    saving: state.saving,
    saveError: state.error,
    chooseRestLength: (seconds: number) => chooseRestLength(qc, seconds),
    clearSaveError: clearRestLengthError,
  }
}
