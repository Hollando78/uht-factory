from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

class Trait(BaseModel):
    """Canonical trait definition"""
    bit: int = Field(..., ge=1, le=32, description="Bit position (1-32)")
    name: str = Field(..., description="Trait name")
    layer: str = Field(..., description="Layer: Physical, Functional, Abstract, or Social")
    short_description: str = Field(..., description="Brief trait description")
    expanded_definition: str = Field(..., description="Detailed trait definition")
    url: Optional[str] = Field(None, description="Reference URL")
    examples: Optional[List[str]] = Field(default_factory=list, description="Example entities")
    anti_examples: Optional[List[str]] = Field(default_factory=list, description="Counter-examples")
    keywords: Optional[List[str]] = Field(default_factory=list, description="Associated keywords")
    
    class Config:
        json_schema_extra = {
            "example": {
                "bit": 1,
                "name": "Physical Object",
                "layer": "Physical",
                "short_description": "A discrete, bounded physical entity",
                "expanded_definition": "A tangible object that has physical boundaries...",
                "url": "https://universalhex.org/traits/1",
                "examples": ["bicycle", "smartphone", "tree"],
                "anti_examples": ["love", "democracy", "software"]
            }
        }

class TraitEvaluation(BaseModel):
    """Result of trait evaluation for an entity"""
    trait_bit: int = Field(..., ge=1, le=32)
    trait_name: str
    applicable: bool = Field(..., description="Whether trait applies (0 or 1)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    justification: str = Field(..., description="Reasoning for the decision")
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)
    llm_model: Optional[str] = Field(None, description="LLM model used for evaluation")

class LayerClassification(BaseModel):
    """Classification for one layer (8 traits)"""
    layer_name: str
    layer_index: int = Field(..., ge=0, le=3)
    traits: List[TraitEvaluation]
    hex_value: str = Field(..., pattern="^[0-9A-F]{2}$", description="2-character hex")
    
class TraitSet(BaseModel):
    """Complete set of 32 traits"""
    version: str = Field(default="2.0")
    traits: List[Trait]
    layers: Dict[str, List[Trait]] = Field(default_factory=dict)
    
    def group_by_layer(self):
        """Group traits by their layer"""
        layers = {}
        for trait in self.traits:
            if trait.layer not in layers:
                layers[trait.layer] = []
            layers[trait.layer].append(trait)
        self.layers = layers
        return self