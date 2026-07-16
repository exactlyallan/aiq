# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""Guardrails for AI-Q's NeMo Agent Toolkit version baseline."""

import tomllib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NAT_VERSION = "1.6.0"

ROOT_NAT_REQUIREMENTS = {
    f"nvidia-nat-core=={NAT_VERSION}",
    # MCP is part of the backend integration surface in the UI Slim baseline.
    # Keep the extra set exact so a future dependency edit cannot silently
    # remove the package required by configured MCP connections.
    f"nvidia-nat[langchain,async_endpoints,phoenix,mcp]=={NAT_VERSION}",
    f"nvidia-nat-eval=={NAT_VERSION}",
    f"nvidia-nat-profiler=={NAT_VERSION}",
}

BENCHMARK_PYPROJECTS = (
    ROOT / "frontends/benchmarks/deepsearch_qa/pyproject.toml",
    ROOT / "frontends/benchmarks/freshqa/pyproject.toml",
)

LOCKED_NAT_PACKAGES = (
    "nvidia-nat",
    "nvidia-nat-core",
    "nvidia-nat-eval",
    "nvidia-nat-profiler",
)


def _load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def test_root_project_pins_nat_16_dependencies() -> None:
    pyproject = _load_toml(ROOT / "pyproject.toml")
    dependencies = set(pyproject["project"]["dependencies"])

    assert ROOT_NAT_REQUIREMENTS <= dependencies


@pytest.mark.parametrize("pyproject_path", BENCHMARK_PYPROJECTS)
def test_benchmark_evaluators_pin_nat_eval_16(pyproject_path: Path) -> None:
    pyproject = _load_toml(pyproject_path)
    dependencies = set(pyproject["project"]["dependencies"])

    assert f"nvidia-nat-eval=={NAT_VERSION}" in dependencies


@pytest.mark.parametrize("package_name", LOCKED_NAT_PACKAGES)
def test_uv_lock_resolves_core_nat_packages_to_16(package_name: str) -> None:
    lockfile = _load_toml(ROOT / "uv.lock")
    versions = {package["name"]: package["version"] for package in lockfile["package"]}

    assert versions[package_name] == NAT_VERSION
