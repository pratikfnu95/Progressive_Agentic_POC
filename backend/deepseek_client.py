"""Small server-side DeepSeek Chat Completions client and smoke check."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"), override=False)


@dataclass(frozen=True)
class DeepSeekSettings:
    api_key: str
    base_url: str
    model: str

    @classmethod
    def from_environment(cls) -> "DeepSeekSettings":
        api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
        if not api_key:
            raise ValueError(
                "DEEPSEEK_API_KEY is not set. Put a rotated key in backend/.env "
                "or configure it as a server-side environment secret."
            )
        return cls(
            api_key=api_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/"),
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-flash").strip(),
        )


class DeepSeekAPIError(RuntimeError):
    """An API failure with safe, non-secret diagnostic text."""


def chat_completion(messages: list[dict[str, str]], max_tokens: int = 256) -> dict:
    """Send a non-streaming chat completion request without logging credentials."""
    settings = DeepSeekSettings.from_environment()
    payload = json.dumps(
        {
            "model": settings.model,
            "messages": messages,
            "stream": False,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")
    request = Request(
        f"{settings.base_url}/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=45) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code in (401, 403):
            detail = "DeepSeek rejected the API key or its account access."
        else:
            detail = f"DeepSeek returned HTTP {error.code}."
        raise DeepSeekAPIError(detail) from None
    except URLError as error:
        raise DeepSeekAPIError(f"Could not reach DeepSeek: {error.reason}") from None
    except (TimeoutError, json.JSONDecodeError) as error:
        raise DeepSeekAPIError(f"DeepSeek response failed: {type(error).__name__}.") from None

    try:
        answer = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise DeepSeekAPIError("DeepSeek returned an unexpected response format.") from None

    if not isinstance(answer, str) or not answer.strip():
        raise DeepSeekAPIError("DeepSeek returned an empty response.")

    return {
        "model": result.get("model", settings.model),
        "answer": answer.strip(),
        "usage": result.get("usage"),
    }


def sample_test() -> dict:
    """Make a tiny sample request that does not include business data."""
    return chat_completion(
        [
            {"role": "system", "content": "Reply briefly and plainly."},
            {
                "role": "user",
                "content": "Reply with exactly: DeepSeek connection test successful.",
            },
        ],
        max_tokens=32,
    )


if __name__ == "__main__":
    try:
        result = sample_test()
    except (DeepSeekAPIError, ValueError) as error:
        print(f"DeepSeek sample test could not complete: {error}", file=sys.stderr)
        raise SystemExit(1)

    print(f"DeepSeek sample test succeeded using {result['model']}.")
    print(result["answer"])
    if result["usage"]:
        print(f"Usage: {result['usage']}")
