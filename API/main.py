from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
from fastapi.responses import StreamingResponse
import gzip
import io
import json
from fastapi import Request, Query
import numpy as np
from fastapi import HTTPException
from fastapi.responses import PlainTextResponse
from Generate_Optimize_Pyrobi_test import optimize_my_team
from Generate_Fetch_Myteam import build_team_dataframe
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from GenerateConfig import fixtures_config,Player_picture_url,current_season
from queue import Queue
from threading import Thread, Lock, BoundedSemaphore
import traceback
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import psycopg2
import requests
import jwt
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

RAW_DATA_DIR = f"Raw_Data_{current_season}"


class PlayerInput(BaseModel):
    name: str
    web_name: str
    Team: int
    GW: int
    position: str
    value: float
    Points: float   # from PlayerAdjustmentsPage computed Points

class OptimizeRequest(BaseModel):
    team_id: int

    # keep same semantics / defaults as current endpoint
    banned_list: List[str] = []
    force_in_list: List[str] = []
    bb_round: int = 40
    wildcard_round: int = 40
    freehit_round: int = 40
    n_hits: int = 0
    risk:float=0.0
    transval:float=0.5
    stream: bool = False

    # which engine to use
    model_type: Literal["ai", "statistical"] = "ai"

    # optional: passed only when model_type == "statistical"
    players: Optional[List[PlayerInput]] = None
    guest_id: Optional[str] = None


class GuestAuthRequest(BaseModel):
    device_id: Optional[str] = None


class GoogleAuthRequest(BaseModel):
    credential: str


class TrackTeamIdRequest(BaseModel):
    team_id: int


class PageActivityRequest(BaseModel):
    path: str
    duration_seconds: float
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    guest_id: Optional[str] = None


class AdjustmentChangeRequest(BaseModel):
    source: str
    changes: List[dict] = []
    guest_id: Optional[str] = None


class SavedOptimizationUpsertRequest(BaseModel):
    optimization_id: str
    name: str
    created_at: Optional[int] = None
    snapshot: dict
    guest_id: Optional[str] = None


app = FastAPI()
OPTIMIZER_N_SOLUTIONS = 3
RECENT_TEAM_IDS_LIMIT = int(os.getenv("RECENT_TEAM_IDS_LIMIT", "30"))
DATABASE_URL = os.getenv("DATABASE_URL")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
AUTH_JWT_SECRET = os.getenv("AUTH_JWT_SECRET", "").strip() or "change-me-in-render-env"
AUTH_JWT_ALGORITHM = "HS256"
auth_bearer = HTTPBearer(auto_error=False)
MAX_CONCURRENT_OPTIMIZATIONS = max(
    1,
    int(os.getenv("MAX_CONCURRENT_OPTIMIZATIONS", "1")),
)
OPTIMIZATION_BUSY_MESSAGE = (
    "Optimizer is busy. Please retry in a moment."
)
_optimization_semaphore = BoundedSemaphore(MAX_CONCURRENT_OPTIMIZATIONS)
_optimization_count_lock = Lock()
_active_optimization_count = 0


def _optimizer_status_snapshot() -> Dict[str, int]:
    with _optimization_count_lock:
        return {
            "active": int(_active_optimization_count),
            "max": int(MAX_CONCURRENT_OPTIMIZATIONS),
        }


def _acquire_optimization_slot() -> Dict[str, int]:
    acquired = _optimization_semaphore.acquire(blocking=False)
    if not acquired:
        status = _optimizer_status_snapshot()
        raise HTTPException(
            status_code=429,
            detail={
                "message": OPTIMIZATION_BUSY_MESSAGE,
                "active_optimizations": status["active"],
                "max_concurrent_optimizations": status["max"],
            },
        )

    global _active_optimization_count
    with _optimization_count_lock:
        _active_optimization_count += 1
        return {
            "active": int(_active_optimization_count),
            "max": int(MAX_CONCURRENT_OPTIMIZATIONS),
        }


def _release_optimization_slot():
    global _active_optimization_count
    with _optimization_count_lock:
        if _active_optimization_count > 0:
            _active_optimization_count -= 1
    _optimization_semaphore.release()


def _db_dsn() -> str:
    if not DATABASE_URL:
        raise HTTPException(
            status_code=500,
            detail="Database is not configured. Set DATABASE_URL on the API service.",
        )
    dsn = DATABASE_URL
    if "sslmode=" not in dsn and "render.com" in dsn:
        sep = "&" if "?" in dsn else "?"
        dsn = f"{dsn}{sep}sslmode=require"
    return dsn


def _connect_db():
    return psycopg2.connect(_db_dsn())


def _init_auth_tables():
    if not DATABASE_URL:
        print("[auth] DATABASE_URL not set. Auth DB persistence endpoints will fail.")
        return
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_users (
                    id BIGSERIAL PRIMARY KEY,
                    google_sub TEXT UNIQUE NOT NULL,
                    email TEXT,
                    name TEXT,
                    avatar_url TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_login_events (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE,
                    provider TEXT NOT NULL,
                    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_recent_team_ids (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE,
                    team_id INTEGER NOT NULL,
                    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, team_id)
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_recent_team_ids_user_used
                ON user_recent_team_ids (user_id, used_at DESC);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_optimization_events (
                    id BIGSERIAL PRIMARY KEY,
                    provider TEXT NOT NULL,
                    user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
                    guest_id TEXT,
                    team_id INTEGER NOT NULL,
                    model_type TEXT,
                    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                ALTER TABLE app_optimization_events
                ADD COLUMN IF NOT EXISTS predicted_points_solution1 DOUBLE PRECISION;
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_app_optimization_events_created
                ON app_optimization_events (created_at DESC);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_page_activity_events (
                    id BIGSERIAL PRIMARY KEY,
                    provider TEXT NOT NULL,
                    user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
                    guest_id TEXT,
                    page_path TEXT NOT NULL,
                    duration_seconds DOUBLE PRECISION NOT NULL,
                    started_at TIMESTAMPTZ,
                    ended_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_app_page_activity_events_created
                ON app_page_activity_events (created_at DESC);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_adjustment_events (
                    id BIGSERIAL PRIMARY KEY,
                    provider TEXT NOT NULL,
                    user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
                    guest_id TEXT,
                    source TEXT NOT NULL,
                    change_type TEXT,
                    entity_key TEXT,
                    gw INTEGER,
                    old_value DOUBLE PRECISION,
                    new_value DOUBLE PRECISION,
                    details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_app_adjustment_events_created
                ON app_adjustment_events (created_at DESC);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_saved_optimizations (
                    id BIGSERIAL PRIMARY KEY,
                    provider TEXT NOT NULL,
                    user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
                    guest_id TEXT,
                    optimization_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    created_at_client BIGINT,
                    snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_app_saved_opts_google
                ON app_saved_optimizations (provider, user_id, optimization_id)
                WHERE provider = 'google';
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_app_saved_opts_guest
                ON app_saved_optimizations (provider, guest_id, optimization_id)
                WHERE provider = 'guest';
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_app_saved_optimizations_created
                ON app_saved_optimizations (created_at DESC);
                """
            )
        conn.commit()
        print("[auth] Auth tables initialized.")
    finally:
        conn.close()


@app.on_event("startup")
def _startup():
    _init_auth_tables()


def _create_auth_token(payload: dict) -> str:
    now = datetime.now(timezone.utc)
    token_payload = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=30)).timestamp()),
    }
    return jwt.encode(token_payload, AUTH_JWT_SECRET, algorithm=AUTH_JWT_ALGORITHM)


def _decode_auth_token(token: str) -> dict:
    try:
        return jwt.decode(token, AUTH_JWT_SECRET, algorithms=[AUTH_JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid auth token.")


def _auth_payload_required(
    credentials: HTTPAuthorizationCredentials = Depends(auth_bearer),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization token.")
    return _decode_auth_token(credentials.credentials)


def _auth_payload_optional(request: Request) -> Optional[dict]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        return _decode_auth_token(token)
    except Exception:
        return None


def _get_user_by_id(user_id: int) -> Optional[dict]:
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, google_sub, email, name, avatar_url, created_at, last_login_at
                FROM app_users
                WHERE id = %s
                """,
                (int(user_id),),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": int(row[0]),
                "google_sub": row[1],
                "email": row[2],
                "name": row[3],
                "avatar_url": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
                "last_login_at": row[6].isoformat() if row[6] else None,
            }
    finally:
        conn.close()


def _get_recent_team_ids_for_user(user_id: int) -> List[int]:
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT team_id
                FROM user_recent_team_ids
                WHERE user_id = %s
                ORDER BY used_at DESC
                LIMIT %s
                """,
                (int(user_id), RECENT_TEAM_IDS_LIMIT),
            )
            rows = cur.fetchall() or []
            return [int(r[0]) for r in rows if r and r[0] is not None]
    finally:
        conn.close()


def _track_recent_team_id(user_id: int, team_id: int):
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_recent_team_ids (user_id, team_id, used_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (user_id, team_id)
                DO UPDATE SET used_at = EXCLUDED.used_at
                """,
                (int(user_id), int(team_id)),
            )
            cur.execute(
                """
                DELETE FROM user_recent_team_ids
                WHERE user_id = %s
                  AND id NOT IN (
                    SELECT id
                    FROM user_recent_team_ids
                    WHERE user_id = %s
                    ORDER BY used_at DESC
                    LIMIT %s
                  )
                """,
                (int(user_id), int(user_id), RECENT_TEAM_IDS_LIMIT),
            )
        conn.commit()
    finally:
        conn.close()


def _resolve_actor(request: Request, guest_id_hint: Optional[str] = None) -> Dict[str, Any]:
    payload = _auth_payload_optional(request)
    provider = str((payload or {}).get("provider") or "").strip().lower()

    if provider == "google":
        user_id = payload.get("user_id") if payload else None
        return {
            "provider": "google",
            "user_id": int(user_id) if user_id is not None else None,
            "guest_id": None,
            "display_name": "Google User",
        }

    guest_id_from_token = (payload or {}).get("guest_id")
    guest_id_value = (
        str(guest_id_from_token or guest_id_hint or "Guest").strip() or "Guest"
    )
    return {
        "provider": "guest",
        "user_id": None,
        "guest_id": guest_id_value,
        "display_name": "Guest",
    }


def _track_optimization_event(
    request: Request,
    *,
    team_id: int,
    model_type: str,
    settings: Optional[Dict[str, Any]] = None,
    guest_id_hint: Optional[str] = None,
) -> Optional[int]:
    actor = _resolve_actor(request, guest_id_hint=guest_id_hint)
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_optimization_events (
                    provider, user_id, guest_id, team_id, model_type, settings_json
                )
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id
                """,
                (
                    actor["provider"],
                    actor["user_id"],
                    actor["guest_id"],
                    int(team_id),
                    str(model_type or "").strip() or None,
                    json.dumps(settings or {}),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return int(row[0]) if row and row[0] is not None else None
    finally:
        conn.close()


def _update_optimization_event_predicted_points(
    optimization_event_id: Optional[int],
    predicted_points_solution1: Optional[float],
):
    if optimization_event_id is None:
        return
    if predicted_points_solution1 is None:
        return
    points = float(predicted_points_solution1)
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE app_optimization_events
                SET predicted_points_solution1 = %s
                WHERE id = %s
                """,
                (points, int(optimization_event_id)),
            )
        conn.commit()
    finally:
        conn.close()


def _extract_solution1_predicted_points(rows: List[dict]) -> Optional[float]:
    if not isinstance(rows, list) or len(rows) == 0:
        return None

    def _finite(v):
        try:
            n = float(v)
            return n if np.isfinite(n) else None
        except Exception:
            return None

    preferred_keys = [
        "solution_TotalExpectedPoints",
        "solution_total_expected_points",
        "solution_totalexpectedpoints",
        "solution_weighted_sum",
    ]
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in preferred_keys:
            if key in row:
                n = _finite(row.get(key))
                if n is not None:
                    return n

    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("Name", "")).strip().lower()
        if name not in {"objective", "summary", "total"}:
            continue
        n = _finite(row.get("status"))
        if n is not None:
            return n

    return None


def _track_page_activity_event(
    request: Request,
    *,
    path: str,
    duration_seconds: float,
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    guest_id_hint: Optional[str] = None,
):
    actor = _resolve_actor(request, guest_id_hint=guest_id_hint)
    duration = float(duration_seconds or 0.0)
    duration = max(0.0, min(duration, 60.0 * 60.0 * 24.0))
    if duration <= 0:
        return

    normalized_path = str(path or "/").strip()
    if not normalized_path:
        normalized_path = "/"
    normalized_path = normalized_path[:300]

    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_page_activity_events (
                    provider, user_id, guest_id, page_path, duration_seconds, started_at, ended_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    actor["provider"],
                    actor["user_id"],
                    actor["guest_id"],
                    normalized_path,
                    duration,
                    started_at,
                    ended_at,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def _track_adjustment_events(
    request: Request,
    *,
    source: str,
    changes: List[dict],
    guest_id_hint: Optional[str] = None,
):
    if not isinstance(changes, list) or len(changes) == 0:
        return

    actor = _resolve_actor(request, guest_id_hint=guest_id_hint)
    source_value = str(source or "").strip().lower() or "unknown"
    rows_to_insert = []

    for change in changes[:1000]:
        if not isinstance(change, dict):
            continue
        change_type = str(change.get("type") or change.get("change_type") or "").strip() or None
        entity_key = str(
            change.get("playerKey")
            or change.get("teamName")
            or change.get("entity_key")
            or change.get("webName")
            or ""
        ).strip() or None
        gw_value = change.get("gw")
        gw_num = int(gw_value) if gw_value is not None and str(gw_value).strip() != "" and str(gw_value).lstrip("-").isdigit() else None
        old_value = change.get("oldValue")
        new_value = change.get("newValue")
        old_num = float(old_value) if isinstance(old_value, (int, float)) else None
        new_num = float(new_value) if isinstance(new_value, (int, float)) else None

        rows_to_insert.append(
            (
                actor["provider"],
                actor["user_id"],
                actor["guest_id"],
                source_value,
                change_type,
                entity_key,
                gw_num,
                old_num,
                new_num,
                json.dumps(change),
            )
        )

    if not rows_to_insert:
        return

    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO app_adjustment_events (
                    provider, user_id, guest_id, source, change_type, entity_key, gw, old_value, new_value, details_json
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                rows_to_insert,
            )
        conn.commit()
    finally:
        conn.close()


def _saved_opt_actor_key(actor: Dict[str, Any]):
    provider = actor.get("provider") or "guest"
    user_id = actor.get("user_id")
    guest_id = actor.get("guest_id")
    if provider == "google" and user_id is not None:
        return provider, int(user_id), None
    return "guest", None, str(guest_id or "Guest")


def _upsert_saved_optimization(
    request: Request,
    *,
    optimization_id: str,
    name: str,
    snapshot: dict,
    created_at_client: Optional[int] = None,
    guest_id_hint: Optional[str] = None,
):
    actor = _resolve_actor(request, guest_id_hint=guest_id_hint)
    provider, user_id, guest_id = _saved_opt_actor_key(actor)
    opt_id = str(optimization_id or "").strip()
    if not opt_id:
        raise HTTPException(status_code=400, detail="optimization_id is required.")
    opt_name = str(name or "").strip()
    if not opt_name:
        raise HTTPException(status_code=400, detail="name is required.")

    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            common_values = (
                provider,
                user_id,
                guest_id,
                opt_id,
                opt_name,
                int(created_at_client) if created_at_client is not None else None,
                json.dumps(snapshot or {}),
            )
            if provider == "google" and user_id is not None:
                cur.execute(
                    """
                    INSERT INTO app_saved_optimizations (
                        provider, user_id, guest_id, optimization_id, name, created_at_client, snapshot_json, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW(), NOW())
                    ON CONFLICT (provider, user_id, optimization_id) WHERE provider = 'google'
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        created_at_client = EXCLUDED.created_at_client,
                        snapshot_json = EXCLUDED.snapshot_json,
                        updated_at = NOW()
                    """,
                    common_values,
                )
            else:
                cur.execute(
                    """
                    INSERT INTO app_saved_optimizations (
                        provider, user_id, guest_id, optimization_id, name, created_at_client, snapshot_json, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW(), NOW())
                    ON CONFLICT (provider, guest_id, optimization_id) WHERE provider = 'guest'
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        created_at_client = EXCLUDED.created_at_client,
                        snapshot_json = EXCLUDED.snapshot_json,
                        updated_at = NOW()
                    """,
                    common_values,
                )
        conn.commit()
    finally:
        conn.close()


def _list_saved_optimizations(
    request: Request,
    *,
    guest_id_hint: Optional[str] = None,
) -> List[dict]:
    actor = _resolve_actor(request, guest_id_hint=guest_id_hint)
    provider, user_id, guest_id = _saved_opt_actor_key(actor)
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            if provider == "google" and user_id is not None:
                cur.execute(
                    """
                    SELECT optimization_id, name, created_at_client, snapshot_json
                    FROM app_saved_optimizations
                    WHERE provider = 'google' AND user_id = %s
                    ORDER BY COALESCE(created_at_client, 0) DESC, updated_at DESC
                    """,
                    (user_id,),
                )
            else:
                cur.execute(
                    """
                    SELECT optimization_id, name, created_at_client, snapshot_json
                    FROM app_saved_optimizations
                    WHERE provider = 'guest' AND guest_id = %s
                    ORDER BY COALESCE(created_at_client, 0) DESC, updated_at DESC
                    """,
                    (guest_id,),
                )
            rows = cur.fetchall() or []
            out = []
            for r in rows:
                out.append(
                    {
                        "id": r[0],
                        "name": r[1],
                        "createdAt": int(r[2]) if r[2] is not None else None,
                        "snapshot": r[3] if isinstance(r[3], dict) else {},
                    }
                )
            return out
    finally:
        conn.close()


def _delete_saved_optimization(
    request: Request,
    *,
    optimization_id: str,
    guest_id_hint: Optional[str] = None,
):
    actor = _resolve_actor(request, guest_id_hint=guest_id_hint)
    provider, user_id, guest_id = _saved_opt_actor_key(actor)
    opt_id = str(optimization_id or "").strip()
    if not opt_id:
        return
    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            if provider == "google" and user_id is not None:
                cur.execute(
                    """
                    DELETE FROM app_saved_optimizations
                    WHERE provider = 'google' AND user_id = %s AND optimization_id = %s
                    """,
                    (user_id, opt_id),
                )
            else:
                cur.execute(
                    """
                    DELETE FROM app_saved_optimizations
                    WHERE provider = 'guest' AND guest_id = %s AND optimization_id = %s
                    """,
                    (guest_id, opt_id),
                )
        conn.commit()
    finally:
        conn.close()

# Allow frontend to access backend
def _normalize_origin(value: str) -> str:
    s = (value or "").strip().strip('"').strip("'")
    if s.endswith("/"):
        s = s[:-1]
    return s


cors_origins_env = os.getenv("CORS_ORIGINS", "*")
cors_origins = [_normalize_origin(x) for x in cors_origins_env.split(",") if _normalize_origin(x)]
if not cors_origins:
    cors_origins = ["*"]
if "*" in cors_origins:
    cors_origins = ["*"]
cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None
print(f"[cors] allow_origins={cors_origins} allow_origin_regex={cors_origin_regex}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,  # set CORS_ORIGINS in Render for stricter control
    allow_origin_regex=cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load and combine the 4 CSV files
def load_and_transform(endpoint):
    current_dir = os.path.dirname(__file__)
    parent_dir = os.path.abspath(os.path.join(current_dir, ".."))

    if endpoint == "Predictions":
        csv_path = os.path.join(parent_dir, "All_Predictions.csv")
    elif endpoint == "Team_Predictions":
        csv_path = os.path.join(parent_dir, "Team_prediction_visual.csv")
    elif endpoint == "ALL_Data":
        csv_path = os.path.join(parent_dir, "player_history.csv")
    elif endpoint == "Player_rankings":
        csv_path = os.path.join(parent_dir, "Model_Predictions_visual2.csv")
    elif endpoint == "Teams":
        csv_path = os.path.join(parent_dir, "Team_data_transformed2.csv")
    elif endpoint == "Current_players":
        csv_path = os.path.join(parent_dir, RAW_DATA_DIR, "current_players.csv")
    elif endpoint == "free-hit":
        csv_path = os.path.join(parent_dir, "Free_hit_team.csv")
    elif endpoint == "wildcard":
        csv_path = os.path.join(parent_dir, "Wildcard_team.csv")
    elif endpoint == "News":
        csv_path = os.path.join(parent_dir, "PL_news.csv")
    elif endpoint == "Team_Predictions_Future":
        csv_path = os.path.join(parent_dir, "Team_prediction.csv")
    elif endpoint == "Team_current":
        csv_path = os.path.join(parent_dir, "Team_data_newest3.csv")    
    elif endpoint == "Team_Threat":
        csv_path = os.path.join(parent_dir, "Team_threat.csv")    
    elif endpoint == "Team_Lineups":
        csv_path = os.path.join(parent_dir, "Team_lineups.csv")   
    elif endpoint=="Teams_Analysis": 
        csv_path = os.path.join(parent_dir, "Teams_Visual_Analysis.csv")   
    elif endpoint=="Season_Analysis": 
        csv_path = os.path.join(parent_dir, "Season_analysis.csv") 
    elif endpoint=="Team_result_adjust":  
        csv_path = os.path.join(parent_dir, "Visual_adjust_Team_results.csv") 
    elif endpoint=="Player_result_adjust":
        csv_path=os.path.join(parent_dir,"Player_Adjusted_data.csv")
        
    elif endpoint=="Table_Prediction":
        csv_path=os.path.join(parent_dir,"Final_Table_Prediction_All_GW.csv")
        
        
        
    else:
        raise ValueError(f"Unknown endpoint: {endpoint}")
        
    # Load the CSV
    if endpoint in ["Team_Threat","Table_Prediction","Player_rankings"] :
        df = pd.read_csv(csv_path)

    
    else:
        df = pd.read_csv(csv_path).iloc[:,1:]
    
    
    return df


def _json_safe_records(df: pd.DataFrame, fill_value=0):
    safe_df = df.copy()
    safe_df = safe_df.replace([np.inf, -np.inf], np.nan)
    safe_df = safe_df.fillna(fill_value)
    records = safe_df.to_dict(orient="records")
    return json.loads(json.dumps(records, allow_nan=False))

@app.get("/Predictions")
def get_data():
    df = load_and_transform("Predictions")
    return df.to_dict(orient="records")

@app.get("/Team_Lineups")
def get_data():
    df = load_and_transform("Team_Lineups")
    return df.to_dict(orient="records")

@app.get("/Team_Threat")
def get_data():
    df = load_and_transform("Team_Threat")
    return df.to_dict(orient="records")

@app.get("/Table_Prediction")
def get_data():
    df = load_and_transform("Table_Prediction")
    return df.to_dict(orient="records")

@app.get("/News")
def get_data():
    df = load_and_transform("News")
    return df.to_dict(orient="records")

@app.get("/Season_Analysis")
def get_data():
    df = load_and_transform("Season_Analysis")
    
    return df.to_dict(orient="records")

@app.get("/fixtures_config")
def get_fixtures_config():
    # fixtures_config imported from GenerateConfig
    return JSONResponse(content=fixtures_config)


@app.post("/auth/guest")
def auth_guest(req: GuestAuthRequest):
    guest_id = req.device_id or f"guest-{uuid4().hex[:16]}"
    token = _create_auth_token(
        {
            "provider": "guest",
            "guest_id": guest_id,
        }
    )
    return {
        "token": token,
        "provider": "guest",
        "user": {
            "id": guest_id,
            "name": "Guest",
            "email": None,
            "avatar_url": None,
        },
        "recent_team_ids": [],
    }


def _verify_google_credential(id_token: str) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Google login is not configured. Set GOOGLE_CLIENT_ID in API environment.",
        )
    try:
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=10,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to verify Google token: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google credential.")

    payload = resp.json()
    aud = str(payload.get("aud", "")).strip()
    if aud != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google token audience mismatch.")

    exp = int(payload.get("exp", "0") or "0")
    if exp and datetime.now(timezone.utc).timestamp() >= exp:
        raise HTTPException(status_code=401, detail="Google token has expired.")
    return payload


def fetch_price_changes_data() -> list[dict[str, Any]]:
    bootstrap_url = "https://fantasy.premierleague.com/api/bootstrap-static/"

    def _safe_float(value: Any, default: float = 0.0) -> float:
        if value is None:
            return default
        if isinstance(value, (list, tuple)):
            for item in value:
                parsed = _safe_float(item, default=None)
                if parsed is not None:
                    return parsed
            return default
        if isinstance(value, str):
            cleaned = value.strip().replace("%", "").replace(",", "")
            if cleaned == "":
                return default
            try:
                return float(cleaned)
            except ValueError:
                return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _projection_text(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (list, tuple)):
            text_parts = [str(item).strip() for item in value if isinstance(item, str) and str(item).strip()]
            if text_parts:
                return " | ".join(text_parts)
            scalar_parts = [str(item).strip() for item in value if item is not None and str(item).strip()]
            return " | ".join(scalar_parts)
        return str(value).strip()

    try:
        resp = requests.get(
            bootstrap_url,
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch FPL bootstrap data: {exc}")

    payload = resp.json()
    team_lookup = {
        int(team.get("id")): {
            "team_name": str(team.get("name") or ""),
            "team_short_name": str(team.get("short_name") or ""),
        }
        for team in payload.get("teams", [])
        if team.get("id") is not None
    }

    generated_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []
    for player in payload.get("elements", []):
        team_id = int(player.get("team") or 0)
        team_info = team_lookup.get(team_id, {})
        code = player.get("code")
        first_name = str(player.get("first_name") or "").strip()
        second_name = str(player.get("second_name") or "").strip()
        full_name = "_".join(part for part in [first_name, second_name] if part)

        rows.append(
            {
                "id": player.get("id"),
                "code": code,
                "name": str(player.get("web_name") or ""),
                "full_name": full_name,
                "team_name": team_info.get("team_name", ""),
                "team_short_name": team_info.get("team_short_name", ""),
                "price_change_projections": _safe_float(player.get("price_change_projections")),
                "price_change_projection_text": _projection_text(player.get("price_change_projections")),
                "price_change_percent": _safe_float(player.get("price_change_percent")),
                "price": _safe_float(player.get("now_cost")) / 10.0,
                "selected_by_percent": _safe_float(player.get("selected_by_percent")),
                "price_change_locked_until": player.get("price_change_locked_until"),
                "is_locked": bool(player.get("price_change_locked_until")),
                "photo": (
                    f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{code}.png"
                    if code
                    else ""
                ),
                "generated_at": generated_at,
            }
        )

    return rows


def _upsert_google_user(google_payload: dict) -> dict:
    google_sub = str(google_payload.get("sub", "")).strip()
    if not google_sub:
        raise HTTPException(status_code=401, detail="Google account id missing.")

    email = google_payload.get("email")
    name = google_payload.get("name") or email or "Google User"
    avatar_url = google_payload.get("picture")

    conn = _connect_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_users (google_sub, email, name, avatar_url, last_login_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (google_sub)
                DO UPDATE SET
                    email = EXCLUDED.email,
                    name = EXCLUDED.name,
                    avatar_url = EXCLUDED.avatar_url,
                    last_login_at = NOW()
                RETURNING id, google_sub, email, name, avatar_url
                """,
                (google_sub, email, name, avatar_url),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to create user.")
            user_id = int(row[0])
            cur.execute(
                """
                INSERT INTO app_login_events (user_id, provider)
                VALUES (%s, %s)
                """,
                (user_id, "google"),
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": user_id,
        "google_sub": row[1],
        "email": row[2],
        "name": row[3],
        "avatar_url": row[4],
    }


@app.post("/auth/google")
def auth_google(req: GoogleAuthRequest):
    payload = _verify_google_credential(req.credential)
    user = _upsert_google_user(payload)
    token = _create_auth_token(
        {
            "provider": "google",
            "user_id": int(user["id"]),
            "google_sub": user["google_sub"],
        }
    )
    recent = _get_recent_team_ids_for_user(int(user["id"]))
    return {
        "token": token,
        "provider": "google",
        "user": {
            "id": int(user["id"]),
            "name": user.get("name"),
            "email": user.get("email"),
            "avatar_url": user.get("avatar_url"),
        },
        "recent_team_ids": recent,
    }


@app.get("/auth/me")
def auth_me(payload: dict = Depends(_auth_payload_required)):
    provider = payload.get("provider")
    if provider == "google":
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid auth session.")
        user = _get_user_by_id(int(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found.")
        return {
            "provider": "google",
            "user": {
                "id": int(user["id"]),
                "name": user.get("name"),
                "email": user.get("email"),
                "avatar_url": user.get("avatar_url"),
            },
            "recent_team_ids": _get_recent_team_ids_for_user(int(user_id)),
        }

    if provider == "guest":
        return {
            "provider": "guest",
            "user": {
                "id": payload.get("guest_id", "guest"),
                "name": "Guest",
                "email": None,
                "avatar_url": None,
            },
            "recent_team_ids": [],
        }

    raise HTTPException(status_code=401, detail="Unknown auth provider.")


@app.post("/user/recent-team-id")
def user_recent_team_id_add(
    req: TrackTeamIdRequest,
    payload: dict = Depends(_auth_payload_required),
):
    provider = payload.get("provider")
    if provider != "google":
        return {"ok": True, "recent_team_ids": []}

    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid auth session.")
    _track_recent_team_id(int(user_id), int(req.team_id))
    return {"ok": True, "recent_team_ids": _get_recent_team_ids_for_user(int(user_id))}


@app.get("/user/recent-team-ids")
def user_recent_team_ids(payload: dict = Depends(_auth_payload_required)):
    provider = payload.get("provider")
    if provider != "google":
        return {"recent_team_ids": []}
    user_id = payload.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid auth session.")
    return {"recent_team_ids": _get_recent_team_ids_for_user(int(user_id))}


@app.post("/analytics/page-activity")
def analytics_page_activity(req: PageActivityRequest, request: Request):
    _track_page_activity_event(
        request,
        path=req.path,
        duration_seconds=req.duration_seconds,
        started_at=req.started_at,
        ended_at=req.ended_at,
        guest_id_hint=req.guest_id,
    )
    return {"ok": True}


@app.post("/analytics/adjustment-change")
def analytics_adjustment_change(req: AdjustmentChangeRequest, request: Request):
    _track_adjustment_events(
        request,
        source=req.source,
        changes=req.changes or [],
        guest_id_hint=req.guest_id,
    )
    return {"ok": True}


@app.get("/user/saved-optimizations")
def user_saved_optimizations(
    request: Request,
    guest_id: Optional[str] = Query(None, title="Guest id for guest-mode reads"),
):
    return {"saved_optimizations": _list_saved_optimizations(request, guest_id_hint=guest_id)}


@app.post("/user/saved-optimizations")
def user_saved_optimizations_upsert(req: SavedOptimizationUpsertRequest, request: Request):
    _upsert_saved_optimization(
        request,
        optimization_id=req.optimization_id,
        name=req.name,
        snapshot=req.snapshot or {},
        created_at_client=req.created_at,
        guest_id_hint=req.guest_id,
    )
    return {"ok": True, "saved_optimizations": _list_saved_optimizations(request, guest_id_hint=req.guest_id)}


@app.delete("/user/saved-optimizations/{optimization_id}")
def user_saved_optimizations_delete(
    optimization_id: str,
    request: Request,
    guest_id: Optional[str] = Query(None, title="Guest id for guest-mode deletes"),
):
    _delete_saved_optimization(request, optimization_id=optimization_id, guest_id_hint=guest_id)
    return {"ok": True, "saved_optimizations": _list_saved_optimizations(request, guest_id_hint=guest_id)}


def _build_optimize_kwargs(
    *,
    team_id: int,
    banned_list: Optional[List[str]] = None,
    force_in_list: Optional[List[str]] = None,
    bb_round: int = 40,
    wildcard_round: int = 40,
    freehit_round: int = 40,
    n_hits: int = 0,
    risk: float = 0.0,
    transval: float = 0.5,
    players_df: Optional[pd.DataFrame] = None,
    on_solution=None,
):
    return dict(
        team_id=team_id,
        banned_list=banned_list or [],
        force_in_list=force_in_list or [],
        bb_round=bb_round,
        wildcard_round=wildcard_round,
        free_hit_round=freehit_round,
        Last_GW=4,
        GW_list=["0", "5", "6", "7", "8", "9"],
        n_hits=n_hits,
        current_player_path=f"{RAW_DATA_DIR}/current_players.csv",
        players_override=players_df,
        risk_factor=risk,
        transval=transval,
        n_solutions=OPTIMIZER_N_SOLUTIONS,
        solver_tee=False,
        on_solution=on_solution,
    )


def _sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def _stream_optimization(
    opt_kwargs: dict,
    *,
    optimization_event_id: Optional[int] = None,
    release_slot_on_finish: bool = False,
) -> StreamingResponse:
    events: Queue = Queue()

    def _worker():
        solutions_found = {"count": 0}
        solution1_points = {"value": None}

        def _on_solution(solution_no: int, rows: List[dict]):
            solutions_found["count"] = max(
                int(solutions_found["count"]),
                int(solution_no),
            )
            if int(solution_no) == 1 and solution1_points["value"] is None:
                solution1_points["value"] = _extract_solution1_predicted_points(rows)
            events.put(
                (
                    "solution",
                    {
                        "solution": int(solution_no),
                        "rows": rows,
                        "n_solutions": OPTIMIZER_N_SOLUTIONS,
                    },
                )
            )

        try:
            solve_kwargs = dict(opt_kwargs)
            solve_kwargs["on_solution"] = _on_solution
            optimize_my_team(**solve_kwargs)
            try:
                _update_optimization_event_predicted_points(
                    optimization_event_id,
                    solution1_points["value"],
                )
            except Exception as e:
                print(f"[analytics] failed to update optimization points (stream): {e}")
            events.put(
                (
                    "done",
                    {
                        "n_solutions": OPTIMIZER_N_SOLUTIONS,
                        "solutions_found": int(solutions_found["count"]),
                    },
                )
            )
        except ValueError as e:
            events.put(("error", {"status": 400, "detail": str(e)}))
        except Exception as e:
            traceback.print_exc()
            events.put(("error", {"status": 500, "detail": str(e)}))
        finally:
            if release_slot_on_finish:
                _release_optimization_slot()
            events.put(("__end__", {}))

    try:
        Thread(target=_worker, daemon=True).start()
    except Exception:
        if release_slot_on_finish:
            _release_optimization_slot()
        raise

    def _generator():
        yield _sse_event("meta", {"n_solutions": OPTIMIZER_N_SOLUTIONS})
        while True:
            event, payload = events.get()
            if event == "__end__":
                break
            yield _sse_event(event, payload)

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )

@app.get("/Team_Predictions")
def get_data():
    df = load_and_transform("Team_Predictions")
    return df.to_dict(orient="records")

@app.get("/Team_Predictions_Future")
def get_data():
    df = load_and_transform("Team_Predictions_Future")
    return df.to_dict(orient="records")



@app.post("/My_Team_Optimize")
def post_my_team_optimize(req: OptimizeRequest, request: Request):
    """
    POST variant:
    - model_type = "ai": behave like the existing GET endpoint
    - model_type = "statistical": use user-provided `players` Points
    """
    # Optional: basic validation
    if req.model_type == "statistical" and not req.players:
        raise HTTPException(
            status_code=400,
            detail="players payload is required when model_type='statistical'",
        )

    players_df = None
    if req.players:
        # turn list[PlayerInput] -> DataFrame
        players_df = pd.DataFrame([p.dict() for p in req.players])

    auth_payload = _auth_payload_optional(request)
    if auth_payload and auth_payload.get("provider") == "google" and auth_payload.get("user_id") is not None:
        try:
            _track_recent_team_id(int(auth_payload["user_id"]), int(req.team_id))
        except Exception as e:
            print(f"[auth] failed to track recent team id in POST optimize: {e}")

    optimization_event_id = None
    try:
        optimization_event_id = _track_optimization_event(
            request,
            team_id=req.team_id,
            model_type=req.model_type,
            guest_id_hint=req.guest_id,
            settings={
                "bb_round": req.bb_round,
                "wildcard_round": req.wildcard_round,
                "freehit_round": req.freehit_round,
                "n_hits": req.n_hits,
                "risk": req.risk,
                "transval": req.transval,
                "stream": bool(req.stream),
                "banned_list": req.banned_list or [],
                "force_in_list": req.force_in_list or [],
                "players_count": len(req.players or []),
            },
        )
    except Exception as e:
        print(f"[analytics] failed to track optimization event (POST): {e}")

    optimize_kwargs = _build_optimize_kwargs(
        team_id=req.team_id,
        banned_list=req.banned_list,
        force_in_list=req.force_in_list,
        bb_round=req.bb_round,
        wildcard_round=req.wildcard_round,
        freehit_round=req.freehit_round,
        n_hits=req.n_hits,
        risk=req.risk,
        transval=req.transval,
        players_df=players_df,
    )

    _acquire_optimization_slot()
    if req.stream:
        return _stream_optimization(
            optimize_kwargs,
            optimization_event_id=optimization_event_id,
            release_slot_on_finish=True,
        )

    try:
        df = optimize_my_team(**optimize_kwargs)
        rows = df.to_dict(orient="records")
        try:
            _update_optimization_event_predicted_points(
                optimization_event_id,
                _extract_solution1_predicted_points(rows),
            )
        except Exception as e:
            print(f"[analytics] failed to update optimization points (POST): {e}")
        return rows
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _release_optimization_slot()

@app.get("/My_Team_Optimize")
def get_my_team_optimize(
    request: Request,
    team_id: int,
    banned_list: Optional[List[str]]        = Query(None, title="Player IDs to ban", alias="banned_list"),
    force_in_list: Optional[List[str]]      = Query(None, title="Player names to force in", alias="force_in_list"),
    bb_round:     Optional[int]             = Query(40, title="Bench Boost round"),
    wildcard_round: Optional[int]           = Query(40, title="Wildcard round"),
    freehit_round: Optional[int]           = Query(40, title="freehit round"),
    n_hits:Optional[int]                   = Query(0, title="n_hits"),
    risk:Optional[float]                   = Query(0.0, title="risk"),
    transval:Optional[float]                   = Query(0.5, title="transval"),
    guest_id: Optional[str]                = Query(None, title="Guest id for analytics"),
    stream: bool = Query(False, title="Stream optimization results"),
):
    """
    Optimize a team given:
    - team_id (required)
    - banned_list (optional list of player IDs)
    - bb_round (optional Bench Boost round)
    - wildcard_round (optional Wildcard round)
    - Last_GW (optional last Gameweek to include)
    - GW_list (optional list of Gameweeks)
    - current_player_path (optional path override)
    """
    optimize_kwargs = _build_optimize_kwargs(
        team_id=team_id,
        banned_list=banned_list or [],
        force_in_list=force_in_list or [],
        bb_round=bb_round,
        wildcard_round=wildcard_round,
        freehit_round=freehit_round,
        n_hits=n_hits,
        risk=risk,
        transval=transval,
    )

    auth_payload = _auth_payload_optional(request)
    if auth_payload and auth_payload.get("provider") == "google" and auth_payload.get("user_id") is not None:
        try:
            _track_recent_team_id(int(auth_payload["user_id"]), int(team_id))
        except Exception as e:
            print(f"[auth] failed to track recent team id in GET optimize: {e}")

    optimization_event_id = None
    try:
        optimization_event_id = _track_optimization_event(
            request,
            team_id=team_id,
            model_type="ai",
            guest_id_hint=guest_id,
            settings={
                "bb_round": bb_round,
                "wildcard_round": wildcard_round,
                "freehit_round": freehit_round,
                "n_hits": n_hits,
                "risk": risk,
                "transval": transval,
                "stream": bool(stream),
                "banned_list": banned_list or [],
                "force_in_list": force_in_list or [],
            },
        )
    except Exception as e:
        print(f"[analytics] failed to track optimization event (GET): {e}")

    _acquire_optimization_slot()
    if stream:
        return _stream_optimization(
            optimize_kwargs,
            optimization_event_id=optimization_event_id,
            release_slot_on_finish=True,
        )

    try:
        df = optimize_my_team(**optimize_kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _release_optimization_slot()
    rows = df.to_dict(orient="records")
    try:
        _update_optimization_event_predicted_points(
            optimization_event_id,
            _extract_solution1_predicted_points(rows),
        )
    except Exception as e:
        print(f"[analytics] failed to update optimization points (GET): {e}")
    return rows


@app.get("/Get_My_Team")
def get_my_team_optimize(
    request: Request,
    team_id: int
):
    auth_payload = _auth_payload_optional(request)
    if auth_payload and auth_payload.get("provider") == "google" and auth_payload.get("user_id") is not None:
        try:
            _track_recent_team_id(int(auth_payload["user_id"]), int(team_id))
        except Exception as e:
            print(f"[auth] failed to track recent team id in Get_My_Team: {e}")
    try:
        df = build_team_dataframe(
            team_id
        )
    except ValueError as e:
        # e.g. if team_id not found or invalid params
        raise HTTPException(status_code=400, detail=str("Team not found"))

    return df.to_dict(orient="records")


@app.get("/Player_rankings")
def get_player_rankings():
    df = load_and_transform("Player_rankings")

    # 1) Replace ±Inf with NaN
    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    # 2) Fill all NaNs with 0 (or another sentinel)
    df.fillna(0, inplace=True)

    # 3) Now dump to gzipped JSON
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="w") as gz:
        gz.write(json.dumps(df.to_dict(orient="records")).encode("utf-8"))
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Access-Control-Allow-Origin": "*",
        },
    )
@app.get("/Player_result_adjust")
def get_data():
    df = load_and_transform("Player_result_adjust")
    return _json_safe_records(df, fill_value=0)

@app.get("/Team_current")
def get_data():
    df = load_and_transform("Team_current")
    df=df.fillna(0)
    return df.to_dict(orient="records")


@app.get("/free-hit")
def get_data():
    df = load_and_transform("free-hit")
    return df.to_dict(orient="records")

@app.get("/Team_result_adjust")
def get_data():
    df = load_and_transform("Team_result_adjust")
    return _json_safe_records(df, fill_value=0)

@app.get("/Price_Changes")
def get_price_changes():
    try:
        rows = fetch_price_changes_data()
        return JSONResponse(
            content=rows,
            headers={"Access-Control-Allow-Origin": "*"},
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers={"Access-Control-Allow-Origin": "*"},
        )
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
            headers={"Access-Control-Allow-Origin": "*"},
        )

@app.get("/wildcard")
def get_data():
    df = load_and_transform("wildcard")
    return df.to_dict(orient="records")

@app.get("/ALL_Data")
def get_all_data():
    df = load_and_transform("ALL_Data")

    # Convert to JSON and compress
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="w") as gz:
        gz.write(json.dumps(df.to_dict(orient="records")).encode('utf-8'))
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Access-Control-Allow-Origin": "*"
        }
    )
    
@app.get("/Teams")
def get_team_data(team: str = Query(None)):
    df = load_and_transform("Teams")

    if team:
        df = df[df["name"] == team]

    # Replace non-JSON-compliant values
    df = df.replace([np.inf, -np.inf], np.nan)
    df=df.dropna()

    # Convert to dict
    records = df.to_dict(orient="records")

    # Use allow_nan=False to force clean JSON
    try:
        return json.loads(json.dumps(records, allow_nan=False))
    except ValueError as e:
        # Optional: Log or return an error if still invalid
        print("JSON serialization error:", e)
        print(df[df.isin([np.nan, np.inf, -np.inf]).any(axis=1)])
        return {"error": "Data contains values that cannot be serialized to JSON."}
    
@app.get("/Teams_Analysis")
def get_team_data(team: str = Query(None)):
    df = load_and_transform("Teams_Analysis")

    if team:
        df = df[df["name"] == team]

    # Replace non-JSON-compliant values
    df = df.replace([np.inf, -np.inf], np.nan)
    df=df.dropna()

    # Convert to dict
    records = df.to_dict(orient="records")

    # Use allow_nan=False to force clean JSON
    try:
        return json.loads(json.dumps(records, allow_nan=False))
    except ValueError as e:
        # Optional: Log or return an error if still invalid
        print("JSON serialization error:", e)
        print(df[df.isin([np.nan, np.inf, -np.inf]).any(axis=1)])
        return {"error": "Data contains values that cannot be serialized to JSON."}

@app.get("/Teams_unique")
def get_team_data_unique():
    df = load_and_transform("Teams")
    # Filter by team if provided
    unique_teams = df["name"].dropna().unique().tolist()
    return sorted(unique_teams)

@app.get("/Player_picture", response_class=PlainTextResponse)
def get_team_data_unique(player: str = Query(None)):
    df = load_and_transform("Current_players")
    player_df = df[df["name"] == player]
    
    if player_df.empty:
        raise HTTPException(status_code=404, detail="Player not found")

    picture = player_df["code"].values[0]
    return f"{Player_picture_url}{picture}.png"

@app.get("/Player_unique")
def get_team_data_unique():
    df = load_and_transform("ALL_Data")
    max_season=df["season"].max()
    df=df[(df['season'] == max_season)]
    # Filter by team if provided
    unique_teams = df["name"].dropna().unique().tolist()
    return sorted(unique_teams)

@app.get("/Player")
def get_team_data(player: str = Query(None)):
    df = load_and_transform("ALL_Data")

    if player:
        df = df[df["Name"] == player]

    # Replace non-JSON-compliant values
    df = df.replace([np.inf, -np.inf], np.nan)
    df=df.dropna()

    # Convert to dict
    records = df.to_dict(orient="records")

    # Use allow_nan=False to force clean JSON
    try:
        return json.loads(json.dumps(records, allow_nan=False))
    except ValueError as e:
        # Optional: Log or return an error if still invalid
        print("JSON serialization error:", e)
        print(df[df.isin([np.nan, np.inf, -np.inf]).any(axis=1)])
        return {"error": "Data contains values that cannot be serialized to JSON."}
    
@app.get("/")
def root():
    return {"status": "API is up"}
