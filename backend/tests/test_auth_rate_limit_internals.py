"""Unit tests for app.auth 失败限频内部行为。

聚焦验证：
- 失败窗口外条目过期后 _fail_log 不残留空 key（内存泄漏修复）；
- 邮箱大小写/空白规范化，避免限频被绕过；
- 全局键数硬上限，防止短时间海量陌生邮箱撑爆内存。
"""

import time

import pytest

from app import auth


@pytest.fixture(autouse=True)
def _clean_log():
    auth._fail_log.clear()
    yield
    auth._fail_log.clear()


def test_record_failure_normalizes_email_case_and_whitespace():
    auth.record_failure("Foo@Bar.com")
    auth.record_failure("  foo@bar.com ")
    # 三次写入但规范化后只占一个 key
    auth.record_failure("FOO@BAR.COM")
    assert list(auth._fail_log.keys()) == ["foo@bar.com"]
    assert len(auth._fail_log["foo@bar.com"]) == 3


def test_rate_limited_uses_normalized_key():
    for _ in range(auth._MAX_FAILS):
        auth.record_failure("attacker@example.com")
    # 不同大小写应该触发同一限频桶
    assert auth.rate_limited("Attacker@Example.com") is True


def test_rate_limited_evicts_empty_key_after_window(monkeypatch):
    base = 1_000_000.0
    monkeypatch.setattr(auth.time, "monotonic", lambda: base)
    auth.record_failure("user@x.com")
    assert "user@x.com" in auth._fail_log

    # 跨过窗口后 rate_limited 应清理空桶
    monkeypatch.setattr(auth.time, "monotonic", lambda: base + auth._WINDOW + 1)
    assert auth.rate_limited("user@x.com") is False
    assert "user@x.com" not in auth._fail_log


def test_record_failure_bounded_under_flood(monkeypatch):
    """模拟攻击者用大量不同邮箱失败登录，_fail_log 必须有界。"""
    monkeypatch.setattr(auth, "_MAX_TRACKED_EMAILS", 50)
    # 注入 200 个不同的"过期"邮箱
    base = 1_000.0
    monkeypatch.setattr(auth.time, "monotonic", lambda: base)
    for i in range(200):
        auth.record_failure(f"u{i}@x.com")
    # 触顶后字典严格有界
    assert len(auth._fail_log) <= 50


def test_evict_expired_drops_expired_buckets(monkeypatch):
    base = 500.0
    monkeypatch.setattr(auth.time, "monotonic", lambda: base)
    auth.record_failure("a@x.com")
    auth.record_failure("b@x.com")

    monkeypatch.setattr(auth.time, "monotonic", lambda: base + auth._WINDOW + 10)
    auth._evict_expired(time.monotonic())
    assert auth._fail_log == {}


def test_reset_failures_is_case_insensitive():
    auth.record_failure("foo@bar.com")
    auth.reset_failures("FOO@BAR.COM")
    assert "foo@bar.com" not in auth._fail_log
