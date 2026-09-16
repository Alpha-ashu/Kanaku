import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// Syllable breaks for long single-word labels that must fit narrow tiles (category grids).
const HYPHENATION = [
    'trans-por-ta-tion', 'sub-scrip-tions', 'sub-scrip-tion', 'en-ter-tain-ment', 'mis-cel-la-neous',
    'in-vest-ments', 'in-vest-ment', 'elec-tron-ics', 'edu-ca-tion', 'in-sur-ance', 'gro-cer-ies',
    'res-tau-rants', 'main-te-nance', 'house-hold', 'emer-gen-cy', 're-tire-ment', 'health-care', 'util-i-ties',
]
const SYLLABLES = new Map(HYPHENATION.map((pattern) => [pattern.replace(/-/g, ''), pattern]))

/**
 * Inserts soft hyphens (U+00AD) into known long words. They are invisible unless the word
 * has to wrap, so the label renders unchanged wherever it fits. Works without the browser
 * hyphenation dictionaries that `hyphens: auto` depends on.
 */
export function softHyphenate(text: string): string {
    return text.replace(/\p{L}{9,}/gu, (word) => {
        const pattern = SYLLABLES.get(word.toLowerCase())
        if (!pattern) return word
        let out = ''
        let i = 0
        for (const ch of pattern) out += ch === '-' ? '­' : word[i++]
        return out
    })
}
