```mermaid
flowchart TB
    subgraph ING["🔵 INGESTION · offline · Python container Lambda"]
        direction TB
        PDF[PDF manual] --> MU[PyMuPDF<br/>per-page parse]
        MU --> TX[Text chunks<br/>recursive split 800/100]
        MU --> IM[Images<br/>bytes + bbox, deduped]
        MU --> PR[Page-render fallback<br/>drawings&gt;40 → pixmap PNG]
        IM --> QG{Quality gate}
        PR --> QG
        QG -->|prefilter + Gemini 2.5<br/>classify · caption| EMB
        TX --> EMB[Embed · bge-base-en-v1.5<br/>768-d · L2-normalized]
        EMB --> S3[(S3 · private<br/>index.faiss · vectors.f32<br/>metadata.json · images · PDFs)]
    end

    subgraph QRY["🟢 QUERY · online · Node Lambda"]
        direction TB
        Q[User question] --> QE[Embed · bge-base<br/>same model both sides]
        QE --> COS[Brute-force cosine<br/>JS loop over vectors.f32]
        COS --> TK[Top-k snippets<br/>+ figure captions + image ids]
    end

    S3 -.load to memory.-> COS
    TK --> AG([→ Agent])

    classDef ing fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef qry fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    class PDF,MU,TX,IM,PR,QG,EMB ing
    class Q,QE,COS,TK qry
```

bge-base: embedding model that runs both python (ingest) and node (query).
FAISS and S3: FAISS index is a file in S3, downloaded and searched in memory. we can swap the adaper to opensearch in future. dynamo db not used here beucase it's extra setup which opensearch won't require when we do it. it just becomes an api call. 
dual embed images: caption can be short and vague, page vector is a fallback so figures still on broad queries. currently using the approx first 300-400 tokens of the page text. better idea is to use the nearest text to the image, and if not found then nearest paragraph on 4 sides of the image.
