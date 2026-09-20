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

The plugin also checks for updates on its own every few hours. By default it
just tells you, and only once at least 50 updates are waiting, so a couple of
small packages will not nag you.

If you turn on **Install updates automatically** in the settings, it installs
them on its own instead. It never interrupts a game: when one is running it
waits for the next check.

## Settings

You can turn each part on or off:

* AUR packages
* Flatpaks
* Firmware (off by default)
* Automatic background checks
* Automatic installation (off by default)
* Notifications, and how many updates have to be waiting before you get one
  (1, 10, 25, 50 or 100)

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

**A stuck package database fixes itself.** If pacman or Pamac is killed halfway
through, it leaves a lock file behind and every later update dies with "unable
to lock database". The plugin checks whether any process still has that file
open, and if none does it simply removes it - on start, before every check and
before and after every update. If a package manager really is running, it says
so and waits instead.

**One out-of-sync package does not stop the rest.** Some packages pin a library
to an exact version, so the two can only be upgraded together. Every now and
then they get out of step - CachyOS rebuilds ahead of Arch, Arch's multilib
repository trails behind, or the package pinning it comes from the AUR and has
to be rebuilt first - and pacman refuses the entire transaction over it. The
plugin holds that pair back, installs everything else, and tells you which
packages are waiting. It catches up on its own once the missing rebuild lands.

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
sudo python3 main.py --fix-lock     # report on the pacman lock, clear an orphan
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
