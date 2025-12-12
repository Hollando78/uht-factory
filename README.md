# UHT Classification Factory

A full-stack application for classifying entities using the Universal Hex Taxonomy (UHT) - a 32-bit classification system that encodes entity characteristics across Physical, Functional, Abstract, and Social layers into 8-character hex codes.

**Live Demo**: [factory.universalhex.org](https://factory.universalhex.org)

## Features

### Entity Classification
- **AI-Powered Classification**: 32 specialist LLM evaluators assess entities in parallel
- **Hex Code Generation**: Results encoded as 8-character hex codes (e.g., `FF8F1A2B`)
- **Confidence Scoring**: Each trait evaluation includes confidence and reasoning
- **Batch Processing**: Classify multiple entities concurrently

### Image Gallery
- **AI-Generated Images**: Automatic image generation for classified entities
- **Infinite Scroll**: Browse 2,500+ entity images with lazy loading
- **Multiple Sort Options**: Newest, most views, name, UHT code, random
- **Layer Filtering**: Filter by dominant layer (Physical, Functional, Abstract, Social)
- **Semantic Search**: AI-powered natural language search across entities
- **Text Search**: Fast keyword search on names and descriptions

### Hex Calculator
- **Bitwise Operations**: XOR, AND, OR, and ONE_HOT (DIFF) operations on UHT codes
- **Drag & Drop**: Select entities from gallery or collections
- **LLM Analysis**: AI explains the meaning of computed trait combinations
- **Name Generation**: Generate creative names for computed results
- **Database Matching**: Find existing entities matching computed codes
- **Save Calculations**: Persist and reload complex calculations

### Collections
- **Custom Collections**: Organize entities into named collections
- **Drag & Drop Management**: Easy entity organization
- **Public/Private**: Control collection visibility
- **Export**: Download collection data

### Entity Details
- **Trait Breakdown**: Visual display of all 32 traits with confidence
- **Layer Analysis**: Per-layer hex values and bit counts
- **Wikidata Integration**: Links to Wikipedia/Wikidata for known entities
- **Similar Entities**: Find entities with similar UHT codes
- **View Tracking**: Track entity popularity

### Comparison Tool
- **Side-by-Side**: Compare two entities trait by trait
- **Visual Diff**: Highlight shared and unique traits
- **Hamming Distance**: Quantify similarity between codes

### Build-a-Code
- **Pattern Search**: Find entities matching specific bit patterns
- **Binary Editor**: Manually construct UHT codes
- **Wildcard Support**: Search with partial patterns (X for any bit)

### User System
- **JWT Authentication**: Secure token-based auth with auto-refresh
- **User Registration**: Email verification flow
- **Personal Collections**: Users own their collections
- **API Key Management**: Generate keys for programmatic access

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Material-UI (MUI)** component library
- **Vite** build tool
- **React Router** for navigation

### Backend
- **FastAPI** (Python) REST API
- **Neo4j** graph database for entities and relationships
- **Redis** for caching and rate limiting
- **OpenAI/Anthropic** LLM integration

### Infrastructure
- **Docker Compose** for service orchestration
- **Nginx** reverse proxy with SSL
- **PM2** process management

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Python 3.11+
- Node.js 18+
- OpenAI or Anthropic API key

### 1. Clone and Configure

```bash
git clone https://github.com/Hollando78/uht-factory.git
cd uht-factory

# Copy and edit environment file
cp .env.example .env
# Set your API keys and secrets in .env
```

### 2. Start Services

```bash
# Start Neo4j and Redis
docker-compose up -d

# Backend
source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8100 --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### 3. Access the App

- **Frontend**: http://localhost:5173
- **API Docs**: http://localhost:8100/docs
- **Neo4j Browser**: http://localhost:7474

## Project Structure

```
uht-factory/
├── api/                    # FastAPI backend
│   ├── main.py            # App initialization, middleware
│   ├── routes/            # API endpoints
│   │   ├── classification.py  # Entity classification
│   │   ├── entities.py        # Entity CRUD
│   │   ├── images.py          # Gallery and image generation
│   │   ├── hex_calc.py        # Hex calculator operations
│   │   ├── collections.py     # User collections
│   │   ├── users.py           # Authentication
│   │   └── embeddings.py      # Semantic search
│   └── middleware/        # Auth, rate limiting
├── frontend/              # React application
│   └── src/
│       ├── components/    # UI components
│       │   ├── Gallery/       # Image gallery
│       │   ├── HexCalc/       # Hex calculator
│       │   ├── Entity/        # Entity details
│       │   ├── Collections/   # Collection management
│       │   ├── Comparison/    # Entity comparison
│       │   └── BuildACode/    # Pattern builder
│       ├── context/       # React context (auth, mobile)
│       ├── services/      # API client
│       └── utils/         # UHT utilities
├── workers/               # Background processing
│   └── llm_client.py     # LLM integration
├── db/                    # Database clients
│   ├── neo4j_client.py   # Neo4j async client
│   └── redis_client.py   # Redis caching
├── models/                # Pydantic models
└── docker-compose.yml     # Service orchestration
```

## UHT Classification System

### The 32 Traits

Entities are evaluated against 32 binary traits organized into 4 layers:

| Layer | Bits | Hex Position | Focus |
|-------|------|--------------|-------|
| Physical | 1-8 | `XX------` | Material properties |
| Functional | 9-16 | `--XX----` | Capabilities and behaviors |
| Abstract | 17-24 | `----XX--` | Symbolic and conceptual |
| Social | 25-32 | `------XX` | Social and cultural |

### Example Classifications

| Entity | UHT Code | Interpretation |
|--------|----------|----------------|
| Smartphone | `FF8F1A2B` | Highly physical, functional, some abstract/social |
| Democracy | `00001AFF` | Purely abstract and social construct |
| Human | `FFB71AFF` | Full physical, functional, abstract, and social |

### Bitwise Operations

- **XOR**: Find traits that differ between entities
- **AND**: Find traits shared by ALL entities
- **OR**: Find traits present in ANY entity
- **ONE_HOT (DIFF)**: Find traits unique to exactly ONE entity

## API Reference

### Classification
```bash
POST /api/v1/classification/classify
POST /api/v1/classification/batch
GET  /api/v1/classification/explain/{uuid}
```

### Entities
```bash
GET  /api/v1/entities/{uuid}
GET  /api/v1/entities/search?q=query
GET  /api/v1/entities/{uuid}/similar
```

### Gallery
```bash
GET  /api/v1/images/gallery?sort_by=newest&limit=50
POST /api/v1/images/generate/{uuid}
```

### Hex Calculator
```bash
POST /api/v1/hex-calc/analyze
POST /api/v1/hex-calc/name
GET  /api/v1/hex-calc/match/{hex_code}
```

### Collections
```bash
GET  /api/v1/collections/
POST /api/v1/collections/
POST /api/v1/collections/{id}/entities
```

### Authentication
```bash
POST /api/v1/users/register
POST /api/v1/users/login
POST /api/v1/users/refresh
```

Full API documentation available at `/docs` when running the server.

## Environment Variables

```bash
# Database
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
REDIS_URL=redis://localhost:6383

# LLM Provider
LLM_PROVIDER=openai  # or anthropic
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Authentication
JWT_SECRET=your-secret-minimum-32-characters
REFRESH_SECRET=your-refresh-secret
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Image Generation
FAL_KEY=your-fal-key  # For image generation
```

## Development

### Running Tests
```bash
# Backend
pytest

# Frontend
cd frontend && npm test
```

### Type Checking
```bash
# Frontend
cd frontend && npx tsc --noEmit
```

### Building for Production
```bash
# Frontend
cd frontend && npm run build

# The build output goes to frontend/dist
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

Built with Claude Code
