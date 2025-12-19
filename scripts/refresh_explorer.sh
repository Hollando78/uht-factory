#!/bin/bash
# Refresh embedding explorer data: embeddings, projections, and cluster labels
# Run nightly at 3am via cron

set -e
cd /root/project/uht-factory
source venv/bin/activate

LOG_FILE="/var/log/uht-explorer-refresh.log"

echo "========================================" >> $LOG_FILE
echo "Explorer refresh started: $(date)" >> $LOG_FILE

# Step 1: Generate embeddings for new entities
echo "[1/3] Generating embeddings..." >> $LOG_FILE
python3 scripts/batch_generate_embeddings.py >> $LOG_FILE 2>&1

# Step 2: Recompute all projections (UMAP, t-SNE, UHT-UMAP, UHT-PaCMAP)
echo "[2/3] Computing all projections..." >> $LOG_FILE
python3 scripts/compute_projections.py --method all >> $LOG_FILE 2>&1

# Step 3: Regenerate cluster labels
echo "[3/3] Computing cluster labels..." >> $LOG_FILE
python3 scripts/precompute_cluster_labels.py >> $LOG_FILE 2>&1

echo "Explorer refresh completed: $(date)" >> $LOG_FILE
echo "========================================" >> $LOG_FILE
