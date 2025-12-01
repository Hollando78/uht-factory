import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Avatar,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Psychology as BrainIcon,
  Speed as SpeedIcon,
  Image as ImageIcon,
  AutoAwesome as AutoIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useApp } from '../../context/AppContext';
import API from '../../services/api';
import type { UHTEntity, EntityPreProcessing, DuplicateCheck } from '../../types/index';

export default function ClassificationView() {
  const { state, actions } = useApp();
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
      const entity = response.entity || response.data;
      
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
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Grid container spacing={3}>
        {/* Input Panel */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <BrainIcon sx={{ mr: 1, color: 'primary.main' }} />
                Entity Classification
              </Typography>

              {/* Entity Input */}
              <TextField
                fullWidth
                label="Entity Name"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                placeholder="e.g., smartphone, democracy, oak tree..."
                sx={{ mb: 2 }}
              />

              {/* Pre-process Button */}
              <Button
                fullWidth
                variant="outlined"
                onClick={handlePreProcess}
                disabled={entityInput.length < 3 || state.loading.preprocess}
                sx={{ mb: 2 }}
                startIcon={state.loading.preprocess ? <CircularProgress size={20} /> : <AutoIcon />}
              >
                {state.loading.preprocess ? 'Analyzing...' : 'AI Enhancement & Duplicate Check'}
              </Button>

              {/* Pre-processing Results */}
              {preProcessing && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: 'rgba(0, 229, 255, 0.05)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <AutoIcon sx={{ mr: 1, color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="subtitle2" color="primary">
                      AI Enhancement Suggestions
                    </Typography>
                    <Chip 
                      label={`${Math.round(preProcessing.confidence * 100)}% confidence`}
                      size="small"
                      color="primary"
                      sx={{ ml: 'auto' }}
                    />
                  </Box>
                  
                  {preProcessing.suggested_name !== entityInput && (
                    <Alert severity="info" sx={{ mb: 1, py: 0 }}>
                      <strong>Suggested name:</strong> {preProcessing.suggested_name}
                    </Alert>
                  )}
                  
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={applySuggestions}
                    sx={{ mt: 1 }}
                  >
                    Apply All Suggestions
                  </Button>
                </Paper>
              )}

              {/* Duplicate Check */}
              {duplicateCheck && duplicateCheck.exists && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <strong>Similar entity found:</strong> {duplicateCheck.existing_entity?.name}
                  <br />
                  UHT Code: {duplicateCheck.existing_entity?.uht_code}
                </Alert>
              )}

              {/* Additional Fields */}
              <TextField
                fullWidth
                label="Description (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                rows={3}
                placeholder="Detailed description of the entity..."
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label="Context (Optional)"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Additional context or domain..."
                sx={{ mb: 2 }}
              />

              {/* Options */}
              <Box sx={{ mb: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={generateImage}
                      onChange={(e) => setGenerateImage(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Generate AI Image"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={generateEmbedding}
                      onChange={(e) => setGenerateEmbedding(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Compute Embeddings"
                />
              </Box>

              {/* Classify Button */}
              <Button
                fullWidth
                variant="contained"
                onClick={handleClassify}
                disabled={!entityInput.trim() || state.loading.classification}
                sx={{ height: 48 }}
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
        <Grid item xs={12} md={6}>
          {classificationResult ? (
            <ClassificationResults entity={classificationResult} />
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <BrainIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Ready for Classification
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  Enter an entity name and click "Classify Entity" to see the results
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

// Classification Results Component
interface ClassificationResultsProps {
  entity: UHTEntity;
}

function ClassificationResults({ entity }: ClassificationResultsProps) {
  const activeTraits = entity.trait_evaluations?.filter(t => t.applicable) || [];
  const inactiveTraits = entity.trait_evaluations?.filter(t => !t.applicable) || [];

  const layerColors = {
    Physical: '#FF6B35',
    Functional: '#00E5FF',
    Abstract: '#9C27B0',
    Social: '#4CAF50'
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <CheckIcon sx={{ mr: 1, color: 'success.main' }} />
          Classification Results
        </Typography>

        {/* Entity Header */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
          <Typography variant="h5" gutterBottom>
            {entity.name}
          </Typography>
          <Typography variant="h4" color="primary.main" sx={{ fontFamily: 'monospace', mb: 1 }}>
            {entity.uht_code}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {entity.description}
          </Typography>
        </Box>

        {/* Layer Analysis */}
        <Typography variant="subtitle1" gutterBottom>
          Layer Analysis
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {Object.entries(entity.layers || {}).map(([layer, hex]) => {
            const binary = parseInt(hex, 16).toString(2).padStart(8, '0');
            const activeCount = binary.split('1').length - 1;
            
            return (
              <Grid item xs={6} sm={3} key={layer}>
                <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" sx={{ color: layerColors[layer as keyof typeof layerColors] }}>
                    {layer}
                  </Typography>
                  <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                    {hex}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {activeCount}/8 traits
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>

        {/* Active Traits */}
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              Active Traits ({activeTraits.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {activeTraits.map((trait) => (
                <Chip
                  key={trait.trait_bit}
                  label={`${trait.trait_bit}. ${trait.trait_name}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{ mb: 1 }}
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Processing Info */}
        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="caption" display="block" color="text.secondary">
            Processing time: {entity.processing_time_ms?.toFixed(1)}ms
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            UUID: {entity.uuid}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            Created: {new Date(entity.created_at).toLocaleString()}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}