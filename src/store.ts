import { useEffect, useReducer } from "react";
import type { BackendState, Settings } from "./api";

/**
 * The Quick Access panel unmounts whenever the user closes it, so nothing that
 * has to survive an update run may live in component state. This module-level
 * store is created once when the plugin loads and keeps receiving backend
 * events even while no panel is rendered.
 */

const MAX_LOG_LINES = 500;

export const initialState: BackendState = {
  status: "idle",
  phase: "",
  progress: 0,
  update_started: 0,
  download_mib: 0,
  downloading: false,
  log: [],
  counts: { pacman: 0, aur: 0, flatpak: 0, fwupd: 0 },
  details: { pacman: [], aur: [], flatpak: [], fwupd: [] },
  total: 0,
  last_check: 0,
  last_update: 0,
  reboot_required: false,
  pacnew: [],
  failed_phases: [],
  hint_id: "",
  warnings: [],
  error_text: "",
};

let state: BackendState = initialState;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getStoreState(): BackendState {
  return state;
}

export function patchState(patch: Partial<BackendState>) {
  state = { ...state, ...patch };
  notify();
}

export function replaceState(next: BackendState) {
  state = next;
  notify();
}

export function appendLog(line: string) {
  const log = [...state.log, line];
  if (log.length > MAX_LOG_LINES) log.splice(0, log.length - MAX_LOG_LINES);
  state = { ...state, log };
  notify();
}

export function clearLog() {
  state = { ...state, log: [] };
  notify();
}

/** Drop the outcome of the previous run before starting a new one. */
export function clearStatus() {
  state = {
    ...state,
    failed_phases: [],
    hint_id: "",
    warnings: [],
    error_text: "",
    reboot_required: false,
    pacnew: [],
  };
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStore(): BackendState {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribe(force as () => void), []);
  return state;
}

// -- settings ---------------------------------------------------------------

let settings: Settings = {
  enable_aur: true,
  enable_flatpak: true,
  enable_fwupd: false,
  auto_check: true,
  check_interval_hours: 6,
  notify_on_updates: true,
};

export function getStoreSettings(): Settings {
  return settings;
}

export function setStoreSettings(next: Settings) {
  settings = next;
  notify();
}

export function useSettings(): Settings {
  useStore();
  return settings;
}
