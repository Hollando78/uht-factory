import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  Collapse,
  Chip
} from '@mui/material';
import {
  Psychology as AnalyzeIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircle as SharedIcon,
  Cancel as CancelledIcon,
  Star as UniqueIcon
} from '@mui/icons-material';
import type { SelectedEntity } from '../../types';
import { LAYER_COLORS } from '../../utils/uhtUtils';

interface LLMAnalysisCardProps {
  operands: SelectedEntity[];
  computedHex: string;
  isCompact: boolean;
  // Optional: pre-loaded analysis (when loading saved calculation)
  initialAnalysis?: AnalysisResult | null;
  // Optional: callback when analysis changes (for saving)
  onAnalysisChange?: (analysis: AnalysisResult | null) => void;
}

export interface TraitAnalysis {
  bit: number;
  name: string;
  layer: string;
  status: string;
  explanation: string;
}

export interface AnalysisResult {
  shared_traits: TraitAnalysis[];
  cancelled_traits: TraitAnalysis[];
  unique_traits: TraitAnalysis[];
  overall_interpretation: string;
}

export default function LLMAnalysisCard({
  operands,
  computedHex,
  isCompact,
  initialAnalysis,
  onAnalysisChange
}: LLMAnalysisCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(initialAnalysis || null);
  const [expandedSection, setExpandedSection] = useState<string | null>('shared');

  // Update analysis when initialAnalysis prop changes (e.g., when loading a saved calculation)
  // Always update, including setting to null to clear previous analysis
  useEffect(() => {
    setAnalysis(initialAnalysis ?? null);
  }, [initialAnalysis]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/hex-calc/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hex_code: computedHex,
          source_entity_uuids: operands.map(o => o.uuid)
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data);
      onAnalysisChange?.(data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze calculation');
    } finally {
      setLoading(false);
    }
  }, [computedHex, operands, onAnalysisChange]);

  const getLayerColor = (layer: string): string => {
    return LAYER_COLORS[layer as keyof typeof LAYER_COLORS] || '#666';
  };

  const renderTraitList = (traits: TraitAnalysis[], icon: React.ReactNode, color: string) => {
    if (traits.length === 0) return null;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {traits.map((trait) => (
          <Box
            key={trait.bit}
            sx={{
              p: 1.5,
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: 1,
              borderLeft: `3px solid ${getLayerColor(trait.layer)}`
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              {icon}
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                Bit {trait.bit}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color }}>
                {trait.name}
              </Typography>
              <Chip
                label={trait.layer}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  backgroundColor: `${getLayerColor(trait.layer)}20`,
                  color: getLayerColor(trait.layer)
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 3 }}>
              {trait.explanation}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Card>
      <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AnalyzeIcon sx={{ fontSize: 20, color: 'primary.main' }} />
            <Typography variant="subtitle2" color="text.secondary">
              LLM Analysis
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={runAnalysis}
            disabled={loading || operands.length < 2}
            startIcon={loading ? <CircularProgress size={14} /> : <AnalyzeIcon />}
          >
            {analysis ? 'Re-analyze' : 'Analyze'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {!analysis && !loading && (
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block' }}>
            Click "Analyze" for AI-powered explanations of why traits are shared, cancelled, or unique
          </Typography>
        )}

        {analysis && (
          <Box>
            {/* Overall Interpretation */}
            <Box
              sx={{
                p: 2,
                mb: 2,
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                borderRadius: 1,
                border: '1px solid rgba(0, 229, 255, 0.2)'
              }}
            >
              <Typography variant="caption" color="primary" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
                Overall Interpretation
              </Typography>
              <Typography variant="body2">
                {analysis.overall_interpretation}
              </Typography>
            </Box>

            {/* Shared Traits Section */}
            {analysis.shared_traits.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    mb: 1
                  }}
                  onClick={() => setExpandedSection(expandedSection === 'shared' ? null : 'shared')}
                >
                  <SharedIcon sx={{ fontSize: 16, color: '#4CAF50' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#4CAF50' }}>
                    Shared Traits ({analysis.shared_traits.length})
                  </Typography>
                  {expandedSection === 'shared' ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                </Box>
                <Collapse in={expandedSection === 'shared'}>
                  {renderTraitList(
                    analysis.shared_traits,
                    <SharedIcon sx={{ fontSize: 12, color: '#4CAF50' }} />,
                    '#4CAF50'
                  )}
                </Collapse>
              </Box>
            )}

            {/* Cancelled Traits Section - traits shared by entities that XOR'd out */}
            {analysis.cancelled_traits.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    mb: 1
                  }}
                  onClick={() => setExpandedSection(expandedSection === 'cancelled' ? null : 'cancelled')}
                >
                  <CancelledIcon sx={{ fontSize: 16, color: '#FF9800' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: '#FF9800' }}>
                    Common Traits - XOR'd Out ({analysis.cancelled_traits.length})
                  </Typography>
                  {expandedSection === 'cancelled' ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, pl: 3, fontSize: '0.65rem' }}>
                  Traits shared by entities (cancelled because even count)
                </Typography>
                <Collapse in={expandedSection === 'cancelled'}>
                  {renderTraitList(
                    analysis.cancelled_traits,
                    <CancelledIcon sx={{ fontSize: 12, color: '#FF9800' }} />,
                    '#FF9800'
                  )}
                </Collapse>
              </Box>
            )}

            {/* Unique Traits Section - differentiating traits */}
            <Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: analysis.unique_traits.length > 0 ? 'pointer' : 'default',
                  mb: 1
                }}
                onClick={() => analysis.unique_traits.length > 0 && setExpandedSection(expandedSection === 'unique' ? null : 'unique')}
              >
                <UniqueIcon sx={{ fontSize: 16, color: '#2196F3' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#2196F3' }}>
                  Differentiating Traits ({analysis.unique_traits.length})
                </Typography>
                {analysis.unique_traits.length > 0 && (
                  expandedSection === 'unique' ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, pl: 3, fontSize: '0.65rem' }}>
                Traits unique to some entities (remain in XOR result)
              </Typography>
              {analysis.unique_traits.length > 0 ? (
                <Collapse in={expandedSection === 'unique'}>
                  {renderTraitList(
                    analysis.unique_traits,
                    <UniqueIcon sx={{ fontSize: 12, color: '#2196F3' }} />,
                    '#2196F3'
                  )}
                </Collapse>
              ) : (
                <Typography variant="caption" color="text.disabled" sx={{ pl: 3, fontStyle: 'italic' }}>
                  No differentiating traits - entities share all their active traits
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
