import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { ProductionPlan, GeneratedAsset, ToolManifest } from '../../types';

// ── Shared fixtures ─────────────────────────────────────────────

const MOCK_PLAN: ProductionPlan = {
  primarySource: { type: 'none' },
  shots: [
    {
      id: 'shot-1',
      startTime: 0,
      endTime: 5,
      scriptSegment: 'Hello world.',
      visual: { type: 'b-roll', searchQuery: 'city', toolId: 'pexels' },
      transition: { type: 'crossfade', durationMs: 300 },
      reason: 'test',
    },
  ],
  effects: [],
  zoomSegments: [],
  lowerThirds: [],
  counters: [],
  highlights: [],
  ctaSegments: [],
  layout: 'fullscreen',
  reasoning: 'test plan',
};

const MOCK_ASSETS: GeneratedAsset[] = [
  {
    toolId: 'pexels',
    shotId: 'shot-1',
    url: 'https://storage.example.com/asset.mp4',
    type: 'stock-video',
    durationSeconds: 5,
  },
];

const MOCK_MANIFEST: ToolManifest = {
  tools: [{ id: 'pexels', name: 'Pexels', available: true, capabilities: [] }],
  summary: '1 tool available',
};

const MOCK_TTS_RESULT = {
  voiceoverPath: '/tmp/voiceover.mp3',
  audioDuration: 10,
  transcriptionWords: [
    { text: 'Hello', startTime: 0, endTime: 0.5 },
    { text: 'world.', startTime: 0.5, endTime: 1.0 },
  ],
  cues: [
    {
      id: 'cue-1',
      text: 'Hello world.',
      startTime: 0,
      endTime: 1.0,
      words: [
        { text: 'Hello', startTime: 0, endTime: 0.5 },
        { text: 'world.', startTime: 0.5, endTime: 1.0 },
      ],
    },
  ],
  steps: [{ name: 'TTS', durationMs: 100, detail: 'edge-tts' }],
};

const MOCK_ASSEMBLED_PROPS = {
  layout: 'fullscreen',
  bRollSegments: [],
  effects: [],
  pipSegments: [],
  lowerThirds: [],
  counters: [],
  highlights: [],
  ctaSegments: [],
  captions: [],
};

const MOCK_MONTAGE_PROFILE = {
  id: 'default',
  name: 'Default',
  description: 'Default profile',
  topicKeywords: [],
  shotDuration: { min: 2, max: 5 },
  pacing: 'medium' as const,
  transitionTypes: ['crossfade'],
  effectDensity: 0.5,
  shotVariety: 'medium' as const,
  allowedVisualTypes: ['b-roll' as const],
  supervisorChecks: [],
};

// ── Mocks (before imports) ──────────────────────────────────────

// Use spyOn instead of vi.mock('fs') to avoid poisoning fs for other tests.
// vi.mock('fs') replaces the module globally in bun's single-process runner,
// breaking vi.spyOn(fs, ...) in asset-generator and captions tests.
import fs from 'fs';
const mockRmSync = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
afterAll(() => {
  mockRmSync.mockRestore();
});

vi.mock('@reelstack/remotion/pipeline', () => ({
  normalizeAudioForWhisper: vi.fn(() => Buffer.from('wav')),
  getAudioDuration: vi.fn(() => 10),
  transcribeAudio: vi.fn(async () => ({
    words: [
      { text: 'Hello', startTime: 0, endTime: 0.5 },
      { text: 'world.', startTime: 0.5, endTime: 1.0 },
    ],
  })),
}));

vi.mock('@reelstack/transcription', () => ({
  groupWordsIntoCues: vi.fn(() => [
    {
      id: 'cue-1',
      text: 'Hello world.',
      startTime: 0,
      endTime: 1.0,
      words: [
        { text: 'Hello', startTime: 0, endTime: 0.5 },
        { text: 'world.', startTime: 0.5, endTime: 1.0 },
      ],
    },
  ]),
  alignWordsWithScript: vi.fn((words: unknown[]) => words),
}));

import { loggerMockFactory } from '../../__test-utils__/logger-mock';
vi.mock('@reelstack/logger', loggerMockFactory);

// ToolRegistry mock — must be a real class (used with `new`)
const mockRegistryInstance = {
  register: vi.fn(),
  discover: vi.fn(async () => {}),
  getToolManifest: vi.fn(() => MOCK_MANIFEST),
};

vi.mock('../../registry/tool-registry', () => {
  return {
    ToolRegistry: class MockToolRegistry {
      register = mockRegistryInstance.register;
      discover = mockRegistryInstance.discover;
      getToolManifest = mockRegistryInstance.getToolManifest;
    },
  };
});

vi.mock('../../registry/discovery', () => ({
  discoverTools: vi.fn(() => []),
}));

const mockPlanProduction = vi.fn(async () => structuredClone(MOCK_PLAN));
const mockPlanComposition = vi.fn(async () => structuredClone(MOCK_PLAN));

vi.mock('../../planner/production-planner', () => ({
  planProduction: (...args: unknown[]) => mockPlanProduction(...args),
  planComposition: (...args: unknown[]) => mockPlanComposition(...args),
  isPublicUrl: vi.fn(() => true),
}));

const mockGenerateAssets = vi.fn(async () => [...MOCK_ASSETS]);

vi.mock('../asset-generator', () => ({
  generateAssets: (...args: unknown[]) => mockGenerateAssets(...args),
}));

const mockAssembleComposition = vi.fn(() => ({ ...MOCK_ASSEMBLED_PROPS }));

vi.mock('../composition-assembler', () => ({
  assembleComposition: (...args: unknown[]) => mockAssembleComposition(...args),
}));

const mockValidatePlan = vi.fn(() => ({
  valid: true,
  issues: [],
  fixedPlan: structuredClone(MOCK_PLAN),
}));

vi.mock('../../planner/plan-validator', () => ({
  validatePlan: (...args: unknown[]) => mockValidatePlan(...args),
}));

const mockSupervisePlan = vi.fn(async () => ({
  plan: structuredClone(MOCK_PLAN),
  approved: true,
  iterations: 1,
  reviews: [{ iteration: 1, verdict: 'approved', score: 9, notes: 'Looks good' }],
}));

vi.mock('../../planner/plan-supervisor', () => ({
  supervisePlan: (...args: unknown[]) => mockSupervisePlan(...args),
}));

const mockRunTTSPipeline = vi.fn(async () => ({ ...MOCK_TTS_RESULT }));
const mockBuildTimingReference = vi.fn(() => '[0.0s-1.0s] Hello world.');
const mockResolvePresetConfig = vi.fn(() => ({
  animationStyle: 'word-highlight',
  maxWordsPerCue: 4,
  maxDurationPerCue: 2,
}));
const mockUploadVoiceover = vi.fn(async () => 'https://storage.example.com/voiceover.mp3');
const mockRenderVideo = vi.fn(async () => ({
  outputPath: '/tmp/output.mp4',
  step: { name: 'Render', durationMs: 500, detail: '1024 bytes' },
}));

vi.mock('../base-orchestrator', () => ({
  buildTimingReference: (...args: unknown[]) => mockBuildTimingReference(...args),
  resolvePresetConfig: (...args: unknown[]) => mockResolvePresetConfig(...args),
  runTTSPipeline: (...args: unknown[]) => mockRunTTSPipeline(...args),
  uploadVoiceover: (...args: unknown[]) => mockUploadVoiceover(...args),
  renderVideo: (...args: unknown[]) => mockRenderVideo(...args),
}));

vi.mock('../../planner/montage-profile', () => ({
  selectMontageProfile: vi.fn(() => MOCK_MONTAGE_PROFILE),
}));

vi.mock('../../planner/script-reviewer', () => ({
  reviewScript: vi.fn(async () => ({ approved: true, issues: [], suggestions: [] })),
  isScriptReviewEnabled: vi.fn(() => false),
}));

vi.mock('../../planner/prompt-writer', () => ({
  writePrompt: vi.fn(async () => 'expanded prompt'),
  isPromptWriterEnabled: vi.fn(() => false),
}));

const mockPersistAssetsToStorage = vi.fn(async (assets: GeneratedAsset[]) => [...assets]);

vi.mock('../asset-persistence', () => ({
  persistAssetsToStorage: (...args: unknown[]) => mockPersistAssetsToStorage(...args),
}));

vi.mock('../pipeline-logger', () => {
  return {
    PipelineLogger: class MockPipelineLogger {
      logStep = vi.fn();
      saveArtifact = vi.fn();
      persist = vi.fn(async () => {});
      getSummary = vi.fn(() => ({
        stepCount: 3,
        totalDurationMs: 1000,
        toolsUsed: ['pexels'],
        steps: [],
      }));
    },
  };
});

vi.mock('../../context', () => ({
  runWithJobId: vi.fn((_id: string, fn: () => unknown) => fn()),
  setApiCallLogger: vi.fn(),
}));

// ── Import under test (AFTER all mocks) ─────────────────────────

import { produce, produceComposition } from '../production-orchestrator';

// ── Tests ───────────────────────────────────────────────────────

describe('produce()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanProduction.mockResolvedValue(structuredClone(MOCK_PLAN));
    mockGenerateAssets.mockResolvedValue([...MOCK_ASSETS]);
    mockRunTTSPipeline.mockResolvedValue({ ...MOCK_TTS_RESULT });
    mockRenderVideo.mockResolvedValue({
      outputPath: '/tmp/output.mp4',
      step: { name: 'Render', durationMs: 500, detail: '1024 bytes' },
    });
    mockSupervisePlan.mockResolvedValue({
      plan: structuredClone(MOCK_PLAN),
      approved: true,
      iterations: 1,
      reviews: [{ iteration: 1, verdict: 'approved', score: 9, notes: 'ok' }],
    });
    mockValidatePlan.mockReturnValue({
      valid: true,
      issues: [],
      fixedPlan: structuredClone(MOCK_PLAN),
    });
    mockAssembleComposition.mockReturnValue({ ...MOCK_ASSEMBLED_PROPS });
    mockPersistAssetsToStorage.mockResolvedValue([...MOCK_ASSETS]);
  });

  // ── Input validation ────────────────────────────────────────

  it('rejects empty script', async () => {
    await expect(produce({ script: '' })).rejects.toThrow(
      'Script must be between 1 and 50000 characters'
    );
  });

  it('rejects script exceeding max length', async () => {
    const longScript = 'x'.repeat(50_001);
    await expect(produce({ script: longScript })).rejects.toThrow(
      'Script must be between 1 and 50000 characters'
    );
  });

  // ── Happy path ──────────────────────────────────────────────

  it('returns outputPath and durationSeconds on success', async () => {
    const result = await produce({ script: 'Hello world.' });

    expect(result.outputPath).toBe('/tmp/output.mp4');
    expect(result.durationSeconds).toBe(10);
    expect(result.plan).toBeDefined();
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.generatedAssets).toHaveLength(1);
  });

  it('calls TTS pipeline with script and tmpDir', async () => {
    await produce({ script: 'Test script' });

    expect(mockRunTTSPipeline).toHaveBeenCalledTimes(1);
    const [ttsInput, tmpDir] = mockRunTTSPipeline.mock.calls[0];
    expect(ttsInput).toEqual(expect.objectContaining({ script: 'Test script' }));
    expect(tmpDir).toEqual(expect.any(String));
  });

  it('passes tool manifest to planner', async () => {
    await produce({ script: 'Test script' });

    expect(mockPlanProduction).toHaveBeenCalledTimes(1);
    expect(mockPlanProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        script: 'Test script',
        toolManifest: MOCK_MANIFEST,
      })
    );
  });

  it('passes timing reference from TTS words to planner', async () => {
    await produce({ script: 'Test script' });

    expect(mockBuildTimingReference).toHaveBeenCalledWith(MOCK_TTS_RESULT.transcriptionWords);
    expect(mockPlanProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        timingReference: '[0.0s-1.0s] Hello world.',
      })
    );
  });

  it('calls asset generator with plan and registry', async () => {
    await produce({ script: 'Test script' });

    expect(mockGenerateAssets).toHaveBeenCalledTimes(1);
    const [plan, registry] = mockGenerateAssets.mock.calls[0];
    expect(plan).toEqual(expect.objectContaining({ layout: 'fullscreen' }));
    expect(registry).toBeDefined();
  });

  it('persists assets to storage after generation', async () => {
    await produce({ script: 'Test script' });

    expect(mockPersistAssetsToStorage).toHaveBeenCalledTimes(1);
    expect(mockPersistAssetsToStorage).toHaveBeenCalledWith(
      MOCK_ASSETS,
      undefined, // jobId
      expect.anything() // logger
    );
  });

  it('calls assembler with plan, assets, cues, and voiceover URL', async () => {
    await produce({ script: 'Test script' });

    expect(mockAssembleComposition).toHaveBeenCalledTimes(1);
    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        cues: MOCK_TTS_RESULT.cues,
        voiceoverFilename: 'https://storage.example.com/voiceover.mp3',
      })
    );
  });

  it('calls renderVideo with assembled props', async () => {
    await produce({ script: 'Test script' });

    expect(mockRenderVideo).toHaveBeenCalledTimes(1);
    const [props, outputPath] = mockRenderVideo.mock.calls[0];
    expect(props).toEqual(expect.objectContaining({ layout: 'fullscreen' }));
    expect(outputPath).toBeUndefined();
  });

  // ── Pipeline step ordering ──────────────────────────────────

  it('calls pipeline steps in correct order: TTS -> plan -> supervisor -> assets -> persist -> validate -> assemble -> render', async () => {
    const callOrder: string[] = [];

    mockRunTTSPipeline.mockImplementation(async () => {
      callOrder.push('tts');
      return { ...MOCK_TTS_RESULT };
    });
    mockPlanProduction.mockImplementation(async () => {
      callOrder.push('plan');
      return structuredClone(MOCK_PLAN);
    });
    mockSupervisePlan.mockImplementation(async () => {
      callOrder.push('supervisor');
      return {
        plan: structuredClone(MOCK_PLAN),
        approved: true,
        iterations: 1,
        reviews: [],
      };
    });
    mockGenerateAssets.mockImplementation(async () => {
      callOrder.push('assets');
      return [...MOCK_ASSETS];
    });
    mockPersistAssetsToStorage.mockImplementation(async () => {
      callOrder.push('persist');
      return [...MOCK_ASSETS];
    });
    mockValidatePlan.mockImplementation(() => {
      callOrder.push('validate');
      return { valid: true, issues: [], fixedPlan: structuredClone(MOCK_PLAN) };
    });
    mockAssembleComposition.mockImplementation(() => {
      callOrder.push('assemble');
      return { ...MOCK_ASSEMBLED_PROPS };
    });
    mockRenderVideo.mockImplementation(async () => {
      callOrder.push('render');
      return {
        outputPath: '/tmp/output.mp4',
        step: { name: 'Render', durationMs: 500, detail: '1024' },
      };
    });

    await produce({ script: 'Test ordering' });

    expect(callOrder.indexOf('tts')).toBeLessThan(callOrder.indexOf('plan'));
    expect(callOrder.indexOf('plan')).toBeLessThan(callOrder.indexOf('supervisor'));
    expect(callOrder.indexOf('supervisor')).toBeLessThan(callOrder.indexOf('assets'));
    expect(callOrder.indexOf('assets')).toBeLessThan(callOrder.indexOf('persist'));
    expect(callOrder.indexOf('persist')).toBeLessThan(callOrder.indexOf('validate'));
    expect(callOrder.indexOf('validate')).toBeLessThan(callOrder.indexOf('assemble'));
    expect(callOrder.indexOf('assemble')).toBeLessThan(callOrder.indexOf('render'));
  });

  // ── Error handling ──────────────────────────────────────────

  it('propagates TTS pipeline errors', async () => {
    mockRunTTSPipeline.mockRejectedValue(new Error('TTS provider unreachable'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('TTS provider unreachable');
  });

  it('propagates planner errors', async () => {
    mockPlanProduction.mockRejectedValue(new Error('LLM timeout'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('LLM timeout');
  });

  it('propagates asset generation errors', async () => {
    mockGenerateAssets.mockRejectedValue(new Error('Pexels API down'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('Pexels API down');
  });

  it('propagates render errors', async () => {
    mockRenderVideo.mockRejectedValue(new Error('Render failed'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('Render failed');
  });

  it('propagates supervisor errors', async () => {
    mockSupervisePlan.mockRejectedValue(new Error('Supervisor LLM failed'));

    await expect(produce({ script: 'Test' })).rejects.toThrow('Supervisor LLM failed');
  });

  // ── Progress callbacks ──────────────────────────────────────

  it('calls onProgress with pipeline stage messages', async () => {
    const progress: string[] = [];
    await produce({
      script: 'Test',
      onProgress: (msg) => progress.push(msg),
    });

    expect(progress).toContain('Discovering tools and generating voiceover...');
    expect(progress).toContain('Planning production (with exact speech timing)...');
    expect(progress).toContain('Generating visual assets...');
    expect(progress).toContain('Assembling composition...');
    expect(progress.some((p) => p.startsWith('Done!'))).toBe(true);
  });

  // ── Plan validation auto-fix ────────────────────────────────

  it('uses fixedPlan from validator when issues are found', async () => {
    const fixedPlan = {
      ...MOCK_PLAN,
      reasoning: 'fixed plan',
    };
    mockValidatePlan.mockReturnValue({
      valid: false,
      issues: [
        { severity: 'warning', type: 'overlap', message: 'Effects overlap', autoFixed: true },
      ],
      fixedPlan,
    });

    const result = await produce({ script: 'Test' });

    // The assembler should receive the fixed plan
    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ reasoning: 'fixed plan' }),
      })
    );
  });

  // ── Optional params ─────────────────────────────────────────

  it('passes style to planner (defaults to dynamic)', async () => {
    await produce({ script: 'Test' });
    expect(mockPlanProduction).toHaveBeenCalledWith(expect.objectContaining({ style: 'dynamic' }));
  });

  it('passes custom style to planner', async () => {
    await produce({ script: 'Test', style: 'cinematic' });
    expect(mockPlanProduction).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'cinematic' })
    );
  });

  it('passes layout to planner', async () => {
    await produce({ script: 'Test', layout: 'split-screen' });
    const plannerInput = mockPlanProduction.mock.calls[0][0] as Record<string, unknown>;
    expect(plannerInput.layout).toBe('split-screen');
  });

  it('passes outputPath to renderVideo', async () => {
    await produce({ script: 'Test', outputPath: '/custom/out.mp4' });
    const [, outputPath] = mockRenderVideo.mock.calls[0];
    expect(outputPath).toBe('/custom/out.mp4');
  });

  // ── Job context ─────────────────────────────────────────────

  it('wraps pipeline in runWithJobId when jobId is provided', async () => {
    const { runWithJobId } = await import('../../context');

    await produce({ script: 'Test', jobId: 'job-123' });

    expect(runWithJobId).toHaveBeenCalledWith('job-123', expect.any(Function));
  });

  it('includes pipelineLogSummary when jobId is provided', async () => {
    const result = await produce({ script: 'Test', jobId: 'job-456' });

    expect(result.pipelineLogSummary).toBeDefined();
    expect(result.pipelineLogSummary!.stepCount).toBe(3);
  });
});

// ── produceComposition() ────────────────────────────────────────

describe('produceComposition()', () => {
  const baseComposeRequest = {
    script: 'Hello world.',
    assets: [
      {
        id: 'asset-1',
        url: 'https://example.com/video.mp4',
        type: 'video' as const,
        description: 'Talking head',
        durationSeconds: 10,
        isPrimary: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanComposition.mockResolvedValue(structuredClone(MOCK_PLAN));
    mockRunTTSPipeline.mockResolvedValue({ ...MOCK_TTS_RESULT });
    mockRenderVideo.mockResolvedValue({
      outputPath: '/tmp/output.mp4',
      step: { name: 'Render', durationMs: 500, detail: '1024 bytes' },
    });
    mockValidatePlan.mockReturnValue({
      valid: true,
      issues: [],
      fixedPlan: structuredClone(MOCK_PLAN),
    });
    mockAssembleComposition.mockReturnValue({ ...MOCK_ASSEMBLED_PROPS });
    mockPersistAssetsToStorage.mockResolvedValue([...MOCK_ASSETS]);
    mockUploadVoiceover.mockResolvedValue('https://storage.example.com/voiceover.mp3');
  });

  // ── Input validation ────────────────────────────────────────

  it('rejects empty script', async () => {
    await expect(produceComposition({ ...baseComposeRequest, script: '' })).rejects.toThrow(
      'Script must be between 1 and 50000 characters'
    );
  });

  it('rejects missing assets', async () => {
    await expect(produceComposition({ script: 'Test', assets: [] })).rejects.toThrow(
      'At least one asset is required'
    );
  });

  it('rejects more than 50 assets', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      id: `asset-${i}`,
      url: `https://example.com/${i}.mp4`,
      type: 'video' as const,
      description: `Asset ${i}`,
    }));
    await expect(produceComposition({ script: 'Test', assets: tooMany })).rejects.toThrow(
      'Maximum 50 assets allowed'
    );
  });

  // ── Happy path ──────────────────────────────────────────────

  it('returns outputPath and durationSeconds on success', async () => {
    const result = await produceComposition(baseComposeRequest);

    expect(result.outputPath).toBe('/tmp/output.mp4');
    expect(result.durationSeconds).toBe(10);
  });

  it('calls planComposition instead of planProduction', async () => {
    await produceComposition(baseComposeRequest);

    expect(mockPlanComposition).toHaveBeenCalledTimes(1);
    expect(mockPlanProduction).not.toHaveBeenCalled();
  });

  it('does NOT call generateAssets (user provides assets)', async () => {
    await produceComposition(baseComposeRequest);

    expect(mockGenerateAssets).not.toHaveBeenCalled();
  });

  it('calls planComposition with assets and directorNotes', async () => {
    await produceComposition({
      ...baseComposeRequest,
      directorNotes: 'Show screenshot when talking about analytics',
    });

    expect(mockPlanComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        assets: baseComposeRequest.assets,
        directorNotes: 'Show screenshot when talking about analytics',
      })
    );
  });

  // ── Existing voiceover + cues (skip TTS) ────────────────────

  it('skips TTS when existingVoiceoverPath and existingCues provided', async () => {
    const existingCues = [
      {
        id: 'cue-1',
        text: 'Hello',
        startTime: 0,
        endTime: 1.0,
        words: [{ text: 'Hello', startTime: 0, endTime: 1.0 }],
      },
    ];

    await produceComposition({
      ...baseComposeRequest,
      existingVoiceoverPath: '/tmp/existing.mp3',
      existingCues,
    });

    expect(mockRunTTSPipeline).not.toHaveBeenCalled();
  });

  it('computes audioDuration from max cue end time and max asset duration', async () => {
    const cues = [
      {
        id: 'c1',
        text: 'Hello',
        startTime: 0,
        endTime: 8.0,
        words: [{ text: 'Hello', startTime: 0, endTime: 8.0 }],
      },
    ];

    const result = await produceComposition({
      ...baseComposeRequest,
      existingVoiceoverPath: '/tmp/existing.mp3',
      existingCues: cues,
    });

    // max(cue end=8.0, asset duration=10) = 10
    expect(result.durationSeconds).toBe(10);
  });

  // ── Layout override ─────────────────────────────────────────

  it('overrides LLM layout with request layout when they differ', async () => {
    const planWithSplit = { ...MOCK_PLAN, layout: 'split-screen' as const };
    mockPlanComposition.mockResolvedValue(structuredClone(planWithSplit));

    await produceComposition({
      ...baseComposeRequest,
      layout: 'anchor-bottom',
    });

    // Assembler should receive the request's layout, not the LLM's
    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ layout: 'anchor-bottom' }),
      })
    );
  });

  // ── Error handling ──────────────────────────────────────────

  it('propagates render errors', async () => {
    mockRenderVideo.mockRejectedValue(new Error('Lambda timeout'));

    await expect(produceComposition(baseComposeRequest)).rejects.toThrow('Lambda timeout');
  });

  it('propagates planComposition errors', async () => {
    mockPlanComposition.mockRejectedValue(new Error('LLM API error'));

    await expect(produceComposition(baseComposeRequest)).rejects.toThrow('LLM API error');
  });

  // ── Progress callbacks ──────────────────────────────────────

  it('calls onProgress with composition stage messages', async () => {
    const progress: string[] = [];
    await produceComposition({
      ...baseComposeRequest,
      onProgress: (msg) => progress.push(msg),
    });

    expect(progress).toContain('LLM composing timeline (with exact speech timing)...');
    expect(progress).toContain('Assembling composition...');
    expect(progress.some((p) => p.startsWith('Done!'))).toBe(true);
  });

  // ── Primary video framing ──────────────────────────────────

  it('passes primaryVideoObjectPosition from asset metadata to assembler', async () => {
    const request = {
      ...baseComposeRequest,
      assets: [
        {
          id: 'cam',
          url: 'https://example.com/cam.mp4',
          type: 'video' as const,
          description: 'Talking head',
          durationSeconds: 10,
          isPrimary: true,
          metadata: { avatarFraming: 'bottom-aligned' },
        },
      ],
    };

    await produceComposition(request);

    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryVideoObjectPosition: 'center 85%',
      })
    );
  });

  it('defaults avatarFraming to center when not specified', async () => {
    await produceComposition(baseComposeRequest);

    expect(mockAssembleComposition).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryVideoObjectPosition: 'center',
      })
    );
  });

  // ── Job context ─────────────────────────────────────────────

  it('wraps pipeline in runWithJobId when jobId is provided', async () => {
    const { runWithJobId } = await import('../../context');

    await produceComposition({ ...baseComposeRequest, jobId: 'compose-job' });

    expect(runWithJobId).toHaveBeenCalledWith('compose-job', expect.any(Function));
  });
});
