/**
 * Minimal i18n layer.
 *
 * The backend never returns user-facing prose - only stable ids (phase names,
 * hint ids, reason ids). Everything the user reads is resolved here, so adding
 * a language means adding one dictionary and nothing else.
 *
 * The language follows the system/Steam locale automatically; there is no
 * switch in the UI.
 */

const en = {
  "status.checking": "Checking for updates…",
  "status.updating": "Updating…",
  "status.upToDate": "System is up to date",
  "status.updatesAvailable": "{n} updates available",
  "status.updatesAvailableOne": "1 update available",
  "status.done": "All updates installed",
  "status.failed": "Update failed",
  "status.failedPhases": "Failed: {phases}",
  "status.failedPackages": "Could not be installed: {packages}",
  "status.logHint": "Full output: {path}",

  "phase.keyring": "Updating keyring",
  "phase.pacman": "Updating system packages",
  "phase.aur": "Updating AUR packages",
  "phase.flatpak_system": "Updating Flatpaks",
  "phase.flatpak_user": "Updating Flatpaks (user)",
  "phase.fwupd": "Updating firmware",

  "category.pacman": "System",
  "category.aur": "AUR",
  "category.flatpak": "Flatpak",
  "category.fwupd": "Firmware",

  "btn.updateNow": "Update now",
  "btn.updating": "Updating…",
  "btn.checkNow": "Check for updates",
  "btn.showLog": "Show output",
  "btn.hideLog": "Hide output",
  "btn.showList": "Show list",
  "btn.hideList": "Hide list",
  "btn.reboot": "Restart now",
  "btn.selfTest": "Self-test",
  "btn.testing": "Testing…",

  "section.title": "CachyOS Update",
  "section.availableUpdates": "Available updates",
  "section.details": "Details",
  "section.settings": "Settings",

  "time.lastChecked": "Last checked: {when}",
  "time.never": "never",
  "time.justNow": "just now",
  "time.minutes": "{n} min ago",
  "time.hours": "{n} h ago",
  "time.days": "{n} d ago",

  "log.empty": "No output yet.",
  "update.noCancel": "This cannot be cancelled once it has started.",
  "update.elapsed": "running for {time}",
  "update.downloading": "downloading {size} MiB",
  "update.starting": "starting…",
  "reboot.needed": "A kernel or system update requires a restart.",
  "reboot.title": "Restart now?",
  "reboot.description":
    "A kernel or system update was installed. It only takes effect after a restart. Running games will be closed.",
  "reboot.ok": "Restart",
  "reboot.cancel": "Later",


  "reason.already_running": "Another operation is already running.",
  "reason.not_root":
    'The backend is not running as root. The "root" flag is missing in plugin.json.',
  "reason.pacman_busy":
    "Another package manager is running (pacman lock held). Please wait a moment.",

  "hint.pkg_conflict":
    "Package conflicts need to be resolved manually. Please run 'sudo pacman -Syu' in desktop mode and confirm the conflicts.",
  "hint.file_conflict":
    "File conflicts: a package wants to overwrite files owned by another one. This has to be sorted out in desktop mode.",
  "hint.unresolvable_deps":
    "Dependencies could not be resolved. Usually waiting a few hours for the mirrors to catch up is enough.",
  "hint.corrupt_package":
    "A package was downloaded corrupted. Retrying usually fixes this.",
  "hint.bad_signature":
    "Signature check failed. Usually the keyring is out of date - retrying often fixes it.",
  "hint.sync_failed":
    "Package databases could not be downloaded. Is there an internet connection?",
  "hint.no_network": "No internet connection.",
  "hint.fwupd_auth":
    "fwupd denied permission. Firmware updates cannot always be applied from gamemode - please use desktop mode or disable firmware updates in the settings.",
  "hint.polkit_denied":
    "Permission denied (polkit). Firmware updates may require desktop mode.",
  "hint.ac_power_required":
    "This firmware update requires the power adapter to be connected.",
  "hint.battery_too_low": "Battery level is too low for a firmware update.",
  "hint.aur_pgp":
    "An AUR package could not verify its sources with a PGP key. Try the update once more - the key is kept from now on. If it keeps failing, update that package in desktop mode.",
  "hint.aur_sandbox":
    "This AUR package has to be compiled, and the isolated directory it is built in does not allow running the helper programs it needs. Update it in desktop mode with \"yay -S <name>\". Everything else was updated.",
  "hint.library_conflict":
    "A system tool loaded the wrong libraries and could not start. Restarting Decky (or the device) usually fixes this.",

  "warning.missing_checkupdates":
    "checkupdates is missing (install the 'pacman-contrib' package).",
  "warning.checkupdates_failed": "checkupdates failed.",
  "warning.missing_yay": "yay is not installed - AUR is being skipped.",

  "settings.aur": "AUR packages",
  "settings.aurDesc": "Updates AUR packages using yay.",
  "settings.flatpak": "Flatpaks",
  "settings.flatpakDesc": "System and user Flatpaks.",
  "settings.fwupd": "Firmware (fwupd)",
  "settings.fwupdDesc":
    "Careful: a failed firmware update cannot be rolled back. Off by default.",
  "settings.autoCheck": "Check for updates automatically",
  "settings.autoCheckDesc":
    "Checks in the background every few hours. Nothing is ever installed on its own.",
  "settings.notify": "Notify when updates are available",
  "settings.notifyThreshold": "Notify from",
  "settings.notifyThresholdDesc":
    "Only notifies once at least this many updates are waiting.",
  "settings.notifyThresholdOne": "1 package",
  "settings.notifyThresholdOption": "{n} packages",

  "selftest.rootOk": "Running as root - correct.",
  "selftest.rootBad": 'NOT running as root. The "root" flag is missing in plugin.json.',
  "selftest.user": "User: {user}",
  "selftest.kernel": "Kernel: {kernel}",
  "selftest.pacmanBusy": "pacman is currently locked.",

  "toast.doneTitle": "Update complete",
  "toast.failedTitle": "Update failed",
  "toast.rebootSuffix": "Restart recommended.",
  "toast.availableTitle": "Updates available",
  "toast.availableBody": "{n} updates can be installed.",
  "toast.availableBodyOne": "1 update can be installed.",
};

type Key = keyof typeof en;

const de: Record<Key, string> = {
  "status.checking": "Suche nach Updates…",
  "status.updating": "Update läuft…",
  "status.upToDate": "System ist aktuell",
  "status.updatesAvailable": "{n} Updates verfügbar",
  "status.updatesAvailableOne": "1 Update verfügbar",
  "status.done": "Alle Updates installiert",
  "status.failed": "Update fehlgeschlagen",
  "status.failedPhases": "Fehlgeschlagen: {phases}",
  "status.failedPackages": "Konnte nicht installiert werden: {packages}",
  "status.logHint": "Vollständige Ausgabe: {path}",

  "phase.keyring": "Schlüsselbund wird aktualisiert",
  "phase.pacman": "Systempakete werden aktualisiert",
  "phase.aur": "AUR-Pakete werden aktualisiert",
  "phase.flatpak_system": "Flatpaks werden aktualisiert",
  "phase.flatpak_user": "Flatpaks (Benutzer) werden aktualisiert",
  "phase.fwupd": "Firmware wird aktualisiert",

  "category.pacman": "System",
  "category.aur": "AUR",
  "category.flatpak": "Flatpak",
  "category.fwupd": "Firmware",

  "btn.updateNow": "Jetzt aktualisieren",
  "btn.updating": "Update läuft…",
  "btn.checkNow": "Nach Updates suchen",
  "btn.showLog": "Ausgabe anzeigen",
  "btn.hideLog": "Ausgabe ausblenden",
  "btn.showList": "Liste anzeigen",
  "btn.hideList": "Liste ausblenden",
  "btn.reboot": "Jetzt neu starten",
  "btn.selfTest": "Selbsttest",
  "btn.testing": "Prüfe…",

  "section.title": "CachyOS Update",
  "section.availableUpdates": "Verfügbare Updates",
  "section.details": "Details",
  "section.settings": "Einstellungen",

  "time.lastChecked": "Zuletzt geprüft: {when}",
  "time.never": "noch nie",
  "time.justNow": "gerade eben",
  "time.minutes": "vor {n} Min.",
  "time.hours": "vor {n} Std.",
  "time.days": "vor {n} Tg.",

  "log.empty": "Noch keine Ausgabe.",
  "update.noCancel": "Ein laufendes Update lässt sich nicht abbrechen.",
  "update.elapsed": "läuft seit {time}",
  "update.downloading": "{size} MiB werden geladen",
  "update.starting": "wird gestartet…",
  "reboot.needed": "Ein Kernel- oder Systemupdate braucht einen Neustart.",
  "reboot.title": "Jetzt neu starten?",
  "reboot.description":
    "Ein Kernel- oder Systemupdate wurde installiert. Es wird erst nach einem Neustart wirksam. Laufende Spiele werden beendet.",
  "reboot.ok": "Neu starten",
  "reboot.cancel": "Später",


  "reason.already_running": "Es läuft bereits ein Vorgang.",
  "reason.not_root":
    'Das Backend läuft nicht als root. In plugin.json fehlt das Flag "root".',
  "reason.pacman_busy":
    "Ein anderer Paketmanager läuft gerade (pacman-Sperre aktiv). Bitte kurz warten.",

  "hint.pkg_conflict":
    "Paketkonflikte müssen manuell aufgelöst werden. Bitte im Desktop-Modus 'sudo pacman -Syu' ausführen und die Konflikte bestätigen.",
  "hint.file_conflict":
    "Dateikonflikte: ein Paket will Dateien überschreiben, die einem anderen gehören. Das muss im Desktop-Modus geklärt werden.",
  "hint.unresolvable_deps":
    "Abhängigkeiten lassen sich nicht auflösen. Meist hilft es, ein paar Stunden zu warten, bis die Spiegelserver synchron sind.",
  "hint.corrupt_package":
    "Ein Paket wurde beschädigt heruntergeladen. Ein erneuter Versuch behebt das meistens.",
  "hint.bad_signature":
    "Signaturprüfung fehlgeschlagen. Meist ist der Schlüsselbund veraltet - ein erneuter Versuch behebt das oft.",
  "hint.sync_failed":
    "Die Paketdatenbanken konnten nicht geladen werden. Besteht eine Internetverbindung?",
  "hint.no_network": "Keine Internetverbindung.",
  "hint.fwupd_auth":
    "fwupd hat die Berechtigung verweigert. Firmware-Updates lassen sich aus dem Gamemode nicht immer anwenden - bitte im Desktop-Modus erledigen oder Firmware-Updates in den Einstellungen abschalten.",
  "hint.polkit_denied":
    "Berechtigung verweigert (polkit). Firmware-Updates brauchen ggf. den Desktop-Modus.",
  "hint.ac_power_required":
    "Für dieses Firmware-Update muss das Netzteil angeschlossen sein.",
  "hint.battery_too_low": "Der Akkustand ist für ein Firmware-Update zu niedrig.",
  "hint.aur_pgp":
    "Ein AUR-Paket konnte seine Quellen nicht per PGP prüfen. Versuch das Update noch einmal - der Schlüssel bleibt ab jetzt erhalten. Wenn es weiterhin fehlschlägt, aktualisiere das Paket im Desktop-Modus.",
  "hint.aur_sandbox":
    "Dieses AUR-Paket muss kompiliert werden, und im abgeschotteten Bauverzeichnis dürfen die dafür nötigen Hilfsprogramme nicht ausgeführt werden. Bitte im Desktop-Modus mit \"yay -S <name>\" aktualisieren. Alles andere wurde aktualisiert.",
  "hint.library_conflict":
    "Ein Systemwerkzeug hat die falschen Bibliotheken geladen und konnte nicht starten. Ein Neustart von Decky (oder des Geräts) behebt das meistens.",

  "warning.missing_checkupdates":
    "checkupdates fehlt (Paket 'pacman-contrib' installieren).",
  "warning.checkupdates_failed": "checkupdates ist fehlgeschlagen.",
  "warning.missing_yay": "yay ist nicht installiert - AUR wird übersprungen.",

  "settings.aur": "AUR-Pakete",
  "settings.aurDesc": "Aktualisiert AUR-Pakete mit yay.",
  "settings.flatpak": "Flatpaks",
  "settings.flatpakDesc": "System- und Benutzer-Flatpaks.",
  "settings.fwupd": "Firmware (fwupd)",
  "settings.fwupdDesc":
    "Vorsicht: ein fehlgeschlagenes Firmware-Update lässt sich nicht zurückrollen. Standardmäßig aus.",
  "settings.autoCheck": "Automatisch nach Updates suchen",
  "settings.autoCheckDesc":
    "Prüft im Hintergrund alle paar Stunden. Installiert wird nie von selbst.",
  "settings.notify": "Benachrichtigung bei Updates",
  "settings.notifyThreshold": "Benachrichtigen ab",
  "settings.notifyThresholdDesc":
    "Meldet sich erst, wenn mindestens so viele Updates anstehen.",
  "settings.notifyThresholdOne": "1 Paket",
  "settings.notifyThresholdOption": "{n} Pakete",

  "selftest.rootOk": "Läuft als root - korrekt.",
  "selftest.rootBad": 'Läuft NICHT als root. In plugin.json fehlt das Flag "root".',
  "selftest.user": "Benutzer: {user}",
  "selftest.kernel": "Kernel: {kernel}",
  "selftest.pacmanBusy": "pacman ist gerade gesperrt.",

  "toast.doneTitle": "Update abgeschlossen",
  "toast.failedTitle": "Update fehlgeschlagen",
  "toast.rebootSuffix": "Neustart empfohlen.",
  "toast.availableTitle": "Updates verfügbar",
  "toast.availableBody": "{n} Updates können installiert werden.",
  "toast.availableBodyOne": "1 Update kann installiert werden.",
};

const dictionaries: Record<string, Record<Key, string>> = { en, de };

function detectLanguage(): string {
  const candidates: unknown[] = [];
  try {
    const nav = navigator as Navigator & { languages?: readonly string[] };
    if (nav?.languages) candidates.push(...nav.languages);
    if (nav?.language) candidates.push(nav.language);
  } catch {
    /* not in a browser context */
  }
  try {
    if (document?.documentElement?.lang) candidates.push(document.documentElement.lang);
  } catch {
    /* ignore */
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    if (base in dictionaries) return base;
  }
  return "en";
}

const language = detectLanguage();
const dict = dictionaries[language] ?? en;

/** Translate a key, substituting {placeholders}. Falls back to English. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let text: string = dict[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return text;
}

/** Translate an id coming from the backend, e.g. "pacman" -> "phase.pacman". */
export function tid(prefix: string, id: string): string {
  if (!id) return "";
  const key = `${prefix}.${id}` as Key;
  return key in en ? t(key) : id;
}

export function currentLanguage(): string {
  return language;
}
