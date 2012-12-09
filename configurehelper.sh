#!/bin/sh

set -e

`dirname $0`/configure --with-system-libxul --disable-strip --disable-ogg --disable-wave --disable-dbus --disable-libnotify --disable-necko-wifi --disable-crashreporter --disable-webm --disable-libjpeg-turbo --disable-tests --disable-elf-hack --disable-webrtc "$@"
