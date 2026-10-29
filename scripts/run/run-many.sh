#!/bin/bash
# Sequential driver, one wdio session per spec: scripts/run/run-many.sh <target> ep01 ep02 …
# Stops on the first FAIL (exit 1) or LOCKED / wrong AVD (exit 3). ATTEMPT=n sets the attempt number in log names.
set -u
cd "$(dirname "$0")/../.."
t="${1:?usage: $0 <target> ep01 ep02 …}"; shift
for n in "$@"; do
  bash scripts/run/run-one.sh "$t" "$n" "${ATTEMPT:-1}"; rc=$?
  [ $rc -eq 3 ] && { echo "STOP locked/wrong device before $n"; exit 3; }
  [ $rc -ne 0 ] && { echo "STOP $n exit $rc"; exit 1; }
done
echo "BATCH DONE $t: $*"
