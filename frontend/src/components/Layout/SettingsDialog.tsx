import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  Divider,
  Chip,
  IconButton,
  InputAdornment,
  CircularProgress
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CheckCircle,
  Cancel,
  Email as EmailIcon,
  Key as KeyIcon
} from '@mui/icons-material';
import { getApiKey, setApiKey } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { logout: authLogout } = useAuth();
  const [activeTab, setActiveTab] = useState<'status' | 'request' | 'apikey'>('status');
  const [email, setEmail] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [keyInfo, setKeyInfo] = useState<{ name: string; scopes: string[] } | null>(null);

  useEffect(() => {
    if (open) {
      checkAuthStatus();
    }
  }, [open]);

  const checkAuthStatus = async () => {
    const key = getApiKey();
    if (!key) {
      setIsAuthenticated(false);
      setKeyInfo(null);
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/keys/verify', {
        headers: { 'X-API-Key': key }
      });
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setKeyInfo({ name: data.name, scopes: data.scopes });
      } else {
        setIsAuthenticated(false);
        setKeyInfo(null);
      }
    } catch {
      setIsAuthenticated(false);
      setKeyInfo(null);
    }
  };

  const handleRequestAccess = async () => {
    if (!email || !email.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        setMessage({
          type: 'success',
          text: 'Access request sent! You will receive an email with your API key once approved.'
        });
        setEmail('');
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.detail || 'Failed to send request' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput || !apiKeyInput.startsWith('uht_')) {
      setMessage({ type: 'error', text: 'Please enter a valid API key (starts with uht_)' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/auth/keys/verify', {
        headers: { 'X-API-Key': apiKeyInput }
      });

      if (response.ok) {
        setApiKey(apiKeyInput);
        const data = await response.json();
        setIsAuthenticated(true);
        setKeyInfo({ name: data.name, scopes: data.scopes });
        setMessage({ type: 'success', text: 'API key saved successfully!' });
        setApiKeyInput('');
        setActiveTab('status');
      } else {
        setMessage({ type: 'error', text: 'Invalid API key' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to verify API key' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authLogout();
    setIsAuthenticated(false);
    setKeyInfo(null);
    setMessage({ type: 'info', text: 'Logged out successfully' });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'rgba(26, 26, 26, 0.98)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
        }
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid rgba(0, 229, 255, 0.2)' }}>
        Settings
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {/* Auth Status */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Authentication Status
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isAuthenticated ? (
              <>
                <CheckCircle color="success" />
                <Typography color="success.main">Authenticated</Typography>
                {keyInfo && (
                  <Chip
                    label={keyInfo.name}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </>
            ) : (
              <>
                <Cancel color="error" />
                <Typography color="error.main">Not authenticated</Typography>
              </>
            )}
          </Box>
          {keyInfo && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Scopes: {keyInfo.scopes.join(', ')}
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Tab Buttons */}
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <Button
            variant={activeTab === 'request' ? 'contained' : 'outlined'}
            startIcon={<EmailIcon />}
            onClick={() => setActiveTab('request')}
            size="small"
          >
            Request Access
          </Button>
          <Button
            variant={activeTab === 'apikey' ? 'contained' : 'outlined'}
            startIcon={<KeyIcon />}
            onClick={() => setActiveTab('apikey')}
            size="small"
          >
            Enter API Key
          </Button>
        </Box>

        {/* Request Access Tab */}
        {activeTab === 'request' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter your email to request access. An admin will review your request
              and send you an API key.
            </Typography>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              onClick={handleRequestAccess}
              disabled={loading || !email}
              startIcon={loading ? <CircularProgress size={16} /> : <EmailIcon />}
            >
              {loading ? 'Sending...' : 'Request Access'}
            </Button>
          </Box>
        )}

        {/* Enter API Key Tab */}
        {activeTab === 'apikey' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              If you already have an API key, enter it below to enable
              classification and other LLM features.
            </Typography>
            <TextField
              fullWidth
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="uht_..."
              disabled={loading}
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                    >
                      {showApiKey ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <Button
              variant="contained"
              onClick={handleSaveApiKey}
              disabled={loading || !apiKeyInput}
              startIcon={loading ? <CircularProgress size={16} /> : <KeyIcon />}
            >
              {loading ? 'Verifying...' : 'Save API Key'}
            </Button>
          </Box>
        )}

        {/* Messages */}
        {message && (
          <Alert severity={message.type} sx={{ mt: 2 }}>
            {message.text}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid rgba(0, 229, 255, 0.2)', p: 2 }}>
        {isAuthenticated && (
          <Button color="error" onClick={handleLogout}>
            Logout
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
