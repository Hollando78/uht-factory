import { useState, memo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
  Tooltip,
  IconButton
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  ExpandMore as ExpandMoreIcon,
  Psychology as BrainIcon,
  AutoAwesome as AutoIcon,
  CheckCircle as CheckIcon,
  Hub as EmbeddingIcon,
  Image as ImageIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { useApp } from '../../context/AppContext';
import { useMobile } from '../../context/MobileContext';
import API from '../../services/api';
import SEO from '../common/SEO';
import type { UHTEntity, EntityPreProcessing, DuplicateCheck } from '../../types/index';

export default function ClassificationView() {
  const { state, actions } = useApp();
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;

  const [entityInput, setEntityInput] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [preProcessing, setPreProcessing] = useState<EntityPreProcessing | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheck | null>(null);
  const [generateImage, setGenerateImage] = useState(true);
  const [generateEmbedding, setGenerateEmbedding] = useState(true);
  const [classificationResult, setClassificationResult] = useState<UHTEntity | null>(null);

  // Manual pre-process when user clicks button
  const handlePreProcess = async () => {
    if (entityInput.length < 3) {
      actions.setError('Please enter at least 3 characters');
      return;
    }
    
    try {
      actions.setLoading({ preprocess: true });
      const [preprocessResult, duplicateResult] = await Promise.all([
        API.preprocess.preprocessEntity(entityInput),
        API.preprocess.checkDuplicate(entityInput)
      ]);
      setPreProcessing(preprocessResult);
      setDuplicateCheck(duplicateResult);
    } catch (error) {
      console.error('Pre-processing failed:', error);
      actions.setError('Pre-processing failed');
    } finally {
      actions.setLoading({ preprocess: false });
    }
  };

  // Apply pre-processing suggestions
  const applySuggestions = () => {
    if (!preProcessing) return;
    setEntityInput(preProcessing.suggested_name);
    setDescription(preProcessing.suggested_description);
    setContext(preProcessing.additional_context);
  };

  // Classify entity
  const handleClassify = async () => {
    if (!entityInput.trim()) {
      actions.setError('Please enter an entity name');
      return;
    }

    try {
      actions.setLoading({ classification: true });
      actions.clearError();

      const request = {
        entity: {
          name: entityInput.trim(),
          description: description.trim() || undefined,
          context: context.trim() || undefined
        },
        use_cache: false,
        detailed: true,
        generate_image: generateImage,
        generate_embedding: generateEmbedding
      };

      const response = await API.classification.classifyEntity(request);
      const entity = (response as any).entity || (response as any).data || response;
      
      setClassificationResult(entity);
      actions.setSelectedEntity(entity);
      actions.addEntityToGraph(entity);

      // Show success message
      actions.setError(undefined);
      
    } catch (error: any) {
      console.error('Classification failed:', error);
      actions.setError(error.response?.data?.detail || 'Classification failed');
    } finally {
      actions.setLoading({ classification: false });
    }
  };

  return (
    <>
      <SEO
        title="AI Entity Classification"
        description="Classify any concept, object, or idea using the Universal Hex Taxonomy. Our AI analyzes 32 fundamental traits to generate a unique 8-character hex code for any entity."
        image="https://factory.universalhex.org/og-classify.png"
        url="https://factory.universalhex.org/classify"
      />
      <Box sx={{ height: '100%', overflow: 'auto', p: isCompact ? 1.5 : 3 }}>
        <Grid container spacing={isCompact ? 2 : 3}>
          {/* Input Panel */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: isCompact ? 2 : 3 }}>
              <Typography
                variant={isCompact ? 'subtitle1' : 'h6'}
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', fontWeight: 600 }}
              >
                <BrainIcon sx={{ mr: 1, color: 'primary.main', fontSize: isCompact ? 20 : 24 }} />
                {isCompact ? 'Classification' : 'Entity Classification'}
              </Typography>

              {/* Entity Input */}
              <TextField
                fullWidth
                label="Entity Name"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                placeholder="e.g., smartphone, democracy..."
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    minHeight: isCompact ? 48 : 'auto'
                  }
                }}
              />

              {/* Pre-process Button */}
              <Button
                fullWidth
                variant="outlined"
                onClick={handlePreProcess}
                disabled={entityInput.length < 3 || state.loading.preprocess}
                sx={{ mb: 2, minHeight: isCompact ? 48 : 42 }}
                startIcon={state.loading.preprocess ? <CircularProgress size={20} /> : <AutoIcon />}
              >
                {state.loading.preprocess ? 'Analyzing...' : (isCompact ? 'AI Enhance' : 'AI Enhancement & Duplicate Check')}
              </Button>

              {/* Pre-processing Results */}
              {preProcessing && (
                <Paper sx={{ p: isCompact ? 1.5 : 2, mb: 2, bgcolor: 'rgba(0, 229, 255, 0.05)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                    <AutoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="subtitle2" color="primary" sx={{ flex: 1 }}>
                      {isCompact ? 'Suggestions' : 'AI Enhancement Suggestions'}
                    </Typography>
                    <Chip
                      label={`${Math.round(preProcessing.confidence * 100)}%`}
                      size="small"
                      color="primary"
                    />
                  </Box>

                  {preProcessing.suggested_name !== entityInput && (
                    <Alert severity="info" sx={{ mb: 1, py: 0, fontSize: isCompact ? '0.8rem' : '0.875rem' }}>
                      <strong>Suggested:</strong> {preProcessing.suggested_name}
                    </Alert>
                  )}

                  <Button
                    size="small"
                    variant="outlined"
                    onClick={applySuggestions}
                    sx={{ mt: 1, minHeight: isCompact ? 40 : 32 }}
                  >
                    Apply Suggestions
                  </Button>
                </Paper>
              )}

              {/* Duplicate Check */}
              {duplicateCheck && duplicateCheck.exists && (
                <Alert severity="warning" sx={{ mb: 2, fontSize: isCompact ? '0.8rem' : '0.875rem' }}>
                  <strong>Similar found:</strong> {duplicateCheck.existing_entity?.name}
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {duplicateCheck.existing_entity?.uht_code}
                  </Typography>
                </Alert>
              )}

              {/* Additional Fields */}
              <TextField
                fullWidth
                label="Description (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                minRows={isCompact ? 2 : 3}
                placeholder="Detailed description..."
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label="Context (Optional)"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                multiline
                minRows={1}
                placeholder="Additional context..."
                sx={{ mb: 2 }}
              />

              {/* Options */}
              <Box sx={{ mb: 2, display: 'flex', flexDirection: isCompact ? 'column' : 'row', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={generateImage}
                      onChange={(e) => setGenerateImage(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={<Typography variant="body2">Generate Image</Typography>}
                  sx={{ minHeight: isCompact ? 44 : 'auto' }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={generateEmbedding}
                      onChange={(e) => setGenerateEmbedding(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={<Typography variant="body2">Embeddings</Typography>}
                  sx={{ minHeight: isCompact ? 44 : 'auto' }}
                />
              </Box>

              {/* Classify Button */}
              <Button
                fullWidth
                variant="contained"
                onClick={handleClassify}
                disabled={!entityInput.trim() || state.loading.classification}
                sx={{ minHeight: isCompact ? 52 : 48, fontSize: isCompact ? '1rem' : '0.875rem' }}
              >
                {state.loading.classification ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  'Classify Entity'
                )}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Results Panel */}
        <Grid size={{ xs: 12, md: 6 }}>
          {classificationResult ? (
            <ClassificationResults entity={classificationResult} isCompact={isCompact} />
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: isCompact ? 4 : 8 }}>
                <BrainIcon sx={{ fontSize: isCompact ? 48 : 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="text.secondary" gutterBottom>
                  Ready for Classification
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  {isCompact ? 'Enter an entity to classify' : 'Enter an entity name and click "Classify Entity" to see the results'}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
      </Box>
    </>
  );
}

// Layer colors - defined at module level to avoid recreation
const LAYER_COLORS = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
} as const;

// Classification Results Component
interface ClassificationResultsProps {
  entity: UHTEntity;
  isCompact?: boolean;
}

const ClassificationResults = memo(function ClassificationResults({ entity, isCompact = false }: ClassificationResultsProps) {
  const activeTraits = entity.trait_evaluations?.filter(t => t.applicable) || [];
  const hasEmbedding = entity.embedding && entity.embedding.length > 0;

  // Handle image URL - could be relative path or full URL
  const getImageUrl = (url: string | undefined) => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return url; // Relative URL will work with proxy
  };

  const imageUrl = getImageUrl(entity.image_url);

  return (
    <Card>
      <CardContent sx={{ p: isCompact ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography
            variant={isCompact ? 'subtitle1' : 'h6'}
            sx={{ display: 'flex', alignItems: 'center', fontWeight: 600 }}
          >
            <CheckIcon sx={{ mr: 1, color: 'success.main', fontSize: isCompact ? 20 : 24 }} />
            {isCompact ? 'Results' : 'Classification Results'}
          </Typography>
          {entity.uuid && (
            <Tooltip title="Open entity details">
              <IconButton
                size="small"
                onClick={() => window.location.href = `/entity/${entity.uuid}`}
                sx={{
                  color: 'primary.main',
                  '&:hover': { bgcolor: 'primary.main', color: 'white' }
                }}
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Entity Header with optional image */}
        <Box sx={{ mb: isCompact ? 2 : 3, p: isCompact ? 1.5 : 2, bgcolor: 'background.default', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: isCompact ? 'column' : 'row', gap: 2 }}>
            {/* Generated Image or Placeholder */}
            {imageUrl ? (
              <Box
                component="img"
                src={imageUrl}
                alt={entity.name}
                sx={{
                  width: isCompact ? '100%' : 120,
                  height: isCompact ? 160 : 120,
                  objectFit: 'cover',
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: 'primary.main',
                  flexShrink: 0
                }}
              />
            ) : (
              <Box
                sx={{
                  width: isCompact ? '100%' : 120,
                  height: isCompact ? 160 : 120,
                  borderRadius: 2,
                  border: '2px dashed',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.hover',
                  flexShrink: 0
                }}
              >
                <ImageIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              </Box>
            )}
            <Box sx={{ flex: 1 }}>
              <Typography variant={isCompact ? 'h6' : 'h5'} gutterBottom>
                {entity.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography
                  variant={isCompact ? 'h5' : 'h4'}
                  color="primary.main"
                  sx={{ fontFamily: 'monospace', fontSize: isCompact ? '1.5rem' : '2rem' }}
                >
                  {entity.uht_code}
                </Typography>
                {/* Status indicators */}
                {imageUrl && (
                  <Tooltip title="Has generated image">
                    <ImageIcon sx={{ fontSize: 18, color: '#E91E63' }} />
                  </Tooltip>
                )}
                {hasEmbedding && (
                  <Tooltip title={`Has embedding (${entity.embedding?.length} dimensions)`}>
                    <EmbeddingIcon sx={{ fontSize: 18, color: '#00BCD4' }} />
                  </Tooltip>
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: isCompact ? '0.8rem' : '0.875rem' }}>
                {entity.description}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Layer Analysis */}
        <Typography variant={isCompact ? 'body1' : 'subtitle1'} gutterBottom sx={{ fontWeight: 600 }}>
          Layer Analysis
        </Typography>
        <Grid container spacing={isCompact ? 1 : 2} sx={{ mb: isCompact ? 2 : 3 }}>
          {Object.entries(entity.layers || {}).map(([layer, hex]) => {
            const binary = parseInt(hex, 16).toString(2).padStart(8, '0');
            const activeCount = binary.split('1').length - 1;

            return (
              <Grid size={{ xs: 6, sm: 3 }} key={layer}>
                <Paper sx={{ p: isCompact ? 1 : 1.5, textAlign: 'center', bgcolor: 'background.default' }}>
                  <Typography
                    variant={isCompact ? 'caption' : 'subtitle2'}
                    sx={{ color: LAYER_COLORS[layer as keyof typeof LAYER_COLORS], fontWeight: 600 }}
                  >
                    {isCompact ? layer.slice(0, 4) : layer}
                  </Typography>
                  <Typography variant={isCompact ? 'body1' : 'h6'} sx={{ fontFamily: 'monospace' }}>
                    {hex}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {activeCount}/8
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>

        {/* Active Traits */}
        <Accordion defaultExpanded={!isCompact}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: isCompact ? 44 : 48 }}>
            <Typography variant={isCompact ? 'body2' : 'subtitle1'} sx={{ fontWeight: 600 }}>
              Active Traits ({activeTraits.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {activeTraits.map((trait) => (
                <Chip
                  key={trait.trait_bit}
                  label={isCompact ? `${trait.trait_bit}` : `${trait.trait_bit}. ${trait.trait_name}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{ fontSize: isCompact ? '0.7rem' : '0.75rem' }}
                  title={trait.trait_name}
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Processing Info */}
        <Box sx={{ mt: 2, p: isCompact ? 1.5 : 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="caption" display="block" color="text.secondary">
            {isCompact ? `${entity.processing_time_ms?.toFixed(0)}ms` : `Processing time: ${entity.processing_time_ms?.toFixed(1)}ms`}
          </Typography>
          {!isCompact && (
            <Typography variant="caption" display="block" color="text.secondary">
              UUID: {entity.uuid}
            </Typography>
          )}
          <Typography variant="caption" display="block" color="text.secondary">
            {new Date(entity.created_at).toLocaleString()}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
});