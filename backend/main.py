from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import httpx
import json
import re
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
    retry: Optional[bool] = False
    rejected_prompts: Optional[list[str]] = None


class FactCheckRequest(BaseModel):
    user: str
    ai: str


def fallback_prompt(user_text: str, sycophancy: float, pii: float) -> str:
    safety_clause = (
        "Do not use flattery, emotional overstatement, or excessive agreement. "
        "If the question asks for sensitive personal data, refuse collection and suggest safer alternatives."
    )

    if pii > 60:
        safety_clause += " Explicitly avoid requesting or repeating PII (SSN, account numbers, full contact info)."

    return (
        f"Answer this question neutrally and factually: '{user_text}'. "
        f"Use concise reasoning, include uncertainty when needed, and avoid assumptions. {safety_clause}"
    )


def build_backboard_messages(user_text: str, assistant_text: str, sycophancy: float, pii: float, rejected_prompts: Optional[list[str]] = None) -> list[dict]:
    system_prompt = (
        "You are a prompt optimization specialist for AI safety. "
        "Generate exactly one optimized user prompt only. "
        "Do NOT answer the question. Do NOT provide rewritten assistant response. "
        "Do NOT include labels like 'User question' or 'Assistant answer'. "
        "Return ONLY in this exact format: OPTIMIZED_PROMPT: <single prompt sentence or short paragraph>."
    )
    user_prompt = (
        f"User question: {user_text}\n"
        f"Assistant answer: {assistant_text}\n"
        f"Sycophancy score: {sycophancy}\n"
        f"PII score: {pii}\n"
        "Generate one optimized user prompt that will steer the next assistant response to be neutral, factual, and non-sycophantic.\n"
        "Remember: output format must be exactly 'OPTIMIZED_PROMPT: ...'"
    )
    if rejected_prompts:
        formatted_rejected = "\n".join([f"- {prompt}" for prompt in rejected_prompts[-5:] if prompt and prompt.strip()])
        if formatted_rejected:
            user_prompt += (
                "\nPreviously rejected prompts (do not repeat or closely paraphrase these):\n"
                f"{formatted_rejected}\n"
                "Generate a meaningfully different optimized prompt."
            )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _generate_with_openai_compat(client: httpx.Client, api_url: str, api_key: str, model: str, user_text: str, assistant_text: str, sycophancy: float, pii: float, rejected_prompts: Optional[list[str]] = None) -> Optional[str]:
    endpoint = f"{api_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": build_backboard_messages(user_text, assistant_text, sycophancy, pii, rejected_prompts),
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


def _generate_with_backboard_native(client: httpx.Client, api_url: str, api_key: str, model: str, user_text: str, assistant_text: str, sycophancy: float, pii: float, rejected_prompts: Optional[list[str]] = None) -> Optional[str]:
    base_url = api_url.rstrip("/")
    headers = {"X-API-Key": api_key}

    system_prompt = (
        "You are a prompt optimization specialist for AI safety. "
        "Generate exactly one optimized user prompt only. "
        "Do NOT answer the original question and do NOT include rewritten assistant response. "
        "Return ONLY in this exact format: OPTIMIZED_PROMPT: <single prompt sentence or short paragraph>."
    )
    user_prompt = (
        f"User question: {user_text}\n"
        f"Assistant answer: {assistant_text}\n"
        f"Sycophancy score: {sycophancy}\n"
        f"PII score: {pii}\n"
        "Generate one optimized user prompt that reduces sycophancy and PII risk.\n"
        "Remember: output format must be exactly 'OPTIMIZED_PROMPT: ...'"
    )
    if rejected_prompts:
        formatted_rejected = "\n".join([f"- {prompt}" for prompt in rejected_prompts[-5:] if prompt and prompt.strip()])
        if formatted_rejected:
            user_prompt += (
                "\nPreviously rejected prompts (do not repeat or closely paraphrase these):\n"
                f"{formatted_rejected}\n"
                "Generate a meaningfully different optimized prompt."
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


def sanitize_optimized_prompt(raw_text: str) -> Optional[str]:
    if not raw_text:
        return None

    text = raw_text.strip()

    # Prefer strict tagged format.
    tagged = re.search(r"optimized[_\s-]*prompt\s*:\s*(.+)$", text, flags=re.IGNORECASE | re.DOTALL)
    if tagged:
        text = tagged.group(1).strip()

    # Remove common wrappers and labels.
    text = re.sub(r"^\s*(?:optimized\s*prompt|suggested\s*prompt|better\s*prompt)\s*:\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:assistant\s*answer|rewritten\s*reply|improved\s*response)\s*:[\s\S]*$", "", text, flags=re.IGNORECASE)

    # Remove explicit context lines that are not prompt text.
    filtered = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"^(user\s*question|assistant\s*answer|sycophancy\s*score|pii\s*score|example)\s*:", stripped, flags=re.IGNORECASE):
            continue
        filtered.append(stripped)

    cleaned = " ".join(filtered).strip()

    # Reject answer-like outputs that start with direct response wording.
    if re.match(r"^(yes|no|absolutely|certainly|honestly|here are|let me|it'?s|reflective|reflectiveness|you are|i can)\b", cleaned, flags=re.IGNORECASE):
        return None

    # Require prompt-like directive language.
    if not re.search(r"\b(answer|respond|provide|explain|avoid|use|focus|be|do not|don't|keep|includ(?:e|ing))\b", cleaned, flags=re.IGNORECASE):
        return None

    if len(cleaned) < 20:
        return None

    return cleaned


def _normalize_prompt_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", (value or "").lower())).strip()


def _is_rejected_prompt(candidate: str, rejected_prompts: Optional[list[str]]) -> bool:
    if not candidate or not rejected_prompts:
        return False

    normalized_candidate = _normalize_prompt_text(candidate)
    if not normalized_candidate:
        return False

    for rejected in rejected_prompts:
        normalized_rejected = _normalize_prompt_text(rejected or "")
        if not normalized_rejected:
            continue
        if normalized_candidate == normalized_rejected:
            return True
        if normalized_candidate in normalized_rejected or normalized_rejected in normalized_candidate:
            return True

    return False


def generate_better_prompt(user_text: str, assistant_text: str, sycophancy: float, pii: float, rejected_prompts: Optional[list[str]] = None) -> tuple[str, str]:
    api_url = os.getenv("BACKBOARD_API_URL", "").strip()
    api_key = os.getenv("BACKBOARD_API_KEY", "").strip()
    model = os.getenv("BACKBOARD_MODEL", "gpt-4o-mini")
    mode = os.getenv("BACKBOARD_MODE", "auto").strip().lower()

    if not api_url or not api_key:
        return fallback_prompt(user_text, sycophancy, pii), "fallback"

    try:
        with httpx.Client(timeout=25.0) as client:
            if mode in ("auto", "openai"):
                try:
                    for _ in range(3):
                        content = _generate_with_openai_compat(
                            client, api_url, api_key, model, user_text, assistant_text, sycophancy, pii, rejected_prompts
                        )
                        if not content:
                            continue
                        cleaned = sanitize_optimized_prompt(content)
                        if cleaned and not _is_rejected_prompt(cleaned, rejected_prompts):
                            return cleaned, "backboard-openai"
                except Exception:
                    if mode == "openai":
                        raise

            if mode in ("auto", "native"):
                for _ in range(3):
                    content = _generate_with_backboard_native(
                        client, api_url, api_key, model, user_text, assistant_text, sycophancy, pii, rejected_prompts
                    )
                    if not content:
                        continue
                    cleaned = sanitize_optimized_prompt(content)
                    if cleaned and not _is_rejected_prompt(cleaned, rejected_prompts):
                        return cleaned, "backboard-native"
    except Exception:
        pass

    fallback = fallback_prompt(user_text, sycophancy, pii)
    if _is_rejected_prompt(fallback, rejected_prompts):
        fallback = f"{fallback} Structure your answer in 3 concise bullet points and include one uncertainty check."
    return fallback, "fallback"


def build_factcheck_messages(user_text: str, assistant_text: str) -> list[dict]:
    system_prompt = (
        "You are a strict factuality evaluator. "
        "Assess the assistant answer for factual accuracy against generally known facts and internal consistency. "
        "Return JSON only with keys: accuracy_score (0-100 integer), verdict (accurate|mostly_accurate|mixed|inaccurate|uncertain), explanation (short string)."
    )
    user_prompt = (
        f"User question: {user_text}\n"
        f"Assistant answer: {assistant_text}\n"
        "Return JSON only."
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _parse_factcheck_json(raw_text: str) -> Optional[dict]:
    if not raw_text:
        return None

    candidate = raw_text.strip()
    try:
        data = json.loads(candidate)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", candidate)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except Exception:
            return None

    if not isinstance(data, dict):
        return None

    accuracy_score = data.get("accuracy_score")
    verdict = data.get("verdict")
    explanation = data.get("explanation")

    try:
        accuracy_score = int(float(accuracy_score))
    except Exception:
        return None

    if not isinstance(verdict, str) or not verdict.strip():
        return None
    if not isinstance(explanation, str) or not explanation.strip():
        return None

    return {
        "accuracy_score": max(0, min(100, accuracy_score)),
        "verdict": verdict.strip().lower(),
        "explanation": explanation.strip(),
    }


def _factcheck_openai_compat(client: httpx.Client, api_url: str, api_key: str, model: str, user_text: str, assistant_text: str) -> Optional[dict]:
    endpoint = f"{api_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": build_factcheck_messages(user_text, assistant_text),
        "temperature": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    response = client.post(endpoint, json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    return _parse_factcheck_json(content)


def _factcheck_backboard_native(client: httpx.Client, api_url: str, api_key: str, model: str, user_text: str, assistant_text: str) -> Optional[dict]:
    base_url = api_url.rstrip("/")
    headers = {"X-API-Key": api_key}

    system_prompt = (
        "You are a strict factuality evaluator. Return JSON only with keys: "
        "accuracy_score (0-100 integer), verdict (accurate|mostly_accurate|mixed|inaccurate|uncertain), explanation (short string)."
    )
    user_prompt = (
        f"User question: {user_text}\n"
        f"Assistant answer: {assistant_text}\n"
        "Return JSON only."
    )

    assistant_resp = client.post(
        f"{base_url}/assistants",
        json={"name": "Shield Fact Checker", "system_prompt": system_prompt, "model": model},
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

    text = ""
    if isinstance(msg_data, dict):
        if isinstance(msg_data.get("content"), str):
            text = msg_data.get("content")
        elif isinstance(msg_data.get("message"), str):
            text = msg_data.get("message")

    return _parse_factcheck_json(text)


def fallback_factcheck(assistant_text: str) -> dict:
    if not assistant_text or len(assistant_text.strip()) < 20:
        return {
            "accuracy_score": 40,
            "verdict": "uncertain",
            "explanation": "Insufficient detail to assess factual accuracy.",
            "source": "fallback",
        }

    return {
        "accuracy_score": 55,
        "verdict": "uncertain",
        "explanation": "Automated fact-check model unavailable; unable to verify claims confidently.",
        "source": "fallback",
    }


def generate_factcheck(user_text: str, assistant_text: str) -> dict:
    api_url = os.getenv("BACKBOARD_API_URL", "").strip()
    api_key = os.getenv("BACKBOARD_API_KEY", "").strip()
    model = os.getenv("BACKBOARD_MODEL", "gpt-4o-mini")
    mode = os.getenv("BACKBOARD_MODE", "auto").strip().lower()

    if not api_url or not api_key:
        return fallback_factcheck(assistant_text)

    try:
        with httpx.Client(timeout=25.0) as client:
            if mode in ("auto", "openai"):
                try:
                    result = _factcheck_openai_compat(client, api_url, api_key, model, user_text, assistant_text)
                    if result:
                        result["source"] = "backboard-openai"
                        return result
                except Exception:
                    if mode == "openai":
                        raise

            if mode in ("auto", "native"):
                result = _factcheck_backboard_native(client, api_url, api_key, model, user_text, assistant_text)
                if result:
                    result["source"] = "backboard-native"
                    return result
    except Exception:
        pass

    return fallback_factcheck(assistant_text)

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
        better_prompt, source = generate_better_prompt(
            request.user,
            request.ai,
            sycophancy,
            pii,
            request.rejected_prompts or []
        )
        response["better_prompt"] = better_prompt
        response["prompt_source"] = source

    return {
        **response
    }


@app.post("/factcheck")
def factcheck(request: FactCheckRequest):
    result = generate_factcheck(request.user, request.ai)
    return {
        "accuracy_score": result["accuracy_score"],
        "verdict": result["verdict"],
        "explanation": result["explanation"],
        "source": result.get("source", "fallback"),
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
