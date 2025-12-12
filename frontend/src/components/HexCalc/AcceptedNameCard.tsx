import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton
} from '@mui/material';
import {
  AutoAwesome as NameIcon,
  Close as CancelIcon
} from '@mui/icons-material';

interface AcceptedNameCardProps {
  name: string;
  description: string;
  hexCode: string;
  onClear: () => void;
}

export default function AcceptedNameCard({
  name,
  description,
  hexCode,
  onClear
}: AcceptedNameCardProps) {
  return (
    <Card
      sx={{
        border: '1px solid rgba(76, 175, 80, 0.4)',
        backgroundColor: 'rgba(76, 175, 80, 0.05)'
      }}
    >
      <CardContent sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <NameIcon sx={{ fontSize: 14, color: '#4CAF50' }} />
            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#4CAF50', fontWeight: 600 }}>
              NAMED RESULT
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClear} sx={{ p: 0.25 }}>
            <CancelIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>

        {/* Name */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: 'text.primary',
            mb: 0.5
          }}
        >
          {name}
        </Typography>

        {/* Hex Code */}
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            color: '#4CAF50',
            fontSize: '0.7rem',
            display: 'block',
            mb: 0.75
          }}
        >
          {hexCode}
        </Typography>

        {/* Description */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontSize: '0.65rem',
            lineHeight: 1.4,
            display: 'block'
          }}
        >
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}
