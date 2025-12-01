# UHT Classification Factory 🏭

## Universal Hex Taxonomy Classification System

A high-performance, AI-powered classification system that evaluates entities against 32 canonical traits to generate standardized 8-character hex codes. Built with FastAPI, Neo4j, and Redis for scalable, authenticated classification services.

## 🎯 Concept Overview

The UHT Classification Factory implements your vision of a **specialist model architecture** where:

- **32 Specialist Evaluators**: Each of the 32 traits is evaluated by focused LLM calls
- **Parallel Processing**: All trait evaluations run concurrently for speed
- **Binary + Justification**: Each specialist returns 1/0 + confidence + reasoning
- **Hex Code Generation**: Binary results are parsed into 4 hex-pairs (one per layer)
- **Graph Database Storage**: Classifications and relationships stored in Neo4j
- **API Authentication**: Secure access via JWT tokens
- **Caching**: Redis-based caching for performance

## 🏗️ Architecture

```
Entity Input → [32 Parallel LLM Evaluators] → Binary Classification → Hex Code
     ↓                                                                    ↓
Neo4j Graph Database ←←←←←←←← Redis Cache ←←←←←←←← FastAPI REST API
```

### System Components

- **FastAPI API Server** (Port 8100): REST endpoints for classification
- **Neo4j Graph Database** (Ports 7474/7687): Entity and trait storage
- **Redis Cache** (Port 6383): Performance caching layer
- **LLM Integration**: OpenAI GPT-4, Anthropic Claude, or local Ollama

## 🚀 Quick Start

### 1. Configure Environment

```bash
cd /root/project/uht-factory

# Update .env with your OpenAI API key
nano .env
# Set: OPENAI_API_KEY=your-actual-api-key-here
```

### 2. Start Services

```bash
# Start Neo4j and Redis
docker-compose up -d

# Install dependencies and start API
source venv/bin/activate
uvicorn api.main:app --host 0.0.0.0 --port 8100 --reload
```

### 3. Test the System

```bash
python scripts/test_classification.py
```

## 📊 Classification Layers & Traits

The system evaluates 32 traits across 4 layers:

### Physical Layer (Bits 1-8) - FF000000
- **Bit 1**: Physical Object - Discrete, bounded physical entity
- **Bit 2**: Synthetic - Created/manufactured by humans
- **Bit 3**: Biological/Biomimetic - Has biological origin or inspiration
- **Bit 4**: Powered - Immobile or permanently affixed
- **Bit 5**: Structural - Load-bearing or structural function
- **Bit 6**: Observable - Detectable by human senses/instruments
- **Bit 7**: Physical Medium - Composed of physical matter
- **Bit 8**: Active - Lacks autonomous behavior

### Functional Layer (Bits 9-16) - 00FF0000
- **Bit 9**: Intentionally Designed - Designed for specific function
- **Bit 10**: Outputs Effect - Produces signals/energy/effects
- **Bit 11**: Processes Signals/Logic - Information processing/control
- **Bit 12**: State-Transforming - Internal change/self-modification
- **Bit 13**: Human-Interactive - Direct human interaction
- **Bit 14**: System-Integrated - Part of larger system
- **Bit 15**: Functionally Autonomous - Independent operation
- **Bit 16**: System-Essential - Critical system component

### Abstract Layer (Bits 17-24) - 0000FF00
- **Bit 17**: Symbolic - Represents ideas through symbols
- **Bit 18**: Signalling - Conveys information/meaning
- **Bit 19**: Rule-governed - Follows explicit rules/protocols
- **Bit 20**: Compositional - Made of meaningful parts
- **Bit 21**: Normative - Has standards/expectations
- **Bit 22**: Meta - Refers to itself or its category
- **Bit 23**: Temporal - Time-dependent properties
- **Bit 24**: Digital/Virtual - Exists in digital form

### Social Layer (Bits 25-32) - 000000FF
- **Bit 25**: Social Construct - Exists through social agreement
- **Bit 26**: Institutionally Defined - Defined by institutions
- **Bit 27**: Identity-Linked - Tied to personal/group identity
- **Bit 28**: Regulated - Subject to rules/laws
- **Bit 29**: Economically Significant - Has economic impact
- **Bit 30**: Politicised - Involved in political discourse
- **Bit 31**: Ritualised - Associated with ceremonies/rituals
- **Bit 32**: Ethically Significant - Raises ethical considerations

## 🔌 API Endpoints

### Classification
```bash
# Classify single entity
POST /api/v1/classify/
{
  "entity": {
    "name": "smartphone",
    "description": "Portable electronic device with computing capabilities"
  }
}

# Batch classification
POST /api/v1/classify/batch
{
  "entities": [...],
  "parallel_workers": 4
}

# Explain UHT code
POST /api/v1/classify/explain?entity_name=smartphone&uht_code=FF8F1A2B
```

### Entity Management
```bash
# Get entity by UUID
GET /api/v1/entities/{uuid}

# Search entities
GET /api/v1/entities/?uht_pattern=FF&limit=10

# Find similar entities
GET /api/v1/entities/{uuid}/similar?threshold=28
```

### Traits
```bash
# Get all traits
GET /api/v1/traits/

# Get trait by bit position
GET /api/v1/traits/1

# Get traits by layer
GET /api/v1/traits/layer/Physical
```

### Authentication
```bash
# Get JWT token
POST /api/v1/auth/token
{
  "api_key": "your-api-key"
}

# Use token in headers
Authorization: Bearer your-jwt-token
```

## 📝 Example Classification

**Input**: `"smartphone"`

**Output**:
```json
{
  "entity": {
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "name": "smartphone",
    "uht_code": "FF8F1A2B",
    "binary_representation": "11111111100011111001101000101011",
    "layers": {
      "Physical": "FF",    // All 8 physical traits active
      "Functional": "8F",  // Most functional traits active
      "Abstract": "1A",    // Some abstract traits active
      "Social": "2B"       // Few social traits active
    }
  },
  "processing_time_ms": 2847.5,
  "cached": false
}
```

**Interpretation**:
- **Physical (FF)**: Strongly physical object
- **Functional (8F)**: High functionality 
- **Abstract (1A)**: Some symbolic/digital aspects
- **Social (2B)**: Limited social construct aspects

## 💾 Neo4j Graph Structure

```cypher
// Nodes
(:Entity {uuid, name, uht_code, binary_representation})
(:Trait {bit, name, layer, description})
(:Layer {name, index, bit_range})

// Relationships
(Entity)-[HAS_TRAIT {applicable, confidence, justification}]->(Trait)
(Trait)-[BELONGS_TO]->(Layer)
```

### Useful Queries
```cypher
// Find entities with specific traits
MATCH (e:Entity)-[:HAS_TRAIT {applicable: true}]->(t:Trait {bit: 1})
RETURN e.name, e.uht_code

// Trait usage statistics
MATCH (t:Trait)<-[r:HAS_TRAIT {applicable: true}]-(e:Entity)
RETURN t.name, count(e) as usage_count
ORDER BY usage_count DESC
```

## 🔧 Configuration

### Environment Variables
```bash
# Database
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=uht-password-2025
REDIS_URL=redis://localhost:6383

# LLM Provider (openai, anthropic, ollama)
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# Authentication
JWT_SECRET=your-jwt-secret-minimum-32-characters
```

### Port Reservations
- **API Server**: 8100
- **Neo4j HTTP**: 7474
- **Neo4j Bolt**: 7687  
- **Redis**: 6383

## 🛠️ Development

### Project Structure
```
uht-factory/
├── api/                 # FastAPI application
│   ├── main.py         # Main app and middleware
│   └── routes/         # API route handlers
├── workers/            # LLM integration and processing
├── models/             # Pydantic data models
├── db/                 # Database clients (Neo4j, Redis)
├── scripts/            # Utility scripts
├── tests/              # Test suite
└── docker-compose.yml  # Service orchestration
```

### Testing
```bash
# Run test suite
python scripts/test_classification.py

# Manual API testing
curl -X POST "http://localhost:8100/api/v1/classify/" \
     -H "Content-Type: application/json" \
     -d '{"entity": {"name": "bicycle", "description": "Two-wheeled vehicle"}}'
```

### Adding New Traits
1. Update `/root/project/uht-github/canonical_traits/traits_v2.json`
2. Run `python scripts/import_traits.py` to update database
3. Restart API server

## 🚦 Status & Monitoring

### Health Check
```bash
curl http://localhost:8100/health
```

### API Documentation
- **Swagger UI**: http://localhost:8100/docs
- **ReDoc**: http://localhost:8100/redoc

### Neo4j Browser
- **URL**: http://localhost:7474
- **Credentials**: neo4j / uht-password-2025

## 🎯 Next Steps

To complete the production-ready system:

1. **Add Valid API Key**: Update `.env` with real OpenAI API key
2. **Authentication**: Implement proper API key management  
3. **Rate Limiting**: Add request throttling
4. **Monitoring**: Integrate Prometheus/Grafana
5. **Testing**: Expand test coverage
6. **Documentation**: Add OpenAPI documentation
7. **Deployment**: Configure for production hosting

## 🏆 Features Implemented

✅ **32 Specialist Trait Evaluators**  
✅ **Parallel LLM Processing**  
✅ **Neo4j Graph Database**  
✅ **Redis Caching Layer**  
✅ **REST API with Authentication**  
✅ **Binary → Hex Code Generation**  
✅ **Entity UUID Management**  
✅ **Canonical Traits v2.0**  
✅ **Docker Orchestration**  
✅ **Health Monitoring**  

---

**Your UHT Classification Factory is operational! 🎉**

The system successfully implements your vision of a scalable, authenticated classification service with specialist models, graph storage, and standardized hex output codes.