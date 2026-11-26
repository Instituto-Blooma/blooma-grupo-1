import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { normalizeMedicationName } from '../../../../convex/lib/controlledSubstances';
import { Input } from '@/components/ui/input';
import { MEDICATION_NAMES } from '@/lib/medication-names';
import { cn } from '@/lib/utils';

const MIN_CHARS = 2;
const MAX_SUGGESTIONS = 10;

const INDEX = MEDICATION_NAMES.map((name) => {
  const key = normalizeMedicationName(name);
  return { name, key, firstWord: key.split(/[\s(]/)[0] ?? key };
});

/** Single-ingredient names win over combinations ("+"), then the shortest. */
function nameRank(name: string) {
  return (name.includes('+') ? 1000 : 0) + name.length;
}

/** One name per medicine (the shortest), so "di" shows Diazepam, Dipirona... not 8 Diclofenacos. */
function onePerMedicine(matches: ReadonlyArray<(typeof INDEX)[number]>) {
  const byWord = new Map<string, (typeof INDEX)[number]>();
  for (const match of matches) {
    const current = byWord.get(match.firstWord);
    if (!current || nameRank(match.name) < nameRank(current.name)) {
      byWord.set(match.firstWord, match);
    }
  }
  return [...byWord.values()];
}

/**
 * Names starting with what was typed come first, then names with a word starting with it. While
 * several medicines match, each appears once; once the typing narrows to one medicine, all its
 * variants (salts, combinations) appear.
 */
export function suggestMedications(typed: string) {
  const query = normalizeMedicationName(typed);
  if (query.length < MIN_CHARS) {
    return [];
  }
  const startsWith = INDEX.filter(({ key }) => key !== query && key.startsWith(query));
  const wordStartsWith = INDEX.filter(
    ({ key }) => !key.startsWith(query) && (key.includes(` ${query}`) || key.includes(`(${query}`))
  );
  const medicines = onePerMedicine(startsWith);
  const first = medicines.length > 1 ? medicines : startsWith;
  return [...first, ...wordStartsWith].slice(0, MAX_SUGGESTIONS).map(({ name }) => name);
}

/**
 * Medication name with suggestions while typing (like the word suggestions on a phone): typing
 * "di" lists Dipirona, Diazepam... Any name can still be typed freely.
 */
export function MedicationNameInput({
  id,
  value,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => suggestMedications(value), [value]);
  const showList = isOpen && suggestions.length > 0;

  const choose = (name: string) => {
    onChange(name);
    setIsOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const name = suggestions[active];
      if (name) {
        choose(name);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        className="h-11"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActive(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover py-1 text-popover-foreground shadow-lg"
          data-testid="medication-suggestions"
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keeps the input focused so the click lands before the list closes.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(name)}
              className={cn(
                'cursor-pointer px-3 py-2.5 text-base',
                index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              )}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
