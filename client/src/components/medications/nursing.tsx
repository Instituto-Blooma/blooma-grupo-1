import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  ClipboardPlus,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import {
  DELIVERY_ERROR_REASONS,
  MEDICATION_ROUTES,
  PHARMACEUTICAL_FORMS,
  STATUS_LABEL,
  URGENCY_LABEL,
  isFinishedStatus,
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
import { findControlledSubstance } from '../../../../convex/lib/controlledSubstances';
import { MedicationNameInput } from './medication-name-input';
import {
  DeliveryErrorNotice,
  RefrigeratedBadge,
  StatusBadge,
  URGENCY_STYLE,
  acceptedByLabel,
  UrgencyBadge,
  errorMessage,
  formatDateTime,
  formatElapsed,
  formatLocation,
  groupPrescriptions,
  isTrackedByNursing,
  isUnseenRejection,
  matchesBedFilter,
  medicationCountLabel,
  medicationSummary,
  requestTitle,
  requesterLabel,
  type BedFilterValue,
  type MedicationRequest,
  type Prescription,
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
  /** Prescriptions still in progress. */
  readonly activeCount: number;
  /** Medications rejected and not yet marked "Ciente". */
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
                  ? '1 medicamento rejeitado aguardando leitura'
                  : `${rejectedCount} medicamentos rejeitados aguardando leitura`}
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

type ItemState = {
  key: number;
  medication: string;
  /** Prescription data, required only for controlled medications (Portaria 344). */
  prescriptionNumber: string;
  prescriberName: string;
  prescriberCrm: string;
  concentration: string;
  pharmaceuticalForm: string;
  dose: string;
  route: string;
  quantity: string;
  urgency: Urgency | null;
  /** Value of the datetime-local input ("2026-11-20T14:30"), or '' for "sem prazo". */
  deadline: string;
  notes: string;
};

let nextItemKey = 1;

function emptyItem(): ItemState {
  nextItemKey += 1;
  return {
    key: nextItemKey,
    medication: '',
    prescriptionNumber: '',
    prescriberName: '',
    prescriberCrm: '',
    concentration: '',
    pharmaceuticalForm: '',
    dose: '',
    route: '',
    quantity: '1',
    urgency: null,
    deadline: '',
    notes: '',
  };
}

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

/** Missing fields of one medication, in the order they appear on screen. */
function missingInItem(item: ItemState) {
  const missing: string[] = [];
  const quantity = Number(item.quantity);
  if (!item.medication.trim()) missing.push('nome do medicamento');
  if (findControlledSubstance(item.medication)) {
    if (!item.prescriptionNumber.trim()) missing.push('número da receita');
    if (!item.prescriberName.trim()) missing.push('nome do médico');
    if (!item.prescriberCrm.trim()) missing.push('nº de identificação do médico');
  }
  if (!item.concentration.trim()) missing.push('concentração');
  if (!item.pharmaceuticalForm) missing.push('forma farmacêutica');
  if (!item.dose.trim()) missing.push('dose prescrita');
  if (!item.route) missing.push('via de administração');
  if (!Number.isInteger(quantity) || quantity < 1) missing.push('quantidade');
  if (!item.urgency) missing.push('urgência');
  if (item.deadline && Number.isNaN(new Date(item.deadline).getTime())) {
    missing.push('data e horário válidos');
  }
  return missing;
}

function isDeadlineInPast(item: ItemState) {
  if (!item.deadline) return false;
  const value = new Date(item.deadline).getTime();
  return !Number.isNaN(value) && value < Date.now();
}

function MedicationFields({
  item,
  idPrefix,
  onChange,
}: {
  readonly item: ItemState;
  readonly idPrefix: string;
  readonly onChange: <K extends keyof ItemState>(key: K, value: ItemState[K]) => void;
}) {
  const pastDeadline = isDeadlineInPast(item);
  const controlled = findControlledSubstance(item.medication);
  return (
    <div className="space-y-5">
      <Field id={`${idPrefix}-medicamento`} label="Nome do medicamento">
        <MedicationNameInput
          id={`${idPrefix}-medicamento`}
          value={item.medication}
          onChange={(value) => onChange('medication', value)}
        />
      </Field>

      {controlled ? (
        <fieldset
          className="space-y-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 dark:bg-amber-950/40"
          data-testid="prescription-fields"
        >
          <legend className="px-1 font-semibold">Receita (medicamento controlado)</legend>
          <p className="font-medium">
            Lista {controlled.list} da Portaria 344: exige {controlled.prescriptionType}.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id={`${idPrefix}-receita-numero`} label="Número da receita">
              <Input
                id={`${idPrefix}-receita-numero`}
                className="h-11 bg-background"
                value={item.prescriptionNumber}
                onChange={(event) => onChange('prescriptionNumber', event.target.value)}
                autoComplete="off"
                maxLength={80}
              />
            </Field>
            <Field id={`${idPrefix}-receita-medico`} label="Nome do médico">
              <Input
                id={`${idPrefix}-receita-medico`}
                className="h-11 bg-background"
                value={item.prescriberName}
                onChange={(event) => onChange('prescriberName', event.target.value)}
                autoComplete="off"
                maxLength={80}
              />
            </Field>
            <Field id={`${idPrefix}-receita-crm`} label="Nº de identificação do médico">
              <Input
                id={`${idPrefix}-receita-crm`}
                className="h-11 bg-background"
                value={item.prescriberCrm}
                onChange={(event) => onChange('prescriberCrm', event.target.value)}
                autoComplete="off"
                maxLength={80}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-concentracao`} label="Concentração">
          <Input
            id={`${idPrefix}-concentracao`}
            className="h-11"
            value={item.concentration}
            onChange={(event) => onChange('concentration', event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id={`${idPrefix}-forma`} label="Forma farmacêutica">
          <Select
            value={item.pharmaceuticalForm || undefined}
            onValueChange={(value) => onChange('pharmaceuticalForm', value)}
          >
            <SelectTrigger id={`${idPrefix}-forma`} className="h-11">
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {PHARMACEUTICAL_FORMS.map((form) => (
                <SelectItem key={form} value={form}>
                  {form}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={`${idPrefix}-dose`} label="Dose prescrita">
          <Input
            id={`${idPrefix}-dose`}
            className="h-11"
            value={item.dose}
            onChange={(event) => onChange('dose', event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id={`${idPrefix}-via`} label="Via de administração">
          <Select
            value={item.route || undefined}
            onValueChange={(value) => onChange('route', value)}
          >
            <SelectTrigger id={`${idPrefix}-via`} className="h-11">
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
        <Field id={`${idPrefix}-quantidade`} label="Quantidade">
          <Input
            id={`${idPrefix}-quantidade`}
            className="h-11"
            type="number"
            min={1}
            max={999}
            step={1}
            value={item.quantity}
            onChange={(event) => onChange('quantity', event.target.value)}
          />
        </Field>
      </div>

      <Field label="Urgência">
        <RadioGroup
          value={item.urgency ?? ''}
          onValueChange={(value) => onChange('urgency', value as Urgency)}
          className="grid gap-3 sm:grid-cols-3"
        >
          {(Object.keys(URGENCY_LABEL) as Urgency[]).map((urgency) => (
            <Label
              key={urgency}
              htmlFor={`${idPrefix}-urgencia-${urgency}`}
              className={cn(
                'flex cursor-pointer items-center rounded-xl border-2 p-4 font-normal transition-colors',
                item.urgency === urgency ? URGENCY_STYLE[urgency].ring : 'border-muted'
              )}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <RadioGroupItem id={`${idPrefix}-urgencia-${urgency}`} value={urgency} />
                <span className={cn('h-3 w-3 rounded-full', URGENCY_STYLE[urgency].dot)} />
                {URGENCY_LABEL[urgency]}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </Field>

      <Field id={`${idPrefix}-prazo`} label="Data e horário limite" optional>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`${idPrefix}-prazo`}
            type="datetime-local"
            className="h-11 sm:w-72"
            value={item.deadline}
            onChange={(event) => onChange('deadline', event.target.value)}
          />
          {item.deadline ? (
            <Button type="button" variant="ghost" onClick={() => onChange('deadline', '')}>
              Sem prazo
            </Button>
          ) : null}
        </div>
        {pastDeadline ? (
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            Esse horário já passou. Escolha um horário futuro ou deixe sem prazo.
          </p>
        ) : null}
      </Field>

      <Field id={`${idPrefix}-observacao`} label="Observação" optional>
        <Textarea
          id={`${idPrefix}-observacao`}
          value={item.notes}
          onChange={(event) => onChange('notes', event.target.value)}
          placeholder="Recado para a farmácia"
          rows={2}
        />
      </Field>
    </div>
  );
}

/**
 * Full-page prescription form. It starts with one medication and "Adicionar medicamento" adds
 * more, each with its own details, urgency and deadline; sector, bed and identification are
 * shared by the whole prescription.
 */
export function PrescriptionForm({
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
  const createPrescription = useMutation(api.medications.createPrescription);
  const [isSaving, setIsSaving] = useState(false);
  const [sectorId, setSectorId] = useState<Id<'sectors'> | null>(preset.sectorId);
  const [bedId, setBedId] = useState<Id<'beds'> | null>(preset.bedId);
  const [requester, setRequester] = useState({ name: '', coren: '' });
  const [items, setItems] = useState<ItemState[]>(() => [emptyItem()]);
  const multiple = items.length > 1;

  const sector = sectors.find((item) => item._id === sectorId) ?? null;
  const bed = sector?.beds.find((item) => item._id === bedId) ?? null;

  const updateItem =
    (key: number) =>
    <K extends keyof ItemState>(field: K, value: ItemState[K]) =>
      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, [field]: value } : item))
      );

  const missing: string[] = [];
  if (!bed) missing.push('setor e leito');
  if (!requester.name.trim()) missing.push('nome');
  if (!requester.coren.trim()) missing.push('nº de identificação');
  items.forEach((item, index) => {
    const itemMissing = missingInItem(item);
    if (itemMissing.length > 0) {
      missing.push(
        multiple ? `medicamento ${index + 1}: ${itemMissing.join(', ')}` : itemMissing.join(', ')
      );
    }
  });
  const hasPastDeadline = items.some(isDeadlineInPast);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing.length > 0 || hasPastDeadline || !sector || !bed) {
      return;
    }
    setIsSaving(true);
    try {
      const created = await createPrescription({
        organizationId,
        bedId: bed._id,
        requesterName: requester.name,
        requesterCoren: requester.coren,
        items: items.map((item) => ({
          medication: item.medication,
          concentration: item.concentration,
          pharmaceuticalForm: item.pharmaceuticalForm,
          dose: item.dose,
          route: item.route,
          quantity: Number(item.quantity),
          urgency: item.urgency ?? 'rotina',
          deadline: item.deadline ? new Date(item.deadline).getTime() : undefined,
          notes: item.notes.trim() ? item.notes : undefined,
          prescription: findControlledSubstance(item.medication)
            ? {
                number: item.prescriptionNumber,
                prescriberName: item.prescriberName,
                prescriberCrm: item.prescriberCrm,
              }
            : undefined,
        })),
      });
      toast.success(
        `Solicitação ${created.number} enviada para a farmácia: ${medicationCountLabel(created.itemCount)} (${formatLocation(sector.name, bed.label)})`
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
      <h2 className="font-serif text-2xl font-semibold">Solicitar medicamento</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="form-setor" label="Setor">
          <Select
            value={sectorId ?? undefined}
            onValueChange={(value) => {
              setSectorId(value as Id<'sectors'>);
              setBedId(null);
            }}
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
            value={bedId ?? undefined}
            disabled={!sector}
            onValueChange={(value) => setBedId(value as Id<'beds'>)}
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

      <fieldset className="space-y-3 rounded-xl border p-4">
        <legend className="px-1 text-base font-semibold">Identificação do profissional</legend>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="form-solicitante" label="Nome">
            <Input
              id="form-solicitante"
              className="h-11"
              value={requester.name}
              onChange={(event) =>
                setRequester((current) => ({ ...current, name: event.target.value }))
              }
              autoComplete="name"
              maxLength={80}
            />
          </Field>
          <Field id="form-coren" label="Nº de identificação">
            <Input
              id="form-coren"
              className="h-11"
              value={requester.coren}
              onChange={(event) =>
                setRequester((current) => ({ ...current, coren: event.target.value }))
              }
              autoComplete="off"
              maxLength={80}
            />
          </Field>
        </div>
      </fieldset>

      <div className="space-y-4">
        {items.map((item, index) => (
          <fieldset
            key={item.key}
            className="space-y-4 rounded-xl border-2 border-primary/20 p-4"
            data-testid="prescription-item"
          >
            <div className="flex items-center justify-between gap-3">
              <legend className="text-lg font-semibold">
                {multiple ? `Medicamento ${index + 1}` : 'Medicamento'}
              </legend>
              {items.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItems((current) => current.filter((other) => other.key !== item.key))
                  }
                  aria-label={`Remover o medicamento ${index + 1}`}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remover
                </Button>
              ) : null}
            </div>
            <MedicationFields
              item={item}
              idPrefix={`item-${item.key}`}
              onChange={updateItem(item.key)}
            />
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full border-2 border-dashed"
          disabled={items.length >= 20}
          onClick={() => setItems((current) => [...current, emptyItem()])}
          data-testid="add-medication"
        >
          <Plus className="mr-2 h-5 w-5" />
          Adicionar medicamento
        </Button>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-end">
        {missing.length > 0 ? (
          <p className="text-sm text-muted-foreground sm:mr-auto">
            Falta preencher: {missing.join('; ')}
          </p>
        ) : null}
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={missing.length > 0 || hasPastDeadline || isSaving}
          data-testid="submit-request"
        >
          {isSaving
            ? 'Enviando...'
            : multiple
              ? `Enviar ${medicationCountLabel(items.length)} para a farmácia`
              : 'Enviar para a farmácia'}
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
  if (status === 'recusado') {
    return <StatusBadge status={status} />;
  }
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

function PrescriptionStatusSummary({
  items,
}: {
  readonly items: ReadonlyArray<MedicationRequest>;
}) {
  const counts = new Map<RequestStatus, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  return (
    <span className="text-sm text-muted-foreground">
      {[...counts.entries()]
        .map(([status, count]) => {
          const label = STATUS_LABEL[status].toLowerCase();
          const plural = count > 1 && status !== 'em_separacao' ? `${label}s` : label;
          return `${count} ${plural}`;
        })
        .join(' · ')}
    </span>
  );
}

/** Runs a mutation and shows a success or error toast. */
function run(action: Promise<unknown>, success: string) {
  action
    .then(() => toast.success(success))
    .catch((error: unknown) => toast.error(errorMessage(error)));
}

/**
 * "Acompanhar entregas": prescriptions with the status of every medication, so everybody sees
 * where each one is. Nursing confirms receipt and marks rejections as seen; the pharmacy view
 * (`mode="farmacia"`) is read-only.
 */
/** "Confirmar recebimento" or "Reportar erro na entrega" for a medication marked as sent. */
function SentItemActions({
  item,
  onConfirm,
  onReportError,
}: {
  readonly item: MedicationRequest;
  readonly onConfirm: () => void;
  readonly onReportError: (reason: string) => void;
}) {
  const [isReporting, setIsReporting] = useState(false);
  const [reason, setReason] = useState('');

  if (isReporting) {
    return (
      <div className="basis-full space-y-3 rounded-lg border-2 border-purple-400 p-3">
        <Label htmlFor={`erro-entrega-${item._id}`} className="text-base">
          Qual foi o erro na entrega?
        </Label>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_ERROR_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                reason === option
                  ? 'border-purple-500 bg-purple-50 text-purple-900 dark:bg-purple-950 dark:text-purple-100'
                  : 'hover:bg-muted'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <Textarea
          id={`erro-entrega-${item._id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Descreva o erro"
          rows={2}
          maxLength={300}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setIsReporting(false)}>
            Voltar
          </Button>
          <Button
            className="bg-purple-700 text-white hover:bg-purple-800"
            disabled={!reason.trim()}
            onClick={() => {
              onReportError(reason);
              setIsReporting(false);
              setReason('');
            }}
            data-testid="confirm-delivery-error"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Enviar de volta para a farmácia
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onConfirm} data-testid="confirm-received">
        <PackageCheck className="mr-2 h-4 w-4" />
        Confirmar recebimento
      </Button>
      <Button
        variant="outline"
        className="border-2 border-purple-400 text-purple-800 hover:bg-purple-50 dark:text-purple-200 dark:hover:bg-purple-950"
        onClick={() => setIsReporting(true)}
        data-testid="report-delivery-error"
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        Reportar erro na entrega
      </Button>
    </div>
  );
}

export function TrackDeliveries({
  organizationId,
  requests,
  filter,
  now,
  mode,
}: {
  readonly organizationId: string;
  readonly requests: ReadonlyArray<MedicationRequest>;
  readonly filter: BedFilterValue;
  readonly now: number;
  readonly mode: 'enfermagem' | 'farmacia';
}) {
  const confirmReceived = useMutation(api.medications.confirmReceived);
  const acknowledgeRefusal = useMutation(api.medications.acknowledgeRefusal);
  const reportDeliveryError = useMutation(api.medications.reportDeliveryError);
  const isNursing = mode === 'enfermagem';

  // A prescription is shown while any of its medications still needs attention: in progress,
  // or (for nursing) rejected and not yet seen.
  const needsAttention = (request: MedicationRequest) =>
    isNursing ? isTrackedByNursing(request) : !isFinishedStatus(request.status);
  const visible = groupPrescriptions(
    requests.filter((request) => matchesBedFilter(request, filter))
  ).filter((prescription) => prescription.items.some(needsAttention));
  // Prescriptions with an unseen rejection first, so nursing does not miss them.
  const ordered = isNursing
    ? [
        ...visible.filter((prescription) => prescription.items.some(isUnseenRejection)),
        ...visible.filter((prescription) => !prescription.items.some(isUnseenRejection)),
      ]
    : visible;

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">Acompanhar entregas</h2>
      {ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Nenhuma solicitação em andamento neste filtro.
        </div>
      ) : (
        <ul className="space-y-4">
          {ordered.map((prescription) => (
            <PrescriptionCard
              key={prescription.key}
              prescription={prescription}
              now={now}
              renderActions={(item) => {
                if (!isNursing) return null;
                if (item.status === 'enviado') {
                  return (
                    <SentItemActions
                      item={item}
                      onConfirm={() =>
                        run(
                          confirmReceived({ organizationId, requestId: item._id }),
                          `${item.medication}: recebimento confirmado`
                        )
                      }
                      onReportError={(reason) =>
                        run(
                          reportDeliveryError({ organizationId, requestId: item._id, reason }),
                          `${item.medication}: erro reportado, voltou para o topo da fila da farmácia`
                        )
                      }
                    />
                  );
                }
                if (isUnseenRejection(item)) {
                  return (
                    <Button
                      variant="outline"
                      className="border-2 border-red-400"
                      onClick={() =>
                        run(
                          acknowledgeRefusal({ organizationId, requestId: item._id }),
                          `${item.medication}: rejeição lida, movida para o Histórico`
                        )
                      }
                      data-testid="acknowledge-refusal"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Ciente
                    </Button>
                  );
                }
                return null;
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One prescription with each medication's status, shared by nursing and pharmacy tracking. */
export function PrescriptionCard({
  prescription,
  now,
  renderActions,
}: {
  readonly prescription: Prescription;
  readonly now: number;
  readonly renderActions: (item: MedicationRequest) => ReactNode;
}) {
  const hasRejection = prescription.items.some(isUnseenRejection);
  const requester = requesterLabel(prescription);
  return (
    <li
      className={cn(
        'space-y-3 rounded-xl border-2 bg-card p-4',
        hasRejection ? 'border-red-500' : 'border-border'
      )}
      data-testid="tracked-request"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{requestTitle(prescription)}</span>
            {prescription.items.length > 1 ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {medicationCountLabel(prescription.items.length)}
              </span>
            ) : null}
          </p>
          <p className="font-medium">
            {formatLocation(prescription.sectorName, prescription.bedLabel)}
          </p>
          {requester ? (
            <p className="text-sm text-muted-foreground">Solicitado por {requester}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            Pedido {formatElapsed(prescription.createdAt, now)}
          </p>
          {prescription.items.length > 1 ? (
            <PrescriptionStatusSummary items={prescription.items} />
          ) : null}
        </div>
      </div>

      <ul className="divide-y rounded-lg border">
        {prescription.items.map((item) => {
          const rejected = item.status === 'recusado';
          return (
            <li
              key={item._id}
              className={cn('space-y-2 p-3', rejected && 'bg-red-50 dark:bg-red-950/40')}
            >
              <div className="flex flex-wrap items-center gap-2">
                {rejected ? <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" /> : null}
                <span className="font-semibold">{item.medication}</span>
                <UrgencyBadge urgency={item.urgency} />
                {item.refrigerated && item.status !== 'recusado' ? <RefrigeratedBadge /> : null}
                {item.deadline ? (
                  <span className="text-sm text-muted-foreground">
                    prazo {formatDateTime(item.deadline, now)}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {medicationSummary(item)} · {item.quantity}{' '}
                {item.quantity === 1 ? 'unidade' : 'unidades'}
              </p>
              <DeliveryErrorNotice request={item} now={now} />
              {acceptedByLabel(item) ? (
                <p className="text-sm text-muted-foreground">
                  Aceito na farmácia por {acceptedByLabel(item)}
                </p>
              ) : null}
              {rejected ? (
                <p className="font-semibold text-red-800 dark:text-red-200">
                  Rejeitado pela farmácia · Justificativa: {item.refusalReason ?? 'não informada'}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DeliveryProgress status={item.status} />
                {renderActions(item)}
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
