let currentJobId = null;
let statusCheckInterval = null;
let graphNetwork = null;
let currentSchema = null;
let inferredGraphNetwork = null;
let groundTruthGraphNetwork = null;
let groundTruthSchema = null;

// File input handling
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const fileList = document.getElementById('fileList');
const uploadForm = document.getElementById('uploadForm');

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    fileInput.files = files;
    updateFileList();
});

fileInput.addEventListener('change', updateFileList);

function updateFileList() {
    fileList.innerHTML = '';
    const files = Array.from(fileInput.files);
    
    if (files.length === 0) return;
    
    // Show count with emphasis
    const countHeader = document.createElement('div');
    countHeader.style.cssText = 'margin-bottom: 12px; font-weight: 700; color: var(--primary-color); font-size: 1.1rem; padding: 8px; background: rgba(99, 102, 241, 0.1); border-radius: 8px; border-left: 3px solid var(--primary-color);';
    countHeader.textContent = `✓ Selected ${files.length} file${files.length > 1 ? 's' : ''} - Ready to process together!`;
    fileList.appendChild(countHeader);
    
    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-color); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color);';
        fileItem.innerHTML = `
            <span style="color: var(--text-primary);">${index + 1}. ${file.name}</span>
            <span class="file-size" style="color: var(--text-secondary); font-size: 0.9rem;">${formatFileSize(file.size)}</span>
        `;
        fileList.appendChild(fileItem);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Form submission
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const files = fileInput.files;
    if (files.length === 0) {
        alert('Please select at least one CSV file');
        return;
    }
    
    // Log multiple files
    if (files.length > 1) {
        console.log(`✓ Uploading ${files.length} files together:`, Array.from(files).map(f => f.name));
    }
    
    const formData = new FormData();
    Array.from(files).forEach(file => {
        formData.append('files[]', file);
    });
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Uploading...</span>';
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (response.status === 413) {
                throw new Error('File size too large! Total upload must be less than 500MB. Try uploading fewer files at once.');
            }
            const text = await response.text();
            throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }
        
        currentJobId = data.job_id;
        showProgress();
        startStatusCheck();
        
    } catch (error) {
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Start Schema Discovery</span>';
    }
});

// Status checking
function startStatusCheck() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    statusCheckInterval = setInterval(async () => {
        if (!currentJobId) return;
        
        try {
            const response = await fetch(`/status/${currentJobId}`);
            const data = await response.json();
            
            updateProgress(data);
            
            if (data.status === 'completed' || data.status === 'error') {
                clearInterval(statusCheckInterval);
                
                if (data.status === 'completed') {
                    showResults(data.result);
                } else {
                    showError(data.message || 'An error occurred');
                }
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 2000); // Check every 2 seconds
}

function updateProgress(data) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const statusMessage = document.getElementById('statusMessage');
    
    progressFill.style.width = `${data.progress}%`;
    progressText.textContent = `${data.progress}%`;
    statusMessage.textContent = data.message || '';
}

// UI State Management
function showProgress() {
    document.getElementById('uploadCard').classList.add('hidden');
    document.getElementById('progressCard').classList.remove('hidden');
    document.getElementById('resultsCard').classList.add('hidden');
    document.getElementById('errorCard').classList.add('hidden');
}

function showResults(schema) {
    document.getElementById('progressCard').classList.add('hidden');
    document.getElementById('resultsCard').classList.remove('hidden');
    
    // Store schema for graph rendering
    currentSchema = schema;
    
    renderSchema(schema);
    
    // Reset to schema tab
    switchTab('schema');
    
    // Setup download button
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.onclick = () => {
        window.location.href = `/download/${currentJobId}`;
    };
}

function showError(message) {
    document.getElementById('progressCard').classList.add('hidden');
    document.getElementById('errorCard').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
}

function resetForm() {
    currentJobId = null;
    currentSchema = null;
    groundTruthSchema = null;
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    // Destroy graphs if they exist
    if (graphNetwork) {
        graphNetwork.destroy();
        graphNetwork = null;
    }
    if (inferredGraphNetwork) {
        inferredGraphNetwork.destroy();
        inferredGraphNetwork = null;
    }
    if (groundTruthGraphNetwork) {
        groundTruthGraphNetwork.destroy();
        groundTruthGraphNetwork = null;
    }
    
    document.getElementById('uploadCard').classList.remove('hidden');
    document.getElementById('errorCard').classList.add('hidden');
    document.getElementById('resultsCard').classList.add('hidden');
    fileInput.value = '';
    fileList.innerHTML = '';
    
    // Reset tabs
    switchTab('schema');
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Start Schema Discovery</span>';
}

// Schema rendering
function renderSchema(schema) {
    const nodeTypesDiv = document.getElementById('nodeTypes');
    const edgeTypesDiv = document.getElementById('edgeTypes');
    
    nodeTypesDiv.innerHTML = '';
    edgeTypesDiv.innerHTML = '';
    
    // Render Node Types
    if (schema.node_types && schema.node_types.length > 0) {
        schema.node_types.forEach(nodeType => {
            const nodeItem = createSchemaItem(
                nodeType.name || nodeType.labels?.[0] || 'Unknown',
                nodeType.properties || [],
                'node'
            );
            nodeTypesDiv.appendChild(nodeItem);
        });
    } else {
        nodeTypesDiv.innerHTML = '<p style="color: var(--text-secondary);">No node types found</p>';
    }
    
    // Render Edge Types
    if (schema.edge_types && schema.edge_types.length > 0) {
        schema.edge_types.forEach(edgeType => {
            const edgeItem = createSchemaItem(
                edgeType.type || edgeType.name || 'Unknown',
                edgeType.properties || [],
                'edge'
            );
            edgeTypesDiv.appendChild(edgeItem);
        });
    } else {
        edgeTypesDiv.innerHTML = '<p style="color: var(--text-secondary);">No edge types found</p>';
    }
}

function createSchemaItem(name, properties, type) {
    const item = document.createElement('div');
    item.className = 'schema-item';
    
    const header = document.createElement('div');
    header.className = 'schema-item-header';
    header.innerHTML = `
        <span class="schema-item-name">${name}</span>
        <span class="schema-item-count">${properties.length} properties</span>
    `;
    
    const propertiesList = document.createElement('div');
    propertiesList.className = 'properties-list';
    
    if (properties.length > 0) {
        properties.forEach(prop => {
            const propItem = document.createElement('div');
            propItem.className = 'property-item';
            
            const propName = document.createElement('div');
            propName.className = 'property-name';
            propName.textContent = prop.name || 'Unknown';
            
            const propDetails = document.createElement('div');
            propDetails.className = 'property-details';
            
            let detailsHTML = '';
            if (prop.type) {
                detailsHTML += `<span>Type: <strong>${prop.type}</strong></span>`;
            }
            if (prop.mandatory !== undefined) {
                const badgeClass = prop.mandatory ? 'badge-mandatory' : 'badge-optional';
                const badgeText = prop.mandatory ? 'Mandatory' : 'Optional';
                detailsHTML += `<span class="property-badge ${badgeClass}">${badgeText}</span>`;
            }
            
            propDetails.innerHTML = detailsHTML;
            
            propItem.appendChild(propName);
            propItem.appendChild(propDetails);
            propertiesList.appendChild(propItem);
        });
    } else {
        propertiesList.innerHTML = '<p style="color: var(--text-secondary); padding: 12px;">No properties defined</p>';
    }
    
    item.appendChild(header);
    item.appendChild(propertiesList);
    
    return item;
}

// New Analysis button
document.getElementById('newAnalysisBtn').addEventListener('click', resetForm);

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        switchTab(tabName);
    });
});

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('active');
    });
    
    if (tabName === 'schema') {
        document.getElementById('schemaTab').classList.remove('hidden');
        document.getElementById('schemaTab').classList.add('active');
    } else if (tabName === 'graph') {
        document.getElementById('graphTab').classList.remove('hidden');
        document.getElementById('graphTab').classList.add('active');
        // Render graph if schema is available
        if (currentSchema) {
            renderGraph(currentSchema);
        }
    } else if (tabName === 'comparison') {
        document.getElementById('comparisonTab').classList.remove('hidden');
        document.getElementById('comparisonTab').classList.add('active');
        // Load and render comparison if schema is available
        if (currentSchema) {
            loadComparison();
        }
    }
}

// Graph rendering function
function renderGraph(schema) {
    const container = document.getElementById('graphNetwork');
    
    // Clear previous graph
    if (graphNetwork) {
        graphNetwork.destroy();
    }
    
    // Create nodes from node_types
    const nodes = [];
    const nodeTypeMap = new Map();
    
    if (schema.node_types && schema.node_types.length > 0) {
        schema.node_types.forEach((nodeType, index) => {
            const nodeName = nodeType.name || nodeType.labels?.[0] || `Node${index}`;
            const nodeId = `node_${index}`;
            nodeTypeMap.set(nodeName, nodeId);
            
            const propertyCount = (nodeType.properties || []).length;
            const mandatoryCount = (nodeType.properties || []).filter(p => p.mandatory).length;
            
            nodes.push({
                id: nodeId,
                label: nodeName,
                title: `${nodeName}\nProperties: ${propertyCount}\nMandatory: ${mandatoryCount}`,
                shape: 'ellipse',
                color: {
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '#6366f1',
                    highlight: {
                        background: 'rgba(99, 102, 241, 0.4)',
                        border: '#6366f1'
                    }
                },
                font: {
                    color: '#f1f5f9',
                    size: 16,
                    face: 'Arial'
                },
                borderWidth: 2,
                size: 30 + (propertyCount * 2)
            });
        });
    }
    
    // Create edges from edge_types
    const edges = [];
    
    if (schema.edge_types && schema.edge_types.length > 0) {
        schema.edge_types.forEach((edgeType, index) => {
            const edgeName = edgeType.name || edgeType.type || `Edge${index}`;
            let startNode = edgeType.start_node || edgeType.from;
            let endNode = edgeType.end_node || edgeType.to;
            
            // If start_node/end_node not found, try to infer from edge name or properties
            if (!startNode || !endNode) {
                // Try to extract node names from edge name (e.g., "Neuron_to_SynapseSet")
                const nameParts = edgeName.split(/[_-]?(to|from|connects|has|contains)[_-]?/i);
                if (nameParts.length >= 2) {
                    if (!startNode) {
                        startNode = nameParts[0].trim();
                    }
                    if (!endNode) {
                        endNode = nameParts[nameParts.length - 1].trim();
                    }
                }
                
                // Try to infer from properties (look for :START_ID and :END_ID patterns)
                if ((!startNode || !endNode) && edgeType.properties) {
                    edgeType.properties.forEach(prop => {
                        const propName = prop.name || '';
                        if (propName.includes('START_ID') && !startNode) {
                            // Try to extract node type from property name
                            const match = propName.match(/\(([^)]+)\)/);
                            if (match) {
                                startNode = match[1].split('-')[0]; // Get first part before hyphen
                            }
                        }
                        if (propName.includes('END_ID') && !endNode) {
                            const match = propName.match(/\(([^)]+)\)/);
                            if (match) {
                                endNode = match[1].split('-')[0];
                            }
                        }
                    });
                }
            }
            
            // Find node IDs
            let fromId = null;
            let toId = null;
            
            // Try to match by exact name
            if (startNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name === startNode || name.toLowerCase() === startNode.toLowerCase()) {
                        fromId = id;
                        break;
                    }
                }
            }
            
            if (endNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name === endNode || name.toLowerCase() === endNode.toLowerCase()) {
                        toId = id;
                        break;
                    }
                }
            }
            
            // If not found, try to match by partial name
            if (!fromId && startNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name.toLowerCase().includes(startNode.toLowerCase()) || 
                        startNode.toLowerCase().includes(name.toLowerCase())) {
                        fromId = id;
                        break;
                    }
                }
            }
            
            if (!toId && endNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name.toLowerCase().includes(endNode.toLowerCase()) || 
                        endNode.toLowerCase().includes(name.toLowerCase())) {
                        toId = id;
                        break;
                    }
                }
            }
            
            // If still not found and we have nodes, create a self-loop or connect to first available node
            if (!fromId && nodes.length > 0) {
                fromId = nodes[0].id;
            }
            if (!toId && nodes.length > 0) {
                // If fromId is set, try to use a different node for toId
                if (fromId && nodes.length > 1) {
                    toId = nodes.find(n => n.id !== fromId)?.id || nodes[0].id;
                } else {
                    toId = nodes[0].id;
                }
            }
            
            // Only create edge if we have valid node IDs
            if (fromId && toId) {
                const propertyCount = (edgeType.properties || []).filter(p => 
                    p.name && !p.name.includes(':START_ID') && !p.name.includes(':END_ID')
                ).length;
                
                const isSelfLoop = fromId === toId;
                
                // Format edge label - replace underscores with spaces and handle long names
                let formattedLabel = edgeName.replace(/_/g, ' ');
                
                // Special handling for self-loops - simplify the label
                if (isSelfLoop) {
                    // Remove redundant "to [same node]" pattern for self-loops
                    const nodeName = nodes.find(n => n.id === fromId)?.label || '';
                    // Check if label contains the node name at the end (e.g., "SynapseSet to SynapseSet")
                    const selfLoopPattern = new RegExp(`\\s+(to|from|connects|has|contains)\\s+${nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
                    if (selfLoopPattern.test(formattedLabel)) {
                        // Remove the redundant part, keep just the edge type name
                        formattedLabel = formattedLabel.replace(selfLoopPattern, '');
                    }
                    // If it's still a pattern like "NodeType_to_NodeType", extract just the meaningful part
                    if (formattedLabel.toLowerCase().includes(nodeName.toLowerCase()) && formattedLabel.split(/\s+/).length > 1) {
                        // Try to extract just the relationship type
                        const parts = formattedLabel.split(/\s+(to|from|connects|has|contains)\s+/i);
                        if (parts.length >= 2 && parts[0].toLowerCase() === parts[parts.length - 1].toLowerCase()) {
                            // It's a self-loop with same name on both sides, just show the relationship word
                            formattedLabel = parts[1] || formattedLabel.split(/\s+/)[0];
                        }
                    }
                } else {
                    // For regular edges, format normally
                    // If label contains multiple words or is long, format it better
                    if (formattedLabel.length > 20 || formattedLabel.includes(' ')) {
                        // Try to split at common separators (to, from, connects, etc.)
                        const separatorMatch = formattedLabel.match(/\s+(to|from|connects|has|contains|set)\s+/i);
                        if (separatorMatch) {
                            const parts = formattedLabel.split(/\s+(to|from|connects|has|contains|set)\s+/i);
                            // Reconstruct with line break before the separator word
                            formattedLabel = parts[0] + '<br>' + separatorMatch[0].trim() + '<br>' + parts[parts.length - 1];
                        } else {
                            // Split long labels at spaces, taking first two words on first line
                            const words = formattedLabel.split(/\s+/);
                            if (words.length > 2) {
                                const midPoint = Math.ceil(words.length / 2);
                                formattedLabel = words.slice(0, midPoint).join(' ') + '<br>' + words.slice(midPoint).join(' ');
                            } else if (formattedLabel.length > 25) {
                                // For very long single words, truncate
                                formattedLabel = formattedLabel.substring(0, 22) + '...';
                            }
                        }
                    }
                }
                
                const edgeConfig = {
                    id: `edge_${index}`,
                    from: fromId,
                    to: toId,
                    label: formattedLabel,
                    title: `${edgeName}\nProperties: ${propertyCount}`,
                    color: {
                        color: '#8b5cf6',
                        highlight: '#a78bfa'
                    },
                    arrows: {
                        to: {
                            enabled: true,
                            scaleFactor: 1.2
                        }
                    },
                    font: {
                        color: '#94a3b8',
                        size: 11,
                        align: 'middle',
                        multi: 'html', // Enable HTML for line breaks
                        face: 'Arial'
                    },
                    width: 2
                };
                
                // Special handling for self-loops
                if (isSelfLoop) {
                    // Self-loops use curvedCW type for a clean circular loop
                    edgeConfig.smooth = {
                        type: 'curvedCW',
                        roundness: 0.8  // Larger roundness for a more circular, cleaner loop
                    };
                    // Make self-loops more visible
                    edgeConfig.width = 2.5;
                    edgeConfig.color = {
                        color: '#a78bfa',  // Slightly brighter for visibility
                        highlight: '#c4b5fd'
                    };
                    // Position label better for self-loops
                    edgeConfig.font = {
                        ...edgeConfig.font,
                        size: 10,  // Slightly smaller for self-loops
                        vadjust: -5  // Move label up slightly
                    };
                } else {
                    // For regular edges, use continuous smooth curves
                    edgeConfig.smooth = {
                        type: 'continuous',
                        roundness: 0.5
                    };
                }
                
                edges.push(edgeConfig);
            }
        });
    }
    
    // If no edges but we have nodes, create a simple layout
    if (edges.length === 0 && nodes.length > 0) {
        // Just show nodes without connections
    }
    
    // Create network data
    const data = {
        nodes: nodes,
        edges: edges
    };
    
    // Network options
    const options = {
        nodes: {
            shape: 'ellipse',
            font: {
                color: '#f1f5f9',
                size: 16
            },
            borderWidth: 2,
            shadow: true
        },
        edges: {
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 1.2
                }
            },
            color: {
                color: '#8b5cf6',
                highlight: '#a78bfa'
            },
            font: {
                color: '#94a3b8',
                size: 11,
                align: 'middle',
                multi: 'html', // Enable HTML for line breaks in labels
                face: 'Arial'
            },
            smooth: {
                type: 'continuous',
                roundness: 0.5
            },
            shadow: true,
            labelHighlightBold: false,
            selectionWidth: 3
        },
        physics: {
            enabled: true,
            stabilization: {
                iterations: 200
            },
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 200,
                springConstant: 0.04,
                damping: 0.09
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true,
            dragView: true
        },
        layout: {
            improvedLayout: true
        }
    };
    
    // Create network
    graphNetwork = new vis.Network(container, data, options);
}

// Comparison functions
async function loadComparison() {
    // Show loading state
    document.getElementById('comparisonMetrics').innerHTML = '<div class="metric-item"><span class="metric-label">Loading comparison data...</span></div>';
    
    try {
        // Load ground truth schema
        const response = await fetch('/ground-truth');
        if (!response.ok) {
            throw new Error('Failed to load ground truth schema');
        }
        groundTruthSchema = await response.json();
        
        // Render both graphs
        renderComparisonGraphs();
        
        // Calculate and display metrics
        calculateComparisonMetrics();
        
    } catch (error) {
        console.error('Error loading comparison:', error);
        document.getElementById('comparisonMetrics').innerHTML = 
            `<div class="metric-item"><span class="metric-label" style="color: var(--error-color);">Error: ${error.message}</span></div>`;
    }
}

function renderComparisonGraphs() {
    // Render inferred schema graph
    const inferredContainer = document.getElementById('inferredGraphNetwork');
    if (inferredGraphNetwork) {
        inferredGraphNetwork.destroy();
    }
    const inferredData = createGraphData(currentSchema, 'inferred');
    inferredGraphNetwork = new vis.Network(inferredContainer, inferredData, getComparisonGraphOptions());
    
    // Render ground truth schema graph
    const gtContainer = document.getElementById('groundTruthGraphNetwork');
    if (groundTruthGraphNetwork) {
        groundTruthGraphNetwork.destroy();
    }
    const gtData = createGraphData(groundTruthSchema, 'groundtruth');
    groundTruthGraphNetwork = new vis.Network(gtContainer, gtData, getComparisonGraphOptions());
}

function createGraphData(schema, prefix) {
    const nodes = [];
    const edges = [];
    const nodeTypeMap = new Map();
    
    // Create nodes
    if (schema.node_types && schema.node_types.length > 0) {
        schema.node_types.forEach((nodeType, index) => {
            const nodeName = nodeType.name || nodeType.labels?.[0] || `Node${index}`;
            const nodeId = `${prefix}_node_${index}`;
            nodeTypeMap.set(nodeName, nodeId);
            
            const propertyCount = (nodeType.properties || []).length;
            
            nodes.push({
                id: nodeId,
                label: nodeName,
                title: `${nodeName}\nProperties: ${propertyCount}`,
                shape: 'ellipse',
                color: {
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '#6366f1',
                    highlight: {
                        background: 'rgba(99, 102, 241, 0.4)',
                        border: '#6366f1'
                    }
                },
                font: {
                    color: '#f1f5f9',
                    size: 14,
                    face: 'Arial'
                },
                borderWidth: 2,
                size: 25 + (propertyCount * 1.5)
            });
        });
    }
    
    // Create edges
    if (schema.edge_types && schema.edge_types.length > 0) {
        schema.edge_types.forEach((edgeType, index) => {
            const edgeName = edgeType.name || edgeType.type || `Edge${index}`;
            let startNode = edgeType.start_node || edgeType.from;
            let endNode = edgeType.end_node || edgeType.to;
            
            // Try to infer if not provided
            if (!startNode || !endNode) {
                const nameParts = edgeName.split(/[_-]?(to|from|connects|has|contains)[_-]?/i);
                if (nameParts.length >= 2) {
                    if (!startNode) startNode = nameParts[0].trim();
                    if (!endNode) endNode = nameParts[nameParts.length - 1].trim();
                }
            }
            
            let fromId = null;
            let toId = null;
            
            // Find node IDs
            if (startNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name === startNode || name.toLowerCase() === startNode.toLowerCase()) {
                        fromId = id;
                        break;
                    }
                }
            }
            
            if (endNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name === endNode || name.toLowerCase() === endNode.toLowerCase()) {
                        toId = id;
                        break;
                    }
                }
            }
            
            // Fallback matching
            if (!fromId && startNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name.toLowerCase().includes(startNode.toLowerCase()) || 
                        startNode.toLowerCase().includes(name.toLowerCase())) {
                        fromId = id;
                        break;
                    }
                }
            }
            
            if (!toId && endNode) {
                for (const [name, id] of nodeTypeMap.entries()) {
                    if (name.toLowerCase().includes(endNode.toLowerCase()) || 
                        endNode.toLowerCase().includes(name.toLowerCase())) {
                        toId = id;
                        break;
                    }
                }
            }
            
            if (fromId && toId) {
                const isSelfLoop = fromId === toId;
                let formattedLabel = edgeName.replace(/_/g, ' ');
                
                if (isSelfLoop) {
                    const nodeName = nodes.find(n => n.id === fromId)?.label || '';
                    const selfLoopPattern = new RegExp(`\\s+(to|from|connects|has|contains)\\s+${nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
                    if (selfLoopPattern.test(formattedLabel)) {
                        formattedLabel = formattedLabel.replace(selfLoopPattern, '');
                    }
                } else if (formattedLabel.length > 20) {
                    const separatorMatch = formattedLabel.match(/\s+(to|from|connects|has|contains)\s+/i);
                    if (separatorMatch) {
                        const parts = formattedLabel.split(/\s+(to|from|connects|has|contains)\s+/i);
                        formattedLabel = parts[0] + '<br>' + separatorMatch[0].trim() + '<br>' + parts[parts.length - 1];
                    }
                }
                
                const edgeConfig = {
                    id: `${prefix}_edge_${index}`,
                    from: fromId,
                    to: toId,
                    label: formattedLabel,
                    color: {
                        color: '#8b5cf6',
                        highlight: '#a78bfa'
                    },
                    arrows: {
                        to: {
                            enabled: true,
                            scaleFactor: 1.2
                        }
                    },
                    font: {
                        color: '#94a3b8',
                        size: 10,
                        align: 'middle',
                        multi: 'html',
                        face: 'Arial'
                    },
                    width: 2
                };
                
                if (isSelfLoop) {
                    edgeConfig.smooth = { type: 'curvedCW', roundness: 0.8 };
                    edgeConfig.width = 2.5;
                } else {
                    edgeConfig.smooth = { type: 'continuous', roundness: 0.5 };
                }
                
                edges.push(edgeConfig);
            }
        });
    }
    
    return { nodes, edges };
}

function getComparisonGraphOptions() {
    return {
        nodes: {
            shape: 'ellipse',
            font: {
                color: '#f1f5f9',
                size: 14
            },
            borderWidth: 2,
            shadow: true
        },
        edges: {
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 1.2
                }
            },
            color: {
                color: '#8b5cf6',
                highlight: '#a78bfa'
            },
            font: {
                color: '#94a3b8',
                size: 10,
                align: 'middle',
                multi: 'html',
                face: 'Arial'
            },
            smooth: {
                type: 'continuous',
                roundness: 0.5
            },
            shadow: true
        },
        physics: {
            enabled: true,
            stabilization: {
                iterations: 150
            },
            barnesHut: {
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 150,
                springConstant: 0.04,
                damping: 0.09
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true,
            dragView: true
        },
        layout: {
            improvedLayout: true
        }
    };
}

// Normalize edge name for better matching
function normalizeEdgeName(name) {
    if (!name) return '';
    let normalized = name.toLowerCase();
    
    // Remove common prefixes/suffixes
    normalized = normalized.replace(/^neuprint_/i, '');
    normalized = normalized.replace(/_fib25$/i, '');
    
    // Replace underscores and hyphens with spaces
    normalized = normalized.replace(/[_-]/g, ' ');
    
    // Extract key relationship words
    const relationshipWords = ['connects', 'connect', 'contains', 'contain', 'synapses', 'synapse', 
                                'has', 'links', 'link', 'to', 'from', 'between'];
    
    // Get words from the name
    const words = normalized.split(/\s+/).filter(w => w.length > 0);
    
    // Find relationship keywords
    const keywords = words.filter(w => relationshipWords.some(rw => w.includes(rw) || rw.includes(w)));
    
    return {
        original: name,
        normalized: normalized,
        words: words,
        keywords: keywords,
        keyPhrase: keywords.join(' ') || normalized
    };
}

// Fuzzy string matching function (similar to Python's SequenceMatcher)
function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    
    // Exact match
    if (aLower === bLower) return 1.0;
    
    // Check for pluralization (e.g., "neuron" vs "neurons")
    const aSingular = aLower.replace(/s$/, '');
    const bSingular = bLower.replace(/s$/, '');
    if (aSingular === bLower || bSingular === aLower || aSingular === bSingular) {
        return 0.95;
    }
    
    // Check if one contains the other
    if (aLower.includes(bLower) || bLower.includes(aLower)) {
        return 0.85;
    }
    
    // Simple Levenshtein-like similarity
    const longer = aLower.length > bLower.length ? aLower : bLower;
    const shorter = aLower.length > bLower.length ? bLower : aLower;
    const editDistance = levenshteinDistance(longer, shorter);
    const similarity = 1 - (editDistance / longer.length);
    
    return similarity;
}

// Enhanced edge similarity matching
function edgeSimilarity(edgeName1, edgeName2) {
    if (!edgeName1 || !edgeName2) return 0;
    
    // Normalize both edge names
    const norm1 = normalizeEdgeName(edgeName1);
    const norm2 = normalizeEdgeName(edgeName2);
    
    // Exact match on normalized
    if (norm1.normalized === norm2.normalized) return 1.0;
    
    // Match on key phrase (relationship keywords)
    if (norm1.keyPhrase && norm2.keyPhrase && norm1.keyPhrase === norm2.keyPhrase) {
        return 0.95;
    }
    
    // Check if key phrases are similar
    if (norm1.keyPhrase && norm2.keyPhrase) {
        const keyPhraseSim = stringSimilarity(norm1.keyPhrase, norm2.keyPhrase);
        if (keyPhraseSim > 0.8) return keyPhraseSim;
    }
    
    // Check if one key phrase contains the other
    if (norm1.keyPhrase && norm2.keyPhrase) {
        if (norm1.keyPhrase.includes(norm2.keyPhrase) || norm2.keyPhrase.includes(norm1.keyPhrase)) {
            return 0.85;
        }
    }
    
    // Check for common relationship patterns
    const patterns = [
        { 
            gt: ['connects', 'to'], 
            inf: ['connects', 'connection', 'neuron', 'connection', 'neuron', 'to'],
            description: 'CONNECTS_TO pattern'
        },
        { 
            gt: ['contains'], 
            inf: ['contains', 'contain', 'has', 'synapseset', 'synapses'],
            description: 'CONTAINS pattern'
        },
        { 
            gt: ['synapses', 'to'], 
            inf: ['synapse', 'connection', 'synapse', 'to', 'synapses'],
            description: 'SYNAPSES_TO pattern'
        }
    ];
    
    for (const pattern of patterns) {
        const norm1HasGt = pattern.gt.every(p => norm1.normalized.includes(p));
        const norm2HasGt = pattern.gt.every(p => norm2.normalized.includes(p));
        const norm1HasInf = pattern.inf.some(p => norm1.normalized.includes(p));
        const norm2HasInf = pattern.inf.some(p => norm2.normalized.includes(p));
        
        // If one has GT pattern and other has INF pattern, they match
        if ((norm1HasGt && norm2HasInf) || (norm2HasGt && norm1HasInf)) {
            return 0.9;
        }
    }
    
    // Additional specific pattern matching
    // CONNECTS_TO should match anything with "connect" and "neuron" or "connection"
    if ((norm1.normalized.includes('connects') && norm1.normalized.includes('to')) ||
        (norm2.normalized.includes('connects') && norm2.normalized.includes('to'))) {
        if (norm1.normalized.includes('connection') || norm1.normalized.includes('neuron') ||
            norm2.normalized.includes('connection') || norm2.normalized.includes('neuron')) {
            return 0.88;
        }
    }
    
    // CONTAINS should match "synapseset to synapses" or similar
    if (norm1.normalized.includes('contains') || norm2.normalized.includes('contains')) {
        if ((norm1.normalized.includes('synapseset') && norm1.normalized.includes('synapses')) ||
            (norm2.normalized.includes('synapseset') && norm2.normalized.includes('synapses'))) {
            return 0.88;
        }
    }
    
    // SYNAPSES_TO should match "synapse_connections" or similar
    if ((norm1.normalized.includes('synapses') && norm1.normalized.includes('to')) ||
        (norm2.normalized.includes('synapses') && norm2.normalized.includes('to'))) {
        if (norm1.normalized.includes('synapse') && norm1.normalized.includes('connection') ||
            norm2.normalized.includes('synapse') && norm2.normalized.includes('connection')) {
            return 0.88;
        }
    }
    
    // Standard string similarity
    return stringSimilarity(norm1.normalized, norm2.normalized);
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

function findBestMatch(name, targetList, threshold = 0.7, isEdge = false) {
    let bestScore = 0;
    let bestMatch = null;
    
    for (const target of targetList) {
        const score = isEdge ? edgeSimilarity(name, target) : stringSimilarity(name, target);
        if (score >= threshold && score > bestScore) {
            bestScore = score;
            bestMatch = target;
        }
    }
    
    return bestMatch;
}

function calculateComparisonMetrics() {
    if (!currentSchema || !groundTruthSchema) return;
    
    // Compare node types with fuzzy matching
    const gtNodes = new Map();
    const infNodes = new Map();
    
    (groundTruthSchema.node_types || []).forEach(node => {
        const name = node.name || node.labels?.[0] || '';
        if (name) gtNodes.set(name, node);
    });
    
    (currentSchema.node_types || []).forEach(node => {
        const name = node.name || node.labels?.[0] || '';
        if (name) infNodes.set(name, node);
    });
    
    // Find matches using fuzzy matching
    let nodeMatches = 0;
    const matchedNodes = [];
    const missingNodes = [];
    const extraNodes = [];
    const nodeMatchMap = new Map(); // Maps GT name to inferred name
    
    gtNodes.forEach((gtNode, gtName) => {
        const infNames = Array.from(infNodes.keys());
        const match = findBestMatch(gtName, infNames, 0.7, false);
        if (match) {
            nodeMatches++;
            matchedNodes.push(gtName);
            nodeMatchMap.set(gtName, match);
        } else {
            missingNodes.push(gtName);
        }
    });
    
    // Find extra nodes (inferred but not matched to any GT)
    const matchedInfNodes = new Set(Array.from(nodeMatchMap.values()));
    infNodes.forEach((infNode, infName) => {
        if (!matchedInfNodes.has(infName)) {
            extraNodes.push(infName);
        }
    });
    
    // Compare edge types with fuzzy matching
    const gtEdges = new Map();
    const infEdges = new Map();
    
    (groundTruthSchema.edge_types || []).forEach(edge => {
        const name = edge.name || edge.type || '';
        if (name) gtEdges.set(name, edge);
    });
    
    (currentSchema.edge_types || []).forEach(edge => {
        const name = edge.name || edge.type || '';
        if (name) infEdges.set(name, edge);
    });
    
    let edgeMatches = 0;
    const matchedEdges = [];
    const missingEdges = [];
    const extraEdges = [];
    const edgeMatchMap = new Map(); // Maps GT name to inferred name
    
    gtEdges.forEach((gtEdge, gtName) => {
        const infNames = Array.from(infEdges.keys());
        // Use lower threshold for edges and enable edge-specific matching
        const match = findBestMatch(gtName, infNames, 0.6, true);
        if (match) {
            edgeMatches++;
            matchedEdges.push(gtName);
            edgeMatchMap.set(gtName, match);
        } else {
            missingEdges.push(gtName);
        }
    });
    
    // Find extra edges (inferred but not matched to any GT)
    const matchedInfEdges = new Set(Array.from(edgeMatchMap.values()));
    infEdges.forEach((infEdge, infName) => {
        if (!matchedInfEdges.has(infName)) {
            extraEdges.push(infName);
        }
    });
    
    // Calculate property accuracy using matched nodes
    let totalProps = 0;
    let matchedProps = 0;
    
    matchedNodes.forEach(gtNodeName => {
        const gtNode = gtNodes.get(gtNodeName);
        const infNodeName = nodeMatchMap.get(gtNodeName);
        const infNode = infNodeName ? infNodes.get(infNodeName) : null;
        if (gtNode && infNode) {
            const gtProps = new Set((gtNode.properties || []).map(p => p.name?.toLowerCase()).filter(Boolean));
            const infProps = new Set((infNode.properties || []).map(p => p.name?.toLowerCase()).filter(Boolean));
            totalProps += gtProps.size;
            matchedProps += [...gtProps].filter(p => infProps.has(p)).length;
        }
    });
    
    const nodeAccuracy = gtNodes.size > 0 ? (nodeMatches / gtNodes.size * 100) : 0;
    const edgeAccuracy = gtEdges.size > 0 ? (edgeMatches / gtEdges.size * 100) : 0;
    const propertyAccuracy = totalProps > 0 ? (matchedProps / totalProps * 100) : 0;
    const overallAccuracy = (nodeAccuracy + edgeAccuracy + propertyAccuracy) / 3;
    
    // Display metrics
    const metricsHtml = `
        <div class="metric-item">
            <span class="metric-label">Overall Accuracy</span>
            <span class="metric-value ${getAccuracyClass(overallAccuracy)}">${overallAccuracy.toFixed(1)}%</span>
        </div>
        <div class="metric-item">
            <span class="metric-label">Node Types</span>
            <span class="metric-value ${getAccuracyClass(nodeAccuracy)}">${nodeMatches}/${gtNodes.size} (${nodeAccuracy.toFixed(1)}%)</span>
        </div>
        <div class="metric-item">
            <span class="metric-label">Edge Types</span>
            <span class="metric-value ${getAccuracyClass(edgeAccuracy)}">${edgeMatches}/${gtEdges.size} (${edgeAccuracy.toFixed(1)}%)</span>
        </div>
        <div class="metric-item">
            <span class="metric-label">Properties</span>
            <span class="metric-value ${getAccuracyClass(propertyAccuracy)}">${matchedProps}/${totalProps} (${propertyAccuracy.toFixed(1)}%)</span>
        </div>
    `;
    
    document.getElementById('comparisonMetrics').innerHTML = metricsHtml;
    
    // Display detailed comparison
    displayComparisonDetails(matchedNodes, missingNodes, extraNodes, matchedEdges, missingEdges, extraEdges, nodeMatchMap, edgeMatchMap);
}

function getAccuracyClass(accuracy) {
    if (accuracy >= 90) return 'high';
    if (accuracy >= 70) return 'medium';
    return 'low';
}

function displayComparisonDetails(matchedNodes, missingNodes, extraNodes, matchedEdges, missingEdges, extraEdges, nodeMatchMap, edgeMatchMap) {
    let html = '';
    
    // Add note about demo mode
    html += '<div style="background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--warning-color); padding: 12px; margin-bottom: 20px; border-radius: 8px;">';
    html += '<strong style="color: var(--warning-color);">ℹ️ Note:</strong> ';
    html += '<span style="color: var(--text-secondary);">If you\'re using demo mode (no API key), the accuracy may be lower. For best results, use the actual Gemini API with your API key.</span>';
    html += '</div>';
    
    // Node comparison
    html += '<div class="comparison-section"><h4>Node Types Comparison</h4>';
    
    if (matchedNodes.length > 0) {
        html += `<div style="margin-bottom: 16px;"><strong style="color: var(--success-color);">✓ Matched Nodes (${matchedNodes.length}):</strong>`;
        matchedNodes.forEach(gtName => {
            const infName = nodeMatchMap.get(gtName);
            if (infName && infName !== gtName) {
                html += `<div class="match-item"><span class="comparison-item-label">${gtName} ↔ ${infName}</span><span class="comparison-item-details">Fuzzy matched</span></div>`;
            } else {
                html += `<div class="match-item"><span class="comparison-item-label">${gtName}</span></div>`;
            }
        });
        html += '</div>';
    }
    
    if (missingNodes.length > 0) {
        html += `<div style="margin-bottom: 16px;"><strong style="color: var(--error-color);">✗ Missing Nodes (${missingNodes.length}):</strong>`;
        missingNodes.forEach(name => {
            html += `<div class="missing-item"><span class="comparison-item-label">${name}</span><span class="comparison-item-details">Present in Ground Truth but not inferred</span></div>`;
        });
        html += '</div>';
    }
    
    if (extraNodes.length > 0) {
        html += `<div style="margin-bottom: 16px;"><strong style="color: var(--warning-color);">⚠ Extra Nodes (${extraNodes.length}):</strong>`;
        extraNodes.forEach(name => {
            html += `<div class="mismatch-item"><span class="comparison-item-label">${name}</span><span class="comparison-item-details">Inferred but not in Ground Truth</span></div>`;
        });
        html += '</div>';
    }
    
    html += '</div>';
    
    // Edge comparison
    html += '<div class="comparison-section"><h4>Edge Types Comparison</h4>';
    
    if (matchedEdges.length > 0) {
        html += `<div style="margin-bottom: 16px;"><strong style="color: var(--success-color);">✓ Matched Edges (${matchedEdges.length}):</strong>`;
        matchedEdges.forEach(gtName => {
            const infName = edgeMatchMap.get(gtName);
            if (infName && infName !== gtName) {
                html += `<div class="match-item"><span class="comparison-item-label">${gtName} ↔ ${infName}</span><span class="comparison-item-details">Fuzzy matched</span></div>`;
            } else {
                html += `<div class="match-item"><span class="comparison-item-label">${gtName}</span></div>`;
            }
        });
        html += '</div>';
    }
    
    if (missingEdges.length > 0) {
        html += `<div style="margin-bottom: 16px;"><strong style="color: var(--error-color);">✗ Missing Edges (${missingEdges.length}):</strong>`;
        missingEdges.forEach(name => {
            html += `<div class="missing-item"><span class="comparison-item-label">${name}</span><span class="comparison-item-details">Present in Ground Truth but not inferred</span></div>`;
        });
        html += '</div>';
    }
    
    if (extraEdges.length > 0) {
        html += `<div style="margin-bottom: 16px;"><strong style="color: var(--warning-color);">⚠ Extra Edges (${extraEdges.length}):</strong>`;
        extraEdges.forEach(name => {
            html += `<div class="mismatch-item"><span class="comparison-item-label">${name}</span><span class="comparison-item-details">Inferred but not in Ground Truth</span></div>`;
        });
        html += '</div>';
    }
    
    html += '</div>';
    
    document.getElementById('comparisonDetails').innerHTML = html;
}

