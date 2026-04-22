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
from typing import List, Optional, Literal
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from GenerateConfig import fixtures_config
from queue import Queue
from threading import Thread
import traceback
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import psycopg2
import requests
import jwt
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


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


class GuestAuthRequest(BaseModel):
    device_id: Optional[str] = None


class GoogleAuthRequest(BaseModel):
    credential: str


class TrackTeamIdRequest(BaseModel):
    team_id: int


app = FastAPI()
OPTIMIZER_N_SOLUTIONS = 3
RECENT_TEAM_IDS_LIMIT = int(os.getenv("RECENT_TEAM_IDS_LIMIT", "30"))
DATABASE_URL = os.getenv("DATABASE_URL")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
AUTH_JWT_SECRET = os.getenv("AUTH_JWT_SECRET", "").strip() or "change-me-in-render-env"
AUTH_JWT_ALGORITHM = "HS256"
auth_bearer = HTTPBearer(auto_error=False)


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

# Allow frontend to access backend
cors_origins_env = os.getenv("CORS_ORIGINS", "*")
cors_origins = [x.strip() for x in cors_origins_env.split(",") if x.strip()]
if not cors_origins:
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,  # set CORS_ORIGINS in Render for stricter control
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
        csv_path = os.path.join(parent_dir, "Raw_Data_25", "current_players.csv")
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
        current_player_path="Raw_Data_25/current_players.csv",
        players_override=players_df,
        risk_factor=risk,
        transval=transval,
        n_solutions=OPTIMIZER_N_SOLUTIONS,
        on_solution=on_solution,
    )


def _sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def _stream_optimization(opt_kwargs: dict) -> StreamingResponse:
    events: Queue = Queue()

    def _worker():
        solutions_found = {"count": 0}

        def _on_solution(solution_no: int, rows: List[dict]):
            solutions_found["count"] = max(
                int(solutions_found["count"]),
                int(solution_no),
            )
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
            events.put(("__end__", {}))

    Thread(target=_worker, daemon=True).start()

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

    if req.stream:
        return _stream_optimization(optimize_kwargs)

    try:
        df = optimize_my_team(**optimize_kwargs)
        return df.to_dict(orient="records")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

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

    if stream:
        return _stream_optimization(optimize_kwargs)

    try:
        df = optimize_my_team(**optimize_kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    return df.to_dict(orient="records")


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
    df=df.fillna(0)
    return df.to_dict(orient="records")    

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
    return df.to_dict(orient="records")

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
    return f"https://resources.premierleague.com/premierleague25/photos/players/500x500/{picture}.png"

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
