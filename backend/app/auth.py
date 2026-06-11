import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.models.models import User

# 鉴权（PRD §5.4 / dev_doc §7.1）：argon2id 哈希 + JWT 签发校验 + 登录失败限频。

_ph = PasswordHasher()
_ALGO = "HS256"
_TOKEN_TTL = timedelta(days=7)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MIN_PASSWORD = 8

# 登录失败限频：每邮箱 5 次 / 60s（PRD §5.4.2 防暴力破解）
#
# 实现要点：
# 1) key 统一规范化（trim + lower），避免大小写/空白差异绕过限频；
# 2) 失败记录窗口过期后立即驱逐，避免 _fail_log 随陌生邮箱无限膨胀（OOM/DoS 面）；
# 3) 设置全局键数硬上限 _MAX_TRACKED_EMAILS，触顶时整体扫描清理过期键，
#    必要时按 FIFO 丢弃最老一条记录，保证有界内存。
_MAX_FAILS = 5
_WINDOW = 60.0
_MAX_TRACKED_EMAILS = 10_000
_fail_log: dict[str, deque] = {}


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _evict_expired(now: float) -> None:
    """清理所有窗口外的失败记录条目；已无记录的 key 直接删除。"""
    expired_keys: list[str] = []
    for key, log in _fail_log.items():
        while log and now - log[0] > _WINDOW:
            log.popleft()
        if not log:
            expired_keys.append(key)
    for key in expired_keys:
        _fail_log.pop(key, None)

_bearer = HTTPBearer(auto_error=False)


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email or ""))


def valid_password(pw: str) -> bool:
    return isinstance(pw, str) and len(pw) >= _MIN_PASSWORD


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + _TOKEN_TTL}
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGO)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGO])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


def rate_limited(email: str) -> bool:
    """该邮箱在窗口内失败次数是否已达上限。"""
    now = time.monotonic()
    key = _normalize_email(email)
    log = _fail_log.get(key)
    if log is None:
        return False
    while log and now - log[0] > _WINDOW:
        log.popleft()
    if not log:
        # 窗口外条目已全部驱逐，立即删除空 key，避免内存泄漏。
        _fail_log.pop(key, None)
        return False
    return len(log) >= _MAX_FAILS


def record_failure(email: str) -> None:
    now = time.monotonic()
    key = _normalize_email(email)
    log = _fail_log.get(key)
    if log is None:
        # 接近上限时主动做一次全局过期清理，避免 _fail_log 无界增长。
        if len(_fail_log) >= _MAX_TRACKED_EMAILS:
            _evict_expired(now)
        # 清理后若仍触顶（极端攻击场景：短时间内大量不同邮箱失败），
        # 丢弃最早创建的一条记录，保证字典严格有界。
        if len(_fail_log) >= _MAX_TRACKED_EMAILS:
            try:
                oldest_key = next(iter(_fail_log))
                _fail_log.pop(oldest_key, None)
            except StopIteration:
                pass
        log = deque()
        _fail_log[key] = log
    log.append(now)


def reset_failures(email: str) -> None:
    _fail_log.pop(_normalize_email(email), None)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录"
        )
    user_id = decode_token(creds.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="凭证无效或过期"
        )
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在"
        )
    return user


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).first()
