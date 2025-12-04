import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Build as BuildIcon,
  ContentCopy as CopyIcon,
  Share as ShareIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useMobile } from '../../context/MobileContext';
import { entityAPI } from '../../services/api';
import { binaryToUht, countPatternConstraints, createEmptyPattern } from '../../utils/uhtUtils';
import BinaryGrid from './BinaryGrid';
import SimilarityControls from './SimilarityControls';
import PatternSearchResults from './PatternSearchResults';
import type { UHTEntity } from '../../types';

export default function BuildACodeView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;
  const [searchParams, setSearchParams] = useSearchParams();

  const [pattern, setPattern] = useState<string>(() => {
    const urlPattern = searchParams.get('pattern');
    return urlPattern && urlPattern.length === 32 ? urlPattern : createEmptyPattern();
  });
  const [tolerance, setTolerance] = useState<number>(() => {
    const urlTolerance = searchParams.get('tolerance');
    return urlTolerance ? parseInt(urlTolerance, 10) : 0;
  });

  const [results, setResults] = useState<UHTEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived values
  const constraintCount = countPatternConstraints(pattern);
  const hexCode = pattern.includes('X') ? '(pattern)' : binaryToUht(pattern);

  // Search for matching entities
  const searchPattern = useCallback(async () => {
    // Only search if there are constraints
    if (!pattern.includes('0') && !pattern.includes('1')) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const entities = await entityAPI.searchByPattern(pattern, tolerance);
      setResults(entities);
    } catch (err) {
      console.error('Pattern search failed:', err);
      setError('Failed to search entities');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [pattern, tolerance]);

  // Debounced search when pattern or tolerance changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchPattern();
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchPattern]);

  // Update URL when pattern changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (pattern !== createEmptyPattern()) {
      params.set('pattern', pattern);
    }
    if (tolerance > 0) {
      params.set('tolerance', tolerance.toString());
    }
    setSearchParams(params, { replace: true });
  }, [pattern, tolerance, setSearchParams]);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
  };

  const handleCopyPattern = () => {
    navigator.clipboard.writeText(pattern);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Paper
        sx={{
          p: isCompact ? 1.5 : 2,
          borderRadius: 0,
          borderBottom: '1px solid rgba(0, 229, 255, 0.3)',
          flexShrink: 0
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BuildIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
          <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
            Build-a-Code
          </Typography>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Tooltip title="Copy pattern">
              <IconButton size="small" onClick={handleCopyPattern}>
                <CopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share pattern URL">
              <IconButton size="small" onClick={handleShare}>
                <ShareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Click bits to build a UHT pattern and find matching entities
        </Typography>
      </Paper>

      {/* Content */}
      <Box
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          p: isCompact ? 1.5 : 2,
          display: 'flex',
          flexDirection: isCompact ? 'column' : 'row',
          gap: 2
        }}
      >
        {/* Left Column - Pattern Builder */}
        <Box sx={{ flex: isCompact ? 'none' : 1 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Pattern Builder
              </Typography>

              {/* Binary Grid */}
              <Box sx={{ mb: 3 }}>
                <BinaryGrid
                  pattern={pattern}
                  onChange={setPattern}
                  isCompact={isCompact}
                />
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Current Pattern Display */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Pattern String
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  value={pattern}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    if (val.length === 32 && /^[01X]+$/.test(val)) {
                      setPattern(val);
                    }
                  }}
                  InputProps={{
                    sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title="Copy pattern">
                          <IconButton size="small" onClick={handleCopyPattern}>
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    )
                  }}
                />
                {hexCode !== '(pattern)' && (
                  <Typography
                    variant="caption"
                    color="primary.main"
                    fontFamily="monospace"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    Hex: {hexCode}
                  </Typography>
                )}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Similarity Controls */}
              <SimilarityControls
                tolerance={tolerance}
                onToleranceChange={setTolerance}
                pattern={pattern}
                onPatternChange={setPattern}
                constraintCount={constraintCount}
                matchCount={results.length}
                isCompact={isCompact}
              />
            </CardContent>
          </Card>
        </Box>

        {/* Right Column - Search Results */}
        <Box sx={{ flex: isCompact ? 'none' : 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: isCompact ? 1.5 : 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, flexShrink: 0 }}>
                Matching Entities
              </Typography>

              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <PatternSearchResults
                  results={results}
                  loading={loading}
                  error={error}
                  pattern={pattern}
                  isCompact={isCompact}
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
