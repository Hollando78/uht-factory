from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

class EntityInput(BaseModel):
    """Input for entity classification"""
    uuid: Optional[str] = Field(None, description="Existing entity UUID (for reclassification)")
    name: str = Field(..., min_length=1, max_length=500, description="Entity name")
    description: Optional[str] = Field(None, max_length=5000, description="Entity description")
    context: Optional[str] = Field(None, max_length=2000, description="Additional context")
    attributes: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom attributes")

    # Wikidata metadata (optional)
    wikidata_qid: Optional[str] = Field(None, pattern="^Q[0-9]+$", description="Wikidata Q-ID")
    wikidata_type: Optional[str] = Field(None, pattern="^Q[0-9]+$", description="Wikidata type Q-ID")
    wikidata_type_label: Optional[str] = Field(None, max_length=200, description="Wikidata type label")
    sitelinks_count: Optional[int] = Field(None, ge=0, description="Wikidata sitelinks count")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "smartphone",
                "description": "A portable electronic device combining phone and computer features",
                "context": "Modern digital communication device",
                "wikidata_qid": "Q22645",
                "wikidata_type": "Q17517",
                "wikidata_type_label": "mobile phone"
            }
        }

class Entity(BaseModel):
    """Complete entity with classification"""
    uuid: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    uht_code: str = Field(..., pattern="^[0-9A-F]{8}$", description="8-character hex code")
    binary_representation: str = Field(..., description="32-bit binary string")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    version: int = Field(default=1, description="Classification version")

    # Classification details
    layer_classifications: List[Dict] = Field(default_factory=list)
    trait_evaluations: List[Dict] = Field(default_factory=list)

    # Metadata
    classification_time_ms: Optional[float] = Field(None, description="Time to classify in ms")
    llm_model_version: Optional[str] = None
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0)

    # Wikidata metadata (optional)
    wikidata_qid: Optional[str] = Field(None, description="Wikidata Q-ID")
    wikidata_type: Optional[str] = Field(None, description="Wikidata type Q-ID")
    wikidata_type_label: Optional[str] = Field(None, description="Wikidata type label")
    sitelinks_count: Optional[int] = Field(None, description="Wikidata sitelinks count")
    
    class Config:
        json_schema_extra = {
            "example": {
                "uuid": "123e4567-e89b-12d3-a456-426614174000",
                "name": "smartphone",
                "uht_code": "FF8F0300",
                "binary_representation": "11111111100011110000001100000000",
                "created_at": "2024-01-01T00:00:00Z"
            }
        }

class ClassificationRequest(BaseModel):
    """Request for entity classification"""
    entity: EntityInput
    use_cache: bool = Field(default=True, description="Use cached classification if available")
    detailed: bool = Field(default=True, description="Include detailed trait evaluations")
    async_mode: bool = Field(default=False, description="Process asynchronously")
    generate_image: bool = Field(default=False, description="Generate AI image after classification")
    generate_embedding: bool = Field(default=False, description="Generate embedding after classification")
    
class ClassificationResponse(BaseModel):
    """Response from classification"""
    entity: Entity
    cached: bool = Field(default=False, description="Whether result was from cache")
    processing_time_ms: float
    llm_model: Optional[str] = Field(None, description="LLM model used for classification")
    
class BatchClassificationRequest(BaseModel):
    """Request for batch classification"""
    entities: List[EntityInput] = Field(..., min_items=1, max_items=100)
    use_cache: bool = Field(default=True)
    parallel_workers: int = Field(default=4, ge=1, le=32)
    
class EntitySearch(BaseModel):
    """Search parameters for entities"""
    uht_code_pattern: Optional[str] = Field(None, description="Hex pattern to match")
    trait_bits: Optional[List[int]] = Field(None, description="Required trait bits")
    layer_filter: Optional[Dict[str, str]] = Field(None, description="Layer hex values")
    name_contains: Optional[str] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)

class EntityPreProcessing(BaseModel):
    """AI-enhanced entity preprocessing result"""
    original_name: str
    suggested_name: str
    suggested_description: str
    additional_context: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str

class DuplicateCheck(BaseModel):
    """Result of duplicate entity checking"""
    exists: bool
    similarity: float = Field(ge=0.0, le=1.0)
    existing_entity: Optional[Dict[str, Any]] = None