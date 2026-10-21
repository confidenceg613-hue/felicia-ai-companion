import fs from "node:fs";
import { createRequire } from "node:module";
globalThis.require = createRequire(import.meta.url);

const dir = {
  async getFileHandle(name) {
    const bytes = fs.readFileSync(name === "en_US-sam-medium.onnx" ? "/tmp/sam.onnx" : "/tmp/sam.json");
    const blob = new Blob([bytes]);
    return { getFile: async () => blob };
  },
};

Object.defineProperty(globalThis.navigator, "storage", {
  value: { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) },
  configurable: true,
});

const lib = await import("@realtimex/piper-tts-web");
lib.PATH_MAP["en_US-sam-medium"] = "en/en_US/sam/medium/en_US-sam-medium.onnx";

try {
  const session = await lib.TtsSession.create({
    voiceId: "en_US-sam-medium",
    logger: (line) => console.log("[piper]", line),
    fallbackStrategy: "local",
    wasmPaths: {
      onnxWasm: "file:///home/daytona/codebase/node_modules/onnxruntime-web/dist/",
      piperData: "/tmp/piper_phonemize.data",
      piperWasm: "/tmp/piper_phonemize.wasm",
    },
  });
  const wav = await session.predict("Hey you. I was just thinking about you.");
  const bytes = new Uint8Array(await wav.arrayBuffer());
  fs.writeFileSync("/tmp/sam-test.wav", bytes);
  const header = String.fromCharCode(...bytes.slice(0, 4));
  const rate = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24);
  console.log("RESULT", { ok: true, type: wav.type, bytes: bytes.length, header, rate });
} catch (error) {
  console.log("RESULT", { ok: false, error: String(error && error.message ? error.message : error) });
  process.exit(1);
}
