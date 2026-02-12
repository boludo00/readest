import { NextResponse } from 'next/server';
import { embed, embedMany, createGateway } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { validateUserAndToken } from '@/utils/access';

export async function POST(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization');
    const { texts, single, apiKey, provider, model: embedModel } = await req.json();

    // Allow requests with client-provided API key (Tauri sends keys directly)
    // or with valid auth token
    let hasAuth = !!apiKey;
    if (!hasAuth) {
      const { user, token } = await validateUserAndToken(authHeader);
      hasAuth = !!(user && token);
    }

    if (!hasAuth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
    }

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: 'Texts array required' }, { status: 400 });
    }

    const gatewayApiKey = apiKey || process.env['AI_GATEWAY_API_KEY'];
    if (!gatewayApiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    let embeddingModel;
    if (provider === 'openai') {
      const openai = createOpenAI({ apiKey: gatewayApiKey });
      embeddingModel = openai.embeddingModel(embedModel || 'text-embedding-3-small');
    } else {
      // Default: AI Gateway
      const gateway = createGateway({ apiKey: gatewayApiKey });
      embeddingModel = gateway.embeddingModel(
        process.env['AI_GATEWAY_EMBEDDING_MODEL'] || 'openai/text-embedding-3-small',
      );
    }

    if (single) {
      const { embedding } = await embed({ model: embeddingModel, value: texts[0] });
      return NextResponse.json({ embedding });
    } else {
      const { embeddings } = await embedMany({ model: embeddingModel, values: texts });
      return NextResponse.json({ embeddings });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Embedding failed: ${errorMessage}` }, { status: 500 });
  }
}
