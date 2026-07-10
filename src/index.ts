#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { transcribe, summarize, translate } from './zoom.js'

const SCRIBE_LANGUAGES = 'e.g. ja-JP, en-US, zh-CN, ko-KR, es-ES, fr-FR, de-DE, pt-BR, it-IT'
const TRANSLATOR_LANGUAGES = ['en-US', 'zh-CN', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT'] as const
const SUMMARIZER_LANGUAGES = ['en-us', 'zh-cn', 'ja-jp', 'es-es', 'fr-fr', 'de-de', 'pt-br', 'it-it', 'ar-sa', 'ar-ae'] as const

const server = new McpServer({
    name: 'zoom-ai-mcp',
    version: '0.1.0',
})

server.registerTool(
    'transcribe_audio',
    {
        title: 'Transcribe audio (Zoom Scribe)',
        description:
            'Transcribe an audio/video file to text using the Zoom Scribe API. ' +
            'Accepts a local file path or an https URL (wav / mp3 / m4a / mp4). ' +
            'Returns the transcript with speaker-separated segments when channel_separation is enabled.',
        inputSchema: {
            source: z.string().describe('Local file path or https URL of the audio/video file'),
            language: z.string().default('ja-JP').describe(`BCP-47 language code of the audio (${SCRIBE_LANGUAGES})`),
            channel_separation: z.boolean().default(false).describe('Separate speakers by audio channel'),
        },
    },
    async ({ source, language, channel_separation }) => {
        const data = await transcribe(source, language, channel_separation)
        const text = data?.result?.text_display ?? ''
        const segments = (data?.result?.segments ?? [])
            .map((s: any) => `[${s.start.toFixed(1)}s${s.speaker ? ` ${s.speaker}` : ''}] ${s.text}`)
            .join('\n')
        const body = [
            `duration_sec: ${data?.duration_sec ?? 'unknown'}`,
            '',
            '## Transcript',
            text,
            ...(segments ? ['', '## Segments', segments] : []),
        ].join('\n')
        return { content: [{ type: 'text', text: body }] }
    },
)

server.registerTool(
    'summarize_transcript',
    {
        title: 'Summarize a conversation (Zoom Summarizer)',
        description:
            'Summarize a conversation transcript using the Zoom Summarizer API. ' +
            'Input is plain text / VTT / SRT (max 96 KB). ' +
            'task=recap gives a short recap, action_items extracts to-dos, ' +
            'summary gives a standard summary, full_summary the most detailed one.',
        inputSchema: {
            text: z.string().min(1).describe('The conversation transcript to summarize'),
            task: z.enum(['recap', 'action_items', 'summary', 'full_summary']).default('summary')
                .describe('What to generate from the transcript'),
            language: z.enum(SUMMARIZER_LANGUAGES).default('ja-jp').describe('Output language'),
        },
    },
    async ({ text, task, language }) => {
        const data = await summarize(text, task, language)
        const result = data?.result ?? {}
        const body = result.text ?? result.summary_text ?? result.recap ?? result.action_items ?? JSON.stringify(result, null, 2)
        return { content: [{ type: 'text', text: String(body) }] }
    },
)

server.registerTool(
    'translate_text',
    {
        title: 'Translate text (Zoom Translator)',
        description:
            'Translate text between languages using the Zoom Translator API. ' +
            'Texts longer than the 4,000-character API limit are automatically ' +
            'split on sentence boundaries and translated chunk by chunk.',
        inputSchema: {
            text: z.string().min(1).describe('Text to translate'),
            source_language: z.enum(TRANSLATOR_LANGUAGES).describe('Language of the input text'),
            target_language: z.enum(TRANSLATOR_LANGUAGES).describe('Language to translate into'),
        },
    },
    async ({ text, source_language, target_language }) => {
        const { translated, chunk_count } = await translate(text, source_language, target_language)
        const note = chunk_count > 1 ? `\n\n(translated in ${chunk_count} chunks)` : ''
        return { content: [{ type: 'text', text: translated + note }] }
    },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('zoom-ai-mcp server running on stdio')
