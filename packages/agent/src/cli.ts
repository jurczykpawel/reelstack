#!/usr/bin/env bun
/**
 * ReelStack CLI — step-by-step pipeline testing.
 *
 * Usage:
 *   bun run rs tts "Tekst do mówienia"
 *   bun run rs plan <tts.json> [--template jump-cut-dynamic]
 *   bun run rs assemble <plan.json> <tts.json>
 *   bun run rs render <composition.json>
 *   bun run rs heygen "Tekst dla avatara" [--iv] [--emotion Friendly]
 *   bun run rs heygen-poll <job-id>
 *   bun run rs heygen-status
 *
 * All outputs go to /tmp/bun run rs/ (or --out <dir>).
 * Each command reads the previous step's output file.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const B = '\x1b[36m',
  G = '\x1b[32m',
  Y = '\x1b[33m',
  R = '\x1b[31m',
  D = '\x1b[2m',
  X = '\x1b[0m';

const args = process.argv.slice(2);
const command = args[0];
const outDir = args.includes('--out')
  ? args[args.indexOf('--out') + 1]
  : path.resolve(import.meta.dirname ?? __dirname, '../../..', 'out');

fs.mkdirSync(outDir, { recursive: true });

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}
function opt(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}
function positional(n: number): string | undefined {
  return args.filter((a) => !a.startsWith('--'))[n];
}
function save(name: string, data: unknown): string {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(`${D}→ ${file}${X}`);
  return file;
}
function elapsed(start: number): string {
  return `${((performance.now() - start) / 1000).toFixed(1)}s`;
}

// ── Commands ─────────────────────────────────────────────────

/** Strip reel-script timing markers, convert pause annotations to ellipsis for TTS/HeyGen. */
function cleanScriptFile(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !l.startsWith('[') || l.startsWith('[Pauza'))
    .map((l) => l.replace(/\[Pauza[\s\d.s]*\]/gi, '...').trim())
    .filter(Boolean)
    .join('\n');
}

async function tts() {
  let script = positional(1);
  if (!script) {
    console.log(
      `Usage: bun run rs tts "Tekst do mówienia" [--voice pl-PL-MarekNeural] [--lang pl-PL]\n       bun run rs tts --file skrypt.txt`
    );
    process.exit(1);
  }

  // --file flag: read script from file, strip timing markers
  const filePath = opt('file');
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`${R}File not found: ${filePath}${X}`);
      process.exit(1);
    }
    script = cleanScriptFile(fs.readFileSync(filePath, 'utf-8'));
  } else if (script && fs.existsSync(script)) {
    // Positional arg is a file path
    script = cleanScriptFile(fs.readFileSync(script, 'utf-8'));
  }

  const { runTTSPipeline } = await import('./index');
  const voice = opt('voice') ?? 'pl-PL-MarekNeural';
  const lang = opt('lang') ?? 'pl-PL';

  console.log(`${B}TTS + Whisper${X}`);
  console.log(`Script: "${script.substring(0, 80)}${script.length > 80 ? '...' : ''}"`);
  console.log(`Voice: ${voice}, Lang: ${lang}`);

  const t0 = performance.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-tts-'));
  const result = await runTTSPipeline(
    { script, tts: { provider: 'edge-tts', voice, language: lang } },
    tmpDir,
    (msg) => console.log(`  ${D}${msg}${X}`)
  );

  fs.copyFileSync(result.voiceoverPath, path.join(outDir, 'voiceover.mp3'));
  save('tts.json', {
    voiceoverPath: path.join(outDir, 'voiceover.mp3'),
    audioDuration: result.audioDuration,
    cues: result.cues,
    words: result.transcriptionWords,
  });

  console.log(
    `${G}Done${X} (${elapsed(t0)}): ${result.audioDuration.toFixed(1)}s audio, ${result.cues.length} cues`
  );
  console.log(`${D}Listen: open ${outDir}/voiceover.mp3${X}`);
  console.log(`${D}Next:   bun run rs plan ${outDir}/tts.json${X}`);
}

async function plan() {
  const ttsFile = positional(1);
  if (!ttsFile || !fs.existsSync(ttsFile)) {
    console.log(
      `Usage: bun run rs plan <tts.json> [--template jump-cut-dynamic]\n       bun run rs plan <tts.json> --director [--style dynamic]`
    );
    process.exit(1);
  }

  // Load private modules for premium templates
  try {
    // @ts-expect-error — private module, no type declarations
    await import('@reelstack/modules');
  } catch {
    try {
      await import('../../modules/src/index');
    } catch {
      /* no private modules */
    }
  }

  const { buildTemplatePlan } = await import('./content/template-montage');
  const templateId = opt('template') ?? 'jump-cut-dynamic';

  const ttsData = JSON.parse(fs.readFileSync(ttsFile, 'utf-8'));

  console.log(`${B}Template Plan${X} (${templateId})`);
  console.log(`Audio: ${ttsData.audioDuration.toFixed(1)}s, Cues: ${ttsData.cues.length}`);

  // Build sections from words
  const words = ttsData.words as Array<{ text: string; startTime: number; endTime: number }>;
  const sections: Array<Record<string, unknown>> = [];
  const assets: Array<Record<string, unknown>> = [];
  let secStart = 0;
  let secWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    secWords.push(words[i].text);
    if (/[.!?]$/.test(words[i].text) || i === words.length - 1) {
      if (secWords.length >= 2) {
        const idx = sections.length;
        sections.push({
          index: idx,
          text: secWords.join(' '),
          startTime: words[secStart].startTime,
          endTime: words[i].endTime,
          assetId: `asset-${idx}`,
        });
        assets.push({
          id: `asset-${idx}`,
          url: `https://picsum.photos/1080/1920?random=${idx}`,
          type: 'image',
          role: 'illustration',
          description: secWords.join(' ').substring(0, 50),
          sectionIndex: idx,
        });
      }
      secStart = i + 1;
      secWords = [];
    }
  }

  // Check for primary video from heygen step
  let primaryVideo: Record<string, unknown> | undefined;
  const heygenFile = path.join(outDir, 'heygen.json');
  if (fs.existsSync(heygenFile)) {
    const hg = JSON.parse(fs.readFileSync(heygenFile, 'utf-8'));
    if (hg.url) {
      primaryVideo = {
        url: hg.url,
        durationSeconds: hg.durationSeconds ?? ttsData.audioDuration,
        framing: 'bottom-aligned',
        loop: (hg.durationSeconds ?? 0) < ttsData.audioDuration,
        source: 'heygen',
      };
      console.log(`Primary video: HeyGen (${hg.durationSeconds?.toFixed(1)}s)`);
    }
  }

  const content = {
    script: words.map((w: { text: string }) => w.text).join(' '),
    voiceover: {
      url: ttsData.voiceoverPath,
      durationSeconds: ttsData.audioDuration,
      source: 'tts',
    },
    cues: ttsData.cues,
    sections,
    assets,
    primaryVideo,
    metadata: { language: 'pl' },
  };

  let planResult;

  if (flag('director')) {
    // AI Director path — LLM plans shots based on script + timing
    const { planProduction } = await import('./planner/production-planner');
    const { buildTimingReference } = await import('./orchestrator/base-orchestrator');
    const { ToolRegistry } = await import('./registry/tool-registry');
    const { discoverTools } = await import('./registry/discovery');

    console.log(`${B}AI Director${X}`);
    console.log(`  ${D}Discovering tools...${X}`);
    const registry = new ToolRegistry();
    for (const tool of discoverTools()) registry.register(tool);
    await registry.discover();
    const manifest = registry.getToolManifest();
    console.log(
      `  ${D}Tools: ${manifest.tools
        .filter((t: { available: boolean }) => t.available)
        .map((t: { id: string }) => t.id)
        .join(', ')}${X}`
    );

    const timingReference = buildTimingReference(words);
    const style = (opt('style') ?? 'dynamic') as 'dynamic' | 'calm' | 'cinematic' | 'educational';

    console.log(`  ${D}Planning (${style})...${X}`);
    planResult = await planProduction({
      script: content.script,
      durationEstimate: ttsData.audioDuration,
      style,
      toolManifest: manifest,
      primaryVideoUrl: primaryVideo?.url as string | undefined,
      layout: (opt('layout') as 'fullscreen' | undefined) ?? 'fullscreen',
      timingReference,
    });
  } else {
    // Template path — deterministic, zero LLM
    planResult = buildTemplatePlan(content as never, templateId);
  }

  save('plan.json', planResult);
  save('content.json', content);

  console.log(`Layout: ${planResult.layout}`);
  console.log(
    `Shots: ${planResult.shots.length} (${planResult.shots.map((s: { shotLayout?: string }) => s.shotLayout).join(', ')})`
  );
  console.log(
    `Zooms: ${planResult.zoomSegments?.length ?? 0}, SFX: ${planResult.sfxSegments?.length ?? 0}`
  );
  console.log(`${G}Done${X}`);
  console.log(`${D}Next: bun run rs assemble ${outDir}/plan.json ${outDir}/tts.json${X}`);
}

async function assemble() {
  const planFile = positional(1);
  const ttsFile = positional(2);
  if (!planFile || !ttsFile || !fs.existsSync(planFile) || !fs.existsSync(ttsFile)) {
    console.log(`Usage: bun run rs assemble <plan.json> <tts.json>`);
    process.exit(1);
  }

  const { assembleComposition } = await import('./orchestrator/composition-assembler');
  const planData = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  const ttsData = JSON.parse(fs.readFileSync(ttsFile, 'utf-8'));

  console.log(`${B}Assemble Composition${X}`);

  // Load generated assets (from `bun run rs assets`) if available
  const assetsFile = path.join(outDir, 'assets.json');
  const contentFile = path.join(outDir, 'content.json');
  let genAssets: Array<Record<string, unknown>> = [];

  if (fs.existsSync(assetsFile)) {
    // Real AI-generated assets — use these
    genAssets = JSON.parse(fs.readFileSync(assetsFile, 'utf-8'));
    console.log(`Assets: ${genAssets.length} from assets.json`);
  } else {
    // Fallback to content.json placeholders
    const content = fs.existsSync(contentFile)
      ? JSON.parse(fs.readFileSync(contentFile, 'utf-8'))
      : { assets: [] };
    for (const shot of planData.shots) {
      if (shot.visual?.type !== 'b-roll') continue;
      const ca = content.assets?.find((a: { id: string }) => a.id === shot.visual.searchQuery);
      if (ca)
        genAssets.push({
          toolId: 'placeholder',
          shotId: shot.id,
          url: ca.url,
          type: 'stock-image',
        });
    }
    console.log(`Assets: ${genAssets.length} placeholders from content.json`);
  }

  const props = assembleComposition({
    plan: planData,
    assets: genAssets as never,
    cues: ttsData.cues.map((c: Record<string, unknown>) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: (c.words as unknown[])?.map((w: unknown) => ({ ...(w as object) })),
    })),
    voiceoverFilename: ttsData.voiceoverPath,
    primaryVideoObjectPosition: 'center 85%',
  });

  save('composition.json', props);
  console.log(`B-roll: ${props.bRollSegments?.length ?? 0}, Cues: ${props.cues?.length ?? 0}`);
  console.log(
    `Caption: ${props.captionStyle?.fontSize}px ${props.captionStyle?.highlightMode} ${props.captionStyle?.animationStyle ?? ''}`
  );
  console.log(`${G}Done${X}`);
  console.log(`${D}Next: bun run rs render ${outDir}/composition.json${X}`);
}

async function render() {
  const compFile = positional(1);
  if (!compFile || !fs.existsSync(compFile)) {
    console.log(`Usage: bun run rs render <composition.json>`);
    process.exit(1);
  }

  const { renderVideo } = await import('./orchestrator/base-orchestrator');
  const props = JSON.parse(fs.readFileSync(compFile, 'utf-8'));
  const outputPath = path.join(outDir, 'output.mp4');

  console.log(`${B}Remotion Render${X}`);
  console.log(`${Y}First run bundles Remotion (~60s). Subsequent runs are fast.${X}`);

  const t0 = performance.now();
  const result = await renderVideo(props, outputPath, (msg) => console.log(`  ${D}${msg}${X}`));

  console.log(`${G}Done${X} (${elapsed(t0)}): ${result.outputPath}`);
  console.log(`${D}Open: open ${result.outputPath}${X}`);
}

async function heygen() {
  let script = positional(1);
  if (!script) {
    console.log(
      `Usage: bun run rs heygen "Tekst" [--iv] [--emotion Friendly] [--speed 1.1]\n       bun run rs heygen skrypt.txt`
    );
    process.exit(1);
  }

  // File support: read script from file, strip timing markers
  const filePath = opt('file');
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`${R}File not found: ${filePath}${X}`);
      process.exit(1);
    }
    script = cleanScriptFile(fs.readFileSync(filePath, 'utf-8'));
  } else if (script && fs.existsSync(script)) {
    script = cleanScriptFile(fs.readFileSync(script, 'utf-8'));
  }

  const { HeyGenTool } = await import('./tools/heygen-tool');
  const tool = new HeyGenTool();

  const health = await tool.healthCheck();
  if (!health.available) {
    console.log(`${R}HeyGen unavailable: ${health.reason}${X}`);
    process.exit(1);
  }

  console.log(`${B}HeyGen Generate${X}${flag('iv') ? ' (Avatar IV)' : ''}`);
  console.log(`Script: "${script.substring(0, 80)}${script.length > 80 ? '...' : ''}"`);

  const t0 = performance.now();
  const result = await tool.generate({
    purpose: 'CLI test',
    script,
    aspectRatio: '9:16',
    ...(flag('iv')
      ? {
          heygen_character: {
            use_avatar_iv_model: true,
            prompt: opt('motion') ?? 'speaks naturally with hand gestures',
          },
        }
      : {}),
    ...(opt('emotion') || opt('speed')
      ? {
          heygen_voice: {
            ...(opt('emotion') ? { emotion: opt('emotion') } : {}),
            ...(opt('speed') ? { speed: parseFloat(opt('speed')!) } : {}),
          },
        }
      : {}),
  });

  if (result.status === 'failed') {
    console.log(`${R}Failed: ${result.error}${X}`);
    process.exit(1);
  }

  console.log(`Job: ${result.jobId}`);
  console.log(
    `Polling (ctrl+c to cancel, use 'bun run rs heygen-poll ${result.jobId}' to resume)...`
  );

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await tool.poll(result.jobId);
    const sec = (i + 1) * 5;

    if (poll.status === 'completed') {
      save('heygen.json', {
        url: poll.url,
        durationSeconds: poll.durationSeconds,
        jobId: result.jobId,
      });
      // Download video
      if (poll.url) {
        const videoPath = path.join(outDir, 'heygen.mp4');
        const res = await fetch(poll.url);
        if (res.ok) {
          fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));
          console.log(`${G}Done${X} (${sec}s): ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(`${D}Saved: ${videoPath}${X}`);
          console.log(`${D}Open:  open ${videoPath}${X}`);
        } else {
          console.log(`${G}Done${X} (${sec}s): ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(
            `${Y}Download failed (${res.status}), URL:${X} ${poll.url?.substring(0, 80)}...`
          );
        }
      }
      console.log(`${D}Next: bun run rs plan ${outDir}/tts.json${X}`);
      return;
    }
    if (poll.status === 'failed') {
      console.log(`${R}Failed: ${poll.error}${X}`);
      process.exit(1);
    }
    if (sec % 30 === 0) console.log(`  ${D}${sec}s...${X}`);
  }
  console.log(`${Y}Timeout. Use: bun run rs heygen-poll ${result.jobId}${X}`);
}

async function heygenPoll() {
  const jobId = positional(1);
  if (!jobId) {
    console.log(`Usage: bun run rs heygen-poll <job-id>`);
    process.exit(1);
  }

  const { HeyGenTool } = await import('./tools/heygen-tool');
  const tool = new HeyGenTool();

  console.log(`${B}HeyGen Poll${X} ${jobId}`);

  for (let i = 0; i < 60; i++) {
    const poll = await tool.poll(jobId);
    if (poll.status === 'completed') {
      save('heygen.json', { url: poll.url, durationSeconds: poll.durationSeconds, jobId });
      if (poll.url) {
        const videoPath = path.join(outDir, 'heygen.mp4');
        const res = await fetch(poll.url);
        if (res.ok) {
          fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));
          console.log(`${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(`${D}Saved: ${videoPath}${X}`);
          console.log(`${D}Open:  open ${videoPath}${X}`);
        } else {
          console.log(`${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s video`);
          console.log(`${D}URL: ${poll.url?.substring(0, 80)}...${X}`);
        }
      }
      return;
    }
    if (poll.status === 'failed') {
      console.log(`${R}Failed: ${poll.error}${X}`);
      process.exit(1);
    }
    console.log(`  ${D}${(i + 1) * 5}s: ${poll.status}${X}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function heygenStatus() {
  const { HeyGenTool } = await import('./tools/heygen-tool');
  const tool = new HeyGenTool();
  const health = await tool.healthCheck();
  console.log(`${B}HeyGen Status${X}`);
  console.log(`Available: ${health.available ? G + 'yes' : R + 'no'}${X}`);
  if (health.reason) console.log(`Reason: ${health.reason}`);
}

async function splitAudio() {
  const ttsFile = positional(1);
  if (!ttsFile || !fs.existsSync(ttsFile)) {
    console.log(`Usage: bun run rs split-audio <tts.json>`);
    process.exit(1);
  }

  const { splitAudioByTimings } = await import('../../ffmpeg/src/audio-split');
  const ttsData = JSON.parse(fs.readFileSync(ttsFile, 'utf-8'));

  if (!ttsData.voiceoverPath || !ttsData.words) {
    console.log(`${R}tts.json must have voiceoverPath and words${X}`);
    process.exit(1);
  }

  // Build sections from word timing (split on sentence boundaries)
  const words = ttsData.words as Array<{ text: string; startTime: number; endTime: number }>;
  const segments: Array<{ startTime: number; endTime: number; text: string }> = [];
  let secStart = 0;
  let secWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    secWords.push(words[i].text);
    if (/[.!?]$/.test(words[i].text) || i === words.length - 1) {
      if (secWords.length >= 2) {
        segments.push({
          startTime: words[secStart].startTime,
          endTime: words[i].endTime,
          text: secWords.join(' '),
        });
      }
      secStart = i + 1;
      secWords = [];
    }
  }

  console.log(`${B}Split Audio${X}`);
  console.log(`Audio: ${ttsData.voiceoverPath}`);
  console.log(`Segments: ${segments.length}`);

  const audioDir = path.join(outDir, 'audio-segments');
  const results = splitAudioByTimings(ttsData.voiceoverPath, segments, audioDir);

  save(
    'segments.json',
    segments.map((s, i) => ({
      ...s,
      audioPath: results[i]?.path,
    }))
  );

  for (const [i, r] of results.entries()) {
    console.log(
      `  [${r.startTime.toFixed(1)}s-${r.endTime.toFixed(1)}s] ${segments[i].text.substring(0, 50)}... → ${path.basename(r.path)}`
    );
  }

  console.log(`${G}Done${X}: ${results.length} segments in ${audioDir}/`);
  console.log(
    `${D}Next: bun run rs lipsync <character-image> --segments ${outDir}/segments.json${X}`
  );
}

async function lipsync() {
  const imageFile = positional(1);
  const segmentsFile = opt('segments') ?? path.join(outDir, 'segments.json');

  if (!imageFile) {
    console.log(
      `Usage: bun run rs lipsync <character-image.jpg> [--segments segments.json] [--tool seedance|kling]`
    );
    process.exit(1);
  }

  if (!fs.existsSync(segmentsFile)) {
    console.log(`${R}Segments file not found: ${segmentsFile}${X}`);
    console.log(`${D}Run 'bun run rs split-audio tts.json' first${X}`);
    process.exit(1);
  }

  // Load private modules for Kling Avatar tool
  try {
    // @ts-expect-error — private module, no type declarations
    await import('@reelstack/modules');
  } catch {
    try {
      await import('../../modules/src/index');
    } catch {
      /* */
    }
  }

  const { discoverTools } = await import('./index');
  const { ToolRegistry } = await import('./registry/tool-registry');

  const segments = JSON.parse(fs.readFileSync(segmentsFile, 'utf-8')) as Array<{
    startTime: number;
    endTime: number;
    text: string;
    audioPath?: string;
  }>;

  const preferredTool = opt('tool') ?? 'kling';

  // Find lip sync tool
  const registry = new ToolRegistry();
  for (const tool of discoverTools()) registry.register(tool);
  await registry.discover();

  const toolId = preferredTool === 'seedance' ? 'seedance2-kie' : 'kling-avatar-fal';
  const maybeTool = registry.get(toolId);
  if (!maybeTool) {
    console.log(`${R}Tool ${toolId} not available. Check API keys.${X}`);
    const available = registry
      .getAvailable()
      .map((t) => t.id)
      .join(', ');
    console.log(`${D}Available: ${available}${X}`);
    process.exit(1);
    return;
  }
  const tool = maybeTool;

  // Upload character image to storage for URL access
  const { createStorage } = await import('../../storage/src/index');
  const storage = await createStorage();
  const imgBuf = fs.readFileSync(imageFile);
  const imgKey = `lipsync/character-${Date.now()}.jpg`;
  await storage.upload(imgBuf, imgKey);
  const imageUrl = await storage.getSignedUrl(imgKey, 7200);

  console.log(`${B}Lip Sync Generation${X} (${tool.name})`);
  console.log(`Character: ${imageFile}`);
  console.log(`Segments: ${segments.length}`);
  console.log(`Tool: ${toolId}`);

  const results: Array<{ segmentIndex: number; url?: string; error?: string }> = [];

  for (const [i, seg] of segments.entries()) {
    if (!seg.audioPath || !fs.existsSync(seg.audioPath)) {
      console.log(`  ${R}Segment ${i}: no audio file${X}`);
      results.push({ segmentIndex: i, error: 'no audio' });
      continue;
    }

    // Upload audio segment
    const audioBuf = fs.readFileSync(seg.audioPath);
    const audioKey = `lipsync/audio-${Date.now()}-${i}.mp3`;
    await storage.upload(audioBuf, audioKey);
    const audioUrl = await storage.getSignedUrl(audioKey, 7200);

    console.log(
      `  ${Y}Segment ${i}${X}: [${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s] "${seg.text.substring(0, 40)}..."`
    );

    const job = await tool.generate({
      purpose: `Lip sync scene ${i}`,
      prompt: seg.text,
      imageUrl,
      audioUrl,
      aspectRatio: '9:16',
    });

    if (job.status === 'failed') {
      console.log(`    ${R}Failed: ${job.error}${X}`);
      results.push({ segmentIndex: i, error: job.error });
      continue;
    }

    // Poll
    console.log(`    Polling (${job.jobId})...`);
    let poll = job;
    for (let p = 0; p < 60; p++) {
      await new Promise((r) => setTimeout(r, 5000));
      poll = await tool.poll!(job.jobId);
      if (poll.status === 'completed') {
        console.log(`    ${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s`);
        results.push({ segmentIndex: i, url: poll.url });
        break;
      }
      if (poll.status === 'failed') {
        console.log(`    ${R}Failed: ${poll.error}${X}`);
        results.push({ segmentIndex: i, error: poll.error });
        break;
      }
      if (((p + 1) * 5) % 30 === 0) console.log(`    ${D}${(p + 1) * 5}s...${X}`);
    }
  }

  save('lipsync.json', results);
  const ok = results.filter((r) => r.url).length;
  console.log(`\n${G}${ok}/${segments.length} clips generated${X}`);
  if (ok > 0)
    console.log(
      `${D}Next: bun run rs plan ${outDir}/tts.json  (lipsync.json will be picked up)${X}`
    );
}

// ── Assets (generate images/videos from plan) ──

async function assets() {
  const planFile = positional(1);
  if (!planFile || !fs.existsSync(planFile)) {
    console.log(
      `Usage: bun run rs assets <plan.json>\n\nGenerates images/videos for all b-roll shots in the plan.\nRequires API keys for video/image tools (fal.ai, Kling, etc.).`
    );
    process.exit(1);
  }

  const { generateAssets } = await import('./orchestrator/asset-generator');
  const { ToolRegistry } = await import('./registry/tool-registry');
  const { discoverTools } = await import('./registry/discovery');

  // Load private modules
  try {
    // @ts-expect-error — private module
    await import('@reelstack/modules');
  } catch {
    try {
      await import('../../modules/src/index');
    } catch {
      /* no private modules */
    }
  }

  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));

  console.log(`${B}Asset Generation${X}`);
  const t0 = performance.now();

  // Discover tools
  console.log(`  ${D}Discovering tools...${X}`);
  const registry = new ToolRegistry();
  for (const tool of discoverTools()) registry.register(tool);
  await registry.discover();

  const available = registry
    .getToolManifest()
    .tools.filter((t: { available: boolean }) => t.available);
  console.log(`  ${D}${available.length} tools available${X}`);

  // Count shots that need assets
  const brollShots = plan.shots.filter(
    (s: { visual?: { type?: string } }) =>
      s.visual?.type === 'b-roll' || s.visual?.type === 'ai-video' || s.visual?.type === 'ai-image'
  );
  console.log(`  ${D}${brollShots.length} shots need assets${X}`);

  // Generate
  const generated = await generateAssets(plan, registry, (msg) => console.log(`  ${D}${msg}${X}`));

  // Copy assets to out/assets/ and enrich with prompts from plan
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const asset of generated) {
    // Copy local file to out/assets/
    if (asset.url && !asset.url.startsWith('http') && fs.existsSync(asset.url)) {
      const ext = path.extname(asset.url) || '.mp4';
      const localPath = path.join(assetsDir, `${asset.shotId}${ext}`);
      fs.copyFileSync(asset.url, localPath);
      (asset as Record<string, unknown>).localPath = localPath;
    }

    // Enrich with prompt from plan
    const shot = plan.shots.find((s: { id: string }) => s.id === asset.shotId);
    if (shot?.visual?.prompt) {
      (asset as Record<string, unknown>).prompt = shot.visual.prompt;
    }
  }

  // Upload to R2 (Lambda needs remote URLs)
  const { createStorage } = await import('@reelstack/storage');
  const storage = await createStorage();
  console.log(`  ${D}Uploading ${generated.length} assets to R2...${X}`);

  for (const asset of generated) {
    const localFile = ((asset as Record<string, unknown>).localPath as string) ?? asset.url;
    if (localFile && !localFile.startsWith('http') && fs.existsSync(localFile)) {
      try {
        const ext = path.extname(localFile) || '.mp4';
        const key = `assets/asset-${asset.shotId}-${Date.now()}${ext}`;
        await storage.upload(fs.readFileSync(localFile), key);
        const signedUrl = await storage.getSignedUrl(key, 7200);
        asset.url = signedUrl;
        console.log(`  ${D}  ${asset.shotId}: uploaded${X}`);
      } catch (err) {
        console.log(`  ${Y}  ${asset.shotId}: upload failed (${(err as Error).message})${X}`);
      }
    }
  }

  // Save asset map with prompts + local paths + R2 URLs
  save('assets.json', generated);

  const ok = generated.filter((a) => a.url?.startsWith('http')).length;
  console.log(`${G}Done${X} (${elapsed(t0)}): ${ok}/${generated.length} assets uploaded`);
  console.log(`${D}Local copies: ${assetsDir}/${X}`);
  console.log(`${D}Next: bun run rs assemble ${outDir}/plan.json ${outDir}/tts.json${X}`);
}

// ── Transcribe (extract audio from video → Whisper → tts.json) ──

async function transcribe() {
  const videoFile = positional(1);
  if (!videoFile || !fs.existsSync(videoFile)) {
    console.log(
      `Usage: bun run rs transcribe <video.mp4>\n\nExtracts audio from video (e.g. HeyGen), runs Whisper, outputs tts.json.\nUse this instead of 'tts' when you already have audio (HeyGen, screen recording, etc.).`
    );
    process.exit(1);
  }

  const { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } =
    await import('@reelstack/remotion/pipeline');
  const { groupWordsIntoCues, alignWordsWithScript } = await import('@reelstack/transcription');

  console.log(`${B}Transcribe${X} ${videoFile}`);
  const t0 = performance.now();

  // Extract audio from video using ffmpeg
  const audioPath = path.join(outDir, 'extracted-audio.wav');
  const { execSync } = await import('child_process');
  console.log(`  ${D}Extracting audio...${X}`);
  execSync(`ffmpeg -y -i "${videoFile}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`, {
    stdio: 'pipe',
  });

  const audioBuffer = fs.readFileSync(audioPath);
  const audioDuration = getAudioDuration(audioBuffer, 'wav');
  console.log(`  ${D}Audio: ${audioDuration.toFixed(1)}s${X}`);

  // Run Whisper
  console.log(`  ${D}Running Whisper...${X}`);
  const transcription = await transcribeAudio(audioBuffer, {
    language: opt('lang')?.split('-')[0] ?? 'pl',
  });
  console.log(`  ${D}Whisper: ${transcription.words.length} words${X}`);

  // Group into cues
  const cues = groupWordsIntoCues(transcription.words, {
    maxWordsPerCue: 5,
    maxDurationPerCue: 3,
    breakOnPunctuation: true,
  });

  // Copy source video to out dir
  const videoOutPath = path.join(outDir, 'heygen.mp4');
  if (path.resolve(videoFile) !== path.resolve(videoOutPath)) {
    fs.copyFileSync(videoFile, videoOutPath);
  }

  // Upload video to R2 so Lambda can access it during render
  console.log(`  ${D}Uploading to R2...${X}`);
  const { createStorage } = await import('@reelstack/storage');
  const storage = await createStorage();
  const videoKey = `heygen/heygen-${Date.now()}.mp4`;
  await storage.upload(fs.readFileSync(videoOutPath), videoKey);
  const videoUrl = await storage.getSignedUrl(videoKey, 7200);
  console.log(`  ${D}R2: ${videoKey}${X}`);

  // Save tts.json (compatible with plan/assemble)
  // voiceoverPath = signed R2 URL (Lambda needs remote access)
  save('tts.json', {
    voiceoverPath: videoUrl,
    audioDuration,
    cues,
    words: transcription.words,
    source: 'transcribe',
    sourceVideo: videoUrl,
  });

  // Update heygen.json with R2 URL so plan uses accessible URL for primaryVideo
  const heygenJsonPath = path.join(outDir, 'heygen.json');
  if (fs.existsSync(heygenJsonPath)) {
    const hg = JSON.parse(fs.readFileSync(heygenJsonPath, 'utf-8'));
    hg.url = videoUrl;
    fs.writeFileSync(heygenJsonPath, JSON.stringify(hg, null, 2));
    console.log(`  ${D}Updated heygen.json with R2 URL${X}`);
  } else {
    // No heygen.json yet (e.g. transcribing screen recording) - create one
    save('heygen.json', { url: videoUrl, durationSeconds: audioDuration });
  }

  // Clean up temp audio
  fs.unlinkSync(audioPath);

  console.log(`${G}Done${X} (${elapsed(t0)}): ${audioDuration.toFixed(1)}s, ${cues.length} cues`);
  console.log(`${D}Next: bun run rs plan ${outDir}/tts.json${X}`);
}

// ── Dispatch ─────────────────────────────────────────────────

const commands: Record<string, () => Promise<void>> = {
  tts,
  transcribe,
  plan,
  assets,
  assemble,
  render,
  heygen,
  'heygen-poll': heygenPoll,
  'heygen-status': heygenStatus,
  'split-audio': splitAudio,
  lipsync,
};

if (!command || !commands[command]) {
  console.log(`${B}ReelStack CLI${X}

${Y}Pipeline A: Voiceover (TTS + przebitki):${X}
  bun run rs tts "Tekst"                    Generate voiceover + transcription
  bun run rs tts skrypt.txt                 Read script from file
  bun run rs plan tts.json                  Build template montage plan
  bun run rs assemble plan.json tts.json    Compose Remotion props
  bun run rs render composition.json        Render to MP4

${Y}Pipeline B: HeyGen avatar (talking head + przebitki):${X}
  bun run rs heygen "Tekst" [--iv]          Generate avatar video (has audio+video)
  bun run rs heygen-poll <job-id>           Check/resume generation
  bun run rs transcribe heygen.mp4          Extract audio → Whisper transcription
  bun run rs plan tts.json                  Build montage plan (template, deterministic)
  bun run rs plan tts.json --director       Build montage plan (AI director, LLM)
  bun run rs assets plan.json               Generate images/videos for b-roll shots
  bun run rs assemble plan.json tts.json    Compose Remotion props
  bun run rs render composition.json        Render to MP4

  NOTE: HeyGen gives you audio+video in one file. Do NOT run tts.
  Use 'transcribe' to get word timestamps from the existing audio.

${Y}Lip sync (AI talking head from image):${X}
  bun run rs lipsync <image.jpg>            Generate lip-synced clips per scene
  bun run rs lipsync img.jpg --tool seedance  Use Seedance instead of Kling

${Y}Utilities:${X}
  bun run rs split-audio tts.json           Split audio into per-scene segments
  bun run rs heygen-status                  Check HeyGen quota

${Y}Options:${X}
  --template <id>    Template (default: jump-cut-dynamic)
  --voice <id>       TTS voice (default: pl-PL-MarekNeural)
  --iv               Avatar IV mode
  --emotion <name>   Voice emotion (Excited, Friendly, Serious)
  --speed <n>        Voice speed (0.5-1.5)
  --tool <name>      Lip sync tool: kling (default) or seedance
  --out <dir>        Output directory (default: project out/)
`);
  process.exit(0);
}

await commands[command]();
