"""Application service layer.

Routers stay thin HTTP adapters; services hold workflow, persistence and
fallback orchestration that can be tested without FastAPI.
"""
