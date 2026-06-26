#!/bin/sh
# Container entrypoint for the Machine 3 observability stack.
# Fail-fast configuration validation, THEN hand off (PID 1) to the real command
# (supervisord, from the Dockerfile CMD). `exec` preserves signal handling.
set -eu

/usr/local/bin/validate-config.sh

exec "$@"
