import os
import re
import json
from collections import Counter
import google.generativeai as genai
from dotenv import load_dotenv

# Import the function from your other file
from build_graph import build_fib25_graph

# --- API and Prompt Generation Functions ---

def call_gemini_api(prompt):
    """Sends the provided prompt to the Gemini API and returns the response."""
    print("\n--- Calling Gemini API ---")
    
    # Load the API key from the .env file
    load_dotenv()
    api_key = os.getenv("GOOGLE_API_KEY")
    
    if not api_key:
        print("ERROR: GOOGLE_API_KEY not found. Please create a .env file.")
        return None
        
    try:
        genai.configure(api_key=api_key)
        
        # Configure the model - Gemini 2.5 Flash is fast and capable
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Explicitly ask for JSON output
        generation_config = genai.types.GenerationConfig(response_mime_type="application/json")
        
        response = model.generate_content(prompt, generation_config=generation_config)
        
        print("Successfully received response from Gemini.")
        return response.text
    except Exception as e:
        print(f"An error occurred while calling the Gemini API: {e}")
        return None

def extract_json_from_response(text):
    """Extracts a JSON block from the LLM's text response."""
    # The regex looks for a code block starting with ```json and ending with ```
    # re.DOTALL makes `.` match newlines as well
    match = re.search(r'```json\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        json_str = match.group(1)
        try:
            # Validate that the extracted string is valid JSON
            return json.loads(json_str)
        except json.JSONDecodeError:
            print("Error: Found a JSON block, but it was malformed.")
            return None
    else:
        # As a fallback, try to parse the whole text as JSON
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            print("Error: No valid JSON block found in the response.")
            return None

def get_global_context(G):
    # This function is unchanged
    print("\n--- Generating Global Context ---")
    node_types = [G.nodes[n]['node_type'] for n in G.nodes()]
    node_counts = Counter(node_types)
    edge_types = [G.edges[e]['type'] for e in G.edges()]
    edge_counts = Counter(edge_types)
    context_str = "GLOBAL GRAPH STATISTICS:\n"
    context_str += f"- Total Nodes: {G.number_of_nodes()}\n"
    context_str += f"- Total Edges: {G.number_of_edges()}\n\n"
    context_str += "Node Type Distribution:\n"
    for n_type, count in sorted(node_counts.items()):
        context_str += f"  - {n_type}: {count}\n"
    context_str += "\nEdge Type Distribution:\n"
    for e_type, count in sorted(edge_counts.items()):
        context_str += f"  - {e_type}: {count}\n"
    print("Global context generated.")
    return context_str

def get_local_context(G, node_id):
    # This function is unchanged
    if node_id not in G: return f"Node {node_id} not found."
    node_data = G.nodes[node_id]
    node_type = node_data.get('node_type', 'Unknown')
    context_str = f"\n--- LOCAL EXAMPLE: Node '{node_id}' (Type: {node_type}) ---\n"
    context_str += "Properties:\n"
    for key, val in node_data.items():
        if isinstance(val, str) and len(val) > 75: val = val[:75] + "..."
        context_str += f"  - {key}: {val}\n"
    context_str += "\nOutgoing Connections:\n"
    successors = list(G.successors(node_id))
    for neighbor in successors[:5]:
        edge_data = G.get_edge_data(node_id, neighbor)
        edge_type, neighbor_type = edge_data.get('type', 'Unknown'), G.nodes[neighbor].get('node_type', 'Unknown')
        context_str += f"  - Connects TO '{neighbor}' (Type: {neighbor_type}) via a '{edge_type}' edge.\n"
    if len(successors) > 5: context_str += f"  - ... and {len(successors) - 5} more outgoing connections.\n"
    context_str += "\nIncoming Connections:\n"
    predecessors = list(G.predecessors(node_id))
    for neighbor in predecessors[:5]:
        edge_data = G.get_edge_data(neighbor, node_id)
        edge_type, neighbor_type = edge_data.get('type', 'Unknown'), G.nodes[neighbor].get('node_type', 'Unknown')
        context_str += f"  - Receives connection FROM '{neighbor}' (Type: {neighbor_type}) via a '{edge_type}' edge.\n"
    if len(predecessors) > 5: context_str += f"  - ... and {len(predecessors) - 5} more incoming connections.\n"
    return context_str

# --- Main Execution Block ---
if __name__ == "__main__":
    # === PHASE 1: Build Graph ===
    G = build_fib25_graph()

    # === PHASE 2: Generate Prompt ===
    print("\n\n--- Starting Phase 2: Prompt Generation ---")
    global_context_str = get_global_context(G)
    sample_node_ids = ['4270', '22056', '99000000001']
    local_context_str = ""
    for node_id in sample_node_ids:
        print(f"Generating local context for node: {node_id}")
        local_context_str += get_local_context(G, node_id)
    
    final_prompt = f"""You are an expert data architect... (rest of your prompt is the same)""" # Keep your detailed prompt here
    final_prompt = f"""
You are an expert data architect specializing in reverse-engineering database schemas from raw data.
Your task is to analyze the following graph data and produce a detailed schema in a single, clean JSON object. Do not wrap the JSON in markdown backticks.

The schema should define:
1. All node types (e.g., "Neuron", "Synapse").
2. The properties and data types for each node type.
3. All edge types (relationships).
4. For each edge type, define its domain (source node types) and range (target node types).
5. For each edge type, define its cardinality (e.g., one-to-one, one-to-many, many-to-many).

Here is the data for your analysis. First, some high-level statistics about the entire graph:
{global_context_str}
Now, here are some detailed, concrete examples from the graph:
{local_context_str}
Based on the global statistics and the local examples, provide the complete schema in a single JSON object.
"""

    # === PHASE 3: Call API and Save Result ===
    llm_response_text = call_gemini_api(final_prompt)
    
    if llm_response_text:
        # We specified JSON output, so we can try to parse directly
        schema_json = extract_json_from_response(llm_response_text)
        
        if schema_json:
            output_filename = "schema_v1.json"
            with open(output_filename, 'w') as f:
                json.dump(schema_json, f, indent=4)
            print(f"\n--- SUCCESS! ---")
            print(f"Schema has been successfully saved to '{output_filename}'")
        else:
            print("\n--- FAILED ---")
            print("Could not extract a valid JSON object from the LLM response. The raw response was:")
            print(llm_response_text)