import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const BASE_URL = 'https://api.zoom.us/v2/aiservices'

function env(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Environment variable ${name} is required`)
    return value
}

// Zoom Build platform credentials are exchanged for a self-signed HS256 JWT
// (iss = API key). No OAuth dance needed — see the ai-services-quickstart repo.
function generateJWT(): string {
    const apiKey = env('ZOOM_API_KEY')
    const apiSecret = env('ZOOM_API_SECRET')
    const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url')
    const now = Math.round(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = b64url(JSON.stringify({ iss: apiKey, iat: now - 30, exp: now + 60 * 60 }))
    const signature = createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest('base64url')
    return `${header}.${payload}.${signature}`
}

async function post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${generateJWT()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Zoom API ${path} failed (${res.status} ${res.statusText}): ${detail}`)
    }
    return res.json()
}

const AUDIO_MIME: Record<string, string> = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
}

export async function transcribe(source: string, language: string, channelSeparation: boolean) {
    let file: string
    if (/^https?:\/\//.test(source)) {
        file = source
    } else {
        const ext = extname(source).toLowerCase()
        const mime = AUDIO_MIME[ext]
        if (!mime) throw new Error(`Unsupported audio format "${ext}". Supported: ${Object.keys(AUDIO_MIME).join(', ')}`)
        const data = await readFile(source)
        file = `data:${mime};base64,${data.toString('base64')}`
    }
    return post('/scribe/transcribe', {
        file,
        config: { language, channel_separation: channelSeparation },
    })
}

export type SummarizerTask = 'recap' | 'action_items' | 'summary' | 'full_summary'

export async function summarize(text: string, task: SummarizerTask, language: string) {
    return post('/summarizer/summarize', {
        input: { text },
        config: { task, language, summary_type: 'conversation' },
    })
}

// The Translator fast endpoint caps input at 4,000 characters, so longer
// texts are split on paragraph/sentence boundaries and translated per chunk.
const TRANSLATE_LIMIT = 4000

export function splitForTranslation(text: string, limit = TRANSLATE_LIMIT): string[] {
    if (text.length <= limit) return [text]
    const chunks: string[] = []
    let current = ''
    // Prefer paragraph breaks, then sentence ends (Japanese and Latin), as split points.
    const pieces = text.split(/(?<=\n\n)|(?<=[。！？!?.]\s?)/)
    for (const piece of pieces) {
        // A single sentence longer than the limit gets hard-split.
        if (piece.length > limit) {
            if (current) { chunks.push(current); current = '' }
            for (let i = 0; i < piece.length; i += limit) chunks.push(piece.slice(i, i + limit))
            continue
        }
        if (current.length + piece.length > limit && current) {
            chunks.push(current)
            current = ''
        }
        current += piece
    }
    if (current) chunks.push(current)
    return chunks
}

export async function translate(text: string, sourceLanguage: string, targetLanguage: string) {
    const chunks = splitForTranslation(text)
    const results: string[] = []
    for (const chunk of chunks) {
        const data = await post('/translator/translate', {
            text: chunk,
            config: { source_language: sourceLanguage, target_languages: [targetLanguage] },
        })
        const translations = data?.result?.translations ?? {}
        results.push(String(Object.values(translations)[0] ?? ''))
    }
    return { translated: results.join(''), chunk_count: chunks.length }
}
