# Logica 2.1 – Serial Edition: ROM patcher

**Use it:** https://stefanskotte.github.io/logica21-patcher/

A web page that patches your own dumps of Logica *THE DIAGNOSTIC 2.0*
(the A1200/A4000 hi and lo EPROMs, or one 512 KB emulator or 16-bit image) into Logica 2.1 – Serial Edition. It
runs in your browser, and nothing is uploaded.

Logica 2.1 adds a text console on the parallel port (and the serial port)
to the original program. Every screen and menu is sent to a VT100 terminal,
and the menus can be driven from the terminal's keyboard. This means you
can diagnose an Amiga whose video output is dead. Logica's tests are
unchanged. The page lists what the patch does and what changed in each
update.

## What is in this repository

- `index.html`: the page.
- `patcher.js`: the patcher.
- `patch-data.json`: the patch, consisting of:
  - our own 68k code for Logica's free ROM area;
  - the list of patch sites;
  - the SHA-256 of the genuine Logica 2.0 image the patch applies to;
  - the changelog.
- `logica21-console-cable.pdf`: the console cable wiring sheet.

This repository contains no Logica code or data, and no ROM images. The
patcher only works on a genuine Logica 2.0 image, which it recognises by its
hash. It derives the edited title text and logo from your own files, in
your browser.

These files are generated from the private development repository and
published with each patch update.

## Credits

*THE DIAGNOSTIC 2.0* is © Logica S.N.C., who wrote the original program and
its tests. Logica 2.1 – Serial Edition is an independent patch, not
affiliated with or endorsed by Logica. It is provided as is, without
warranty.
