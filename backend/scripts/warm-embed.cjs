// Build-time: download + cache bge-base into the image so the Lambda has no cold-start model download. Runs during `docker build`.
const { FlagEmbedding, EmbeddingModel } = require('fastembed');
(async () => {
  const m = await FlagEmbedding.init({
    model: EmbeddingModel.BGEBaseENV15,
    cacheDir: process.env.FASTEMBED_CACHE,
    showDownloadProgress: false,
  });
  await m.queryEmbed('warmup'); // force full model load so all files are cached
  console.log('bge-base baked into image at', process.env.FASTEMBED_CACHE);
})().catch((e) => {
  console.error('bake failed', e);
  process.exit(1);
});
