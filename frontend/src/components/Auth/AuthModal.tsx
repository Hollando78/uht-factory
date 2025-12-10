import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Typography,
  InputAdornment
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register';
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function AuthModal({ open, onClose, initialTab = 'login' }: AuthModalProps) {
  const { login, register, state, clearError } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab === 'register' ? 1 : 0);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // Local state
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!loginEmail || !loginPassword) {
      setLocalError('Please fill in all fields');
      return;
    }

    const success = await login(loginEmail, loginPassword);
    if (success) {
      handleClose();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (!registerEmail || !registerPassword || !registerConfirmPassword) {
      setLocalError('Please fill in all fields');
      return;
    }

    if (registerPassword.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    const result = await register(registerEmail, registerPassword);
    if (result.success) {
      setSuccessMessage(result.message);
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
    }
  };

  const handleClose = () => {
    setLoginEmail('');
    setLoginPassword('');
    setRegisterEmail('');
    setRegisterPassword('');
    setRegisterConfirmPassword('');
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
    onClose();
  };

  const error = localError || state.error;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'background.paper',
          border: '1px solid rgba(0, 229, 255, 0.3)'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography component="span" variant="h6">Account</Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          centered
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { minWidth: 100 }
          }}
        >
          <Tab label="Login" />
          <Tab label="Register" />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => { setLocalError(null); clearError(); }}>
            {error}
          </Alert>
        )}

        {successMessage && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {successMessage}
          </Alert>
        )}

        {/* Login Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box component="form" onSubmit={handleLogin} autoComplete="on" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              name="email"
              id="login-email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              fullWidth
              autoComplete="username email"
              autoFocus={activeTab === 0}
              disabled={state.isLoading}
            />
            <TextField
              label="Password"
              type={showLoginPassword ? 'text' : 'password'}
              name="password"
              id="login-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
              disabled={state.isLoading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      edge="end"
                      size="small"
                    >
                      {showLoginPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={state.isLoading}
              sx={{ mt: 1 }}
            >
              {state.isLoading ? <CircularProgress size={24} /> : 'Login'}
            </Button>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Don't have an account? Click the Register tab above.
            </Typography>
          </Box>
        </TabPanel>

        {/* Register Tab */}
        <TabPanel value={activeTab} index={1}>
          <Box component="form" onSubmit={handleRegister} autoComplete="on" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              name="email"
              id="register-email"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              fullWidth
              autoComplete="email"
              autoFocus={activeTab === 1}
              disabled={state.isLoading}
            />
            <TextField
              label="Password"
              type={showRegisterPassword ? 'text' : 'password'}
              name="new-password"
              id="register-password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              fullWidth
              autoComplete="new-password"
              disabled={state.isLoading}
              helperText="At least 8 characters"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      edge="end"
                      size="small"
                    >
                      {showRegisterPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <TextField
              label="Confirm Password"
              type={showRegisterPassword ? 'text' : 'password'}
              name="confirm-password"
              id="register-confirm-password"
              value={registerConfirmPassword}
              onChange={(e) => setRegisterConfirmPassword(e.target.value)}
              fullWidth
              autoComplete="new-password"
              disabled={state.isLoading}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={state.isLoading}
              sx={{ mt: 1 }}
            >
              {state.isLoading ? <CircularProgress size={24} /> : 'Create Account'}
            </Button>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Already have an account? Click the Login tab above.
            </Typography>
          </Box>
        </TabPanel>
      </DialogContent>
    </Dialog>
  );
}
