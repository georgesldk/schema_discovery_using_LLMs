import os
import json
import random
import argparse
import networkx as nx
import google.generativeai as genai
from dotenv import load_dotenv
from collections import Counter
from build_graph import build_graph

# --- Profiling Functions ---
def profile_node_type(G, target_type):
    nodes_of_type = [n for n, attr in G.nodes(data=True) if attr.get('node_type') == target_type]
    count = len(nodes_of_type)
    if count == 0: return ""
    
    sample_size = min(count, 1000)
    sample_nodes = random.sample(nodes_of_type, sample_size)
    all_keys = set()
    for n in sample_nodes: all_keys.update(G.nodes[n].keys())
    if 'node_type' in all_keys: all_keys.remove('node_type')

    profile = f"\n  Node Type: '{target_type}' (Count: {count})\n"
    for key in all_keys:
        all_values_dict = nx.get_node_attributes(G, key)
        relevant_values = [all_values_dict[n] for n in nodes_of_type if n in all_values_dict]
        non_null_count = len(relevant_values)
        if non_null_count == 0: continue
        
        sample_val = relevant_values[0]
        inferred_type = type(sample_val).__name__
        unique_examples = list(set(str(v) for v in relevant_values[:20]))[:5]
        
        profile += f"    - Property '{key}': Found in {non_null_count}/{count} nodes. Type: '{inferred_type}'. Examples: {unique_examples}\n"
    return profile

def profile_edge_type(G, target_type):
    edges_of_type = [(u, v, attr) for u, v, attr in G.edges(data=True) if attr.get('type') == target_type]
    count = len(edges_of_type)
    if count == 0: return ""
    
    connections = []
    for u, v, _ in edges_of_type[:50]: 
        src_type = G.nodes[u].get('node_type', 'Unknown')
        tgt_type = G.nodes[v].get('node_type', 'Unknown')
        connections.append(f"{src_type}->{tgt_type}")
    common_topology = Counter(connections).most_common(5)
    
    sample_edges = edges_of_type[:100]
    all_keys = set()
    for _, _, attr in sample_edges: all_keys.update(attr.keys())
    if 'type' in all_keys: all_keys.remove('type')

    profile = f"\n  Edge Type: '{target_type}' (Count: {count})\n"
    profile += f"    - Top Connections: {common_topology}\n"
    for key in all_keys:
        values = [attr.get(key) for _, _, attr in edges_of_type if attr.get(key) is not None]
        non_null_count = len(values)
        if non_null_count == 0: continue
        inferred_type = type(values[0]).__name__
        profile += f"    - Property '{key}': Found in {non_null_count}/{count} edges. Type: {inferred_type}.\n"
    return profile

def call_gemini_api(prompt):
    load_dotenv()
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key: return None
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash')
    try:
        response = model.generate_content(prompt, generation_config=genai.types.GenerationConfig(response_mime_type="application/json"))
        return response.text
    except Exception as e:
        print(f"Error: {e}")
        return None

def extract_json(text):
    try:
        text = text.strip().replace("```json", "").replace("```", "")
        return json.loads(text)
    except: return None

# --- Main Logic ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", required=True, help="Folder containing raw CSVs (e.g. pg_data)")
    parser.add_argument("--output_dir", required=True, help="Folder to save inferred schema (e.g. schema_found)")
    args = parser.parse_args()
    
    output_file = os.path.join(args.output_dir, "inferred_schema.json")
    os.makedirs(args.output_dir, exist_ok=True)

    # 1. Build Graph
    G = build_graph(args.data_dir)
    
    if G.number_of_nodes() == 0:
        print("Graph is empty. Exiting.")
        exit()

    # 2. Profile
    print("\n--- Profiling Data ---")
    node_types = set(nx.get_node_attributes(G, 'node_type').values())
    edge_types = set(nx.get_edge_attributes(G, 'type').values())
    
    context_report = f"Total Nodes: {G.number_of_nodes()}\nTotal Edges: {G.number_of_edges()}\n"
    for nt in node_types: context_report += profile_node_type(G, nt)
    for et in edge_types: context_report += profile_edge_type(G, et)
        
    # 3. Ask API
    print("\n--- Asking Gemini ---")
    prompt = f"""
    You are a Data Architect. Reverse-engineer the schema from this profile.
    
    DATA PROFILE:
    {context_report}
    
    INSTRUCTIONS:
    1. Identify Node Types and Edge Types.
    2. Infer properties and valid data types (String, Long, Double, Boolean).
    3. Determine 'mandatory' (true if property found in >90% of nodes/edges).
    4. Generalize names (e.g. 'Neuron_Connections' -> 'CONNECTS_TO').
    5. 'roiInfo' is a JSON String.
    
    OUTPUT JSON:
    {{ "node_types": [...], "edge_types": [...] }}
    """
    
    response = call_gemini_api(prompt)
    if response:
        schema = extract_json(response)
        with open(output_file, "w") as f:
            json.dump(schema, f, indent=4)
        print(f" Inferred Schema saved to '{output_file}'")
    else:
        print(" API failed.")