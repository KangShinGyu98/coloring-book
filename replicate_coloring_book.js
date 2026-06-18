import "dotenv/config";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import Replicate from "replicate";

const DEFAULT_PROMPT = `Turn the image into a simple coloring book page for kids.

Draw only the main subject with clean black outlines on a white background. Use thick smooth lines, simple contours, and large closed spaces for coloring. Keep the subject easy to recognize, but simplify small details, textures, and background clutter. The result should look like a printable coloring book page for children.

Strict constraints:
- black and white only
- outline art only
- bold clean lines
- minimal detail
- no shading
- no shadows
- no gradients
- no realistic rendering
- no color
- no background clutter
- no text
- no watermark`;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function parseArgs(argv) {
  const args = {
    all: false,
    dryRun: false,
    file: null,
    inputDir: process.env.REPLICATE_INPUT_DIR || "background_removed",
    outputDir: process.env.REPLICATE_OUTPUT_DIR || "replicate_outputs",
    model: process.env.REPLICATE_MODEL || "black-forest-labs/flux-2-pro",
    prompt: process.env.REPLICATE_PROMPT || DEFAULT_PROMPT,
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
    } else if (arg === "--model") {
      args.model = next;
      index += 1;
    } else if (arg === "--prompt") {
      args.prompt = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
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

async function saveOutput(output, outputDir, stem) {
  await mkdir(outputDir, { recursive: true });

  const firstOutput = Array.isArray(output) ? output[0] : output;
  const outputPath = path.join(outputDir, `${stem}_ai_coloring.png`);

  if (Buffer.isBuffer(firstOutput) || firstOutput instanceof Uint8Array) {
    await writeFile(outputPath, firstOutput);
    return outputPath;
  }

  if (firstOutput && typeof firstOutput.arrayBuffer === "function") {
    const arrayBuffer = await firstOutput.arrayBuffer();
    await writeFile(outputPath, Buffer.from(arrayBuffer));
    return outputPath;
  }

  if (firstOutput && typeof firstOutput.url === "function") {
    return saveUrlOutput(firstOutput.url(), outputPath);
  }

  if (typeof firstOutput === "string") {
    if (firstOutput.startsWith("data:")) {
      await writeFile(outputPath, decodeDataUri(firstOutput));
      return outputPath;
    }

    if (firstOutput.startsWith("http://") || firstOutput.startsWith("https://")) {
      return saveUrlOutput(firstOutput, outputPath);
    }
  }

  const jsonPath = path.join(outputDir, `${stem}_ai_output.json`);
  await writeFile(jsonPath, JSON.stringify(output, null, 2));
  return jsonPath;
}

async function saveUrlOutput(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download output: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
}

function decodeDataUri(dataUri) {
  const [, encoded] = dataUri.split(",", 2);
  if (!encoded) {
    throw new Error("Invalid data URI output.");
  }
  return Buffer.from(encoded, "base64");
}

async function runOneImage(replicate, args, fileName) {
  const inputPath = path.join(args.inputDir, fileName);
  const stem = path.parse(fileName).name;
  const imageBuffer = await readFile(inputPath);

  const input = {
    prompt: args.prompt,
    input_images: [imageBuffer],
    aspect_ratio: "match_input_image",
    resolution: "match_input_image",
    output_format: "png",
    output_quality: 100,
    safety_tolerance: 2,
  };

  console.log(`Running ${args.model} with ${inputPath}`);
  const output = await replicate.run(args.model, { input });
  const savedPath = await saveOutput(output, args.outputDir, stem);
  console.log(`Saved: ${savedPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const images = await listInputImages(args.inputDir);
  const selectedImages = selectImages(images, args);

  if (selectedImages.length === 0) {
    throw new Error(`No supported image files found in ${args.inputDir}`);
  }

  if (args.dryRun) {
    console.log("Dry run only. No API call will be made.");
    console.log(`Model: ${args.model}`);
    console.log(`Input dir: ${args.inputDir}`);
    console.log(`Output dir: ${args.outputDir}`);
    console.log(`Images: ${selectedImages.join(", ")}`);
    console.log(`Prompt: ${args.prompt}`);
    return;
  }

  const auth = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
  if (!auth) {
    throw new Error("Missing Replicate token. Add REPLICATE_API_TOKEN=... to .env before running this script.");
  }

  const replicate = new Replicate({ auth });

  for (const fileName of selectedImages) {
    await runOneImage(replicate, args, fileName);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
