import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  Collapse,
  IconButton,
  Divider,
  Tooltip,
  Pagination
} from '@mui/material';
import {
  Add as AddIcon,
  Psychology as PsychologyIcon,
  Edit as EditIcon,
  Flag as FlagIcon,
  Image as ImageIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AccessTime as TimeIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { entityAPI } from '../../services/api';
import type { EntityHistoryResponse, EntityVersion, VersionChangeType } from '../../types';

interface EntityHistoryTabProps {
  entityUuid: string;
}

// Change type configuration
const CHANGE_TYPE_CONFIG: Record<VersionChangeType, { icon: React.ReactNode; color: string; label: string }> = {
  created: {
    icon: <AddIcon fontSize="small" />,
    color: '#4CAF50',
    label: 'Created'
  },
  reclassified: {
    icon: <PsychologyIcon fontSize="small" />,
    color: '#9C27B0',
    label: 'Reclassified'
  },
  metadata_edit: {
    icon: <EditIcon fontSize="small" />,
    color: '#2196F3',
    label: 'Metadata Edit'
  },
  nsfw_toggle: {
    icon: <FlagIcon fontSize="small" />,
    color: '#f44336',
    label: 'NSFW Toggle'
  },
  image_change: {
    icon: <ImageIcon fontSize="small" />,
    color: '#E91E63',
    label: 'Image Change'
  },
  trait_correction: {
    icon: <CheckCircleIcon fontSize="small" />,
    color: '#FF9800',
    label: 'Trait Correction'
  }
};

// Format date for display
const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
};

// Format relative time
const formatRelativeTime = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
};

// Version card component
const VersionCard: React.FC<{ version: EntityVersion; isLatest: boolean }> = ({ version, isLatest }) => {
  const [expanded, setExpanded] = useState(false);
  const config = CHANGE_TYPE_CONFIG[version.change_type] || CHANGE_TYPE_CONFIG.metadata_edit;

  return (
    <Paper
      sx={{
        mb: 2,
        border: `1px solid ${config.color}40`,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Timeline connector */}
      <Box
        sx={{
          position: 'absolute',
          left: 20,
          top: 0,
          bottom: 0,
          width: 2,
          backgroundColor: `${config.color}30`
        }}
      />

      {/* Main header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 2,
          p: 2,
          pl: 5,
          cursor: 'pointer',
          backgroundColor: expanded ? `${config.color}08` : 'transparent',
          '&:hover': {
            backgroundColor: `${config.color}10`
          },
          transition: 'background-color 0.2s'
        }}
      >
        {/* Timeline dot */}
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            top: 20,
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            zIndex: 1,
            '& .MuiSvgIcon-root': { fontSize: 12 }
          }}
        >
          {config.icon}
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Chip
              label={config.label}
              size="small"
              sx={{
                backgroundColor: `${config.color}20`,
                color: config.color,
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 22
              }}
            />
            <Chip
              label={`v${version.version_number}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
            {isLatest && (
              <Chip
                label="Current"
                size="small"
                sx={{
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  height: 20
                }}
              />
            )}
          </Box>

          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
            {version.change_summary}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
              <TimeIcon sx={{ fontSize: 14 }} />
              <Tooltip title={formatDate(version.changed_at)}>
                <Typography variant="caption">{formatRelativeTime(version.changed_at)}</Typography>
              </Tooltip>
            </Box>
            {version.changed_by && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                <PersonIcon sx={{ fontSize: 14 }} />
                <Typography variant="caption">{version.changed_by}</Typography>
              </Box>
            )}
          </Box>
        </Box>

        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Expanded details */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2, pl: 5, pt: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Changed fields */}
          {version.changed_fields && version.changed_fields.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Changed Fields:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {version.changed_fields.map((field, i) => (
                  <Chip
                    key={i}
                    label={field}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Previous values */}
          {version.previous_values && Object.keys(version.previous_values).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Previous Values:
              </Typography>
              <Paper sx={{ p: 1.5, backgroundColor: 'rgba(255,255,255,0.02)' }}>
                {Object.entries(version.previous_values).map(([key, value]) => (
                  <Box key={key} sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{key}: </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        color: '#f44336',
                        textDecoration: 'line-through'
                      }}
                    >
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Box>
          )}

          {/* Snapshot summary */}
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Snapshot at this version:
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">UHT Code:</Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'primary.main' }}
              >
                {version.uht_code}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Name:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {version.name}
              </Typography>
            </Box>
            {version.nsfw && (
              <Chip
                label="NSFW"
                size="small"
                sx={{ backgroundColor: '#f44336', color: 'white', fontSize: '0.65rem', height: 18 }}
              />
            )}
          </Box>

          {/* Trait count if available */}
          {version.trait_snapshot && version.trait_snapshot.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Active traits: {version.trait_snapshot.filter(t => t.applicable).length}/{version.trait_snapshot.length}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default function EntityHistoryTab({ entityUuid }: EntityHistoryTabProps) {
  const [history, setHistory] = useState<EntityHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const fetchHistory = async () => {
      if (!entityUuid) return;

      setLoading(true);
      setError(null);

      try {
        const offset = (page - 1) * pageSize;
        const data = await entityAPI.getHistory(entityUuid, pageSize, offset);
        setHistory(data);
      } catch (err) {
        console.error('Failed to fetch history:', err);
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [entityUuid, page]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!history || history.versions.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <TimeIcon sx={{ fontSize: 48, opacity: 0.5, mb: 1 }} />
        <Typography variant="body1">No version history available</Typography>
        <Typography variant="body2">
          Version history will appear here after the entity is modified.
        </Typography>
      </Box>
    );
  }

  const totalPages = Math.ceil(history.total_versions / pageSize);

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimeIcon color="primary" />
            Version History
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {history.total_versions} total {history.total_versions === 1 ? 'version' : 'versions'} • Currently at v{history.current_version}
          </Typography>
        </Box>
      </Box>

      {/* Timeline */}
      <Box sx={{ position: 'relative' }}>
        {history.versions.map((version) => (
          <VersionCard
            key={version.version_id}
            version={version}
            isLatest={version.version_number === history.current_version}
          />
        ))}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
            size="small"
          />
        </Box>
      )}
    </Box>
  );
}
