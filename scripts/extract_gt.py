import json
import csv
import os
import glob
import argparse

def clean_label(label_str):
    if not label_str: return ""
    return label_str.lstrip(':').replace('`', '')

def parse_strict_node_json(file_path):
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    nodes = []
    for entry in data:
        node_def = {
            "labels": entry.get("nodeLabels", []),
            "raw_type_string": clean_label(entry.get("nodeType", "")),
            "properties": []
        }
        for prop in entry.get("properties", []):
            prop_def = {
                "name": prop["name"],
                "type": prop["types"][0] if prop["types"] else "Unknown",
                "mandatory": prop["mandatory"]
            }
            node_def["properties"].append(prop_def)
        nodes.append(node_def)
    return nodes

def parse_strict_edge_json(file_path):
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    edges = {}
    for entry in data:
        rel_type = clean_label(entry.get("relType", ""))
        props = []
        for prop in entry.get("properties", []):
            if prop["name"] is None: continue
            prop_def = {
                "name": prop["name"],
                "type": prop["types"][0] if prop["types"] else "Unknown",
                "mandatory": prop["mandatory"]
            }
            props.append(prop_def)
        edges[rel_type] = {"type": rel_type, "properties": props, "topology": []}
    return edges

def parse_edge_csv_topology(file_path, edge_dict):
    with open(file_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row or 'relType' not in row: continue
            rel_type = row['relType'].strip()
            sources_raw = row.get('sources', "").strip("[]")
            targets_raw = row.get('targets', "").strip("[]")
            source_list = [s.strip() for s in sources_raw.split(',') if s.strip()]
            target_list = [t.strip() for t in targets_raw.split(',') if t.strip()]
            
            if rel_type in edge_dict:
                edge_dict[rel_type]["topology"].append({
                    "allowed_sources": source_list,
                    "allowed_targets": target_list
                })

def main():
    parser = argparse.ArgumentParser(description="Extract Golden Truth Schema")
    parser.add_argument("--input_dir", required=True, help="Folder containing _strict.json files (e.g. gt_data_fib25)")
    parser.add_argument("--output_dir", required=True, help="Folder to save the result (e.g. gt_schema)")
    args = parser.parse_args()
    
    # Generate a filename based on the input folder name
    dataset_name = os.path.basename(os.path.normpath(args.input_dir))
    output_file = os.path.join(args.output_dir, f"golden_truth_{dataset_name}.json")

    # Ensure output directory exists
    os.makedirs(args.output_dir, exist_ok=True)

    print(f"🔍 Scanning Ground Truth folder: {args.input_dir}")

    node_files = glob.glob(os.path.join(args.input_dir, "*_node_types_strict.json"))
    edge_files = glob.glob(os.path.join(args.input_dir, "*_edge_types_strict.json"))
    csv_files = glob.glob(os.path.join(args.input_dir, "*_edge_types.csv"))

    if not node_files or not edge_files:
        print(" Error: strict JSON files not found in input directory.")
        return

    nodes = parse_strict_node_json(node_files[0])
    edge_map = parse_strict_edge_json(edge_files[0])

    if csv_files:
        parse_edge_csv_topology(csv_files[0], edge_map)

    final_schema = {
        "dataset_name": dataset_name,
        "node_types": nodes,
        "edge_types": list(edge_map.values())
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_schema, f, indent=4)

    print(f" Golden Truth saved to: {output_file}")

if __name__ == "__main__":
    main()