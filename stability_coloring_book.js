import "dotenv/config";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROMPT = [
  "Create a printable coloring-book page from the reference image.",
  "Convert the main subject into a cute, clean, child-friendly black-and-white line art illustration.",
  "Use black outlines only, a white background, thick smooth lines, and clear enclosed coloring areas.",
  "Preserve the subject's main pose, silhouette, expression, and recognizable details.",
  "Simplify complex textures into a few clean decorative lines.",
  "Remove all background elements.",
  "Center the subject on the page.",
  "Add a thin rectangular page border.",
].join(" ");

const DEFAULT_NEGATIVE_PROMPT = [
  "color",
  "grayscale",
  "shading",
  "shadow",
  "photorealistic",
  "painting",
  "messy lines",
  "background clutter",
  "text",
  "watermark",
  "logo",
].join(", ");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function parseArgs(argv) {
  const args = {
    all: false,
    dryRun: false,
    file: null,
    inputDir: process.env.STABILITY_INPUT_DIR || "background_removed",
    outputDir: process.env.STABILITY_OUTPUT_DIR || "stability_outputs",
    engineId: process.env.STABILITY_ENGINE_ID || "stable-diffusion-xl-1024-v1-0",
    prompt: process.env.STABILITY_PROMPT || DEFAULT_PROMPT,
    negativePrompt: process.env.STABILITY_NEGATIVE_PROMPT || DEFAULT_NEGATIVE_PROMPT,
    imageStrength: Number(process.env.STABILITY_IMAGE_STRENGTH || 0.35),
    cfgScale: Number(process.env.STABILITY_CFG_SCALE || 7),
    steps: Number(process.env.STABILITY_STEPS || 30),
    samples: Number(process.env.STABILITY_SAMPLES || 1),
    seed: Number(process.env.STABILITY_SEED || 0),
    stylePreset: process.env.STABILITY_STYLE_PRESET || "line-art",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--all") {
      args.all = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--file") {
      args.file = next;
      index += 1;
    } else if (arg === "--input-dir") {
      args.inputDir = next;
      index += 1;
    } else if (arg === "--output-dir") {
      args.outputDir = next;
      index += 1;
    } else if (arg === "--engine-id") {
      args.engineId = next;
      index += 1;
    } else if (arg === "--prompt") {
      args.prompt = next;
      index += 1;
    } else if (arg === "--negative-prompt") {
      args.negativePrompt = next;
      index += 1;
    } else if (arg === "--image-strength") {
      args.imageStrength = Number(next);
      index += 1;
    } else if (arg === "--cfg-scale") {
      args.cfgScale = Number(next);
      index += 1;
    } else if (arg === "--steps") {
      args.steps = Number(next);
      index += 1;
    } else if (arg === "--samples") {
      args.samples = Number(next);
      index += 1;
    } else if (arg === "--seed") {
      args.seed = Number(next);
      index += 1;
    } else if (arg === "--style-preset") {
      args.stylePreset = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  validateArgs(args);
  return args;
}

function validateArgs(args) {
  if (args.imageStrength < 0 || args.imageStrength > 1) {
    throw new Error("--image-strength must be between 0 and 1.");
  }
  if (args.cfgScale < 0 || args.cfgScale > 35) {
    throw new Error("--cfg-scale must be between 0 and 35.");
  }
  if (args.steps < 10 || args.steps > 50) {
    throw new Error("--steps must be between 10 and 50.");
  }
  if (args.samples < 1 || args.samples > 10) {
    throw new Error("--samples must be between 1 and 10.");
  }
}

async function listInputImages(inputDir) {
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function selectImages(images, args) {
  if (args.file) {
    if (!images.includes(args.file)) {
      throw new Error(`File not found in ${args.inputDir}: ${args.file}`);
    }
    return [args.file];
  }

  if (args.all) {
    return images;
  }

  return images.includes("cat1.png") ? ["cat1.png"] : images.slice(0, 1);
}

function getMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function createFormData(args, fileName, imageBuffer) {
  const formData = new FormData();
  formData.append("init_image", new Blob([imageBuffer], { type: getMimeType(fileName) }), fileName);
  formData.append("init_image_mode", "IMAGE_STRENGTH");
  formData.append("image_strength", String(args.imageStrength));
  formData.append("cfg_scale", String(args.cfgScale));
  formData.append("steps", String(args.steps));
  formData.append("samples", String(args.samples));
  formData.append("seed", String(args.seed));
  formData.append("clip_guidance_preset", "NONE");

  if (args.stylePreset) {
    formData.append("style_preset", args.stylePreset);
  }

  formData.append("text_prompts[0][text]", args.prompt);
  formData.append("text_prompts[0][weight]", "1");

  if (args.negativePrompt) {
    formData.append("text_prompts[1][text]", args.negativePrompt);
    formData.append("text_prompts[1][weight]", "-1");
  }

  return formData;
}

async function runOneImage(args, apiKey, fileName) {
  const inputPath = path.join(args.inputDir, fileName);
  const stem = path.parse(fileName).name;
  const imageBuffer = await readFile(inputPath);
  const formData = createFormData(args, fileName, imageBuffer);
  const endpoint = `https://api.stability.ai/v1/generation/${args.engineId}/image-to-image`;

  console.log(`Running Stability ${args.engineId} with ${inputPath}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Stability-Client-ID": "printable-coloring-book-preset",
      "Stability-Client-Version": "0.1.0",
    },
    body: formData,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Stability API failed: ${response.status} ${response.statusText}\n${responseText}`);
  }

  const result = JSON.parse(responseText);
  return saveJsonArtifacts(result, args.outputDir, stem);
}

async function saveJsonArtifacts(result, outputDir, stem) {
  await mkdir(outputDir, { recursive: true });

  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  if (artifacts.length === 0) {
    const jsonPath = path.join(outputDir, `${stem}_stability_output.json`);
    await writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(`Saved: ${jsonPath}`);
    return;
  }

  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const imagePath = path.join(outputDir, `${stem}_stability_coloring_${index + 1}.png`);
    await writeFile(imagePath, Buffer.from(artifact.base64, "base64"));
    console.log(`Saved: ${imagePath}`);

    const metadataPath = path.join(outputDir, `${stem}_stability_coloring_${index + 1}.json`);
    await writeFile(
      metadataPath,
      JSON.stringify(
        {
          seed: artifact.seed,
          finishReason: artifact.finishReason,
        },
        null,
        2
      )
    );
  }
}

function printDryRun(args, selectedImages) {
  console.log("Dry run only. No API call will be made.");
  console.log(`Engine: ${args.engineId}`);
  console.log(`Input dir: ${args.inputDir}`);
  console.log(`Output dir: ${args.outputDir}`);
  console.log(`Images: ${selectedImages.join(", ")}`);
  console.log(`Image strength: ${args.imageStrength}`);
  console.log(`CFG scale: ${args.cfgScale}`);
  console.log(`Steps: ${args.steps}`);
  console.log(`Samples: ${args.samples}`);
  console.log(`Seed: ${args.seed}`);
  console.log(`Style preset: ${args.stylePreset}`);
  console.log(`Prompt: ${args.prompt}`);
  console.log(`Negative prompt: ${args.negativePrompt}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const images = await listInputImages(args.inputDir);
  const selectedImages = selectImages(images, args);

  if (selectedImages.length === 0) {
    throw new Error(`No supported image files found in ${args.inputDir}`);
  }

  if (args.dryRun) {
    printDryRun(args, selectedImages);
    return;
  }

  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Stability token. Add STABILITY_API_KEY=... to .env before running this script.");
  }

  for (const fileName of selectedImages) {
    await runOneImage(args, apiKey, fileName);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
