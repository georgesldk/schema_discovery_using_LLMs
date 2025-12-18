import json
import sys
import os
import argparse
from difflib import SequenceMatcher

def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {path}: {e}")
        sys.exit(1)

def similar(a, b):
    if not a or not b: return 0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def find_best_match(name, target_list):
    best_score = 0
    best_match = None
    for target in target_list:
        score = similar(name, target)
        if score > 0.8:
            if score > best_score:
                best_score = score
                best_match = target
    return best_match

def compare_properties(gt_props, inf_props):
    gt_names = {str(p['name']) for p in gt_props if p.get('name')}
    inf_names = {str(p['name']) for p in inf_props if p.get('name')}
    return gt_names.intersection(inf_names), gt_names - inf_names, inf_names - gt_names

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--gt_file", required=True, help="Path to Golden Truth JSON")
    parser.add_argument("--inferred_file", required=True, help="Path to Inferred Schema JSON")
    args = parser.parse_args()
    
    if not os.path.exists(args.gt_file) or not os.path.exists(args.inferred_file):
        print(" Error: One or both input files do not exist.")
        return

    gt = load_json(args.gt_file)
    inf = load_json(args.inferred_file)
    
    print(f"\n==== SCHEMA COMPARISON REPORT ====")
    print(f"GT: {os.path.basename(args.gt_file)}")
    print(f"Inferred: {os.path.basename(args.inferred_file)}")
    
    # 1. Node Types
    print("\n--- 1. Node Types ---")
    gt_nodes = {n.get('name') or n.get('labels')[0]: n for n in gt.get('node_types', [])}
    inf_nodes = {n.get('name') or n.get('labels', [''])[0]: n for n in inf.get('node_types', [])}
    
    matches = []
    for gt_name in gt_nodes:
        match_name = find_best_match(gt_name, inf_nodes.keys())
        if match_name:
            print(f" Match: GT '{gt_name}' <--> Inferred '{match_name}'")
            matches.append((gt_name, match_name))
        else:
            print(f" Missed: GT '{gt_name}' not found.")
            
    # 2. Properties
    print("\n--- 2. Property Accuracy ---")
    total_props, total_matches = 0, 0
    for gt_name, inf_name in matches:
        print(f"\nNode: {gt_name}")
        tp, fn, fp = compare_properties(gt_nodes[gt_name].get('properties', []), inf_nodes[inf_name].get('properties', []))
        total_props += len(gt_nodes[gt_name].get('properties', []))
        total_matches += len(tp)
        if tp: print(f"    Correct: {len(tp)}")
        if fn: print(f"    Missing: {', '.join(fn)}")
        if fp: print(f"     Extra: {', '.join(fp)}")

    # 3. Edges
    print("\n--- 3. Edge Types ---")
    gt_edges = {e.get('type') or e.get('name'): e for e in gt.get('edge_types', [])}
    inf_edges = {e.get('type') or e.get('name'): e for e in inf.get('edge_types', [])}
    
    for gt_name in gt_edges:
        match_name = find_best_match(gt_name, inf_edges.keys())
        if match_name:
            print(f" Match: Edge '{gt_name}' <--> '{match_name}'")
            tp, fn, fp = compare_properties(gt_edges[gt_name].get('properties', []), inf_edges[match_name].get('properties', []))
            if fn: print(f"    Edge missing props: {fn}")
        else:
            print(f" Missed Edge: '{gt_name}'")

    if total_props > 0:
        print(f"\nFINAL PROPERTY SCORE: {(total_matches/total_props)*100:.2f}%")

if __name__ == "__main__":
    main()