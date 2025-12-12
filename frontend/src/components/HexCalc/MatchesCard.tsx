import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import {
  Search as SearchIcon,
  CheckCircle as ExactIcon,
  Tune as SimilarIcon,
  AutoAwesome as NameIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { entityAPI } from '../../services/api';
import { hammingDistance } from '../../utils/uhtUtils';
import type { UHTEntity } from '../../types';

export interface MatchResult {
  entity: UHTEntity;
  distance: number;
  isExact: boolean;
}

export interface DatabaseMatches {
  exactMatches: MatchResult[];
  nearMatches: MatchResult[];
}

interface MatchesCardProps {
  hexCode: string;
  onNameResult?: () => void;
  // Optional: pre-loaded matches (when loading saved calculation)
  initialMatches?: DatabaseMatches | null;
  // Optional: callback when matches change (for saving)
  onMatchesChange?: (matches: DatabaseMatches | null) => void;
}

export default function MatchesCard({
  hexCode,
  onNameResult,
  initialMatches,
  onMatchesChange
}: MatchesCardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exactMatches, setExactMatches] = useState<MatchResult[]>(initialMatches?.exactMatches || []);
  const [nearMatches, setNearMatches] = useState<MatchResult[]>(initialMatches?.nearMatches || []);
  const [searched, setSearched] = useState(!!initialMatches);

  // Update state when initialMatches changes (e.g., loading a different saved calculation)
  useEffect(() => {
    setExactMatches(initialMatches?.exactMatches || []);
    setNearMatches(initialMatches?.nearMatches || []);
    setSearched(!!initialMatches);
  }, [initialMatches]);

  const searchMatches = async () => {
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      // Search for exact matches
      const exactResults = await entityAPI.searchEntities({
        uht_pattern: hexCode,
        limit: 10
      });

      const exact: MatchResult[] = (exactResults.entities || []).map((e: UHTEntity) => ({
        entity: e,
        distance: 0,
        isExact: true
      }));
      setExactMatches(exact);

      // Search for near matches (hamming distance <= 4)
      // We'll fetch entities and filter client-side for now
      // In production, this would be a dedicated API endpoint
      const allResults = await entityAPI.searchEntities({ limit: 500 });
      const near: MatchResult[] = [];

      for (const entity of (allResults.entities || []) as UHTEntity[]) {
        if (entity.uht_code === hexCode) continue; // Skip exact matches
        const dist = hammingDistance(hexCode, entity.uht_code);
        if (dist <= 4) {
          near.push({
            entity,
            distance: dist,
            isExact: false
          });
        }
      }

      // Sort by distance
      near.sort((a, b) => a.distance - b.distance);
      const trimmedNear = near.slice(0, 10);
      setNearMatches(trimmedNear);

      // Notify parent of changes for saving
      onMatchesChange?.({ exactMatches: exact, nearMatches: trimmedNear });

    } catch (err: any) {
      setError(err.message || 'Failed to search for matches');
    } finally {
      setLoading(false);
    }
  };

  const handleEntityClick = (uuid: string) => {
    navigate(`/entity/${uuid}`);
  };

  return (
    <Card>
      <CardContent sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
          Database Matches
        </Typography>

        {/* Compact action buttons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
          <Button
            size="small"
            variant="outlined"
            fullWidth
            startIcon={loading ? <CircularProgress size={14} /> : <SearchIcon />}
            onClick={searchMatches}
            disabled={loading}
            sx={{ justifyContent: 'flex-start', py: 0.75 }}
          >
            {searched ? 'Search Again' : 'Find Matches'}
          </Button>
          {onNameResult && (
            <Button
              size="small"
              variant="contained"
              fullWidth
              startIcon={<NameIcon />}
              onClick={onNameResult}
              sx={{ justifyContent: 'flex-start', py: 0.75 }}
            >
              Name Result
            </Button>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {searched && !loading && (
          <Box>
            {/* Exact Matches */}
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                <ExactIcon sx={{ fontSize: 14, color: '#4CAF50' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
                  Exact ({exactMatches.length})
                </Typography>
              </Box>

              {exactMatches.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  None found
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {exactMatches.map(({ entity }) => (
                    <Box
                      key={entity.uuid}
                      onClick={() => handleEntityClick(entity.uuid)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        p: 0.75,
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderRadius: 0.5,
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'rgba(76, 175, 80, 0.2)'
                        }
                      }}
                    >
                      {entity.image_url && (
                        <Box
                          component="img"
                          src={entity.image_url}
                          alt={entity.name}
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: 0.5,
                            objectFit: 'cover',
                            flexShrink: 0
                          }}
                        />
                      )}
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}
                      >
                        {entity.name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {/* Near Matches */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                <SimilarIcon sx={{ fontSize: 14, color: '#2196F3' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
                  Similar ({nearMatches.length})
                </Typography>
              </Box>

              {nearMatches.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  None within 4 bits
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {nearMatches.map(({ entity, distance }) => (
                    <Box
                      key={entity.uuid}
                      onClick={() => handleEntityClick(entity.uuid)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        p: 0.75,
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        borderRadius: 0.5,
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'rgba(33, 150, 243, 0.2)'
                        }
                      }}
                    >
                      {entity.image_url && (
                        <Box
                          component="img"
                          src={entity.image_url}
                          alt={entity.name}
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: 0.5,
                            objectFit: 'cover',
                            flexShrink: 0
                          }}
                        />
                      )}
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.68rem',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}
                      >
                        {entity.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.6rem',
                          color: '#2196F3',
                          flexShrink: 0
                        }}
                      >
                        ±{distance}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}

        {!searched && !loading && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Search for entities with identical or similar codes
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
