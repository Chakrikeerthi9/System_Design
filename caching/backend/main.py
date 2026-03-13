from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
import redis.asyncio as redis
import time
import os
from collections import OrderedDict
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ─── Simulated "database" — what we cache responses from ─────────────────────
MOCK_DB = {
    "user:1":    {"id": 1, "name": "Chakri Keerthi", "role": "Engineer"},
    "user:2":    {"id": 2, "name": "Alice Smith",    "role": "Designer"},
    "user:3":    {"id": 3, "name": "Bob Johnson",    "role": "Manager"},
    "product:1": {"id": 1, "name": "Laptop",  "price": 999},
    "product:2": {"id": 2, "name": "Monitor", "price": 399},
    "product:3": {"id": 3, "name": "Keyboard","price": 129},
}

def fetch_from_db(key: str):
    """Simulates a slow DB call with 100ms delay"""
    time.sleep(0.1)
    return MOCK_DB.get(key, None)


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 1 — IN-MEMORY CACHE (Python dict + TTL)
# Fastest possible. Lives in process memory.
# Lost on server restart. Not shared across multiple servers.
# ═══════════════════════════════════════════════════════════════════════════════

memory_cache: dict = {}  # { key: { value, expires_at } }

def memory_get(key: str):
    entry = memory_cache.get(key)
    if not entry:
        return None
    if time.time() > entry["expires_at"]:
        del memory_cache[key]
        return None
    return entry["value"]

def memory_set(key: str, value: dict, ttl: int = 30):
    memory_cache[key] = {
        "value": value,
        "expires_at": time.time() + ttl,
        "created_at": time.time(),
        "ttl": ttl,
    }

@router.get("/memory")
async def memory_cache_get(key: str = Query(..., description="Key to fetch e.g. user:1")):
    """
    In-Memory Cache — Python dict with TTL.
    HIT: returns cached value instantly.
    MISS: fetches from DB, stores in cache.
    """
    start = time.time()
    cached = memory_get(key)

    if cached:
        elapsed = round((time.time() - start) * 1000, 2)
        return JSONResponse(content={
            "status": "HIT",
            "key": key,
            "data": cached,
            "latency_ms": elapsed,
            "strategy": "in_memory",
            "cache_size": len(memory_cache),
        })

    # MISS — fetch from DB
    data = fetch_from_db(key)
    if not data:
        return JSONResponse(status_code=404, content={"error": f"Key '{key}' not found"})

    memory_set(key, data, ttl=30)
    elapsed = round((time.time() - start) * 1000, 2)

    return JSONResponse(content={
        "status": "MISS",
        "key": key,
        "data": data,
        "latency_ms": elapsed,
        "strategy": "in_memory",
        "cache_size": len(memory_cache),
    })

@router.delete("/memory")
async def memory_cache_clear():
    memory_cache.clear()
    return {"message": "In-memory cache cleared", "cache_size": 0}

@router.get("/memory/stats")
async def memory_cache_stats():
    now = time.time()
    valid = {k: v for k, v in memory_cache.items() if now < v["expires_at"]}
    return {
        "strategy": "in_memory",
        "cache_size": len(valid),
        "keys": [
            {
                "key": k,
                "ttl_remaining": round(v["expires_at"] - now, 1),
                "age": round(now - v["created_at"], 1),
            }
            for k, v in valid.items()
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 2 — REDIS CACHE (Distributed + TTL)
# Shared across multiple servers. Survives process restarts.
# The production standard. Used by GitHub, Twitter, Uber.
# ═══════════════════════════════════════════════════════════════════════════════

async def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)

@router.get("/redis")
async def redis_cache_get(key: str = Query(..., description="Key to fetch e.g. product:1")):
    """
    Redis Cache — distributed cache with TTL.
    HIT: Redis GET returns value instantly.
    MISS: fetch from DB → Redis SET with 30s TTL.
    """
    import json
    start = time.time()
    r = await get_redis()

    cached = await r.get(f"cache:{key}")

    if cached:
        elapsed = round((time.time() - start) * 1000, 2)
        ttl_remaining = await r.ttl(f"cache:{key}")
        return JSONResponse(content={
            "status": "HIT",
            "key": key,
            "data": json.loads(cached),
            "latency_ms": elapsed,
            "ttl_remaining": ttl_remaining,
            "strategy": "redis",
        })

    # MISS — fetch from DB
    data = fetch_from_db(key)
    if not data:
        return JSONResponse(status_code=404, content={"error": f"Key '{key}' not found"})

    await r.setex(f"cache:{key}", 30, json.dumps(data))
    elapsed = round((time.time() - start) * 1000, 2)

    return JSONResponse(content={
        "status": "MISS",
        "key": key,
        "data": data,
        "latency_ms": elapsed,
        "ttl_remaining": 30,
        "strategy": "redis",
    })

@router.delete("/redis")
async def redis_cache_clear():
    r = await get_redis()
    keys = await r.keys("cache:*")
    if keys:
        await r.delete(*keys)
    return {"message": "Redis cache cleared", "keys_deleted": len(keys)}

@router.get("/redis/stats")
async def redis_cache_stats():
    import json
    r = await get_redis()
    keys = await r.keys("cache:*")
    stats = []
    for k in keys:
        ttl = await r.ttl(k)
        val = await r.get(k)
        stats.append({
            "key": k.replace("cache:", ""),
            "ttl_remaining": ttl,
            "data": json.loads(val) if val else None,
        })
    return {
        "strategy": "redis",
        "cache_size": len(keys),
        "keys": stats,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STRATEGY 3 — LRU CACHE (Least Recently Used eviction)
# Fixed capacity. Evicts least recently used item when full.
# Used in: CPU caches, browser caches, DNS resolvers.
# ═══════════════════════════════════════════════════════════════════════════════

LRU_CAPACITY = 3  # small cap to make eviction visible in demo
lru_cache: OrderedDict = OrderedDict()

def lru_get(key: str):
    if key not in lru_cache:
        return None
    # Move to end = most recently used
    lru_cache.move_to_end(key)
    return lru_cache[key]["value"]

def lru_set(key: str, value: dict):
    if key in lru_cache:
        lru_cache.move_to_end(key)
    lru_cache[key] = {"value": value, "created_at": time.time()}
    if len(lru_cache) > LRU_CAPACITY:
        evicted = next(iter(lru_cache))
        lru_cache.popitem(last=False)
        return evicted  # return evicted key for visibility
    return None

@router.get("/lru")
async def lru_cache_get(key: str = Query(..., description="Key to fetch e.g. user:1")):
    """
    LRU Cache — fixed capacity (3 items), evicts least recently used.
    Try fetching 4+ different keys to see eviction in action.
    """
    start = time.time()
    cached = lru_get(key)

    if cached:
        elapsed = round((time.time() - start) * 1000, 2)
        return JSONResponse(content={
            "status": "HIT",
            "key": key,
            "data": cached,
            "latency_ms": elapsed,
            "strategy": "lru",
            "cache_contents": list(lru_cache.keys()),
            "capacity": LRU_CAPACITY,
            "evicted_key": None,
        })

    # MISS — fetch from DB
    data = fetch_from_db(key)
    if not data:
        return JSONResponse(status_code=404, content={"error": f"Key '{key}' not found"})

    evicted = lru_set(key, data)
    elapsed = round((time.time() - start) * 1000, 2)

    return JSONResponse(content={
        "status": "MISS",
        "key": key,
        "data": data,
        "latency_ms": elapsed,
        "strategy": "lru",
        "cache_contents": list(lru_cache.keys()),
        "capacity": LRU_CAPACITY,
        "evicted_key": evicted,
    })

@router.delete("/lru")
async def lru_cache_clear():
    lru_cache.clear()
    return {"message": "LRU cache cleared", "cache_size": 0}

@router.get("/lru/stats")
async def lru_cache_stats():
    return {
        "strategy": "lru",
        "capacity": LRU_CAPACITY,
        "cache_size": len(lru_cache),
        "cache_contents": list(lru_cache.keys()),
        "keys": [
            {
                "key": k,
                "age": round(time.time() - v["created_at"], 1),
                "position": i,  # 0 = LRU (will be evicted next), -1 = MRU
            }
            for i, (k, v) in enumerate(lru_cache.items())
        ]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# COMBINED STATS — for dashboard polling
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/stats")
async def all_stats():
    import json
    now = time.time()

    # Memory stats
    valid_memory = {k: v for k, v in memory_cache.items() if now < v["expires_at"]}

    # Redis stats
    r = await get_redis()
    redis_keys = await r.keys("cache:*")

    return {
        "memory": {
            "cache_size": len(valid_memory),
            "keys": list(valid_memory.keys()),
        },
        "redis": {
            "cache_size": len(redis_keys),
            "keys": [k.replace("cache:", "") for k in redis_keys],
        },
        "lru": {
            "cache_size": len(lru_cache),
            "capacity": LRU_CAPACITY,
            "keys": list(lru_cache.keys()),
        }
    }

@router.get("/")
async def root():
    return {
        "project": "Caching",
        "strategies": ["in-memory", "redis", "lru"],
        "available_keys": list(MOCK_DB.keys()),
    }