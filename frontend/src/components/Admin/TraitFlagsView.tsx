import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Chip,
  TextField,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Checkbox,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Flag as FlagIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../../context/MobileContext';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, type TraitFlag, type ReviewFlagRequest } from '../../services/api';

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all';

export default function TraitFlagsView() {
  const { isMobile, isTablet } = useMobile();
  const isCompact = isMobile || isTablet;
  const navigate = useNavigate();
  const { state: authState } = useAuth();

  const [activeTab, setActiveTab] = useState<FilterStatus>('pending');
  const [flags, setFlags] = useState<TraitFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<TraitFlag | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [triggerReclassification, setTriggerReclassification] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  // Load flags whenever tab changes
  useEffect(() => {
    loadFlags();
  }, [activeTab]);

  const loadFlags = async () => {
    if (!authState.accessToken) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await adminAPI.listTraitFlags(authState.accessToken, activeTab, 100, 0);
      setFlags(response.flags);
      setTotal(response.total);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load trait flags');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReviewDialog = (flag: TraitFlag) => {
    setSelectedFlag(flag);
    setReviewAction('approve');
    setTriggerReclassification(true);
    setResolutionNotes('');
    setReviewError(null);
    setReviewSuccess(null);
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedFlag || !authState.accessToken) return;

    setReviewLoading(true);
    setReviewError(null);
    setReviewSuccess(null);

    try {
      const review: ReviewFlagRequest = {
        action: reviewAction,
        trigger_reclassification: reviewAction === 'approve' ? triggerReclassification : false,
        resolution_notes: resolutionNotes.trim() || undefined
      };

      const result = await adminAPI.reviewTraitFlag(
        authState.accessToken,
        selectedFlag.flag_id,
        review
      );

      setReviewSuccess(result.message);

      // Reload flags after 1 second
      setTimeout(() => {
        setReviewDialogOpen(false);
        loadFlags();
      }, 1500);
    } catch (err: any) {
      setReviewError(err.response?.data?.detail || 'Failed to review flag');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleViewEntity = (entityUuid: string) => {
    navigate(`/entity/${entityUuid}`);
  };

  const getStatusColor = (status: string): 'default' | 'success' | 'error' | 'warning' => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getBoolChipColor = (value: boolean): 'success' | 'default' => {
    return value ? 'success' : 'default';
  };

  // Check authentication
  if (!authState.isAuthenticated) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            Authentication Required
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            You must be logged in to access the admin panel.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/')}>
            Go to Home
          </Button>
        </Paper>
      </Box>
    );
  }

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <FlagIcon color="primary" sx={{ fontSize: isCompact ? 20 : 24 }} />
          <Typography variant={isCompact ? 'subtitle1' : 'h6'} color="primary" sx={{ fontWeight: 600 }}>
            Trait Flags Review
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {total} flag{total !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant={isCompact ? 'scrollable' : 'standard'}
          scrollButtons="auto"
        >
          <Tab label="Pending" value="pending" />
          <Tab label="Approved" value="approved" />
          <Tab label="Rejected" value="rejected" />
          <Tab label="All" value="all" />
        </Tabs>
      </Paper>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: isCompact ? 1 : 2 }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : flags.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <FlagIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Flags Found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activeTab === 'pending'
                ? 'All caught up! No pending flags to review.'
                : `No ${activeTab} flags yet.`}
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size={isCompact ? 'small' : 'medium'}>
              <TableHead>
                <TableRow>
                  <TableCell>Entity</TableCell>
                  <TableCell>Trait</TableCell>
                  <TableCell align="center">Current</TableCell>
                  <TableCell align="center">Suggested</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {flags.map((flag) => (
                  <TableRow key={flag.flag_id} hover>
                    <TableCell>
                      <Tooltip title={`View entity: ${flag.entity_name}`}>
                        <Button
                          size="small"
                          onClick={() => handleViewEntity(flag.entity_uuid)}
                          sx={{ textTransform: 'none' }}
                        >
                          {flag.entity_name}
                        </Button>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Bit {flag.trait_bit}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {flag.trait_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={flag.current_value ? 'ON' : 'OFF'}
                        color={getBoolChipColor(flag.current_value)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={flag.suggested_value ? 'ON' : 'OFF'}
                        color={getBoolChipColor(flag.suggested_value)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 300 }}>
                        {flag.reason}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={flag.status}
                        color={getStatusColor(flag.status)}
                        size="small"
                      />
                      {flag.reviewed_by && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          by {flag.reviewed_by}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {new Date(flag.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {flag.status === 'pending' && (
                        <Tooltip title="Review this flag">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenReviewDialog(flag)}
                          >
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Review Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onClose={() => !reviewLoading && setReviewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Review Trait Flag</DialogTitle>
        <DialogContent>
          {selectedFlag && (
            <Box sx={{ mt: 1 }}>
              {/* Flag Details */}
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Entity
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {selectedFlag.entity_name}
                </Typography>

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Trait
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Bit {selectedFlag.trait_bit}: {selectedFlag.trait_name}
                </Typography>

                <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Current Value
                    </Typography>
                    <Chip
                      label={selectedFlag.current_value ? 'ON' : 'OFF'}
                      color={getBoolChipColor(selectedFlag.current_value)}
                    />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Suggested Value
                    </Typography>
                    <Chip
                      label={selectedFlag.suggested_value ? 'ON' : 'OFF'}
                      color={getBoolChipColor(selectedFlag.suggested_value)}
                    />
                  </Box>
                </Box>

                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Reason
                </Typography>
                <Typography variant="body2">{selectedFlag.reason}</Typography>
              </Paper>

              {/* Review Form */}
              <FormControl component="fieldset" fullWidth sx={{ mb: 2 }}>
                <FormLabel component="legend">Decision</FormLabel>
                <RadioGroup
                  row
                  value={reviewAction}
                  onChange={(e) => setReviewAction(e.target.value as 'approve' | 'reject')}
                >
                  <FormControlLabel
                    value="approve"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ApproveIcon color="success" fontSize="small" />
                        Approve
                      </Box>
                    }
                  />
                  <FormControlLabel
                    value="reject"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <RejectIcon color="error" fontSize="small" />
                        Reject
                      </Box>
                    }
                  />
                </RadioGroup>
              </FormControl>

              {reviewAction === 'approve' && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={triggerReclassification}
                      onChange={(e) => setTriggerReclassification(e.target.checked)}
                    />
                  }
                  label="Re-evaluate trait with LLM and update UHT code"
                  sx={{ mb: 2 }}
                />
              )}

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Resolution Notes (optional)"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Add any notes about your decision..."
                inputProps={{ maxLength: 500 }}
                helperText={`${resolutionNotes.length}/500`}
              />

              {reviewError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {reviewError}
                </Alert>
              )}

              {reviewSuccess && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  {reviewSuccess}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialogOpen(false)} disabled={reviewLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitReview}
            variant="contained"
            disabled={reviewLoading}
            startIcon={reviewLoading ? <CircularProgress size={16} /> : undefined}
          >
            Submit Review
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
