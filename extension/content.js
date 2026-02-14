// Function to send data to Person 2's Backend
const analyzeChat = async (userText, aiText) => {
    console.log("Shield: Sending for analysis...");
    try {
        const response = await fetch('http://localhost:5000/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: userText, ai: aiText })
        });
        const data = await response.json();
        // Signal Person 1's UI script to show the alert
        window.dispatchEvent(new CustomEvent('shield_result', { detail: JSON.stringify(data) }));
    } catch (err) {
        console.error("Shield Backend Offline. Is Person 2's server running?");
    }
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