from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from rate_limiter.Backend.main import router as rate_limiter_router
from caching.backend.main import router as cache_router
# future imports — uncomment as you build each project:
# from caching.backend.main import router as cache_router
# from message_queue.backend.main import router as queue_router
# from url_shortener.backend.main import router as url_router

app = FastAPI(
    title="System Design Projects — Chakri Keerthi",
    description="15 system design concepts, each deployed live.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to your Vercel URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Mount routers ───────────────────────────────────────────────────────────
app.include_router(rate_limiter_router, prefix="/rate-limiter", tags=["Rate Limiter"])
app.include_router(cache_router, prefix="/cache", tags=["Caching"])
# app.include_router(cache_router,        prefix="/cache",        tags=["Caching"])
# app.include_router(queue_router,        prefix="/queue",        tags=["Message Queue"])
# app.include_router(url_router,          prefix="/url-shortener",tags=["URL Shortener"])


# ─── Root ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "author": "Chakri Keerthi",
        "projects": [
            {"id": 1, "name": "Rate Limiter",    "docs": "/rate-limiter/docs", "status": "live"},
            {"id": 2, "name": "Caching",          "docs": "/cache/docs",        "status": "coming soon"},
            {"id": 3, "name": "Message Queue",    "docs": "/queue/docs",        "status": "coming soon"},
        ]
    }