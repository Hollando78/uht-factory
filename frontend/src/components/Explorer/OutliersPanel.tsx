import { useState, useEffect } from 'react';
import {
  Box,
  CircularProgress,
  Alert,
  Paper,
  Typography,
  Slider,
  Tabs,
  Tab,
  List,
  ListItem,
  Chip,
  Avatar,
  LinearProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ArrowForward as ArrowIcon,
  OpenInNew as PopoutIcon
} from '@mui/icons-material';
import { explorerAPI, entityAPI, type Outlier } from '../../services/api';
import { useFloatingCards } from '../../context/FloatingCardsContext';
import type { UHTEntity } from '../../types';

interface Props {
  onEntitySelect: (uuid: string) => void;
}

type OutlierType = 'semantic' | 'structural';

interface EnrichedOutlier extends Outlier {
  entity1?: UHTEntity;
  entity2?: UHTEntity;
}

export default function OutliersPanel({ onEntitySelect }: Props) {
  const { addFloatingCard } = useFloatingCards();
  const [outlierType, setOutlierType] = useState<OutlierType>('semantic');
  const [threshold, setThreshold] = useState(0.3);
  const [limit, setLimit] = useState(50);
  const [semanticOutliers, setSemanticOutliers] = useState<EnrichedOutlier[]>([]);
  const [structuralOutliers, setStructuralOutliers] = useState<EnrichedOutlier[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOutliers();
  }, [threshold, limit]);

  const loadOutliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await explorerAPI.getOutliers(threshold, limit);
      setSemanticOutliers(data.semantic_only);
      setStructuralOutliers(data.structural_only);

      // Enrich with entity details
      enrichOutliers(data.semantic_only, data.structural_only);
    } catch (err) {
      console.error('Failed to load outliers:', err);
      setError('Failed to load outliers data');
    } finally {
      setLoading(false);
    }
  };

  const enrichOutliers = async (semantic: Outlier[], structural: Outlier[]) => {
    setEnriching(true);
    try {
      // Collect unique UUIDs
      const allUuids = new Set<string>();
      [...semantic, ...structural].forEach(o => {
        allUuids.add(o.entity1_uuid);
        allUuids.add(o.entity2_uuid);
      });

      // Fetch entities (limit to first 100 unique)
      const uuidsToFetch = Array.from(allUuids).slice(0, 100);
      const entities = await Promise.all(
        uuidsToFetch.map(uuid => entityAPI.getEntity(uuid).catch(() => null))
      );

      // Create lookup map
      const entityMap = new Map<string, UHTEntity>();
      entities.forEach(e => {
        if (e) entityMap.set(e.uuid, e);
      });

      // Enrich outliers
      setSemanticOutliers(semantic.map(o => ({
        ...o,
        entity1: entityMap.get(o.entity1_uuid),
        entity2: entityMap.get(o.entity2_uuid)
      })));

      setStructuralOutliers(structural.map(o => ({
        ...o,
        entity1: entityMap.get(o.entity1_uuid),
        entity2: entityMap.get(o.entity2_uuid)
      })));
    } catch (err) {
      console.error('Failed to enrich outliers:', err);
    } finally {
      setEnriching(false);
    }
  };

  const currentOutliers = outlierType === 'semantic' ? semanticOutliers : structuralOutliers;

  const renderOutlierItem = (outlier: EnrichedOutlier) => (
    <ListItem
      key={`${outlier.entity1_uuid}-${outlier.entity2_uuid}`}
      sx={{
        flexDirection: 'column',
        alignItems: 'stretch',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        py: 1.5
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        {/* Entity 1 */}
        <Box
          sx={{
            flex: 1,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
            p: 1,
            borderRadius: 1
          }}
          onClick={() => onEntitySelect(outlier.entity1_uuid)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              src={outlier.entity1?.image_url || undefined}
              sx={{ width: 28, height: 28, fontSize: '0.7rem' }}
            >
              {(outlier.entity1?.name || outlier.entity1_name)?.[0] || '?'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {outlier.entity1?.name || outlier.entity1_name || outlier.entity1_uuid.slice(0, 8)}
              </Typography>
              <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace' }}>
                {outlier.entity1_uht_code || outlier.entity1?.uht_code || '...'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Tooltip title="Pop out">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              addFloatingCard(outlier.entity1_uuid);
            }}
            sx={{ p: 0.5 }}
          >
            <PopoutIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <ArrowIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />

        <Tooltip title="Pop out">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              addFloatingCard(outlier.entity2_uuid);
            }}
            sx={{ p: 0.5 }}
          >
            <PopoutIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Entity 2 */}
        <Box
          sx={{
            flex: 1,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
            p: 1,
            borderRadius: 1
          }}
          onClick={() => onEntitySelect(outlier.entity2_uuid)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              src={outlier.entity2?.image_url || undefined}
              sx={{ width: 28, height: 28, fontSize: '0.7rem' }}
            >
              {(outlier.entity2?.name || outlier.entity2_name)?.[0] || '?'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {outlier.entity2?.name || outlier.entity2_name || outlier.entity2_uuid.slice(0, 8)}
              </Typography>
              <Typography variant="caption" color="primary" sx={{ fontFamily: 'monospace' }}>
                {outlier.entity2_uht_code || outlier.entity2?.uht_code || '...'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Similarity scores */}
      <Box sx={{ display: 'flex', gap: 2, mt: 1, pl: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Embedding Sim
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinearProgress
              variant="determinate"
              value={outlier.embedding_similarity * 100}
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                bgcolor: 'rgba(0, 229, 255, 0.2)',
                '& .MuiLinearProgress-bar': { bgcolor: '#00e5ff' }
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 40 }}>
              {(outlier.embedding_similarity * 100).toFixed(0)}%
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            UHT Sim
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinearProgress
              variant="determinate"
              value={outlier.uht_similarity * 100}
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                bgcolor: 'rgba(255, 193, 7, 0.2)',
                '& .MuiLinearProgress-bar': { bgcolor: '#ffc107' }
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 40 }}>
              {(outlier.uht_similarity * 100).toFixed(0)}%
            </Typography>
          </Box>
        </Box>
        <Chip
          label={`Δ ${(outlier.disagreement * 100).toFixed(0)}%`}
          size="small"
          color="error"
          sx={{ minWidth: 60 }}
        />
      </Box>
    </ListItem>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', p: 2, gap: 2 }}>
      {/* Controls */}
      <Paper sx={{ p: 2, width: 280, flexShrink: 0, overflow: 'auto' }}>
        <Typography variant="subtitle2" color="primary" gutterBottom>
          Outlier Detection
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Find entity pairs where embedding similarity and UHT similarity strongly disagree.
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Disagreement Threshold: {(threshold * 100).toFixed(0)}%
          </Typography>
          <Slider
            value={threshold}
            onChange={(_, v) => setThreshold(v as number)}
            min={0.1}
            max={0.5}
            step={0.05}
            marks={[
              { value: 0.1, label: '10%' },
              { value: 0.3, label: '30%' },
              { value: 0.5, label: '50%' }
            ]}
            size="small"
          />
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Max Results: {limit}
          </Typography>
          <Slider
            value={limit}
            onChange={(_, v) => setLimit(v as number)}
            min={10}
            max={100}
            step={10}
            marks={[
              { value: 10, label: '10' },
              { value: 50, label: '50' },
              { value: 100, label: '100' }
            ]}
            size="small"
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>Explanation</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="caption" color="error.main" sx={{ fontWeight: 600, display: 'block' }}>
                Semantic Similar, Structural Different
              </Typography>
              <Typography variant="caption" color="text.secondary">
                High embedding similarity but low UHT similarity.
                These entities are semantically related but have different structural properties.
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600, display: 'block' }}>
                Structural Similar, Semantic Different
              </Typography>
              <Typography variant="caption" color="text.secondary">
                High UHT similarity but low embedding similarity.
                These entities share structural traits but are semantically unrelated.
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Paper>

      {/* Results */}
      <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          value={outlierType}
          onChange={(_, v) => setOutlierType(v)}
          sx={{ borderBottom: '1px solid rgba(0, 229, 255, 0.2)', flexShrink: 0 }}
        >
          <Tab
            value="semantic"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Semantic Similar
                <Chip label={semanticOutliers.length} size="small" />
              </Box>
            }
          />
          <Tab
            value="structural"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Structural Similar
                <Chip label={structuralOutliers.length} size="small" />
              </Box>
            }
          />
        </Tabs>

        {enriching && <LinearProgress />}

        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {currentOutliers.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No outliers found with current threshold
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {currentOutliers.map((outlier) => renderOutlierItem(outlier))}
            </List>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
