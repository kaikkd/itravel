from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app import auth
from app.db import get_session
from app.models.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str


class UserOut(BaseModel):
    id: int
    email: str


@router.post("/register", response_model=TokenOut)
def register(
    body: Credentials, session: Session = Depends(get_session)
) -> TokenOut:
    if not auth.valid_email(body.email):
        raise HTTPException(status_code=422, detail="邮箱格式不正确")
    if not auth.valid_password(body.password):
        raise HTTPException(status_code=422, detail="密码至少 8 位")
    if auth.get_user_by_email(session, body.email) is not None:
        raise HTTPException(status_code=409, detail="邮箱已注册")

    user = User(email=body.email, password_hash=auth.hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)

    token = auth.create_access_token(user.id)
    return TokenOut(access_token=token, user_id=user.id, email=user.email)


@router.post("/login", response_model=TokenOut)
def login(body: Credentials, session: Session = Depends(get_session)) -> TokenOut:
    if auth.rate_limited(body.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试",
        )
    user = auth.get_user_by_email(session, body.email)
    if user is None or not auth.verify_password(body.password, user.password_hash):
        auth.record_failure(body.email)
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    auth.reset_failures(body.email)
    token = auth.create_access_token(user.id)
    return TokenOut(access_token=token, user_id=user.id, email=user.email)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(auth.get_current_user)) -> UserOut:
    return UserOut(id=current.id, email=current.email)
