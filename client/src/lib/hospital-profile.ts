import { useCallback, useEffect, useState } from 'react';

export type HospitalProfile = 'enfermagem' | 'farmacia';

export const PROFILE_LABEL: Record<HospitalProfile, string> = {
  enfermagem: 'Enfermagem',
  farmacia: 'Farmácia',
};

function storageKey(organizationId: string) {
  return `hackablooma:perfil:${organizationId}`;
}

function readStoredProfile(organizationId: string): HospitalProfile | null {
  try {
    const value = window.localStorage.getItem(storageKey(organizationId));
    return value === 'enfermagem' || value === 'farmacia' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The profile (Enfermagem or Farmácia) chosen after signing in with the hospital account.
 * Remembered per hospital on this device; `null` means the picker should be shown.
 */
export function useHospitalProfile(organizationId: string) {
  const [profile, setProfileState] = useState<HospitalProfile | null>(() =>
    readStoredProfile(organizationId)
  );

  useEffect(() => {
    setProfileState(readStoredProfile(organizationId));
  }, [organizationId]);

  const setProfile = useCallback(
    (next: HospitalProfile | null) => {
      setProfileState(next);
      try {
        if (next) {
          window.localStorage.setItem(storageKey(organizationId), next);
        } else {
          window.localStorage.removeItem(storageKey(organizationId));
        }
      } catch {
        // Private mode or blocked storage: the choice just lasts until reload.
      }
    },
    [organizationId]
  );

  return [profile, setProfile] as const;
}
