"use client";

import { useEffect, useState } from "react";

const OPENBOX_HALTED_STORAGE_KEY = "openbox-session-halted";
const OPENBOX_HALTED_EVENT = "openbox-session-halted";

declare global {
  interface Window {
    __openBoxDemoLoadedAt?: number;
  }
}

export function initializeOpenBoxHaltState() {
  if (typeof window === "undefined") return;
  window.__openBoxDemoLoadedAt ??= Date.now();
  window.localStorage.removeItem(OPENBOX_HALTED_STORAGE_KEY);
}

export function clearOpenBoxHaltState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OPENBOX_HALTED_STORAGE_KEY);
}

export function markOpenBoxSessionHalted(haltedAt?: unknown) {
  if (typeof window === "undefined") return;
  if (typeof haltedAt === "string") {
    const haltedAtTime = Date.parse(haltedAt);
    const loadedAt = window.__openBoxDemoLoadedAt ?? Date.now();
    window.__openBoxDemoLoadedAt = loadedAt;
    if (Number.isFinite(haltedAtTime) && haltedAtTime < loadedAt) return;
  }

  window.localStorage.setItem(OPENBOX_HALTED_STORAGE_KEY, "true");
  window.dispatchEvent(new CustomEvent(OPENBOX_HALTED_EVENT));
}

export function onOpenBoxSessionHalted(listener: () => void) {
  window.addEventListener(OPENBOX_HALTED_EVENT, listener);
  return () => window.removeEventListener(OPENBOX_HALTED_EVENT, listener);
}

export function isOpenBoxSessionHalted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OPENBOX_HALTED_STORAGE_KEY) === "true";
}

// Read the halt state reactively from any component (e.g. the suggestion chips,
// which are rendered by CopilotChat outside the page's halt state). Mirrors the
// page's own subscription so chips + input disable together on a halt.
export function useIsOpenBoxHalted(): boolean {
  const [halted, setHalted] = useState(false);
  useEffect(() => {
    setHalted(isOpenBoxSessionHalted());
    return onOpenBoxSessionHalted(() => setHalted(true));
  }, []);
  return halted;
}
