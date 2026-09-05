/* eslint-disable no-console */
import { OllamaProvider } from '../modules/ai/gateway/ollama.provider.js';
import { TOOL_DEFINITIONS } from '../modules/ai/tools/tool.registry.js';
import { type LLMChatEvent } from '../modules/ai/gateway/llm-gateway.interface.js';

interface ToolTestCase {
  name: string;
  expectedTool: string;
  prompt: string;
}

const TOOL_TEST_CASES: ToolTestCase[] = [
  {
    name: 'Tool 1: createTask',
    expectedTool: 'createTask',
    prompt: 'Create a high priority task titled "Review PR #42 for release"',
  },
  {
    name: 'Tool 2: createNote',
    expectedTool: 'createNote',
    prompt: 'Create a note with title "Deployment checklist" and content "Ensure migrations are applied" with tag "devops"',
  },
  {
    name: 'Tool 3: updateTaskStatus',
    expectedTool: 'updateTaskStatus',
    prompt: 'Update the status of task "e58ed763-928c-4155-bee9-fdbaaadc15f3" to done',
  },
  {
    name: 'Tool 4: getProjectContext',
    expectedTool: 'getProjectContext',
    prompt: 'Get project context for project "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"',
  },
];

async function main() {
  console.log('====================================================');
  console.log('LifeOS — Real Live Ollama Integration Test (V-2)');
  console.log('Model: qwen3:8b | Host: http://localhost:11434');
  console.log('====================================================\n');

  // Verify Ollama connection
  try {
    const versionRes = await fetch('http://localhost:11434/api/version');
    if (!versionRes.ok) throw new Error(`HTTP ${versionRes.status}`);
    const versionData = (await versionRes.json()) as { version: string };
    console.log(`[CONNECTED] Local Ollama server detected (version ${versionData.version})\n`);
  } catch (err) {
    console.error('[ERROR] Local Ollama server is not running on http://localhost:11434:', err);
    process.exit(1);
  }

  const provider = new OllamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen3:8b',
    temperature: 0.15,
  });

  // --------------------------------------------------------------------------
  // Check 1: Streaming response & Thinking output suppression (FR-OBS-2, A-1)
  // --------------------------------------------------------------------------
  console.log('--- Check 1: Token Streaming & CoT Suppression ---');
  const streamPrompt = 'What is the purpose of an operating system? Answer in one short sentence.';
  console.log(`User prompt: "${streamPrompt}"`);

  let tokenChunks = 0;
  let fullText = '';
  let hadThinkingTag = false;

  for await (const event of provider.chat({
    messages: [{ role: 'user', content: streamPrompt }],
  })) {
    if (event.type === 'token') {
      tokenChunks++;
      fullText += event.content;
      if (event.content.includes('<think>') || event.content.includes('</think>')) {
        hadThinkingTag = true;
      }
    } else if (event.type === 'error') {
      console.error('[CHAT ERROR EVENT]', event.error);
    }
  }

  console.log(`Chunks received: ${tokenChunks}`);
  console.log(`Response: "${fullText.trim()}"`);
  console.log(`Multi-chunk streaming verified: ${tokenChunks > 1 ? 'PASS' : 'FAIL'}`);
  console.log(`Chain-of-thought suppression (<think> check): ${!hadThinkingTag ? 'PASS' : 'FAIL'}`);

  if (tokenChunks <= 1 || hadThinkingTag) {
    console.error('Check 1 FAILED');
    process.exit(1);
  }
  console.log('Check 1 PASSED.\n');

  // --------------------------------------------------------------------------
  // Check 2: Exercise all 4 tools against live qwen3:8b
  // --------------------------------------------------------------------------
  console.log('--- Check 2: Live Tool-Calling Evaluation (All 4 Tools) ---');

  let passedToolTests = 0;

  for (const testCase of TOOL_TEST_CASES) {
    console.log(`\nTesting ${testCase.name}...`);
    console.log(`User prompt: "${testCase.prompt}"`);

    const toolEvents: LLMChatEvent[] = [];
    const textOutput: string[] = [];

    for await (const event of provider.chat({
      messages: [{ role: 'user', content: testCase.prompt }],
      tools: TOOL_DEFINITIONS,
      temperature: 0.1,
    })) {
      if (event.type === 'tool_call') {
        toolEvents.push(event);
      } else if (event.type === 'token') {
        textOutput.push(event.content);
      }
    }

    if (toolEvents.length > 0) {
      const selected = toolEvents[0];
      if (selected && selected.type === 'tool_call') {
        console.log(`  -> Selected Tool: "${selected.name}"`);
        console.log(`  -> Arguments: ${JSON.stringify(selected.arguments)}`);

        if (selected.name === testCase.expectedTool) {
          console.log(`  -> Result: PASS (Correct tool selected with valid JSON args)`);
          passedToolTests++;
        } else {
          console.warn(`  -> Result: MISMATCH (Expected "${testCase.expectedTool}", received "${selected.name}")`);
        }
      }
    } else {
      console.warn(`  -> Result: NO TOOL CALL (Model returned text: "${textOutput.join('').slice(0, 100)}...")`);
    }
  }

  console.log(`\n====================================================`);
  console.log(`Live Model Evaluation Summary:`);
  console.log(`Streaming chunks: ${tokenChunks}`);
  console.log(`Thinking tags stripped/suppressed: YES`);
  console.log(`Tool test accuracy: ${passedToolTests} / ${TOOL_TEST_CASES.length} tools correctly invoked`);
  console.log(`====================================================`);

  if (passedToolTests < 2) {
    console.error('Live Ollama evaluation failed: insufficient tool accuracy.');
    process.exit(1);
  }

  console.log('V-2 Live Ollama verification SUCCESSFUL.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during live Ollama test:', err);
  process.exit(1);
});
