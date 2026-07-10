# zoom-ai-mcp

Zoom AI Services の3つの API(Scribe / Translator / Summarizer)を MCP ツールとして公開するサーバーです。

Claude Code などの MCP クライアントに接続すると、エージェントに音声ファイルを渡して「何が録音されてるか教えて。英訳も欲しい」のように頼めるようになります。文字起こし → 翻訳のような API の呼び分けはエージェントが自分で判断するので、処理ごとのパイプラインを書く必要はありません。

## ツール

| ツール | 使用API | できること |
|---|---|---|
| `transcribe_audio` | Scribe | 音声/動画の文字起こし(wav / mp3 / m4a / mp4、ローカルパスまたはURL) |
| `summarize_transcript` | Summarizer | 会話テキストの要約(recap / action_items / summary / full_summary) |
| `translate_text` | Translator | 9言語間のテキスト翻訳。4,000字を超える入力は文境界で自動分割 |

## 必要なもの

- Node.js 18 以上
- [Zoom Build Platform](https://build.zoom.us/) の API Key / Secret

## セットアップ

```bash
git clone https://github.com/rai03k/zoom-ai-mcp.git
cd zoom-ai-mcp
npm install
npm run build
```

Claude Code に登録:

```bash
claude mcp add zoom-ai \
  -e ZOOM_API_KEY=your_api_key \
  -e ZOOM_API_SECRET=your_api_secret \
  -- node /path/to/zoom-ai-mcp/dist/index.js
```

Claude Desktop の場合は `claude_desktop_config.json` に以下を追加:

```json
{
  "mcpServers": {
    "zoom-ai": {
      "command": "node",
      "args": ["/path/to/zoom-ai-mcp/dist/index.js"],
      "env": {
        "ZOOM_API_KEY": "your_api_key",
        "ZOOM_API_SECRET": "your_api_secret"
      }
    }
  }
}
```

## 使い方

エージェントに普通に話しかけるだけです。

> meeting.mp3 で何が決まったか教えて。決定事項は英語でもまとめて。

`transcribe_audio` → `summarize_transcript` → `translate_text` が必要な順で自動的に呼ばれます。

## 実装メモ

- 認証は API Key / Secret から HS256 の JWT を生成して Bearer 送信(`src/zoom.ts`)。外部の JWT ライブラリは使っていません
- Translator API の入力4,000字制限は、段落・文境界で分割してから順に翻訳することで吸収しています
- 動作確認用の音声は [zoom/ai-services-quickstart](https://github.com/zoom/ai-services-quickstart) の `sample_data/` にあるサンプルが使えます(ライセンスの関係で本リポジトリには同梱していません)

## License

MIT
