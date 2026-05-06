/**
 * Tiny i18n module — picks 'en' or 'vi' as the player's native
 * language. Persisted to localStorage so the choice survives
 * reloads. Module-level cache + pub/sub + React hook follow the
 * same shape as wallet / inventory / energy.
 *
 * String lookup is via t(key, params?). Unknown keys fall back
 * to English; if the English key is also missing, we surface
 * the key itself so missing strings don't become silent empty
 * spaces in the UI.
 */

import { useEffect, useState } from 'react';
import { en } from '../locales/en';
import { vi } from '../locales/vi';

export type Locale = 'en' | 'vi';

const STORAGE_KEY = 'lingo-locale';
let cached: Locale | null = null;
type Listener = (locale: Locale) => void;
const listeners = new Set<Listener>();

function read(): Locale {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') {
    cached = 'en';
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw === 'vi' || raw === 'en' ? raw : 'en';
  } catch {
    cached = 'en';
  }
  return cached;
}

function write(locale: Locale): void {
  cached = locale;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* silent */ }
}

export function getLocale(): Locale {
  return read();
}

export function setLocale(locale: Locale): void {
  if (read() === locale) return;
  write(locale);
  for (const l of listeners) l(locale);
}

export function subscribeLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once the player has explicitly chosen a locale. Until
 *  then we should show the picker screen on boot. */
const LOCALE_PICKED_KEY = 'lingo-locale:picked';

export function hasPickedLocale(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOCALE_PICKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLocalePicked(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_PICKED_KEY, '1');
  } catch { /* silent */ }
}

export function clearLocalePicked(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCALE_PICKED_KEY);
  } catch { /* silent */ }
}

/** React hook — re-renders on locale change. */
export function useLocale(): Locale {
  const [locale, setLocaleState] = useState<Locale>(read);
  useEffect(() => {
    setLocaleState(read());
    return subscribeLocale((l) => setLocaleState(l));
  }, []);
  return locale;
}

const LOCALES: Record<Locale, Record<string, string>> = { en, vi };

/** Look up a string by key in the active locale. Optional `params`
 *  object substitutes `{name}` placeholders. Unknown keys fall back
 *  to English, then to the raw key as a last resort so missing
 *  strings are visible in dev rather than producing empty UI. */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = read();
  const value = LOCALES[locale][key] ?? LOCALES.en[key] ?? key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}
