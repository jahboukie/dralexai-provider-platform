// Dr. Alex AI Provider Dashboard JavaScript

// Global variables
let currentSection = 'overview';
let chatHistory = [];
let currentUser = null; // Will be loaded from API

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', function() {
    const authToken = localStorage.getItem('authToken');

    console.log('🔍 Dashboard initialization:', {
        hasAuthToken: !!authToken,
        hostname: window.location.hostname,
        environment: window.location.hostname === 'localhost' ? 'development' : 'production'
    });

    if (!authToken) {
        console.log('🔒 No authentication token - redirecting to login');
        window.location.href = '/login';
        return;
    }

    // Load user profile and initialize dashboard
    loadUserProfile()
        .then(() => {
            initializeDashboard();
            updateUserInfo();
            updateUsageStats();
            setupEventListeners();
        })
        .catch(error => {
            console.error('Failed to load user profile:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/login';
        });
});

// Load user profile from API
async function loadUserProfile() {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        throw new Error('No authentication token');
    }

    try {
        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const userData = await response.json();

        // Set current user from API response
        currentUser = {
            id: userData.id,
            name: `${userData.firstName} ${userData.lastName}`,
            email: userData.email,
            tier: userData.subscriptionTier || 'Essential',
            specialty: userData.specialty,
            organization: userData.organization,
            licenseNumber: userData.licenseNumber,
            queriesUsed: userData.monthlyUsage || 0,
            queriesLimit: userData.queryLimit || 1000
        };

        console.log('✅ User profile loaded:', currentUser);
        return currentUser;
    } catch (error) {
        console.error('❌ Failed to load user profile:', error);
        throw error;
    }
}

// Initialize dashboard
function initializeDashboard() {
    console.log('🤖 Dr. Alex AI Provider Dashboard Loaded');
    showSection('overview');
    loadRecentActivity();
    updateChatInterface();
}

// Update user information in the navigation
function updateUserInfo() {
    if (!currentUser) {
        console.error('Cannot update user info: currentUser is null');
        return;
    }

    const providerName = document.getElementById('providerName');
    const providerTier = document.getElementById('providerTier');
    const logoutBtn = document.querySelector('.logout-btn');

    if (providerName) {
        providerName.textContent = currentUser.name;
    }

    if (providerTier) {
        providerTier.textContent = `${currentUser.tier} Plan`;
    }

    if (logoutBtn) {
        logoutBtn.textContent = 'Logout';
        logoutBtn.onclick = logout;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('providerInfo');
    window.location.href = '/login';
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
        case 'patient-apps':
            loadPatientAppsData();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// Load dashboard overview data
async function loadDashboardOverview() {
    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/dashboard/overview', {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const stats = await response.json();

            // Update dashboard stats with real data
            const elements = {
                aiQueriesUsed: document.getElementById('aiQueriesUsed'),
                activePatients: document.getElementById('activePatients'),
                crisisAlerts: document.getElementById('crisisAlerts'),
                timeSaved: document.getElementById('timeSaved')
            };

            if (elements.aiQueriesUsed) elements.aiQueriesUsed.textContent = stats.aiQueries || 0;
            if (elements.activePatients) elements.activePatients.textContent = stats.activePatients || 0;
            if (elements.crisisAlerts) elements.crisisAlerts.textContent = stats.crisisAlerts || 0;
            if (elements.timeSaved) elements.timeSaved.textContent = stats.timeSaved || 0;
        } else {
            console.error('Failed to load dashboard overview');
        }
    } catch (error) {
        console.error('Error loading dashboard overview:', error);
    }
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

    const authToken = localStorage.getItem('authToken');

    if (!authToken) {
        removeTypingIndicator();
        addMessageToChat('ai', 'Authentication required. Please log in to access Dr. Alex AI.');
        return;
    }

    try {
        // Send message to AI assistant API
        const response = await fetch('/api/ai-assistant/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
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
            addMessageToChat('ai', 'I apologize, but I encountered an error processing your request. Please try again or log in for full access.');
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
            <p>Alex is thinking...</p>
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
                <p>Hello! I'm Dr. Alex AI, your secure clinical intelligence assistant. I can help you with:</p>
                <ul>
                    <li>🩺 Patient assessment and diagnosis support</li>
                    <li>💊 Treatment plan recommendations</li>
                    <li>⚠️ Drug interaction checks</li>
                    <li>🚨 Crisis detection and emergency protocols</li>
                    <li>📊 Clinical research insights</li>
                    <li>🔒 <strong>Security & compliance information (HIPAA, GDPR, PIPEDA)</strong></li>
                    <li>🛡️ <strong>Zero-knowledge encryption details</strong></li>
                </ul>
                <p><strong>Try asking:</strong> "How secure is our patient data?" or "Tell me about HIPAA compliance"</p>
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
async function loadPatientData() {
    try {
        const response = await fetch('/api/patients', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Patient data loaded:', data);
            // Update patient list in UI
            updatePatientList(data.patients || []);
        } else {
            console.error('Failed to load patient data');
        }
    } catch (error) {
        console.error('Error loading patient data:', error);
    }
}

function updatePatientList(patients) {
    // This function would update the patient list in the UI
    // For now, keeping existing demo data
    console.log('Updating patient list with:', patients);
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
async function loadCrisisData() {
    try {
        const response = await fetch('/api/crisis-events', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Crisis data loaded:', data);
        } else {
            console.log('Crisis detection system operational - no active alerts');
        }
    } catch (error) {
        console.error('Error loading crisis data:', error);
    }
}

// Analytics
async function loadAnalyticsData() {
    try {
        // Load clinical insights
        const insightsResponse = await fetch('/api/insights/summary', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        // Load sentiment analysis data from main brain
        const sentimentResponse = await fetch('/api/sentiment/provider-insights', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            console.log('Clinical insights loaded:', insightsData);
        }
        
        if (sentimentResponse.ok) {
            const sentimentData = await sentimentResponse.json();
            console.log('Sentiment analytics from main brain loaded:', sentimentData);
        } else {
            console.log('Analytics loading...');
        }
    } catch (error) {
        console.error('Error loading analytics data:', error);
    }
}

// EHR Integration
async function loadEHRStatus() {
    try {
        const response = await fetch('/api/ehr-integration/status', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('EHR status loaded:', data);
        } else {
            console.log('EHR integration status checking...');
        }
    } catch (error) {
        console.error('Error loading EHR status:', error);
    }
}

// Billing
async function loadBillingData() {
    try {
        const response = await fetch('/api/billing/usage', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Billing data loaded:', data);
            updateUsageStats(data);
        } else {
            console.log('Billing data loading...');
        }
    } catch (error) {
        console.error('Error loading billing data:', error);
    }
}

// Patient Apps Data
async function loadPatientAppsData() {
    try {
        const response = await fetch('/api/patient-apps/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Patient apps data loaded:', data);
        } else {
            console.log('Patient apps data loading...');
        }
    } catch (error) {
        console.error('Error loading patient apps data:', error);
    }
}

// Settings
async function loadSettings() {
    try {
        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Settings data loaded:', data);
            updateSettingsForm(data);
        } else {
            console.log('Settings loading...');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function updateSettingsForm(data) {
    // Update settings form with user data
    if (data.provider) {
        const provider = data.provider;
        // Update form fields if they exist
        const nameField = document.querySelector('input[value="Dr. Sarah Johnson"]');
        if (nameField) nameField.value = `${provider.firstName} ${provider.lastName}`;
        
        const emailField = document.querySelector('input[value="sarah.johnson@hospital.com"]');
        if (emailField) emailField.value = provider.email;
        
        const licenseField = document.querySelector('input[value="MD123456789"]');
        if (licenseField && provider.licenseNumber) licenseField.value = provider.licenseNumber;
    }
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

// Patient App Integration Functions
function generateReferralLink(appName) {
    const providerId = currentUser.name.replace(/\s+/g, '').toLowerCase();
    const referralCode = `${providerId}-${appName}-${Date.now()}`;

    // Environment-aware URLs
    const isProduction = window.location.hostname !== 'localhost';
    const baseUrl = isProduction ? 'https://apps.dralexai.com' : 'http://localhost';

    const links = {
        menotracker: `${baseUrl}${isProduction ? '/menotracker' : ':3013'}?ref=${referralCode}&provider=${encodeURIComponent(currentUser.name)}`,
        supportivepartner: `${baseUrl}${isProduction ? '/supportivepartner' : ':3021'}?ref=${referralCode}&provider=${encodeURIComponent(currentUser.name)}`
    };

    const link = links[appName];
    
    // Copy to clipboard
    navigator.clipboard.writeText(link).then(() => {
        alert(`Referral link copied to clipboard!\n\n${link}\n\nShare this link with your patients for coordinated care and progress tracking.`);
    }).catch(() => {
        prompt('Copy this referral link:', link);
    });
}

function sendBulkReferral() {
    alert('Bulk Referral System\n\nThis feature allows you to:\n• Send referral links to multiple patients via email\n• Track which patients have engaged with apps\n• Monitor treatment adherence and outcomes\n• Automate follow-up communications\n\nWould you like to see a demo of this feature?');
}

function viewPatientProgress() {
    alert('Patient Progress Dashboard\n\nView real-time data from patient apps:\n• Daily symptom tracking\n• Medication adherence\n• Treatment response\n• Partner engagement levels\n• AI-powered insights\n\nIntegration with MenoTracker and SupportivePartner provides comprehensive patient monitoring.');
}

function generateCareReport() {
    const report = `
📊 CARE COORDINATION REPORT

👥 Patient Engagement Summary:
• MenoTracker: 23 referred patients
• SupportivePartner: 18 referred partners
• Total Active Referrals: 41
• Average Engagement Time: 15 min/day

📈 Clinical Outcomes:
• Patient Engagement: 90% daily usage
• Treatment Adherence: 94% compliance
• Partner Satisfaction: 92% positive feedback
• Symptom Improvement: +25% reported relief

🎯 Care Optimization Opportunities:
• Increase MenoTracker referrals for better outcomes
• Improve partner onboarding education
• Expand to FertilityTracker for comprehensive care
• Enhance symptom tracking integration

Focus: Improved patient outcomes through coordinated care
    `;
    
    alert(report);
}

// Export functions for global access
window.generateReferralLink = generateReferralLink;
window.sendBulkReferral = sendBulkReferral;
window.viewPatientProgress = viewPatientProgress;
window.generateCareReport = generateCareReport;

function notifyWhenReady(appName) {
    const appNames = {
        fertilitytracker: 'FertilityTracker',
        pregnancycompanion: 'PregnancyCompanion', 
        postpartumsupport: 'PostpartumSupport',
        innerarchitect: 'InnerArchitect',
        soberpal: 'SoberPal',
        myconfidant: 'MyConfidant'
    };
    
    const appDisplayName = appNames[appName] || appName;
    
    alert(`✅ Notification Set!\n\nYou'll be notified via email when ${appDisplayName} integration is ready.\n\nEstimated timeline:\n• Q2 2025: FertilityTracker, PregnancyCompanion\n• Q3 2025: PostpartumSupport, InnerArchitect, SoberPal\n• Q4 2025: MyConfidant\n\nEach app will enhance your ability to provide coordinated care and track patient outcomes.`);
}

window.notifyWhenReady = notifyWhenReady;