// Substances under special control (Portaria SVS/MS nº 344/1998, Anexo I, with the 2026 updates
// up to RDC nº 1.036 of 09/07/2026). Only the lists that require a special prescription for
// medicines (A, B and C) and substances used in hospitals are here. The list changes often:
// check the current version at gov.br/anvisa before relying on it in real use.
//
// Shared by the Convex functions (which refuse a controlled medication without prescription
// data) and the client (which shows the required prescription type while typing).

export type ControlledList = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'C1' | 'C2' | 'C3' | 'C5';

export const PRESCRIPTION_TYPE: Record<ControlledList, string> = {
  A1: 'Notificação de Receita A (amarela)',
  A2: 'Notificação de Receita A (amarela)',
  A3: 'Notificação de Receita A (amarela)',
  B1: 'Notificação de Receita B (azul)',
  B2: 'Notificação de Receita B2 (azul)',
  C1: 'Receita de Controle Especial',
  C2: 'Notificação de Receita Especial de Retinoides',
  C3: 'Notificação de Receita de Talidomida',
  C5: 'Receita de Controle Especial',
};

const SUBSTANCES: Record<ControlledList, ReadonlyArray<string>> = {
  // Entorpecentes
  A1: [
    'alfentanila',
    'buprenorfina',
    'dextromoramida',
    'fentanila',
    'hidrocodona',
    'hidromorfona',
    'levorfanol',
    'meperidina',
    'metadona',
    'morfina',
    'opio',
    'oxicodona',
    'oximorfona',
    'petidina',
    'remifentanila',
    'sufentanila',
    'tapentadol',
  ],
  // Entorpecentes de uso permitido em concentrações especiais
  A2: ['codeina', 'dextropropoxifeno', 'di-hidrocodeina', 'diidrocodeina', 'nalbufina', 'tramadol'],
  // Psicotrópicos
  A3: ['anfetamina', 'dexanfetamina', 'lisdexanfetamina', 'metilfenidato'],
  // Psicotrópicos
  B1: [
    'alprazolam',
    'bromazepam',
    'brotizolam',
    'butalbital',
    'clobazam',
    'clonazepam',
    'clorazepato',
    'clordiazepoxido',
    'cloxazolam',
    'diazepam',
    'estazolam',
    'fenobarbital',
    'flunitrazepam',
    'flurazepam',
    'lorazepam',
    'lormetazepam',
    'midazolam',
    'nitrazepam',
    'oxazepam',
    'pentobarbital',
    'temazepam',
    'triazolam',
    'zaleplona',
    'zolpidem',
    'zopiclona',
  ],
  // Psicotrópicos anorexígenos
  B2: ['anfepramona', 'femproporex', 'mazindol', 'sibutramina'],
  // Outras substâncias sujeitas a controle especial
  C1: [
    'acido valproico',
    'amitriptilina',
    'aripiprazol',
    'biperideno',
    'bupropiona',
    'carbamazepina',
    'cetamina',
    'citalopram',
    'clomipramina',
    'clorpromazina',
    'clozapina',
    'desvenlafaxina',
    'dissulfiram',
    'divalproato',
    'droperidol',
    'duloxetina',
    'escetamina',
    'escitalopram',
    'etomidato',
    'fenitoina',
    'fluoxetina',
    'gabapentina',
    'haloperidol',
    'imipramina',
    'lamotrigina',
    'levetiracetam',
    'levomepromazina',
    'litio',
    'mirtazapina',
    'misoprostol',
    'naltrexona',
    'nortriptilina',
    'olanzapina',
    'oxcarbazepina',
    'paliperidona',
    'paroxetina',
    'pregabalina',
    'propofol',
    'quetiapina',
    'risperidona',
    'selegilina',
    'sertralina',
    'topiramato',
    'trazodona',
    'valproato',
    'venlafaxina',
    'ziprasidona',
  ],
  // Retinoides
  C2: ['acitretina', 'adapaleno', 'bexaroteno', 'isotretinoina', 'tretinoina'],
  // Imunossupressores
  C3: ['lenalidomida', 'pomalidomida', 'talidomida'],
  // Anabolizantes
  C5: ['estanozolol', 'metiltestosterona', 'nandrolona', 'oxandrolona', 'testosterona'],
};

/** Lowercase, without accents and with single spaces, for comparing medication names. */
export function normalizeMedicationName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const PATTERNS: ReadonlyArray<{ list: ControlledList; substance: string; pattern: RegExp }> = (
  Object.entries(SUBSTANCES) as Array<[ControlledList, ReadonlyArray<string>]>
).flatMap(([list, substances]) =>
  substances.map((substance) => ({
    list,
    substance,
    // Whole words only: "morfina" matches "sulfato de morfina" but not part of a longer word.
    pattern: new RegExp(`(^|[^a-z])${substance.replace(/-/g, '\\-')}($|[^a-z])`),
  }))
);

export type ControlledMatch = {
  list: ControlledList;
  substance: string;
  prescriptionType: string;
};

/** Which controlled list a typed medication belongs to, or null when no prescription is needed. */
export function findControlledSubstance(medication: string): ControlledMatch | null {
  const name = normalizeMedicationName(medication);
  if (!name) {
    return null;
  }
  const found = PATTERNS.find(({ pattern }) => pattern.test(name));
  return found
    ? {
        list: found.list,
        substance: found.substance,
        prescriptionType: PRESCRIPTION_TYPE[found.list],
      }
    : null;
}
