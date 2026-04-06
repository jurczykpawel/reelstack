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

async function tts() {
  const script = positional(1);
  if (!script) {
    console.log(
      `Usage: bun run rs tts "Tekst do mówienia" [--voice pl-PL-MarekNeural] [--lang pl-PL]`
    );
    process.exit(1);
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
    console.log(`Usage: bun run rs plan <tts.json> [--template jump-cut-dynamic]`);
    process.exit(1);
  }

  // Load private modules for premium templates
  try {
    await import('@bun run rs/modules');
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

  const planResult = buildTemplatePlan(content as never, templateId);
  save('plan.json', planResult);
  save('content.json', content);

  console.log(`Layout: ${planResult.layout}`);
  console.log(
    `Shots: ${planResult.shots.length} (${planResult.shots.map((s: { shotLayout?: string }) => s.shotLayout).join(', ')})`
  );
  console.log(
    `Zooms: ${planResult.zoomSegments.length}, SFX: ${planResult.sfxSegments?.length ?? 0}`
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

  // Load content.json for assets
  const contentFile = path.join(outDir, 'content.json');
  const content = fs.existsSync(contentFile)
    ? JSON.parse(fs.readFileSync(contentFile, 'utf-8'))
    : { assets: [] };

  console.log(`${B}Assemble Composition${X}`);

  const genAssets: Array<Record<string, unknown>> = [];
  for (const shot of planData.shots) {
    if (shot.visual?.type !== 'b-roll') continue;
    const ca = content.assets?.find((a: { id: string }) => a.id === shot.visual.searchQuery);
    if (ca)
      genAssets.push({ toolId: 'placeholder', shotId: shot.id, url: ca.url, type: 'stock-image' });
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
  const script = positional(1);
  if (!script) {
    console.log(`Usage: bun run rs heygen "Tekst" [--iv] [--emotion Friendly] [--speed 1.1]`);
    process.exit(1);
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
      console.log(`${G}Done${X} (${sec}s): ${poll.durationSeconds?.toFixed(1)}s video`);
      console.log(`${D}URL: ${poll.url?.substring(0, 80)}...${X}`);
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
      console.log(`${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s video`);
      console.log(`${D}URL: ${poll.url?.substring(0, 80)}...${X}`);
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
  const tool = registry.get(toolId);
  if (!tool) {
    console.log(`${R}Tool ${toolId} not available. Check API keys.${X}`);
    const available = registry
      .getAvailable()
      .map((t) => t.id)
      .join(', ');
    console.log(`${D}Available: ${available}${X}`);
    process.exit(1);
  }

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
      poll = await tool.poll(job.jobId);
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

// ── Dispatch ─────────────────────────────────────────────────

const commands: Record<string, () => Promise<void>> = {
  tts,
  plan,
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

${Y}Step-by-step pipeline:${X}
  bun run rs tts "Tekst"                    Generate voiceover + transcription
  bun run rs split-audio tts.json           Split audio into per-scene segments
  bun run rs plan tts.json                  Build template montage plan
  bun run rs assemble plan.json tts.json    Compose Remotion props
  bun run rs render composition.json        Render to MP4

${Y}Lip sync (AI talking head):${X}
  bun run rs lipsync <image.jpg>            Generate lip-synced clips per scene
  bun run rs lipsync img.jpg --tool seedance  Use Seedance instead of Kling

${Y}HeyGen:${X}
  bun run rs heygen "Tekst" [--iv]          Generate avatar video
  bun run rs heygen-poll <job-id>           Check generation status
  bun run rs heygen-status                  Check quota

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
