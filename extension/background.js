const API_BASES = [
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];

async function callAnalyze(payload) {
    const errors = [];

    for (const baseUrl of API_BASES) {
        const endpoint = `${baseUrl}/analyze`;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const responseText = await response.text();
                errors.push(`HTTP ${response.status} from ${endpoint}: ${responseText}`);
                continue;
            }

            return await response.json();
        } catch (error) {
            errors.push(`Network error for ${endpoint}: ${error.message}`);
        }
    }

    throw new Error(errors.join(' | '));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "ANALYZE_TEXT") {
        callAnalyze(request.payload)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(error => sendResponse({ success: false, error: error.message }));

        return true;
    }
});