#!/usr/bin/env sh

patch -p0 --silent < patches/getLogs-disable-limits.diff
patch -p0 --silent < patches/transactionFormatter.diff
