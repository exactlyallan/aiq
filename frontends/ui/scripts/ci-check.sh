#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

MODE="full"

for arg in "$@"; do
  case "$arg" in
    --quick)
      MODE="quick"
      ;;
    --no-clean)
      # Kept for compatibility with the package.json ci:fast script.
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--quick] [--no-clean]" >&2
      exit 2
      ;;
  esac
done

run_step() {
  local name="$1"
  shift

  echo
  echo "==> ${name}"
  "$@"
}

run_package_script() {
  local script_name="$1"
  shift

  if command -v npm >/dev/null 2>&1; then
    npm run "$script_name"
    return
  fi

  PATH="$PWD/node_modules/.bin:$PATH" "$@"
}

run_step "Lint" run_package_script lint eslint src --ext .ts,.tsx
run_step "Type check" run_package_script type-check tsc --noEmit
run_step "Unit tests" run_package_script test env TZ=UTC vitest --no-watch

if [[ "$MODE" != "quick" ]]; then
  run_step "Build" run_package_script build next build
fi
