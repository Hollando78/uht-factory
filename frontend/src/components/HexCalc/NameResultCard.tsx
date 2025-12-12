import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  AutoAwesome as NameIcon,
  Check as AcceptIcon,
  Refresh as RegenerateIcon,
  Close as CancelIcon
} from '@mui/icons-material';
import type { SelectedEntity } from '../../types';

interface NameResult {
  suggested_name: string;
  suggested_description: string;
  confidence: number;
  reasoning: string;
}

interface NameResultCardProps {
  hexCode: string;
  sourceEntities: SelectedEntity[];
  operation: string;  // XOR, AND, OR, ONE_HOT
  onAccept: (name: string, description: string) => void;
  onCancel: () => void;
}

type NamingState = 'loading' | 'result' | 'error';

export default function NameResultCard({
  hexCode,
  sourceEntities,
  operation,
  onAccept,
  onCancel
}: NameResultCardProps) {
  const [state, setState] = useState<NamingState>('loading');
  const [result, setResult] = useState<NameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateName = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const response = await fetch('/api/v1/hex-calc/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hex_code: hexCode,
          source_entity_uuids: sourceEntities.map(e => e.uuid),
          operation: operation
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate name');
      }

      const data = await response.json();
      setResult(data);
      setState('result');
    } catch (err: any) {
      setError(err.message || 'Failed to generate name');
      setState('error');
    }
  }, [hexCode, sourceEntities, operation]);

  // Auto-generate on mount
  useEffect(() => {
    generateName();
  }, []);

  const handleAccept = () => {
    if (result) {
      onAccept(result.suggested_name, result.suggested_description);
    }
  };

  return (
    <Card sx={{ border: '1px solid rgba(0, 229, 255, 0.3)' }}>
      <CardContent sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <NameIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              Name Result
            </Typography>
          </Box>
          <IconButton size="small" onClick={onCancel} sx={{ p: 0.25 }}>
            <CancelIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* Loading State */}
        {state === 'loading' && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
              Generating...
            </Typography>
          </Box>
        )}

        {/* Error State */}
        {state === 'error' && (
          <Box>
            <Alert severity="error" sx={{ mb: 1.5, py: 0.5, fontSize: '0.7rem' }}>
              {error}
            </Alert>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={generateName}
                startIcon={<RegenerateIcon sx={{ fontSize: 14 }} />}
                fullWidth
                sx={{ fontSize: '0.7rem', py: 0.5 }}
              >
                Retry
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={onCancel}
                fullWidth
                sx={{ fontSize: '0.7rem', py: 0.5 }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        )}

        {/* Result State */}
        {state === 'result' && result && (
          <Box>
            {/* Name */}
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: 'primary.main',
                mb: 0.5
              }}
            >
              {result.suggested_name}
            </Typography>

            {/* Description */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mb: 1,
                fontSize: '0.68rem',
                lineHeight: 1.4
              }}
            >
              {result.suggested_description}
            </Typography>

            {/* Confidence */}
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6rem',
                color: 'text.disabled',
                display: 'block',
                mb: 1.5
              }}
            >
              {(result.confidence * 100).toFixed(0)}% confidence
            </Typography>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={handleAccept}
                startIcon={<AcceptIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: '0.7rem', py: 0.5, flex: 1 }}
              >
                Accept
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={generateName}
                startIcon={<RegenerateIcon sx={{ fontSize: 14 }} />}
                sx={{ fontSize: '0.7rem', py: 0.5, flex: 1 }}
              >
                Regenerate
              </Button>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
