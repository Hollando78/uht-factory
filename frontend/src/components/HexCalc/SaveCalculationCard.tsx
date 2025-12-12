import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { collectionsAPI } from '../../services/api';
import type { SelectedEntity } from '../../types';
import type { AnalysisResult } from './LLMAnalysisCard';
import type { DatabaseMatches } from './MatchesCard';

interface SaveCalculationCardProps {
  operands: SelectedEntity[];
  computedHex: string;
  isCompact: boolean;
  onSaved?: () => void;
  // Optional: AI-generated name/description to save
  acceptedName?: string;
  acceptedDescription?: string;
  // Optional: LLM analysis to save
  llmAnalysis?: AnalysisResult | null;
  // Optional: Database matches to save
  databaseMatches?: DatabaseMatches | null;
  // For Save (overwrite) vs Save as (new)
  loadedCalcId?: string | null;
  loadedCalcName?: string | null;
}

interface Collection {
  id: string;
  name: string;
}

export default function SaveCalculationCard({
  operands,
  computedHex,
  isCompact,
  onSaved,
  acceptedName,
  acceptedDescription,
  llmAnalysis,
  databaseMatches,
  loadedCalcId,
  loadedCalcName
}: SaveCalculationCardProps) {
  const { getAccessToken, state } = useAuth();
  const isAuthenticated = state.isAuthenticated;

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveAsMode, setSaveAsMode] = useState(false); // true = create new, false = overwrite
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');

  // Load collections and pre-fill name when dialog opens
  useEffect(() => {
    if (!saveDialogOpen || !isAuthenticated) return;

    // Pre-fill name and description with accepted values if available
    if (acceptedName && !name) {
      setName(acceptedName);
    }
    if (acceptedDescription && !description) {
      setDescription(acceptedDescription);
    }

    const loadCollections = async () => {
      const token = getAccessToken();
      if (!token) return;
      try {
        const result = await collectionsAPI.list(token);
        setCollections(result.collections.map(c => ({ id: c.id, name: c.name })));
      } catch (err) {
        console.error('Failed to load collections:', err);
      }
    };
    loadCollections();
  }, [saveDialogOpen, isAuthenticated, getAccessToken, acceptedName, acceptedDescription, name, description]);

  // Update existing calculation (overwrite)
  const handleUpdate = async () => {
    const token = getAccessToken();
    if (!token || !loadedCalcId) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/hex-calc/calculations/${loadedCalcId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          // Update analysis data
          accepted_name: acceptedName || null,
          accepted_description: acceptedDescription || null,
          llm_analysis: llmAnalysis ? JSON.stringify(llmAnalysis) : null,
          database_matches: databaseMatches ? JSON.stringify(databaseMatches) : null
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update');
      }

      // Notify parent
      onSaved?.();

    } catch (err: any) {
      setError(err.message || 'Failed to update calculation');
    } finally {
      setSaving(false);
    }
  };

  // Create new calculation
  const handleSaveAs = async () => {
    const token = getAccessToken();
    if (!token || !name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/hex-calc/calculations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          hex_code: computedHex,
          source_entity_uuids: operands.map(o => o.uuid),
          // Include analysis data if available
          accepted_name: acceptedName || null,
          accepted_description: acceptedDescription || null,
          llm_analysis: llmAnalysis ? JSON.stringify(llmAnalysis) : null,
          database_matches: databaseMatches ? JSON.stringify(databaseMatches) : null
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save');
      }

      setSaveDialogOpen(false);
      setName('');
      setDescription('');
      setSaveAsMode(false);

      // Optionally add to collection
      if (selectedCollection) {
        const saved = await response.json();
        await addToCollection(saved.id, selectedCollection);
      }

      // Notify parent
      onSaved?.();

    } catch (err: any) {
      setError(err.message || 'Failed to save calculation');
    } finally {
      setSaving(false);
    }
  };

  const addToCollection = async (calcId: string, collectionId: string) => {
    const token = getAccessToken();
    if (!token) return;

    try {
      await fetch(`/api/v1/hex-calc/calculations/${calcId}/add-to-collection?collection_id=${collectionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Failed to add to collection:', err);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Save Calculation
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Sign in to save calculations and add them to collections
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent sx={{ p: isCompact ? 1.5 : 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {loadedCalcId ? `Editing: ${loadedCalcName}` : 'Save Calculation'}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {loadedCalcId ? (
              <>
                {/* Save (overwrite) button */}
                <Button
                  size="small"
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
                  onClick={handleUpdate}
                  disabled={operands.length < 2 || saving}
                >
                  Save
                </Button>
                {/* Save as (new) button */}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setSaveAsMode(true);
                    setSaveDialogOpen(true);
                  }}
                  disabled={operands.length < 2}
                >
                  Save as...
                </Button>
              </>
            ) : (
              /* New calculation - just show Save */
              <Button
                size="small"
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => {
                  setSaveAsMode(false);
                  setSaveDialogOpen(true);
                }}
                disabled={operands.length < 2}
              >
                Save
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Save As Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{saveAsMode ? 'Save as New Calculation' : 'Save Calculation'}</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, p: 1.5, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">Result</Typography>
            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: '#4CAF50' }}>
              {computedHex}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {operands.map(o => o.name).join(' XOR ')}
            </Typography>
          </Box>

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            placeholder="e.g., Meaning of Life"
          />

          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            sx={{ mb: 2 }}
          />

          {collections.length > 0 && (
            <FormControl fullWidth>
              <InputLabel>Add to Collection (optional)</InputLabel>
              <Select
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                label="Add to Collection (optional)"
              >
                <MenuItem value="">None</MenuItem>
                {collections.map(col => (
                  <MenuItem key={col.id} value={col.id}>{col.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveAs}
            disabled={saving || !name.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {saveAsMode ? 'Save as New' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
