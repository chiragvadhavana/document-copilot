#!/usr/bin/env bash
# Make the agent's Lambda Function URL publicly invocable.
# A public (AuthType=NONE) Function URL needs TWO resource-policy permissions:
#   1. lambda:InvokeFunctionUrl (Serverless adds this via `url:`)
#   2. lambda:InvokeFunction w/ InvokedViaFunctionUrl (Serverless does NOT add it)
# Without #2 every request returns {"Message":"Forbidden"} (HTTP 403).
# Usage: bash scripts/enable-public-url.sh [function-name]
set -euo pipefail

FN="${1:-document-copilot-dev-agent}"

# Idempotent: ignore the error if the statement already exists.
aws lambda add-permission \
  --function-name "$FN" \
  --statement-id PublicInvokeViaFunctionUrl \
  --action lambda:InvokeFunction \
  --principal '*' \
  --invoked-via-function-url >/dev/null 2>&1 \
  && echo "added lambda:InvokeFunction (InvokedViaFunctionUrl) to $FN" \
  || echo "permission already present on $FN (ok)"

URL=$(aws lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text)
echo "Function URL: $URL"
echo "health check:"; curl -s --max-time 20 -w ' [HTTP %{http_code}]\n' "${URL}healthz" || true
