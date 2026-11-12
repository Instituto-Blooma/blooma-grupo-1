export type HospitalProfile = 'enfermagem' | 'farmacia';

export const PROFILE_LABEL: Record<HospitalProfile, string> = {
  enfermagem: 'Enfermagem',
  farmacia: 'Farmácia',
};
