# UHT Dataset Report: State of the Taxonomy v2

**Date**: December 2025
**Version**: UHT v2 (Canonical Traits)
**Dataset Size**: ~10,500 entities

---

## Executive Summary

The Universal Hex Taxonomy (UHT) is a 32-bit classification system that encodes entities across four semantic layers: Physical, Functional, Abstract, and Social. This report examines the current v2 dataset (~10,500 entities), analyzes classification patterns, and evaluates UHT's potential role in AI systems.

---

## 1. Methodology

### 1.1 Source Acquisition

Entities were acquired from two primary sources:

**Wikidata Extraction** (~9,500 entities)
- Sampled from Wikidata's SPARQL endpoint across diverse type categories
- Selection criteria: entities with English labels, descriptions, and >1 Wikipedia sitelink
- Metadata preserved: Q-ID, type classification, sitelink count (prominence proxy)
- Pre-processing: name sanitization, description normalization, duplicate filtering

**Manual Curation** (~1,000 entities)
- Hand-selected core concepts: materials, substances, abstract concepts
- Purpose: establish baseline classifications for common reference entities
- Quality: carefully crafted descriptions to minimize classification ambiguity

### 1.2 Classification Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Entity    │    │     LLM     │    │   Bitmask   │    │    Graph    │
│   Input     │───▶│  Evaluation │───▶│  Generation │───▶│   Storage   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                   │                  │                  │
  name, desc         32 parallel        applicability      Entity node
  context            trait prompts      → binary → hex     + HAS_TRAIT
                     confidence +                          relationships
                     justification                         in Neo4j
```

Each entity undergoes a 32-trait evaluation:

1. **Prompt Construction**: Entity name + description + context provided to LLM
2. **Parallel Evaluation**: All 32 traits evaluated in parallel API calls
3. **Per-Trait Output**:
   - `applicable`: boolean (trait applies or not)
   - `confidence`: 0.0-1.0 score
   - `justification`: brief reasoning (≤100 words)
4. **Code Generation**: Binary string from trait applicability → 8-char hex code
5. **Storage**: Entity + all trait evaluations persisted to Neo4j graph

**Model Configuration**:
- Primary: GPT-4o-mini (OpenAI) via OpenRouter
- Temperature: 0.3 (deterministic bias)
- Fallback: Free models (Llama 3.2, Gemma 2) for rate-limit handling

### 1.3 Confidence Scoring

Confidence reflects LLM certainty per trait:
- **1.0**: Clear applicability (e.g., "hammer" → Physical Object)
- **0.7-0.9**: Reasonable certainty with minor ambiguity
- **<0.7**: Edge cases requiring potential review

Confidence is captured but not currently used for filtering; the binary `applicable` decision stands.

### 1.4 Example Trait Justification

For entity **"Nuclear Power Plant"**, sample trait evaluations:

| Trait | Applicable | Confidence | Justification |
|-------|------------|------------|---------------|
| Physical Object | true | 1.0 | A nuclear power plant is a discrete, bounded physical facility occupying defined geographic space. |
| Regulated | true | 1.0 | Nuclear facilities are subject to extensive government regulation, safety standards, and licensing requirements under nuclear regulatory bodies. |
| System-Essential | true | 0.95 | Power plants are critical infrastructure; their failure causes significant grid degradation and societal impact. |
| Ritualised | false | 0.98 | Nuclear power plants have no ceremonial, traditional, or ritual significance. |

### 1.5 Human Spot-Check Technique

Quality validation employed:
- Random sampling of 50 entities across UHT code clusters
- Manual review of trait justifications for logical consistency
- Cross-reference with Wikidata type labels for gross errors
- Anomaly flagging for entities with <3 or >18 applicable traits

No systematic ground-truth labeling was performed; this remains a limitation.

---

## 2. Dataset Overview

### 2.1 Scale & Composition

| Metric | Value |
|--------|-------|
| Total Entities | ~10,500 |
| Wikidata-sourced | ~9,500 (90%) |
| Manually Curated | ~1,000 (10%) |
| Classification Success Rate | ~99% (n=10,474) |
| Unique UHT Codes | ~1,000 |
| Avg Traits per Entity | 9.8 |

### 2.2 Sample UHT Code Decode

**Entity**: Smartphone
**UHT Code**: `D6FE701D`

```
Code:    D    6    F    E    7    0    1    D
Binary:  1101 0110 1111 1110 0111 0000 0001 1101
         └─Physical─┘ └Functional┘ └Abstract─┘ └─Social──┘

Physical (D6):   Physical Object, Synthetic, Powered, Observable,
                 Physical Medium

Functional (FE): Intentionally Designed, Outputs Effect, Processes Signals,
                 State-Transforming, Human-Interactive, System-integrated,
                 Functionally Autonomous

Abstract (70):   Signalling, Rule-governed, Compositional

Social (1D):     Regulated, Economically Significant, Politicised,
                 Ethically Significant
```

### 2.3 Trait Frequency Distribution

```
Trait Frequency Histogram (% of entities with trait applicable)

Observable        ████████████████████████████████████████  81%
Physical Medium   ████████████████████████████████████      73%
Regulated         ██████████████████████████████████        67%
Compositional     ████████████████████████████████          63%
Outputs Effect    ████████████████████████████████          62%
Synthetic         ██████████████████████████████            58%
Inst. Defined     ████████████████████████████              56%
Physical Object   ██████████████████████████                53%
Active            ██████████████████████████                50%
Int. Designed     ████████████████████████                  46%
Temporal          ██████████████████████                    43%
State-Transform   ████████████████████                      42%
Social Construct  ████████████████████                      40%
Econ. Significant ███████████████████                       38%
Human-Interactive ███████████████████                       34%
Signalling        ████████████████                          30%
Identity-Linked   ███████████████                           28%
Symbolic          ██████████████                            26%
Rule-governed     █████████████                             24%
Normative         ███████████                               22%
Politicised       ██████████                                19%
Func. Autonomous  █████████                                 17%
Ethically Signif. ████████                                  15%
Powered           ███████                                   13%
System-integrated ██████                                    11%
Biological        █████                                     10%
Ritualised        ███                                        5%
Digital/Virtual   ███                                        5%
System-Essential  ██                                         3%
Structural        █                                          2%
Meta              ▏                                         <1%
```

### 2.4 Layer Balance

| Layer | Share of Total Trait Usage |
|-------|---------------------------|
| Physical | 26% |
| Abstract | 27% |
| Social | 25% |
| Functional | 22% |

Layers are balanced within 5 percentage points, validating the 4-layer design.

### 2.5 Classification Confidence

| Confidence Band | % of Classifications |
|-----------------|---------------------|
| 1.0 (perfect) | ~95% |
| 0.9-0.99 | ~5% |
| <0.9 | <1% |

Physical layer traits show highest confidence (avg 0.98). Social layer shows more variance (avg 0.90), possibly due to subjective/cultural interpretation.

---

## 3. Emergent Patterns

### 3.1 Meta-Class Detection Method

Meta-classes are identified through frequency-based clustering of hex pair values per layer:

**Detection Process**:
1. Extract per-layer hex values (e.g., Physical = "C7", Functional = "50")
2. Count occurrence frequency across all entities
3. Apply threshold: hex pairs appearing in ≥3% of entities qualify as meta-classes
4. Generate archetype names via LLM based on active trait combinations

**Result**: 27 meta-classes identified across four layers (8 Physical, 8 Functional, 8 Abstract, 10 Social).

**Top Patterns by Frequency**:
| Rank | Pattern | Hex | Frequency | Description |
|------|---------|-----|-----------|-------------|
| 1 | Regulated Industrial Machine | C7501250 | 15% | Observable, active, synthetic physical objects with outputs and regulation |
| 2 | Regulated Active Device | C7501210 | 3% | Similar but without economic significance |
| 3 | Interactive Industrial System | C7D01250 | 2% | Adds human-interactive and system-integrated traits |

### 3.2 Cross-Layer Correlations

```
Trait Co-occurrence Heatmap (selected pairs)

                    Observable  Compositional  Regulated  Outputs Effect
Observable              -           77%          54%          61%
Compositional          77%           -           48%          55%
Regulated              54%          48%           -           45%
Outputs Effect         61%          55%          45%           -
Meta                    2%           3%           1%           1%
```

**Key Correlations**:
| Pattern | Correlation | Interpretation |
|---------|-------------|----------------|
| Observable → Compositional | 77% | Visibility correlates with structural complexity |
| Outputs Effect → Regulated | 45% | Effect-producing entities attract regulation |
| Meta + Physical | ~0% | Self-referential concepts lack physical form |

### 3.3 Distribution Edges

- **Minimal entities** (≤3 traits): ~540 entities — primitives or underspecified
- **Maximal entities** (≥18 traits): ~180 entities — ontological "hubs" (e.g., Government, Jury)
- **Zero Physical traits**: 16% of dataset — substantial "idea space"

---

## 4. v1 → v2 Changes

| Bit | v1 Name | v2 Name | Rationale |
|-----|---------|---------|-----------|
| 4 | Fixed/static | Powered | Mobility is less fundamental than energy dependency. A "static" battery is still powered; a mobile cart may not be. |
| 8 | Passive | Active | Defining by capability (exhibits autonomous behavior) rather than absence (lacks behavior). Reduces double-negatives in classification. |
| 29 | Teachable | Economically Significant | "Teachable" conflated skill transfer with entities. New definition captures entities with measurable economic value, cost, or market role. |
| 30 | Visible | Politicised | "Visible" overlapped with Observable. New definition captures entities subject to political discourse, contestation, or governance debates. |
| 31 | Context-sensitive | Ritualised | Original was too abstract. New definition specifically captures ceremonial, traditional, or ritual significance—clearer classification boundary. |
| 32 | Widely known | Ethically Significant | "Widely known" was popularity, not ontology. New definition captures entities raising ethical questions or moral implications. |

### v3 Candidates for Review

- **Meta (0.3%)**: Definition may be too narrow — consider expanding to include representational or modeling entities
- **Structural (2%)**: Limited to load-bearing — could expand to include any entity with internal organizational structure
- **Digital/Virtual (5%)**: Growing importance — may warrant prominence or clearer boundary with Physical Medium
- **Social layer confidence variance**: Definitions may need tightening for more consistent LLM interpretation

---

## 5. SWOT Analysis

### Strengths
- **Compact representation**: 32 bits encode meaningful distinctions
- **Human interpretability**: Each bit maps to a named property
- **Fast comparison**: Hamming distance enables O(1) similarity
- **LLM-agnostic**: Works across GPT, Claude, Llama, etc.
- **Graph-native**: Neo4j enables relationship queries beyond key-value
- **Emergent patterns**: Meta-classes arise without explicit design

### Weaknesses
- **Fixed ceiling**: Cannot add traits without breaking compatibility
- **Binary limitation**: No gradation (trait is 0 or 1)
- **LLM dependency**: Quality varies by model and prompt
- **Social layer variance**: Lower confidence than Physical layer
- **Rare trait underuse**: Several traits below 5% occurrence
- **No ground truth**: Human validation is spot-check only

### Opportunities
- **Scale to millions**: Wikidata has 100M+ items
- **Cross-lingual**: Apply to non-English knowledge bases
- **Embedding hybrid**: Combine UHT with neural embeddings
- **Domain extensions**: Medical, Legal, Scientific taxonomies
- **Temporal tracking**: Version classifications over time

### Threats
- **LLM pricing changes**: Cost model depends on API stability
- **Ontology drift**: Concepts evolve faster than static traits
- **Competing standards**: Other taxonomies may gain adoption
- **Model hallucination**: Confident misclassifications

---

## 6. Applications

### Currently Implemented
| Application | Status |
|-------------|--------|
| Classification API | Live |
| Semantic search by trait pattern | Live |
| Hamming distance similarity | Live |
| Trait analytics dashboard | Live |
| 3D knowledge graph visualization | Live |

### Buildable Now
- Browser extension showing UHT codes on Wikipedia
- Semantic diff tool ("How does X differ from Y?")
- Entity recommender based on code clusters
- Cross-ontology alignment (UHT ↔ DBpedia ↔ ConceptNet)

### Requires Research
- Multi-modal UHT (images → codes)
- Semantic query language over trait patterns
- Anomaly detection for misclassifications
- Domain-specific trait extensions

---

## 7. UHT and AI Systems

### 7.1 Why UHT Matters

Modern AI faces a grounding problem: neural systems excel at pattern recognition but lack structured symbolic reasoning. Knowledge graphs provide structure but are expensive to maintain and brittle to query.

UHT offers a middle path:
- **Symbolic structure** via 32 named traits
- **Neural classification** via LLM-based assignment
- **Interpretability** via human-readable bit meanings

This isn't a replacement for embeddings—it's a complement that adds categorical structure.

### 7.2 Where UHT Fits

**Retrieval Augmentation (RAG)**
- Use UHT codes to pre-filter candidate documents
- "Find documents about entities with Physical + Active traits"
- Reduces embedding search space

**Reasoning Scaffolds**
- Ground LLM reasoning in trait-based categories
- "This entity is Regulated + Outputs Effect, therefore..."
- Provides auditable decision traces

**World Model Component**
- UHT as categorical backbone for entity knowledge
- Not geometry (embeddings handle that) but taxonomy

### 7.3 Limitations

- **Not a reasoning engine**: UHT classifies, it doesn't infer
- **Not fine-grained**: 32 bits cannot capture all distinctions
- **Not verified**: Classifications lack formal ground truth
- **Not multi-modal**: Currently text-only

UHT is a tool, not a solution. Its value depends on integration with other AI components.

---

## 8. Limitations & Future Risks

### 8.1 Dataset Bias

| Bias | Description | Mitigation |
|------|-------------|------------|
| **Language** | English-only entity descriptions and trait definitions | Extend to multilingual sources; validate definitions cross-culturally |
| **Source** | 90% Wikidata — reflects Wikipedia's coverage gaps | Incorporate DBpedia, ConceptNet, domain-specific ontologies |
| **Type distribution** | Wikidata over-represents notable entities (people, places, media) | Stratified sampling by Wikidata type; synthetic entity generation |

### 8.2 Model Dependence

- Classification quality varies by LLM (GPT-4o-mini vs Llama 3.2)
- No inter-rater reliability measured across models
- Temperature and prompt sensitivity not fully characterized

### 8.3 Structural Limitations

| Limitation | Impact |
|------------|--------|
| **Binary traits** | Cannot express "somewhat Physical" — all-or-nothing |
| **No temporal modeling** | Entity classifications are point-in-time snapshots; no version history |
| **No multi-modality** | Text descriptions only; cannot classify images/audio directly |
| **Fixed 32-bit schema** | Adding traits requires breaking change |
| **No hierarchical traits** | All 32 traits are flat; no sub-trait specialization |

### 8.4 Validation Gap

- No formal ground truth dataset
- Human validation is random spot-check, not exhaustive
- Classification errors may propagate undetected
- Low-confidence classifications not systematically reviewed

---

## 9. Recommendations

### For v3 Traits
1. Review underused traits (Meta, Structural) for definition broadening
2. Consider sub-trait extensions (non-breaking metadata layer)
3. Tighten Social layer definitions to reduce confidence variance
4. Publish trait decision trees to reduce LLM interpretation variance

### For Dataset Growth
1. Scale to 100K+ entities for statistical robustness
2. Diversify beyond Wikidata (DBpedia, ConceptNet, domain sources)
3. Implement human validation pipeline for low-confidence cases
4. Add temporal versioning to track classification drift

### For AI Integration
1. Build UHT-filtered RAG prototype
2. Train embeddings that respect UHT structure
3. Publish methodology for external validation
4. Measure inter-model reliability across LLM providers

---

## 10. Conclusion

UHT v2 provides a working semantic classification system with ~10,500 classified entities and ~99% success rate. The 4-layer design shows balanced usage, and emergent meta-classes validate the trait selection.

The system has clear limitations: a fixed 32-bit ceiling, binary trait values, LLM-dependent quality, and English-only scope. These are acceptable trade-offs for interpretability and compactness—but should be addressed as the system scales.

The path forward involves scale (more entities), integration (AI system components), validation (ground truth), and refinement (v3 traits). UHT won't solve AI's grounding problem alone, but it provides a structured interface between neural pattern matching and symbolic reasoning.

---

*Report generated from UHT Factory analysis, December 2025*
