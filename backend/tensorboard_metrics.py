#!/usr/bin/env python3
"""Enhanced TensorBoard metrics handler for training monitoring"""

import os
import json
import time
import logging
from pathlib import Path
from typing import Optional, Dict, List, Any, Generator, Tuple
from dataclasses import dataclass, asdict
import threading
from collections import deque

logger = logging.getLogger(__name__)

@dataclass
class MetricPoint:
    """Single metric point with all possible fields"""
    step: Optional[int] = None
    epoch: Optional[float] = None
    ts: Optional[float] = None
    loss: Optional[float] = None
    avr_loss: Optional[float] = None
    lr: Optional[float] = None
    grad_norm: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict, excluding None values"""
        return {k: v for k, v in asdict(self).items() if v is not None}


class TensorBoardMetricsReader:
    """Enhanced TensorBoard metrics reader with caching and error handling"""
    
    # Common TensorBoard tag patterns for sd-scripts
    LOSS_TAGS = [
        'loss/current',
        'loss',
        'training/loss',
        'train/loss',
        'loss/average',
        'avr_loss',
        'train_loss'
    ]
    
    LR_TAGS = [
        'lr/unet',
        'lr/textencoder', 
        'lr/te',
        'learning_rate',
        'lr',
        'optimizer/lr'
    ]
    
    GRAD_NORM_TAGS = [
        'grad_norm',
        'gradient_norm',
        'gradients/norm'
    ]
    
    def __init__(self, tb_dir: str, cache_size: int = 1000):
        self.tb_dir = Path(tb_dir)
        self.cache_size = cache_size
        self._cache: deque = deque(maxlen=cache_size)
        self._last_reload = 0
        self._reload_interval = 2.0  # seconds
        self._ea = None
        self._lock = threading.Lock()
        
    def _find_event_dir(self) -> Optional[Path]:
        """Find the most recent TensorBoard event directory"""
        if not self.tb_dir.exists():
            return None
            
        # Look for event files
        event_files = []
        for root, _, files in os.walk(self.tb_dir):
            for file in files:
                if file.startswith("events.out.tfevents"):
                    full_path = Path(root) / file
                    event_files.append((full_path.stat().st_mtime, Path(root)))
                    
        if not event_files:
            return None
            
        # Return directory with most recent event file
        event_files.sort(reverse=True)
        return event_files[0][1]
    
    def _get_accumulator(self):
        """Get or create EventAccumulator with lazy loading"""
        try:
            from tensorboard.backend.event_processing import event_accumulator
        except ImportError:
            logger.warning("TensorBoard not installed")
            return None
            
        if self._ea is None or time.time() - self._last_reload > self._reload_interval:
            event_dir = self._find_event_dir()
            if not event_dir:
                return None
                
            try:
                self._ea = event_accumulator.EventAccumulator(str(event_dir))
                self._ea.Reload()
                self._last_reload = time.time()
            except Exception as e:
                logger.error(f"Failed to load TensorBoard events: {e}")
                return None
                
        return self._ea
    
    def _find_best_tag(self, tags: List[str], patterns: List[str]) -> Optional[str]:
        """Find the best matching tag from patterns"""
        for pattern in patterns:
            if pattern in tags:
                return pattern
        
        # Fallback: find any tag containing key words
        for tag in tags:
            tag_lower = tag.lower()
            for pattern in patterns:
                if pattern.split('/')[-1] in tag_lower:
                    return tag
        
        return None
    
    def get_recent_metrics(self, limit: int = 512) -> Tuple[List[Dict], str]:
        """Get recent metrics from TensorBoard"""
        with self._lock:
            ea = self._get_accumulator()
            if not ea:
                return [], "none"
                
            try:
                tags = ea.Tags().get('scalars', [])
                if not tags:
                    return [], "tensorboard"
                    
                # Find best tags for each metric type
                loss_tag = self._find_best_tag(tags, self.LOSS_TAGS)
                lr_tag = self._find_best_tag(tags, self.LR_TAGS)
                grad_norm_tag = self._find_best_tag(tags, self.GRAD_NORM_TAGS)
                
                if not loss_tag:
                    logger.warning(f"No loss tag found in: {tags}")
                    return [], "tensorboard"
                
                # Collect all events
                events_by_step = {}
                
                # Get loss events
                for event in ea.Scalars(loss_tag):
                    step = event.step
                    if step not in events_by_step:
                        events_by_step[step] = MetricPoint()
                    events_by_step[step].step = step
                    events_by_step[step].ts = event.wall_time
                    events_by_step[step].loss = event.value
                
                # Get LR events if available
                if lr_tag:
                    for event in ea.Scalars(lr_tag):
                        step = event.step
                        if step not in events_by_step:
                            events_by_step[step] = MetricPoint()
                        events_by_step[step].lr = event.value
                
                # Get gradient norm if available
                if grad_norm_tag:
                    for event in ea.Scalars(grad_norm_tag):
                        step = event.step
                        if step in events_by_step:
                            events_by_step[step].grad_norm = event.value
                
                # Convert to list and sort by step
                metrics = [point.to_dict() for point in events_by_step.values()]
                metrics.sort(key=lambda x: x.get('step', 0))
                
                # Apply limit
                if limit > 0:
                    metrics = metrics[-limit:]
                
                # Update cache
                self._cache.clear()
                self._cache.extend(metrics)
                
                return metrics, "tensorboard"
                
            except Exception as e:
                logger.error(f"Error reading TensorBoard metrics: {e}")
                return list(self._cache)[-limit:] if self._cache else [], "tensorboard"
    
    def stream_metrics(self) -> Generator[str, None, None]:
        """Stream metrics as Server-Sent Events"""
        last_step = -1
        error_count = 0
        max_errors = 5
        
        while error_count < max_errors:
            try:
                metrics, source = self.get_recent_metrics(limit=10)
                
                if metrics:
                    # Find new metrics
                    new_metrics = [m for m in metrics if m.get('step', -1) > last_step]
                    
                    for metric in new_metrics:
                        yield f"data: {json.dumps(metric)}\n\n"
                        last_step = max(last_step, metric.get('step', -1))
                    
                    error_count = 0  # Reset on success
                
                # Send heartbeat
                yield f"data: {json.dumps({'heartbeat': True})}\n\n"
                time.sleep(1.0)
                
            except Exception as e:
                logger.error(f"Stream error: {e}")
                error_count += 1
                time.sleep(2.0)
        
        # Too many errors, notify client
        yield f"data: {json.dumps({'error': 'Too many errors, stopping stream'})}\n\n"


class CSVMetricsReader:
    """Fallback CSV metrics reader for sd-scripts output"""
    
    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self._cache = []
        self._last_mtime = 0
        
    def get_recent_metrics(self, limit: int = 512) -> Tuple[List[Dict], str]:
        """Read metrics from CSV file"""
        if not self.csv_path.exists():
            return [], "none"
            
        try:
            import csv
            
            # Always re-read the file to get latest data
            metrics = []
            with open(self.csv_path, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    point = MetricPoint()
                    
                    # Parse fields
                    if 'step' in row:
                        point.step = int(row['step'])
                    if 'epoch' in row:
                        point.epoch = float(row['epoch'])
                    if 'loss' in row:
                        point.loss = float(row['loss'])
                    if 'avr_loss' in row:
                        point.avr_loss = float(row['avr_loss'])
                    if 'lr' in row:
                        point.lr = float(row['lr'])
                    if 'grad_norm' in row and row['grad_norm']:
                        try:
                            point.grad_norm = float(row['grad_norm'])
                        except (ValueError, TypeError):
                            pass
                    
                    metrics.append(point.to_dict())
            
            self._cache = metrics
            self._last_mtime = self.csv_path.stat().st_mtime
            
            return metrics[-limit:] if limit > 0 else metrics, "csv"
            
        except Exception as e:
            logger.error(f"Error reading CSV metrics: {e}")
            return self._cache[-limit:] if self._cache else [], "csv"
    
    def stream_metrics(self) -> Generator[str, None, None]:
        """Stream CSV metrics as SSE"""
        last_step = -1
        
        while True:
            try:
                metrics, _ = self.get_recent_metrics(limit=0)  # Get all metrics
                
                # Find new metrics by step number
                new_metrics = []
                for metric in metrics:
                    step = metric.get('step', -1)
                    if step > last_step:
                        new_metrics.append(metric)
                
                if new_metrics:
                    # Sort by step to ensure proper order
                    new_metrics.sort(key=lambda m: m.get('step', -1))
                    
                    # Send new metrics
                    for metric in new_metrics:
                        yield f"data: {json.dumps(metric)}\n\n"
                        last_step = max(last_step, metric.get('step', -1))
                
                # Heartbeat
                yield f"data: {json.dumps({'heartbeat': True})}\n\n"
                time.sleep(1.0)
                
            except Exception as e:
                logger.error(f"CSV stream error: {e}")
                time.sleep(2.0)


class MetricsManager:
    """Manager for handling both TensorBoard and CSV metrics"""
    
    def __init__(self, output_name: str, outputs_dir: Path):
        self.output_name = output_name
        self.output_dir = outputs_dir / output_name
        
        # Initialize readers
        self.tb_reader = TensorBoardMetricsReader(self.output_dir / "tb")
        self.csv_reader = CSVMetricsReader(self.output_dir / f"{output_name}_metrics.csv")
        
    def get_recent(self, limit: int = 512, source: Optional[str] = None) -> Dict[str, Any]:
        """Get recent metrics from specified or best available source"""
        
        if source == "tb":
            metrics, src = self.tb_reader.get_recent_metrics(limit)
        elif source == "csv":
            metrics, src = self.csv_reader.get_recent_metrics(limit)
        else:
            # Auto-detect: prefer TensorBoard if available
            metrics, src = self.tb_reader.get_recent_metrics(limit)
            if not metrics or src == "none":
                metrics, src = self.csv_reader.get_recent_metrics(limit)
        
        return {
            "items": metrics,
            "source": src,
            "count": len(metrics)
        }
    
    def stream(self, source: Optional[str] = None) -> Generator[str, None, None]:
        """Stream metrics from specified or best available source"""
        
        if source == "tb":
            yield from self.tb_reader.stream_metrics()
        elif source == "csv":
            yield from self.csv_reader.stream_metrics()
        else:
            # Auto-detect
            tb_metrics, tb_src = self.tb_reader.get_recent_metrics(limit=1)
            if tb_metrics and tb_src == "tensorboard":
                yield from self.tb_reader.stream_metrics()
            else:
                yield from self.csv_reader.stream_metrics()


# FastAPI integration helpers
def create_metrics_manager(output_name: str, outputs_dir: str = "outputs") -> MetricsManager:
    """Create a metrics manager for the given output"""
    return MetricsManager(output_name, Path(outputs_dir))


def get_recent_metrics_endpoint(
    name: str, 
    limit: int = 512, 
    source: Optional[str] = None,
    outputs_dir: str = "outputs"
) -> Dict[str, Any]:
    """FastAPI endpoint handler for recent metrics"""
    manager = create_metrics_manager(name, outputs_dir)
    return manager.get_recent(limit, source)


def stream_metrics_endpoint(
    name: str,
    source: Optional[str] = None,
    outputs_dir: str = "outputs"
) -> Generator[str, None, None]:
    """FastAPI SSE endpoint handler for streaming metrics"""
    manager = create_metrics_manager(name, outputs_dir)
    yield from manager.stream(source)