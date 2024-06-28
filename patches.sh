#!/usr/bin/env sh

if ! patch -p0 --dry-run --silent < patches/getLogs-disable-limits.diff 2>/dev/null; then
    patch -p0 < patches/getLogs-disable-limits.diff
fi
