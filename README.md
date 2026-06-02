# Document Copilot

A serverless agent that answers maintenance questions over industrial equipment PDFs. It pulls back the relevant text along with any diagrams from the manuals. Search is just one of the tools the agent uses, not the whole thing.

## Project structure

```
ingest/      Python pipeline that turns PDFs into text, images and embeddings (FAISS)
backend/     Node query agent (LangGraph + tools), runs as a container Lambda
frontend/    React + CopilotKit chat UI
sample_data/ industrial PDFs
diagrams/    architecture diagrams
```

## What it's built with

- Frontend: Vite, React, TypeScript, CopilotKit, Tailwind
- Backend: Node and Express on AWS Lambda (container image)
- Agent: LangGraph (hand-built StateGraph) with pluggable tools and guardrails
- LLM: Amazon Bedrock (Claude), can swap to OpenRouter or Groq
- Embeddings: bge-base-en-v1.5 via FastEmbed, same model on ingest and query
- Vector store: FAISS stored in S3, searched in memory
- Storage: S3 for images (signed URLs) and source PDFs
- Infra: API Gateway, Lambda and S3, all serverless, in ap-south-1

## Diagrams

Have a look at [`diagrams/`](diagrams/):

- [`01-rag.md`](diagrams/01-rag.md) covers RAG retrieval
- [`02-agent-loop.md`](diagrams/02-agent-loop.md) covers the agent loop
- [`03-aws-browser-lambda.md`](diagrams/03-aws-browser-lambda.md) covers the AWS, browser and Lambda flow
