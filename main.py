"""CachyOS Update - Decky plugin backend.

Runs as root (plugin.json declares the "root" flag) and drives pacman, yay,
flatpak and fwupdmgr non-interactively, streaming every output line to the
frontend.

All user-facing wording lives in the frontend (src/i18n.ts). This module only
ever returns stable identifiers - phase ids, hint ids, reason ids - so the UI
can render them in the user's language. Raw command output is passed through
untranslated on purpose: it is the tool's own output.

This file is also runnable standalone for development on a machine without
Decky installed:

    python3 main.py --selftest
    python3 main.py --check
    python3 main.py --update --dry-run
"""

import asyncio
import json
import os
import re
import shutil
import sys
import time
from collections import deque
from pathlib import Path

try:
    import decky  # type: ignore
except ImportError:  # standalone / development
    decky = None


# --------------------------------------------------------------------------
# decky stub for standalone runs
# --------------------------------------------------------------------------

if decky is None:

    class _StubLogger:
        def _p(self, level, msg, *a):
            print(f"[{level}] {msg % a if a else msg}", file=sys.stderr)

        def debug(self, msg, *a):
            self._p("debug", msg, *a)

        def info(self, msg, *a):
            self._p("info", msg, *a)

        def warning(self, msg, *a):
            self._p("warn", msg, *a)

        def error(self, msg, *a):
            self._p("error", msg, *a)

        def exception(self, msg, *a):
            self._p("error", msg, *a)

    class _StubDecky:
        """Mimics the subset of the decky module that this plugin uses."""

        def __init__(self):
            base = Path(os.environ.get("TMPDIR", "/tmp")) / "decky-cachyos-update-dev"
            (base / "settings").mkdir(parents=True, exist_ok=True)
            (base / "runtime").mkdir(parents=True, exist_ok=True)
            (base / "logs").mkdir(parents=True, exist_ok=True)
            self.DECKY_PLUGIN_SETTINGS_DIR = str(base / "settings")
            self.DECKY_PLUGIN_RUNTIME_DIR = str(base / "runtime")
            self.DECKY_PLUGIN_LOG_DIR = str(base / "logs")
            self.DECKY_USER = os.environ.get("USER", "root")
            self.DECKY_USER_HOME = os.path.expanduser("~")
            self.DECKY_PLUGIN_VERSION = "dev"
            self.logger = _StubLogger()

        async def emit(self, event, *args):
            if event == "cachyos_update_log":
                print(args[0])
            else:
                print(f"<{event}> {args}", file=sys.stderr)

    decky = _StubDecky()  # type: ignore
    STANDALONE = True
else:
    STANDALONE = False


# --------------------------------------------------------------------------
# constants
# --------------------------------------------------------------------------

LOG_MAX_LINES = 500
PACMAN_LOCK = "/var/lib/pacman/db.lck"

# Weight of each phase in the progress bar, roughly proportional to how long
# each step usually takes on a handheld.
PHASE_WEIGHTS = {
    "keyring": 5,
    "pacman": 40,
    "aur": 30,
    "flatpak_system": 12,
    "flatpak_user": 5,
    "fwupd": 8,
}

DEFAULT_SETTINGS = {
    "enable_aur": True,
    "enable_flatpak": True,
    "enable_fwupd": False,
    "auto_check": True,
    "check_interval_hours": 6,
    "notify_on_updates": True,
}

# Packages whose upgrade means the machine should be restarted. Mirrors the
# trigger list of /usr/share/libalpm/hooks/cachyos-reboot-required.hook.
REBOOT_TRIGGER_PATTERNS = [
    re.compile(r"^linux(-.*)?$"),
    re.compile(r"^systemd(-.*)?$"),
    re.compile(r"^mesa$"),
    re.compile(r"^nvidia(-.*)?$"),
    re.compile(r"^wayland$"),
    re.compile(r"^xorg-server(-.*)?$"),
    re.compile(r"^mkinitcpio(-.*)?$"),
    re.compile(r"^dracut(-.*)?$"),
    re.compile(r"^(amd|intel)-ucode$"),
    re.compile(r"^linux-firmware(-.*)?$"),
    re.compile(r"^glibc$"),
]

# Output markers that mean "this needs a human", mapped to a hint id that the
# frontend turns into localized advice. Order matters: first match wins.
ERROR_HINTS = [
    ("unresolvable package conflicts", "pkg_conflict"),
    ("conflicting files", "file_conflict"),
    ("exists in filesystem", "file_conflict"),
    ("unresolvable dependencies", "unresolvable_deps"),
    ("invalid or corrupted package", "corrupt_package"),
    ("signature from", "bad_signature"),
    ("failed to synchronize", "sync_failed"),
    ("could not resolve host", "no_network"),
    ("failed to obtain auth", "fwupd_auth"),
    ("not authorized", "polkit_denied"),
    ("ac power required", "ac_power_required"),
    ("battery level is too low", "battery_too_low"),
    ("not found (required by", "library_conflict"),
]

PROGRESS_RE = re.compile(r"\(\s*(\d+)\s*/\s*(\d+)\s*\)")
UPGRADING_RE = re.compile(r"upgrading\s+([a-zA-Z0-9@._+-]+)")

# yay prints its early warnings through fallbackLog, before --color never is
# parsed, so colour codes show up even with colour disabled.
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")

# "package 1.0-1 -> 1.1-1 [2h5m]". Matching loosely on "->" is not enough:
# yay formats its warnings as "-> message", which would be counted as updates.
AUR_UPDATE_RE = re.compile(r"^\S+\s+\S+\s+->\s+\S+")

# With --noprogressbar pacman prints nothing at all while downloading, which
# on a slow connection means minutes of silence. Knowing the size up front is
# what makes that wait understandable.
DOWNLOAD_SIZE_RE = re.compile(r"Total Download Size:\s*([\d.]+)\s*MiB")

# yay lists what it could not build under this heading, one "name - reason"
# per line. Naming the package beats reporting the whole phase as broken.
FAILED_HEADER = "Failed to install the following packages"
FAILED_PKG_RE = re.compile(r"^(\S+)\s+-\s+\S")


# --------------------------------------------------------------------------
# state
# --------------------------------------------------------------------------


class State:
    def __init__(self):
        self.status = "idle"  # idle | checking | updating | done | error
        self.phase = ""
        self.progress = 0.0
        self.update_started = 0.0
        self.download_mib = 0.0
        self.downloading = False
        self.log = deque(maxlen=LOG_MAX_LINES)
        self.counts = {"pacman": 0, "aur": 0, "flatpak": 0, "fwupd": 0}
        self.details = {"pacman": [], "aur": [], "flatpak": [], "fwupd": []}
        self.last_check = 0.0
        self.last_update = 0.0
        self.reboot_required = False
        self.pacnew = []
        self.failed_phases = []
        self.failed_packages = []
        self.hint_id = ""
        self.warnings = []
        self.error_text = ""  # only for unexpected exceptions

    def to_dict(self):
        return {
            "status": self.status,
            "phase": self.phase,
            "progress": self.progress,
            "update_started": self.update_started,
            "download_mib": self.download_mib,
            "downloading": self.downloading,
            "log": list(self.log),
            "counts": self.counts,
            "details": self.details,
            "total": sum(self.counts.values()),
            "last_check": self.last_check,
            "last_update": self.last_update,
            "reboot_required": self.reboot_required,
            "pacnew": self.pacnew,
            "failed_phases": self.failed_phases,
            "failed_packages": self.failed_packages,
            "hint_id": self.hint_id,
            "warnings": self.warnings,
            "error_text": self.error_text,
        }


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _which(binary):
    return shutil.which(binary)


def _base_env():
    """Deterministic, non-interactive environment for every child process.

    Decky's plugin_loader is a PyInstaller one-file bundle. It unpacks its own
    copies of libssl, libcrypto and friends into /tmp/_MEIxxxxxx and points
    LD_LIBRARY_PATH at that directory. Every system binary started from here
    would then load those instead of the real ones, and pacman dies with
    "version `OPENSSL_3.2.0' not found (required by libcurl.so.4)".

    PyInstaller keeps the original values in *_ORIG, so they can be restored.
    """
    env = dict(os.environ)

    for name in ("LD_LIBRARY_PATH", "LD_PRELOAD"):
        original = env.pop(f"{name}_ORIG", None)
        if original:
            env[name] = original
        else:
            env.pop(name, None)

    # Catch anything else still pointing into the bundle (PYTHONHOME,
    # SSL_CERT_FILE, ...) - the temp dir name is the reliable marker.
    for key in [k for k, v in env.items() if isinstance(v, str) and "/_MEI" in v]:
        env.pop(key, None)
    env.pop("_MEIPASS2", None)

    # C.UTF-8 keeps pacman's error strings parseable regardless of the user's
    # locale - the ERROR_HINTS matching below relies on the English wording.
    env["LC_ALL"] = "C.UTF-8"
    env["LANG"] = "C.UTF-8"
    env["TERM"] = "dumb"
    env["PYTHONUNBUFFERED"] = "1"
    # Suppresses flatpak's ANSI progress bars and OSC escape sequences, which
    # would otherwise end up as garbage in the log panel.
    env["FLATPAK_FANCY_OUTPUT"] = "0"
    return env


def _yay_env():
    """yay must not see SUDO_USER/DOAS_USER when running as root.

    With either set, yay picks /tmp/yay as its build directory and creates it
    root-owned, which the de-elevated (systemd DynamicUser) build then cannot
    write to. Unset, it uses /var/cache/yay, which systemd creates and chowns
    itself via CacheDirectory=yay.
    """
    env = _base_env()
    for key in ("SUDO_USER", "DOAS_USER", "SUDO_UID", "SUDO_GID"):
        env.pop(key, None)
    return env


def _is_root():
    return os.geteuid() == 0


def _desktop_user():
    """The real desktop user, or ("", "") if we cannot determine it."""
    user = getattr(decky, "DECKY_USER", "") or ""
    home = getattr(decky, "DECKY_USER_HOME", "") or ""
    return (user, home) if user and user != "root" and home else ("", "")


def _can_run_as_user():
    """True if work can be performed under the desktop user's identity.

    Either we already are that user (development), or we are root and can drop
    to them via runuser.
    """
    user, _ = _desktop_user()
    if not user:
        return False
    return not _is_root() or bool(_which("runuser"))


def _user_cmd(cmd, extra_env=None):
    """Return (command, env) that runs `cmd` as the desktop user.

    Anything that only reads - checkupdates, yay -Qua, flatpak --user - must
    not run as root. yay in particular resolves its cache to /var/cache/yay
    when root and deliberately does not create it (it relies on systemd-run's
    CacheDirectory), so a plain query as root fails outright.

    `runuser` sets HOME/USER/LOGNAME but inherits everything else. A leaked
    XDG_DATA_HOME or FLATPAK_USER_DIR would silently point the tools at the
    wrong tree, so the environment is rebuilt from scratch with `env -i`
    rather than scrubbed.
    """
    extra_env = extra_env or {}
    user, home = _desktop_user()

    if not _is_root() or not user or not _which("runuser"):
        env = _base_env()
        env.update(extra_env)
        return cmd, env

    env_args = [
        f"HOME={home}",
        f"USER={user}",
        f"LOGNAME={user}",
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "LC_ALL=C.UTF-8",
        "LANG=C.UTF-8",
        "FLATPAK_FANCY_OUTPUT=0",
    ] + [f"{k}={v}" for k, v in extra_env.items()]

    return ["runuser", "-u", user, "--", "env", "-i"] + env_args + cmd, _base_env()


def _pacman_busy():
    return os.path.exists(PACMAN_LOCK)


_installed_cache = None


def _installed(pkg):
    """True if a package is installed, without shelling out to pacman.

    The local database has thousands of entries, so the name set is built once
    and reused; it only changes across an update run, which invalidates it.
    """
    global _installed_cache
    if _installed_cache is None:
        local = Path("/var/lib/pacman/local")
        try:
            _installed_cache = {
                p.name.rsplit("-", 2)[0] for p in local.iterdir() if p.is_dir()
            }
        except OSError:
            _installed_cache = set()
    return pkg in _installed_cache


def _invalidate_installed_cache():
    global _installed_cache
    _installed_cache = None


# --------------------------------------------------------------------------
# plugin
# --------------------------------------------------------------------------


class Plugin:
    def __init__(self):
        self.state = State()
        self.settings = dict(DEFAULT_SETTINGS)
        self.lock = asyncio.Lock()
        self._auto_task = None
        self._dry_run = False
        self._log_file = None

    # -- lifecycle ---------------------------------------------------------

    async def _main(self):
        self._load_settings()
        self._restore_state()
        decky.logger.info("CachyOS Update backend started (root=%s)", _is_root())
        if not _is_root():
            decky.logger.error(
                'Backend is NOT running as root - plugin.json is missing the '
                '"root" flag. Updates will fail.'
            )
        self._auto_task = asyncio.create_task(self._auto_check_loop())

    async def _unload(self):
        if self._auto_task:
            self._auto_task.cancel()
        self._save_state()
        decky.logger.info("CachyOS Update backend stopped")

    # -- persistence -------------------------------------------------------

    @property
    def _settings_file(self):
        return Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"

    @property
    def _state_file(self):
        return Path(decky.DECKY_PLUGIN_RUNTIME_DIR) / "state.json"

    def _load_settings(self):
        try:
            if self._settings_file.exists():
                stored = json.loads(self._settings_file.read_text())
                for key in DEFAULT_SETTINGS:
                    if key in stored:
                        self.settings[key] = stored[key]
        except Exception as exc:
            decky.logger.warning("Could not read settings: %s", exc)

    def _save_settings(self):
        try:
            self._settings_file.parent.mkdir(parents=True, exist_ok=True)
            self._settings_file.write_text(json.dumps(self.settings, indent=2))
        except Exception as exc:
            decky.logger.warning("Could not save settings: %s", exc)

    def _restore_state(self):
        """Carry the last check result across plugin restarts."""
        try:
            if not self._state_file.exists():
                return
            stored = json.loads(self._state_file.read_text())
            self.state.counts = stored.get("counts", self.state.counts)
            self.state.details = stored.get("details", self.state.details)
            self.state.last_check = stored.get("last_check", 0.0)
            self.state.last_update = stored.get("last_update", 0.0)
        except Exception as exc:
            decky.logger.warning("Could not read stored state: %s", exc)

    def _save_state(self):
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(
                json.dumps(
                    {
                        "counts": self.state.counts,
                        "details": self.state.details,
                        "last_check": self.state.last_check,
                        "last_update": self.state.last_update,
                    },
                    indent=2,
                )
            )
        except Exception as exc:
            decky.logger.warning("Could not save state: %s", exc)

    # -- emitting ----------------------------------------------------------

    @property
    def _update_log_path(self):
        base = getattr(decky, "DECKY_PLUGIN_LOG_DIR", None) or decky.DECKY_PLUGIN_RUNTIME_DIR
        return Path(base) / "update.log"

    def _open_update_log(self):
        """Keep the full output of one run on disk.

        The in-memory ring buffer only holds the last few hundred lines and is
        gone as soon as the plugin reloads - which is exactly when someone
        wants to look at why a build failed.
        """
        self._close_update_log()
        try:
            self._update_log_path.parent.mkdir(parents=True, exist_ok=True)
            self._log_file = self._update_log_path.open("w", encoding="utf-8")
        except OSError as exc:
            decky.logger.warning("Could not open update log: %s", exc)
            self._log_file = None

    def _close_update_log(self):
        if self._log_file:
            try:
                self._log_file.close()
            except OSError:
                pass
            self._log_file = None

    async def _log(self, line):
        line = line.rstrip()
        self.state.log.append(line)
        if self._log_file:
            try:
                self._log_file.write(line + "\n")
                self._log_file.flush()
            except OSError:
                self._log_file = None
        await decky.emit("cachyos_update_log", line)

    async def _set_phase(self, phase, done_weight, total_weight):
        self.state.phase = phase
        self.state.progress = done_weight / total_weight if total_weight else 0.0
        # Each phase reports its own download size.
        self.state.download_mib = 0.0
        self.state.downloading = False
        await self._emit_progress()

    async def _emit_progress(self):
        # One object rather than a growing list of positional arguments.
        await decky.emit(
            "cachyos_update_progress",
            {
                "progress": self.state.progress,
                "phase": self.state.phase,
                "update_started": self.state.update_started,
                "download_mib": self.state.download_mib,
                "downloading": self.state.downloading,
            },
        )

    async def _set_status(self, status):
        self.state.status = status
        await decky.emit("cachyos_update_state", status)

    # -- process runner ----------------------------------------------------

    async def _run(
        self,
        cmd,
        env=None,
        stream=True,
        phase_base=0.0,
        phase_span=0.0,
        merge_stderr=True,
    ):
        """Run a command, streaming stdout(+stderr) line by line.

        Returns (returncode, list_of_lines). `merge_stderr=False` is for probes
        whose output gets parsed - fwupdmgr in particular interleaves progress
        ticks on stderr that would otherwise corrupt the result.
        """
        if self._dry_run:
            await self._log("$ " + " ".join(cmd))
            return 0, []

        if stream:
            await self._log("$ " + " ".join(cmd))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=(
                    asyncio.subprocess.STDOUT
                    if merge_stderr
                    else asyncio.subprocess.DEVNULL
                ),
                stdin=asyncio.subprocess.DEVNULL,
                env=env or _base_env(),
            )
        except FileNotFoundError:
            if stream:
                await self._log(f"!! {cmd[0]} not found")
            return 127, []

        lines = []
        assert proc.stdout is not None
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            line = ANSI_RE.sub("", raw.decode("utf-8", "replace").rstrip("\n"))
            # Carriage returns redraw a line in place; keep only what would
            # actually be visible.
            if "\r" in line:
                line = line.rsplit("\r", 1)[-1]
            lines.append(line)
            if stream:
                await self._log(line)

                size = DOWNLOAD_SIZE_RE.search(line)
                if size:
                    self.state.download_mib = float(size.group(1))
                    await self._emit_progress()
                elif line.startswith(":: Retrieving packages"):
                    # Nothing is printed again until the first package is
                    # installed, so let the bar animate instead of freezing.
                    self.state.downloading = True
                    await self._emit_progress()

                # pacman/yay print "(12/34) upgrading foo" - use it to move the
                # bar inside a phase instead of only between phases.
                if phase_span:
                    match = PROGRESS_RE.search(line)
                    if match:
                        cur, total = int(match.group(1)), int(match.group(2))
                        if total:
                            frac = min(cur / total, 1.0)
                            self.state.progress = phase_base + phase_span * frac
                            self.state.downloading = False
                            await self._emit_progress()

        rc = await proc.wait()
        return rc, lines

    # -- checking ----------------------------------------------------------

    async def _check_pacman(self):
        if not _which("checkupdates"):
            return [], "missing_checkupdates"
        # A stable database path under the desktop user's cache, so the sync
        # is not repeated on every call. It has to be writable by that user,
        # since checkupdates runs unprivileged.
        _, home = _desktop_user()
        cache = f"{home}/.cache/decky-cachyos-update" if home else "/tmp"
        cmd, env = _user_cmd(
            ["checkupdates"], {"CHECKUPDATES_DB": f"{cache}/checkupdates-db"}
        )
        rc, lines = await self._run(cmd, env=env, stream=False)
        # checkupdates is inverted: 0 = updates found, 2 = nothing to do.
        if rc == 2:
            return [], ""
        if rc != 0:
            # Surface the reason instead of only a generic warning - this is
            # the one check that has several unrelated ways to fail.
            for line in lines[-3:]:
                if line.strip():
                    await self._log(f"!! checkupdates: {line.strip()}")
            return [], "checkupdates_failed"
        return [l for l in lines if l.strip()], ""

    async def _check_aur(self):
        if not self.settings["enable_aur"]:
            return [], ""
        yay = _which("yay")
        if not yay:
            return [], "missing_yay"
        cmd, env = _user_cmd([yay, "-Qua", "--color", "never"])
        rc, lines = await self._run(cmd, env=env, stream=False)
        entries = [l for l in lines if AUR_UPDATE_RE.match(l)]
        if rc != 0 and not entries:
            return [], ""
        return entries, ""

    async def _check_flatpak(self):
        if not self.settings["enable_flatpak"]:
            return [], ""
        flatpak = _which("flatpak")
        if not flatpak:
            return [], ""
        entries = []
        # Refreshing appstream data is what makes --updates accurate.
        await self._run(
            [flatpak, "update", "--system", "--appstream", "--noninteractive"],
            stream=False,
        )
        rc, lines = await self._run(
            [
                flatpak, "remote-ls", "--system", "--updates",
                "--columns=application,version",
            ],
            stream=False,
        )
        if rc == 0:
            entries += [l for l in lines if l.strip()]
        if _can_run_as_user():
            cmd, env = _user_cmd(
                [flatpak, "remote-ls", "--user", "--updates",
                 "--columns=application,version"]
            )
            rc, lines = await self._run(cmd, env=env, stream=False)
            if rc == 0:
                entries += [l for l in lines if l.strip()]
        return entries, ""

    async def _check_fwupd(self):
        if not self.settings["enable_fwupd"]:
            return [], ""
        fwupdmgr = _which("fwupdmgr")
        if not fwupdmgr:
            return [], ""
        rc, lines = await self._run(
            [fwupdmgr, "get-updates", "--json"], stream=False, merge_stderr=False
        )
        # With --json, "nothing to do" is exit 0 plus an empty Devices array;
        # older fwupd returns 2 (EXIT_NOTHING_TO_DO). Anything else is unusable.
        if rc not in (0, 2):
            return [], ""
        try:
            data = json.loads("\n".join(lines))
        except ValueError:
            return [], ""
        entries = []
        for dev in data.get("Devices", []):
            name = dev.get("Name", "?")
            for rel in dev.get("Releases", []):
                entries.append(f"{name} -> {rel.get('Version', '?')}")
        return entries, ""

    async def check_updates(self):
        """Look for updates without installing anything."""
        if self.lock.locked():
            return self.state.to_dict()
        async with self.lock:
            await self._set_status("checking")
            warnings = []
            try:
                results = {}
                for key, coro in (
                    ("pacman", self._check_pacman()),
                    ("aur", self._check_aur()),
                    ("flatpak", self._check_flatpak()),
                    ("fwupd", self._check_fwupd()),
                ):
                    entries, warning = await coro
                    results[key] = entries
                    if warning:
                        warnings.append(warning)

                self.state.details = results
                self.state.counts = {k: len(v) for k, v in results.items()}
                self.state.last_check = time.time()
                self.state.warnings = warnings
                self.state.error_text = ""
                self._save_state()
            except Exception as exc:
                decky.logger.exception("Update check failed")
                self.state.error_text = str(exc)
            finally:
                await self._set_status("idle")
        return self.state.to_dict()

    # -- updating ----------------------------------------------------------

    def _enabled_phases(self):
        phases = ["keyring", "pacman"]
        if self.settings["enable_aur"] and _which("yay"):
            phases.append("aur")
        if self.settings["enable_flatpak"] and _which("flatpak"):
            phases.append("flatpak_system")
            if _can_run_as_user():
                phases.append("flatpak_user")
        if self.settings["enable_fwupd"] and _which("fwupdmgr"):
            phases.append("fwupd")
        return phases

    async def _phase_keyring(self, **kw):
        # Upgrading the keyring before the rest is the documented cure for the
        # classic "invalid or corrupted package (PGP signature)" failure. Only
        # valid as one atomic sequence with the -Su right after it, otherwise
        # it would be a partial upgrade.
        pkgs = [p for p in ("archlinux-keyring", "cachyos-keyring") if _installed(p)]
        cmd = ["pacman", "-Sy", "--noconfirm", "--color", "never"]
        if pkgs:
            cmd += ["--needed"] + pkgs
        rc, lines = await self._run(cmd, **kw)
        return rc == 0, lines

    async def _phase_pacman(self, **kw):
        rc, lines = await self._run(
            [
                "pacman", "-Su", "--noconfirm",
                "--noprogressbar", "--color", "never",
            ],
            **kw,
        )
        return rc == 0, lines

    async def _phase_aur(self, **kw):
        rc, lines = await self._run(
            [
                _which("yay") or "yay", "-Syu", "--noconfirm", "--removemake",
                "--noprogressbar", "--color", "never",
            ],
            env=_yay_env(),
            **kw,
        )
        return rc == 0, lines

    async def _phase_flatpak_system(self, **kw):
        # --system is not optional here: without an explicit scope flatpak
        # updates the system installation *and the calling user's* one, which
        # as root means it would start populating /root/.local/share/flatpak.
        # --noninteractive already implies -y and picks the quiet transaction.
        rc, lines = await self._run(
            [
                _which("flatpak") or "flatpak",
                "update", "--system", "--noninteractive",
            ],
            **kw,
        )
        return rc == 0, lines

    async def _phase_flatpak_user(self, **kw):
        cmd, env = _user_cmd(
            [
                _which("flatpak") or "flatpak",
                "update", "--user", "--noninteractive",
            ]
        )
        rc, lines = await self._run(cmd, env=env, **kw)
        return rc == 0, lines

    async def _phase_fwupd(self, **kw):
        fwupdmgr = _which("fwupdmgr") or "fwupdmgr"
        # No --force: it would re-download the metadata on every single run,
        # which is wasteful on a battery-powered handheld. Fresh metadata
        # simply exits 2 (EXIT_NOTHING_TO_DO), which is a success here.
        rc, lines = await self._run([fwupdmgr, "refresh", "--assume-yes"], **kw)
        if rc == 101:  # ENETUNREACH
            await self._log("!! Firmware server unreachable - skipped.")
            return True, lines
        rc, update_lines = await self._run(
            [
                fwupdmgr, "update", "--assume-yes", "--no-reboot-check",
                "--no-unreported-check", "--no-remote-check",
            ],
            **kw,
        )
        lines += update_lines
        # 0 = done, 2 = EXIT_NOTHING_TO_DO, 101 = network unreachable.
        return rc in (0, 2, 101), lines

    async def start_update(self, dry_run=False):
        if self.lock.locked():
            return {"started": False, "reason_id": "already_running"}
        if not _is_root() and not dry_run:
            return {"started": False, "reason_id": "not_root"}
        if _pacman_busy() and not dry_run:
            return {"started": False, "reason_id": "pacman_busy"}
        asyncio.create_task(self._do_update(dry_run))
        return {"started": True, "reason_id": ""}

    async def _do_update(self, dry_run=False):
        async with self.lock:
            self._dry_run = dry_run
            self.state.log.clear()
            self.state.error_text = ""
            self.state.hint_id = ""
            self.state.warnings = []
            self.state.failed_phases = []
            self.state.failed_packages = []
            self.state.progress = 0.0
            self.state.download_mib = 0.0
            self.state.downloading = False
            self.state.update_started = time.time()
            self._open_update_log()
            await self._set_status("updating")

            phases = self._enabled_phases()
            total_weight = sum(PHASE_WEIGHTS[p] for p in phases)
            done_weight = 0
            all_output = []

            handlers = {
                "keyring": self._phase_keyring,
                "pacman": self._phase_pacman,
                "aur": self._phase_aur,
                "flatpak_system": self._phase_flatpak_system,
                "flatpak_user": self._phase_flatpak_user,
                "fwupd": self._phase_fwupd,
            }

            try:
                for phase in phases:
                    weight = PHASE_WEIGHTS[phase]
                    await self._set_phase(phase, done_weight, total_weight)
                    ok, lines = await handlers[phase](
                        phase_base=done_weight / total_weight,
                        phase_span=weight / total_weight,
                    )
                    all_output += lines
                    done_weight += weight
                    if not ok:
                        self.state.failed_phases.append(phase)
                        await self._log(f"!! Phase failed: {phase}")
                        # The repo upgrade is the foundation - if it breaks,
                        # building AUR packages on top of it is a bad idea.
                        if phase in ("keyring", "pacman"):
                            break

                self.state.progress = 1.0
                _invalidate_installed_cache()
                self.state.reboot_required = self._needs_reboot(all_output)
                if "fwupd" in phases and not self.state.reboot_required:
                    self.state.reboot_required = await self._firmware_reboot_pending()
                self.state.pacnew = await self._find_pacnew()
                self.state.last_update = time.time()

                if self.state.failed_phases:
                    self.state.status = "error"
                    self.state.hint_id = self._hint_for(all_output)
                    self.state.failed_packages = self._failed_packages(all_output)
                else:
                    self.state.status = "done"
            except Exception as exc:
                decky.logger.exception("Update failed")
                self.state.status = "error"
                self.state.error_text = str(exc)
            finally:
                self._dry_run = False
                self._close_update_log()
                await decky.emit("cachyos_update_state", self.state.status)
                await decky.emit(
                    "cachyos_update_finished",
                    self.state.status == "done",
                    self.state.failed_phases,
                    self.state.reboot_required,
                )

            # Only a successful run means "nothing pending" - after a failure
            # the old counts stay, otherwise the panel would claim the system
            # is up to date while the updates are still sitting there.
            if not dry_run and self.state.status == "done":
                self.state.details = {k: [] for k in self.state.details}
                self.state.counts = {k: 0 for k in self.state.counts}
                self._save_state()

    # -- post-update analysis ---------------------------------------------

    def _failed_packages(self, lines):
        """Names yay reported as unbuildable, in order, without duplicates."""
        found = []
        collecting = False
        for line in lines:
            if FAILED_HEADER in line:
                collecting = True
                continue
            if not collecting:
                continue
            match = FAILED_PKG_RE.match(line.strip())
            if match:
                name = match.group(1)
                if name not in found:
                    found.append(name)
            elif line.strip():
                collecting = False
        return found

    def _hint_for(self, lines):
        blob = "\n".join(lines).lower()
        for marker, hint_id in ERROR_HINTS:
            if marker in blob:
                return hint_id
        return ""

    def _needs_reboot(self, output_lines):
        """True if the running kernel no longer matches what is installed.

        Primary signal is the same one cachy-update uses: the module tree of
        the running kernel still has its vmlinuz. Skipped when
        kernel-modules-hook or mkmm is installed, because those keep old module
        trees around and would make the test always pass.
        """
        try:
            if not (_installed("kernel-modules-hook") or _installed("mkmm")):
                release = os.uname().release
                if not Path(f"/usr/lib/modules/{release}/vmlinuz").is_file():
                    return True
        except Exception as exc:
            decky.logger.warning("Kernel check failed: %s", exc)

        # Cross-check: did this run upgrade anything from the reboot list?
        upgraded = {
            match.group(1)
            for line in output_lines
            for match in [UPGRADING_RE.search(line)]
            if match
        }
        return any(
            pattern.match(pkg)
            for pkg in upgraded
            for pattern in REBOOT_TRIGGER_PATTERNS
        )

    async def _firmware_reboot_pending(self):
        """Firmware is staged to the ESP and flashed on the next boot.

        `--no-reboot-check` suppresses the prompt but not the need, so ask
        fwupd explicitly. Exit 0 means a reboot IS pending, 2 means clean.
        """
        fwupdmgr = _which("fwupdmgr")
        if not fwupdmgr or self._dry_run:
            return False
        rc, _ = await self._run(
            [fwupdmgr, "check-reboot-needed"], stream=False, merge_stderr=False
        )
        return rc == 0

    async def _find_pacnew(self):
        if not _which("pacdiff"):
            return []
        env = _base_env()
        env["DIFFPROG"] = "/bin/true"
        rc, lines = await self._run(["pacdiff", "--output"], env=env, stream=False)
        if rc != 0:
            return []
        return [l.strip() for l in lines if l.strip().startswith("/")]

    # -- frontend API ------------------------------------------------------

    async def get_state(self):
        return self.state.to_dict()

    async def get_settings(self):
        return self.settings

    async def set_settings(self, settings):
        for key in DEFAULT_SETTINGS:
            if key in settings:
                self.settings[key] = settings[key]
        self._save_settings()
        return self.settings

    async def reboot(self):
        if self._dry_run:
            return True
        await self._run(["systemctl", "reboot"], stream=False)
        return True

    async def self_test(self):
        tools = {}
        # (binary, version args, substrings that identify the relevant line)
        for name, args, match in (
            ("pacman", ["-Q", "pacman"], ()),
            ("yay", ["--version"], ()),
            ("paru", ["--version"], ()),
            ("checkupdates", None, ()),
            ("pacdiff", None, ()),
            ("flatpak", ["--version"], ()),
            # fwupdmgr prints a compile/runtime table, not a single line.
            ("fwupdmgr", ["--version"], ("runtime", "org.freedesktop.fwupd")),
            ("runuser", None, ()),
            ("systemd-run", ["--version"], ()),
            ("fakeroot", None, ()),
        ):
            path = _which(name)
            entry = {"found": bool(path), "path": path or "", "version": ""}
            if path and args:
                try:
                    rc, lines = await self._run(
                        [path] + args, stream=False, merge_stderr=False
                    )
                    if rc == 0:
                        for line in lines:
                            text = " ".join(line.split())
                            if not text:
                                continue
                            if match:
                                if all(m in text for m in match):
                                    entry["version"] = text[:80]
                                    break
                            elif any(c.isdigit() for c in text):
                                entry["version"] = text[:80]
                                break
                except Exception:
                    pass
            tools[name] = entry

        return {
            "root": _is_root(),
            "uid": os.geteuid(),
            "standalone": STANDALONE,
            "decky_user": getattr(decky, "DECKY_USER", ""),
            "decky_user_home": getattr(decky, "DECKY_USER_HOME", ""),
            "kernel": os.uname().release,
            "kernel_vmlinuz_present": Path(
                f"/usr/lib/modules/{os.uname().release}/vmlinuz"
            ).is_file(),
            "pacman_busy": _pacman_busy(),
            "tools": tools,
            "settings": self.settings,
        }

    # -- background check --------------------------------------------------

    async def _auto_check_loop(self):
        # Let the session settle before hitting the network.
        await asyncio.sleep(30)
        while True:
            try:
                if self.settings["auto_check"]:
                    await self.check_updates()
                    total = sum(self.state.counts.values())
                    if total and self.settings["notify_on_updates"]:
                        await decky.emit("cachyos_update_available", total)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                decky.logger.warning("Automatic check failed: %s", exc)
            hours = max(1, int(self.settings.get("check_interval_hours", 6)))
            await asyncio.sleep(hours * 3600)


# --------------------------------------------------------------------------
# standalone entry point (development only)
# --------------------------------------------------------------------------


async def _cli():
    plugin = Plugin()
    plugin._load_settings()
    args = sys.argv[1:]

    if "--selftest" in args:
        result = await plugin.self_test()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if not result["root"]:
            print("\nNote: not running as root - expected during development.")
        return

    if "--check" in args:
        state = await plugin.check_updates()
        print(json.dumps(
            {
                "counts": state["counts"],
                "total": state["total"],
                "warnings": state["warnings"],
                "details": state["details"],
            },
            indent=2,
            ensure_ascii=False,
        ))
        return

    if "--update" in args:
        dry = "--dry-run" in args
        if not dry and not _is_root():
            print("A real update needs root. Use --dry-run to test.")
            return
        if dry:
            # Enable every phase so the dry run shows all command lines.
            plugin.settings["enable_fwupd"] = True
        await plugin._do_update(dry_run=dry)
        print(f"\nStatus: {plugin.state.status}")
        if plugin.state.failed_phases:
            print(f"Failed phases: {', '.join(plugin.state.failed_phases)}")
        if plugin.state.error_text:
            print(f"Error: {plugin.state.error_text}")
        return

    print(__doc__)


if __name__ == "__main__":
    asyncio.run(_cli())
