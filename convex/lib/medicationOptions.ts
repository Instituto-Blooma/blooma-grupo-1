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
  em_separacao: 'Em separação',
  enviado: 'Enviado',
  recebido: 'Recebido',
  recusado: 'Recusado',
};

export const REFUSAL_REASONS = [
  'Medicamento em falta',
  'Dose fora do padrão',
  'Via de administração incorreta',
  'Solicitação incompleta',
] as const;

export function isFinishedStatus(status: RequestStatus) {
  return status === 'recebido' || status === 'recusado';
}
