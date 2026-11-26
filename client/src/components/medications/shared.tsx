import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import {
  PRESCRIPTION_TYPE,
  type ControlledList,
} from '../../../../convex/lib/controlledSubstances';
import {
  STATUS_LABEL,
  URGENCY_LABEL,
  type RequestStatus,
  type Urgency,
} from '../../../../convex/lib/medicationOptions';
import { AlertTriangle, Snowflake } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type SectorWithBeds = {
  _id: Id<'sectors'>;
  name: string;
  beds: ReadonlyArray<{ _id: Id<'beds'>; label: string }>;
};

export type MedicationRequest = {
  _id: Id<'medicationRequests'>;
  number: number | null;
  /** Position inside the prescription (1..itemCount); single-medication requests are 1 of 1. */
  itemIndex: number;
  itemCount: number;
  requesterName: string | null;
  requesterCoren: string | null;
  sectorId: Id<'sectors'>;
  bedId: Id<'beds'>;
  sectorName: string;
  bedLabel: string;
  medication: string;
  concentration: string | null;
  pharmaceuticalForm: string | null;
  acceptedByDevice: string | null;
  acceptedByName: string | null;
  /** Pharmacy marked it as refrigerated when sending: keep it in the refrigerator. */
  refrigerated: boolean;
  /** Back in the pharmacy queue after nursing reported a delivery error. */
  needsRedelivery: boolean;
  deliveryErrors: ReadonlyArray<DeliveryError>;
  acceptedByCrf: string | null;
  /** Portaria 344 list ("B1", "C1"...) when the medication is controlled. */
  controlledList: string | null;
  prescriptionNumber: string | null;
  prescriberName: string | null;
  prescriberCrm: string | null;
  refusalAcknowledgedAt: number | null;
  quantity: number;
  dose: string;
  route: string;
  urgency: Urgency;
  notes: string | null;
  deadline: number | null;
  status: RequestStatus;
  refusalReason: string | null;
  createdAt: number;
  updatedAt: number;
  separationStartedAt: number | null;
  sentAt: number | null;
  receivedAt: number | null;
  refusedAt: number | null;
};

export const URGENCY_STYLE: Record<Urgency, { badge: string; dot: string; ring: string }> = {
  urgente: {
    badge:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
    dot: 'bg-red-500',
    ring: 'border-red-500 bg-red-50 dark:bg-red-950/40',
  },
  prioritario: {
    badge:
      'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
    dot: 'bg-amber-400',
    ring: 'border-amber-400 bg-amber-50 dark:bg-amber-950/40',
  },
  rotina: {
    badge:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
    dot: 'bg-emerald-500',
    ring: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
  },
};

export const STATUS_STYLE: Record<RequestStatus, string> = {
  solicitado: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
  em_separacao: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  enviado: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  recebido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  recusado: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

export type DeliveryError = {
  reason: string;
  reportedAt: number;
  sentAt?: number;
  acceptedByName?: string;
};

export function RefrigeratedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
      data-testid="refrigerated-badge"
    >
      <Snowflake className="h-3.5 w-3.5" aria-hidden="true" />
      Refrigerado: guardar na geladeira
    </span>
  );
}

/** Purple notice for a medication that came back to the pharmacy after a delivery error. */
export function DeliveryErrorNotice({
  request,
  now,
}: {
  readonly request: MedicationRequest;
  readonly now: number;
}) {
  const last = request.deliveryErrors.at(-1);
  if (!request.needsRedelivery || !last) {
    return null;
  }
  return (
    <p
      className="flex items-start gap-2 rounded-lg border-2 border-purple-400 bg-purple-50 p-2 text-sm font-medium text-purple-900 dark:bg-purple-950/50 dark:text-purple-100"
      data-testid="delivery-error-notice"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Erro na entrega reportado pela enfermagem {formatDateTime(last.reportedAt, now)}:{' '}
        {last.reason}
      </span>
    </p>
  );
}

export function UrgencyBadge({ urgency }: { readonly urgency: Urgency }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold',
        URGENCY_STYLE[urgency].badge
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', URGENCY_STYLE[urgency].dot)} />
      {URGENCY_LABEL[urgency]}
    </span>
  );
}

export function StatusBadge({ status }: { readonly status: RequestStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
        STATUS_STYLE[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Always spell out sector and bed so "Leito 03" of one sector is never confused with another. */
export function formatLocation(sectorName: string, bedLabel: string) {
  return `Setor: ${sectorName} · ${bedLabel}`;
}

/** "Solicitação 12" — the fixed number nursing and pharmacy both use to refer to a request. */
export function requestTitle(request: Pick<MedicationRequest, 'number'>) {
  return request.number ? `Solicitação ${request.number}` : 'Solicitação sem número';
}

/** "Solicitação 12" or, inside a multi-medication prescription, "Solicitação 12 · item 2 de 3". */
export function itemTitle(request: Pick<MedicationRequest, 'number' | 'itemIndex' | 'itemCount'>) {
  const title = requestTitle(request);
  return request.itemCount > 1
    ? `${title} · item ${request.itemIndex} de ${request.itemCount}`
    : title;
}

export function medicationCountLabel(count: number) {
  return count === 1 ? '1 medicamento' : `${count} medicamentos`;
}

/** Hospital identification number as shown: "nº 10234" (older entries keep their own text). */
export function identificationText(value: string) {
  return /^\d/.test(value) ? `nº ${value}` : value;
}

/** "Ana Paula Ribeiro · nº 10234" (hospital identification number), or null for old requests. */
export function requesterLabel(
  request: Pick<MedicationRequest, 'requesterName' | 'requesterCoren'>
) {
  if (!request.requesterName) {
    return null;
  }
  return request.requesterCoren
    ? `${request.requesterName} · ${identificationText(request.requesterCoren)}`
    : request.requesterName;
}

/** One prescription ("Solicitação N") and its medications, in the order they were listed. */
export type Prescription = {
  key: string;
  number: number | null;
  sectorId: Id<'sectors'>;
  bedId: Id<'beds'>;
  sectorName: string;
  bedLabel: string;
  requesterName: string | null;
  requesterCoren: string | null;
  createdAt: number;
  items: MedicationRequest[];
};

/**
 * Groups items into prescriptions. Prescriptions keep the order in which their first item
 * appears in `requests` (callers pass the queue order, so a prescription sits at the position of
 * its most urgent item); items inside a prescription are sorted by their position.
 */
export function groupPrescriptions(requests: ReadonlyArray<MedicationRequest>) {
  const groups = new Map<string, Prescription>();
  for (const request of requests) {
    const key = request.number === null ? `id-${request._id}` : `n-${request.number}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(request);
      continue;
    }
    groups.set(key, {
      key,
      number: request.number,
      sectorId: request.sectorId,
      bedId: request.bedId,
      sectorName: request.sectorName,
      bedLabel: request.bedLabel,
      requesterName: request.requesterName,
      requesterCoren: request.requesterCoren,
      createdAt: request.createdAt,
      items: [request],
    });
  }
  const result = [...groups.values()];
  for (const prescription of result) {
    prescription.items.sort((left, right) => left.itemIndex - right.itemIndex);
  }
  return result;
}

/** Every field the nursing team filled in, as label/value rows (the "ficha"). */
/** Pharmacy professional who accepted the medication: "Nome · nº 20871". */
export function acceptedByLabel(
  request: Pick<MedicationRequest, 'acceptedByName' | 'acceptedByCrf'>
) {
  if (!request.acceptedByName) {
    return null;
  }
  return request.acceptedByCrf
    ? `${request.acceptedByName} · ${identificationText(request.acceptedByCrf)}`
    : request.acceptedByName;
}

/** Prescription of a controlled medication: "Notificação de Receita B (azul) nº 123 · Dr. X · nº 30417". */
export function prescriptionLabel(request: MedicationRequest) {
  if (!request.controlledList) {
    return null;
  }
  const type = PRESCRIPTION_TYPE[request.controlledList as ControlledList] ?? 'Receita';
  return [
    `${type} nº ${request.prescriptionNumber ?? '—'}`,
    request.prescriberName,
    request.prescriberCrm ? identificationText(request.prescriberCrm) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function requestFields(request: MedicationRequest, now: number) {
  const prescription = prescriptionLabel(request);
  const acceptedBy = acceptedByLabel(request);
  return [
    { label: 'Setor e leito', value: formatLocation(request.sectorName, request.bedLabel) },
    { label: 'Medicamento', value: request.medication },
    { label: 'Concentração', value: request.concentration ?? '—' },
    { label: 'Forma farmacêutica', value: request.pharmaceuticalForm ?? '—' },
    { label: 'Dose prescrita', value: request.dose },
    { label: 'Via de administração', value: request.route },
    {
      label: 'Quantidade',
      value: `${request.quantity} ${request.quantity === 1 ? 'unidade' : 'unidades'}`,
    },
    {
      label: 'Data e horário limite',
      value: request.deadline ? formatDateTime(request.deadline, now) : 'Sem prazo',
    },
    { label: 'Observação', value: request.notes ?? '—' },
    ...(prescription ? [{ label: 'Receita (controlado)', value: prescription }] : []),
    ...(request.refrigerated
      ? [{ label: 'Conservação', value: 'Refrigerado: guardar na geladeira' }]
      : []),
    { label: 'Solicitado por', value: requesterLabel(request) ?? 'Não informado' },
    ...(acceptedBy ? [{ label: 'Aceito na farmácia por', value: acceptedBy }] : []),
  ];
}

/** Compact one-line summary: "Dipirona 500 mg/ml · Injetável · 2 ml · Intravenosa". */
export function medicationSummary(request: MedicationRequest) {
  return [
    `${request.medication}${request.concentration ? ` ${request.concentration}` : ''}`,
    request.pharmaceuticalForm,
    request.dose,
    request.route,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Re-renders every 30 s so "há 5 min" labels stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function formatElapsed(since: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - since) / 60_000));
  if (minutes < 1) {
    return 'agora';
  }
  if (minutes < 60) {
    return `há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `há ${hours} h ${rest} min` : `há ${hours} h`;
}

/** "11/11 às 14:30", or "hoje às 14:30" for today. */
export function formatDateTime(value: number, now: number) {
  const date = new Date(value);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date(now).toDateString()) {
    return `hoje às ${time}`;
  }
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${day} às ${time}`;
}

/** Duration between two steps, e.g. "12 min" or "1 h 05 min". */
export function formatDuration(from: number, to: number) {
  const minutes = Math.max(0, Math.round((to - from) / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = String(minutes % 60).padStart(2, '0');
  return `${hours} h ${rest} min`;
}

export function useHospitalData(organizationId: string) {
  const sectors = useQuery(api.medications.listSectorsWithBeds, { organizationId });
  const requests = useQuery(api.medications.listRequests, { organizationId });
  return { sectors, requests };
}

const ALL = 'todos';

export type BedFilterValue = { sectorId: Id<'sectors'> | null; bedId: Id<'beds'> | null };

export function matchesBedFilter(request: MedicationRequest, filter: BedFilterValue) {
  if (filter.sectorId && request.sectorId !== filter.sectorId) {
    return false;
  }
  if (filter.bedId && request.bedId !== filter.bedId) {
    return false;
  }
  return true;
}

/** Sector first, then a bed of that sector. */
export function BedFilter({
  sectors,
  value,
  onChange,
}: {
  readonly sectors: ReadonlyArray<SectorWithBeds>;
  readonly value: BedFilterValue;
  readonly onChange: (next: BedFilterValue) => void;
}) {
  const sector = sectors.find((item) => item._id === value.sectorId) ?? null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="bed-filter">
      <div className="flex flex-col gap-1.5 sm:w-64">
        <Label htmlFor="filtro-setor">Filtrar por setor</Label>
        <Select
          value={value.sectorId ?? ALL}
          onValueChange={(next) =>
            onChange({ sectorId: next === ALL ? null : (next as Id<'sectors'>), bedId: null })
          }
        >
          <SelectTrigger id="filtro-setor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os setores</SelectItem>
            {sectors.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                Setor: {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5 sm:w-64">
        <Label htmlFor="filtro-leito">Filtrar por leito</Label>
        <Select
          value={value.bedId ?? ALL}
          disabled={!sector}
          onValueChange={(next) =>
            onChange({
              sectorId: value.sectorId,
              bedId: next === ALL ? null : (next as Id<'beds'>),
            })
          }
        >
          <SelectTrigger id="filtro-leito">
            <SelectValue placeholder="Escolha um setor primeiro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {sector ? `Todos os leitos de ${sector.name}` : 'Escolha um setor primeiro'}
            </SelectItem>
            {sector?.beds.map((bed) => (
              <SelectItem key={bed._id} value={bed._id}>
                {formatLocation(sector.name, bed.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Convex wraps server errors ("... Uncaught Error: <message>"); show only the message. */
export function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Algo deu errado';
  }
  const match = /Uncaught Error: ([^\n]+)/.exec(error.message);
  return match?.[1] ?? error.message;
}

/** Rejected and not yet marked "Ciente" by nursing. */
export function isUnseenRejection(request: MedicationRequest) {
  return request.status === 'recusado' && request.refusalAcknowledgedAt === null;
}

/** What nursing sees in "Acompanhar entregas": in progress, plus rejections not yet seen. */
export function isTrackedByNursing(request: MedicationRequest) {
  return (
    request.status === 'solicitado' ||
    request.status === 'em_separacao' ||
    request.status === 'enviado' ||
    isUnseenRejection(request)
  );
}
