#!/usr/bin/env sh

for i in ./patches/*.diff; do 
    if patch -Np0 -f -s --dry-run < $i; then
        patch -Np0 -f < $i
    fi
done