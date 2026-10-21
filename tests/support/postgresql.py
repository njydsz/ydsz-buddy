"""Helpers for gated live-PostgreSQL tests.

Prefer a dedicated database (tests may ``DROP SCHEMA public CASCADE``)::

    export YDSZ_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:15432/ydsz_test'
"""

from __future__ import annotations

import os

import pytest

requires_postgresql = pytest.mark.skipif(
    not os.environ.get("YDSZ_TEST_DATABASE_URL"),
    reason="set YDSZ_TEST_DATABASE_URL to run PostgreSQL tests",
)
