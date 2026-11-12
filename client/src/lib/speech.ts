import { useSyncExternalStore } from 'react';

/**
 * Read-aloud using the browser's own speech synthesis (Web Speech API), in Brazilian Portuguese.
 * What is read, in order of preference: the text the user selected, an open dialog (e.g. a
 * request sheet), the page's <main> content, or the whole page. The accessibility bar, VLibras
 * and anything marked `data-leitura-ignorar` are skipped.
 */

export type SpeechStatus = 'parado' | 'lendo' | 'pausado';

const IGNORE_SELECTOR =
  '[data-leitura-ignorar], [vw], script, style, noscript, template, svg, [aria-hidden="true"], .sr-only';
// Chrome stops long utterances after ~15 s, so text is read in short pieces.
const MAX_CHUNK_LENGTH = 180;

export function isSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

let status: SpeechStatus = 'parado';
const listeners = new Set<() => void>();
// Each read gets an id so callbacks from a cancelled read cannot change the current status.
let readId = 0;

function setStatus(next: SpeechStatus) {
  if (status === next) {
    return;
  }
  status = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSpeechStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => 'parado' as const
  );
}

function isVisible(element: Element) {
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  return (element as HTMLElement).offsetParent !== null || element.tagName === 'BODY';
}

/** Visible text of an element, skipping ignored parts, with form values read too. */
function readableText(root: Element) {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.matches(IGNORE_SELECTOR) || !isVisible(element)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let previousParent: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    // Skip empty text and lone dashes used as "nothing here" placeholders.
    if (!text || /^[—–-]+$/.test(text)) {
      continue;
    }
    // Pieces of the same element ("Pedida " + "há 6 min") are one phrase; separate elements
    // (a label and its value, two buttons) get a short pause.
    const parent = node.parentElement;
    if (parts.length > 0) {
      parts.push(parent === previousParent ? ' ' : '. ');
    }
    parts.push(text);
    previousParent = parent;
  }
  return parts
    .join('')
    .replace(/([.!?:;,])\s*\./g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function textToRead() {
  const selection = window.getSelection()?.toString().trim();
  if (selection) {
    return selection;
  }
  const dialog = document.querySelector('[role="dialog"]');
  if (dialog && isVisible(dialog)) {
    return readableText(dialog);
  }
  const main = document.querySelector('main') ?? document.getElementById('root') ?? document.body;
  return readableText(main);
}

function splitIntoChunks(text: string) {
  const sentences = text.split(/(?<=[.!?;:])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK_LENGTH) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      // Very long sentence: break at commas or spaces.
      let rest = sentence;
      while (rest.length > MAX_CHUNK_LENGTH) {
        const cut = Math.max(
          rest.lastIndexOf(',', MAX_CHUNK_LENGTH),
          rest.lastIndexOf(' ', MAX_CHUNK_LENGTH)
        );
        const at = cut > 0 ? cut + 1 : MAX_CHUNK_LENGTH;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      currentChunk = rest.trim();
      continue;
    }
    if ((currentChunk + ' ' + sentence).trim().length > MAX_CHUNK_LENGTH) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk = `${currentChunk} ${sentence}`.trim();
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks.filter(Boolean);
}

function portugueseVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === 'pt-BR') ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('pt')) ??
    null
  );
}

export const speechActions = {
  /** Iniciar: starts reading from the beginning (stops any reading in progress). */
  start() {
    if (!isSpeechSupported()) {
      return false;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const chunks = splitIntoChunks(textToRead());
    if (chunks.length === 0) {
      setStatus('parado');
      return false;
    }
    readId += 1;
    const id = readId;
    const voice = portugueseVoice();
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = 'pt-BR';
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = 1;
      if (index === chunks.length - 1) {
        utterance.addEventListener('end', () => {
          if (id === readId) {
            setStatus('parado');
          }
        });
      }
      utterance.addEventListener('error', (event) => {
        if (id === readId && event.error !== 'interrupted' && event.error !== 'canceled') {
          setStatus('parado');
        }
      });
      synth.speak(utterance);
    });
    setStatus('lendo');
    return true;
  },
  /** Pausar */
  pause() {
    if (status !== 'lendo') {
      return;
    }
    window.speechSynthesis.pause();
    setStatus('pausado');
  },
  /** Continuar */
  resume() {
    if (status !== 'pausado') {
      return;
    }
    window.speechSynthesis.resume();
    setStatus('lendo');
  },
  /** Interromper */
  stop() {
    if (!isSpeechSupported()) {
      return;
    }
    readId += 1;
    window.speechSynthesis.cancel();
    setStatus('parado');
  },
};

if (isSpeechSupported()) {
  // Voices load asynchronously in some browsers; asking once warms the list up.
  window.speechSynthesis.getVoices();
  window.addEventListener('pagehide', () => window.speechSynthesis.cancel());
}
