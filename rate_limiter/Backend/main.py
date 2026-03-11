from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis.asyncio as redis
import time
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="Multi-Strategy Rate Limiter API",
    description="Production-grade rate limiter with Fixed Window, Sliding Window, and Token Bucket strategies",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

async def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)

# ─── Strategy 1: Fixed Window ───────────────────────────────────────────────
async def fixed_window(r, key: str, limit: int, window: int):
    """
    Fixed Window: Resets counter every N seconds.
    Simple but allows burst at window boundaries.
    Used by: Basic APIs, free-tier quotas
    """
    current = int(time.time())
    window_key = f"fw:{key}:{current // window}"
    ttl = window - (current % window)

    count = await r.incr(window_key)
    if count == 1:
        await r.expire(window_key, window)

    remaining = max(0, limit - count)
    reset_at = (current // window + 1) * window

    return {
        "allowed": count <= limit,
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "reset_at": reset_at,
        "retry_after": ttl if count > limit else None,
        "strategy": "fixed_window"
    }


# ─── Strategy 2: Sliding Window ─────────────────────────────────────────────
async def sliding_window(r, key: str, limit: int, window: int):
    """
    Sliding Window: Tracks requests in a rolling time window.
    Smooth limiting, no boundary bursts.
    Used by: GitHub API, Stripe, most production APIs
    """
    now = time.time()
    window_start = now - window
    sw_key = f"sw:{key}"

    pipe = r.pipeline()
    await pipe.zremrangebyscore(sw_key, 0, window_start)
    await pipe.zadd(sw_key, {str(now): now})
    await pipe.zcard(sw_key)
    await pipe.expire(sw_key, window)
    results = await pipe.execute()

    count = results[2]
    remaining = max(0, limit - count)

    return {
        "allowed": count <= limit,
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "reset_at": now + window,
        "retry_after": window if count > limit else None,
        "strategy": "sliding_window"
    }


# ─── Strategy 3: Token Bucket ────────────────────────────────────────────────
async def token_bucket(r, key: str, capacity: int, refill_rate: float):
    """
    Token Bucket: Allows burst up to capacity, refills at steady rate.
    Burst-friendly — great for real-time APIs.
    Used by: AWS, Twilio, Cloudflare
    """
    tb_key = f"tb:{key}"
    now = time.time()

    data = await r.hgetall(tb_key)

    if data:
        tokens = float(data["tokens"])
        last_refill = float(data["last_refill"])
        elapsed = now - last_refill
        tokens = min(capacity, tokens + elapsed * refill_rate)
    else:
        tokens = capacity
        last_refill = now

    allowed = tokens >= 1.0
    if allowed:
        tokens -= 1.0

    await r.hset(tb_key, mapping={"tokens": tokens, "last_refill": now})
    await r.expire(tb_key, int(capacity / refill_rate) + 10)

    retry_after = (1.0 - tokens) / refill_rate if not allowed else None

    return {
        "allowed": allowed,
        "tokens_remaining": round(tokens, 2),
        "capacity": capacity,
        "refill_rate": refill_rate,
        "retry_after": round(retry_after, 2) if retry_after else None,
        "strategy": "token_bucket"
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Multi-Strategy Rate Limiter API", "docs": "/docs"}


@app.post("/api/fixed-window")
async def test_fixed_window(request: Request):
    """
    Fixed Window — 10 requests per 60 seconds per IP.
    Resets hard at window boundary.
    """
    ip = request.client.host
    r = await get_redis()
    result = await fixed_window(r, ip, limit=10, window=60)

    headers = {
        "X-RateLimit-Strategy": "fixed-window",
        "X-RateLimit-Limit": str(result["limit"]),
        "X-RateLimit-Remaining": str(result["remaining"]),
        "X-RateLimit-Reset": str(result["reset_at"]),
    }

    if not result["allowed"]:
        headers["Retry-After"] = str(result["retry_after"])
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded", "detail": result},
            headers=headers
        )

    return JSONResponse(content={"success": True, "detail": result}, headers=headers)


@app.post("/api/sliding-window")
async def test_sliding_window(request: Request):
    """
    Sliding Window — 10 requests per 60 seconds per IP.
    Smooth rolling window, no boundary bursts.
    """
    ip = request.client.host
    r = await get_redis()
    result = await sliding_window(r, ip, limit=10, window=60)

    headers = {
        "X-RateLimit-Strategy": "sliding-window",
        "X-RateLimit-Limit": str(result["limit"]),
        "X-RateLimit-Remaining": str(result["remaining"]),
    }

    if not result["allowed"]:
        headers["Retry-After"] = str(result["retry_after"])
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded", "detail": result},
            headers=headers
        )

    return JSONResponse(content={"success": True, "detail": result}, headers=headers)


@app.post("/api/token-bucket")
async def test_token_bucket(request: Request):
    """
    Token Bucket — capacity of 10, refills at 0.2 tokens/sec.
    Allows bursts, then throttles gracefully.
    """
    ip = request.client.host
    r = await get_redis()
    result = await token_bucket(r, ip, capacity=10, refill_rate=0.2)

    headers = {
        "X-RateLimit-Strategy": "token-bucket",
        "X-RateLimit-Capacity": str(result["capacity"]),
        "X-RateLimit-Tokens-Remaining": str(result["tokens_remaining"]),
    }

    if not result["allowed"]:
        headers["Retry-After"] = str(result["retry_after"])
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded", "detail": result},
            headers=headers
        )

    return JSONResponse(content={"success": True, "detail": result}, headers=headers)


@app.get("/api/stats")
async def get_stats(request: Request):
    """
    Returns current rate limit state for all strategies for this IP.
    Used by dashboard for live polling.
    """
    ip = request.client.host
    r = await get_redis()
    now = time.time()
    window = 60

    # Fixed window stats
    current = int(now)
    fw_key = f"fw:{ip}:{current // window}"
    fw_count = int(await r.get(fw_key) or 0)

    # Sliding window stats
    sw_key = f"sw:{ip}"
    await r.zremrangebyscore(sw_key, 0, now - window)
    sw_count = await r.zcard(sw_key)

    # Token bucket stats
    tb_key = f"tb:{ip}"
    tb_data = await r.hgetall(tb_key)
    if tb_data:
        tokens = float(tb_data["tokens"])
        last_refill = float(tb_data["last_refill"])
        elapsed = now - last_refill
        tokens = min(10, tokens + elapsed * 0.2)
    else:
        tokens = 10.0

    return {
        "ip": ip,
        "timestamp": now,
        "fixed_window": {"count": fw_count, "limit": 10, "remaining": max(0, 10 - fw_count)},
        "sliding_window": {"count": sw_count, "limit": 10, "remaining": max(0, 10 - sw_count)},
        "token_bucket": {"tokens": round(tokens, 2), "capacity": 10},
    }