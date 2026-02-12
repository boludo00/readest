import { validateUserAndToken } from '@/utils/access';
import { streamText, generateText, createGateway } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel, ModelMessage } from 'ai';

function resolveLanguageModel(body: {
  provider?: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): LanguageModel {
  const { provider, apiKey, model, baseUrl } = body;

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(model || 'gpt-4.1-nano');
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model || 'claude-sonnet-4-5-20250929');
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model || 'gemini-2.5-flash');
    }
    case 'openai-compatible': {
      const compat = createOpenAI({ apiKey, baseURL: baseUrl });
      return compat(model || '');
    }
    default: {
      // ai-gateway (existing behavior)
      const gateway = createGateway({ apiKey });
      return gateway(model || 'google/gemini-2.5-flash-lite');
    }
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization');
    const body = await req.json();
    const { messages, system, apiKey, model, stream, provider, baseUrl } = body;

    // Allow requests with client-provided API key (Tauri sends keys directly)
    // or with valid auth token
    let hasAuth = !!apiKey;
    if (!hasAuth) {
      const { user, token } = await validateUserAndToken(authHeader);
      hasAuth = !!(user && token);
    }

    if (!hasAuth) {
      return Response.json({ error: 'Not authenticated' }, { status: 403 });
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const gatewayApiKey = apiKey || process.env['AI_GATEWAY_API_KEY'];
    if (!gatewayApiKey) {
      return new Response(JSON.stringify({ error: 'API key required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const languageModel = resolveLanguageModel({
      provider,
      apiKey: gatewayApiKey,
      model,
      baseUrl,
    });

    // Non-streaming mode for entity extraction and other batch operations
    if (stream === false) {
      const result = await generateText({
        model: languageModel,
        system: system || 'You are a helpful assistant.',
        messages: messages as ModelMessage[],
        abortSignal: AbortSignal.timeout(120_000),
      });

      return new Response(JSON.stringify({ text: result.text }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = streamText({
      model: languageModel,
      system: system || 'You are a helpful assistant.',
      messages: messages as ModelMessage[],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: `Chat failed: ${errorMessage}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
