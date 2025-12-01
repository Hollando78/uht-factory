from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class LLMProvider(str, Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    OPENROUTER = "openrouter"  # Auto-selects best free model
    
class ClassificationStatus(str, Enum):
    """Classification job status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CACHED = "cached"

class TraitPrompt(BaseModel):
    """Prompt template for trait evaluation"""
    trait_bit: int
    trait_name: str
    system_prompt: str
    user_prompt_template: str
    
class ClassificationJob(BaseModel):
    """Async classification job"""
    job_id: str = Field(..., description="Unique job identifier")
    entity_name: str
    status: ClassificationStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
class UHTCode(BaseModel):
    """UHT code representation"""
    hex_code: str = Field(..., pattern="^[0-9A-F]{8}$")
    binary: str = Field(..., pattern="^[01]{32}$")
    layers: Dict[str, str] = Field(..., description="Layer name to hex mapping")
    trait_bits: List[int] = Field(..., description="Active trait bit positions")
    
    @classmethod
    def from_binary(cls, binary_str: str) -> "UHTCode":
        """Create UHTCode from binary string"""
        if len(binary_str) != 32:
            raise ValueError("Binary string must be 32 bits")
        
        hex_code = hex(int(binary_str, 2))[2:].upper().zfill(8)
        
        layers = {
            "Physical": hex_code[0:2],
            "Functional": hex_code[2:4],
            "Abstract": hex_code[4:6],
            "Social": hex_code[6:8]
        }
        
        trait_bits = [i+1 for i, bit in enumerate(binary_str) if bit == '1']
        
        return cls(
            hex_code=hex_code,
            binary=binary_str,
            layers=layers,
            trait_bits=trait_bits
        )
    
    @classmethod
    def from_hex(cls, hex_str: str) -> "UHTCode":
        """Create UHTCode from hex string"""
        if len(hex_str) != 8:
            raise ValueError("Hex string must be 8 characters")
        
        binary = bin(int(hex_str, 16))[2:].zfill(32)
        return cls.from_binary(binary)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation"""
        return {
            "hex": self.hex_code,
            "binary": self.binary,
            "layers": self.layers,
            "active_traits": self.trait_bits,
            "trait_count": len(self.trait_bits)
        }

class ClassificationMetrics(BaseModel):
    """Metrics for classification performance"""
    total_classifications: int = 0
    avg_processing_time_ms: float = 0.0
    cache_hit_rate: float = 0.0
    error_rate: float = 0.0
    models_used: Dict[str, int] = Field(default_factory=dict)
    hourly_stats: List[Dict[str, Any]] = Field(default_factory=list)