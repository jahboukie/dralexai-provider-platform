// Dr. Alex AI Provider Dashboard JavaScript

// Global variables
let currentSection = 'overview';
let chatHistory = [];
let currentUser = {
    name: 'Dr. Sarah Johnson',
    tier: 'Professional',
    queriesUsed: 627,
    queriesLimit: 2000
};

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    updateUserInfo();
    updateUsageStats();
    setupEventListeners();
});

// Initialize dashboard
function initializeDashboard() {
    console.log('🤖 Dr. Alex AI Provider Dashboard Loaded');
    showSection('overview');
    loadRecentActivity();
    updateChatInterface();
}

// Update user information in the navigation
function updateUserInfo() {
    document.getElementById('providerName').textContent = currentUser.name;
    document.getElementById('providerTier').textContent = `${currentUser.tier} Plan`;
}

// Update usage statistics
function updateUsageStats() {
    document.getElementById('aiQueriesUsed').textContent = currentUser.queriesUsed;
    const remaining = currentUser.queriesLimit - currentUser.queriesUsed;
    document.getElementById('queriesRemaining').textContent = `${remaining} queries remaining this month`;
    
    // Update usage chart
    const usagePercentage = (currentUser.queriesUsed / currentUser.queriesLimit) * 100;
    const chartBar = document.querySelector('.bar-fill');
    if (chartBar) {
        chartBar.style.width = `${usagePercentage}%`;
    }
    
    // Update usage numbers
    const usageNumbers = document.querySelector('.usage-numbers span');
    if (usageNumbers) {
        usageNumbers.textContent = `${currentUser.queriesUsed} of ${currentUser.queriesLimit} queries used (${usagePercentage.toFixed(1)}%)`;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Chat input enter key
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', handleChatKeydown);
    }
    
    // Patient search
    const patientSearch = document.getElementById('patientSearch');
    if (patientSearch) {
        patientSearch.addEventListener('input', filterPatients);
    }
    
    // Patient filter
    const patientFilter = document.getElementById('patientFilter');
    if (patientFilter) {
        patientFilter.addEventListener('change', filterPatients);
    }
}

// Navigation - Show specific section
function showSection(sectionId) {
    // Hide all sections
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all menu items
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Add active class to corresponding menu item
    const activeMenuItem = document.querySelector(`[onclick="showSection('${sectionId}')"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }
    
    currentSection = sectionId;
    
    // Load section-specific data
    loadSectionData(sectionId);
}

// Load section-specific data
function loadSectionData(sectionId) {
    switch(sectionId) {
        case 'overview':
            loadDashboardOverview();
            break;
        case 'ai-assistant':
            initializeAIChat();
            break;
        case 'patients':
            loadPatientData();
            break;
        case 'crisis':
            loadCrisisData();
            break;
        case 'analytics':
            loadAnalyticsData();
            break;
        case 'ehr-integration':
            loadEHRStatus();
            break;
        case 'billing':
            loadBillingData();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// Load dashboard overview data
function loadDashboardOverview() {
    // Simulate real-time data updates
    const stats = {
        aiQueries: currentUser.queriesUsed,
        activePatients: 45,
        crisisAlerts: 3,
        timeSaved: 12.3
    };
    
    document.getElementById('aiQueriesUsed').textContent = stats.aiQueries;
    document.getElementById('activePatients').textContent = stats.activePatients;
    document.getElementById('crisisAlerts').textContent = stats.crisisAlerts;
    document.getElementById('timeSaved').textContent = stats.timeSaved;
}

// Load recent activity
function loadRecentActivity() {
    // This would typically fetch from API
    console.log('Loading recent activity...');
}

// AI Chat Functions
function initializeAIChat() {
    updateChatInterface();
}

function updateChatInterface() {
    const remaining = currentUser.queriesLimit - currentUser.queriesUsed;
    const queriesElement = document.getElementById('queriesRemaining');
    if (queriesElement) {
        queriesElement.textContent = `${remaining} queries remaining this month`;
    }
}

function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Check query limit
    if (currentUser.queriesUsed >= currentUser.queriesLimit) {
        alert('You have reached your monthly query limit. Please upgrade your plan to continue.');
        showSection('billing');
        return;
    }
    
    // Clear input
    chatInput.value = '';
    
    // Add user message to chat
    addMessageToChat('user', message);
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        // Send message to AI assistant API
        const response = await fetch('/api/ai-assistant/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                message: message,
                context: 'clinical_assistant'
            })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator();
        
        if (response.ok) {
            // Add AI response to chat
            addMessageToChat('ai', data.response);
            
            // Update usage count
            currentUser.queriesUsed++;
            updateUsageStats();
            
            // Handle special responses (crisis detection, etc.)
            if (data.crisisDetected) {
                handleCrisisDetection(data.crisisData);
            }
        } else {
            addMessageToChat('ai', 'I apologize, but I encountered an error processing your request. Please try again.');
        }
        
    } catch (error) {
        removeTypingIndicator();
        addMessageToChat('ai', 'I\'m currently unable to process your request. Please check your connection and try again.');
        console.error('Chat error:', error);
    }
}

function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = sender === 'ai' ? '🤖' : '👩‍⚕️';
    const messageClass = sender === 'ai' ? 'ai-message' : 'user-message';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Store in chat history
    chatHistory.push({ sender, message, timestamp: new Date() });
}

function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'message ai-message';
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <p>Claude is thinking...</p>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = `
        <div class="message ai-message">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <p>Hello! I'm Claude, your AI clinical intelligence assistant. I can help you with:</p>
                <ul>
                    <li>Patient assessment and diagnosis support</li>
                    <li>Treatment plan recommendations</li>
                    <li>Drug interaction checks</li>
                    <li>Crisis detection and emergency protocols</li>
                    <li>Clinical research insights</li>
                </ul>
                <p>How can I assist you today?</p>
            </div>
        </div>
    `;
    chatHistory = [];
}

function exportChat() {
    const chatData = {
        provider: currentUser.name,
        date: new Date().toISOString(),
        messages: chatHistory
    };
    
    const dataStr = JSON.stringify(chatData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

// Crisis Detection
function handleCrisisDetection(crisisData) {
    // Show crisis alert
    showCrisisAlert(crisisData);
    
    // Log crisis event
    logCrisisEvent(crisisData);
    
    // Notify emergency contacts if needed
    if (crisisData.severity === 'critical') {
        triggerEmergencyProtocol(crisisData);
    }
}

function showCrisisAlert(crisisData) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'crisis-alert';
    alertDiv.innerHTML = `
        <div class="alert-content">
            <h3>🚨 Crisis Alert Detected</h3>
            <p>Severity: ${crisisData.severity}</p>
            <p>Recommended Actions: ${crisisData.recommendations.join(', ')}</p>
            <button onclick="acknowledgeAlert()">Acknowledge</button>
        </div>
    `;
    document.body.appendChild(alertDiv);
}

function logCrisisEvent(crisisData) {
    // This would typically send to the crisis events API
    console.log('Crisis event logged:', crisisData);
}

function triggerEmergencyProtocol(crisisData) {
    // This would trigger actual emergency protocols
    console.log('Emergency protocol triggered:', crisisData);
}

function acknowledgeAlert() {
    const alertElement = document.querySelector('.crisis-alert');
    if (alertElement) {
        alertElement.remove();
    }
}

// Patient Management
function loadPatientData() {
    // This would typically fetch from patients API
    console.log('Loading patient data...');
}

function filterPatients() {
    const searchTerm = document.getElementById('patientSearch').value.toLowerCase();
    const filterValue = document.getElementById('patientFilter').value;
    
    const patientCards = document.querySelectorAll('.patient-card');
    patientCards.forEach(card => {
        const patientName = card.querySelector('h4').textContent.toLowerCase();
        const patientStatus = card.querySelector('.patient-status').className;
        
        let showCard = true;
        
        // Apply search filter
        if (searchTerm && !patientName.includes(searchTerm)) {
            showCard = false;
        }
        
        // Apply status filter
        if (filterValue !== 'all') {
            if (filterValue === 'active' && !patientStatus.includes('active')) {
                showCard = false;
            } else if (filterValue === 'critical' && !patientStatus.includes('critical')) {
                showCard = false;
            }
        }
        
        card.style.display = showCard ? 'flex' : 'none';
    });
}

function openPatient(patientId) {
    // This would open a detailed patient view
    console.log('Opening patient:', patientId);
    
    // For demo purposes, show an alert
    alert(`Opening patient record: ${patientId}\n\nThis would typically open a detailed patient management interface with:\n- Full medical history\n- AI analysis results\n- Treatment recommendations\n- Real-time monitoring data`);
}

function addNewPatient() {
    // This would open a new patient form
    console.log('Adding new patient...');
    
    // For demo purposes, show an alert
    alert('Add New Patient\n\nThis would open a form to:\n- Enter patient demographics\n- Upload medical history\n- Set monitoring preferences\n- Configure AI analysis parameters');
}

// Crisis Management
function loadCrisisData() {
    // This would typically fetch from crisis events API
    console.log('Loading crisis detection data...');
}

// Analytics
function loadAnalyticsData() {
    // This would typically fetch analytics data based on user tier
    console.log('Loading clinical analytics...');
}

// EHR Integration
function loadEHRStatus() {
    // This would check EHR connection status
    console.log('Loading EHR integration status...');
}

// Billing
function loadBillingData() {
    // This would fetch billing and usage data
    console.log('Loading billing information...');
}

// Settings
function loadSettings() {
    // This would load user settings
    console.log('Loading settings...');
}

// Authentication
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('authToken');
        window.location.href = '/';
    }
}

// Utility Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(date));
}

// Demo Functions (for demonstration purposes)
function simulateRealTimeUpdates() {
    setInterval(() => {
        // Update random stats for demo
        const newAlerts = Math.floor(Math.random() * 5);
        document.getElementById('crisisAlerts').textContent = newAlerts;
        
        const newPatients = 45 + Math.floor(Math.random() * 10);
        document.getElementById('activePatients').textContent = newPatients;
    }, 30000); // Update every 30 seconds
}

// Start demo updates
setTimeout(simulateRealTimeUpdates, 5000);

// Export functions for global access
window.showSection = showSection;
window.sendMessage = sendMessage;
window.clearChat = clearChat;
window.exportChat = exportChat;
window.openPatient = openPatient;
window.addNewPatient = addNewPatient;
window.logout = logout;
window.handleChatKeydown = handleChatKeydown;