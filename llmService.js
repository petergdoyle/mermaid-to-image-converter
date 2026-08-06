/**
 * LLM Service for Generating Mermaid Diagrams
 * Supports Ollama (local) and Google Gemini (remote)
 */

async function generateDiagrams(prompt, provider, model, config = {}) {
    const prov = (provider || process.env.DEFAULT_LLM_PROVIDER || 'ollama').toLowerCase();
    const mdl = model || process.env.DEFAULT_LLM_MODEL || 'gemma4:12b';

    const systemPrompt = `You are an expert system architect and visual communicator.
Analyze the user's description of a system, process, interaction, or relationship.
Determine the most appropriate types of diagrams (e.g., flowchart, sequence diagram, entity relationship diagram, state diagram, class diagram, timeline, git graph, pie chart, user journey, gantt chart, mindmap) to represent the use-case.
Choose between 1 to 3 relevant diagram types.

For each diagram, you must output a markdown section in the following format. Ensure there is a blank line between each section:

### Diagram Name
Type: flowchart (or sequence, er, state, class, etc.)
Description: Brief explanation of what this diagram illustrates and why this type was chosen.
\`\`\`mermaid
[mermaid code]
\`\`\`

Do not output any conversational introduction or conclusion. Start directly with the first diagram section.`;

    const userContent = `User Request: "${prompt}"`;

    if (prov === 'ollama') {
        const host = config.endpoint || process.env.OLLAMA_HOST || 'http://localhost:11434';
        const url = `${host}/api/generate`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: mdl,
                prompt: `${systemPrompt}\n\n${userContent}`,
                stream: false,
                options: {
                    temperature: 0.2,
                    num_predict: 4096
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama request failed: ${response.statusText}. ${errText}`);
        }

        const data = await response.json();
        return parseResponse(data.response);

    } else if (prov === 'google') {
        const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('Gemini API Key is not configured.');
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\n\n${userContent}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 4096
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini request failed: ${response.statusText}. ${errText}`);
        }

        const data = await response.json();
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
            throw new Error('Invalid response from Gemini API.');
        }

        const text = data.candidates[0].content.parts[0].text;
        return parseResponse(text);

    } else {
        throw new Error(`Unsupported LLM provider: ${prov}`);
    }
}

function parseResponse(text) {
    const diagrams = [];
    
    // Split the text into sections by ### headers
    const sections = text.split(/###\s+/);
    
    for (let i = 1; i < sections.length; i++) {
        const section = sections[i].trim();
        if (!section) continue;
        
        // Extract Name (first line of the section)
        const nameLine = section.split('\n')[0].trim();
        
        // Extract Type using regex
        const typeMatch = section.match(/Type:\s*([a-zA-Z0-9_\-]+)/i);
        const type = typeMatch ? typeMatch[1].trim() : 'flowchart';
        
        // Extract Description using regex
        const descMatch = section.match(/Description:\s*([^\n]+)/i);
        const description = descMatch ? descMatch[1].trim() : '';
        
        // Extract Mermaid block
        const mermaidMatch = section.match(/```mermaid([\s\S]*?)```/);
        const code = mermaidMatch ? mermaidMatch[1].trim() : '';
        
        if (code) {
            diagrams.push({
                id: `generated-diagram-${i}`,
                name: nameLine,
                type: type,
                description: description,
                code: code
            });
        }
    }
    
    if (diagrams.length === 0) {
        // Fallback: If it still outputted JSON despite the prompt, try parsing as JSON
        try {
            let cleanText = text.trim();
            const firstBrace = cleanText.indexOf('{');
            const lastBrace = cleanText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                cleanText = cleanText.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(cleanText);
                let diagramsArray = null;
                if (Array.isArray(parsed)) {
                    diagramsArray = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    if (Array.isArray(parsed.diagrams)) {
                        diagramsArray = parsed.diagrams;
                    } else {
                        for (const key in parsed) {
                            if (Array.isArray(parsed[key])) {
                                diagramsArray = parsed[key];
                                break;
                            }
                        }
                    }
                }
                
                if (diagramsArray) {
                    return {
                        diagrams: diagramsArray.map(d => ({
                            id: d.id || 'generated-diagram',
                            name: d.name || 'Generated Diagram',
                            type: d.type || 'flowchart',
                            description: d.description || '',
                            code: d.code || d.mermaid || ''
                        }))
                    };
                }
            }
        } catch (e) {
            // Ignore
        }
        
        console.error("Failed to parse response text:", text);
        throw new Error("Could not extract any valid Mermaid diagrams from the model response. Please check terminal logs.");
    }
    
    return { diagrams };
}

async function checkStatus(provider, model, config = {}) {
    const prov = (provider || process.env.DEFAULT_LLM_PROVIDER || 'ollama').toLowerCase();
    const mdl = model || process.env.DEFAULT_LLM_MODEL || 'gemma4:12b';

    if (prov === 'ollama') {
        const host = config.endpoint || process.env.OLLAMA_HOST || 'http://localhost:11434';
        try {
            const response = await fetch(`${host}/api/tags`);
            if (!response.ok) {
                return { available: false, reason: `Ollama server returned status ${response.status}` };
            }
            const data = await response.json();
            const models = data.models || [];
            
            const exists = models.some(m => {
                const name = m.name.toLowerCase();
                const target = mdl.toLowerCase();
                return name === target || name.split(':')[0] === target || target.split(':')[0] === name;
            });

            if (exists) {
                return { available: true, reason: `Model '${mdl}' is available on Ollama.` };
            } else {
                const availableModels = models.map(m => m.name).join(', ') || 'none';
                return { 
                    available: false, 
                    reason: `Ollama is running, but model '${mdl}' was not found. Available models: ${availableModels}. Use 'ollama pull ${mdl}' to download it.` 
                };
            }
        } catch (err) {
            return { available: false, reason: `Could not connect to Ollama at ${host}. Make sure Ollama is running.` };
        }
    } else if (prov === 'google') {
        const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { available: false, reason: 'Gemini API Key is not configured.' };
        }
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!response.ok) {
                return { available: false, reason: `Gemini API key is invalid or request failed with status ${response.status}.` };
            }
            return { available: true, reason: `Gemini API is ready. Model '${mdl}' will be called.` };
        } catch (err) {
            return { available: false, reason: `Failed to reach Gemini API: ${err.message}` };
        }
    } else {
        return { available: false, reason: `Unknown provider: ${prov}` };
    }
}

module.exports = {
    generateDiagrams,
    checkStatus
};
