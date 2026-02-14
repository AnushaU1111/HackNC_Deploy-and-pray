const analyzeChat = (userText, aiText) => {
    console.log("Shield: Asking Background Script to analyze...");

    chrome.runtime.sendMessage({
        type: "ANALYZE_TEXT",
        payload: { user: userText, ai: aiText }
    }, (response) => {
        if (response && response.success) {
            console.log("Shield: Received result:", response.data);
            window.dispatchEvent(new CustomEvent('shield_result', { detail: JSON.stringify(response.data) }));
        } else {
            console.error("Shield: Backend error:", response?.error);
        }
    });
};

// Observer to detect new messages
const observer = new MutationObserver(() => {
    // Target ChatGPT's message turn selector
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    if (turns.length > 0) {
        const lastTurn = turns[turns.length - 1];
        const aiMessage = lastTurn.querySelector('[data-message-author-role="assistant"]');

        // Check if it's the AI speaking and we haven't analyzed this specific bubble yet
        if (aiMessage && !lastTurn.dataset.analyzed) {
            // Check if the AI has finished "typing" (blinking cursor gone)
            if (!lastTurn.querySelector('.result-streaming')) {
                lastTurn.dataset.analyzed = "true";
                const aiText = aiMessage.innerText;
                const userText = turns[turns.length - 2]?.innerText || "No previous context";
                analyzeChat(userText, aiText);
            }
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });