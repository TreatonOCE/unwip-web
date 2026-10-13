// Unwip - the files of the optional natural voice (Kokoro), where they come from, and their fingerprints.
// Used by the PC (app/voice/voice-main.js) and the web version (web-api.js). Each file is checked against
// its sha-256 before it's kept, so only these exact files ever run.
(function (root) {
  'use strict';
  const MODEL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/';
  const NPM = 'https://cdn.jsdelivr.net/npm/';
  // [file kept here, where it comes from, sha-256, size]
  const FILES = [
    ['kokoro.web.js', NPM + 'kokoro-js@1.2.1/dist/kokoro.web.js', '6067712fe4c43cdb36c762f860a5ab8d96ea1d9c8882466438eb9f3d0d20be8f', 2135146],
    ['ort-wasm-simd-threaded.jsep.mjs', NPM + '@huggingface/transformers@3.5.1/dist/ort-wasm-simd-threaded.jsep.mjs', '08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9', 44484],
    ['ort-wasm-simd-threaded.jsep.wasm', NPM + '@huggingface/transformers@3.5.1/dist/ort-wasm-simd-threaded.jsep.wasm', 'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39', 21596019],
    ['config.json', MODEL + 'config.json', 'df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f', 44],
    ['tokenizer.json', MODEL + 'tokenizer.json', '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34', 3497],
    ['tokenizer_config.json', MODEL + 'tokenizer_config.json', 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20', 113],
    ['onnx/model_quantized.onnx', MODEL + 'onnx/model_quantized.onnx', 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478', 92361116],
    ['voices/af_heart.bin', MODEL + 'voices/af_heart.bin', 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b', 522240],
    ['voices/af_bella.bin', MODEL + 'voices/af_bella.bin', 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b', 522240],
    ['voices/am_michael.bin', MODEL + 'voices/am_michael.bin', '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1', 522240],
    ['voices/am_fenrir.bin', MODEL + 'voices/am_fenrir.bin', 'c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43', 522240],
    ['voices/bf_emma.bin', MODEL + 'voices/bf_emma.bin', '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73', 522240],
    ['voices/bf_isabella.bin', MODEL + 'voices/bf_isabella.bin', '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f', 522240],
    ['voices/bm_george.bin', MODEL + 'voices/bm_george.bin', 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc', 522240],
    ['voices/bm_fable.bin', MODEL + 'voices/bm_fable.bin', 'f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1', 522240]
  ];
  const KOKORO = { FILES, TOTAL: FILES.reduce((a, f) => a + f[3], 0) };
  if (typeof module !== 'undefined' && module.exports) module.exports = KOKORO; else root.UNWIP_KOKORO = KOKORO;
})(typeof window !== 'undefined' ? window : globalThis);
