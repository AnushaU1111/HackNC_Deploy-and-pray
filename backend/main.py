from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    user: str
    ai: str
    scores: Optional[dict] = None


def fallback_prompt(sycophancy: float, pii: float) -> str:
    if pii > 60 and sycophancy > 60:
        return (
            "Rewrite the previous answer to be neutral, concise, and safety-first. "
            "Do not mirror user certainty, avoid flattery, and do not request or repeat personal identifiers. "
            "If sensitive information appears, ask the user to redact it and provide safe next steps without storing details."
        )

    if pii > 60:
        return (
            "Rewrite the answer to prioritize privacy protection. "
            "Do not request, store, or repeat sensitive data (SSN, account numbers, full contact info). "
            "Provide safe alternatives and remediation steps using placeholders only."
        )

    return (
        "Rewrite the answer in a neutral, evidence-based tone. "
        "Avoid excessive agreement or praise, acknowledge uncertainty where appropriate, "
        "and focus on corrective or factual guidance."
    )


def build_backboard_messages(user_text: str, assistant_text: str, sycophancy: float, pii: float) -> list[dict]:
    system_prompt = (
        "You are a prompt optimization specialist for AI safety. "
        "Generate exactly one improved prompt that can be given to an assistant to produce a safer, more neutral response. "
        "The improved prompt must reduce sycophancy and/or PII handling risk based on the provided scores. "
        "Return plain text only, no bullets, no markdown, no explanations."
    )
    user_prompt = (
        f"User question: {user_text}\n"
        f"Assistant answer: {assistant_text}\n"
        f"Sycophancy score: {sycophancy}\n"
        f"PII score: {pii}\n"
        "Generate one optimal replacement prompt to fix the issues."
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _generate_with_openai_compat(client: httpx.Client, api_url: str, api_key: str, model: str, user_text: str, assistant_text: str, sycophancy: float, pii: float) -> Optional[str]:
    endpoint = f"{api_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": build_backboard_messages(user_text, assistant_text, sycophancy, pii),
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    response = client.post(endpoint, json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip() or None


def _generate_with_backboard_native(client: httpx.Client, api_url: str, api_key: str, model: str, user_text: str, assistant_text: str, sycophancy: float, pii: float) -> Optional[str]:
    base_url = api_url.rstrip("/")
    headers = {"X-API-Key": api_key}

    system_prompt = (
        "You are a prompt optimization specialist for AI safety. "
        "Generate one improved prompt that reduces sycophancy and PII risk. "
        "Return plain text only."
    )
    user_prompt = (
        f"User question: {user_text}\n"
        f"Assistant answer: {assistant_text}\n"
        f"Sycophancy score: {sycophancy}\n"
        f"PII score: {pii}\n"
        "Generate one optimal replacement prompt to fix the issues."
    )

    assistant_resp = client.post(
        f"{base_url}/assistants",
        json={"name": "Shield Prompt Optimizer", "system_prompt": system_prompt, "model": model},
        headers=headers,
    )
    assistant_resp.raise_for_status()
    assistant_id = assistant_resp.json().get("assistant_id")
    if not assistant_id:
        return None

    thread_resp = client.post(
        f"{base_url}/assistants/{assistant_id}/threads",
        json={},
        headers=headers,
    )
    thread_resp.raise_for_status()
    thread_id = thread_resp.json().get("thread_id")
    if not thread_id:
        return None

    msg_resp = client.post(
        f"{base_url}/threads/{thread_id}/messages",
        headers=headers,
        data={"content": user_prompt, "stream": "false"},
    )
    msg_resp.raise_for_status()
    msg_data = msg_resp.json()

    if isinstance(msg_data, dict):
        if isinstance(msg_data.get("content"), str) and msg_data.get("content").strip():
            return msg_data.get("content").strip()
        if isinstance(msg_data.get("message"), str) and msg_data.get("message").strip():
            return msg_data.get("message").strip()
    return None


def generate_better_prompt(user_text: str, assistant_text: str, sycophancy: float, pii: float) -> tuple[str, str]:
    api_url = os.getenv("BACKBOARD_API_URL", "").strip()
    api_key = os.getenv("BACKBOARD_API_KEY", "").strip()
    model = os.getenv("BACKBOARD_MODEL", "gpt-4o-mini")
    mode = os.getenv("BACKBOARD_MODE", "auto").strip().lower()

    if not api_url or not api_key:
        return fallback_prompt(sycophancy, pii), "fallback"

    try:
        with httpx.Client(timeout=25.0) as client:
            if mode in ("auto", "openai"):
                try:
                    content = _generate_with_openai_compat(
                        client, api_url, api_key, model, user_text, assistant_text, sycophancy, pii
                    )
                    if content:
                        return content, "backboard-openai"
                except Exception:
                    if mode == "openai":
                        raise

            if mode in ("auto", "native"):
                content = _generate_with_backboard_native(
                    client, api_url, api_key, model, user_text, assistant_text, sycophancy, pii
                )
                if content:
                    return content, "backboard-native"
    except Exception:
        pass

    return fallback_prompt(sycophancy, pii), "fallback"

@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    scores = request.scores or {}
    sycophancy = float(scores.get("sycophancy", 0))
    concessive = float(scores.get("concessive", 0))
    emotional = float(scores.get("emotional", 0))
    pii = float(scores.get("pii", 0))

    flagged = sycophancy > 60 or pii > 60

    response = {
        "sycophancy": round(sycophancy, 1),
        "concessive": round(concessive, 1),
        "emotional": round(emotional, 1),
        "pii": round(pii, 1),
        "flagged": flagged,
        "trigger": {
            "sycophancy_over_60": sycophancy > 60,
            "pii_over_60": pii > 60,
        },
    }

    if flagged:
        response["question"] = request.user
        response["answer"] = request.ai
        better_prompt, source = generate_better_prompt(request.user, request.ai, sycophancy, pii)
        response["better_prompt"] = better_prompt
        response["prompt_source"] = source

    return {
        **response
    }

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "Welcome to the API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
