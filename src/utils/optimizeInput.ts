// Client-side heuristic input optimization — no LLM call required.
// Extracted as a pure function so it can be unit-tested without the Zustand store
// (which pulls in Tauri APIs unavailable under vitest).

export type OptimizeMode = 'structure' | 'concise' | 'detailed' | 'fix';

export function optimizeInput(text: string, mode: OptimizeMode): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  switch (mode) {
    case 'structure': {
      // Break into clear sections: Goal → Context → Constraints → Output format
      if (trimmed.includes('\n')) return trimmed; // already structured
      return `**Goal:**\n${trimmed}\n\n**Context:**\n\n**Constraints:**\n\n**Expected output:**`;
    }
    case 'concise': {
      // Strip filler words, collapse whitespace
      return trimmed
        .replace(/\b(please|kindly|could you|i would like you to|i want you to|just|basically|really|very)\b/gi, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;!?])/g, '$1')
        .trim();
    }
    case 'detailed': {
      // Expand with common clarification prompts
      return `${trimmed}\n\nPlease:\n- Explain your reasoning step by step\n- Show relevant code blocks with language tags\n- Note any assumptions you make\n- Suggest follow-up questions at the end`;
    }
    case 'fix': {
      // Basic typo / whitespace / capitalization fixes
      let fixed = trimmed.replace(/\s+/g, ' ').trim();
      fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
      if (!/[.!?]$/.test(fixed)) fixed += '.';
      return fixed;
    }
    default:
      return trimmed;
  }
}
