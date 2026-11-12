import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Check, ClipboardPlus, PackageCheck, Truck, XCircle } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import {
  MEDICATION_ROUTES,
  PHARMACEUTICAL_FORMS,
  STATUS_LABEL,
  URGENCY_LABEL,
  type RequestStatus,
  type Urgency,
} from '../../../../convex/lib/medicationOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  StatusBadge,
  URGENCY_STYLE,
  UrgencyBadge,
  errorMessage,
  formatDateTime,
  formatElapsed,
  formatLocation,
  isTrackedByNursing,
  isUnseenRejection,
  matchesBedFilter,
  medicationSummary,
  requestTitle,
  type BedFilterValue,
  type MedicationRequest,
  type SectorWithBeds,
} from './shared';

/** Big tappable tile used on the profile dashboards. */
export function BigActionButton({
  icon: Icon,
  title,
  description,
  onClick,
  testId,
}: {
  readonly icon: typeof Truck;
  readonly title: string;
  readonly description: ReactNode;
  readonly onClick: () => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border-2 bg-card p-8 text-center text-card-foreground shadow-sm transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
    >
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-10 w-10" />
      </span>
      <span className="text-2xl font-semibold">{title}</span>
      <span className="text-muted-foreground">{description}</span>
    </button>
  );
}

export function NursingDashboard({
  onRequest,
  onTrack,
  activeCount,
  rejectedCount,
}: {
  readonly onRequest: () => void;
  readonly onTrack: () => void;
  readonly activeCount: number;
  readonly rejectedCount: number;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <BigActionButton
        icon={ClipboardPlus}
        title="Solicitar medicamento"
        description="Preencher um novo pedido para a farmácia."
        onClick={onRequest}
        testId="nursing-request"
      />
      <BigActionButton
        icon={Truck}
        title="Acompanhar entregas"
        description={
          <>
            {activeCount === 1
              ? '1 solicitação em andamento.'
              : `${activeCount} solicitações em andamento.`}
            {rejectedCount > 0 ? (
              <span className="mt-2 block font-semibold text-red-700 dark:text-red-300">
                {rejectedCount === 1
                  ? '1 solicitação rejeitada aguardando leitura'
                  : `${rejectedCount} solicitações rejeitadas aguardando leitura`}
              </span>
            ) : null}
          </>
        }
        onClick={onTrack}
        testId="nursing-track"
      />
    </div>
  );
}

const URGENCY_HINT: Record<Urgency, string> = {
  urgente: 'Risco imediato ao paciente',
  prioritario: 'Precisa ser atendido logo',
  rotina: 'Pode seguir a ordem normal',
};

type FormState = {
  sectorId: Id<'sectors'> | null;
  bedId: Id<'beds'> | null;
  medication: string;
  concentration: string;
  pharmaceuticalForm: string;
  dose: string;
  route: string;
  quantity: string;
  urgency: Urgency | null;
  /** Value of the datetime-local input ("2026-11-12T14:30"), or '' for "sem prazo". */
  deadline: string;
  notes: string;
};

function Field({
  id,
  label,
  optional = false,
  children,
}: {
  readonly id?: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-base">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (opcional)</span> : null}
      </Label>
      {children}
    </div>
  );
}

/** Full-page request form; starts with the sector/bed currently selected in the filter. */
export function RequestForm({
  organizationId,
  sectors,
  preset,
  onCancel,
  onCreated,
}: {
  readonly organizationId: string;
  readonly sectors: ReadonlyArray<SectorWithBeds>;
  readonly preset: BedFilterValue;
  readonly onCancel: () => void;
  readonly onCreated: () => void;
}) {
  const createRequest = useMutation(api.medications.createRequest);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({
    sectorId: preset.sectorId,
    bedId: preset.bedId,
    medication: '',
    concentration: '',
    pharmaceuticalForm: '',
    dose: '',
    route: '',
    quantity: '1',
    urgency: null,
    deadline: '',
    notes: '',
  }));

  const sector = sectors.find((item) => item._id === form.sectorId) ?? null;
  const bed = sector?.beds.find((item) => item._id === form.bedId) ?? null;
  const quantity = Number(form.quantity);
  // datetime-local values are in the browser's local time zone.
  const deadline = form.deadline ? new Date(form.deadline).getTime() : null;
  const isDeadlineInPast = deadline !== null && deadline < Date.now();

  const missing: string[] = [];
  if (!bed) missing.push('setor e leito');
  if (!form.medication.trim()) missing.push('nome do medicamento');
  if (!form.concentration.trim()) missing.push('concentração');
  if (!form.pharmaceuticalForm) missing.push('forma farmacêutica');
  if (!form.dose.trim()) missing.push('dose');
  if (!form.route) missing.push('via de administração');
  if (!Number.isInteger(quantity) || quantity < 1) missing.push('quantidade');
  if (!form.urgency) missing.push('urgência');
  if (deadline !== null && Number.isNaN(deadline)) missing.push('data e horário válidos');

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing.length > 0 || isDeadlineInPast || !sector || !bed || !form.urgency) {
      return;
    }
    setIsSaving(true);
    try {
      const created = await createRequest({
        organizationId,
        bedId: bed._id,
        medication: form.medication,
        concentration: form.concentration,
        pharmaceuticalForm: form.pharmaceuticalForm,
        dose: form.dose,
        route: form.route,
        quantity,
        urgency: form.urgency,
        deadline: deadline ?? undefined,
        notes: form.notes.trim() ? form.notes : undefined,
      });
      toast.success(
        `Solicitação ${created.number} enviada para a farmácia (${formatLocation(sector.name, bed.label)})`
      );
      onCreated();
    } catch (error) {
      toast.error(errorMessage(error));
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-3xl space-y-6 rounded-2xl border bg-card p-6 shadow-sm"
      data-testid="request-form"
    >
      <div>
        <h2 className="font-serif text-2xl font-semibold">Solicitar medicamento</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="form-setor" label="Setor">
          <Select
            value={form.sectorId ?? undefined}
            onValueChange={(value) =>
              setForm((current) => ({ ...current, sectorId: value as Id<'sectors'>, bedId: null }))
            }
          >
            <SelectTrigger id="form-setor" className="h-11">
              <SelectValue placeholder="Escolha o setor" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  Setor: {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="form-leito" label="Leito">
          <Select
            value={form.bedId ?? undefined}
            disabled={!sector}
            onValueChange={(value) => update('bedId', value as Id<'beds'>)}
          >
            <SelectTrigger id="form-leito" className="h-11">
              <SelectValue placeholder={sector ? 'Escolha o leito' : 'Escolha o setor antes'} />
            </SelectTrigger>
            <SelectContent>
              {sector?.beds.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {sector && bed ? (
        <p className="-mt-2 rounded-md bg-muted px-3 py-2 font-medium">
          Destino: {formatLocation(sector.name, bed.label)}
        </p>
      ) : null}

      <Field id="form-medicamento" label="Nome do medicamento">
        <Input
          id="form-medicamento"
          className="h-11"
          value={form.medication}
          onChange={(event) => update('medication', event.target.value)}
          placeholder="Ex.: Dipirona"
          autoComplete="off"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="form-concentracao" label="Concentração">
          <Input
            id="form-concentracao"
            className="h-11"
            value={form.concentration}
            onChange={(event) => update('concentration', event.target.value)}
            placeholder="Ex.: 500 mg/ml"
            autoComplete="off"
          />
        </Field>
        <Field id="form-forma" label="Forma farmacêutica">
          <Select
            value={form.pharmaceuticalForm || undefined}
            onValueChange={(value) => update('pharmaceuticalForm', value)}
          >
            <SelectTrigger id="form-forma" className="h-11">
              <SelectValue placeholder="Ex.: comprimido, injetável" />
            </SelectTrigger>
            <SelectContent>
              {PHARMACEUTICAL_FORMS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="form-dose" label="Dose">
          <Input
            id="form-dose"
            className="h-11"
            value={form.dose}
            onChange={(event) => update('dose', event.target.value)}
            placeholder="Ex.: 2 ml, 1 comprimido"
            autoComplete="off"
          />
        </Field>
        <Field id="form-via" label="Via de administração">
          <Select value={form.route || undefined} onValueChange={(value) => update('route', value)}>
            <SelectTrigger id="form-via" className="h-11">
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {MEDICATION_ROUTES.map((route) => (
                <SelectItem key={route} value={route}>
                  {route}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="form-quantidade" label="Quantidade">
          <Input
            id="form-quantidade"
            className="h-11"
            type="number"
            min={1}
            max={999}
            step={1}
            value={form.quantity}
            onChange={(event) => update('quantity', event.target.value)}
          />
        </Field>
      </div>

      <Field label="Urgência">
        <RadioGroup
          value={form.urgency ?? ''}
          onValueChange={(value) => update('urgency', value as Urgency)}
          className="grid gap-3 sm:grid-cols-3"
        >
          {(Object.keys(URGENCY_LABEL) as Urgency[]).map((urgency) => (
            <Label
              key={urgency}
              htmlFor={`form-urgencia-${urgency}`}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 font-normal transition-colors',
                form.urgency === urgency ? URGENCY_STYLE[urgency].ring : 'border-muted'
              )}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <RadioGroupItem id={`form-urgencia-${urgency}`} value={urgency} />
                <span className={cn('h-3 w-3 rounded-full', URGENCY_STYLE[urgency].dot)} />
                {URGENCY_LABEL[urgency]}
              </span>
              <span className="text-sm text-muted-foreground">{URGENCY_HINT[urgency]}</span>
            </Label>
          ))}
        </RadioGroup>
      </Field>

      <Field id="form-prazo" label="Data e horário limite" optional>
        <div className="flex flex-wrap gap-2">
          <Input
            id="form-prazo"
            type="datetime-local"
            className="h-11 sm:w-72"
            value={form.deadline}
            onChange={(event) => update('deadline', event.target.value)}
          />
          {form.deadline ? (
            <Button type="button" variant="ghost" onClick={() => update('deadline', '')}>
              Sem prazo
            </Button>
          ) : null}
        </div>
        <p
          className={
            isDeadlineInPast
              ? 'text-sm font-medium text-red-700 dark:text-red-300'
              : 'text-sm text-muted-foreground'
          }
        >
          {isDeadlineInPast
            ? 'Esse horário já passou. Escolha um horário futuro ou deixe sem prazo.'
            : 'Dentro do mesmo nível de urgência, a farmácia atende primeiro o prazo mais próximo.'}
        </p>
      </Field>

      <Field id="form-observacao" label="Observação" optional>
        <Textarea
          id="form-observacao"
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Recado para a farmácia"
          rows={2}
        />
      </Field>

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-end">
        {missing.length > 0 ? (
          <p className="text-sm text-muted-foreground sm:mr-auto">
            Falta preencher: {missing.join(', ')}
          </p>
        ) : null}
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={missing.length > 0 || isDeadlineInPast || isSaving}
          data-testid="submit-request"
        >
          {isSaving ? 'Enviando...' : 'Enviar para a farmácia'}
        </Button>
      </div>
    </form>
  );
}

const PROGRESS_STEPS: ReadonlyArray<RequestStatus> = [
  'solicitado',
  'em_separacao',
  'enviado',
  'recebido',
];

function DeliveryProgress({ status }: { readonly status: RequestStatus }) {
  const reached = PROGRESS_STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {PROGRESS_STEPS.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          {index > 0 ? <span className="text-muted-foreground">→</span> : null}
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5',
              index < reached && 'text-muted-foreground line-through decoration-1',
              index === reached && 'bg-primary font-semibold text-primary-foreground',
              index > reached && 'text-muted-foreground'
            )}
          >
            {STATUS_LABEL[step]}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Nursing: requests still on their way ("Confirmar recebimento" once sent), plus rejected
 * requests shown first in red until someone clicks "Ciente".
 */
export function TrackDeliveries({
  organizationId,
  requests,
  filter,
  now,
}: {
  readonly organizationId: string;
  readonly requests: ReadonlyArray<MedicationRequest>;
  readonly filter: BedFilterValue;
  readonly now: number;
}) {
  const confirmReceived = useMutation(api.medications.confirmReceived);
  const acknowledgeRefusal = useMutation(api.medications.acknowledgeRefusal);
  const tracked = requests.filter(
    (request) => isTrackedByNursing(request) && matchesBedFilter(request, filter)
  );
  const rejected = tracked.filter(isUnseenRejection);
  const inProgress = tracked.filter((request) => !isUnseenRejection(request));

  const handleConfirm = (request: MedicationRequest) => {
    confirmReceived({ organizationId, requestId: request._id })
      .then(() => toast.success(`${requestTitle(request)}: recebimento confirmado`))
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const handleAcknowledge = (request: MedicationRequest) => {
    acknowledgeRefusal({ organizationId, requestId: request._id })
      .then(() => toast.success(`${requestTitle(request)} movida para o Histórico`))
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Acompanhar entregas</h2>
      </div>

      {rejected.length > 0 ? (
        <ul className="space-y-3" aria-label="Solicitações rejeitadas">
          {rejected.map((request) => (
            <li
              key={request._id}
              className="space-y-3 rounded-xl border-2 border-red-500 bg-red-50 p-4 dark:bg-red-950/40"
              data-testid="rejected-request"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="text-lg font-semibold">{requestTitle(request)}</span>
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    Rejeitada pela farmácia
                  </span>
                  <UrgencyBadge urgency={request.urgency} />
                </div>
                <span className="text-sm text-muted-foreground">
                  Pedido {formatElapsed(request.createdAt, now)}
                </span>
              </div>
              <div>
                <p className="font-medium">
                  {formatLocation(request.sectorName, request.bedLabel)}
                </p>
                <p className="text-muted-foreground">
                  {medicationSummary(request)} · {request.quantity}{' '}
                  {request.quantity === 1 ? 'unidade' : 'unidades'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-red-800 dark:text-red-200">
                  Justificativa: {request.refusalReason ?? 'não informada'}
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-red-400"
                  onClick={() => handleAcknowledge(request)}
                  data-testid="acknowledge-refusal"
                >
                  <Check className="mr-2 h-5 w-5" />
                  Ciente
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {inProgress.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma solicitação em andamento neste filtro.
        </div>
      ) : (
        <ul className="space-y-3">
          {inProgress.map((request) => (
            <li
              key={request._id}
              className={cn(
                'space-y-3 rounded-xl border-2 bg-card p-4',
                request.status === 'enviado' ? 'border-primary' : 'border-border'
              )}
              data-testid="tracked-request"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">{requestTitle(request)}</span>
                  <UrgencyBadge urgency={request.urgency} />
                  <StatusBadge status={request.status} />
                </div>
                <span className="text-sm text-muted-foreground">
                  Pedido {formatElapsed(request.createdAt, now)}
                  {request.deadline ? ` · prazo ${formatDateTime(request.deadline, now)}` : ''}
                </span>
              </div>
              <div>
                <p className="font-medium">
                  {formatLocation(request.sectorName, request.bedLabel)}
                </p>
                <p className="text-muted-foreground">
                  {medicationSummary(request)} · {request.quantity}{' '}
                  {request.quantity === 1 ? 'unidade' : 'unidades'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DeliveryProgress status={request.status} />
                {request.status === 'enviado' ? (
                  <Button
                    size="lg"
                    onClick={() => handleConfirm(request)}
                    data-testid="confirm-received"
                  >
                    <PackageCheck className="mr-2 h-5 w-5" />
                    Confirmar recebimento
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
