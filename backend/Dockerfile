# Container image for the query agent Lambda.
FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# Native embedding deps (onnxruntime-node), built for this base image's Linux.
RUN npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund fastembed@2.1.0

# Bundled handler (everything else bundled by esbuild; natives kept external).
COPY build/query.js ./query.js

# Bake the bge-base model into the image -> no runtime download.
ENV FASTEMBED_CACHE=${LAMBDA_TASK_ROOT}/fastembed-cache
COPY scripts/warm-embed.cjs ./warm-embed.cjs
RUN node warm-embed.cjs && rm warm-embed.cjs

CMD ["query.handler"]
