#!/usr/bin/env bash
# Download a sample of complete, explicit, M/M, English AO3 one-shots for evaluation.
# Usage: scripts/fetch-ao3.sh [count=8] [outdir=ao3-samples]
#
# Filters: Explicit (13), M/M (23), "No Archive Warnings Apply" (16), complete, not a crossover,
# 1,000–12,000 words, sorted by kudos. Only work IDs are printed, so tags aren't seen before reading.
# Files are for local testing only and are git-ignored; don't commit or redistribute them.
set -euo pipefail
COUNT="${1:-8}"
OUT="${2:-ao3-samples}"
mkdir -p "$OUT"
UA="topbottom-eval (personal testing; contact via github.com/ihardlynoah/topbottom)"
SEARCH='https://archiveofourown.org/works/search?commit=Search&view_adult=true&work_search%5Bcomplete%5D=T&work_search%5Bcrossover%5D=F&work_search%5Blanguage_id%5D=en&work_search%5Brating_ids%5D=13&work_search%5Bcategory_ids%5D%5B%5D=23&work_search%5Barchive_warning_ids%5D%5B%5D=16&work_search%5Bword_count%5D=1000-12000&work_search%5Bsort_column%5D=kudos_count&work_search%5Bsort_direction%5D=desc'
ids=$(curl -sS -A "$UA" --max-time 60 "$SEARCH" | grep -o 'id="work_[0-9]*"' | grep -o '[0-9]*' | head -n "$COUNT")
[ -n "$ids" ] || { echo "No results (blocked, rate-limited, or AO3 changed its markup)." >&2; exit 1; }
for id in $ids; do
  sleep 6 # be polite to AO3
  curl -sS -L -A "$UA" --max-time 60 -o "$OUT/$id.html" "https://archiveofourown.org/downloads/$id/work.html?view_adult=true"
  echo "fetched $id"
done
