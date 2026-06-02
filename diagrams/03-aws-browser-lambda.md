```mermaid
flowchart LR
    subgraph BROWSER["🌐 Browser — React + CopilotKit"]
        CHAT[CopilotChat]
        UI[FigureGrid · ImageModal<br/>SourcesLine · OpenPDF]
    end

    subgraph BACK["⚙️ Lambda Container"]
        RT[/copilotkit runtime<br/>OpenAIAdapter → OpenRouter/]
        CHATLLM[Chat LLM<br/>only job: call answer_question]
        AGENT[runAgent · LangGraph StateGraph]
        RT --> CHATLLM
        CHATLLM -->|POST /chat| AGENT
    end

    subgraph AWS["☁️ AWS"]
        BR[Guardrails + Logging + LLM call]
        S3V[(S3 · vectors)]
        S3I[(S3 · images)]
        S3F[(S3 · frontend static site)]
    end

    CHAT -->| copilotkit runtime | RT
    AGENT -->|tool-use| BR
    AGENT -->|search| S3V
    AGENT -->|signed URLs| S3I
    AGENT -->|answer · figures · citations| RT
    RT --> UI
    S3F -.serves.-> BROWSER

    classDef br fill:#e3f2fd,stroke:#1565c0
    classDef bk fill:#fff3e0,stroke:#e65100
    classDef aw fill:#ede7f6,stroke:#4527a0
    class CHAT,UI br
    class RT,CHATLLM,AGENT bk
    class BR,S3V,S3I,S3F aw
```

no followUp: don't want the chat LLM to rephrase the answer. agent's answer is what we wanna render. also i was facing issue with 2nd turn groq "unsupported content" bug, but claude didn't have that issue.
streaming the llm steps: CopilotKit CoAgents needs LangGraph as a persistent running server. StateGraph runs in Lambda per request. live streaming couldn't be done for fully serverless.
container lambda: bge-base is in the container itself. replaceable when bedrock is available. 