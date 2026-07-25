import { callable } from "@decky/api";

export interface Counts {
  pacman: number;
  aur: number;
  flatpak: number;
  fwupd: number;
}

export interface Details {
  pacman: string[];
  aur: string[];
  flatpak: string[];
  fwupd: string[];
}

export type Status = "idle" | "checking" | "updating" | "done" | "error";

/**
 * Everything the backend reports is either raw tool output or a stable
 * identifier - never localized prose. See src/i18n.ts.
 */
export interface BackendState {
  status: Status;
  phase: string; // phase id, e.g. "pacman"
  progress: number; // 0..1
  update_started: number; // unix seconds, 0 when idle
  download_mib: number; // size the current phase is downloading, 0 if unknown
  downloading: boolean; // true while pacman/yay are fetching packages
  log: string[];
  counts: Counts;
  details: Details;
  total: number;
  last_check: number; // unix seconds
  last_update: number;
  reboot_required: boolean;
  failed_phases: string[]; // phase ids
  failed_packages: string[]; // packages yay could not build
  hint_id: string;
  warnings: string[]; // warning ids
  error_text: string; // raw text, unexpected exceptions only
}

export interface Settings {
  enable_aur: boolean;
  enable_flatpak: boolean;
  enable_fwupd: boolean;
  auto_check: boolean;
  check_interval_hours: number;
  notify_on_updates: boolean;
  notify_threshold: number; // minimum number of updates before notifying
}

export interface ToolInfo {
  found: boolean;
  path: string;
  version: string;
}

export interface SelfTest {
  root: boolean;
  uid: number;
  standalone: boolean;
  decky_user: string;
  decky_user_home: string;
  kernel: string;
  kernel_vmlinuz_present: boolean;
  pacman_busy: boolean;
  tools: Record<string, ToolInfo>;
  settings: Settings;
}

export const getState = callable<[], BackendState>("get_state");
export const checkUpdates = callable<[], BackendState>("check_updates");
export const startUpdate = callable<
  [dryRun: boolean],
  { started: boolean; reason_id: string }
>("start_update");
export const getSettings = callable<[], Settings>("get_settings");
export const setSettings = callable<[settings: Partial<Settings>], Settings>("set_settings");
export const reboot = callable<[], boolean>("reboot");
export const selfTest = callable<[], SelfTest>("self_test");

/** Payload of the "cachyos_update_progress" event. */
export interface ProgressEvent {
  progress: number;
  phase: string;
  update_started: number;
  download_mib: number;
  downloading: boolean;
}



