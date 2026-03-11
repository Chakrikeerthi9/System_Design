# Multi-Strategy Rate Limiter

A production-grade rate limiting API with 3 strategies, Redis backend, and live monitoring dashboard.

## System Design Concepts Covered
- **Fixed Window** — hard counter reset per time window
- **Sliding Window** — rolling window with sorted sets (Redis ZADD/ZRANGEBYSCORE)
- **Token Bucket** — burst-tolerant leaky bucket with refill rate
- **Redis** as distributed state store
- **Response headers** (`X-RateLimit-*`, `Retry-After`) — RFC standard
- **Middleware pattern** in FastAPI

## Stack
- **Backend**: FastAPI + Redis (Upstash) → Render
- **Frontend**: Next.js → Vercel

---

## Local Development

### 1. Backend
```bash
cd rate-limiter-api
pip install -r requirements.txt
cp .env.example .env        # add your Upstash REDIS_URL
uvicorn main:app --reload
# → http://localhost:8000/docs
```

### 2. Frontend
```bash
cd rate-limiter-dashboard
npm install
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# → http://localhost:3000
```

---

## Deploy

### Backend → Render
1. Push `rate-limiter-api/` to GitHub
2. New Web Service on Render → connect repo
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add env var: `REDIS_URL` = your Upstash Redis URL

### Frontend → Vercel
1. Push `rate-limiter-dashboard/` to GitHub
2. Import on Vercel
3. Add env var: `NEXT_PUBLIC_API_URL` = your Render API URL
4. Deploy

---

## API Endpoints

| Method | Endpoint | Strategy |
|--------|----------|----------|
| POST | `/api/fixed-window` | Fixed Window (10 req/60s) |
| POST | `/api/sliding-window` | Sliding Window (10 req/60s) |
| POST | `/api/token-bucket` | Token Bucket (cap:10, rate:0.2/s) |
| GET | `/api/stats` | Live state for all strategies |

### Response Headers
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1710000060
Retry-After: 45   # only on 429
```

### 429 Response
```json
{
  "error": "Rate limit exceeded",
  "detail": { "retry_after": 45, "strategy": "sliding_window" }
}
```