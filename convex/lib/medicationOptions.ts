// Shared by the Convex functions and the client so labels and allowed values stay in sync.

export const MEDICATION_ROUTES = [
  'Oral',
  'Intravenosa',
  'Intramuscular',
  'Subcutânea',
  'Sublingual',
  'Inalatória',
  'Tópica',
  'Retal',
] as const;

export const PHARMACEUTICAL_FORMS = [
  'Comprimido',
  'Cápsula',
  'Injetável',
  'Solução oral',
  'Suspensão oral',
  'Gotas',
  'Xarope',
  'Pomada / creme',
  'Spray / aerossol',
  'Supositório',
  'Adesivo',
  'Pó para reconstituição',
] as const;

export type Urgency = 'urgente' | 'prioritario' | 'rotina';

export const URGENCY_RANK: Record<Urgency, number> = {
  urgente: 0,
  prioritario: 1,
  rotina: 2,
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  urgente: 'Urgente',
  prioritario: 'Prioritário',
  rotina: 'Rotina',
};

export type RequestStatus = 'solicitado' | 'em_separacao' | 'enviado' | 'recebido' | 'recusado';

export const STATUS_LABEL: Record<RequestStatus, string> = {
  solicitado: 'Solicitado',
  em_separacao: 'Em preparação',
  enviado: 'Enviado',
  recebido: 'Recebido',
  recusado: 'Rejeitado',
};

export const REFUSAL_REASONS = [
  'Medicamento em falta',
  'Dose fora do padrão',
  'Via de administração incorreta',
  'Solicitação incompleta',
] as const;

/** Device ids are random UUIDs generated in the browser. */
export const MAX_DEVICE_ID_LENGTH = 64;

export function isFinishedStatus(status: RequestStatus) {
  return status === 'recebido' || status === 'recusado';
}
