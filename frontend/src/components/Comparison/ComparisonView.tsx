import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { Compare as CompareIcon } from '@mui/icons-material';

export default function ComparisonView() {
  return (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card sx={{ maxWidth: 400 }}>
        <CardContent sx={{ textAlign: 'center', p: 4 }}>
          <CompareIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            UHT vs Embeddings Comparison
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Coming soon: Compare UHT classifications with semantic embeddings
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}