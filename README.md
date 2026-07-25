# CachyOS Update

Update CachyOS handheld edition straight from gamemode.

It updates your system packages, AUR packages and Flatpaks, and shows you what
it is doing while it runs. Firmware updates can be switched on too, but they
are experimental and off by default.

## Install

```bash
curl -sSL https://raw.githubusercontent.com/Felitendo/decky-cachyos-update/main/install.sh | sh
```

You need [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
installed first. The script takes care of the rest and asks for your password
once.

After that, open the Decky menu in gamemode and you will find "CachyOS Update"
in the list.

## How to use it

Open the plugin and press **Update now**. That is it.

While it runs you see a progress bar and the current step. If you want the
details, press **Show output** to see everything scroll by. You can close the
menu and come back later, the update keeps running.

There are two other buttons:

* **Check for updates** looks for updates without installing anything.
* **Restart now** only shows up when an update actually needs a restart.

The plugin also checks for updates on its own every few hours and tells you
when something is available. It never installs anything by itself.

## Settings

You can turn each part on or off:

* AUR packages
* Flatpaks
* Firmware (off by default)
* Automatic background checks
* Notifications

There is also a **Self-test** button. If something is not working, press it
first. It tells you whether the plugin has the permissions it needs and which
tools it found.

## Good to know

**You cannot cancel a running update.** Stopping halfway through can leave your
system broken, so there is no cancel button on purpose.

**Sometimes an update needs you.** If two packages disagree about a file, the
plugin stops and tells you instead of forcing it through. It is rare, and the
full output tells you which package it was.

**`.pacnew` files are left alone.** When a package ships a new default for a
file you changed, pacman writes it alongside yours and the plugin ignores it,
exactly like `cachy-update` does. Some of those files are managed by CachyOS
itself, and replacing them can break your system.

**Firmware is off by default.** A failed firmware update cannot be undone, so
you have to switch it on yourself if you want it.

**No password is stored anywhere.** The plugin runs with the permissions Decky
already has, so it never needs to ask. See below for how AUR builds get their
permissions.

## Something went wrong

Run the self-test in the settings first. If that looks fine, the full output of
the last update is here:

```
~/homebrew/logs/CachyOSUpdate/update.log
```

## For developers

```bash
pnpm install && pnpm run build
```

The backend runs without Decky, so you can test it on a normal machine:

```bash
python3 main.py --selftest          # what is installed, are we root
python3 main.py --check             # real check, changes nothing
python3 main.py --update --dry-run  # prints the commands, runs nothing
```

To add a language, add one dictionary to [`src/i18n.ts`](src/i18n.ts). The
backend only returns ids, never text, so that file is the only place with
wording in it.

## How AUR packages get built

Building has to happen as your user, installing has to happen as root. yay can
run as root and sandbox the build itself, but that sandbox puts the build
directory under `/var/cache/private`, which the build is not allowed to run
programs from, so anything that actually compiles fails there.

So the plugin runs yay as you, and grants passwordless pacman access for the
length of the update by writing `/etc/sudoers.d/50-decky-cachyos-update`. The
file is checked with `visudo` before it is installed, because a broken file
there would break `sudo` completely. It is removed right afterwards, and again
when the plugin starts and stops, so a crash cannot leave it behind.

Worth knowing what that means: while an update runs, your user can call pacman
as root without a password. It is a short window that you started yourself, but
it is real.
