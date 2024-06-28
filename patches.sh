#!/usr/bin/env sh

if ! patch -R -p0 --dry-run --silent < patches/getLogs-disable-limits.diff 2>/dev/null; then
    patch -p0 < patches/getLogs-disable-limits.diff
fi

if ! patch -R -p0 --dry-run --silent < patches/transactionFormatter.diff 2>/dev/null; then
    patch -p0 < patches/transactionFormatter.diff
fi
