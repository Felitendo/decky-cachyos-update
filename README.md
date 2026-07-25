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
plugin stops and tells you instead of forcing it through. Those cases have to
be sorted out in desktop mode. It is rare.

**Firmware is off by default.** A failed firmware update cannot be undone, so
you have to switch it on yourself if you want it.

**No password is stored anywhere.** The plugin runs with the permissions Decky
already has, so it never needs to ask.

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

## Why yay and not paru

`paru` refuses to run as root and offers no way around it. `yay` handles it
properly: it runs pacman directly and drops privileges for building packages.
That is why this plugin does not need to touch your sudo configuration.
