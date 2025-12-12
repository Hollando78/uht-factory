import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  TextField
} from '@mui/material';
import {
  AutoAwesome as NameIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import type { SelectedEntity } from '../../types';
import { getLayerSummary } from '../../utils/uhtUtils';

interface NameHexDialogProps {
  open: boolean;
  onClose: () => void;
  hexCode: string;
  sourceEntities: SelectedEntity[];
}

interface NameResult {
  suggested_name: string;
  suggested_description: string;
  confidence: number;
  reasoning: string;
}

export default function NameHexDialog({
  open,
  onClose,
  hexCode,
  sourceEntities
}: NameHexDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NameResult | null>(null);

  const handleGenerateName = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/hex-calc/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hex_code: hexCode,
          source_entity_uuids: sourceEntities.map(e => e.uuid)
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate name');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate name');
    } finally {
      setLoading(false);
    }
  }, [hexCode, sourceEntities]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleClose = useCallback(() => {
    setResult(null);
    setError(null);
    onClose();
  }, [onClose]);

  const layerSummary = getLayerSummary(hexCode);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <NameIcon color="primary" />
        Name This Result
      </DialogTitle>

      <DialogContent>
        {/* Hex Code Display */}
        <Box
          sx={{
            textAlign: 'center',
            py: 2,
            mb: 2,
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: 1
          }}
        >
          <Typography
            variant="h5"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#4CAF50',
              letterSpacing: 2
            }}
          >
            {hexCode}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            XOR of {sourceEntities.length} entities
          </Typography>
        </Box>

        {/* Source Entities */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Source Entities
        </Typography>
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {sourceEntities.map(e => (
            <Box
              key={e.uuid}
              sx={{
                px: 1.5,
                py: 0.5,
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                borderRadius: 1,
                fontSize: '0.75rem'
              }}
            >
              {e.name}
            </Box>
          ))}
        </Box>

        {/* Layer Summary */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Active Traits by Layer
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {Object.entries(layerSummary).map(([name, data]) => (
            <Box key={name} sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {name}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {data.count}/8
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Result */}
        {result && (
          <Box sx={{ mt: 2 }}>
            <TextField
              label="Suggested Name"
              value={result.suggested_name}
              fullWidth
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <Button
                    size="small"
                    onClick={() => handleCopy(result.suggested_name)}
                  >
                    <CopyIcon fontSize="small" />
                  </Button>
                )
              }}
              sx={{ mb: 2 }}
            />

            <TextField
              label="Description"
              value={result.suggested_description}
              fullWidth
              multiline
              rows={3}
              InputProps={{
                readOnly: true
              }}
              sx={{ mb: 2 }}
            />

            <Box
              sx={{
                p: 1.5,
                backgroundColor: 'rgba(0,0,0,0.2)',
                borderRadius: 1
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Reasoning
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                {result.reasoning}
              </Typography>
              <Typography variant="caption" color="primary" sx={{ display: 'block', mt: 1 }}>
                Confidence: {(result.confidence * 100).toFixed(0)}%
              </Typography>
            </Box>
          </Box>
        )}

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        {!result && (
          <Button
            variant="contained"
            onClick={handleGenerateName}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <NameIcon />}
          >
            Generate Name
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
