#!/bin/zsh
cd /Users/tobiaslauritsen/boarding-pass-studio || exit 1
node scripts/verify-free-service.mjs
print '\nPress Enter to close.'
read
