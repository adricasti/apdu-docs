// Load commands from JSON file
async function loadCommands() {
  try {
    const response = await fetch('commands.json');
    const commands = await response.json();
    
    const commandList = document.getElementById('commandList');
    
    commands.forEach((command, index) => {
      const li = document.createElement('li');
      li.textContent = command.title;
      li.dataset.index = index;
      li.addEventListener('click', () => showCommandDetails(commands[index], li));
      commandList.appendChild(li);
    });
    
    // Auto-select first command if available
    if (commands.length > 0) {
      const firstCommand = commandList.querySelector('li');
      firstCommand.click();
    }
    
  } catch (error) {
    console.error('Error loading commands:', error);
    const commandList = document.getElementById('commandList');
    commandList.innerHTML = '<li class="error">Error loading commands</li>';
  }
}

// Display command details
function showCommandDetails(command, clickedElement) {
  // Update active class
  document.querySelectorAll('.command-list li').forEach(li => {
    li.classList.remove('active');
  });
  clickedElement.classList.add('active');
  
  // Hide placeholder, show details
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('commandDetails').classList.remove('hidden');
  
  // Set basic info
  document.getElementById('commandTitle').textContent = command.title;
  document.getElementById('commandDescription').textContent = command.description;
  
  // Handle command table
  const hasData = command.command.data !== undefined;
  
  document.getElementById('lcHeader').classList.toggle('hidden', !hasData);
  document.getElementById('dataHeader').classList.toggle('hidden', !hasData);
  
  const bytesRow = document.getElementById('commandBytes');
  
  // Clear previous content
  bytesRow.innerHTML = '';
  
  // Add command bytes with data-cell class
  let cell = bytesRow.insertCell();
  cell.textContent = toHex(command.command.cla);
  cell.className = 'data-cell';
  
  cell = bytesRow.insertCell();
  cell.textContent = toHex(command.command.ins);
  cell.className = 'data-cell';
  
  cell = bytesRow.insertCell();
  cell.textContent = toHex(command.command.p1);
  cell.className = 'data-cell';
  
  cell = bytesRow.insertCell();
  cell.textContent = toHex(command.command.p2);
  cell.className = 'data-cell';
  
  if (hasData) {
    // Process command data
    let rawData;
    let formattedData;

    if (typeof(command.command.data) === 'object') {
      // Process TLV data
      const tlvData = encodeTlv(command.command.data);
      rawData = tlvData.hex;
      formattedData = tlvData.formatted;
    } else {
      // Raw data format
      rawData = command.command.data;
      formattedData = `<span class="tlv-value">${rawData}</span>`;
    }

    // Lc cell
    cell = bytesRow.insertCell();
    cell.textContent = toHex(rawData.length / 2);  // Lc (length in bytes)
    cell.className = 'data-cell';
    
    // Data cell with formatted content
    cell = bytesRow.insertCell();
    cell.innerHTML = formattedData;
    cell.className = 'data-cell left-align';
  }
  
  // Le cell
  cell = bytesRow.insertCell();
  cell.textContent = command.command.le !== undefined ? toHex(command.command.le) : toHex(0);
  cell.className = 'data-cell';
  
  // Handle response
  const responseDataCell = document.getElementById('responseData');
  const responseStatusCell = document.getElementById('responseStatus');
  
  // Process response data
  if (command.response.structure) {
    // Format the response according to the structure
    try {
      const formattedResponse = parseAndFormatResponse(command.response.data, command.response.structure);
      responseDataCell.innerHTML = formattedResponse;
    } catch (error) {
      console.error('Error parsing response data:', error);
      responseDataCell.textContent = command.response.data || '-';
    }
  } else {
    // Display raw response data
    responseDataCell.textContent = command.response.data || '-';
  }
  
  responseStatusCell.textContent = command.response.status || '-';
  
  // Handle notes (if present)
  const notesSection = document.getElementById('notesSection');
  const commandNotes = document.getElementById('commandNotes');
  
  if (command.notes) {
    notesSection.classList.remove('hidden');
    commandNotes.textContent = command.notes;
  } else {
    notesSection.classList.add('hidden');
  }
}

// Parse and format response data based on structure
function parseAndFormatResponse(data, structure) {
  // Start position in the data string
  let position = 0;
  let result = '';
  
  // Continue parsing until we've processed the entire data
  while (position < data.length) {
    // Get the current tag from the data
    const tagId = findMatchingTag(data.substr(position), structure);
    
    if (!tagId) {
      // No matching tag found, handle unparsed data
      const remaining = data.substr(position);
      if (remaining.length > 0) {
        result += `<div class="tlv-unparsed"><span class="tlv-value">${remaining}</span> (unparsed)</div>`;
      }
      break;
    }
    
    // Get the tag configuration
    const tagConfig = structure[tagId];
    
    // Move position past the tag
    position += tagId.length;
    
    // Extract length bytes
    let lengthBytes = 1; // Default to 1 byte length
    let lengthValue;
    
    // First check if length byte is > 0x80, which means multi-byte length
    const firstLengthByte = parseInt(data.substr(position, 2), 16);
    if (firstLengthByte & 0x80) {
      // High bit set, so this byte specifies number of subsequent length bytes
      const numLengthBytes = firstLengthByte & 0x7F;
      lengthBytes = numLengthBytes + 1; // +1 for the initial byte
      lengthValue = parseInt(data.substr(position + 2, numLengthBytes * 2), 16);
    } else {
      // Simple length encoding
      lengthValue = firstLengthByte;
    }
    
    // Extract full length string
    const lengthHex = data.substr(position, lengthBytes * 2);
    position += lengthBytes * 2;
    
    // Extract value
    const valueHex = data.substr(position, lengthValue * 2);
    position += lengthValue * 2;
    
    // Create tooltip if label exists
    const labelTooltip = tagConfig.Label ? `<span class="tooltiptext">${tagConfig.Label}</span>` : '';
    
    // Format the output
    result += `<div class="tlv-container">
      <span class="tlv-tag tooltip">${tagId}${tagConfig.Label ? labelTooltip : ''}</span><span class="tlv-length">${lengthHex}</span>`;
    
    // If this tag has nested structure, recursively parse its value
    if (hasNestedStructure(tagConfig)) {
      const nestedStructure = getNestedStructure(tagConfig);
      const nestedResult = parseNestedTlv(valueHex, nestedStructure);
      result += `<div class="tlv-indent">${nestedResult}</div>`;
    } else {
      result += `<span class="tlv-value tooltip">${valueHex}${labelTooltip}</span>`;
    }
    
    result += `</div>`;
  }
  
  return result;
}

// Helper function to find a matching tag in the structure
function findMatchingTag(dataFragment, structure) {
  // Try each tag defined in the structure to see if it matches at the current position
  for (const tagId in structure) {
    // Skip special properties
    if (['Repeats', 'Optional', 'Length', 'Label'].includes(tagId)) continue;
    
    // Check if the data starts with this tag
    if (dataFragment.startsWith(tagId)) {
      return tagId;
    }
  }
  
  return null; // No matching tag found
}

// Helper function to check if a tag config has nested structure
function hasNestedStructure(tagConfig) {
  return Object.keys(tagConfig).some(key => 
    typeof tagConfig[key] === 'object' && 
    !['Repeats', 'Optional', 'Length', 'Label'].includes(key)
  );
}

// Helper function to extract the nested structure from a tag config
function getNestedStructure(tagConfig) {
  const nestedStructure = {};
  
  for (const key in tagConfig) {
    if (typeof tagConfig[key] === 'object' && 
        !['Repeats', 'Optional', 'Length', 'Label'].includes(key)) {
      nestedStructure[key] = tagConfig[key];
    }
  }
  
  return nestedStructure;
}

// Function to parse nested TLV structures
function parseNestedTlv(data, structure) {
  let position = 0;
  let result = '';
  
  while (position < data.length) {
    // Try to find a tag that matches at the current position
    const tagId = findMatchingTag(data.substr(position), structure);
    
    if (!tagId) {
      // No matching tag found, handle as unparsed data
      const remaining = data.substr(position);
      if (remaining.length > 0) {
        result += `<span class="tlv-value">${remaining}</span>`;
      }
      break;
    }
    
    const tagConfig = structure[tagId];
    
    // Move position past the tag
    position += tagId.length;
    
    // Extract length bytes
    let lengthBytes = 1;
    let lengthValue;
    
    const firstLengthByte = parseInt(data.substr(position, 2), 16);
    if (firstLengthByte & 0x80) {
      const numLengthBytes = firstLengthByte & 0x7F;
      lengthBytes = numLengthBytes + 1;
      lengthValue = parseInt(data.substr(position + 2, numLengthBytes * 2), 16);
    } else {
      lengthValue = firstLengthByte;
    }
    
    const lengthHex = data.substr(position, lengthBytes * 2);
    position += lengthBytes * 2;
    
    // Extract value
    const valueHex = data.substr(position, lengthValue * 2);
    position += lengthValue * 2;
    
    // Create tooltip if label exists
    const labelTooltip = tagConfig.Label ? `<span class="tooltiptext">${tagConfig.Label}</span>` : '';
    
    // Format the output
    result += `<div class="tlv-container">
      <span class="tlv-tag tooltip">${tagId}${tagConfig.Label ? labelTooltip : ''}</span><span class="tlv-length">${lengthHex}</span>`;
    
    // Handle nested structure
    if (hasNestedStructure(tagConfig)) {
      const nestedStructure = getNestedStructure(tagConfig);
      const nestedResult = parseNestedTlv(valueHex, nestedStructure);
      result += `<div class="tlv-indent">${nestedResult}</div>`;
    } else {
      result += `<span class="tlv-value tooltip">${valueHex}${labelTooltip}</span>`;
    }
    
    result += `</div>`;
    
    // Check for repeating tags
    if (tagConfig.Repeats && position < data.length && data.substr(position, tagId.length) === tagId) {
      // We'll continue in the next loop iteration for the repeated tag
      continue;
    }
  }
  
  return result;
}

// Utility function to format numbers as hex
function toHex(value) {
  if (value === undefined) return '';
  return value.toString(16).toUpperCase().padStart(2, '0');
}

// Function to encode TLV data and return both hex string and HTML-formatted representation
function encodeTlv(data, level = 0) {
  let hex = '';
  let formatted = '';
  
  for (const [tag, value] of Object.entries(data)) {
    const tagHex = tag;
    
    if (typeof value === 'object') {
      // Nested TLV
      const nested = encodeTlv(value, level + 1);
      const valueHex = nested.hex;
      const lengthHex = (valueHex.length / 2).toString(16).padStart(2, '0').toUpperCase();
      
      hex += tagHex + lengthHex + valueHex;
      
      formatted += `<div class="tlv-container${level > 0 ? ' tlv-indent' : ''}">
        <span class="tlv-tag">${tagHex}</span><span class="tlv-length">${lengthHex}</span>
        ${nested.formatted}
      </div>`;
    } else {
      // Simple value
      const valueHex = value;
      const lengthHex = (valueHex.length / 2).toString(16).padStart(2, '0').toUpperCase();
      
      hex += tagHex + lengthHex + valueHex;
      
      formatted += `<div class="tlv-container${level > 0 ? ' tlv-indent' : ''}">
        <span class="tlv-tag">${tagHex}</span><span class="tlv-length">${lengthHex}</span><span class="tlv-value">${valueHex}</span>
      </div>`;
    }
  }
  
  return { hex, formatted };
}

// Initialize the page
document.addEventListener('DOMContentLoaded', loadCommands);
