from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

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


def generate_better_prompt(user_text: str, assistant_text: str, sycophancy: float, pii: float) -> str:
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
        response["better_prompt"] = generate_better_prompt(request.user, request.ai, sycophancy, pii)

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
