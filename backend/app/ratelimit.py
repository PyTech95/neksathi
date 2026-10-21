"""Rate limiting — slowapi limiter + the globals-preserving rate_limit decorator.

Copied verbatim from the pre-refactor monolith: `rate_limit` rebinds the slowapi
wrapper's ``__globals__`` so FastAPI can resolve the endpoint's ForwardRef
annotations (Pydantic models) that live in the endpoint's own module.
"""
from __future__ import annotations

import types

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _real_client_ip(request: Request) -> str:
    """Return the real client IP, honouring X-Forwarded-For from the
    Cloudflare / K8s ingress in front of the backend. Falls back to
    ``request.client.host`` (which in a multi-pod ingress environment
    resolves to the ingress pod peer IP, causing rate limits to be enforced
    per-pod rather than per-caller).

    NOTE: slowapi looks specifically for a parameter named ``request`` on the
    key_func (extension.py L501); renaming this parameter breaks the callable
    into a no-arg invocation.
    """
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        # Left-most entry is the original client; subsequent hops are proxies.
        first = xff.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_real_client_ip)


def rate_limit(limit_str: str):
    """Apply a slowapi rate limit while preserving the decorated function's
    ``__globals__``.

    Why this exists: with ``from __future__ import annotations`` every
    annotation is stored as a string and later resolved by FastAPI via
    ``get_typed_signature`` — which reads ``call.__globals__``. Slowapi's
    ``@limiter.limit(...)`` wraps the endpoint in an ``async_wrapper`` living
    inside ``slowapi.extension``; that wrapper's ``__globals__`` is slowapi's
    module namespace, so it doesn't contain our Pydantic models. FastAPI then
    fails to resolve the ForwardRef, silently downgrades the body param to a
    query param, and the endpoint returns ``422 {"loc": ["query", "payload"]}``.

    Fix: rebuild the slowapi wrapper as a fresh ``FunctionType`` bound to a
    MERGED globals dict that contains both slowapi's module names (Response,
    Request, etc — the wrapper's bytecode references them) AND the original
    server-module globals (our Pydantic models — FastAPI reads these to
    resolve ForwardRefs). Behaviour is otherwise identical to
    ``@limiter.limit(limit_str)``.
    """
    from slowapi import extension as _slowapi_extension  # local import — only needed here

    def decorator(func):
        wrapped = limiter.limit(limit_str)(func)
        merged_globals = {**_slowapi_extension.__dict__, **func.__globals__}
        rebound = types.FunctionType(
            wrapped.__code__,
            merged_globals,
            name=wrapped.__name__,
            argdefs=wrapped.__defaults__,
            closure=wrapped.__closure__,
        )
        rebound.__kwdefaults__ = wrapped.__kwdefaults__
        rebound.__wrapped__ = func
        rebound.__module__ = func.__module__
        rebound.__qualname__ = func.__qualname__
        rebound.__doc__ = func.__doc__
        rebound.__dict__.update(wrapped.__dict__)
        return rebound
    return decorator
