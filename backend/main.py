"""NOW Dashboard — Lightweight backend for news data ingestion and serving."""

import sqlite3
import uuid
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib

from fastapi import FastAPI, HTTPException, Header, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DB_PATH = os.getenv("NOW_DB_PATH", "now.db")
API_TOKEN = os.getenv("NOW_API_TOKEN", "now-dev-token")
MAX_ITEMS_PER_LEVEL = 10

VALID_CATEGORIES = {"政策", "项目", "安全", "党建", "民生", "科技", "其他"}

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS news (
                id TEXT PRIMARY KEY,
                level TEXT NOT NULL CHECK(level IN ('L1','L2','L3')),
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                timestamp TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                thumbnail_url TEXT DEFAULT '',
                original_url TEXT DEFAULT '',
                category TEXT NOT NULL DEFAULT '其他',
                priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('high','normal')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_level ON news(level)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_ts ON news(timestamp DESC)")
        conn.commit()
    finally:
        conn.close()


def fifo_trim(conn: sqlite3.Connection, level: str):
    """Keep only the newest MAX_ITEMS_PER_LEVEL rows per level."""
    conn.execute("""
        DELETE FROM news WHERE level = ? AND id NOT IN (
            SELECT id FROM news WHERE level = ? ORDER BY timestamp DESC LIMIT ?
        )
    """, (level, level, MAX_ITEMS_PER_LEVEL))


def _insert_items(conn: sqlite3.Connection, items: list) -> tuple[int, set[str]]:
    """Insert items with dedup via INSERT OR IGNORE. Returns (inserted_count, levels_touched)."""
    inserted = 0
    levels_touched = set()
    for item in items:
        cursor = conn.execute("""
            INSERT OR IGNORE INTO news (id, level, title, summary, source, timestamp,
                              latitude, longitude, thumbnail_url, original_url,
                              category, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item.id, item.level, item.title, item.summary, item.source,
            item.timestamp, item.latitude, item.longitude,
            item.thumbnail_url, item.original_url,
            item.category, item.priority,
        ))
        if cursor.rowcount > 0:
            inserted += 1
            levels_touched.add(item.level)

    for level in levels_touched:
        fifo_trim(conn, level)

    return inserted, levels_touched


def _compute_etag(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT MAX(created_at) as max_ts, COUNT(*) as cnt FROM news").fetchone()
    ts = row["max_ts"] if row and row["max_ts"] else "empty"
    count = row["cnt"] if row else 0
    # Deterministic hash of all ids (ordered)
    ids_rows = conn.execute("SELECT id FROM news ORDER BY id").fetchall()
    ids_str = ",".join(r["id"] for r in ids_rows)
    ids_hash = hashlib.md5(ids_str.encode()).hexdigest()[:12]
    return f'"{ts}-{count}-{ids_hash}"'


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class NewsItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    level: str = Field(pattern=r"^L[123]$")
    title: str = Field(max_length=60)
    summary: str = Field(default="", max_length=120)
    source: str = Field(default="", max_length=20)
    timestamp: str  # ISO 8601
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    thumbnail_url: str = Field(default="", max_length=500)
    original_url: str = Field(default="", max_length=500)
    category: str = Field(default="其他", max_length=10)
    priority: str = Field(default="normal", pattern=r"^(high|normal)$")

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, v: str) -> str:
        try:
            datetime.fromisoformat(v)
        except (ValueError, TypeError):
            raise ValueError("timestamp must be a valid ISO 8601 datetime string")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(VALID_CATEGORIES)}")
        return v


class PushPayload(BaseModel):
    items: list[NewsItem] = Field(min_length=1, max_length=30)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="NOW Dashboard API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints — use `def` (not `async def`) so FastAPI runs them in a threadpool,
# avoiding blocking the event loop with synchronous sqlite3 calls.
# ---------------------------------------------------------------------------

@app.get("/api/v1/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/api/v1/push", status_code=201)
def push_news(payload: PushPayload, authorization: str = Header()):
    token = authorization.removeprefix("Bearer ").strip()
    if token != API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")

    conn = get_db()
    try:
        inserted, _ = _insert_items(conn, payload.items)
        conn.commit()
    finally:
        conn.close()

    return {"inserted": inserted, "total_received": len(payload.items)}


@app.get("/api/v1/news")
def get_news(request: Request, response: Response):
    conn = get_db()
    try:
        etag = _compute_etag(conn)

        # Check If-None-Match
        client_etag = request.headers.get("if-none-match")
        if client_etag and client_etag == etag:
            return Response(status_code=304, headers={"ETag": etag})

        result: dict[str, list] = {"L1": [], "L2": [], "L3": []}
        rows = conn.execute("SELECT * FROM news ORDER BY timestamp DESC").fetchall()
        for row in rows:
            item = dict(row)
            level = item.get("level")
            item.pop("created_at", None)
            if level in result:
                result[level].append(item)

        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "no-cache"

        return {
            **result,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Seed data for development
# ---------------------------------------------------------------------------

@app.post("/api/v1/seed")
def seed_data(authorization: str = Header(default="")):
    """Insert sample data for development/testing."""
    # Allow unauthenticated in dev, but check token if provided
    if authorization:
        token = authorization.removeprefix("Bearer ").strip()
        if token and token != API_TOKEN:
            raise HTTPException(status_code=401, detail="Invalid token")

    sample_items = [
        NewsItem(level="L1", title="国家电网发布新型电力系统行动方案",
                 summary="方案提出到2030年建成以新能源为主体的新型电力系统，推动能源绿色低碳转型",
                 source="国网官网", timestamp="2026-03-15T09:30:00+08:00",
                 latitude=39.9042, longitude=116.3974, category="政策", priority="high"),
        NewsItem(level="L1", title="白鹤滩水电站全部机组投产发电",
                 summary="总装机容量1600万千瓦，年均发电量624亿千瓦时",
                 source="新华社", timestamp="2026-03-15T10:15:00+08:00",
                 latitude=27.3294, longitude=103.1147, category="项目"),
        NewsItem(level="L1", title="特高压直流输电工程竣工投运",
                 summary="±800kV陇东至山东特高压直流工程正式投运，输送容量800万千瓦",
                 source="国网报", timestamp="2026-03-15T11:00:00+08:00",
                 latitude=35.8617, longitude=104.1954, category="项目"),
        NewsItem(level="L1", title="全国电力供需形势分析预测报告发布",
                 summary="预计全年全社会用电量同比增长6%左右，迎峰度夏保供任务艰巨",
                 source="中电联", timestamp="2026-03-15T14:00:00+08:00",
                 latitude=30.5728, longitude=104.0668, category="政策"),
        NewsItem(level="L2", title="上海电力迎峰度冬保供方案启动",
                 summary="全市电网最大负荷预计达到3580万千瓦，各项保供措施已就位",
                 source="上海电力", timestamp="2026-03-15T08:00:00+08:00",
                 latitude=31.2304, longitude=121.4737, category="安全", priority="high"),
        NewsItem(level="L2", title="浦东新区智能配电网升级完成",
                 summary="覆盖陆家嘴核心区域，配电自动化率提升至95%",
                 source="浦东供电", timestamp="2026-03-15T09:30:00+08:00",
                 latitude=31.2353, longitude=121.5441, category="科技"),
        NewsItem(level="L2", title="崇明岛新能源微电网示范项目投运",
                 summary="风光储一体化微电网实现海岛100%清洁能源供电",
                 source="崇明供电", timestamp="2026-03-15T10:00:00+08:00",
                 latitude=31.6226, longitude=121.3966, category="科技"),
        NewsItem(level="L3", title="金山石化供电区改造工程进展",
                 summary="110kV石化变电站扩建工程主体完工，计划月底投运",
                 source="金山供电", timestamp="2026-03-15T08:30:00+08:00",
                 latitude=30.7413, longitude=121.3419, category="项目"),
        NewsItem(level="L3", title="金山区光伏发电并网容量突破10万千瓦",
                 summary="分布式光伏覆盖工业厂房和居民屋顶，累计装机10.2万千瓦",
                 source="金山供电", timestamp="2026-03-15T09:00:00+08:00",
                 latitude=30.7279, longitude=121.3610, category="科技"),
        NewsItem(level="L3", title="金山区开展春季电力设施安全巡检",
                 summary="出动巡检人员120人次，排查隐患23处，整改完成率100%",
                 source="金山供电", timestamp="2026-03-15T11:00:00+08:00",
                 latitude=30.6888, longitude=121.3200, category="安全"),
    ]
    conn = get_db()
    try:
        inserted, _ = _insert_items(conn, sample_items)
        conn.commit()
    finally:
        conn.close()
    return {"inserted": inserted}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
