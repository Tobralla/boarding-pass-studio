#!/bin/zsh
cd /Users/tobiaslauritsen/boarding-pass-studio || exit 1
print 'Starting PassPort Studio…'
print 'Open http://127.0.0.1:5173 after the ready message appears.'
print 'Keep this Terminal window open while using the website.'
npm run dev
