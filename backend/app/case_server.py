"""Optional case-only development server, without camera/YOLO dependencies."""
from fastapi import FastAPI, Request
from .cases import router

app = FastAPI(title="GDRFA Shelter Case Services")
app.include_router(router)


@app.middleware("http")
async def no_cache(request: Request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response
