```mermaid
flowchart TB
    START([User question + history]) --> NODE

    subgraph NODE["🧠 AGENT NODE. guardrail, LLM call, logging"]
        %% put some space here to make it look good
        %% TELL ME HOW TO DO IT:  
        %% CODE:
        
        LLM[Claude · tool-use]
    end

    NODE --> COND{tool_call?}
    COND -->|no| END([END<br/>answer · figures · citations])
    COND -->|yes| TOOLS

    subgraph TOOLS["🔧 TOOLS"]
        direction LR
        T1[search_manual<br/>RAG retrieval]
        T2[list_documents]
        T3[fetch_image]
        T4[get_page_context]
        T5[get_youtube_video_url]
    end

    TOOLS -->|result into state| NODE
    MCP[/MCP servers to be<br/>wrapped as LangChain tools/] -.plug in.-> TOOLS

    classDef brain fill:#fff3e0,stroke:#e65100,color:#bf360c
    classDef tool fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c
    class LLM brain
    class T1,T2,T3,T4 tool
```

Custom StateGraph: guardrail + logging per node, custom iteration count, more control over agent and more structured. createAgent is not really customizable.
future tools, mcp: add a tool, edit prompt and the model just picks it. MCP tools wrap as LangChain tools and append to the tools array. easily extensible.
