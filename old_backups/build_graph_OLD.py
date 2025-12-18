import pandas as pd
import networkx as nx
import os

# --- Configuration ---
DATA_PATH = "data"
NODE_FILES = { 'Neuron': { 'file': 'Neuprint_Neurons_fib25.csv', 'id_col': ':ID(Body-ID)' }, 'Synapse': { 'file': 'Neuprint_Synapses_fib25.csv', 'id_col': ':ID(Syn-ID)' }, 'SynapseSet': { 'file': 'Neuprint_SynapseSet_fib25.csv', 'id_col': ':ID' } }
EDGE_FILES = { 'NEURON_CONNECTS_NEURON': { 'file': 'Neuprint_Neuron_Connections_fib25.csv', 'start_col': ':START_ID(Body-ID)', 'end_col': ':END_ID(Body-ID)' }, 'NEURON_TO_SYNAPSESET': { 'file': 'Neuprint_Neuron_to_SynapseSet_fib25.csv', 'start_col': ':START_ID(Body-ID)', 'end_col': ':END_ID' }, 'SYNAPSESET_TO_SYNAPSE': { 'file': 'Neuprint_SynapseSet_to_Synapses_fib25.csv', 'start_col': ':START_ID', 'end_col': ':END_ID(Syn-ID)' } }


# --- Graph Building Function ---
def build_fib25_graph():
    """
    Loads the FIB25 dataset from CSVs and constructs a NetworkX DiGraph.
    This is the main function to be imported by other scripts.
    """
    print("--- Building FIB25 Graph ---")
    G = nx.DiGraph()

    # Load Nodes
    print("Loading Nodes...")
    for node_type, info in NODE_FILES.items():
        file_path = os.path.join(DATA_PATH, info['file'])
        id_col = info['id_col']
        try:
            # low_memory=False helps with the DtypeWarning the user saw
            df = pd.read_csv(file_path, low_memory=False) 
            df[id_col] = df[id_col].astype(str)
            for index, row in df.iterrows():
                node_id = row[id_col]
                properties = row.to_dict()
                properties['node_type'] = node_type # Add this for easier analysis
                G.add_node(node_id, **properties)
            print(f"-> Loaded {len(df)} '{node_type}' nodes.")
        except Exception as e:
            print(f"An error occurred with {file_path}: {e}")

    # Load Edges
    print("\nLoading Edges...")
    for edge_type, info in EDGE_FILES.items():
        file_path = os.path.join(DATA_PATH, info['file'])
        start_col, end_col = info['start_col'], info['end_col']
        try:
            df = pd.read_csv(file_path, low_memory=False)
            df[start_col] = df[start_col].astype(str)
            df[end_col] = df[end_col].astype(str)
            for index, row in df.iterrows():
                start_node, end_node = row[start_col], row[end_col]
                properties = row.to_dict()
                G.add_edge(start_node, end_node, type=edge_type, **properties)
            print(f"-> Loaded {len(df)} '{edge_type}' edges.")
        except Exception as e:
            print(f"An error occurred with {file_path}: {e}")
    
    print("\n--- Graph Build Complete! ---")
    return G


# --- Main Execution Block ---
# This code ONLY runs when you execute `python3 build_graph.py` directly.
# It WILL NOT run when this file is imported by `main.py`.
if __name__ == "__main__":
    G = build_fib25_graph()
    print(f"Final graph has {G.number_of_nodes()} nodes and {G.number_of_edges()} edges.")

    # --- Original Sanity Check ---
    print("\n--- Running Sanity Check ---")
    test_neuron_id = '4270'
    if test_neuron_id in G:
        print(f"Successfully found test neuron: '{test_neuron_id}'")
        print("Properties:")
        for key, value in G.nodes[test_neuron_id].items():
            if isinstance(value, str) and len(value) > 75:
                 value = value[:75] + "..."
            print(f"  - {key}: {value}")
        print(f"Direct outgoing connections: {len(list(G.successors(test_neuron_id)))}")
        print(f"Direct incoming connections: {len(list(G.predecessors(test_neuron_id)))}")
    else:
        print(f"Could not find test neuron '{test_neuron_id}' in the graph.")