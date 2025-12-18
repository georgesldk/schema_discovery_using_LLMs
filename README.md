HOW TO RUN FOR FIB25 PG DATASET

RUN FOLLOWING COMMANDS

python3 scripts/extract_gt.py --input_dir gt_data_fib25 --output_dir gt_schema

python3 scripts/main.py --data_dir pg_data_fib25 --output_dir schema_found

python3 scripts/compare_schemas.py \
  --gt_file gt_schema/golden_truth_gt_data_fib25.json \
  --inferred_file schema_found/inferred_schema.json



  "I have developed a dataset-agnostic pipeline for automated Property Graph schema discovery and benchmarking. The system utilizes an LLM (Gemini) to reverse-engineer graph schemas directly from raw CSV files by analyzing statistical profiles of nodes and edges, achieving extremely high accuracy (e.g., >97% on the Fib25 dataset). The repository is designed for flexibility, allowing us to test any dataset by simply pointing the scripts to a new data folder. To use it, simply run the three distinct stages: execute scripts/extract_gt.py to parse the official Ground Truth definitions, run scripts/main.py to perform the AI inference on your raw data folder (currently pg_data_fib25), and finally run scripts/compare_schemas.py to generate a detailed report benchmarking the inferred schema against the Golden Truth."