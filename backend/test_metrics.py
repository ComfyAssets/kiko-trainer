#!/usr/bin/env python3
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

# Test direct import
print("Testing metrics module...")

# Test 1: Check paths
ROOT = Path(__file__).resolve().parent.parent
print(f"ROOT: {ROOT}")
print(f"outputs dir: {ROOT / 'outputs'}")
print(f"exists: {(ROOT / 'outputs').exists()}")
print(f"CSV file: {ROOT / 'outputs' / 'KittyBear-v0.12' / 'KittyBear-v0.12_metrics.csv'}")
print(f"CSV exists: {(ROOT / 'outputs' / 'KittyBear-v0.12' / 'KittyBear-v0.12_metrics.csv').exists()}")

# Test 2: Try the enhanced module
try:
    from tensorboard_metrics import create_metrics_manager
    print("\n✓ Enhanced module imported successfully")
    
    manager = create_metrics_manager('KittyBear-v0.12', str(ROOT / 'outputs'))
    result = manager.get_recent(limit=5)
    print(f"✓ Enhanced module result: {result['count']} items from {result['source']}")
    for item in result['items'][:3]:
        print(f"  - {item}")
except Exception as e:
    print(f"\n✗ Enhanced module error: {e}")
    import traceback
    traceback.print_exc()

# Test 3: Try the old implementation
print("\nTesting old implementation...")
csv_path = ROOT / 'outputs' / 'KittyBear-v0.12' / 'KittyBear-v0.12_metrics.csv'
if csv_path.exists():
    import csv
    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        print(f"✓ CSV has {len(rows)} rows")
        print(f"  Last 3 rows:")
        for row in rows[-3:]:
            print(f"    {row}")