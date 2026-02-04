// Lovable AI Gateway Client Utility
// Routes AI calls through Lovable's managed gateway at ai.gateway.lovable.dev

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
export const GEMINI_MODEL = 'google/gemini-3-flash-preview'; // Primary model

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiTool {
  functionDeclarations: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  }[];
}

export interface GeminiResponse {
  content: string;
  stopReason: string;
  toolUse?: {
    name: string;
    input: Record<string, unknown>;
  };
}

export interface GeminiCallOptions {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string | GeminiContentBlock[] }[];
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
}

export interface GeminiContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * Convert Gemini-style tool to OpenAI format for Lovable AI Gateway
 */
function convertToolToOpenAI(tool: any): any {
  if (tool.type === 'function' && tool.function) {
    // Already in OpenAI format
    return tool;
  }
  
  if (tool.functionDeclarations) {
    // Gemini format - convert to OpenAI format
    return tool.functionDeclarations.map((fn: any) => ({
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description,
        parameters: {
          type: fn.parameters?.type?.toLowerCase() || 'object',
          properties: convertPropertiesFromGemini(fn.parameters?.properties || {}),
          required: fn.parameters?.required || [],
        },
      },
    }));
  }
  
  if (tool.name && tool.input_schema) {
    // Claude format - convert to OpenAI format
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      },
    };
  }
  
  return tool;
}

/**
 * Convert property types from Gemini format (uppercase) to OpenAI format (lowercase)
 */
function convertPropertiesFromGemini(properties: Record<string, unknown>): Record<string, unknown> {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'object' && value !== null) {
      const prop = value as Record<string, unknown>;
      converted[key] = {
        ...prop,
        type: typeof prop.type === 'string' ? prop.type.toLowerCase() : prop.type,
      };
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

/**
 * Convert tool choice to OpenAI format
 */
function convertToolChoice(toolChoice: any): any {
  if (!toolChoice) return undefined;
  
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  if (toolChoice.type === 'any') {
    return 'required';
  }
  if (toolChoice.type === 'auto') {
    return 'auto';
  }
  
  return toolChoice;
}

/**
 * Convert messages to OpenAI format, handling multimodal content
 */
function convertMessagesToOpenAI(messages: GeminiCallOptions['messages']): any[] {
  return messages.map(msg => {
    if (Array.isArray(msg.content)) {
      // Multimodal content
      const parts: any[] = [];
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ type: 'text', text: block.text });
        } else if (block.type === 'image' && block.source) {
          // Convert to data URL format for OpenAI-compatible API
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        }
      }
      return { role: msg.role, content: parts };
    }
    
    return { role: msg.role, content: msg.content as string };
  });
}

/**
 * Call Lovable AI Gateway with standard (non-streaming) response
 */
export async function callGemini(options: GeminiCallOptions): Promise<GeminiResponse> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const model = options.model || GEMINI_MODEL;

  // Build messages array with system prompt
  const messages: any[] = [
    { role: 'system', content: options.system },
    ...convertMessagesToOpenAI(options.messages),
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.3,
  };

  // Add tools if provided
  if (options.tools && options.tools.length > 0) {
    const openaiTools: any[] = [];
    for (const tool of options.tools) {
      const converted = convertToolToOpenAI(tool);
      if (Array.isArray(converted)) {
        openaiTools.push(...converted);
      } else {
        openaiTools.push(converted);
      }
    }
    
    if (openaiTools.length > 0) {
      body.tools = openaiTools;
      
      if (options.toolChoice) {
        body.tool_choice = convertToolChoice(options.toolChoice);
      }
    }
  }

  console.log('[LOVABLE-AI] Calling gateway with model:', model);

  const response = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LOVABLE-AI] Gateway error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limits exceeded, please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Payment required, please add funds to your Lovable AI workspace.');
    }
    if (response.status === 503) {
      throw new Error('AI service is currently overloaded. Please try again in a moment.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid API key. Please check your LOVABLE_API_KEY.');
    }
    
    throw new Error(`Lovable AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[LOVABLE-AI] Response received');

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error('No response from Lovable AI Gateway');
  }

  const finishReason = choice.finish_reason || 'unknown';

  // Handle function call response
  const toolCall = choice.message?.tool_calls?.[0];
  if (toolCall?.function) {
    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      args = {};
    }
    return {
      content: '',
      stopReason: finishReason,
      toolUse: {
        name: toolCall.function.name,
        input: args,
      },
    };
  }

  // Handle text response
  return {
    content: choice.message?.content || '',
    stopReason: finishReason,
  };
}

/**
 * Call Lovable AI Gateway with streaming response
 * Returns a ReadableStream that yields text chunks in OpenAI SSE format
 */
export async function callGeminiStreaming(options: GeminiCallOptions): Promise<ReadableStream<Uint8Array>> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const model = options.model || GEMINI_MODEL;

  const messages: any[] = [
    { role: 'system', content: options.system },
    ...convertMessagesToOpenAI(options.messages),
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.3,
    stream: true,
  };

  console.log('[LOVABLE-AI] Starting streaming call with model:', model);

  const response = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LOVABLE-AI] Streaming error:', response.status, errorText);
    throw new Error(`Lovable AI Gateway error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body from Lovable AI Gateway');
  }

  return response.body;
}

/**
 * Parse streaming response and extract text content
 * Converts OpenAI SSE format to simple text chunks
 */
export function parseGeminiStreamToText(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              
              try {
                const event = JSON.parse(jsonStr);
                // OpenAI streaming format
                const text = event.choices?.[0]?.delta?.content;
                if (text) {
                  controller.enqueue(encoder.encode(text));
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

// Legacy exports for backward compatibility
export { 
  callGemini as callClaude, 
  callGeminiStreaming as callClaudeStreaming,
  parseGeminiStreamToText as parseClaudeStreamToText,
  GEMINI_MODEL as CLAUDE_MODEL,
  GEMINI_MODEL as CLAUDE_MODEL_FAST,
};

// Legacy conversion functions (kept for any edge cases)
export function convertClaudeToolToGemini(claudeTool: {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}): { functionDeclarations: { name: string; description: string; parameters: any }[] } {
  return {
    functionDeclarations: [{
      name: claudeTool.name,
      description: claudeTool.description,
      parameters: {
        type: claudeTool.input_schema.type.toUpperCase(),
        properties: claudeTool.input_schema.properties,
        required: claudeTool.input_schema.required || [],
      },
    }],
  };
}

export function convertOpenAIToolToGemini(openAITool: {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}): { functionDeclarations: { name: string; description: string; parameters: any }[] } {
  const params = openAITool.function.parameters as { type?: string; properties?: Record<string, unknown>; required?: string[] };
  return {
    functionDeclarations: [{
      name: openAITool.function.name,
      description: openAITool.function.description || '',
      parameters: {
        type: (params.type || 'object').toUpperCase(),
        properties: params.properties || {},
        required: params.required || [],
      },
    }],
  };
}

export { convertOpenAIToolToGemini as convertOpenAIToolToClaude };

export type ClaudeMessage = { role: 'user' | 'assistant'; content: string | GeminiContentBlock[] };
export type ClaudeContentBlock = GeminiContentBlock;
export type ClaudeTool = { name: string; description: string; input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
export type ClaudeToolChoice = { type: 'auto' | 'any' | 'tool'; name?: string };
export type ClaudeResponse = GeminiResponse;
export type ClaudeCallOptions = GeminiCallOptions;
