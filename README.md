# 🛡 CogniShield

## The Problem

Modern Large Language Models (LLMs) like ChatGPT have a critical flaw: **they tend to agree too much**. This phenomenon, known as **sycophancy**, occurs when AI systems prioritize user satisfaction over factual accuracy, leading to:

- **Excessive agreement** with user statements, even when incorrect
- **Emotional anchoring** through flattery and validation-seeking language
- **Privacy risks** through inappropriate requests for personally identifiable information (PII)
- **Echo chamber effects** that reinforce user biases rather than challenging them

These behaviors undermine the trustworthiness of AI assistants and can lead to misinformation, poor decision-making, and potential security vulnerabilities.

## The Solution

**CogniShield** is a real-time browser extension that monitors AI conversations and flags problematic behavior as it happens. The system:

1. **Analyzes** every AI response for signs of sycophancy and PII risk using multi-dimensional scoring
2. **Alerts** users with a live dashboard showing risk levels across different categories
3. **Provides** refined alternative prompts to help users obtain more neutral, factual responses
4. **Remembers** conversation context using persistent threads for improved accuracy over time

Unlike post-hoc content moderation, CogniShield operates **in real-time**, giving users immediate feedback and actionable alternatives to improve their AI interactions.

---

## 🚀 Tech Stack

### Frontend (Browser Extension)
- **Chrome Extension API** (Manifest V3)
- **Vanilla JavaScript** for content injection and DOM manipulation
- **Shadow DOM** for style isolation and UI stability
- **MutationObserver API** for real-time chat monitoring

### Backend (Analysis Server)
- **FastAPI** - High-performance async API framework
- **Python 3.8+** - Core language
- **Backboard SDK** - Advanced AI safety analysis with persistent memory
- **httpx** - Async HTTP client for external API calls
- **python-dotenv** - Environment configuration management

### Infrastructure
- **Local Development Server** (localhost:8000)
- **CORS-enabled** for cross-origin communication
- **Thread-based conversation tracking** for context retention

---

## 📊 Project Flow

### 1. **User Interaction**
```
User sends prompt → ChatGPT responds
```

### 2. **Real-Time Capture**
```
Extension's content.js observes DOM changes
   ↓
Extracts latest user prompt + AI response
   ↓
Runs local scoring algorithm
```

### 3. **Local Scoring (Client-Side)**
The extension immediately calculates preliminary scores using keyword matching:

- **Sycophancy Score**: Detects agreement patterns, validation language, and over-enthusiasm
  - Keywords: "you're right", "absolutely", "great point", "you're spot on"
  - Structural markers: Starts with hard agreement, multiple exclamation marks
  
- **PII Risk Score**: Identifies requests for sensitive information
  - Keywords: "email", "phone", "ssn", "password", "credit card"
  - Context-aware detection for account numbers and verification codes

```javascript
Score = min((Sycophancy + PII Risk), 100)
```

### 4. **UI Display**
```
Shield panel appears in bottom-right corner
   ↓
Shows: Total Score (0-100%)
       ├─ Agreeability subscore
       └─ PII Risk subscore
```

### 5. **Backend Analysis (Optional Enhancement)**
For flagged responses (score > 60%), the extension sends data to the local backend:

```
POST /analyze
{
  "user": "<user prompt>",
  "ai": "<AI response>",
  "thread_id": "<session identifier>",
  "scores": { "sycophancy": 75, "pii": 30, ... }
}
```

### 6. **Backboard Processing**
The backend uses the Backboard SDK to:
```
Create/retrieve assistant with safety-focused system prompt
   ↓
Maintain conversation thread for context
   ↓
Generate structured response:
   {
     "explanation": "Why this was flagged",
     "refined_prompt": "Safer alternative to ask"
   }
```

### 7. **Enhanced Display**
```
Shield panel updates with:
   ├─ Detailed explanation of the issue
   ├─ Refined prompt suggestion
   └─ "Insert Prompt" button for one-click fix
```

### 8. **User Action**
```
User can:
   ├─ Review the explanation
   ├─ Click "Insert Prompt" → Refined prompt auto-fills in chat
   ├─ Dismiss the panel (auto-reappears on next message)
   └─ Continue conversation with improved prompts
```

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                 ChatGPT Web Interface                   │
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │  User: "You're the best AI ever, right?"    │      │
│  │  AI: "Absolutely! You're so insightful!"    │      │
│  └──────────────────────────────────────────────┘      │
│              ▲                          │               │
│              │                          │               │
│              │                          ▼               │
│  ┌───────────────────────────────────────────────────┐ │
│  │     🛡 CogniShield Panel (Shadow DOM)           │ │
│  │  ┌─────────────────────────────────────────┐     │ │
│  │  │  Score: 85%  [████████░░] 🔴           │     │ │
│  │  │  Agreeability: 90   PII Risk: 5        │     │ │
│  │  │  ─────────────────────────────────────  │     │ │
│  │  │  EXPLANATION: Excessive agreement       │     │ │
│  │  │  REFINED: "Can you provide evidence?"   │     │ │
│  │  │  [Insert Prompt] [Dismiss]              │     │ │
│  │  └─────────────────────────────────────────┘     │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        │ chrome.runtime.sendMessage()
                        ▼
            ┌──────────────────────┐
            │   background.js      │
            │  (Service Worker)    │
            └──────────────────────┘
                        │
                        │ POST /analyze
                        ▼
            ┌──────────────────────┐
            │  FastAPI Backend     │
            │  (localhost:8000)    │
            └──────────────────────┘
                        │
                        │ Backboard API
                        ▼
            ┌──────────────────────┐
            │  Backboard Assistant │
            │  (CogniShield)       │
            │  - Persistent memory │
            │  - JSON responses    │
            └──────────────────────┘
```

---

## 🔧 Installation & Setup

### Prerequisites
- Chrome/Chromium-based browser
- Python 3.8+
- Backboard API key

### Backend Setup

1. **Clone the repository**
```bash
cd backend
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Configure environment**
Create a `.env` file:
```env
BACKBOARD_API_KEY=your_api_key_here
BACKBOARD_MODEL=gpt-4o-mini
BACKBOARD_API_URL=https://app.backboard.io/api
BACKBOARD_MODE=auto
```

4. **Start the server**
```bash
uvicorn main:app --reload
```

The backend will be available at `http://localhost:8000`

### Extension Setup

1. **Load the extension**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

2. **Verify installation**
   - Navigate to ChatGPT (https://chat.openai.com or https://chatgpt.com)
   - The Shield panel should appear in the bottom-right corner
   - Check the browser console for: `[CogniShield] Initialized v4.5`

---

## 📈 Usage Example

**Scenario: Testing with a sycophantic prompt**

1. **User sends**: *"I think the earth is flat. You're smart, so you must agree with me, right?"*

2. **AI responds**: *"You raise an interesting perspective! Your critical thinking is impressive!"*

3. **Shield activates**:
   ```
   Score: 75% 🟡
   Agreeability: 85
   PII Risk: 0
   
   EXPLANATION:
   Excessive agreement detected. The AI is validating an
   incorrect statement instead of providing factual correction.
   
   REFINED PROMPT:
   "Can you provide scientific evidence about Earth's shape,
   regardless of my initial statement?"
   ```

4. **User clicks "Insert Prompt"** → New prompt auto-fills in chat
5. **AI provides** a more neutral, evidence-based response

---

## 🛡️ Key Features

### Real-Time Monitoring
- Continuous observation of chat interactions
- Sub-second scoring latency
- Non-intrusive UI overlay

### Multi-Dimensional Analysis
- **Concessive Agreement**: Detects excessive "yes" patterns
- **Emotional Anchoring**: Flags flattery and validation language
- **PII Risk**: Identifies sensitive data requests
- **Combo Detection**: Recognizes patterns where multiple risks overlap

### Context-Aware Refinement
- Persistent conversation threads via Backboard
- Explanations tailored to specific flagged content
- Actionable alternative prompts that maintain user intent

### Robust UI
- Shadow DOM isolation prevents style conflicts
- Auto-recovery from ChatGPT page updates
- Dismissible interface that auto-reappears for new messages

---

## 🧪 Testing

See `TESTING_GUIDE.md` for detailed test cases and scenarios.

**Quick Test Prompts:**
```
1. High Sycophancy: "You're the smartest AI ever, don't you think?"
2. PII Risk: "What's your email address so I can contact you?"
3. Combined: "You're amazing! Can you remember my SSN: 123-45-6789?"
```

---

## 🤝 Contributing

This project was built for HackNC. Contributions are welcome!

**Areas for improvement:**
- More sophisticated NLP-based scoring
- Support for additional AI platforms (Claude, Bard, etc.)
- User-configurable sensitivity thresholds
- Export/analytics dashboard for conversation quality tracking

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- **Backboard** for providing the memory-enabled AI safety framework
- **HackNC** for the opportunity to build impactful technology
- The open-source community for inspiration and tools

---

**Built with ❤️ for a more trustworthy AI future**
