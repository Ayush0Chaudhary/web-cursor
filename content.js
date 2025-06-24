// --- Globals ---
let explainerPopup = null; // Holds the reference to our UI popup
let highlightElement = null; // Holds the reference to our highlight span

/**
 * Removes the highlight from the page by unwrapping the content of our <span>.
 */
function removeHighlight() {
    if (highlightElement) {
        const parent = highlightElement.parentNode;
        // Move all children of the highlight span out into the parent
        while (highlightElement.firstChild) {
            parent.insertBefore(highlightElement.firstChild, highlightElement);
        }
        // Remove the now-empty highlight span
        parent.removeChild(highlightElement);
        highlightElement = null;
    }
}

/**
 * Removes the popup and the highlight from the DOM.
 */
function removePopup() {
    if (explainerPopup) {
        explainerPopup.remove();
        explainerPopup = null;
    }
    // Also remove the highlight when the popup is closed
    removeHighlight();
}

/**
 * Wraps a DOM Range in a <span> to highlight it.
 * @param {Range} range - The DOM Range object of the user's selection.
 */
function applyHighlight(range) {
    // Remove any previous highlight first
    removeHighlight();

    // Create a <span> element to wrap the selection
    highlightElement = document.createElement('span');
    highlightElement.className = 'gemini-explainer-highlight';

    try {
        // The surroundContents method is the perfect tool for this job.
        // It wraps the content of the range with the new node.
        range.surroundContents(highlightElement);
    } catch (error) {
        // This can fail if the selection spans across invalid element boundaries.
        console.error("Gemini Explainer: Could not apply highlight to the selection.", error);
        highlightElement = null; // Ensure we don't hold a reference if it failed
    }
}


/**
 * Scrapes the entire visible file content from a GitHub page using the hidden textarea.
 * @returns {string|null} The full code as a string, or null if it can't be found.
 */
function getFullFileContent() {
    // Find the specific textarea element by its ID.
    const fileTextArea = document.getElementById('read-only-cursor-text-area');
    console.log(fileTextArea);
    if (fileTextArea) {
        // The .value of a textarea contains its full text content.
        return fileTextArea.value;
    } else {
        // Fallback or error if the element isn't found on the page.
        console.warn("Gemini Explainer: Could not find the file content textarea (#read-only-cursor-text-area).");
        return null;
    }
}

/**
 * Creates a list of autofill suggestions.
 * @param {string} selectedText - The code snippet the user highlighted.
 * @returns {string[]} A list of suggested questions.
 */
function getAutofillSuggestions(selectedText) {
    // Basic suggestions
    const suggestions = [
        "Explain this code.",
        "What is the purpose of this function?",
        "How can I improve this code?",
    ];

    // Suggest more specific questions if the selection looks like a function
    if (selectedText.match(/function\s+\w+\s*\(.*\)\s*{/)) {
        suggestions.unshift("What are the inputs and outputs of this function?");
    }

    // Suggest a refactoring question if the code is long
    if (selectedText.length > 200) {
        suggestions.push("Can this code be refactored?");
    }

    return suggestions.slice(0, 4); // Limit to 4 suggestions for a clean UI
}

/**
 * Creates and displays the popup UI near the user's selection.
 * @param {number} x - The horizontal position (pageX) for the popup.
 * @param {number} y - The vertical position (pageY) for the popup.
 * @param {string} selectedText - The code snippet the user highlighted.
 * @param {string} fullFileContent - The entire content of the file.
 */
function createPopup(x, y, selectedText, fullFileContent) {
    // Remove any existing popup first.
    if (explainerPopup) {
        explainerPopup.remove();
    }

    // Create the main container
    explainerPopup = document.createElement('div');
    explainerPopup.id = 'gemini-explainer-popup';
    explainerPopup.style.left = `${x}px`;
    explainerPopup.style.top = `${y + 15}px`;

    // Create the input field
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'gemini-explainer-input';
    input.placeholder = 'Ask a question or select a suggestion';
    explainerPopup.appendChild(input);

    // Create a container for the suggestion buttons
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'gemini-explainer-suggestions';
    explainerPopup.appendChild(suggestionsContainer);

    // Create the response area
    const responseArea = document.createElement('div');
    responseArea.id = 'gemini-explainer-response';
    responseArea.textContent = 'Awaiting your question. Press Enter or click a suggestion.';
    explainerPopup.appendChild(responseArea);

    // Get suggestions and create buttons
    const suggestions = getAutofillSuggestions(selectedText);
    suggestions.forEach(suggestionText => {
        const button = document.createElement('button');
        button.className = 'gemini-suggestion-btn';
        button.textContent = suggestionText;
        button.addEventListener('click', () => {
            input.value = suggestionText; // Set input value on click
            responseArea.innerHTML = 'Thinking...';
            // Trigger the explanation fetch
            fetchExplanation(selectedText, fullFileContent, suggestionText, responseArea);
        });
        suggestionsContainer.appendChild(button);
    });

    document.body.appendChild(explainerPopup);
    input.focus();

    // Event listener for pressing Enter in the input field
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && input.value.trim() !== '') {
            event.preventDefault();
            const question = input.value;
            responseArea.innerHTML = 'Thinking...';
            fetchExplanation(selectedText, fullFileContent, question, responseArea);
        }
    });
}


/**
 * Fetches an explanation from the Gemini API.
 * @param {string} selectedCode - The selected code snippet.
 * @param {string} fullFileContent - The entire file's content for context.
 * @param {string} question - The user's question about the code.
 * @param {HTMLElement} responseElement - The div where the response should be displayed.
 */
async function fetchExplanation(selectedCode, fullFileContent, question, responseElement) {
    const apiKey = "AIzaSyB9O0DPTznEhv0I_3ca8iQe4zO_l6BnFJ0"; // <-- PASTE YOUR API KEY HERE

    if (!apiKey || apiKey === "YOUR_API_KEY") {
        responseElement.innerHTML = `<p style="color: #f7768e;"><strong>Error:</strong> API Key is missing. Please edit content.js.</p>`;
        return;
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // --- NEW, MORE DETAILED PROMPT ---
    const prompt = `
        You are an expert code assistant reviewing a file on GitHub. The user has a specific question about a selected piece of code within the larger file.
        Your task is to provide a clear, concise, and helpful explanation, using the full file for context. Format your answer using Markdown.

        **CONTEXT: THE ENTIRE FILE**
        \`\`\`
        ${fullFileContent}
        \`\`\`

        **CODE IN QUESTION: The user selected this part of the file:**
        \`\`\`
        ${selectedCode}
        \`\`\`

        **USER'S QUESTION:**
        "${question}"

        Your explanation:
    `;

    console.log(prompt);

    const payload = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }]
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
            const responseText = result.candidates[0].content.parts[0].text;
            responseElement.innerHTML = marked.parse(responseText);
        } else {
            console.warn("Unexpected API response structure:", result);
            throw new Error("Invalid response structure from API.");
        }

    } catch (error) {
        console.error("Error fetching from Gemini API:", error);
        responseElement.innerHTML = `<p style="color: #f7768e;"><strong>Error:</strong> Could not fetch an explanation. Check console.</p>`;
    }
}

// --- Main Event Listeners ---

document.addEventListener('mouseup', (event) => {
    // Ignore clicks inside our popup
    if (explainerPopup && explainerPopup.contains(event.target)) {
        return;
    }

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // Only proceed if there is a meaningful selection
    if (selectedText.length > 5) {
        // First, get the full file content
        const fullFileContent = getFullFileContent();
        if (!fullFileContent) {
            // If we can't get the file content, we can't proceed.
            console.log("Could not find file content. Aborting.");
            return;
        }

        // Get the selection's Range object for highlighting
        const range = selection.getRangeAt(0);
        applyHighlight(range);

        // Now create the popup
        createPopup(event.pageX, event.pageY, selectedText, fullFileContent);
    } else {
        // If there's no selection, remove any existing UI
        removePopup();
    }
});

// Listener to close the popup with the Escape key
document.addEventListener('keydown', (event) => {
    if (event.key === "Escape") {
        removePopup();
    }
});